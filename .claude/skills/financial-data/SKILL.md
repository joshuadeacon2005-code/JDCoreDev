---
name: financial-data
description: Fetch source-attributed financial data for a ticker or macro indicator — Yahoo fundamentals (income statement, balance sheet, cash flow, financial data, key statistics via the yahoo-finance2 quoteSummary modules), AlphaVantage news with sentiment scores via NEWS_SENTIMENT, Yahoo end-of-day prices via yahoo-finance2 historical, FRED macro time-series, and FRED series search — via JDCoreDev's /api/trader/data endpoint family. Every response carries provider (yahoo|alphavantage|fred) + dataset attribution so the routine can cite where each number came from in research output.
---

# financial-data

A routine-callable primitive that wraps JDCoreDev's `/api/trader/data` endpoint
family. Use it when the routine needs source-tagged company fundamentals (Yahoo,
no key required), news with per-article sentiment (AlphaVantage free tier), EOD
prices (Yahoo, fallback / cross-check vs Alpaca), or FRED macro time-series, with
provenance preserved into the research output. Three providers (Yahoo +
AlphaVantage + FRED) live behind ONE skill — the routine sees a single primitive
with a `provider` field on each response. Install pattern (skill + thin Express
endpoint behind `x-jdcd-agent-key`) is locked in
`docs/trading-routine-architecture.md` (D-01).

## When to use this

Reach for `financial-data` when, and only when:

- Research output needs verifiable provenance — a citation like "Yahoo
  fundamentals AAPL 2026-05-07" rather than an unsourced number.
- Fundamentals comparison (income / balance / cashflow + ratios via Yahoo's
  `quoteSummary` modules).
- Macro overlay on an equity thesis (10y Treasury, CPI, M2, UNRATE, ...).
- News + per-article sentiment for a catalyst window (AlphaVantage
  `NEWS_SENTIMENT`).
- Looking up an unknown FRED series ID from a free-text query.

Don't use it for:

- Intra-day price needs — use Alpaca via `/api/trader/stock-bars`.
- Technical indicators — use `/api/trader/market-signals`.
- Non-US macro — out of v1 scope (FRED is St. Louis Fed, US-focused).
- Private / internal targets — endpoint blocks internal IPs.

## Contract

All routes require `x-jdcd-agent-key: <JDCD_AGENT_KEY env value>`. Three shapes:

```
GET /api/trader/data/:dataset/:ticker          (ticker-bound; :dataset ∈ fundamentals|news|prices_eod)
GET /api/trader/data/macro/:series_id          (FRED;  :series_id e.g. DGS10, CPIAUCSL)
GET /api/trader/data/macro_search?q=<text>     (FRED;  free-text series search)
```

Common params: `?enabled=false` (per-request opt-out, all routes); whitelisted
passthroughs per dataset (`time_from`/`time_to`/`limit`/`sort`/`topics` for news,
`from`/`to` for prices_eod, `observation_start`/`observation_end`/`units`/
`frequency`/`limit`/`sort_order` for macro). `apikey` / `api_key` from caller
are dropped — server appends auth itself.

### Successful response (HTTP 200, all routes — D-04 envelope)

```
{
  "provider":         "yahoo" | "alphavantage" | "fred",
  "dataset":          "fundamentals" | "news" | "prices_eod" | "macro_series" | "macro_search",
  "ticker_or_series": "AAPL" | "DGS10" | null,
  "fetched_at":       "2026-05-07T13:24:01.234Z",
  "source_url":       "https://finance.yahoo.com/... | https://www.alphavantage.co/... | https://api.stlouisfed.org/...",
  "data":             { /* provider-shaped payload — see Datasets table */ }
}
```

`ticker_or_series` is `null` for `macro_search`. The `provider` field is
load-bearing — three providers share one surface and the routine must attribute
each datum downstream. `source_url` has `apikey` / `api_key` stripped so
secrets don't leak into routine context.

### Worked example — Yahoo fundamentals (AAPL)

