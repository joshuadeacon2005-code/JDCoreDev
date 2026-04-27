#!/usr/bin/env node
// Idle-flush watcher. Run on a schedule (Windows Task Scheduler, every 1-2 min).
// Scans pending session state files. If a session's last Stop was more than
// IDLE_MINUTES ago, flush it to jdcoredev.com and remove the state file.

import { listAllStates, deleteState, buildAndFlush, logLocalError } from "./lib.mjs";

const IDLE_MINUTES = parseInt(process.env.JDCD_IDLE_MINUTES || "30", 10);

async function main() {
  const cutoff = Date.now() - IDLE_MINUTES * 60 * 1000;
  const states = listAllStates();
  for (const s of states) {
    if (typeof s.lastStopAt !== "number") continue;
    if (s.lastStopAt > cutoff) continue; // still active
    try {
      const result = await buildAndFlush(s);
      if (result && result.skipped) {
        logLocalError(`watcher ${s.sessionId}: skipped (${result.skipped})`);
      }
    } catch (e) {
      logLocalError(`watcher ${s.sessionId}: ${e.message}`);
    } finally {
      deleteState(s.sessionId);
    }
  }
}

main().catch(e => {
  logLocalError(`watcher fatal: ${e.message}`);
  process.exit(0);
});
