---
name: autohedge-execution
description: Translate a Risk-approved trade into an order payload that the trader-agent endpoint can execute. Enforces Paper-by-default and explicit Live-mode confirmation gate. Output is JSON-schema-validated and posts to /api/trader/agent/decisions.
---

# autohedge-execution

The Execution role is step 4 (final) of the AutoHedge sequence. Read this
skill, take the Director / Quant / Risk outputs, produce the order payload,
and POST it to `/api/trader/agent/decisions`.

Prompt-only skill. The actual Alpaca order placement happens server-side in
`server/trader-agent.ts` once the decision payload is validated.

## When to use this

Run Execution only when:
- Quant verdict = CONFIRM
- Risk decision = TAKE (not PASS)
- Risk circuit-breaker state = `normal` or `halved`

If any of those fail, the chain halts here without an order.

## Prompt

You are **Execution**. Your job is to package Director + Quant + Risk into
a single decision payload that the trader-agent endpoint accepts, and to
enforce mode safety.

Inputs:
- Director output (ticker, side, thesis, key_catalysts)
- Quant output (verdict=CONFIRM, edge_score, supporting_metrics)
- Risk output (entry_price, stop_loss, take_profit, position_size_shares,
  risk_reward_ratio, drawdown_circuit_state)
- Active mode from `/api/trader/agent/state`: `isPaper` (true | false)

### Mode safety (TRADE-MODE-01, TRADE-MODE-02)

- **Default = Paper.** If the routine prompt did not explicitly request Live
  mode for this fire, force `paper_or_live: "paper"`. Never auto-promote.
- **Live mode requires explicit confirmation.** The routine prompt must
  contain a literal `LIVE_MODE_AUTHORIZED=true` flag for this fire (set by
  the user before the manual fire). If absent, force Paper.
- Even in Paper, `confirmation_required` defaults to `false` — the trader
  endpoint will execute Paper trades without an extra gate. Live trades
  always require explicit human confirmation in the admin UI.

### Order shape

- For swing trades: `order_type: "limit"` with `limit_price = entry_price`
  from Risk. Time-in-force: `day` (re-fires if not filled by close).
- Avoid market orders unless the Director's catalyst is binary and immediate
  (rare). If using market, set `time_in_force: "day"` and flag in `notes`.
- Bracket orders: include `stop_loss` and `take_profit` as protective legs.

## Output schema

This is the payload that gets POSTed to `/api/trader/agent/decisions`. The
shape is intentionally close to the trader-agent's existing decision schema
(see `server/trader-agent.ts:191-201`) so the endpoint validates it without
schema drift.

```json
{
  "ticker":               "string (uppercase)",
  "side":                 "buy | sell",
  "qty":                  "integer (Risk.position_size_shares)",
  "order_type":           "market | limit",
  "limit_price":          "number (required if order_type=limit)",
  "time_in_force":        "day | gtc",
  "stop_loss":            "number (Risk.stop_loss)",
  "take_profit":          "number (Risk.take_profit)",
  "paper_or_live":        "paper | live",
  "confirmation_required": "boolean",
  "thesis":               "string (Director.thesis, copied through)",
  "edge_score":           "number (Quant.edge_score)",
  "risk_reward_ratio":    "number (Risk.risk_reward_ratio)",
  "drawdown_circuit_state": "normal | halved | halted",
  "decision_source":      "agent-routine",
  "autohedge_chain": {
    "director_conviction": "number (Director.conviction adjusted by Quant)",
    "quant_verdict":       "CONFIRM",
    "risk_decision":       "TAKE"
  },
  "notes":                "string (optional — anomalies, deviations from formula)"
}
```

## Quality gates

- `qty == 0` → don't post. Halt the chain quietly.
- `paper_or_live == "live"` without `LIVE_MODE_AUTHORIZED=true` in the
  routine prompt → force back to `paper`, log a warning in `notes`.
- `limit_price` missing on `order_type: "limit"` → reject.
- Side mismatch (Director says short, output says buy) → halt.
- `qty * limit_price > account.buying_power` → halt; Risk should have caught
  this but double-check at the Execution boundary.

## Posting

```
POST https://www.jdcoredev.com/api/trader/agent/decisions
Headers:
  x-jdcd-agent-key: <JDCD_AGENT_KEY env value>
  Content-Type:     application/json
Body: <output schema above>
```

The endpoint validates the payload, runs hard caps (TRADE-MODE-01, position
limits, drawdown gate), and either places the Alpaca order (server-side) or
returns a rejection reason.

## Closes

- TRADE-AH-04: Execution skill with schema-validated output.
- TRADE-AH-05 + TRADE-AH-06: prompt-only, sequenced after Risk.
- TRADE-MODE-01 + TRADE-MODE-02: enforced at this boundary.
