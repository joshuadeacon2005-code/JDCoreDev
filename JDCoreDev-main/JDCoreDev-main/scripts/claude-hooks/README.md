# Claude Code → JDCoreDev auto-logging

Sends a development log to jdcoredev.com at the end of each Claude Code session
(or after 30 minutes of inactivity). Logs land in the `maintenance_logs` table
exactly like manually-entered entries, so they count toward project hosting and
development budgets, and appear in both the Hosting and Development invoice
generators.

## What gets logged

For each session:

- Date + ISO timestamps (start, end)
- Active time in minutes (sum of inter-message gaps, capped at 5 min per gap)
- Estimated cost in cents (token usage × per-model Anthropic rates)
- Per-model token breakdown
- Tool usage counts (Edit, Write, Bash, Grep, …)
- Files edited (from transcript) + working-tree changes (from `git status`)
- Last assistant message text, OR a structured "session summary" if the agent
  wrote one (see "Agent-written summaries" below)

## Project routing

Each project gets a `.jdcd-project` file at its root:

```json
{
  "projectId": 7,
  "logType": "hosting"
}
```

The hook walks up from the working directory until it finds one. If none is
found, the log is skipped and a line is written to `~/.claude/dev-log-errors.log`.

`logType` is optional. If omitted, the server defaults to `"hosting"` for
projects whose status is `"hosting"`, and `"development"` otherwise.

## Install (Windows)

Prerequisites: Node.js, an admin session on jdcoredev.com.

1. Generate an API key (any random string), and set it as `JDCD_DEV_LOG_KEY`
   in the **server's** environment so the ingest endpoint will accept it.
2. From this directory:

   ```powershell
   .\install.ps1 -ApiKey "<the same key>"
   ```

   The installer:
   - Copies `lib.mjs`, `hook.mjs`, `watcher.mjs`, `link.mjs` to
     `%USERPROFILE%\.claude\hooks\jdcd\`
   - Sets user env vars: `JDCD_DEV_LOG_KEY`, `JDCD_DEV_LOG_ENDPOINT`,
     `JDCD_IDLE_MINUTES`
   - Patches `%USERPROFILE%\.claude\settings.json` to register Stop and
     SessionEnd hooks
   - Registers a scheduled task `JDCoreDev-DevLog-Watcher` that runs
     `watcher.mjs` every 2 minutes

3. In each project you want logged, run once:

   ```bash
   node "%USERPROFILE%\.claude\hooks\jdcd\link.mjs" <projectId>
   # optionally pin the logType:
   node "%USERPROFILE%\.claude\hooks\jdcd\link.mjs" <projectId> hosting
   ```

4. Verify connectivity:

   ```powershell
   Invoke-RestMethod -Method Get -Uri "https://jdcoredev.com/api/dev-logs/ping" `
     -Headers @{ "x-jdcd-key" = $env:JDCD_DEV_LOG_KEY }
   ```

## How it fires

| Event       | Action                                           |
|-------------|--------------------------------------------------|
| Stop        | Refresh a pending state file in `~/.claude/dev-log-pending/` |
| SessionEnd  | Flush immediately, delete state file             |
| Idle 30 min | Watcher flushes pending state, deletes it        |

## Agent-written summaries

If the agent ends its final message with a block like:

```
--- SESSION SUMMARY ---
Pushed 44 commits to origin/master including a security fix that removes a
hardcoded ENGINE_SECRET from the lead-engine API.

Files: server/routes.ts, client/src/pages/admin/lead-engine.tsx

Cost note: heavy Read usage to map invoice generators.
--- END SESSION SUMMARY ---
```

…the hook uses that block verbatim as the description prefix, followed by the
auto stats. This lets you drive the narrative on the log without losing the
mechanically-collected data underneath.

## Files

| File             | Role                                     |
|------------------|------------------------------------------|
| `lib.mjs`        | Shared helpers (pricing, parsing, flush) |
| `hook.mjs`       | Stop / SessionEnd entry point            |
| `watcher.mjs`    | Idle-flush watcher (run by Task Scheduler) |
| `link.mjs`       | Drops `.jdcd-project` in the cwd         |
| `install.ps1`    | Windows installer                        |

## Server side

- Endpoint: `POST /api/dev-logs/ingest` (auth: `x-jdcd-key` header)
- Handler: `server/dev-logs-ingest.ts`
- Admin view: `/admin/dev-logs`
- Storage: `maintenance_logs` table, `category = "claude-code-session"`

## Troubleshooting

- Logs not appearing → check `~/.claude/dev-log-errors.log`
- "no project config" → drop a `.jdcd-project` file via `link.mjs`
- 401 from server → key mismatch between client env and server env
- 503 from server → server hasn't loaded `JDCD_DEV_LOG_KEY` yet
