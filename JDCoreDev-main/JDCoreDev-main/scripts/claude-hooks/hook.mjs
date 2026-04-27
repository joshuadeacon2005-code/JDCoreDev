#!/usr/bin/env node
// Claude Code hook entry point.
//
// Called by Claude Code on Stop and SessionEnd events. Receives a JSON
// payload on stdin with { session_id, transcript_path, cwd, hook_event_name, ... }.
//
// Behaviour:
//   Stop       → write a pending state file. Watcher will flush it after idle.
//   SessionEnd → flush immediately and clear the state file.
//
// Always exits 0 — hook failures must never block Claude Code.

import {
  writeState, readState, deleteState, buildAndFlush, logLocalError,
} from "./lib.mjs";

async function main() {
  let stdin = "";
  for await (const chunk of process.stdin) stdin += chunk;
  if (!stdin.trim()) {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(stdin);
  } catch (e) {
    logLocalError(`hook: failed to parse stdin JSON: ${e.message}`);
    return;
  }

  const sessionId = payload.session_id;
  const transcriptPath = payload.transcript_path;
  const cwd = payload.cwd || process.cwd();
  const event = payload.hook_event_name || "Unknown";
  if (!sessionId || !transcriptPath) {
    return;
  }

  if (event === "Stop") {
    // Refresh the pending state — overwrite the timestamp every Stop.
    writeState({
      sessionId,
      transcriptPath,
      cwd,
      lastStopAt: Date.now(),
      createdAt: readState(sessionId)?.createdAt ?? Date.now(),
    });
    return;
  }

  if (event === "SessionEnd") {
    try {
      const state = readState(sessionId) || {
        sessionId, transcriptPath, cwd,
        lastStopAt: Date.now(), createdAt: Date.now(),
      };
      const result = await buildAndFlush(state);
      if (result && result.skipped) {
        logLocalError(`SessionEnd ${sessionId}: skipped (${result.skipped})`);
      }
    } catch (e) {
      logLocalError(`SessionEnd ${sessionId}: ${e.message}`);
    } finally {
      deleteState(sessionId);
    }
    return;
  }
}

main().catch(e => {
  logLocalError(`hook fatal: ${e.message}`);
  process.exit(0);
});