`curl -H "x-jdcd-agent-key: $JDCD_AGENT_KEY" .../api/trader/data/fundamentals/AAPL`
→ envelope with `provider: "yahoo"`, `dataset: "fundamentals"`,
`ticker_or_series: "AAPL"`, `source_url: "https://finance.yahoo.com/quote/AAPL"`,
and `data: { incomeStatementHistory, balanceSheetHistory, cashflowStatementHistory, financialData, defaultKeyStatistics }`
(yahoo-finance2 module shapes — each module returns a nested structure with
historical periods + raw/fmt'd values).

### Worked example — FRED macro_series (10-year Treasury, DGS10)

`curl -H "x-jdcd-agent-key: $JDCD_AGENT_KEY" ".../api/trader/data/macro/DGS10?observation_start=2026-01-01"`
→ envelope with `provider: "fred"`, `dataset: "macro_series"`,
`ticker_or_series: "DGS10"`,
`source_url: "https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&file_type=json&observation_start=2026-01-01"`,
and `data: { observations: [{ date, value }, ...], meta: { count, units, frequency, ... } }`.

### Worked example — AlphaVantage news (AAPL)

`curl -H "x-jdcd-agent-key: $JDCD_AGENT_KEY" ".../api/trader/data/news/AAPL?limit=5"`
→ envelope with `provider: "alphavantage"`, `dataset: "news"`,
`ticker_or_series: "AAPL"`,
`source_url: "https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=AAPL&limit=5"`,
and `data: { articles: [{ title, url, time_published, source, summary, overall_sentiment_score, overall_sentiment_label, ticker_sentiment }] }`.

Per-request opt-out (HTTP 200): `{ "skipped": true, "reason": "disabled-per-request" }`.

## Datasets

| Accessor | Route | Provider | Param | `data` shape | When |
|---|---|---|---|---|---|
| `fundamentals` | `/:dataset/:ticker`   | yahoo        | stock symbol     | `{ incomeStatementHistory, balanceSheetHistory, cashflowStatementHistory, financialData, defaultKeyStatistics }` (yahoo-finance2 module shapes) | Fundamentals comparison |
| `news`         | `/:dataset/:ticker`   | alphavantage | stock symbol     | `{ articles: [{ title, url, time_published, source, summary, overall_sentiment_score, overall_sentiment_label, ticker_sentiment }] }` | Catalyst-window news with per-article sentiment |
| `prices_eod`   | `/:dataset/:ticker`   | yahoo        | stock symbol     | `{ ohlcv: [{ date, open, high, low, close, adjClose, volume }] }` | EOD fallback / cross-check |
| `macro_series` | `/macro/:series_id`   | fred         | FRED series ID   | `{ observations: [{ date, value }], meta: { count, units, frequency, ... } }` | US macro overlay |
| `macro_search` | `/macro_search?q=...` | fred         | free-text query  | `{ matches: [{ id, title, frequency, units, ... }], meta: { count, ... } }` | Look up unknown FRED series ID |

Five accessors match `EXTERNAL_DATASETS` in `server/financial-data-agent.ts`
verbatim. If that registry grows, this table grows with it (D-10 cross-ref).

## Failure responses

| Status | Meaning | Action |
|---|---|---|
| 400 | Unknown dataset / invalid ticker / invalid `series_id` / missing `q` / SSRF blocked | Don't retry; check the registry. |
| 401 | `x-jdcd-agent-key` missing or wrong | Surface error; don't retry from the routine. |
| 413 | Upstream over 5 MB / extracted over 60 KB | Use a more specific dataset / tighter date range. |
| 429 | Upstream provider rate-limited (most likely AlphaVantage's 5/min free-tier cap) | Back off ≥ `retry_after` seconds (or ≥ 12 s if absent for AlphaVantage), retry once. |
| 500 | Network error / 20s timeout / yahoo-finance2 lib error | Retry once with a 30s pause. |
| 502 | Upstream non-2xx — ticker / series not found, plan-tier mismatch, Yahoo unreachable | Don't retry the same input more than 3 times. |
| 503 | `ALPHA_VANTAGE_API_KEY` (for news) / `FRED_API_KEY` (for macro) unset, OR `EXTERNAL_DATA_ENABLED=false` | Surface the `hint` field; don't retry — operator-action territory. |

503 responses include a `hint` telling a future Claude session what to
provision. Forward it; don't paper over it. Yahoo branches don't return 503 for
missing key — they have no key requirement.

## Rules

1. **Cite the source.** When using any field from `data`, cite `provider` +
   `dataset` + `ticker_or_series` (and `fetched_at` where freshness matters).
   This is what makes Phase 5 success criterion #3 hold.
2. **Source attribution is the boundary contract.** Never strip `provider`,
   `dataset`, `ticker_or_series`, or `fetched_at` when forwarding into council
   debate or research notes.
3. **Cap retries at 3** (same as `camoufox-fetch`). Then skip and move on.
4. **Don't double-fetch.** Yahoo `prices_eod` is a fallback / cross-check, not
   primary — Alpaca remains primary for equity prices.
5. **Macro accessors aren't ticker-bound.** For `macro_series` the path
   segment is the FRED series ID and the envelope's `ticker_or_series`
   carries it. For `macro_search`, `ticker_or_series` is `null`.
6. **Yahoo prices are EOD only** (daily bars via `yahoo-finance2.historical(..., { interval: '1d' })`). For intra-day, use Alpaca.
7. **Respect AlphaVantage rate limits.** Free tier is 500 calls/day, 5/min. A
   routine fire that hits `news` for 5+ candidates back-to-back can trip the
   per-minute cap — space them or accept the 429 and skip.
8. **Do not call from outside the trading routines.** Endpoint is gated by
   `x-jdcd-agent-key`; intended for trader (and optionally predictor) prompts.

## Toggle / mode safety

Three layers, evaluated in order on the server (D-05):

1. **Global env kill-switch.** `EXTERNAL_DATA_ENABLED=false` on Railway →
   every route except `/ping` returns 503. ONE switch covers ALL THREE
   providers (including yahoo).
2. **Per-request opt-out.** `?enabled=false` on any route → 200
   `{ skipped: true, reason: "disabled-per-request" }`. Lets the routine
   probe shape without keys provisioned, and selectively skip a call.
3. **Per-provider key check.** `ALPHA_VANTAGE_API_KEY` (news) or `FRED_API_KEY`
   (macro) unset → 503 with setup `hint`. Per-request opt-out is evaluated
   BEFORE this so shape-probing works without keys. **Yahoo branches skip this
   layer entirely** — `yahoo-finance2` needs no key, so `fundamentals` and
   `prices_eod` reach upstream as soon as layers 1+2 pass.

`/api/trader/data/ping` deliberately bypasses the gate — operators must be
able to read `enabled` + per-provider availability/`key_configured` even when
disabled. Shape:

```
{
  "ok": true,
  "enabled": <bool>,
  "yahoo":        { "available": true },
  "alphavantage": { "key_configured": <bool> },
  "fred":         { "key_configured": <bool> },
  "datasets":     [...]
}
```

**Mode-aware default (D-06)** is enforced at the routine prompt, NOT here:

- **Paper mode:** data calls default ON. Plan 05-04 wires the trader routine
  prompt to call this skill on every fire by default.
- **Live mode:** opt-in only. Routine prompt MUST check `mode === "live"`
  in `/api/trader/agent/state` and only invoke when explicitly authorized
  (e.g. `LIVE_MODE_AUTHORIZED=true` for that fire — same shape as the
  AutoHedge Execution gate). The endpoint accepts both modes because data
  calls are read-only; the gate is the prompt's responsibility, matching
  how `camoufox-fetch` is read-only across modes. Plan 05-04 lands the
  trader-prompt wiring.

## Requirement coverage (W3 Phase 5)

- **TRADE-FIN-01**: skill installed at `.claude/skills/financial-data/SKILL.md`
  per D-01 / D-02. One skill covers Yahoo, AlphaVantage, and FRED — single
  install pattern. See `docs/trading-routine-architecture.md` "Install Pattern
  Decision".
- **TRADE-FIN-02**: every accessor documented in `## Datasets` (Yahoo
  `fundamentals` + `prices_eod`, AlphaVantage `news`, FRED `macro_series` +
  `macro_search`). Matches `EXTERNAL_DATASETS` in
  `server/financial-data-agent.ts` exactly.
- **TRADE-FIN-03**: every response carries `provider` + `dataset` +
  `ticker_or_series` + `fetched_at` (D-04 envelope) — see worked examples.
- **TRADE-FIN-04**: toggle layers documented in `## Toggle / mode safety`.
- **TRADE-FIN-05**: deferred user-action — runtime test on a known ticker
  needs `ALPHA_VANTAGE_API_KEY` + `FRED_API_KEY` provisioned on Railway (yahoo
  needs no key). Until then, the 503 setup-hint path is the verification
  surface for AlphaVantage and FRED branches; Yahoo branches work without
  provisioning once deployed.
- **TRADE-FIN-06**: this skill + `docs/financial-data-integration.md`
  (Plan 05-03) close the documentation requirement.
- **TRADE-MODE-01**: Paper-on by default at the routine prompt layer
  (Plan 05-04 wires).
- **TRADE-MODE-02**: Live mode gated behind explicit confirmation flag at the
  routine prompt layer (D-06), mirroring AutoHedge Execution.
