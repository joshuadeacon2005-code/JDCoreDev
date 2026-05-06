#!/usr/bin/env node
// Regenerate broken Claude-Code auto-log descriptions in maintenance_logs.
//
// The old hook fallback formatter produced summaries like:
//   **Summary**
//   Touched 1 file (1 edit): pm.ts.
//   **Files changed (1):** ...
//
// which contains no real intent. This script:
//   1. Pulls all category=claude-code-session entries from prod
//   2. Filters to ones that look like the old broken fallback (no Request:/Outcome:)
//   3. Locates the matching transcript under ~/.claude/projects/
//   4. Slices the transcript by createdAt boundaries (per-session, oldest first)
//   5. Re-runs the new buildDescription against each slice
//   6. PATCHes the log if the result is meaningfully different
//
// Auth: needs JDCD_DEV_LOG_KEY in env (same key the hook uses).
// Endpoint base: JDCD_DEV_LOG_ENDPOINT (default https://jdcoredev.com/api/dev-logs).
//
// Usage:
//   node scripts/regenerate-dev-logs.mjs --dry-run   # print plan, don't PATCH
//   node scripts/regenerate-dev-logs.mjs             # apply for real

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

// Dynamic import — the hook lib lives outside the repo at ~/.claude/hooks/jdcd/lib.mjs.
const hookLibPath = path.join(os.homedir(), ".claude", "hooks", "jdcd", "lib.mjs");
const { readTranscript, summarizeTranscript, buildDescription, looksLikeSecret } =
  await import(pathToFileURL(hookLibPath).href);

// ── Config ────────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");
// --rebuild reprocesses every claude-code-session log, not just ones in the
// old broken shape. Used to retroactively re-tighten the secret filter — an
// already-fixed entry still gets re-built and re-PATCHed if its current
// description contains a credential.
const REBUILD = process.argv.includes("--rebuild");
const INGEST_BASE =
  process.env.JDCD_DEV_LOG_INGEST_BASE
  || (process.env.JDCD_DEV_LOG_ENDPOINT
      ? process.env.JDCD_DEV_LOG_ENDPOINT.replace(/\/ingest$/, "")
      : "https://jdcoredev.com/api/dev-logs");
const KEY = process.env.JDCD_DEV_LOG_KEY;
if (!KEY) {
  console.error("JDCD_DEV_LOG_KEY env var not set. Aborting.");
  process.exit(1);
}

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

// ── Helpers ───────────────────────────────────────────────────────────────────
async function api(method, urlPath, body) {
  const res = await fetch(`${INGEST_BASE}${urlPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-jdcd-key": KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${urlPath} → ${res.status}: ${text}`);
  }
  return res.json();
}

// Pull the 8-character session prefix out of the description footer line:
//   *Session 0097c720 · 5 min active · ...
const SESSION_PREFIX_RE = /\*Session\s+([a-f0-9]{8})/i;
function extractSessionPrefix(desc) {
  const m = desc?.match(SESSION_PREFIX_RE);
  return m ? m[1] : null;
}

// Detect entries produced by the OLD fallback (no Request:/Outcome:, no
// agent-written SESSION SUMMARY block). These are the ones worth fixing.
//
// Heuristic: the entry's Summary section starts with "Touched N file" and the
// description never uses "Request:" or "Outcome:" prefixes. Agent-written
// SESSION SUMMARY blocks produce arbitrary prose so they fail this test.
function looksBroken(desc) {
  if (!desc) return false;
  const summaryHeader = "**Summary**";
  const i = desc.indexOf(summaryHeader);
  if (i < 0) return false;
  // Cut at the next "**Files changed" or "---" footer so we only inspect
  // the Summary body itself, not the file list or footer.
  const after = desc.slice(i + summaryHeader.length).trimStart();
  const cutAt = (() => {
    const a = after.indexOf("\n**Files changed");
    const b = after.indexOf("\n---");
    const candidates = [a, b].filter(n => n >= 0);
    return candidates.length ? Math.min(...candidates) : after.length;
  })();
  const summaryBody = after.slice(0, cutAt).trim();

  // First non-empty line of the summary body.
  const firstLine = summaryBody.split(/\n/, 1)[0].trim();
  if (!/^Touched \d+ files?/i.test(firstLine)) return false;
  // If the entry already has the new shape (Request: or Outcome: prefix), skip.
  if (/(^|\n)Request:\s/.test(summaryBody)) return false;
  if (/(^|\n)Outcome:\s/.test(summaryBody)) return false;
  return true;
}

