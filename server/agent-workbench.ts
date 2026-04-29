import type { Express, Request, Response, NextFunction } from "express";
import { spawn, execFile } from "child_process";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";

type AgentId = "codex" | "claude";
type AgentStatus = "stopped" | "starting" | "running" | "exited" | "error";

interface AgentSession {
  id: AgentId;
  label: string;
  command: string;
  args: string[];
  status: AgentStatus;
  startedAt: string | null;
  exitedAt: string | null;
  exitCode: number | null;
  output: string[];
  inputChars: number;
  outputChars: number;
  usageHints: string[];
  process?: ReturnType<typeof spawn>;
}

const MAX_OUTPUT_LINES = 1200;
const agentsDir = path.join(process.cwd(), ".agents");
const allowedAgentIds = new Set<AgentId>(["codex", "claude"]);
const allowedFiles = new Set(["TASK.md", "codex-notes.md", "claude-notes.md", "review-requests.md"]);

const events = new EventEmitter();
events.setMaxListeners(100);

const sessions: Record<AgentId, AgentSession> = {
  codex: {
    id: "codex",
    label: "Codex",
    command: "codex",
    args: [],
    status: "stopped",
    startedAt: null,
    exitedAt: null,
    exitCode: null,
    output: [],
    inputChars: 0,
    outputChars: 0,
    usageHints: [],
  },
  claude: {
    id: "claude",
    label: "Claude",
    command: "claude",
    args: [],
    status: "stopped",
    startedAt: null,
    exitedAt: null,
    exitCode: null,
    output: [],
    inputChars: 0,
    outputChars: 0,
    usageHints: [],
  },
};

function emit(type: string, payload: unknown) {
  events.emit("event", {
    type,
    payload,
    ts: new Date().toISOString(),
  });
}

function appendOutput(id: AgentId, chunk: string) {
  const session = sessions[id];
  const normalized = chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  session.outputChars += normalized.length;
  const lines = normalized.split("\n");
  for (const line of lines) {
    if (line.length === 0) continue;
    session.output.push(line);
    if (/\b(token|context|usage|cost|quota|limit|remaining)\b/i.test(line)) {
      session.usageHints.push(line.slice(0, 500));
      if (session.usageHints.length > 40) {
        session.usageHints.splice(0, session.usageHints.length - 40);
      }
    }
  }
  if (session.output.length > MAX_OUTPUT_LINES) {
    session.output.splice(0, session.output.length - MAX_OUTPUT_LINES);
  }
  emit("agent-output", { id, chunk });
}

function serializeSession(session: AgentSession) {
  const { process: _process, ...rest } = session;
  return rest;
}

function ensureAgentsDir() {
  fs.mkdirSync(agentsDir, { recursive: true });
  for (const file of allowedFiles) {
    const filePath = path.join(agentsDir, file);
    if (!fs.existsSync(filePath)) {
      const title = file === "TASK.md" ? "# Shared Agent Task\n\n" : `# ${file.replace(".md", "")}\n\n`;
      fs.writeFileSync(filePath, title, "utf8");
    }
  }
}

function parseAgentId(value: string): AgentId {
  if (!allowedAgentIds.has(value as AgentId)) {
    throw Object.assign(new Error("Unknown agent session"), { status: 400 });
  }
  return value as AgentId;
}

function getFilePath(file: string) {
  if (!allowedFiles.has(file)) {
    throw Object.assign(new Error("Unknown coordination file"), { status: 400 });
  }
  ensureAgentsDir();
  return path.join(agentsDir, file);
}

function runGit(args: string[]) {
  return new Promise<string>((resolve) => {
    execFile("git", args, { cwd: process.cwd(), maxBuffer: 1024 * 1024 * 4 }, (error, stdout, stderr) => {
      if (error) {
        resolve(stderr || error.message);
        return;
      }
      resolve(stdout);
    });
  });
}

