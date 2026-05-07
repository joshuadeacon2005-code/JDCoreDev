# Trading Routine Architecture

> Discovery doc for JDCoreDev W3 — Phase 3 output. This contract dictates the install pattern for Phases 4, 5, 6.

## Overview

JDCoreDev runs two production trading agents: a **Trader** (Alpaca US-stocks, swing mode) and a **Predictor** (Kalshi prediction markets, with optional Polymarket). Both follow the same pattern: an **Anthropic-hosted Claude Code routine** is the brain, and a thin Express API on the JDCoreDev server is the hands. The routine is fired on a cron — every 4h Mon–Fri for the trader (`server/trader-agent.ts:113-123`), every 2h for the predictor — using `POST https://api.anthropic.com/v1/claude_code/routines/{id}/fire` with a per-routine bearer token (`server/trader-agent.ts:419-451`, `server/predictor-agent.ts:374-410`). Each fire calls `GET /agent/state` to read the world, decides in-context, and `POSTs /agent/decisions`; the server validates against hard constraints, executes survivors against Alpaca/Kalshi/Polymarket, and writes the run to Postgres. Josh also fires routines on demand via "Run Now" buttons on the admin dashboard. There are **no scheduled cron jobs on the server, no Claude SDK calls on the server hot path, and no project-level Claude Code skills** — the routine prompts are documented Markdown files in `docs/` that the routine bootstrap reads and follows.

## Existing Skills / Prompts / Configs / Scripts

**Server-side routers (the "hands"):**
- `server/trader.ts` (1647 lines) — Alpaca request helpers (`alpacaReq`, `alpacaDataReq`, `getAlpacaEnvKeys` at lines 216-239, 254-263, 722-733), legacy cron + Claude API pipeline (deprecated), `/api/trader/*` admin endpoints (history, settings, market-signals, stock-bars, alpaca-proxy, alpaca-data-proxy, run-summaries, agent-activity, claude pass-through). Mounted at `server/routes.ts:896`.
- `server/trader-agent.ts` (484 lines) — the routine contract: `GET /agent/state`, `POST /agent/decisions`, `GET /agent/ping`, `POST /agent/run`. Mounted at `/api/trader/agent` in `server/routes.ts:899`.
- `server/predictor.ts` (3108 lines) — Kalshi RSA-signed order placement (`kalshiReq`, `getKalshiKeys`), Polymarket CLOB client (`getPolyClobClient`), council-debate scaffolding (legacy, broken modelfarm Claude calls), table init for `predictor_*` tables (lines 110-200). Mounted at `server/routes.ts:903`.
- `server/predictor-agent.ts` (598 lines) — predictor routine contract: `GET /agent/state`, `POST /agent/decisions`, `GET /agent/ping`, `firePredictorRoutine` exported and mounted on app at `server/routes.ts:1221` behind `requireAdmin`. Routes mounted at `/api/predictor/agent` (line 906).
- `server/arbitrage.ts`, `server/crypto-arb.ts` — orphan files, not mounted, marked for deletion per `trading-fleet-scheduled-tasks.md:17-19`.

**Routine prompts (the "brain"):**
- `docs/ROUTINE_PROMPT_TRADER.md` — the swing-trader routine reads this file from `main` on each fire and follows it. Strategy mandate is small/mid-cap catalyst plays in the $500M–$10B band.
- `docs/ROUTINE_PROMPT_PREDICTOR.md` — Kalshi/Polymarket routine prompt; primary objective stated as "MAXIMIZE RETURN ON CAPITAL", biases toward cheap-entry high-multiple short-dated bets.
- `docs/ROUTINE_PROMPT_EXPENSE_SCANNER.md`, `docs/ROUTINE_PROMPT_LEAD_ENGINE.md` — non-trading routines, listed for completeness.
- `docs/trader-routines.md` — operational reference: setup steps, cron expressions, what gets stored where, paper→live flip procedure.
- `predictor-scheduled-task.md` (repo root) — pre-migration design doc for the predictor routine.
- `trading-fleet-scheduled-tasks.md` (repo root) — operational reference for the trader routine, mirrors `docs/trader-routines.md` content.