// Walk ~/.claude/projects/* looking for <sessionPrefix>*.jsonl files. Returns
// the absolute path to the largest matching transcript (or null).
function findTranscript(sessionPrefix) {
  if (!fs.existsSync(PROJECTS_DIR)) return null;
  const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(PROJECTS_DIR, d.name));
  let best = null;
  for (const dir of dirs) {
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch { continue; }
    for (const f of entries) {
      if (!f.endsWith(".jsonl")) continue;
      if (!f.startsWith(sessionPrefix)) continue;
      const full = path.join(dir, f);
      let size = 0;
      try { size = fs.statSync(full).size; } catch { continue; }
      if (!best || size > best.size) {
        best = { path: full, size, dir };
      }
    }
  }
  return best;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Regenerate dev-logs · base=${INGEST_BASE} · ${DRY_RUN ? "DRY RUN" : "APPLY"}`);

  const { logs } = await api("GET", "/sessions");
  console.log(`Fetched ${logs.length} claude-code-session log rows`);

  // Pre-filter to candidates. By default: broken-shape entries only.
  // --rebuild: every claude-code-session entry is a candidate (idempotent —
  // re-emitting the same description short-circuits via the unchanged guard).
  const broken = REBUILD
    ? logs.slice()
    : logs.filter(l => looksBroken(l.description));
  console.log(REBUILD
    ? `${broken.length} entries will be reprocessed (--rebuild)`
    : `${broken.length} look like the old broken fallback shape`);

  const bySession = new Map();
  let unknownSession = 0;
  for (const log of broken) {
    const sid = extractSessionPrefix(log.description);
    if (!sid) { unknownSession++; continue; }
    if (!bySession.has(sid)) bySession.set(sid, []);
    bySession.get(sid).push(log);
  }
  if (unknownSession) console.log(`(${unknownSession} broken entries had no session prefix in footer — skipped)`);

  let patched = 0, missingTranscript = 0, unchanged = 0, errors = 0, secretBlocked = 0;

  for (const [sid, sessionLogs] of bySession) {
    sessionLogs.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const transcript = findTranscript(sid);
    if (!transcript) {
      missingTranscript += sessionLogs.length;
      if (VERBOSE) console.log(`  · ${sid}: no transcript found, skipping ${sessionLogs.length} entr${sessionLogs.length === 1 ? "y" : "ies"}`);
      continue;
    }

    let events;
    try {
      events = readTranscript(transcript.path);
    } catch (e) {
      errors += sessionLogs.length;
      console.log(`  ! ${sid}: failed to read ${transcript.path}: ${e.message}`);
      continue;
    }

    // Walk per-slice: each log's slice is (prevLog.createdAt, thisLog.createdAt + buffer].
    // The watcher posts the log within ~seconds of the flush, so createdAt is a
    // close-enough proxy for the slice's endTs.
    let prevEndMs = 0;
    for (const log of sessionLogs) {
      const endMs = Date.parse(log.createdAt) + 60_000; // 60s buffer for HTTP
      const sliceEvents = events.filter(ev => {
        if (!ev.timestamp) return false;
        const ts = Date.parse(ev.timestamp);
        return ts > prevEndMs && ts <= endMs;
      });
      const summary = sliceEvents.length
        ? summarizeTranscript(sliceEvents)
        : summarizeTranscript(events); // fallback: full transcript if slice empty

      const newDesc = buildDescription({
        summary,
        sessionId: sid,
        cwd: transcript.dir, // approximate — used only for path display
      });

      // Final guard: if anything in the regenerated description still looks
      // like a credential, skip — never persist secret-shaped output to the DB.
      if (looksLikeSecret(newDesc)) {
        secretBlocked++;
        if (VERBOSE) console.log(`  · log ${log.id}: secret-shaped content detected, skipped`);
        prevEndMs = endMs;
        continue;
      }

      // Re-derive minutesSpent from the same slice using the active-time
      // computation in summarizeTranscript. The DB column was set by the
      // hook with the OLD GAP_CAP_MS=5min cap; this lets us roll back the
      // inflation. Fall back to 1-minute floor for slices with any activity.
      const newMinutes = summary.activeMs > 0
        ? Math.max(1, Math.round(summary.activeMs / 60000))
        : log.minutesSpent;

      // Skip if regenerated description AND minutes are identical (idempotent).
      const descUnchanged = newDesc.trim() === log.description.trim();
      const minutesUnchanged = newMinutes === log.minutesSpent;
      if (descUnchanged && minutesUnchanged) {
        unchanged++;
        prevEndMs = endMs;
        continue;
      }

      if (DRY_RUN) {
        console.log(`\n── log ${log.id} (project ${log.projectId}, ${log.minutesSpent}m → ${newMinutes}m) ──`);
        console.log("BEFORE:");
        console.log(log.description.split("\n").slice(0, 6).map(l => "  " + l).join("\n"));
        console.log("AFTER:");
        console.log(newDesc.split("\n").slice(0, 8).map(l => "  " + l).join("\n"));
      } else {
        try {
          const body = {};
          if (!descUnchanged) body.description = newDesc;
          if (!minutesUnchanged) body.minutesSpent = newMinutes;
          await api("PATCH", `/${log.id}`, body);
          patched++;
          if (VERBOSE) console.log(`  ✓ ${sid} log ${log.id}: patched (${log.minutesSpent}m → ${newMinutes}m)`);
        } catch (e) {
          errors++;
          console.log(`  ! log ${log.id}: ${e.message}`);
        }
      }

      prevEndMs = endMs;
    }
  }

  console.log("");
  console.log("Summary:");
  console.log(`  candidates checked   : ${broken.length}`);
  console.log(`  patched              : ${DRY_RUN ? "(dry run)" : patched}`);
  console.log(`  unchanged            : ${unchanged}`);
  console.log(`  missing transcripts  : ${missingTranscript}`);
  console.log(`  secret-blocked       : ${secretBlocked}`);
  console.log(`  errors               : ${errors}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
