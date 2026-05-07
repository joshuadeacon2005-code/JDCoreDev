# WS3 Discovery — Slack Fix Agent Current State

> Master brief Workstream 3 — refactoring the proactive Slack scanner into an
> invoked-on-demand assistant. Discovery doc per the brief's standing principle:
> **"Do not start the refactor until that doc exists."**

## Finding: no Slack agent exists in this repo

A comprehensive search of `JDCoreDev/` found **zero Slack-specific scanning,
triage, or fix-agent code**:

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

## Likely possibilities

1. **The Slack scanner lives in a different repo.** Josh has multiple — the
   referenced agent may be in a Slack-bot-specific repo, a personal-tools
   repo, or hosted entirely on claude.ai/code as a one-off routine without
   any backing repo file.
2. **It was removed in a prior cleanup.** Earlier sessions retired several
   legacy modules (server/arbitrage.ts, server/crypto-arb.ts, the cron
   pipelines). A Slack scanner may have been deleted similarly without
   being explicitly mentioned.
3. **It was a planned-but-never-built routine.** The master brief describes
   it in past tense ("the existing scanning agent runs as a Claude routine"),
   but it's possible Josh planned it and never shipped it in this repo.

## Recommendation

**Block on user clarification before starting the refactor.** Specifically,
Josh should confirm one of:

- The Slack agent lives at: `<repo URL or claude.ai routine ID>` — refactor
  there, not in JDCoreDev.
- The agent was removed and the brief's WS3 is a *new build* request, not a
  refactor — should be re-scoped as such.
- The agent never existed and the brief was aspirational — drop WS3 entirely.

The brief's WS3 spec (invoked-on-demand, plan-then-approve flow, working
branches, blast-radius gate, reaction-based approval) is implementable as a
greenfield build, but the brief framed it as a refactor of existing code.
The two paths have different scopes and need different effort estimates.

## What was done in this discovery cycle

- Created working branch `ws3/slack-fix-agent-refactor` (no commits;
  effectively a stale marker — should be deleted).
- This document.
- Nothing else — refactor blocked per the master brief's standing principle.
