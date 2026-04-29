# JDCoreDev Claude Handoff

When working in this repo alongside Codex or another agent, keep a short running note in `.agents/claude-notes.md`.

Update it when you:

- start a task
- make or plan file edits
- discover an important issue
- finish a task or stop midway

Use this format:

```markdown
## YYYY-MM-DD HH:mm

Task:
Files touched:
What changed:
Verification:
Open questions / risks:
```

Before editing, check `git status --short` and avoid overwriting unrelated user or agent changes. If you need Codex to review something, write a focused request in `.agents/review-requests.md`.

Shared coordination files:

- `.agents/TASK.md` - current shared objective
- `.agents/claude-notes.md` - Claude's running notes
- `.agents/codex-notes.md` - Codex's running notes
- `.agents/review-requests.md` - cross-agent review requests
