// Claude Code → jdcoredev.com auto-logging — shared helpers.
// Imported by hook.mjs and watcher.mjs.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

// ── Pricing (USD per million tokens). Verify against current Anthropic pricing. ─
// Cache writes are 1.25× input rate; cache reads are 0.10× input rate.
export const PRICING = {
  "claude-opus-4-7":          { in:  15.00, out:  75.00 },
  "claude-opus-4-7[1m]":      { in:  15.00, out:  75.00 },
  "claude-opus-4-6":          { in:  15.00, out:  75.00 },
  "claude-sonnet-4-6":        { in:   3.00, out:  15.00 },
  "claude-sonnet-4-5":        { in:   3.00, out:  15.00 },
  "claude-haiku-4-5":         { in:   1.00, out:   5.00 },
  "claude-haiku-4-5-20251001":{ in:   1.00, out:   5.00 },
};
const FALLBACK = { in: 3.00, out: 15.00 };

export function pricingFor(model) {
  if (!model) return FALLBACK;
  if (PRICING[model]) return PRICING[model];
  // Fuzzy match: pick the most specific prefix that matches.
  const matches = Object.keys(PRICING).filter(k => model.startsWith(k));
  if (matches.length) {
    const best = matches.sort((a, b) => b.length - a.length)[0];
    return PRICING[best];
  }
  if (model.includes("haiku")) return PRICING["claude-haiku-4-5"];
  if (model.includes("opus"))  return PRICING["claude-opus-4-7"];
  if (model.includes("sonnet")) return PRICING["claude-sonnet-4-6"];
  return FALLBACK;
}

// Compute cost in USD cents for a given usage record + model.
export function costCentsFor(model, usage) {
  if (!usage) return 0;
  const p = pricingFor(model);
  const inTok    = (usage.input_tokens ?? 0);
  const outTok   = (usage.output_tokens ?? 0);
  const cacheW   = (usage.cache_creation_input_tokens ?? 0);
  const cacheR   = (usage.cache_read_input_tokens ?? 0);
  const usd =
    (inTok    * p.in  / 1_000_000) +
    (outTok   * p.out / 1_000_000) +
    (cacheW   * p.in  * 1.25 / 1_000_000) +
    (cacheR   * p.in  * 0.10 / 1_000_000);
  return Math.round(usd * 100);
}

// ── Project routing ────────────────────────────────────────────────────────────
// Walk up from `startDir` looking for a `.jdcd-project` JSON file.
// Returns parsed contents or null. The file format is:
//   { "projectId": 7, "logType": "hosting"|"development" (optional) }
export function findProjectConfig(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, ".jdcd-project");
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, "utf8");
        const cfg = JSON.parse(raw);
        if (typeof cfg.projectId === "number") {
          return { ...cfg, configPath: candidate };
        }
      } catch (e) {
        return null;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// ── Transcript parsing ─────────────────────────────────────────────────────────
// Read a Claude Code transcript JSONL file. Each line is an event; assistant
// messages contain `message.usage` and `message.model`.
export function readTranscript(transcriptPath) {
  const text = fs.readFileSync(transcriptPath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch (e) {
      // Skip malformed line.
    }
  }
  return events;
}

// Aggregate usage and metadata from the transcript.
export function summarizeTranscript(events) {
  const byModel = new Map();
  let totalCostCents = 0;
  let firstTs = null;
  let lastTs = null;
  let lastAssistantText = "";
  const toolCounts = new Map();
  const filesTouched = new Set();

  // Active time = sum of consecutive timestamp gaps, each capped at 5 min.
  const GAP_CAP_MS = 5 * 60 * 1000;
  let activeMs = 0;
  let prevTs = null;

  for (const ev of events) {
    const ts = ev.timestamp ? Date.parse(ev.timestamp) : null;
    if (ts) {
      if (firstTs === null) firstTs = ts;
      lastTs = ts;
      if (prevTs !== null) {
        activeMs += Math.min(ts - prevTs, GAP_CAP_MS);
      }
      prevTs = ts;
    }

    // Assistant messages — usage + model + last text.
    if (ev.type === "assistant" && ev.message) {
      const m = ev.message;
      const model = m.model || "unknown";
      const u = m.usage || {};
      const entry = byModel.get(model) || { turns: 0, in: 0, out: 0, cacheW: 0, cacheR: 0, costCents: 0 };
      entry.turns += 1;
      entry.in  += (u.input_tokens ?? 0);
      entry.out += (u.output_tokens ?? 0);
      entry.cacheW += (u.cache_creation_input_tokens ?? 0);
      entry.cacheR += (u.cache_read_input_tokens ?? 0);
      const c = costCentsFor(model, u);
      entry.costCents += c;
      totalCostCents += c;
      byModel.set(model, entry);

      // Pull last text content for description.
      if (Array.isArray(m.content)) {
        for (const block of m.content) {
          if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
            lastAssistantText = block.text;
          }
          if (block.type === "tool_use") {
            const name = block.name || "tool";
            toolCounts.set(name, (toolCounts.get(name) || 0) + 1);
            const inp = block.input || {};
            // Track files touched by file-mutating tools.
            if (["Edit", "Write", "NotebookEdit"].includes(name) && typeof inp.file_path === "string") {
              filesTouched.add(inp.file_path);
            }
          }
        }
      }
    }
  }

  return {
    byModel,
    totalCostCents,
    activeMs,
    firstTs,
    lastTs,
    lastAssistantText: lastAssistantText.trim(),
    toolCounts,
    filesTouched: Array.from(filesTouched),
  };
}

