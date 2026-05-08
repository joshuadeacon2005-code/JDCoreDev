# Financial data integration — FMP + AlphaVantage + FRED

**Status:** Merge-ready. The `/api/trader/data/*` endpoint and `financial-data` skill ship with this PR. **Live runtime verification (TRADE-FIN-05) is gated on user-action key provisioning** — `FMP_API_KEY` (free, no card — `https://site.financialmodelingprep.com/developer/docs`), `ALPHA_VANTAGE_API_KEY` (free, no card — `https://www.alphavantage.co/support/#api-key`), and `FRED_API_KEY` (free FRED account) must all be set on Railway env before the corresponding provider's branches return non-503 responses. Until each key is set, that provider's calls return 503 with a setup hint. This is by design (D-09 + Phase 5 deferred user-action note).

Phase 5 of W3 wires an external financial data layer into the JDCoreDev trading routines. A single project-level Claude Code skill (`financial-data`) wraps three providers — FMP (Financial Modeling Prep — equity fundamentals via three statement endpoints + EOD prices via `historical-price-full`), AlphaVantage (news with sentiment via the `NEWS_SENTIMENT` REST endpoint), and FRED (US macro time-series + series search) — behind one Express endpoint mounted at `/api/trader/data`. Every response carries explicit `provider` + `dataset` attribution so externally-sourced numbers in the routine's research output stay auditable. Closes TRADE-FIN-06.

**Rescope history:** Originally shipped against EODHD ($19.99/mo) + FRED on 2026-05-07. Rescoped same day to a free stack for fundamentals + AlphaVantage + FRED. Hot-swapped on 2026-05-08 to FMP + AlphaVantage + FRED after the prior fundamentals provider blocked Railway's data-center IPs at the network level — FMP replaces the prior fundamentals + EOD providers (250 calls/day free, no card). Runtime, envelope, toggle layers, and route shapes preserved across all swaps.

## 1. Install pattern

Per the install-pattern decision (**D-01**) locked in Phase 3 — see [`docs/trading-routine-architecture.md`](./trading-routine-architecture.md), "Install Pattern Decision" + "Phase 5" sections — every external runtime in this repo rides the same shape: a project-level Claude Code skill paired with a thin Express endpoint behind `x-jdcd-agent-key`. Phase 5 follows that pattern verbatim. No MCP server, no user-level skill, no parallel runtime.

| Half | Path |
|---|---|
| Skill (routine-side wrapper) | `.claude/skills/financial-data/SKILL.md` |
| Endpoint (server runtime that holds the API keys) | `server/financial-data-agent.ts` |
| Mount | `server/routes.ts` line 934 — `app.use("/api/trader/data", financialDataAgentRouter)` |

Mount order is load-bearing — the agent router registers BEFORE the `requireAdmin`-gated `/api/trader` mount so route matching falls through to `requireAgentKey` rather than 401-ing on the admin session check (matches scrape-agent / trader-agent / predictor-agent precedent).

