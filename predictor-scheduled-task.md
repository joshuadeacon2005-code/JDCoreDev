# Kalshi Predictor — Scheduled-Task Blueprint

Reference for migrating the prediction bot from a broken server-side
`AI_INTEGRATIONS_*` cron to a scheduled Claude Code routine. The
website and the routine call the **same** `/api/predictor/*` API.

## 1. Why this migration

The server-side AI council is unusable on Railway today:

- `AI_INTEGRATIONS_ANTHROPIC_API_KEY = _DUMMY_API_KEY_`
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL = http://localhost:1106/modelfarm/anthropic`
- `AI_INTEGRATIONS_OPENAI_API_KEY = _DUMMY_API_KEY_`
- `AI_INTEGRATIONS_OPENAI_BASE_URL = http://localhost:1106/modelfarm/openai`

`localhost:1106/modelfarm` is a Replit-internal proxy. Outside Replit
those creds are dead. `cron_enabled = false` is the reason there is
no error noise — the bot just isn't running. Last bet logged:
2026-04-19. Today: 2026-04-27.

A scheduled Claude Code routine collapses three integrations
(Anthropic SDK, OpenAI SDK, modelfarm proxy) into one Claude session
that runs the council in its own context, then calls audited HTTP
endpoints to execute orders.

## 2. Yes — same API as the website

`server/routes.ts:704`

```ts
app.use("/api/predictor", predictorRouter);
```

Every existing endpoint on the admin pages (`trader-predictions.tsx`)
is callable from a scheduled task. No mirror, no duplicate routes.

## 3. CRITICAL — auth gap to fix first

`/api/predictor` has **no auth middleware** today. Anyone on the
public domain can hit `/api/predictor/run`, `/api/predictor/scan`,
etc. Before pointing a scheduled task (or anything else) at this in
production, add a shared-secret check:

```ts
// server/routes.ts — replace the bare app.use
app.use("/api/predictor", (req, res, next) => {
  const ok = req.headers["x-predictor-secret"] === process.env.PREDICTOR_API_SECRET;
  if (!ok) return res.status(401).json({ error: "unauthorized" });
  next();
}, predictorRouter);
```

Then `PREDICTOR_API_SECRET=…` on Railway, and pass
`x-predictor-secret: …` from the scheduled task and the admin UI
fetches.

## 4. Endpoint surface

All paths prefixed `/api/predictor`. Source: `server/predictor.ts`.

**Read (safe to call freely):**

| Path                      | Use                                                |
|---------------------------|----------------------------------------------------|
| `GET  /health`            | basic liveness                                     |
| `GET  /key-check`         | confirm Kalshi creds parse                         |
| `GET  /markets`           | list candidate Kalshi markets                      |
| `GET  /account`           | Kalshi balance / portfolio summary                 |
| `GET  /positions`         | open positions                                     |
| `GET  /portfolio`         | combined portfolio view                            |
| `GET  /poly-balance`      | Polymarket balance (skip — no real key on Railway) |
| `GET  /history?type=bets` | bet history                                        |
| `GET  /history?type=councils` | council transcripts                            |
| `GET  /settings`          | min_edge, max_bet_usd, kelly_fraction, mode, etc.  |
| `GET  /stats`             | win rate, ROI, recent councils                     |
| `GET  /runs`              | scan-run history                                   |

**Mutating (current state — DO NOT call from scheduled task):**

| Path                  | Why not                                           |
|-----------------------|---------------------------------------------------|
| `POST /run`           | runs full pipeline incl. broken Claude SDK calls  |
| `POST /scan`          | uses Claude SDK internally — broken               |
| `POST /council`       | uses Claude SDK internally — broken               |
| `POST /research-trader` | uses dummy OpenAI key — broken                  |

**Mutating (no AI dependency — safe):**

| Path                       | Use                                       |
|----------------------------|-------------------------------------------|
| `POST   /check-resolutions`| mark won/lost from settled Kalshi markets |
| `POST   /sync-orders`      | refresh order status from Kalshi          |
| `DELETE /bets`             | clear pending bets                        |
| `DELETE /bets/:betId`      | cancel one bet                            |

**Endpoint we need to add — the bridge for the scheduled task:**

```
POST /api/predictor/place-bet
```

Body:

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
  "council_transcript": { /* full bear/bull/devil/risk/judge JSON */ }
}
```

Behaviour: route to the existing internal `executeBet()` function in
`server/predictor.ts:1368` (which already handles min-edge floors,
dynamic edge, Kelly sizing, RSA-signed Kalshi order placement, and
`predictor_bets` insert) — but skip the broken AI council loop. The
council verdict comes from the request body.

This is the only code change required to unblock the migration.

## 5. Database tables to be aware of

Schema at `server/predictor.ts:116-174`. Three relevant tables:

- `predictor_bets` — id, market_ticker, side, contracts, price, cost,
  confidence, edge, council_verdict, council_transcript JSONB,
  status, order_id, pnl, settled_at, logged_at
- `predictor_councils` — id, market_ticker, our_probability,
  market_probability, edge, verdict, confidence, transcript JSONB,
  logged_at
- `predictor_scans` — markets_scanned, candidates_found, bets_placed,
  analyzed_tickers, rounds, result_summary, scan_json

The `/place-bet` endpoint should write the council transcript into
`predictor_councils` *and* into `predictor_bets.council_transcript`
so the existing UI (`/api/predictor/stats`, `/api/predictor/history`)
keeps rendering the same shape it does today.

## 6. Secrets the scheduled task needs

- `PREDICTOR_API_BASE` — e.g. `https://your-railway-domain/api/predictor`
- `PREDICTOR_API_SECRET` — the shared secret from §3