// ── Git helpers ────────────────────────────────────────────────────────────────
export async function gitChangedFiles(cwd) {
  try {
    const { stdout } = await execFileP("git", ["status", "--porcelain"], { cwd, timeout: 5000 });
    return stdout.split(/\r?\n/).filter(Boolean).map(line => ({
      status: line.slice(0, 2).trim(),
      path:   line.slice(3),
    }));
  } catch (e) {
    return [];
  }
}

// ── State files (pending / completed flush markers) ────────────────────────────
const STATE_DIR = path.join(os.homedir(), ".claude", "dev-log-pending");

export function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

export function statePath(sessionId) {
  return path.join(STATE_DIR, `${sessionId}.json`);
}

export function writeState(state) {
  ensureStateDir();
  fs.writeFileSync(statePath(state.sessionId), JSON.stringify(state, null, 2));
}

export function readState(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(statePath(sessionId), "utf8"));
  } catch (e) { return null; }
}

export function deleteState(sessionId) {
  try { fs.unlinkSync(statePath(sessionId)); } catch (e) {}
}

export function listAllStates() {
  ensureStateDir();
  const out = [];
  for (const f of fs.readdirSync(STATE_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const s = JSON.parse(fs.readFileSync(path.join(STATE_DIR, f), "utf8"));
      out.push(s);
    } catch (e) {}
  }
  return out;
}

// ── Description builder ───────────────────────────────────────────────────────
// Look for a "session summary" block the agent may have written into its last
// message, formatted as:
//
//   --- SESSION SUMMARY ---
//   ...freeform text...
//   --- END SESSION SUMMARY ---
//
// If found, use that verbatim as the description prefix (followed by auto stats).
// Otherwise just use the auto stats + truncated last assistant message.
const SUMMARY_RE = /---\s*SESSION SUMMARY\s*---([\s\S]*?)---\s*END SESSION SUMMARY\s*---/i;

function fmtMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function fmtCents(c) { return `$${(c / 100).toFixed(2)}`; }

function fmtNumber(n) { return n.toLocaleString("en-US"); }