The skill is the routine-side primitive; the endpoint is the server-side runtime. All three providers ride the same skill and the same endpoint — one surface, three providers behind it (**D-02** — name `financial-data` is provider-agnostic precisely so vendor swaps like the EODHD→free-stack rescope and the subsequent fundamentals-provider hot-swap to FMP don't force a rename).

## 2. Env vars

| Var | Required | Default | Purpose |
|---|---|---|---|
| `JDCD_AGENT_KEY` | yes | (none) | Shared secret for the `x-jdcd-agent-key` header. Same value the trader-agent, predictor-agent, and scrape-agent routers use. |
| `FMP_API_KEY` | yes (for `fundamentals` + `prices_eod`) | (none) | Free FMP (Financial Modeling Prep) API key from `https://site.financialmodelingprep.com/developer/docs` (no credit card required). Without it, FMP branches return 503 with a setup hint. **Must be set on Railway before any FMP call.** Free-tier limit: **250 calls/day**. A single `fundamentals` request burns 3 of the daily quota (income + balance + cashflow in parallel), so budget ≈ 83 fundamentals requests/day; `prices_eod` is 1 call. |
| `ALPHA_VANTAGE_API_KEY` | yes (for `news`) | (none) | Free AlphaVantage API key from `https://www.alphavantage.co/support/#api-key` (no credit card required). Without it, the `news` dataset branch returns 503 with a setup hint. **Must be set on Railway before any AlphaVantage call.** Free-tier limits: 500 calls/day, 5/min. |
| `FRED_API_KEY` | yes (for FRED calls) | (none) | Free FRED API key from `https://fred.stlouisfed.org/docs/api/api_key.html`. Without it, FRED branches (`macro_series`, `macro_search`) return 503. **Must be set on Railway before any FRED call.** |
| `EXTERNAL_DATA_ENABLED` | no | `true` | Global kill-switch — gates ALL THREE providers (single switch, no per-provider variant in v1). Set to `false` to disable all external data calls; the endpoint then returns 503 except `/ping`, which deliberately bypasses the gate so operators can introspect state regardless. Useful for cost control or temporary maintenance. |

The endpoint backs onto Node's built-in `fetch` for all three providers — REST/Node-native only, no third-party SDK dependency. Railway's nixpacks runtime is bare Node (`nodejs_24, npm-9_x, openssl, caddy`), so there is no subprocess fallback path (**D-09**).

## 3. Accessor reference

Five datasets across three providers, exactly mirroring `EXTERNAL_DATASETS` in [`server/financial-data-agent.ts`](../server/financial-data-agent.ts) (**D-07**). The skill's `## Datasets` table in [`.claude/skills/financial-data/SKILL.md`](../.claude/skills/financial-data/SKILL.md) carries the same five rows — keep all three in sync if any new dataset lands.

| Accessor | Route | Provider | Param semantics | Implementation | `data` shape |
|---|---|---|---|---|---|
| `fundamentals` | `GET /api/trader/data/fundamentals/:ticker` | `fmp` | Stock symbol (`AAPL`, `MSFT`, ...). `[A-Z0-9.\-]{1,12}` enforced. | Three `GET https://financialmodelingprep.com/api/v3/{income-statement,balance-sheet-statement,cash-flow-statement}/{TICKER}?apikey={KEY}&limit=5` calls in parallel, combined into one envelope. **1 request = 3 of 250 daily quota.** | `{ income_statement: [...5 most recent annual statements], balance_sheet: [...], cash_flow: [...] }` |
| `news` | `GET /api/trader/data/news/:ticker` | `alphavantage` | Stock symbol. Whitelisted query passthrough: `time_from`, `time_to`, `limit`, `sort`, `topics`. | `GET https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers={TICKER}&apikey={KEY}` | `{ articles: [{ title, url, time_published, source, summary, overall_sentiment_score, overall_sentiment_label, ticker_sentiment, ... }] }` |
| `prices_eod` | `GET /api/trader/data/prices_eod/:ticker` | `fmp` | Stock symbol. Whitelisted query passthrough: `from`, `to` (ISO dates). | `GET https://financialmodelingprep.com/api/v3/historical-price-full/{TICKER}?apikey={KEY}&from=YYYY-MM-DD&to=YYYY-MM-DD` | `{ ohlcv: [{ date, open, high, low, close, adjClose, volume }] }` |
| `macro_series` | `GET /api/trader/data/macro/:series_id` | `fred` | FRED series ID (`DGS10`, `CPIAUCSL`, `UNRATE`, `GDP`, `M2SL`, ...). `[A-Z0-9_]{1,40}` enforced. Whitelisted passthrough: `observation_start`, `observation_end`, `units`, `frequency`, `aggregation_method`, `limit`, `offset`, `sort_order`. | `GET https://api.stlouisfed.org/fred/series/observations?series_id=...&api_key=...&file_type=json` | `{ observations: [{ date, value, ... }], meta: { count, observation_start, observation_end, units, frequency, ... } }` |
| `macro_search` | `GET /api/trader/data/macro_search?q=<text>` | `fred` | Free-text query, length ≤ 200. Use this to look up unknown FRED series IDs before calling `macro_series`. | `GET https://api.stlouisfed.org/fred/series/search?search_text=...&api_key=...&file_type=json` | `{ matches: [{ id, title, ... }], meta: { count, offset, limit } }` |

A sixth route, `GET /api/trader/data/ping`, returns endpoint health + per-provider key flags + the dataset registry. It deliberately bypasses the toggle gate so operators can introspect state when `EXTERNAL_DATA_ENABLED=false`. Shape: `{ ok, enabled, fmp: { key_configured }, alphavantage: { key_configured }, fred: { key_configured }, datasets }`.

## 4. Toggle mechanism

Three layers, evaluated in this order — ordering is load-bearing (**D-05**):

1. **Global env kill-switch.** `EXTERNAL_DATA_ENABLED=false` on Railway → every dataset route returns 503 with `{ error: "external data disabled globally via EXTERNAL_DATA_ENABLED=false" }`. Single switch covers all three providers. `/ping` is exempt so operators can still see the disabled state.
2. **Per-request opt-out.** `?enabled=false` on any dataset route → 200 `{ skipped: true, reason: "disabled-per-request" }`. Evaluated BEFORE the per-provider key check so a routine can probe endpoint shape without keys provisioned (this is the verification surface for the deferred TRADE-FIN-05 test).
3. **Per-provider key check.** If the request reaches an FMP branch and `FMP_API_KEY` is unset, an AlphaVantage branch and `ALPHA_VANTAGE_API_KEY` is unset, or a FRED branch and `FRED_API_KEY` is unset → 503 with a provider-specific hint pointing at where to provision the key.

**Mode-aware default lives at the routine-prompt layer, not in the endpoint** (**D-06**). The endpoint itself is mode-agnostic — these are read-only data calls and never cause a Live trade. The routine prompt receives a `mode` field via `/api/trader/agent/state` and conditions financial-data calls on `mode === "paper"` (default ON) or explicit `LIVE_MODE_AUTHORIZED=true` for Live runs. Mode-safety enforcement is downstream in the AutoHedge Execution skill (already shipped in Phase 6), exactly the same pattern as Camoufox.

## 5. Source attribution

Every success response — across all 5 datasets, all three providers — emits the same envelope (**D-04**):

```json
{
  "provider": "fmp" | "alphavantage" | "fred",
  "dataset":  "fundamentals" | "news" | "prices_eod" | "macro_series" | "macro_search",
  "ticker_or_series": "<TICKER>|<SERIES_ID>|null",
  "fetched_at": "<ISO-8601 UTC>",
  "source_url": "<upstream URL with apikey / api_key stripped>",
  "data": { ... }
}
```

`provider` is an explicit field — load-bearing because three providers share one endpoint surface, and routines must be able to attribute every externally-sourced number downstream (TRADE-FIN-03 + Phase 5 success criterion #3). `ticker_or_series` is `null` for `macro_search` (no specific series queried). `source_url` is the upstream URL with secrets stripped (FMP `apikey`, AlphaVantage `apikey`, FRED `api_key`), so routines can quote it in research output without leaking the key. For FMP `fundamentals`, the envelope's `source_url` references the income-statement endpoint (one of three combined calls); the other two URLs are deterministic siblings (`balance-sheet-statement` and `cash-flow-statement` at the same `apikey=…&limit=5` query).

Every success path flows through `respondFromFetch → dataEnvelope`. There are zero code paths where upstream data reaches the HTTP boundary unwrapped.

## 6. Example invocations

All examples hit the local Express endpoint, NOT the upstream providers directly. Routines never see API keys — those live in Railway env and only the endpoint touches them. Replace `$JDCD_AGENT_KEY` with the value from your local shell (same secret used by the other agent routers). For local development, swap `https://www.jdcoredev.com` for `http://localhost:5000`.

### 6.1 FMP — fundamentals on AAPL

```bash
curl -s -H "x-jdcd-agent-key: $JDCD_AGENT_KEY" \
  "https://www.jdcoredev.com/api/trader/data/fundamentals/AAPL"
```

Expected response (abridged — FMP returns three statement arrays of 5 most recent annual statements each, combined into one envelope):

```json
{
  "provider": "fmp",
  "dataset": "fundamentals",
  "ticker_or_series": "AAPL",
  "fetched_at": "2026-05-08T14:32:11.482Z",
  "source_url": "https://financialmodelingprep.com/api/v3/income-statement/AAPL?limit=5",
  "data": {
    "income_statement": [
      { "date": "2024-09-28", "symbol": "AAPL", "revenue": 391035000000, "grossProfit": 180683000000, "operatingIncome": 123216000000, "netIncome": 93736000000, "...": "..." },
      { "date": "2023-09-30", "...": "..." }
    ],
    "balance_sheet": [
      { "date": "2024-09-28", "symbol": "AAPL", "totalAssets": 364980000000, "totalLiabilities": 308030000000, "totalStockholdersEquity": 56950000000, "...": "..." },
      { "date": "2023-09-30", "...": "..." }
    ],
    "cash_flow": [
      { "date": "2024-09-28", "symbol": "AAPL", "operatingCashFlow": 118254000000, "freeCashFlow": 108807000000, "capitalExpenditure": -9447000000, "...": "..." },
      { "date": "2023-09-30", "...": "..." }
    ]
  }
}
```

The endpoint fans out to FMP's three statement endpoints (`income-statement`, `balance-sheet-statement`, `cash-flow-statement`) in parallel and combines them into one envelope. **Each fundamentals request burns 3 of the 250 daily quota** — budget ≈ 83 fundamentals requests/day. The `source_url` has `apikey` stripped.

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
| 503 | `JDCD_AGENT_KEY` not set on server, or `EXTERNAL_DATA_ENABLED=false`, or per-provider key (`FMP_API_KEY` for fundamentals/prices_eod / `ALPHA_VANTAGE_API_KEY` for news / `FRED_API_KEY` for macro) not set. | `{ error, hint? }` |
| 200 + `{ skipped: true }` | `?enabled=false` per-request opt-out. | `{ skipped: true, reason: "disabled-per-request" }` |
| 502 | Upstream timeout (20 s), upstream non-2xx (other than 429), upstream unreachable. | `{ error, provider, dataset, upstream_status?, upstream_body?, source_url }` |
| 429 | Upstream rate limited the request (AlphaVantage's 5/min free-tier cap or FMP's 250/day daily cap). | `{ error, provider, dataset, retry_after?, source_url }` |
| 413 | Upstream response > 5 MB raw body cap. | `{ error, provider, dataset, bytes, limit, source_url }` |
| 500 | Network error reaching upstream (DNS, connection refused, SSRF block, parse error). | `{ error, provider, dataset, detail, source_url }` |

Routines surface these as plain skill failures and continue without the dataset — never retry from inside the endpoint (**D-08**, Camoufox precedent). If retries become necessary, the routine handles them with a cap of 3, identical to how `fetch_stealth` is used today. **AlphaVantage 429s especially: respect `retry_after` if present, otherwise back off ≥ 12 s** to stay under the 5/min free-tier rate limit.

## 9. User-action followup (post-merge)

Phase 5 ships **merge-ready** with no live dependency on the API keys. The `/api/trader/data/*` endpoint, the `financial-data` skill, and this doc all land in this PR. The runtime smoke test on a known ticker (TRADE-FIN-05) is explicitly a deferred user-action followup. Until all three keys are provisioned, the corresponding provider's calls return 503 — this is the verification surface for the merge, not a bug.

To unblock TRADE-FIN-05 and complete Phase 5 end-to-end:

1. **Register a free FMP API key** at `https://site.financialmodelingprep.com/developer/docs`. The form needs name + email — no credit card required. Free tier: 250 calls/day. Note: each `fundamentals` request burns 3 calls (income + balance + cashflow), so plan for ≈ 83 fundamentals requests/day.
2. **Register a free AlphaVantage API key** at `https://www.alphavantage.co/support/#api-key`. The form needs name + email + intended-use description ("LLM-driven trading routine research"). Approval is automated and instant — no credit card required. Free tier: 500 calls/day, 5/min.
3. **Register a free FRED API key** at `https://fred.stlouisfed.org/docs/api/api_key.html`. The form needs a brief description of intended use — approval is automated.
4. **Set all three env vars on Railway.** Either via the dashboard (Railway → JDCoreDev service → Variables → New Variable) or the CLI:

   ```bash
   railway variables set FMP_API_KEY=<fmp-token>
   railway variables set ALPHA_VANTAGE_API_KEY=<alphavantage-token>
   railway variables set FRED_API_KEY=<fred-key>
   # Optional - only set if you ever need the global kill-switch:
   # railway variables set EXTERNAL_DATA_ENABLED=false
   ```

   Trigger a redeploy if Railway doesn't auto-redeploy on variable change.
5. **Confirm the keys are wired** (no live upstream call yet — `/ping` is gate-exempt and reads `key_configured` straight off `process.env`):

   ```bash
   curl -s -H "x-jdcd-agent-key: $JDCD_AGENT_KEY" \
     "https://www.jdcoredev.com/api/trader/data/ping"
   ```

   Expect `fmp.key_configured: true`, `alphavantage.key_configured: true`, and `fred.key_configured: true`.
6. **Smoke-test against a known ticker + a known FRED series.** A live AAPL fundamentals call (FMP), a live AAPL news call (AlphaVantage), and a live `DGS10` series call against a freshly-deployed Railway env are the canonical TRADE-FIN-05 verification. Run examples 6.1, 6.2, and 6.3 above; expect non-503 responses with populated `data` blocks. Mind the AlphaVantage 5/min limit when running multiple tests back-to-back, and the FMP 250/day daily cap (each fundamentals call = 3 of 250).
7. **Fire the trader routine and confirm research output cites at least one FMP-, AlphaVantage-, or FRED-sourced block** with `provider` + `dataset` attribution intact (Phase 5 success criterion #3).

Until all three keys are set on Railway, the corresponding provider's calls return 503. **This is by design** — the endpoint is merge-ready before any account exists, so Phase 5 lands as planning-and-code-complete now and the runtime verification follows on the user's schedule.

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