The scheduled task does **not** need:
- Kalshi RSA private key (server still signs orders)
- DB connection string (server still writes)
- Anthropic / OpenAI keys (Claude is the runtime)

Keeping the RSA key and DB on the server is the safest split — the
scheduled task only ever sends `x-predictor-secret` HTTPS calls.

## 7. The scheduled-task prompt

Save as a routine via `/schedule`. Cadence suggestion: every 2 hours
(matches existing `cron_interval_hours = 2` setting). Run cost will
be roughly proportional to number of markets scanned per run.

```
You are the JD CoreDev Kalshi Prediction Bot.

Your job each run:
1. Pull current settings, markets, positions, and stats from
   {{PREDICTOR_API_BASE}} (header: x-predictor-secret:
   {{PREDICTOR_API_SECRET}}).
2. Score the live Kalshi markets for mispricing.
3. For each market that crosses the council threshold, run a
   structured five-agent debate (bear / bull / devil / risk / judge)
   in your own context.
4. For markets where your judge issues BET_YES or BET_NO with edge
   >= settings.min_edge, POST /place-bet to execute.
5. Refresh order statuses (POST /sync-orders) and resolution outcomes
   (POST /check-resolutions) before exiting.
6. Write a one-paragraph summary of what you did this run.

Constraints, in order of importance:
- Never exceed settings.max_bet_usd on a single bet.
- Never exceed settings.max_positions across the portfolio.
- Skip any market clustered with >= settings.max_correlated_bets
  existing open bets (e.g. multiple Iran-deal contracts).
- If a market closes within 24h, require 2x the normal edge.
- If you cannot reach the API after 3 retries, abort the run and
  log the error — do not retry indefinitely.
- Trade only Kalshi. The Polymarket leg is dormant.

Council prompt (run for each candidate market):
- Bear agent: argue NO. Cite hard structural constraints.
- Bull agent: argue YES. Cite recent news, base rates, momentum.
- Devil's advocate: attack the strongest of the two.
- Risk agent: liquidity, settlement risk, correlation, time-to-close.
- Judge: synthesise into our_probability, market_probability, edge,
  verdict (BET_YES / BET_NO / PASS), confidence (low / medium / high).

Output the judge verdict as JSON in this exact shape so the server
can persist it without reshaping:

{
  "market_ticker":      "...",
  "market_title":       "...",
  "side":               "yes" | "no",
  "yes_price":          0.42,
  "your_estimate":      0.65,
  "edge":               0.23,
  "confidence":         0.7,
  "verdict":            "BET_YES" | "BET_NO" | "PASS",
  "council_transcript": {
    "bear":  { "argument": "..." },
    "bull":  { "argument": "..." },
    "devil": { "argument": "..." },
    "risk":  { "argument": "..." },
    "judge": { "rationale": "..." }
  }
}

POST that JSON to /place-bet for each non-PASS verdict. The server
enforces min-edge, Kelly sizing, and Kalshi order placement —
trust the server to refuse bets that violate constraints.

Do not fabricate market data. If /markets returns nothing or returns
an error, log "no markets" and exit cleanly.
```

## 8. Safety controls worth keeping or adding

- Server-side floor: `executeBet` already enforces `min_edge`,
  `max_bet_usd`, dynamic edge by days-to-close, and Kelly sizing.
  The scheduled task is *advisory*; the server is authoritative.
- Add a kill switch: a setting `bot_enabled` (default `false`) that
  `/place-bet` checks first. Lets you disable trading without
  unscheduling the routine.
- Daily loss cap: a setting `daily_max_loss_usd`. `/place-bet`
  rejects new bets once cumulative cost in the last 24h exceeds it.
- Rate limit `/place-bet` to e.g. 30 req/min per source IP — protects
  against a runaway prompt.

## 9. Migration order

1. Add `PREDICTOR_API_SECRET` to Railway and the auth middleware in
   `server/routes.ts:704`.
2. Add the `POST /place-bet` endpoint that wraps `executeBet`.
3. Update the admin UI `apiRequest` calls to send the new header.
4. Delete the broken `AI_INTEGRATIONS_*` reads from
   `server/predictor.ts:14-17` and stub out `callClaude` /
   `callClaudeFast` to throw "use scheduled task instead". Keep the
   functions exported so `executeBet` and the order plumbing
   compile.
5. Remove the OpenAI `gpt-4o-mini` paths at `predictor.ts:2174` and
   `:2711` — neither is on the trading hot path.
6. Set `cron_enabled = false` permanently. The scheduled Claude Code
   routine is the new cron.
7. Schedule the routine. Watch one run end-to-end before letting it
   loop unattended.

## 10. Out of scope here

- Polymarket: keys are partial, leg is disabled (`poly_enabled =
  false`). Re-enable only after `POLY_API_SECRET` and
  `POLY_API_PASSPHRASE` are added and a separate review.
- Crypto-arb (`server/crypto-arb.ts`): same `AI_INTEGRATIONS_*`
  problem, but Alpaca paper keys are present. Treat as a separate
  migration once the Kalshi side is stable.
