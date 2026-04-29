# JD CoreDev Trading Fleet — Scheduled-Task Blueprint

Reference for migrating every server-side trading system in this repo
from the broken Replit `AI_INTEGRATIONS_*` proxy to a fleet of
scheduled Claude Code routines. Covers four systems:

1. **Kalshi Predictor** — prediction markets (Kalshi only)
2. **Claude Trader** — Alpaca stock trading
3. **Cross-market Arbitrage** — Kalshi vs Polymarket
4. **Crypto Arbitrage** — Kalshi crypto contracts hedged with Alpaca crypto

Replaces the older Predictor-only doc — read this and delete
`predictor-scheduled-task.md` when you have.

---

## 1. Why migrate the whole fleet at once

All four systems share the same broken plumbing:

```
AI_INTEGRATIONS_ANTHROPIC_API_KEY = _DUMMY_API_KEY_
AI_INTEGRATIONS_ANTHROPIC_BASE_URL = http://localhost:1106/modelfarm/anthropic
AI_INTEGRATIONS_OPENAI_API_KEY    = _DUMMY_API_KEY_
AI_INTEGRATIONS_OPENAI_BASE_URL    = http://localhost:1106/modelfarm/openai
```

`localhost:1106/modelfarm` is a Replit-internal proxy that does not
exist on Railway, and the keys are literal `_DUMMY_API_KEY_`. Each
system imports from this same env block, so each system is dormant
for the same reason. The cron flags (`cron_enabled` etc.) are off,
which is why no errors are hitting the logs.

Migrating all four together is cleaner than one-at-a-time because
the auth middleware, secret-management story, kill-switch design,
and Run Now wiring are identical across systems.

---

## 2. Yes — every routine talks to the same APIs the website does

`server/routes.ts:700-712`:

```ts
app.use("/api/trader",     traderRouter);
app.use("/api/predictor",  predictorRouter);
app.use("/api/arbitrage",  arbitrageRouter);
app.use("/api/crypto-arb", cryptoArbRouter);
```

Every endpoint the admin pages call is reachable from a scheduled
routine. No mirroring or duplicate wiring.

---

## 3. CRITICAL — auth gap to fix before scheduling anything

Today **all four routers are publicly mountable with no auth**:

| Router | Auth today | Fix |
|---|---|---|
| `/api/trader` | `x-cron-secret` enforced **only on `/cron/run`**, and `CRON_SECRET` is not set on Railway, so the check short-circuits to "allow" | Add router-wide middleware below |
| `/api/predictor` | none | Same |
| `/api/arbitrage` | none | Same |
| `/api/crypto-arb` | none | Same |

Recommended single shared middleware (`server/routes.ts` around the
existing `app.use` block):

```ts
const requireBotSecret = (req: Request, res: Response, next: NextFunction) => {
  const expected = process.env.BOT_API_SECRET;
  if (!expected) return res.status(503).json({ error: "BOT_API_SECRET not set" });
  if (req.headers["x-bot-secret"] !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
};

app.use("/api/trader",     requireBotSecret, traderRouter);
app.use("/api/predictor",  requireBotSecret, predictorRouter);
app.use("/api/arbitrage",  requireBotSecret, arbitrageRouter);
app.use("/api/crypto-arb", requireBotSecret, cryptoArbRouter);
```

Add `BOT_API_SECRET=…` to Railway. The admin UI's existing
`fetch()` calls need updating to send `x-bot-secret`, easiest via a
shared `apiRequest` helper that injects it for `/api/(trader|predictor|arbitrage|crypto-arb)/*`.

One secret across all four is fine — they all run under the same
admin trust boundary. Use four if you want per-system rotation.

---

## 4. The architectural pattern (applied to all four systems)

Each system's routine is the **brain**; the existing `/api/...`
router is the **hands**.

```
┌──────────────────────────┐    HTTPS POST    ┌────────────────────┐
│ Scheduled Claude routine │ ───────────────▶ │ /api/.../place-bet │
│  • fetch markets via API │                  │  • signs orders    │
│  • run council in-context│                  │  • writes to DB    │
│  • emit JSON verdicts    │                  │  • enforces caps   │
└──────────────────────────┘                  └────────────────────┘
                  ▲                                       │
                  └────────── /history, /stats ◀──────────┘
```

