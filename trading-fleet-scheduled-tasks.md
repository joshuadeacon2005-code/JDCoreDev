# JD CoreDev Trader — Scheduled Routine Reference

Reference for setting up and operating the Anthropic-hosted scheduled
routine that drives the Claude Trader (Alpaca stocks). Predictor still
runs on its old cron loop; arbitrage + crypto-arb were retired and
their server files (`server/arbitrage.ts`, `server/crypto-arb.ts`) are
orphans pending deletion.

---

## 1. Status (as of 2026-04-29)

| System | State |
|---|---|
| **Trader** (`/api/trader`) | Agent-routine endpoints live (`server/trader-agent.ts`), awaiting routine schedule |
| **Predictor** (`/api/predictor`) | Still on legacy cron + dead modelfarm Claude calls — migration not started |
| ~~Arbitrage~~ | Removed from sidebar nav. Source file `server/arbitrage.ts` is dead code, not mounted in routes.ts |
| ~~Crypto Arb~~ | Same — `server/crypto-arb.ts` orphan |

---

## 2. Architecture (trader)

Routine = brain. Server endpoints = hands.

```
┌──────────────────────────┐   GET /agent/state   ┌────────────────────────┐
│ Scheduled Claude routine │ ───────────────────▶ │ /api/trader/agent      │
│  • read account + positions                     │  • signs Alpaca orders │
│  • run council in-context│ ◀─── JSON state ──── │  • enforces hard caps  │
│  • emit JSON decisions   │                      │  • writes trader_trades│
│  • POST decisions        │ ───────────────────▶ │                        │
└──────────────────────────┘                      └────────────────────────┘
```

The routine holds only `BOT_API_BASE` and `JDCD_AGENT_KEY`. The server
holds Alpaca paper/live keys, the DB connection string, and the
authoritative settings/constraints.

---

## 3. Auth

The trader-agent router uses `x-jdcd-agent-key` validated against the
`JDCD_AGENT_KEY` env var (`server/trader-agent.ts:28-38`). The key is
already set on Railway. Every routine request must include:

```
x-jdcd-agent-key: <value of JDCD_AGENT_KEY>
```

Predictor has not been migrated and is currently mounted without auth
on `/api/predictor`. Outside scope of this doc.

---

## 4. Trader API contract (current code)

### `GET /api/trader/agent/state`

Single call returning everything the routine needs to decide.

Response shape (top-level keys):
- `mode: "swing"`
- `isPaper: bool`
- `generatedAt: ISO`
- `constraints` — `{ maxPositions, maxPositionPct, stopLossPct, takeProfitPct, maxDrawdown7dPct, noEarningsWithinDays }`
- `account` — `{ equity, cash, buyingPower, portfolioValue, accountNumber, currency }` or `null` if paper/live keys missing
- `positions[]` — `{ symbol, qty, side, avgEntry, currentPrice, marketValue, unrealizedPL, unrealizedPLPct }`
- `drawdown7dPct: number`
- `equityHistory[]` — `{ ts, equity }` for last 7 days
- `recentDecisions[]` — last 30 entries from `trader_pipelines`
- `recentTrades[]` — last 60 from `trader_trades`
- `currentRisk: "low" | "medium" | "high"` — from `trader_settings.cron_risk`
- `marketHints` — pointers to `/api/trader/market-signals?mode=swing` and `/api/trader/stock-bars/{SYMBOL}?limit=60&timeframe=1Day` (both public, no auth needed)

### `POST /api/trader/agent/decisions`

Body:
```json
{
  "thesis": "1-3 sentence rationale for the run",
  "decisions": [
    { "action": "buy",  "symbol": "AAPL", "notional": 1000, "rationale": "...", "earnings_aware": false },
    { "action": "sell", "symbol": "MSFT", "qty": 5,         "rationale": "..." },
    { "action": "hold", "symbol": "NVDA",                   "rationale": "..." }
  ]
}
```

Server-side hard constraints (all decisions checked, violators rejected):
- `maxPositions = 10` total open
- `maxPositionPct = 15` (notional ≤ 15% of equity)
- `maxDrawdown7dPct = 10` — if breached, rejects ALL buy decisions in the run
- `noEarningsWithinDays = 3` — buy on a symbol with earnings within 3d requires `earnings_aware: true` to acknowledge

Survivors execute via Alpaca (paper or live per `trader_settings.alpaca_paper`) and write a `trader_trades` row. Rejected decisions return `{ status: "rejected", reasons: [...] }` in the response.

### Response shape

```json
{
  "executed": 2,
  "rejected": 1,
  "results": [{ "symbol": "AAPL", "action": "buy", "status": "executed", "orderId": "..." }, ...]
}
```

---

## 5. Cadence

Code intent (per `trader-agent.ts` header comment): every 4 hours
during US market hours. The first GET in the routine checks
`isPaper` + Alpaca account access; if Alpaca is closed for the
session, the run completes with `decisions: []` and a "market closed"
thesis.

Recommended cron (UTC): `0 14,18,21 * * 1-5` — fires at 14:00, 18:00,
21:00 UTC, M–F. That maps roughly to 09:00 / 13:00 / 16:00 ET in
winter, 10:00 / 14:00 / 17:00 ET in summer. Adjust after a week of
runs.

---

## 6. Routine prompt

Paste this into `/schedule`. Substitute `{{BOT_API_BASE}}` (e.g.
`https://www.jdcoredev.com/api`) and `{{JDCD_AGENT_KEY}}` at schedule
time.