**Helper scripts:**
- `scripts/check-kalshi-bets.mjs` — Postgres pool query reporting recent kalshi bets, status breakdown, settled-bet P&L.
- `scripts/poly-bootstrap.ts` — Polymarket onboarding helper.
- (Other scripts in `scripts/` are non-trading: dev-log/invoice utilities.)

**Coordination notes:**
- `.agents/TASK.md`, `.agents/claude-notes.md`, `.agents/codex-notes.md`, `.agents/review-requests.md` — Claude/Codex handoff notes documenting the trader→predictor migration. `claude-notes.md:5-32` is the most recent trader-routine handoff.

**Project-level Claude Code skills:**
- **None.** No `.claude/skills/` directory exists in the project. No `SKILL.md` files anywhere in the tree. All "skills" are Anthropic-hosted routine prompts (markdown) plus user-level skills in `~/.claude/skills/` (none of which are trading-specific — they are GSD/context-mode/general-purpose).

## Alpaca Integration

**How:** Direct REST calls from the JDCoreDev Express server using `fetch()`. **No `@alpacahq/*` SDK** (`package.json` confirms — only `@polymarket/clob-client` is present). **No MCP wrapper.** **No Claude Code skill.** The routine never sees an Alpaca key or talks to Alpaca directly — it goes through the JDCoreDev API.

**Where:** `server/trader.ts:214-263` defines the helpers:
```
ALPACA = { paper: 'https://paper-api.alpaca.markets',
           live:  'https://api.alpaca.markets',
           data:  'https://data.alpaca.markets' }
alpacaReq(keys, path, method, body)         // line 222
alpacaDataReq(keys, path)                    // line 254
getAlpacaEnvKeys(isPaper)                    // line 722
```
Auth headers used: `APCA-API-KEY-ID` and `APCA-API-SECRET-KEY` (`server/trader.ts:228-229`). The `trader-agent.ts` router imports these helpers (`server/trader-agent.ts:19-23`) and is the sole consumer on the routine path.

**Auth env vars** (resolved by `getAlpacaEnvKeys` at `server/trader.ts:722-733`):
- Paper: `CRON_ALPACA_KEY_PAPER` / `CRON_ALPACA_SECRET_PAPER`, falling back to legacy `CRON_ALPACA_KEY` / `CRON_ALPACA_SECRET`.
- Live: `CRON_ALPACA_KEY_LIVE` / `CRON_ALPACA_SECRET_LIVE` — required explicitly, no fallback to paper keys.
- Mode toggle: `trader_settings.alpaca_paper` row (DB), falling back to env `CRON_ALPACA_PAPER` (`server/trader-agent.ts:58-65`).

**Routine-side auth** to the JDCoreDev API: `x-jdcd-agent-key` header validated against `JDCD_AGENT_KEY` env var (`server/trader-agent.ts:28-38`, same shared secret on `predictor-agent.ts:31-41`).

**Routine-fire auth:** `CLAUDE_ROUTINE_TRADER_TOKEN` + `CLAUDE_ROUTINE_TRADER_ID` (default `trig_01RdmE8PHaQyfruhHQeheDDb`); `CLAUDE_ROUTINE_PREDICTOR_TOKEN` + `CLAUDE_ROUTINE_PREDICTOR_ID` (`server/trader-agent.ts:422-432`, `server/predictor-agent.ts:377-387`). Beta header: `anthropic-beta: experimental-cc-routine-2026-04-01`.

## Persistence

All trading state lives in **Postgres**, but **not in `shared/schema.ts`** (Drizzle) — tables are created via raw `pool.query("CREATE TABLE IF NOT EXISTS …")` inside `initTraderTables` and `initPredictorTables`. Drizzle does not own these tables.