The routine never holds:
- Kalshi RSA private key
- Alpaca API secret
- Polymarket private key
- DB connection string

The routine only holds: `BOT_API_BASE` and `BOT_API_SECRET`.

---

## 5. System-by-system reference

### 5.1 Kalshi Predictor — `/api/predictor`

**Source:** `server/predictor.ts`

**Tables (auto-created at boot, lines 116-174):**
- `predictor_bets` — id, market_ticker, side, contracts, price, cost,
  confidence, edge, council_verdict, council_transcript JSONB,
  status, order_id, pnl, settled_at, logged_at
- `predictor_councils` — market_ticker, our_probability,
  market_probability, edge, verdict, confidence, transcript JSONB
- `predictor_scans`, `predictor_logs`, `predictor_chat`

**Endpoints (read-only, safe to call from routine):**
- `GET /health`, `GET /key-check`
- `GET /markets`, `GET /account`, `GET /positions`, `GET /portfolio`
- `GET /history?type=bets|councils`, `GET /stats`, `GET /runs`
- `GET /settings`

**Endpoints (existing, mutating, no AI dependency):**
- `POST /check-resolutions` — settle won/lost from Kalshi
- `POST /sync-orders` — refresh order status
- `DELETE /bets`, `DELETE /bets/:betId`

**Endpoints (existing, mutating, BROKEN — do not call from routine):**
- `POST /run` — full pipeline incl. dead modelfarm AI
- `POST /scan`, `POST /council`, `POST /research-trader`

**New endpoint to add (the bridge):**

```
POST /api/predictor/place-bet
```

```json
{
  "market_ticker": "KX...",
  "market_title":  "Will X happen by Y?",
  "side":          "yes" | "no",
  "yes_price":     0.42,
  "your_estimate": 0.65,
  "edge":          0.23,
  "confidence":    0.7,
  "verdict":       "BET_YES" | "BET_NO" | "PASS",
  "council_transcript": { "bear": {...}, "bull": {...}, "devil": {...}, "risk": {...}, "judge": {...} }
}
```

Wraps the existing internal `executeBet()` (`predictor.ts:1368`),
which already enforces min-edge, dynamic edge by days-to-close,
Kelly sizing, RSA-signed Kalshi order placement, and the
`predictor_bets` insert. Skips the broken AI council loop because
the verdict comes from the request body.

**Server-side secrets (already set on Railway):**
- `KALSHI_KEY_ID_LIVE`, `KALSHI_PRIVATE_KEY_LIVE` ✅
- `KALSHI_MODE` ✅

---

### 5.2 Claude Trader (Alpaca stocks) — `/api/trader`

**Source:** `server/trader.ts`

**Tables:** `trader_settings`, `trader_chat`, `trader_trades`,
`trader_logs`, `trader_snapshots`, `trader_pipelines`

**Endpoints (read-only):**
- `GET /alpaca-config`, `GET /health`
- `GET /market-signals`, `GET /stock-bars/:ticker`,
  `GET /insider-trades`
- `GET /history`, `GET /run-summaries`
- `GET /performance`, `GET /agent-activity`
- `GET /chat`, `GET /settings`

**Existing mutating:**
- `POST /alpaca-paper` — toggle paper/live
- `POST /alpaca-proxy`, `POST /alpaca-data-proxy` — passthrough
- `POST /sync-pnl` — refresh equity/PnL snapshot
- `POST /history`, `POST /chat`, `POST /chat/execute-task`,
  `POST /settings`