function startSession(id: AgentId, command?: string, args?: string[]) {
  const session = sessions[id];
  if (session.process && session.status === "running") {
    return serializeSession(session);
  }

  const resolvedCommand = command?.trim() || (id === "codex" ? "codex" : "claude");
  const resolvedArgs = Array.isArray(args) ? args.filter((arg): arg is string => typeof arg === "string") : [];

  session.command = resolvedCommand;
  session.args = resolvedArgs;
  session.status = "starting";
  session.startedAt = new Date().toISOString();
  session.exitedAt = null;
  session.exitCode = null;
  session.output = [];
  session.inputChars = 0;
  session.outputChars = 0;
  session.usageHints = [];
  emit("agent-status", serializeSession(session));

  try {
    const child = spawn(resolvedCommand, resolvedArgs, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TERM: process.env.TERM || "xterm-256color",
        COLORTERM: process.env.COLORTERM || "truecolor",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    session.process = child;
    session.status = "running";
    emit("agent-status", serializeSession(session));

    child.stdout.on("data", (data) => appendOutput(id, data.toString()));
    child.stderr.on("data", (data) => appendOutput(id, data.toString()));
    child.on("error", (error) => {
      appendOutput(id, `[process error] ${error.message}`);
      session.status = "error";
      session.exitedAt = new Date().toISOString();
      emit("agent-status", serializeSession(session));
    });
    child.on("exit", (code) => {
      session.status = "exited";
      session.exitCode = code;
      session.exitedAt = new Date().toISOString();
      session.process = undefined;
      appendOutput(id, `[process exited with code ${code ?? "unknown"}]`);
      emit("agent-status", serializeSession(session));
    });
  } catch (error: any) {
    session.status = "error";
    session.exitedAt = new Date().toISOString();
    appendOutput(id, `[start failed] ${error.message}`);
    emit("agent-status", serializeSession(session));
  }

  return serializeSession(session);
}

function stopSession(id: AgentId) {
  const session = sessions[id];
  if (session.process) {
    session.process.kill("SIGTERM");
  }
  session.status = "stopped";
  session.process = undefined;
  session.exitedAt = new Date().toISOString();
  emit("agent-status", serializeSession(session));
  return serializeSession(session);
}

function sendInput(id: AgentId, text: string) {
  const session = sessions[id];
  if (!session.process || session.status !== "running") {
    throw Object.assign(new Error(`${session.label} is not running`), { status: 409 });
  }
  session.inputChars += text.length + (text.endsWith("\n") ? 0 : 1);
  session.process.stdin.write(text.endsWith("\n") ? text : `${text}\n`);
  emit("agent-input", { id, text });
  emit("agent-status", serializeSession(session));
}

export function registerAgentWorkbenchRoutes(
  app: Express,
  requireAdmin: (req: Request, res: Response, next: NextFunction) => void,
) {
  ensureAgentsDir();

  app.get("/api/admin/agent-workbench/state", requireAdmin, async (_req, res) => {
    res.json({
      sessions: Object.values(sessions).map(serializeSession),
      files: Array.from(allowedFiles),
      cwd: process.cwd(),
    });
  });

  app.get("/api/admin/agent-workbench/events", requireAdmin, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (event: unknown) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    send({ type: "connected", payload: Object.values(sessions).map(serializeSession), ts: new Date().toISOString() });
    events.on("event", send);
    req.on("close", () => {
      events.off("event", send);
    });
  });

  app.post("/api/admin/agent-workbench/sessions/:id/start", requireAdmin, (req, res, next) => {
    try {
      const id = parseAgentId(req.params.id);
      const { command, args } = req.body || {};
      res.json(startSession(id, command, args));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/agent-workbench/sessions/:id/stop", requireAdmin, (req, res, next) => {
    try {
      const id = parseAgentId(req.params.id);
      res.json(stopSession(id));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/agent-workbench/sessions/:id/input", requireAdmin, (req, res, next) => {
    try {
      const id = parseAgentId(req.params.id);
      const text = zString(req.body?.text, "text");
      sendInput(id, text);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/agent-workbench/broadcast", requireAdmin, (req, res, next) => {
    try {
      const text = zString(req.body?.text, "text");
      const targets = (Array.isArray(req.body?.targets) ? req.body.targets : ["codex", "claude"])
        .map((target: string) => parseAgentId(target));
      const sent: AgentId[] = [];
      for (const target of targets) {
        if (sessions[target].process && sessions[target].status === "running") {
          sendInput(target, text);
          sent.push(target);
        }
      }
      res.json({ ok: true, sent });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/agent-workbench/files/:file", requireAdmin, (req, res, next) => {
    try {
      const filePath = getFilePath(req.params.file);
      res.json({ file: req.params.file, content: fs.readFileSync(filePath, "utf8") });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/admin/agent-workbench/files/:file", requireAdmin, (req, res, next) => {
    try {
      const filePath = getFilePath(req.params.file);
      const content = zString(req.body?.content, "content");
      fs.writeFileSync(filePath, content, "utf8");
      emit("coordination-file", { file: req.params.file });
      res.json({ ok: true, file: req.params.file });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/agent-workbench/git/status", requireAdmin, async (_req, res) => {
    res.json({ output: await runGit(["status", "--short"]) });
  });

  app.get("/api/admin/agent-workbench/git/diff", requireAdmin, async (_req, res) => {
    res.json({ output: await runGit(["diff", "--stat"]) + "\n" + await runGit(["diff", "--"]) });
  });
}

function zString(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw Object.assign(new Error(`${field} must be a string`), { status: 400 });
  }
  return value;
}
