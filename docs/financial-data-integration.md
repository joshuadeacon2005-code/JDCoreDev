# Financial data integration — Yahoo + AlphaVantage + FRED

**Status:** Merge-ready. The `/api/trader/data/*` endpoint and `financial-data` skill ship with this PR. **Live runtime verification (TRADE-FIN-05) is gated on user-action key provisioning** — `ALPHA_VANTAGE_API_KEY` (free, no card — `https://www.alphavantage.co/support/#api-key`) and `FRED_API_KEY` (free FRED account) must be set on Railway env before the corresponding provider's branches return non-503 responses. Yahoo branches need no key — `yahoo-finance2` is keyless. Until both AlphaVantage and FRED keys are set, the corresponding provider's calls return 503 with a setup hint. This is by design (D-09 + Phase 5 deferred user-action note).

Phase 5 of W3 wires an external financial data layer into the JDCoreDev trading routines. A single project-level Claude Code skill (`financial-data`) wraps three providers — Yahoo (equity fundamentals + EOD prices via the `yahoo-finance2` npm library), AlphaVantage (news with sentiment via the `NEWS_SENTIMENT` REST endpoint), and FRED (US macro time-series + series search) — behind one Express endpoint mounted at `/api/trader/data`. Every response carries explicit `provider` + `dataset` attribution so externally-sourced numbers in the routine's research output stay auditable. Closes TRADE-FIN-06.

**Rescope history:** Originally shipped against EODHD ($19.99/mo) + FRED. Rescoped on 2026-05-07 to a free stack — `yahoo-finance2` (no key) replaces EODHD for fundamentals + EOD prices; AlphaVantage free tier replaces EODHD for news; FRED unchanged. Runtime, envelope, toggle layers, and route shapes preserved.

## 1. Install pattern

Per the install-pattern decision (**D-01**) locked in Phase 3 — see [`docs/trading-routine-architecture.md`](./trading-routine-architecture.md), "Install Pattern Decision" + "Phase 5" sections — every external runtime in this repo rides the same shape: a project-level Claude Code skill paired with a thin Express endpoint behind `x-jdcd-agent-key`. Phase 5 follows that pattern verbatim. No MCP server, no user-level skill, no parallel runtime.

| Half | Path |
|---|---|
| Skill (routine-side wrapper) | `.claude/skills/financial-data/SKILL.md` |
| Endpoint (server runtime that holds the API keys) | `server/financial-data-agent.ts` |
| Mount | `server/routes.ts` line 934 — `app.use("/api/trader/data", financialDataAgentRouter)` |

Mount order is load-bearing — the agent router registers BEFORE the `requireAdmin`-gated `/api/trader` mount so route matching falls through to `requireAgentKey` rather than 401-ing on the admin session check (matches scrape-agent / trader-agent / predictor-agent precedent).