**Trader tables** (`server/trader.ts:21-97`):
- `trader_settings` (key/value) — `cron_enabled`, `cron_risk` ("low|medium|high"), `cron_mode`, `alpaca_paper`, intervals.
- `trader_chat` — admin-page chat history per mode.
- `trader_trades` (id, symbol, side, qty, notional, price, status, rationale, risk, mode, order_id, **pnl**, **executed_at**, logged_at) — every executed Alpaca order, written by `trader-agent.ts:318-330`.
- `trader_logs` (message, type, logged_at) — operational log stream.
- `trader_snapshots` (equity, buying_power, pnl_day, positions_count, logged_at) — post-run account snapshot, written by `trader-agent.ts:346-356`. Drives 7-day drawdown calc in `compute7dDrawdownPct` (line 67).
- `trader_pipelines` (risk, mode, positions_count, ter, thesis, pass, score, **decision_source** ['legacy-cron'|'agent-routine'], **decisions_json**, **executed_status**, **positions_json**, screened/analysis/validation_json, logged_at) — every routine run lands here, written at `trader-agent.ts:364-381`.

**Predictor tables** (`server/predictor.ts:110-200`):
- `predictor_settings` (key/value) — `cron_enabled`, `min_edge`, `max_bet_usd`, `poly_max_bet_usd`, `max_positions`, `kelly_fraction`, `mode` ("demo|live"), `time_horizon_days`, `poly_enabled`, etc.
- `predictor_bets` (id, market_ticker, market_title, side, contracts, price, cost, confidence, edge, council_verdict, council_transcript JSONB, status, order_id, pnl, settled_at, **platform** ['kalshi'|'polymarket'], outcome, cost_usd, close_time, logged_at) — every placed bet, written by `predictor-agent.ts:506-517` (Kalshi) and `:583-594` (Polymarket).
- `predictor_scans` (markets_scanned, candidates_found, bets_placed, analyzed_tickers, rounds, result_summary, scan_json JSONB, logged_at) — one row per routine fire, including no-op fires.
- `predictor_logs` (message, type, logged_at) — operational log stream.
- `predictor_chat` — admin-page chat.
- `predictor_councils` (market_ticker, market_title, our_probability, market_probability, edge, verdict, confidence, transcript JSONB, platform, logged_at) — debate transcripts (now mostly populated as `{source: "agent-routine", rationale: ...}` per `predictor-agent.ts:526-528` since the routine holds the full debate in its own context).

**No file outputs, no in-memory state, no Drizzle migrations** for any of the above. Only `migrations/0008_project_parent.sql` and earlier are Drizzle-managed and they cover unrelated billing/leads schemas.

## Dashboard Surface

All admin pages are mounted in `client/src/App.tsx:100-108` under `/admin/trader/*`. Every endpoint they hit lives in `server/trader.ts` or `server/predictor.ts`.