export function buildDescription({ summary, gitChanges, sessionId, cwd }) {
  const lines = [];

  // 1. Agent-written session summary, if present.
  const m = summary.lastAssistantText.match(SUMMARY_RE);
  if (m) {
    lines.push(m[1].trim());
    lines.push("");
  }

  // 2. Auto stats.
  lines.push("**Claude Code session (auto-logged)**");
  lines.push("");
  lines.push(`- Session: \`${sessionId}\``);
  if (cwd) lines.push(`- Working dir: \`${cwd}\``);
  if (summary.firstTs && summary.lastTs) {
    lines.push(`- Started: ${new Date(summary.firstTs).toISOString().replace(/\..+$/, "Z")}`);
    lines.push(`- Ended:   ${new Date(summary.lastTs).toISOString().replace(/\..+$/, "Z")}`);
    lines.push(`- Active:  ${fmtMinutes(Math.max(1, Math.round(summary.activeMs / 60000)))}`);
  }
  lines.push(`- Cost:    ${fmtCents(summary.totalCostCents)}`);

  // 3. Per-model breakdown.
  if (summary.byModel.size > 0) {
    lines.push("");
    lines.push("**Models:**");
    for (const [model, e] of summary.byModel.entries()) {
      const tokSummary = `in ${fmtNumber(e.in)}, out ${fmtNumber(e.out)}` +
        (e.cacheR ? `, cache-read ${fmtNumber(e.cacheR)}` : "") +
        (e.cacheW ? `, cache-write ${fmtNumber(e.cacheW)}` : "");
      lines.push(`- ${model} — ${e.turns} turn${e.turns === 1 ? "" : "s"}, ${tokSummary}, ${fmtCents(e.costCents)}`);
    }
  }

  // 4. Tool usage.
  if (summary.toolCounts.size > 0) {
    const tools = Array.from(summary.toolCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => `${name} (${n})`)
      .join(", ");
    lines.push("");
    lines.push(`**Tools:** ${tools}`);
  }

  // 5. Files touched (transcript-derived) + git changes.
  if (summary.filesTouched.length > 0) {
    lines.push("");
    lines.push(`**Files edited (${summary.filesTouched.length}):**`);
    for (const f of summary.filesTouched.slice(0, 30)) {
      lines.push(`- ${f}`);
    }
    if (summary.filesTouched.length > 30) {
      lines.push(`- …and ${summary.filesTouched.length - 30} more`);
    }
  }
  if (gitChanges.length > 0) {
    lines.push("");
    lines.push(`**Working-tree changes at session end (${gitChanges.length}):**`);
    for (const c of gitChanges.slice(0, 30)) {
      lines.push(`- [${c.status}] ${c.path}`);
    }
    if (gitChanges.length > 30) {
      lines.push(`- …and ${gitChanges.length - 30} more`);
    }
  }

  // 6. Last assistant message text (truncated, if no summary block was found).
  if (!m && summary.lastAssistantText) {
    lines.push("");
    lines.push("**Last message:**");
    const truncated = summary.lastAssistantText.length > 800
      ? summary.lastAssistantText.slice(0, 800) + "…"
      : summary.lastAssistantText;
    lines.push(truncated);
  }

  return lines.join("\n");
}

// ── HTTP flush ─────────────────────────────────────────────────────────────────
export async function postLog(payload) {
  const endpoint = process.env.JDCD_DEV_LOG_ENDPOINT
    || "https://jdcoredev.com/api/dev-logs/ingest";
  const key = process.env.JDCD_DEV_LOG_KEY;
  if (!key) {
    throw new Error("JDCD_DEV_LOG_KEY env var not set");
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-jdcd-key": key,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${endpoint} → ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Local error log ────────────────────────────────────────────────────────────
const ERROR_LOG = path.join(os.homedir(), ".claude", "dev-log-errors.log");
export function logLocalError(msg) {
  try {
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {}
}

// ── End-to-end: build payload from a state file + transcript ──────────────────
export async function buildAndFlush(state) {
  const events = readTranscript(state.transcriptPath);
  if (events.length === 0) return { skipped: "empty transcript" };

  const summary = summarizeTranscript(events);
  if (!summary.firstTs) return { skipped: "no timestamps in transcript" };

  const projectCfg = findProjectConfig(state.cwd);
  if (!projectCfg) {
    logLocalError(`No .jdcd-project found walking up from ${state.cwd} (session ${state.sessionId})`);
    return { skipped: "no project config" };
  }

  const gitChanges = await gitChangedFiles(state.cwd);
  const description = buildDescription({
    summary, gitChanges, sessionId: state.sessionId, cwd: state.cwd,
  });

  const payload = {
    projectId: projectCfg.projectId,
    logType: projectCfg.logType,
    sessionId: state.sessionId,
    startedAt: new Date(summary.firstTs).toISOString(),
    endedAt:   new Date(summary.lastTs).toISOString(),
    minutesSpent: Math.max(1, Math.round(summary.activeMs / 60000)),
    estimatedCostCents: summary.totalCostCents,
    description,
    category: "claude-code-session",
  };

  return await postLog(payload);
}