The skill is the routine-side primitive; the endpoint is the server-side runtime. All three providers ride the same skill and the same endpoint — one surface, three providers behind it (**D-02** — name `financial-data` is provider-agnostic precisely so vendor swaps like the EODHD→Yahoo+AlphaVantage rescope don't force a rename).

## 2. Env vars

| Var | Required | Default | Purpose |
|---|---|---|---|
| `JDCD_AGENT_KEY` | yes | (none) | Shared secret for the `x-jdcd-agent-key` header. Same value the trader-agent, predictor-agent, and scrape-agent routers use. |
| `ALPHA_VANTAGE_API_KEY` | yes (for `news`) | (none) | Free AlphaVantage API key from `https://www.alphavantage.co/support/#api-key` (no credit card required). Without it, the `news` dataset branch returns 503 with a setup hint. **Must be set on Railway before any AlphaVantage call.** Free-tier limits: 500 calls/day, 5/min. |
| `FRED_API_KEY` | yes (for FRED calls) | (none) | Free FRED API key from `https://fred.stlouisfed.org/docs/api/api_key.html`. Without it, FRED branches (`macro_series`, `macro_search`) return 503. **Must be set on Railway before any FRED call.** |
| `EXTERNAL_DATA_ENABLED` | no | `true` | Global kill-switch — gates ALL THREE providers (single switch, no per-provider variant in v1). Set to `false` to disable all external data calls; the endpoint then returns 503 except `/ping`, which deliberately bypasses the gate so operators can introspect state regardless. Useful for cost control or temporary maintenance. |

**No key needed for Yahoo.** The `fundamentals` and `prices_eod` datasets are served by the `yahoo-finance2` npm library, which calls Yahoo's public endpoints directly — no credentials required. The toggle gate still applies (global kill-switch + per-request opt-out), but layer 3 (per-provider key check) is skipped for Yahoo branches.

The endpoint backs onto Node's built-in `fetch` (for AlphaVantage and FRED) and the `yahoo-finance2` library (for Yahoo). One new top-level npm dependency: `yahoo-finance2`. REST/Node-native only — Railway's nixpacks runtime is bare Node (`nodejs_24, npm-9_x, openssl, caddy`), so there is no subprocess fallback path (**D-09**).

## 3. Accessor reference

Five datasets across three providers, exactly mirroring `EXTERNAL_DATASETS` in [`server/financial-data-agent.ts`](../server/financial-data-agent.ts) (**D-07**). The skill's `## Datasets` table in [`.claude/skills/financial-data/SKILL.md`](../.claude/skills/financial-data/SKILL.md) carries the same five rows — keep all three in sync if any new dataset lands.

| Accessor | Route | Provider | Param semantics | Implementation | `data` shape |
|---|---|---|---|---|---|
| `fundamentals` | `GET /api/trader/data/fundamentals/:ticker` | `yahoo` | Stock symbol (`AAPL`, `MSFT`, ...). `[A-Z0-9.\-]{1,12}` enforced. | `yahoo-finance2.quoteSummary(ticker, { modules: ['incomeStatementHistory', 'balanceSheetHistory', 'cashflowStatementHistory', 'financialData', 'defaultKeyStatistics'] })` | `{ incomeStatementHistory, balanceSheetHistory, cashflowStatementHistory, financialData, defaultKeyStatistics }` (yahoo-finance2 module shapes). |
| `news` | `GET /api/trader/data/news/:ticker` | `alphavantage` | Stock symbol. Whitelisted query passthrough: `time_from`, `time_to`, `limit`, `sort`, `topics`. | `GET https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers={TICKER}&apikey={KEY}` | `{ articles: [{ title, url, time_published, source, summary, overall_sentiment_score, overall_sentiment_label, ticker_sentiment, ... }] }` |
| `prices_eod` | `GET /api/trader/data/prices_eod/:ticker` | `yahoo` | Stock symbol. Whitelisted query passthrough: `from`, `to` (ISO dates). | `yahoo-finance2.historical(ticker, { period1, period2, interval: '1d' })` | `{ ohlcv: [{ date, open, high, low, close, adjClose, volume }] }` |
| `macro_series` | `GET /api/trader/data/macro/:series_id` | `fred` | FRED series ID (`DGS10`, `CPIAUCSL`, `UNRATE`, `GDP`, `M2SL`, ...). `[A-Z0-9_]{1,40}` enforced. Whitelisted passthrough: `observation_start`, `observation_end`, `units`, `frequency`, `aggregation_method`, `limit`, `offset`, `sort_order`. | `GET https://api.stlouisfed.org/fred/series/observations?series_id=...&api_key=...&file_type=json` | `{ observations: [{ date, value, ... }], meta: { count, observation_start, observation_end, units, frequency, ... } }` |
| `macro_search` | `GET /api/trader/data/macro_search?q=<text>` | `fred` | Free-text query, length ≤ 200. Use this to look up unknown FRED series IDs before calling `macro_series`. | `GET https://api.stlouisfed.org/fred/series/search?search_text=...&api_key=...&file_type=json` | `{ matches: [{ id, title, ... }], meta: { count, offset, limit } }` |

A sixth route, `GET /api/trader/data/ping`, returns endpoint health + per-provider availability/key flags + the dataset registry. It deliberately bypasses the toggle gate so operators can introspect state when `EXTERNAL_DATA_ENABLED=false`. Shape: `{ ok, enabled, yahoo: { available: true }, alphavantage: { key_configured }, fred: { key_configured }, datasets }`.

## 4. Toggle mechanism

Three layers, evaluated in this order — ordering is load-bearing (**D-05**):

1. **Global env kill-switch.** `EXTERNAL_DATA_ENABLED=false` on Railway → every dataset route returns 503 with `{ error: "external data disabled globally via EXTERNAL_DATA_ENABLED=false" }`. Single switch covers all three providers. `/ping` is exempt so operators can still see the disabled state.
2. **Per-request opt-out.** `?enabled=false` on any dataset route → 200 `{ skipped: true, reason: "disabled-per-request" }`. Evaluated BEFORE the per-provider key check so a routine can probe endpoint shape without keys provisioned (this is the verification surface for the deferred TRADE-FIN-05 test).
3. **Per-provider key check.** If the request reaches an AlphaVantage branch and `ALPHA_VANTAGE_API_KEY` is unset, or a FRED branch and `FRED_API_KEY` is unset → 503 with a provider-specific hint pointing at where to provision the key. **Yahoo branches skip this layer** — `yahoo-finance2` requires no key, so `fundamentals` and `prices_eod` always reach the upstream call once layers 1+2 pass.

**Mode-aware default lives at the routine-prompt layer, not in the endpoint** (**D-06**). The endpoint itself is mode-agnostic — these are read-only data calls and never cause a Live trade. The routine prompt receives a `mode` field via `/api/trader/agent/state` and conditions financial-data calls on `mode === "paper"` (default ON) or explicit `LIVE_MODE_AUTHORIZED=true` for Live runs. Mode-safety enforcement is downstream in the AutoHedge Execution skill (already shipped in Phase 6), exactly the same pattern as Camoufox.

## 5. Source attribution

Every success response — across all 5 datasets, all three providers — emits the same envelope (**D-04**):

```json
{
  "provider": "yahoo" | "alphavantage" | "fred",
  "dataset":  "fundamentals" | "news" | "prices_eod" | "macro_series" | "macro_search",
  "ticker_or_series": "<TICKER>|<SERIES_ID>|null",
  "fetched_at": "<ISO-8601 UTC>",
  "source_url": "<upstream URL with apikey / api_key stripped>",
  "data": { ... }
}
```

`provider` is an explicit field — load-bearing because three providers share one endpoint surface, and routines must be able to attribute every externally-sourced number downstream (TRADE-FIN-03 + Phase 5 success criterion #3). `ticker_or_series` is `null` for `macro_search` (no specific series queried). `source_url` is the upstream URL with secrets stripped (AlphaVantage `apikey`, FRED `api_key`), so routines can quote it in research output without leaking the key. For Yahoo branches, `source_url` is a stable Yahoo URL synthesised from the call (e.g. `https://finance.yahoo.com/quote/{TICKER}` for fundamentals) — `yahoo-finance2` doesn't expose the underlying URL it hits, but a public Yahoo equivalent is provided so the routine can still cite a source.

Every success path flows through `respondFromFetch → dataEnvelope` (HTTP-fetch branches) or directly through `dataEnvelope` (yahoo-finance2 branches). There are zero code paths where upstream data reaches the HTTP boundary unwrapped.

## 6. Example invocations

All examples hit the local Express endpoint, NOT the upstream providers directly. Routines never see API keys — those live in Railway env and only the endpoint touches them. Replace `$JDCD_AGENT_KEY` with the value from your local shell (same secret used by the other agent routers). For local development, swap `https://www.jdcoredev.com` for `http://localhost:5000`.

### 6.1 Yahoo — fundamentals on AAPL

```bash
curl -s -H "x-jdcd-agent-key: $JDCD_AGENT_KEY" \
  "https://www.jdcoredev.com/api/trader/data/fundamentals/AAPL"
```

Expected response (abridged — yahoo-finance2 returns a large nested structure across the requested modules):

```json
{
  "provider": "yahoo",
  "dataset": "fundamentals",
  "ticker_or_series": "AAPL",
  "fetched_at": "2026-05-07T14:32:11.482Z",
  "source_url": "https://finance.yahoo.com/quote/AAPL",
  "data": {
    "incomeStatementHistory": { "incomeStatementHistory": [ { "endDate": { "raw": 1727654400 }, "totalRevenue": { "raw": 391035000000 }, "grossProfit": { "raw": 180683000000 }, "...": "..." } ] },
    "balanceSheetHistory":     { "balanceSheetStatements": [ { "endDate": { "raw": 1727654400 }, "totalAssets": { "raw": 364980000000 }, "...": "..." } ] },
    "cashflowStatementHistory":{ "cashflowStatements":     [ { "endDate": { "raw": 1727654400 }, "totalCashFromOperatingActivities": { "raw": 118254000000 }, "...": "..." } ] },
    "financialData":           { "currentPrice": { "raw": 178.42 }, "targetMeanPrice": { "raw": 195.30 }, "recommendationKey": "buy", "...": "..." },
    "defaultKeyStatistics":    { "marketCap": { "raw": 2780000000000 }, "trailingPE": { "raw": 28.4 }, "...": "..." }
  }
}
```

No API key needed — `yahoo-finance2` calls Yahoo's public endpoints directly.

### 6.2 FRED — 10-year Treasury yield (`DGS10`)

```bash
curl -s -H "x-jdcd-agent-key: $JDCD_AGENT_KEY" \
  "https://www.jdcoredev.com/api/trader/data/macro/DGS10?observation_start=2026-01-01&limit=5"
```

Expected response:

```json
{
  "provider": "fred",
  "dataset": "macro_series",
  "ticker_or_series": "DGS10",
  "fetched_at": "2026-05-07T14:33:02.117Z",
  "source_url": "https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&file_type=json&observation_start=2026-01-01&limit=5",
  "data": {
    "observations": [
      { "date": "2026-01-02", "value": "4.21" },
      { "date": "2026-01-03", "value": "4.18" },
      { "date": "2026-01-06", "value": "4.23" },
      { "date": "2026-01-07", "value": "4.27" },
      { "date": "2026-01-08", "value": "4.25" }
    ],
    "meta": {
      "count": 5,
      "offset": 0,
      "limit": 5,
      "units": "Percent",
      "frequency": "Daily",
      "observation_start": "2026-01-01",
      "observation_end": "9999-12-31"
    }
  }
}
```

The `source_url` has `api_key` stripped — the routine can quote it without leaking the FRED key.

### 6.3 AlphaVantage — news with sentiment for AAPL

```bash
curl -s -H "x-jdcd-agent-key: $JDCD_AGENT_KEY" \
  "https://www.jdcoredev.com/api/trader/data/news/AAPL?limit=3"
```

Expected response (abridged):

```json
{
  "provider": "alphavantage",
  "dataset": "news",
  "ticker_or_series": "AAPL",
  "fetched_at": "2026-05-07T14:34:19.882Z",
  "source_url": "https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=AAPL&limit=3",
  "data": {
    "articles": [
      {
        "title": "Apple Q4 results beat on services revenue",
        "url": "https://example.com/aapl-q4",
        "time_published": "20260507T120000",
        "source": "Reuters",
        "summary": "Apple posted Q4 services revenue of $24.5B...",
        "overall_sentiment_score": 0.21,
        "overall_sentiment_label": "Somewhat-Bullish",
        "ticker_sentiment": [{ "ticker": "AAPL", "ticker_sentiment_score": 0.34, "ticker_sentiment_label": "Bullish" }]
      }
    ]
  }
}
```

The `source_url` has `apikey` stripped. **AlphaVantage free-tier limits: 500 calls/day, 5/min.** Honor these in routine retry logic — the endpoint passes 429s through verbatim.

### 6.4 Per-request opt-out

Use this to probe endpoint shape without consuming the upstream quota (or before the API keys exist on Railway):

```bash
curl -s -H "x-jdcd-agent-key: $JDCD_AGENT_KEY" \
  "https://www.jdcoredev.com/api/trader/data/fundamentals/AAPL?enabled=false"
```

Returns:

```json
{ "skipped": true, "reason": "disabled-per-request" }
```

Same skip envelope across every dataset route. The 200 status (not 503) is intentional — `?enabled=false` is a deliberate routine-side decision, not a server failure.

## 7. Routine-prompt wiring

Plan 05-04 wires this skill into the trader routine prompt by adding a one-paragraph reference at **[`docs/ROUTINE_PROMPT_TRADER.md`](./ROUTINE_PROMPT_TRADER.md) Step 3 ("Candidate generation", around line 92)** — the same step that already mentions `/api/trader/market-signals`. The skill becomes another optional research input the council debate (Step 4) can pull on.

This doc does not pre-empt that edit — Plan 05-04 owns the routine-prompt change, and final wiring is a user-action decision per [`.claude/skills/README.md`](../.claude/skills/README.md). The skill is callable from any routine that references it; the predictor routine (Kalshi/Polymarket markets) is unwired in v1 because the equity-focused fundamentals use case fits trader more cleanly. That's a v2 decision.

## 8. Failure modes

The endpoint's failure responses (mirror of the SKILL.md failure table — kept here so this doc is self-contained):

| HTTP | When | Body shape |
|---|---|---|
| 401 | Missing or wrong `x-jdcd-agent-key` header. | `{ error: "unauthorized" }` |
| 400 | Bad ticker (`!TICKER_RE`), bad series ID (`!SERIES_RE`), unknown dataset for the route, missing `q` on `macro_search`, `q` > 200 chars. | `{ error, provided?, allowed?, hint? }` |
| 503 | `JDCD_AGENT_KEY` not set on server, or `EXTERNAL_DATA_ENABLED=false`, or per-provider key (`ALPHA_VANTAGE_API_KEY` for news / `FRED_API_KEY` for macro) not set. | `{ error, hint? }` |
| 200 + `{ skipped: true }` | `?enabled=false` per-request opt-out. | `{ skipped: true, reason: "disabled-per-request" }` |
| 502 | Upstream timeout (20 s), upstream non-2xx (other than 429), Yahoo upstream unreachable. | `{ error, provider, dataset, upstream_status?, upstream_body?, source_url }` |
| 429 | Upstream rate limited the request (most likely AlphaVantage's 5/min free-tier cap). | `{ error, provider, dataset, retry_after?, source_url }` |
| 413 | Upstream response > 5 MB raw body cap. | `{ error, provider, dataset, bytes, limit, source_url }` |
| 500 | Network error reaching upstream (DNS, connection refused, SSRF block, yahoo-finance2 lib error). | `{ error, provider, dataset, detail, source_url }` |

Routines surface these as plain skill failures and continue without the dataset — never retry from inside the endpoint (**D-08**, Camoufox precedent). If retries become necessary, the routine handles them with a cap of 3, identical to how `fetch_stealth` is used today. **AlphaVantage 429s especially: respect `retry_after` if present, otherwise back off ≥ 12 s** to stay under the 5/min free-tier rate limit.

## 9. User-action followup (post-merge)

Phase 5 ships **merge-ready** with no live dependency on the API keys. The `/api/trader/data/*` endpoint, the `financial-data` skill, and this doc all land in this PR. The runtime smoke test on a known ticker (TRADE-FIN-05) is explicitly a deferred user-action followup. Until both AlphaVantage and FRED keys are provisioned, the corresponding provider's calls return 503 — this is the verification surface for the merge, not a bug. Yahoo branches work immediately on deploy because they need no key.

To unblock TRADE-FIN-05 and complete Phase 5 end-to-end:

1. **Register a free AlphaVantage API key** at `https://www.alphavantage.co/support/#api-key`. The form needs name + email + intended-use description ("LLM-driven trading routine research"). Approval is automated and instant — no credit card required. Free tier: 500 calls/day, 5/min.
2. **Register a free FRED API key** at `https://fred.stlouisfed.org/docs/api/api_key.html`. The form needs a brief description of intended use — approval is automated.
3. **Set both env vars on Railway.** Either via the dashboard (Railway → JDCoreDev service → Variables → New Variable) or the CLI:

   ```bash
   railway variables set ALPHA_VANTAGE_API_KEY=<alphavantage-token>
   railway variables set FRED_API_KEY=<fred-key>
   # Optional - only set if you ever need the global kill-switch:
   # railway variables set EXTERNAL_DATA_ENABLED=false
   ```

   Trigger a redeploy if Railway doesn't auto-redeploy on variable change.
4. **Confirm the keys are wired** (no live upstream call yet — `/ping` is gate-exempt and reads `key_configured` straight off `process.env`):

   ```bash
   curl -s -H "x-jdcd-agent-key: $JDCD_AGENT_KEY" \
     "https://www.jdcoredev.com/api/trader/data/ping"
   ```

   Expect `yahoo.available: true` (always), `alphavantage.key_configured: true`, and `fred.key_configured: true`.
5. **Smoke-test against a known ticker + a known FRED series.** A live AAPL fundamentals call (Yahoo — works without keys), a live AAPL news call (AlphaVantage), and a live `DGS10` series call against a freshly-deployed Railway env are the canonical TRADE-FIN-05 verification. Run examples 6.1, 6.2, and 6.3 above; expect non-503 responses with populated `data` blocks. Mind the AlphaVantage 5/min limit when running multiple tests back-to-back.
6. **Fire the trader routine and confirm research output cites at least one Yahoo-, AlphaVantage-, or FRED-sourced block** with `provider` + `dataset` attribution intact (Phase 5 success criterion #3).

Until both AlphaVantage and FRED keys are set on Railway, the corresponding provider's calls return 503. **This is by design** — the endpoint is merge-ready before either account exists, so Phase 5 lands as planning-and-code-complete now and the runtime verification follows on the user's schedule. Yahoo works on deploy without any provisioning.

## 10. Decision references

This doc materially depends on the locked decisions in [`.planning/phases/05-external-financial-data-layer/05-CONTEXT.md`](../.planning/phases/05-external-financial-data-layer/05-CONTEXT.md). Decision IDs cited inline above:

- **D-01** — install pattern: project-level skill + Express endpoint (§ 1).
- **D-02** — skill name `financial-data`, provider-agnostic (§ 1).
- **D-04** — source-attribution envelope shape (§ 5).
- **D-05** — three-layer toggle (§ 4).
- **D-06** — mode-safety lives at the routine-prompt layer (§ 4).
- **D-07** — five accessors verbatim (§ 3).
- **D-08** — no cache table in v1 (§ 8).
- **D-09** — REST/Node-native only, no subprocess fallback (§ 2).

Phase 5 closes TRADE-FIN-01 through TRADE-FIN-04 (covered by Plans 05-01 and 05-02), TRADE-FIN-06 (this doc), and surfaces TRADE-FIN-05 as the post-merge user-action followup detailed in § 9.
