# JDCoreDev Agent Handoff

When coordinating with Claude Code or another agent, use `.agents/` as the shared workspace memory.

Read these files when relevant:

- `.agents/TASK.md`
- `.agents/claude-notes.md`
- `.agents/codex-notes.md`
- `.agents/review-requests.md`

Keep notes short and factual. Do not copy secrets from `.env`, `.claude/settings.local.json`, database URLs, or provider tokens into these files.

Before editing, run `git status --short` and preserve unrelated changes.
