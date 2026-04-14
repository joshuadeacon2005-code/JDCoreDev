import OpenAI from "openai";

function getOpenAIClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
  });
}

interface GeneratedTask {
  title: string;
  description: string;
  stepOrder: number;
  priority: "low" | "medium" | "high";
}

interface TaskCompletionResult {
  taskId: number;
  status: "planned" | "in_progress" | "done";
  completionPercentage: number;
  reasoning: string;
}

export async function generateTasksFromPRD(prdText: string): Promise<GeneratedTask[]> {
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a project planning assistant. Given a Product Requirements Document (PRD), extract actionable development tasks.

Return a JSON array of tasks. Each task must have:
- "title": short, actionable task title (max 80 chars)
- "description": detailed description of what needs to be done
- "stepOrder": integer starting from 1, in logical implementation order
- "priority": one of "low", "medium", or "high"

Guidelines:
- Break down the PRD into granular, implementable tasks
- Order tasks by dependency (foundational work first)
- Mark critical path items as "high" priority
- Mark nice-to-haves as "low" priority
- Most tasks should be "medium" priority
- Each task should be independently completable
- Include setup, implementation, and testing tasks where appropriate

Return ONLY valid JSON array, no markdown formatting or code blocks.`,
      },
      {
        role: "user",
        content: prdText,
      },
    ],
    max_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response");
  }

  const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("OpenAI returned invalid JSON — please try again");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("OpenAI response was not a task list — please try again");
  }

  return parsed.map((task: any, index: number) => ({
    title: String(task.title || "Untitled Task").slice(0, 200),
    description: String(task.description || ""),
    stepOrder: typeof task.stepOrder === "number" ? task.stepOrder : index + 1,
    priority: ["low", "medium", "high"].includes(task.priority) ? task.priority : "medium",
  }));
}

interface TaskForDetection {
  id: number;
  title: string;
  description: string | null;
  status: string;
  completionPercentage: number;
}

interface LogEntry {
  summary: string;
  details?: string | null;
  occurredAt?: Date | string | null;
}

export async function detectTaskCompletion(
  tasks: TaskForDetection[],
  logs: LogEntry[],
  historyEvents: LogEntry[]
): Promise<TaskCompletionResult[]> {
  try {
    if (tasks.length === 0 || (logs.length === 0 && historyEvents.length === 0)) {
      return [];
    }

    const taskList = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description || "",
      currentStatus: t.status,
      currentCompletion: t.completionPercentage,
    }));

    const logList = logs.map((l) => ({
      summary: l.summary,
      details: l.details || "",
      date: l.occurredAt ? String(l.occurredAt) : "",
    }));

    const historyList = historyEvents.map((h) => ({
      summary: h.summary,
      details: h.details || "",
      date: h.occurredAt ? String(h.occurredAt) : "",
    }));

    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a project status detection assistant. Given a list of project tasks and recent activity logs/history events, determine which tasks have been partially or fully completed based on the evidence in the logs.

For each task that has evidence of progress in the logs, return an object with:
- "taskId": the task's id
- "status": "planned" (no progress), "in_progress" (partial progress), or "done" (fully complete)
- "completionPercentage": 0-100 integer estimating how much is done
- "reasoning": brief explanation of why you assessed this status, referencing specific log entries

Guidelines:
- Only include tasks where you found evidence of progress in the logs
- Do NOT change tasks that are already "done" — skip them entirely
- Be conservative: only mark "done" if logs clearly indicate full completion
- Use "in_progress" with an appropriate percentage for partial work
- Match by semantic meaning, not just exact text matching
- If a log mentions fixing a bug in a feature, that feature's task may be partially complete

Return ONLY a valid JSON array, no markdown formatting or code blocks. Return an empty array [] if no tasks have evidence of progress.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            tasks: taskList,
            recentLogs: logList,
            recentHistory: historyList,
          }),
        },
      ],
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((r: any) => typeof r.taskId === "number")
      .map((r: any) => ({
        taskId: r.taskId,
        status: ["planned", "in_progress", "done"].includes(r.status) ? r.status : "in_progress",
        completionPercentage: Math.min(100, Math.max(0, parseInt(r.completionPercentage) || 0)),
        reasoning: String(r.reasoning || ""),
      }));
  } catch (error) {
    console.error("Error detecting task completion:", error);
    return [];
  }
}