- `POST /cron/run` — existing entrypoint, auth via `x-cron-secret`
  (currently bypassed because `CRON_SECRET` isn't set). Internally
  uses dead modelfarm Claude calls — needs replacement, see below.

**New endpoint to add:**

```
POST /api/trader/place-trade
```

```json
{
  "symbol":    "AAPL",
  "side":      "buy" | "sell",
  "qty":       10,
  "type":      "market" | "limit",
  "limit_price": 175.50,
  "time_in_force": "day" | "gtc",
  "rationale": "...",
  "risk":      "low" | "medium" | "high",
  "mode":      "day" | "swing"
}
```

Wraps the existing internal `alpacaReq(keys, '/v2/orders', 'POST', body)`
call (around `trader.ts:1269` and `:1426-1435`) and writes a
`trader_trades` row.

Also strip the dead Claude calls from `/cron/run` since the routine
takes over that loop.

**Server-side secrets (paper trading present, live missing):**
- `CRON_ALPACA_KEY_PAPER` ✅, `CRON_ALPACA_SECRET_PAPER` ✅
- `CRON_ALPACA_PAPER` ✅
- `CRON_ALPACA_KEY_LIVE` ❌, `CRON_ALPACA_SECRET_LIVE` ❌

Trader can run paper mode immediately. Live mode needs the LIVE keys.

---

### 5.3 Cross-market Arbitrage (Kalshi+Polymarket) — `/api/arbitrage`

**Source:** `server/arbitrage.ts`

**Tables:** `arb_settings`, `arb_opportunities`, `arb_executions`,
`arb_matched_markets`, `arb_scans`, `arb_logs`

**Endpoints (read-only):**
- `GET /health`, `GET /matched-markets`, `GET /history`,
  `GET /stats`, `GET /settings`

**Existing mutating, all BROKEN (use modelfarm):**
- `POST /run`, `POST /scan`, `POST /council`, `POST /claude`,
  `POST /settings`

**New endpoint to add:**

```
POST /api/arbitrage/place-arb
```

```json
{
  "matched_market_id": 123,
  "kalshi_ticker": "KX...",
  "kalshi_side":   "yes" | "no",
  "kalshi_contracts": 10,
  "kalshi_price":  0.42,
  "poly_token_id": "...",
  "poly_side":     "BUY" | "SELL",
  "poly_size":     10,
  "poly_price":    0.55,
  "expected_edge": 0.13,
  "council_transcript": {...}
}
```

Places paired orders on both sides. Writes `arb_executions` row.

**Server-side secrets:**
- `KALSHI_KEY_ID_LIVE`, `KALSHI_PRIVATE_KEY_LIVE` ✅
- `POLY_API_KEY` ✅, `POLY_PRIVATE_KEY` ✅, `POLY_FUNDER` ✅
- `POLY_API_SECRET` ❌, `POLY_API_PASSPHRASE` ❌ — **block this routine until added**

---

### 5.4 Crypto Arbitrage — `/api/crypto-arb`

**Source:** `server/crypto-arb.ts`

**Tables:** `crypto_arb_settings`, `crypto_arb_opportunities`,
`crypto_arb_executions`, `crypto_arb_scans`, `crypto_arb_logs`

**Endpoints (read-only):**
- `GET /health`, `GET /spot-prices`, `GET /history`, `GET /stats`,
  `GET /settings`

**Existing mutating, all BROKEN:**
- `POST /run`, `POST /scan`, `POST /settings`

**New endpoint to add:**

```
POST /api/crypto-arb/place-hedge
```

```json
{
  "kalshi_ticker": "KX...",
  "kalshi_side":   "yes" | "no",
  "kalshi_contracts": 10,
  "kalshi_price":  0.42,
  "alpaca_symbol": "BTC/USD",
  "alpaca_side":   "buy" | "sell",
  "alpaca_qty":    0.01,
  "expected_edge": 0.07,
  "council_transcript": {...}
}
```

Places the Kalshi crypto contract and the offsetting Alpaca crypto
spot order. Writes `crypto_arb_executions` row.

**Server-side secrets:**
- `KALSHI_KEY_ID_LIVE`, `KALSHI_PRIVATE_KEY_LIVE` ✅
- `CRON_ALPACA_KEY_PAPER` ✅, `CRON_ALPACA_SECRET_PAPER` ✅ (paper)
- Live Alpaca keys ❌ — paper-only until added

---

## 6. Schedule recommendations per system

These are **starting points**, not gospel. Adjust after watching one
week of runs and token spend. All cadences expressed for the
`/schedule` skill.

| System | Recommended cadence | Why |
|---|---|---|
| **Predictor** (Kalshi) | every **4 hours**, 24/7 | Markets resolve over days; over-frequent runs waste tokens. Matches existing `cron_interval_hours = 2` ballpark but a bit slower because Claude routines are pricier per run than direct SDK. |
| **Trader** (Alpaca stocks) | every **30 minutes, M-F, 09:30–16:00 ET** | NYSE hours only — outside that the Alpaca clock returns `is_open=false` and the run skips. Frequent enough to react intraday, infrequent enough to keep cost reasonable. |
| **Arbitrage** (Kalshi+Poly) | every **2 hours**, 24/7 | Cross-platform pricing edges close quickly. Dormant until POLY secrets are added. |
| **Crypto-arb** | every **1 hour**, 24/7 | Crypto is 24/7. BTC/ETH spot moves faster than Kalshi resubmissions, so 1h catches most divergence. |

For `/schedule`, those become:
- Predictor: `0 */4 * * *`
- Trader: `*/30 13-21 * * 1-5` (UTC equivalent of 09:00–17:00 ET, slightly padded)
- Arbitrage: `0 */2 * * *`
- Crypto-arb: `0 * * * *`

A shared "Run Now" button on each admin page hits its routine's
trigger URL — no cadence change needed for ad-hoc runs.

---

## 7. The four routine prompts

Each routine is created via `/schedule` with a self-contained
prompt. Substitute `{{BOT_API_BASE}}` (e.g.
`https://your-railway-domain/api`) and `{{BOT_API_SECRET}}` at
schedule time. Every API call carries `x-bot-secret: {{BOT_API_SECRET}}`.

### 7.1 Predictor routine

```
You are the JD CoreDev Kalshi Prediction Bot.

Each run:
1. GET {{BOT_API_BASE}}/predictor/settings, .../markets, .../positions, .../stats
2. Score live Kalshi markets for mispricing.
3. For candidates, run a five-agent council in your own context
   (bear, bull, devil, risk, judge) producing JSON in this shape:
   { market_ticker, market_title, side, yes_price, your_estimate,
     edge, confidence, verdict ∈ {BET_YES,BET_NO,PASS},
     council_transcript: { bear, bull, devil, risk, judge } }
4. POST that JSON to /predictor/place-bet for each non-PASS verdict.
5. POST /predictor/sync-orders, then /predictor/check-resolutions.
6. Write a one-paragraph summary of the run.

Constraints:
- Never exceed settings.max_bet_usd per bet, settings.max_positions overall.
- Skip markets clustered with ≥ settings.max_correlated_bets existing
  open bets (Iran, Israel, Trump-cabinet, etc.).
- Markets closing in <24h need 2× normal edge.
- 3-retry max on API errors, then abort the run cleanly.
- Trade Kalshi only. Polymarket leg is dormant.

Trust the server: /place-bet enforces min-edge floors, Kelly sizing,
and refuses bets that violate constraints.
```

### 7.2 Trader routine

```
You are the JD CoreDev Claude Trader (Alpaca stocks).

Each run:
1. GET {{BOT_API_BASE}}/trader/health to confirm market open.
   If is_open=false, write "market closed" log and exit.
2. GET .../market-signals, .../insider-trades, .../performance,
   .../history?limit=20, .../settings
3. Identify 0-3 candidate symbols based on:
   - Recent insider buying that hasn't been priced in
   - Earnings within 5 trading days where IV is mispriced
   - Setting ${settings.risk}-appropriate technical setups
4. For each candidate, GET .../stock-bars/{ticker} for the last
   30 days and reason about entry price.
5. Run a four-agent council (analyst, contrarian, risk, judge)
   producing JSON:
   { symbol, side, qty, type, limit_price, time_in_force,
     rationale, risk, mode }
6. POST to /trader/place-trade.
7. POST /trader/sync-pnl.
8. Write a summary including current equity, today's P&L, and
   any open positions you reviewed.

Constraints:
- Honour settings.risk (low / medium / high) for position size.
- Never use more than 25% of buying power on a single trade.
- No new entries within 30min of close unless mode='day' and TIF='day'.
- No averaging down — if a position is red, hold or exit, never add.
- Treat paper mode the same as live mode (settings.alpaca_paper
  controls which Alpaca keys the server uses, not your behaviour).
```

### 7.3 Arbitrage routine

```
You are the JD CoreDev Cross-Market Arbitrage Bot
(Kalshi vs Polymarket).

Each run:
1. GET {{BOT_API_BASE}}/arbitrage/matched-markets, .../settings,
   .../stats
2. For each matched pair, fetch live yes/no prices on both venues.
3. Compute the round-trip edge: (1 - kalshi_yes_price) +
   poly_no_price < 1 ⇒ short Kalshi NO + buy Poly NO is a guaranteed
   spread (and the symmetric case for YES).
4. Council debate (bear, bull, liquidity, settlement, judge)
   producing JSON:
   { matched_market_id, kalshi_ticker, kalshi_side, kalshi_contracts,
     kalshi_price, poly_token_id, poly_side, poly_size, poly_price,
     expected_edge, council_transcript: {...} }
5. POST /arbitrage/place-arb for each non-PASS verdict.
6. Summary paragraph.

Constraints:
- Skip pairs where either leg has < $500 visible liquidity at
  desired size.
- Settlement-time mismatch beyond 7 days between venues = auto-PASS.
- Never run if Polymarket auth is missing — POST /arbitrage/place-arb
  will refuse anyway, but check .../health first to fail fast.
```

### 7.4 Crypto-arb routine

```
You are the JD CoreDev Crypto Arb Bot (Kalshi crypto contracts
hedged with Alpaca crypto spot).

Each run:
1. GET {{BOT_API_BASE}}/crypto-arb/settings, .../spot-prices,
   .../stats
2. Fetch the active Kalshi crypto markets (BTC, ETH price-target
   contracts, monthly close ranges, etc.).
3. For each, compute fair YES probability from current spot,
   implied volatility, and time to settle. Compare to Kalshi yes_price.
4. If divergence > settings.crypto_min_edge, design a hedge:
   - If Kalshi YES is overpriced and you go SHORT (NO), buy spot to
     hedge upside.
   - Vice versa for SHORT YES.
5. Council debate (analyst, hedge, risk, judge) producing JSON:
   { kalshi_ticker, kalshi_side, kalshi_contracts, kalshi_price,
     alpaca_symbol, alpaca_side, alpaca_qty, expected_edge,
     council_transcript: {...} }
6. POST /crypto-arb/place-hedge.
7. Summary.

Constraints:
- Hedge sizing: notional matched within ±10%. The point is delta
  neutrality, not directional bets.
- Settlement timing: if Kalshi market closes in <2h, PASS — too
  little room to unwind hedge.
- Paper Alpaca means paper hedge — fine for now; flag in summary
  if you would have wanted live execution.
```

---

## 8. Run Now buttons (per system)

Same pattern across all four. Each routine, when created via
`/schedule`, exposes a trigger URL bound to that routine. Add four
small server endpoints, one per system:

```
POST /api/predictor/trigger-routine   → calls Predictor trigger URL
POST /api/trader/trigger-routine      → calls Trader trigger URL
POST /api/arbitrage/trigger-routine   → calls Arbitrage trigger URL
POST /api/crypto-arb/trigger-routine  → calls Crypto-arb trigger URL
```

Each endpoint:
- Reads `req.body` (optional override params)
- POSTs to the routine's trigger URL with the Anthropic API key
- Returns 202 immediately

The existing **Run Now** buttons in
`client/src/pages/admin/trader-predictions.tsx:2491` (and equivalent
on other admin pages) repoint from `/run` to `/trigger-routine`.

**Tradeoff to flag in the UI:** today's `/run` streams SSE
stage-by-stage. Trigger-routine is fire-and-forget. Compensate by
polling `/{system}/runs` (or `/run-summaries` for trader) every few
seconds and surfacing the latest entry as soon as it appears. Alternatively, have each routine
write incremental progress into the existing `*_logs` table that
the UI already reads.

---

## 9. Safety controls (apply to all four)

1. **Server is authoritative**, not the routine. Each `place-*`
   endpoint enforces:
   - Per-trade max size from settings
   - Portfolio caps (max positions, max cash committed)
   - Min edge / minimum confidence floors
   - Whitelist of acceptable markets/symbols if relevant
2. **Kill switch per system.** Add a setting `bot_enabled` (default
   `false`) that each `place-*` endpoint checks first. Lets you
   disable trading without unscheduling routines.
3. **Daily loss cap.** Setting `daily_max_loss_usd`. The endpoint
   refuses new trades once the trailing-24h loss exceeds it.
4. **Rate limit `/place-*`** to 30 req/min per source IP — protects
   against runaway prompts.
5. **No cross-system budget today.** If you ever want a single
   "fleet stops if total day-loss > $X", introduce a `system_state`
   table that all four endpoints check. Worth flagging early even
   if you don't build it now.

---

## 10. Required secrets summary

**Already on Railway, no action:**
- `KALSHI_KEY_ID_LIVE`, `KALSHI_PRIVATE_KEY_LIVE`, `KALSHI_MODE`
- `CRON_ALPACA_KEY_PAPER`, `CRON_ALPACA_SECRET_PAPER`, `CRON_ALPACA_PAPER`
- `ANTHROPIC_API_KEY` (for the trigger-routine endpoints to call
  Claude's API; not for in-server SDK use)
- `POLY_API_KEY`, `POLY_PRIVATE_KEY`, `POLY_FUNDER`
- DB / object storage / general infra

**New secrets to add:**
- `BOT_API_SECRET` — shared header secret for routine ↔ server auth
- `ANTHROPIC_TRIGGER_API_KEY` — if separate from `ANTHROPIC_API_KEY`,
  used only by `/trigger-routine` endpoints

**Add only if you're enabling the corresponding system in live mode:**
- `CRON_ALPACA_KEY_LIVE`, `CRON_ALPACA_SECRET_LIVE` — Trader live
- `POLY_API_SECRET`, `POLY_API_PASSPHRASE` — Arbitrage at all (paper or live)

**Safe to delete:**
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`
- `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`

(Keep them for now if you want a one-step rollback path; remove once
the new fleet is stable for ~2 weeks.)

---

## 11. Migration order

Recommended sequence — finish each step on **all four systems**
before moving to the next:

1. Add `BOT_API_SECRET` to Railway. Add the shared `requireBotSecret`
   middleware in `server/routes.ts:700-712`. Update the admin UI's
   `apiRequest` helper to inject `x-bot-secret`.
2. For each system, add the new execution endpoint (`/place-bet`,
   `/place-trade`, `/place-arb`, `/place-hedge`) wrapping the
   already-tested order-placement code paths. Add `bot_enabled` and
   `daily_max_loss_usd` to each system's settings table; enforce in
   the new endpoints.
3. Stub the broken Claude SDK calls. In each system's source, replace
   `callClaude` / `callClaudeFast` (and the OpenAI `gpt-4o-mini`
   paths in `predictor.ts:2174` / `:2711` and `trader.ts:1200`) with
   functions that throw "use scheduled routine instead" — keep the
   exports so order plumbing still compiles.
4. Add four `POST /trigger-routine` endpoints, one per router.
5. Repoint the four Run Now UI buttons from `/run` to
   `/trigger-routine`. Add a "latest run summary" panel polling the
   `*_logs` / `runs` endpoints.
6. Create the four scheduled routines via `/schedule` using the
   prompts in §7 and the cadences in §6. Run each at least once
   manually before letting the cron loop unattended.
7. Remove the legacy `cron_enabled` settings flags in each system
   (or repurpose as the kill switch).
8. After two weeks of stable operation, remove `AI_INTEGRATIONS_*`
   from Railway.

---

## 12. Out of scope here

- The Lead Engine and other non-trading routes — unaffected.
- Kalshi demo mode (`KALSHI_KEY_ID_DEMO`, `KALSHI_PASSWORD_DEMO`):
  not needed for live trading. Add only if you want to test in demo.
- Polymarket and Alpaca *live* trading — both have non-AI blockers
  (missing secrets) and are explicitly gated above.
- Any rewrite of the council reasoning algorithm itself — the prompts
  in §7 are starting points, refine after seeing real run output.