| Page | File | Backend endpoint(s) | Source query |
|---|---|---|---|
| `/admin/trader` (entry hub) | `client/src/pages/admin/trader.tsx` | `/api/trader/history?type=trades`, `/api/trader/alpaca-config`, `/api/trader/alpaca-paper`, `/api/trader/alpaca-proxy`, `/api/trader/alpaca-data-proxy`, `/api/trader/claude`, `/api/trader/agent/run`, `/api/predictor/risk-profile` | `trader_trades`, Alpaca live calls, env config |
| `/admin/trader/runs` | `trader-runs.tsx:424` | `/api/trader/run-summaries?limit=60&mode={swing}` (`server/trader.ts:975`) | `trader_pipelines` aggregated by mode |
| `/admin/trader/analytics` | `trader-analytics.tsx:263-264, 284` | `/api/trader/history?type=trades&limit=500`, `/api/trader/history?type=pipelines`, `/api/trader/sync-pnl` | `trader_trades`, `trader_pipelines`, Alpaca FILL activities (sync-pnl backfills `pnl` column from `/v2/account/activities/FILL`, `server/trader.ts:146`) |
| `/admin/trader/performance` | `trader-performance.tsx:115-117, 138` | `/api/trader/history?type=snapshots&days=N`, `?type=trades`, `?type=pipelines`, `/api/trader/sync-pnl` | `trader_snapshots`, `trader_trades`, `trader_pipelines` |
| `/admin/trader/chat` | `trader-chat.tsx:160-210` | `/api/trader/chat?mode=…`, `/api/trader/chat/execute-task` | `trader_chat` |
| `/admin/trader/settings` | `trader-settings.tsx:57-101` | `/api/trader/health`, `/api/trader/settings` (GET/POST), `/api/trader/cron/run`, `/api/trader/history?type=logs`, `/api/trader/notify` | `trader_settings`, `trader_logs`, env health |
| `/admin/trader/backtest` | `trader-backtest.tsx:103` | `/api/trader/claude` | Claude API pass-through (legacy) |
| `/admin/trader/watchlist` | `trader-watchlist.tsx:61-169` | `/api/trader/stock-bars/{TICKER}?limit=30`, `/api/trader/market-signals?mode=day`, `/api/trader/insider-trades?chamber={house\|senate}` | Alpaca data API + scraped Yahoo screeners + Quiver/Capitol Trades insider data |
| `/admin/trader/predictions` | `trader-predictions.tsx` (~2400 lines) | `/api/predictor/portfolio`, `/poly-balance`, `/stats`, `/settings`, `/history?type=bets`, `/history?type=councils`, `/runs`, `/check-resolutions`, `/sync-orders`, `/bets` (DELETE), `/bets/:id` (DELETE), `/research-trader`, `/chat`, `/scan`, `/run-crypto`, `/agent/run` | All `predictor_*` tables + Kalshi/Polymarket live calls |
| `/admin/dashboard` | `dashboard.tsx:148` | `/api/trader/agent-activity` (`server/trader.ts:1084`) | Recent `trader_pipelines` rows for the dashboard widget |

API-contract shape for the canonical state endpoint (`/api/trader/agent/state`, `server/trader-agent.ts:121-182`):
```
{ mode: "swing", isPaper: bool, generatedAt, constraints, account,
  positions[], drawdown7dPct, equityHistory[], recentDecisions[],
  recentTrades[], currentRisk, marketHints }
```
Same shape pattern for `/api/predictor/agent/state` (`server/predictor-agent.ts:136-163`).

## Install Pattern Decision

**Decision: Project-level Claude Code skill (`.claude/skills/<name>/SKILL.md` checked into the repo) + thin Express endpoint behind `x-jdcd-agent-key` whenever server-side state, secrets, or live-API auth is involved.**

The skill is the routine-side wrapper; the Express endpoint is where any real runtime work happens — same split as Alpaca and Kalshi use today. "Skill" is half the pattern, not the whole answer.

**Rationale:** The existing trading routines are **not Claude Code skills and not MCP servers**. They are **Anthropic-hosted scheduled routines** whose prompt is a Markdown file checked into the repo at `docs/ROUTINE_PROMPT_TRADER.md` and `docs/ROUTINE_PROMPT_PREDICTOR.md`. On each fire the routine reads its prompt from `main` and follows it; reasoning and tool use happen inside the Anthropic-hosted environment, while every actual side effect (place an Alpaca order, sign a Kalshi RSA order, write to Postgres) is a `fetch` to a JDCoreDev Express endpoint behind `x-jdcd-agent-key`. There is no MCP server in the picture, and no `.claude/skills/` directory exists yet.

Two consequences for new tooling:

1. **Skills must be project-level (`.claude/skills/<name>/SKILL.md` checked into the JDCoreDev repo), not user-level (`~/.claude/skills/`).** The routine prompts that invoke them are already in-repo (`docs/ROUTINE_PROMPT_*.md`); the skills wrap JDCoreDev-specific endpoints and tables (`trader_*`, `predictor_*`); they need to ship and version with the code that calls them. User-level skills would split the contract across two repos and break the "no parallel pattern" constraint.
2. **An MCP server is the wrong shape.** It would force a long-running process registered in `mcpServers`, with its own auth and secrets, sitting outside the JDCoreDev runtime — a parallel pattern that contradicts the existing "routine prompt + Express endpoint" split and forks the install model across Phases 4/5/6 (PROJECT.md constraint forbids this).

