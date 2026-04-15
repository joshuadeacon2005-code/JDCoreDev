import { storage } from "../storage";
import { getUncachableResendClient, isResendConfigured } from "../email";
import type { ProjectProcessStep } from "@shared/schema";

type TaskWithProject = ProjectProcessStep & { projectName: string; clientName: string };

interface DigestSection {
  title: string;
  tasks: TaskWithProject[];
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case "high": return "#dc2626";
    case "medium": return "#f59e0b";
    case "low": return "#6b7280";
    default: return "#6b7280";
  }
}

function getPriorityLabel(priority: string): string {
  switch (priority) {
    case "high": return "HIGH";
    case "medium": return "MED";
    case "low": return "LOW";
    default: return priority.toUpperCase();
  }
}

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return "";
  const d = new Date(dueDate);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isDueApproaching(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const daysUntil = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return daysUntil <= 3;
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return d < now;
}

function renderTaskRow(task: TaskWithProject): string {
  const dueDateStr = formatDueDate(task.dueDate);
  const overdue = isOverdue(task.dueDate);
  const approaching = isDueApproaching(task.dueDate);
  const priorityColor = getPriorityColor(task.priority);
  const completionPct = task.completionPercentage || 0;

  let statusDot = "";
  if (task.status === "done") {
    statusDot = `<span style="color: #22c55e; font-size: 16px;">&#10003;</span>`;
  } else if (task.status === "in_progress") {
    statusDot = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#3b82f6;"></span>`;
  } else {
    statusDot = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#9ca3af;"></span>`;
  }

  let dueBadge = "";
  if (dueDateStr) {
    const dueColor = overdue ? "#dc2626" : approaching ? "#f59e0b" : "#6b7280";
    const dueLabel = overdue ? `Overdue: ${dueDateStr}` : `Due: ${dueDateStr}`;
    dueBadge = `<span style="font-size:11px;color:${dueColor};margin-left:8px;">${dueLabel}</span>`;
  }

  const progressBar = completionPct > 0 && completionPct < 100
    ? `<div style="margin-top:4px;background:#e5e7eb;border-radius:4px;height:4px;width:120px;">
         <div style="background:#008080;border-radius:4px;height:4px;width:${completionPct}%;"></div>
       </div>
       <span style="font-size:11px;color:#6b7280;">${completionPct}% complete</span>`
    : "";

  return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top;">
        ${statusDot}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <div style="font-weight:600;color:#111827;font-size:14px;">${task.title}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">${task.projectName}</div>
        ${progressBar}
        ${task.autoDetectedStatus ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;font-style:italic;">AI: ${task.autoDetectedStatus}</div>` : ""}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:center;vertical-align:top;">
        <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;color:white;background:${priorityColor};">${getPriorityLabel(task.priority)}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:right;vertical-align:top;">
        ${dueBadge}
      </td>
    </tr>
  `;
}

function renderSection(section: DigestSection): string {
  if (section.tasks.length === 0) return "";

  return `
    <div style="margin-bottom:24px;">
      <h3 style="color:#111827;font-size:16px;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid #e5e7eb;">${section.title} <span style="color:#6b7280;font-weight:normal;font-size:13px;">(${section.tasks.length})</span></h3>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>
          ${section.tasks.map(renderTaskRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

export async function buildDigestData(): Promise<{
  needsAttention: TaskWithProject[];
  inProgress: TaskWithProject[];
  recentlyCompleted: TaskWithProject[];
  onTrack: TaskWithProject[];
  totalTasks: number;
  completedCount: number;
}> {
  const activeTasks = await storage.getActiveTasksAcrossProjects();

  const projectIds = Array.from(new Set(activeTasks.map(t => t.projectId)));
  const allRecentDone: TaskWithProject[] = [];

  for (const pid of projectIds) {
    const steps = await storage.getProcessStepsByProject(pid);
    const doneRecently = steps.filter(
      s => s.status === "done" && s.lastAutoChecked &&
        new Date(s.lastAutoChecked).getTime() > Date.now() - 24 * 60 * 60 * 1000
    );
    const project = activeTasks.find(t => t.projectId === pid);
    if (project) {
      for (const step of doneRecently) {
        allRecentDone.push({
          ...step,
          projectName: project.projectName,
          clientName: project.clientName,
        });
      }
    }
  }

  const needsAttention = activeTasks.filter(
    t => t.status === "planned" && t.dueDate && isDueApproaching(t.dueDate)
  );

  const inProgress = activeTasks.filter(t => t.status === "in_progress");

  const onTrack = activeTasks.filter(
    t => t.status === "planned" && (!t.dueDate || !isDueApproaching(t.dueDate))
  );

  return {
    needsAttention,
    inProgress,
    recentlyCompleted: allRecentDone,
    onTrack,
    totalTasks: activeTasks.length + allRecentDone.length,
    completedCount: allRecentDone.length,
  };
}

export async function generateDigestHtml(): Promise<string> {
  const data = await buildDigestData();

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const sections: DigestSection[] = [
    { title: "Needs Your Attention", tasks: data.needsAttention },
    { title: "In Progress", tasks: data.inProgress },
    { title: "Recently Completed", tasks: data.recentlyCompleted },
    { title: "On Track", tasks: data.onTrack },
  ];

  const totalActive = data.totalTasks;
  const doneCount = data.completedCount;
  const inProgressCount = data.inProgress.length;
  const urgentCount = data.needsAttention.length;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 640px; margin: 0 auto; padding: 20px; background: #f9fafb;">
        <div style="background: linear-gradient(135deg, #008080 0%, #006666 100%); padding: 30px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Daily Task Digest</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0 0; font-size: 14px;">${today}</p>
        </div>

        <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
          <div style="display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 100px; text-align: center; padding: 12px; background: #f9fafb; border-radius: 8px;">
              <div style="font-size: 24px; font-weight: 700; color: #111827;">${totalActive}</div>
              <div style="font-size: 12px; color: #6b7280;">Total Tasks</div>
            </div>
            ${urgentCount > 0 ? `
            <div style="flex: 1; min-width: 100px; text-align: center; padding: 12px; background: #fef2f2; border-radius: 8px;">
              <div style="font-size: 24px; font-weight: 700; color: #dc2626;">${urgentCount}</div>
              <div style="font-size: 12px; color: #dc2626;">Needs Attention</div>
            </div>` : ""}
            <div style="flex: 1; min-width: 100px; text-align: center; padding: 12px; background: #eff6ff; border-radius: 8px;">
              <div style="font-size: 24px; font-weight: 700; color: #3b82f6;">${inProgressCount}</div>
              <div style="font-size: 12px; color: #3b82f6;">In Progress</div>
            </div>
            <div style="flex: 1; min-width: 100px; text-align: center; padding: 12px; background: #f0fdf4; border-radius: 8px;">
              <div style="font-size: 24px; font-weight: 700; color: #22c55e;">${doneCount}</div>
              <div style="font-size: 12px; color: #22c55e;">Done (24h)</div>
            </div>
          </div>

          ${sections.map(renderSection).join("")}

          ${totalActive === 0 && doneCount === 0 ? `
          <div style="text-align:center;padding:32px;color:#6b7280;">
            <p style="font-size:16px;">No active tasks across your projects.</p>
          </div>` : ""}
        </div>

        <div style="background: #f9fafb; padding: 16px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">Daily Task Digest from JD CoreDev</p>
        </div>
      </body>
    </html>
  `;
}

export async function generateAndSendDigest(adminEmail: string): Promise<{ success: boolean; error?: string }> {
  try {
    const resendAvailable = await isResendConfigured();
    if (!resendAvailable) {
      console.log("[TaskDigest] Resend not configured, skipping digest email");
      return { success: false, error: "Resend not configured" };
    }

    const html = await generateDigestHtml();
    const { client, fromEmail } = await getUncachableResendClient();

    const today = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    const result = await client.emails.send({
      from: fromEmail,
      to: adminEmail,
      subject: `Task Digest - ${today}`,
      html,
    });

    console.log(`[TaskDigest] Digest email sent to ${adminEmail}`);
    return { success: true };
  } catch (error: any) {
    console.error("[TaskDigest] Failed to send digest:", error.message);
    return { success: false, error: error.message };
  }
}
