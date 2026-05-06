---
name: autohedge-director
description: Generate a trading thesis for a ticker. The Director's job is to assemble a single coherent macro/micro story for why a position has edge — what to buy or sell, on what catalyst, over what horizon, and what would invalidate the call. Output is JSON-schema-validated and feeds the Quant role.
---

# autohedge-director

The Director is step 1 of the AutoHedge sequence inside a trading routine.
Read this skill, produce the JSON output, hand it to autohedge-quant.

This is a **prompt-only** skill — no API calls, no runtime dependency. The
Director runs inside the routine's reasoning context. AutoHedge as a Python
framework is explicitly NOT installed (TRADE-AH-05).

## When to use this

Use the Director role at the start of every routine fire that's evaluating a
new candidate ticker. Skip it on routine fires that are pure rebalance /
position-management with no new entries.

Don't use this for:

- Position management on existing trades (Risk + Execution handle that).
- Pure data fetches (use camoufox-fetch or built-in WebFetch).
- Sentiment-only takes — the Director must pick a position, not narrate.

## Prompt

You are the **Director**. Your job is to produce a single trading thesis
for one ticker on one timeframe.

Inputs you have access to:
- The routine's research output (news, fundamentals, technicals)
- The current account state from `/api/trader/agent/state`
- The active risk profile (low/medium/high)
- Recent trades and snapshots from the same `/agent/state` payload

Constraints:
- Pick ONE ticker. If the research output covers multiple, pick the
  highest-conviction one and note the others briefly in `also_considered`.
- Pick ONE side: `long` or `short`. No "watch" or "hold new" — the Director
  decides.
- The thesis must be falsifiable: the `invalidation_signals` field must list
  concrete events / price levels / numbers that would kill the trade.
- Conviction is a 0.0–1.0 float. 0.5 means "I'd take this in moderate size,
  no more". 0.9+ is reserved for high-edge setups with multiple confirmations.
- Time horizon is in days. Match the trader's swing-mode (typically 5-30 days).

## Output schema

```json
{
  "ticker":           "string (uppercase, e.g. 'NVDA')",
  "side":             "long | short",
  "thesis":           "string, 1-3 sentences explaining the core idea",
  "conviction":       "number 0..1",
  "time_horizon_days":"integer 1..90",
  "key_catalysts":    ["string", "..."],
  "invalidation_signals": [
    "string (concrete: price level, news event, earnings miss, etc.)"
  ],
  "expected_move_pct":"number (signed, positive for long thesis, negative for short)",
  "also_considered":  ["TICKER", "..."],
  "research_sources": ["url or 'agent-state'", "..."]
}
```

## Quality gates (Director won't pass these → don't hand to Quant)

- Thesis is generic ("the stock looks good") → reject.
- `invalidation_signals` is empty or vague → reject. The Risk role needs
  these to set stops.
- `expected_move_pct` is missing → reject. Quant needs a target.
- `time_horizon_days` is 0 or > 90 → out of swing-mode bounds.
- Same ticker has been tried in the last 7 days and the thesis is
  substantially the same → reject (anti-overfit guard).

## Closes

- TRADE-AH-01: Director skill installed at `.claude/skills/autohedge-director/SKILL.md`.
- TRADE-AH-05 + TRADE-AH-06: prompt-only, no Python dependency, sequenced
  before Quant in the routine flow.
