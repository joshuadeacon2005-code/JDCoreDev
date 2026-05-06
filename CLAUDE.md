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

<!-- GSD:project-start source:PROJECT.md -->
## Project

**JDCoreDev — Implementation Brief Workstreams 2 & 3**

JDCoreDev (`jdcoredev.com`) is a small-business AI consultancy site plus an interactive Claude Code trading-routine workspace. The marketing site sells AI-integrated systems to local businesses, sole traders, startups, tradespeople, and small e-commerce. The trading workspace is a set of Claude Code routines Josh runs interactively from the Claude app's Claude Code section — there is no scheduled cron, no deployed routine service.

This GSD project covers two of three implementation-brief workstreams: **W2** (two new service marketing pages) and **W3** (three new capabilities for the trading routines). W1 (global `context-mode` install) is already shipped — out of scope here.

**Core Value:** Ship the two new service offerings as production marketing pages without sliding scope (no forms, no DB, no audit tooling), and extend the trading routines with three discrete capabilities that compose with the existing Claude Code routine pattern — never as a parallel runtime.

### Constraints

- **Tech stack:** Vite + React + wouter + Tailwind on the frontend; Express + Drizzle + Postgres on the backend — already chosen, do not introduce alternatives without explicit discussion.
- **Visual:** New W2 pages must match `client/src/pages/services.tsx` style — NavBar tubelight + AnimatedContainer + sticky logo nav + bordered grid. Same footer.
- **Routing:** wouter `<Route path="...">`. CTAs use `<Link href="/contact">`. No hashtag links.
- **SEO:** Per-page meta via `useEffect` head-injection; no `react-helmet` or other library.
- **Sitemap:** Dynamic — edit `staticUrls` array around `server/routes.ts:435`. Not a static file.
- **Trading-routine pattern:** Camoufox and Fincept must MATCH the pattern documented in TRADE-00 (skill vs. MCP) — never introduce a parallel pattern.
- **Mode safety:** Trading defaults to Paper for any new code path. Live requires an explicit confirmation gate baked into the routine.
- **Workflow:** One PR per phase, no mega-PRs.
- **Cloudflare cache:** Surface manual purge as a follow-up after each W2 deploy — do not auto-purge.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