Where a primitive needs server-side state, secrets, or live-API auth (Camoufox session reuse, third-party data API keys not visible to the routine, anything signing or hitting an authenticated venue), the second half of the pattern kicks in: add a thin endpoint to the JDCoreDev Express API behind `x-jdcd-agent-key`, identical to how `trader-agent.ts` and `predictor-agent.ts` are wired today. The project-level skill is then a thin client over that endpoint.

## Implications for W3 Phases

### Phase 4 — Camoufox stealth scraping

Install as a **project-level Claude Code skill** at `.claude/skills/camoufox-fetch/SKILL.md` (checked into the JDCoreDev repo) that exposes a `fetch_stealth(url)` primitive. Because Camoufox needs a real browser runtime (Playwright/Firefox), the actual scraping happens in a thin Express endpoint — add `POST /api/trader/scrape` to `server/trader-agent.ts` (or a new `server/scrape-agent.ts` mounted at `/api/trader/scrape` alongside it in `server/routes.ts`) gated by `x-jdcd-agent-key`. Skill is the routine-side wrapper; the endpoint is the runtime. Skill output is source-attributed text the routine passes into its council debate. Default Paper read-only (TRADE-MODE-01).

### Phase 5 — External financial data layer (Yahoo + AlphaVantage + FRED)

Same pattern: project-level skill at `.claude/skills/financial-data/SKILL.md` + Express endpoint at `server/financial-data-agent.ts` mounted at `/api/trader/data` behind `x-jdcd-agent-key`. The endpoint holds the AlphaVantage and FRED API keys in Railway env (`ALPHA_VANTAGE_API_KEY`, `FRED_API_KEY`); Yahoo needs no key (the `yahoo-finance2` npm library calls Yahoo's public endpoints directly). Routes: ticker-bound `:dataset/:ticker` covering `fundamentals` (yahoo via `quoteSummary` modules — income/balance/cashflow/financialData/defaultKeyStatistics), `news` (alphavantage via `NEWS_SENTIMENT`), `prices_eod` (yahoo via `historical`); FRED macro time-series (`/macro/:series_id`); FRED series search (`/macro_search?q=...`). Skill returns source-tagged blocks with explicit `provider` (`yahoo`, `alphavantage`, or `fred`) + `dataset` so attribution survives into the routine's research output. Toggle via `EXTERNAL_DATA_ENABLED` env (single switch gates all three providers) or `?enabled=false` per request; default ON for Paper, opt-in for Live (ROADMAP.md Phase 5 acceptance criterion 4). REST/Node-native only — Railway nixpacks runtime is bare Node, so no Python subprocess fallback. Originally shipped 2026-05-07 against EODHD ($19.99/mo) + FRED; rescoped same day to the free stack (yahoo-finance2 + AlphaVantage free tier + FRED) per user cost decision.

### Phase 6 — AutoHedge agent patterns

Port the AutoHedge **Director / Quant / Risk / Execution** roles into four **project-level Claude Code skills** at `.claude/skills/autohedge-{director,quant,risk,execution}/SKILL.md` with schema-validated outputs (JSON-schema referenced from each skill). **No Python/Node runtime, no AutoHedge npm/pip dependency, no scheduled process** — the routines invoke these skills inside their reasoning loop, exactly like any other Claude Code skill. No new Express endpoints required: skill outputs must be JSON shapes the existing `/api/{trader,predictor}/agent/decisions` endpoints already accept (see `server/trader-agent.ts:191-201` and `server/predictor-agent.ts:171-209` for the validated shapes).

## Standing Constraints (from PROJECT.md)
- TRADE-MODE-01: every new W3 code path defaults to Paper mode
- TRADE-MODE-02: Live mode requires an explicit confirmation gate visible in the routine prompt
- AutoHedge is patterns only, NOT a Python runtime/framework dependency

---
*Generated by Phase 3 discovery. Closes TRADE-DISC-01 and TRADE-DISC-02.*
