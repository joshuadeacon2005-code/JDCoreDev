# WS3 Discovery — Slack Fix Agent Current State

> Master brief Workstream 3 — refactoring the proactive Slack scanner into an
> invoked-on-demand assistant. Discovery doc per the brief's standing principle:
> **"Do not start the refactor until that doc exists."**

## Finding: Slack agent lives in a separate repo

**Located at: [`joshuadeacon2005-code/supervised-agent`](https://github.com/joshuadeacon2005-code/supervised-agent)** (last updated 2026-05-02).

Its `README.md` confirms it's the agent the brief refers to:
- Watches Slack for client/software issue messages
- Maps each message to a target GitHub repo via `config/projects.yaml`
- Runs `claude -p ... --output-format stream-json` as a subprocess (subscription auth by default)
- Strict policy engine decides auto-fix vs escalate
- Auto-fix path: branch → edits → tests → PR. **Never pushes to main.**
- Escalate path: posts a Slack approval card with the proposed prompt
- 19:00 Asia/Singapore Mon-Fri Slack digest of the day's activity
- **Dry-run by default**; auto-fix and auto-merge each require their own env flag

The WS3 refactor happens in that repo, not here. JDCoreDev only hosts this
discovery breadcrumb so the trail isn't lost.

A comprehensive search of `JDCoreDev/` found **zero Slack-specific scanning,
triage, or fix-agent code** — confirming the agent is exclusively in
`supervised-agent`:

- `server/*.ts` — 30+ agent files (`expenses-agent`, `lead-engine-agent`,
  `predictor-agent`, `trader-agent`, `scrape-agent`). **No Slack references.**
- `.claude/skills/` — `autohedge-*`, `camoufox-fetch`. No Slack-related skills.
- `docs/` — 8 routine prompt + architecture docs. Only one passing mention
  of Slack, in `ROUTINE_PROMPT_LEAD_ENGINE.md`, where it says outreach
  "via Slack/Gmail/DM happens later, manually" — i.e. notifications, not a
  scanner.
- `scripts/` — empty.
- Env vars: zero matches for `CLAUDE_ROUTINE_SLACK*`. The only `SLACK_WEBHOOK_URL`
  references are general trader/predictor notification webhooks.
- Git history: zero commits with "slack" in the subject.
- Anthropic-hosted routines: only `CLAUDE_ROUTINE_TRADER_*`, `CLAUDE_ROUTINE_PREDICTOR_*`,
  `CLAUDE_ROUTINE_LEAD_ENGINE_*`, `CLAUDE_ROUTINE_EXPENSES_*` exist as
  configured RemoteTriggers.

## WS3 mapping against `supervised-agent`'s current state

| Brief change | Status in `supervised-agent` today | Action needed |
|---|---|---|
| C1: Trigger scheduled → invoked | Currently scheduled (Slack scan + 19:00 digest) | Add Slack `@mention` / `/fix` / DM trigger; remove scheduled scan |
| C2: Context from invoked conversation only | Currently scans Slack inbox broadly, mapped via `config/projects.yaml` | Replace with "read recent N messages + attachments in invocation thread" |
| C3: Plan-then-approve in chat | Escalate path already posts an approval card | Make it the only path; include blast-radius rating; gate on explicit go |
| C4: Execute on working branch via Claude Code | Already does this (branch → claude subprocess → tests → PR) | Reuse as-is — do not introduce a parallel pattern |
| C5: Approval gate before push | Already enforced by PR (never pushes to main) | Add reaction-based approval (`✅`/`❌`) on the diff summary; document timeout |
| C6: Strip triage/priority logic | Strict policy engine decides auto-fix vs escalate | Delete the policy engine and its config; invocation is the priority signal |
| C7: Decommission proactive scanner | Cron entries + last-scanned persistence + 19:00 digest | Disable scheduled triggers; clean up scan-history persistence |

Everything WS3 needs is already wired (Slack auth, repo mapping, Claude Code
subprocess pattern, branch/PR flow, approval cards). The refactor is mostly
*subtractive* — strip the proactive scan + triage paths and route everything
through the invocation handler.

## Stale artifact in this repo

- Working branch `ws3/slack-fix-agent-refactor` was created here with no commits.
  It's effectively a stale marker — delete on next branch cleanup.