```
You are the JD CoreDev Claude Trader (Alpaca stocks, swing mode).

Each run:
1. GET {{BOT_API_BASE}}/trader/agent/state
   Header: x-jdcd-agent-key: {{JDCD_AGENT_KEY}}
   This is your snapshot of the world: account, positions, drawdown,
   recent decisions, recent trades, current risk setting, hard
   constraints, and pointers to public market-data endpoints.

2. If state.account is null OR Alpaca is closed for the session
   (positions empty + you have no buy candidates), POST a no-op run:
     thesis: "Market closed / Alpaca unavailable — no trades."
     decisions: []
   Then exit.

3. For research, optionally GET (no auth header needed):
   - {{BOT_API_BASE}}/trader/market-signals?mode=swing
   - {{BOT_API_BASE}}/trader/stock-bars/{SYMBOL}?limit=60&timeframe=1Day
     — for each ticker you're seriously considering.

4. Identify 0-3 candidate symbols based on:
   - Recent insider buying surfaced in market-signals
   - Earnings within 5 trading days where IV is mispriced
   - Setting state.currentRisk-appropriate technical setups
   - Symbols already in state.positions where stop/take is hit

5. Run a four-agent council in your context (analyst, contrarian,
   risk, judge) to debate each candidate. Output a single thesis
   string (1-3 sentences) summarising the run.

6. POST {{BOT_API_BASE}}/trader/agent/decisions
   Header: x-jdcd-agent-key: {{JDCD_AGENT_KEY}}
   Body: {
     thesis: "<your run thesis>",
     decisions: [
       { action: "buy",  symbol: "AAPL", notional: 1000, rationale: "...", earnings_aware: <bool> },
       { action: "sell", symbol: "MSFT", qty: 5,         rationale: "..." },
       { action: "hold", symbol: "NVDA",                 rationale: "..." }
     ]
   }
   The server enforces all hard constraints and rejects violators.
   Read the response — anything with status:"rejected" is your signal
   that you proposed something the server refused (read `reasons` to
   learn why).

7. Final: write a one-paragraph summary that includes:
   - Current equity and 7d drawdown from state
   - Number of decisions executed vs rejected
   - Any rejected decisions and why (from response)
   - Open positions you reviewed

Constraints baked into your reasoning (server enforces these too):
- Honour state.currentRisk for sizing. Low risk → notional ≤ 5% of
  equity per trade; medium → 10%; high → 15% (the server cap).
- Never propose more than 3 buys per run.
- No averaging down — if a position is red and not at stop, propose
  hold, never buy more.
- For symbols with earnings within 3 trading days, set
  earnings_aware: true on the buy decision to acknowledge.
- 3-retry max on transient API errors, then abort the run cleanly.

Trust the server: it will reject any decision that violates portfolio
caps, drawdown limits, or sizing rules — read the rejection reasons
and adapt next run.
```

---

## 7. Required secrets

**Set on Railway, no action needed:**
- `JDCD_AGENT_KEY` ✅ — what the routine sends in `x-jdcd-agent-key`
- `ANTHROPIC_API_KEY` ✅ — for the routine's inference quota
- `CRON_ALPACA_KEY_PAPER` ✅, `CRON_ALPACA_SECRET_PAPER` ✅ — paper mode ready
- `CRON_ALPACA_PAPER` ✅ — defaults to paper

**Missing — add only when going live:**
- `CRON_ALPACA_KEY_LIVE`, `CRON_ALPACA_SECRET_LIVE` — live mode is
  blocked until both are added. Paper mode runs fine without them.

---

## 8. Run Now button

The admin page's existing "Run Now" can either:

1. **Hit the Anthropic routine trigger URL** directly. Cleanest — no
   extra server code. Routine ID + trigger URL come from `/schedule`
   when you create the routine.
2. **Add a `POST /api/trader/agent/run-now` endpoint** that proxies
   to the trigger URL with `ANTHROPIC_API_KEY`. Slightly more code
   but keeps the secret server-side only.

Either way, the existing `/cron/run` endpoint in `trader.ts` (which
calls dead modelfarm Claude) should be retired once the routine has
been live for a couple of weeks.

---

## 9. Safety controls

Server is authoritative — the routine cannot bypass these:

1. **Hard constraints** in `AGENT_CONSTRAINTS` (`trader-agent.ts:43-50`).
2. **Earnings gate** — buys on symbols with earnings within 3 days
   require explicit acknowledgement (`earnings_aware: true`).
3. **Drawdown circuit breaker** — 7-day drawdown >10% blocks all new
   entries until equity recovers.
4. **Paper-vs-live split** — `trader_settings.alpaca_paper` decides
   which Alpaca keys the server uses for execution; the routine
   doesn't see this distinction directly.
5. **Kill switch (TODO)** — there's no `bot_enabled` flag yet. If you
   want to disable trading without unscheduling the routine, add one
   to `trader_settings` and check it at the top of `/agent/decisions`.

---

## 10. To-do (not yet done)

- Migrate predictor (`/api/predictor`) onto the same routine pattern.
  Copy the trader-agent design: a single `state` GET, a single
  `decisions` POST, hard constraints in code, Anthropic-hosted
  routine driving it. The `predictor.ts` Claude SDK calls are dead
  (modelfarm proxy), so the cron flag is currently a no-op.
- Delete `server/arbitrage.ts` and `server/crypto-arb.ts` — they're
  orphan files. Two stale references remain in `server/routes.ts`
  (lines ~760 + ~805 in the automation master-control endpoint)
  pointing to a `arb_settings` table that may not exist; will quietly
  return "false" but is misleading. Worth a follow-up cleanup.
- Add the `bot_enabled` kill switch above.
- Add `CRON_ALPACA_KEY_LIVE` + `CRON_ALPACA_SECRET_LIVE` to Railway
  when ready to flip from paper to live.
