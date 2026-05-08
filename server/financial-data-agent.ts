/**
 * Financial Data Agent — external financial data layer for trading routines.
 *
 * Mounted at /api/trader/data, gated by x-jdcd-agent-key (same shared secret
 * the trader-agent, predictor-agent, and scrape-agent routers use). Phase 5
 * of W3 — see docs/trading-routine-architecture.md and
 * .planning/phases/05-external-financial-data-layer/05-CONTEXT.md for the
 * locked decisions referenced inline.
 *
 * Three providers, one router. Originally shipped 2026-05-07 against EODHD +
 * FRED, then rescoped to a free stack (yahoo-finance2 + AlphaVantage + FRED).
 * Yahoo turned out to block Railway data-center IPs at the network level
 * ("fetch failed"), so on 2026-05-08 fundamentals + prices_eod were swapped
 * to FMP (Financial Modeling Prep) — also free tier, no IP blocks.
 *
 *   - fmp           ticker-bound: fundamentals, prices_eod
 *       https://financialmodelingprep.com/api/v3/income-statement/{TICKER}?apikey=...
 *       https://financialmodelingprep.com/api/v3/balance-sheet-statement/{TICKER}?apikey=...
 *       https://financialmodelingprep.com/api/v3/cash-flow-statement/{TICKER}?apikey=...
 *       https://financialmodelingprep.com/api/v3/historical-price-full/{TICKER}?apikey=...&from=&to=
 *       Free tier: 250 calls/day. Fundamentals = 3 calls (combined return).
 *   - alphavantage  ticker-bound: news (with sentiment)
 *       https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=...&apikey=...
 *       Free tier: 500 calls/day, 5/min.
 *   - fred          not ticker-bound: macro_series (by series id), macro_search
 *       https://api.stlouisfed.org/fred/series/observations?series_id=...&api_key=...&file_type=json
 *       https://api.stlouisfed.org/fred/series/search?search_text=...&api_key=...&file_type=json
 *
 * REST/Node-native — no Python subprocess, no npm SDKs that bypass our
 * fetchWithLimits guard (D-09). All three providers reachable via Node's
 * built-in fetch from Railway's nixpacks runtime (nodejs_24).
 *
 * Routes:
 *   GET /:dataset/:ticker     fmp (fundamentals, prices_eod) + alphavantage (news)
 *   GET /macro/:series_id     FRED  series/observations
 *   GET /macro_search?q=...   FRED  series/search
 *   GET /ping                 health + per-provider key/availability probe
 *
 * Decision references (see 05-CONTEXT.md):
 *   D-01  Install pattern: project-level skill + thin Express endpoint behind
 *         x-jdcd-agent-key. No MCP, no parallel pattern.
 *   D-02  Skill name `financial-data` (not vendor-specific) — wraps all three
 *         providers behind one routine-side primitive. Survived the rescope.
 *   D-03  Endpoint base path /api/trader/data. Mounts before requireAdmin
 *         /api/trader so requireAdmin doesn't shadow agent-key auth.
 *   D-04  Source attribution envelope is mandatory in every response:
 *         { provider: "fmp"|"alphavantage"|"fred", dataset, ticker_or_series,
 *           fetched_at, source_url?, data }.
 *         The `provider` field is load-bearing — three providers share one surface.
 *   D-05  Toggle is layered: EXTERNAL_DATA_ENABLED env (default true) globally
 *         gates all providers; ?enabled=false per request short-circuits to
 *         200 { skipped: true }; per-provider key gate (ALPHA_VANTAGE_API_KEY,
 *         FRED_API_KEY, FMP_API_KEY) — every dataset has a required key.
 *         Mode-aware default lives at routine-prompt layer, not here.
 *   D-06  Mode safety bakes the existing pattern; the endpoint is mode-agnostic
 *         (read-only data calls), live-mode confirmation lives in the routine
 *         prompt + AutoHedge Execution skill — same as Camoufox.
 *   D-09  REST/Node-native only, no child_process / Python helper.
 */

import { Router, type Request, type Response, type NextFunction } from "express";

// Three providers, all REST. yahoo-finance2 was dropped after deploy revealed
// Yahoo blocks Railway's data-center IPs (network-level "fetch failed" with
// no upstream response). FMP is the drop-in replacement for fundamentals +
// prices and works fine from cloud hosts.

export const financialDataAgentRouter = Router();

// ── Limits ────────────────────────────────────────────────────────────────
const DATA_TIMEOUT_MS    = 20_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;   // 5 MB raw upstream body cap
const MAX_OUTPUT_CHARS   = 60_000;            // applied to news article bodies

// ── Dataset registry (D-07) ───────────────────────────────────────────────
// If you add a dataset here, also update the SKILL.md accessor list in Plan
// 05-02 and docs/financial-data-integration.md in Plan 05-03. (D-10 cross-ref.)
export const EXTERNAL_DATASETS = [
  // FMP — ticker-bound, route shape: /:dataset/:ticker
  "fundamentals",   // GET https://financialmodelingprep.com/api/v3/{income|balance|cashflow}-statement/{TICKER}?apikey={KEY}
  // AlphaVantage — ticker-bound, route shape: /:dataset/:ticker
  "news",           // GET https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers={TICKER}&apikey={KEY}
  // FMP — ticker-bound, route shape: /:dataset/:ticker
  "prices_eod",     // GET https://financialmodelingprep.com/api/v3/historical-price-full/{TICKER}?apikey={KEY}&from=&to=
  // FRED — distinct routes: /macro/:series_id, /macro_search?q=...
  "macro_series",
  "macro_search",
] as const;

const TICKER_BOUND_DATASETS = new Set(["fundamentals", "news", "prices_eod"]);

// Per-dataset metadata — which provider serves it and what env key it needs.
// `null` requiredKey means the dataset has no key gate (none in current set).
const DATASET_PROVIDER: Record<
  string,
  { provider: Provider; requiredKey: "ALPHA_VANTAGE_API_KEY" | "FRED_API_KEY" | "FMP_API_KEY" | null }
> = {
  fundamentals: { provider: "fmp",          requiredKey: "FMP_API_KEY" },
  news:         { provider: "alphavantage", requiredKey: "ALPHA_VANTAGE_API_KEY" },
  prices_eod:   { provider: "fmp",          requiredKey: "FMP_API_KEY" },
  macro_series: { provider: "fred",         requiredKey: "FRED_API_KEY" },
  macro_search: { provider: "fred",         requiredKey: "FRED_API_KEY" },
};

// Whitelisted query passthroughs per dataset (avoids forwarding caller-supplied
// `?apikey=...` or `?api_key=...` that would be appended after our auth
// param and override it on some HTTP stacks). Keep tight.
const ALPHAVANTAGE_NEWS_PASSTHROUGH = ["time_from", "time_to", "limit", "sort", "topics"] as const;
const FMP_PRICES_PASSTHROUGH        = ["from", "to"] as const; // ISO yyyy-mm-dd; passed to FMP historical-price-full
const FRED_OBSERVATIONS_PASSTHROUGH = [
  "observation_start",
  "observation_end",
  "units",
  "frequency",
  "aggregation_method",
  "limit",
  "offset",
  "sort_order",
] as const;

type Provider = "fmp" | "alphavantage" | "fred";

type DataEnvelope<T> = {
  provider: Provider;
  dataset: string;
  ticker_or_series: string | null;
  fetched_at: string;
  source_url?: string;
  data: T;
};

function dataEnvelope<T>(
  provider: Provider,
  dataset: string,
  tickerOrSeries: string | null,
  data: T,
  sourceUrl?: string,
): DataEnvelope<T> {
  return {
    provider,
    dataset,
    ticker_or_series: tickerOrSeries,
    fetched_at: new Date().toISOString(),
    ...(sourceUrl ? { source_url: sourceUrl } : {}),
    data,
  };
}

// ── Auth (identical to scrape-agent.ts:30-36) ─────────────────────────────
// 503 when JDCD_AGENT_KEY is not configured on the SERVER (operator error).
// 401 when the client header doesn't match (auth failure).
function requireAgentKey(req: Request, res: Response, next: NextFunction) {
  const provided = req.headers["x-jdcd-agent-key"];
  const expected = process.env.JDCD_AGENT_KEY;
  if (!expected) return res.status(503).json({ error: "JDCD_AGENT_KEY not set" });
  if (typeof provided !== "string" || provided !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

// ── SSRF guard (defense-in-depth; copy of scrape-agent.ts:38-49) ──────────
// All three providers (FMP, AlphaVantage, FRED) hit known hardcoded hosts.
// User input only flows into path/query params, never the host. Guard is
// belt-and-braces for any future dataset that takes a URL parameter.
function isInternalIp(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "metadata" || h === "metadata.google.internal") return true;
  if (h === "169.254.169.254" || h === "169.254.170.2") return true; // cloud metadata
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h))  return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true;
  if (/^0\./.test(h)) return true;
  if (h === "::1" || /^fc/.test(h) || /^fd/.test(h) || /^fe80:/.test(h)) return true;
  return false;
}

// ── Toggle gate (D-05) ────────────────────────────────────────────────────
// Returns true when the gate has already responded (caller must `return`).
// Returns false when the route should continue.
//
// ORDER IS LOAD-BEARING:
//   1. Global kill-switch (EXTERNAL_DATA_ENABLED=false) — 503.
//   2. Per-request opt-out (?enabled=false) — 200 { skipped: true }.
//   3. Per-provider key check — 503 (skipped when requiredKey is null/undefined).
//
// The per-request opt-out MUST come before the API key check so that a
// routine can probe the endpoint shape without keys provisioned (verification
// surface for the deferred user-action TRADE-FIN-05 test).
//
// All three providers require keys after the rescope; passing null is still
// supported for any future keyless dataset.
function applyToggleGate(
  req: Request,
  res: Response,
  requiredKey?: "ALPHA_VANTAGE_API_KEY" | "FRED_API_KEY" | "FMP_API_KEY" | null,
): boolean {
  if (process.env.EXTERNAL_DATA_ENABLED === "false") {
    res.status(503).json({
      error: "external data disabled globally via EXTERNAL_DATA_ENABLED=false",
    });
    return true;
  }
  if (req.query.enabled === "false") {
    res.status(200).json({ skipped: true, reason: "disabled-per-request" });
    return true;
  }
  if (requiredKey && !process.env[requiredKey]) {
    res.status(503).json({
      error: `${requiredKey} not configured on server`,
      hint:
        requiredKey === "ALPHA_VANTAGE_API_KEY"
          ? "Register a free AlphaVantage API key at https://www.alphavantage.co/support/#api-key (no card required) and set ALPHA_VANTAGE_API_KEY in Railway env."
          : "Provision a free FRED API key at https://fred.stlouisfed.org/docs/api/api_key.html and set FRED_API_KEY in Railway env.",
    });
    return true;
  }
  return false;
}

// ── Upstream fetch with timeout + size cap (used by AlphaVantage + FRED) ──
type FetchResult =
  | { kind: "ok";          status: number; body: unknown; sourceUrl: string }
  | { kind: "timeout";     sourceUrl: string }
  | { kind: "too-large";   bytes: number; sourceUrl: string }
  | { kind: "non-2xx";     status: number; body: unknown; retryAfter?: string; sourceUrl: string }
  | { kind: "network-err"; message: string; sourceUrl: string };

async function fetchWithLimits(url: URL, timeoutMs = DATA_TIMEOUT_MS): Promise<FetchResult> {
  // SSRF guard — even though hosts are hardcoded, sanity-check.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { kind: "network-err", message: "non-http(s) scheme", sourceUrl: url.toString() };
  }
  if (isInternalIp(url.hostname)) {
    return { kind: "network-err", message: "internal target blocked", sourceUrl: url.toString() };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // Strip apikey / api_key from the logged source URL so secrets don't leak
  // into routine context or error envelopes.
  const safeUrl = new URL(url.toString());
  safeUrl.searchParams.delete("apikey");
  safeUrl.searchParams.delete("api_key");
  // Also strip the legacy EODHD param in case anything still passes it.
  safeUrl.searchParams.delete("api_token");
  const sourceUrl = safeUrl.toString();

  try {
    const r = await fetch(url.toString(), {
      method:   "GET",
      headers:  { Accept: "application/json" },
      signal:   ctrl.signal,
      redirect: "follow",
    });

    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX_RESPONSE_BYTES) {
      return { kind: "too-large", bytes: buf.byteLength, sourceUrl };
    }

    let body: unknown = null;
    const text = new TextDecoder("utf-8").decode(buf);
    try { body = JSON.parse(text); } catch { body = text; }

    if (!r.ok) {
      return {
        kind: "non-2xx",
        status: r.status,
        body,
        retryAfter: r.headers.get("retry-after") ?? undefined,
        sourceUrl,
      };
    }
    return { kind: "ok", status: r.status, body, sourceUrl };
  } catch (e: any) {
    if (e?.name === "AbortError") return { kind: "timeout", sourceUrl };
    return { kind: "network-err", message: e?.message || "fetch failed", sourceUrl };
  } finally {
    clearTimeout(timer);
  }
}

// Map fetch result → HTTP response. Every error path emits provider+dataset.
function respondFromFetch(
  res: Response,
  provider: Provider,
  dataset: string,
  tickerOrSeries: string | null,
  result: FetchResult,
  shapeData: (raw: unknown) => unknown = (raw) => raw,
) {
  if (result.kind === "timeout") {
    return res.status(502).json({
      error: "upstream timeout",
      provider, dataset, ticker_or_series: tickerOrSeries,
      fetched_at: new Date().toISOString(),
      source_url: result.sourceUrl,
    });
  }
  if (result.kind === "too-large") {
    return res.status(413).json({
      error: "upstream response too large",
      provider, dataset,
      bytes: result.bytes, limit: MAX_RESPONSE_BYTES,
      source_url: result.sourceUrl,
    });
  }
  if (result.kind === "network-err") {
    return res.status(500).json({
      error: "fetch failed",
      provider, dataset,
      detail: result.message,
      source_url: result.sourceUrl,
    });
  }
  if (result.kind === "non-2xx") {
    if (result.status === 429) {
      return res.status(429).json({
        error: "upstream rate limited",
        provider, dataset,
        retry_after: result.retryAfter ?? null,
        source_url: result.sourceUrl,
      });
    }
    // Pass 4xx / 5xx through as 502 with upstream_status — surface the failure
    // to the routine, do not retry from the executor (D-08 / Camoufox precedent).
    return res.status(502).json({
      error: "upstream non-2xx",
      provider, dataset,
      upstream_status: result.status,
      upstream_body:   result.body,
      source_url:      result.sourceUrl,
    });
  }
  // ok
  return res.json(dataEnvelope(provider, dataset, tickerOrSeries, shapeData(result.body), result.sourceUrl));
}

// AlphaVantage uses HTTP 200 even for some error/limit responses, returning
// {"Note": "..."} or {"Information": "..."} bodies. Detect them and translate
// to a 429-equivalent or 502 so the routine sees a uniform error shape.
function alphaVantageErrorShape(body: unknown): { kind: "rate" | "error" | "ok"; message?: string } {
  if (!body || typeof body !== "object") return { kind: "ok" };
  const o = body as Record<string, unknown>;
  if (typeof o.Note === "string")        return { kind: "rate",  message: o.Note as string };
  if (typeof o.Information === "string") return { kind: "rate",  message: o.Information as string };
  if (typeof o["Error Message"] === "string") return { kind: "error", message: o["Error Message"] as string };
  return { kind: "ok" };
}

// ── Helpers ───────────────────────────────────────────────────────────────
const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/i;
const SERIES_RE = /^[A-Z0-9_]{1,40}$/i;

function logCall(provider: Provider, dataset: string, key: string | null, status: number, ms: number) {
  console.log(`[data] provider=${provider} dataset=${dataset} ticker_or_series=${key ?? "-"} status=${status} ms=${ms}`);
}

function appendPassthrough(target: URL, req: Request, allowed: readonly string[]) {
  for (const k of allowed) {
    const v = req.query[k];
    if (typeof v === "string" && v.length > 0 && v.length <= 200) {
      target.searchParams.set(k, v);
    }
  }
}

// Strip HTML tags + decode common entities from any html string in news bodies.
// AlphaVantage's NEWS_SENTIMENT typically returns plain text in `summary`, but
// keep this defense against a stray tag in case.
function stripHtml(input: unknown): string {
  if (typeof input !== "string") return "";
  let s = input;
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  s = s.replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (s.length > MAX_OUTPUT_CHARS) s = s.slice(0, MAX_OUTPUT_CHARS);
  return s;
}

function shapeAlphaVantageNews(raw: unknown): { articles: unknown[] } {
  // AlphaVantage NEWS_SENTIMENT: { items, sentiment_score_definition, ..., feed: [...] }
  // Where each `feed[i]` has title, url, time_published, source, summary,
  // overall_sentiment_score, overall_sentiment_label, ticker_sentiment, etc.
  if (!raw || typeof raw !== "object") return { articles: [] };
  const feed = (raw as Record<string, unknown>).feed;
  if (!Array.isArray(feed)) return { articles: [] };
  const articles = feed.map((a: any) => {
    if (!a || typeof a !== "object") return a;
    const out: Record<string, unknown> = { ...a };
    if (typeof a.summary === "string") out.summary = stripHtml(a.summary);
    return out;
  });
  return { articles };
}

// ── Routes ────────────────────────────────────────────────────────────────

// Yahoo + AlphaVantage ticker-bound trio.
// Path constraint: dataset must be one of the ticker-bound slugs.
// Without this, /macro/:series_id is shadowed because Express matches
// /:dataset/:ticker first (both are 2-segment paths). The constraint
// makes /macro/DGS10 fall through to the FRED route below.
financialDataAgentRouter.get("/:dataset(fundamentals|news|prices_eod)/:ticker", requireAgentKey, async (req, res) => {
  const dataset = (req.params.dataset || "").toString();
  const ticker  = (req.params.ticker  || "").toString().toUpperCase();
  const t0 = Date.now();

  if (!TICKER_BOUND_DATASETS.has(dataset)) {
    return res.status(400).json({
      error: "unknown dataset for this route",
      provided: dataset,
      allowed: Array.from(TICKER_BOUND_DATASETS),
      hint: "FRED macro routes are /macro/:series_id and /macro_search?q=...",
    });
  }
  if (!TICKER_RE.test(ticker)) {
    return res.status(400).json({ error: "invalid ticker", provided: ticker });
  }

  const { provider, requiredKey } = DATASET_PROVIDER[dataset];
  if (applyToggleGate(req, res, requiredKey)) return;

  // ── fundamentals (FMP — three statements fetched in parallel) ──────────
  // FMP free tier: 250 calls/day. One fundamentals request = 3 upstream
  // calls (income, balance, cashflow) → ~83 fundamentals/day budget.
  if (dataset === "fundamentals") {
    const apiKey = process.env.FMP_API_KEY!;
    const base = "https://financialmodelingprep.com/api/v3";
    const buildUrl = (statement: string) => {
      const u = new URL(`${base}/${statement}/${encodeURIComponent(ticker)}`);
      u.searchParams.set("limit", "5"); // last 5 annual periods
      u.searchParams.set("apikey", apiKey);
      return u;
    };
    const [income, balance, cashflow] = await Promise.all([
      fetchWithLimits(buildUrl("income-statement")),
      fetchWithLimits(buildUrl("balance-sheet-statement")),
      fetchWithLimits(buildUrl("cash-flow-statement")),
    ]);

    // Combined sourceUrl points at the first endpoint (key-stripped); the three
    // calls share host so leak risk is identical for any of them.
    const firstSource = income.kind === "ok" || income.kind === "non-2xx" || income.kind === "timeout" || income.kind === "too-large" || income.kind === "network-err" ? income.sourceUrl : "";

    // If any of the three failed, bubble the worst kind.
    const worstKind = [income, balance, cashflow]
      .map(r => r.kind)
      .find(k => k !== "ok") ?? "ok";

    if (worstKind !== "ok") {
      const failed = [income, balance, cashflow].find(r => r.kind !== "ok")!;
      const status = failed.kind === "non-2xx" ? (failed.status === 429 ? 429 : 502)
                   : failed.kind === "timeout" ? 502
                   : failed.kind === "too-large" ? 413
                   : 500;
      logCall("fmp", "fundamentals", ticker, status, Date.now() - t0);
      const detail = failed.kind === "non-2xx" ? `FMP ${failed.status}: ${typeof failed.body === "string" ? failed.body.slice(0, 200) : JSON.stringify(failed.body).slice(0, 200)}`
                   : failed.kind === "timeout" ? "FMP timeout"
                   : failed.kind === "too-large" ? `FMP response too large (${failed.bytes} bytes)`
                   : (failed as { message?: string }).message ?? "FMP fetch failed";
      return res.status(status).json({
        error: "upstream error",
        provider: "fmp",
        dataset: "fundamentals",
        detail,
        source_url: failed.sourceUrl,
      });
    }

    const data = {
      income_statement: Array.isArray((income as any).body) ? (income as any).body : [],
      balance_sheet:    Array.isArray((balance as any).body) ? (balance as any).body : [],
      cash_flow:        Array.isArray((cashflow as any).body) ? (cashflow as any).body : [],
    };
    logCall("fmp", "fundamentals", ticker, 200, Date.now() - t0);
    return res.json(dataEnvelope("fmp", "fundamentals", ticker, data, firstSource));
  }

  // ── prices_eod (FMP historical-price-full) ──────────────────────────────
  if (dataset === "prices_eod") {
    const apiKey = process.env.FMP_API_KEY!;
    const url = new URL(`https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(ticker)}`);
    appendPassthrough(url, req, FMP_PRICES_PASSTHROUGH);
    url.searchParams.set("apikey", apiKey);

    const result = await fetchWithLimits(url);
    const status = result.kind === "ok" ? 200
                : result.kind === "non-2xx" ? (result.status === 429 ? 429 : 502)
                : result.kind === "timeout" ? 502
                : result.kind === "too-large" ? 413
                : 500;
    logCall("fmp", "prices_eod", ticker, status, Date.now() - t0);
    return respondFromFetch(res, "fmp", "prices_eod", ticker, result, (raw: any) => {
      const rows: any[] = Array.isArray(raw?.historical) ? raw.historical : [];
      return {
        ohlcv: rows.map((r: any) => ({
          date:     r.date,
          open:     r.open,
          high:     r.high,
          low:      r.low,
          close:    r.close,
          adjClose: r.adjClose,
          volume:   r.volume,
        })),
      };
    });
  }

  // ── news (alphavantage via NEWS_SENTIMENT) ───────────────────────────────
  if (dataset === "news") {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY!;
    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.set("function", "NEWS_SENTIMENT");
    url.searchParams.set("tickers", ticker);
    appendPassthrough(url, req, ALPHAVANTAGE_NEWS_PASSTHROUGH);
    // Auth param goes LAST so passthrough cannot override it.
    url.searchParams.set("apikey", apiKey);

    const result = await fetchWithLimits(url);

    // AlphaVantage sometimes returns 200 with a Note/Information body when
    // rate-limited or quota-exhausted. Translate to 429/502 so the routine
    // sees a uniform error shape.
    if (result.kind === "ok") {
      const av = alphaVantageErrorShape(result.body);
      if (av.kind === "rate") {
        logCall("alphavantage", "news", ticker, 429, Date.now() - t0);
        return res.status(429).json({
          error: "upstream rate limited",
          provider: "alphavantage",
          dataset: "news",
          retry_after: null,
          detail: av.message ?? null,
          source_url: result.sourceUrl,
        });
      }
      if (av.kind === "error") {
        logCall("alphavantage", "news", ticker, 502, Date.now() - t0);
        return res.status(502).json({
          error: "upstream error",
          provider: "alphavantage",
          dataset: "news",
          detail: av.message ?? null,
          source_url: result.sourceUrl,
        });
      }
    }

    const status = result.kind === "ok" ? 200
                : result.kind === "non-2xx" ? (result.status === 429 ? 429 : 502)
                : result.kind === "timeout" ? 502
                : result.kind === "too-large" ? 413
                : 500;
    logCall("alphavantage", "news", ticker, status, Date.now() - t0);
    return respondFromFetch(res, "alphavantage", "news", ticker, result, shapeAlphaVantageNews);
  }

  // unreachable — TICKER_BOUND_DATASETS guard above ensures one of the three
  return res.status(500).json({ error: "internal: unhandled ticker dataset", dataset });
});

// FRED series observations.
financialDataAgentRouter.get("/macro/:series_id", requireAgentKey, async (req, res) => {
  const seriesId = (req.params.series_id || "").toString().toUpperCase();
  const t0 = Date.now();

  if (!SERIES_RE.test(seriesId)) {
    return res.status(400).json({ error: "invalid series_id", provided: seriesId });
  }
  if (applyToggleGate(req, res, "FRED_API_KEY")) return;

  const apiKey = process.env.FRED_API_KEY!;
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("file_type", "json");
  appendPassthrough(url, req, FRED_OBSERVATIONS_PASSTHROUGH);
  url.searchParams.set("api_key", apiKey);

  const result = await fetchWithLimits(url);
  const status = result.kind === "ok" ? 200
              : result.kind === "non-2xx" ? (result.status === 429 ? 429 : 502)
              : result.kind === "timeout" ? 502
              : result.kind === "too-large" ? 413
              : 500;
  logCall("fred", "macro_series", seriesId, status, Date.now() - t0);
  return respondFromFetch(res, "fred", "macro_series", seriesId, result, (raw: any) => ({
    observations: Array.isArray(raw?.observations) ? raw.observations : [],
    meta: raw && typeof raw === "object" ? {
      count:        raw.count,
      offset:       raw.offset,
      limit:        raw.limit,
      units:        raw.units,
      frequency:    raw.frequency,
      output_type:  raw.output_type,
      observation_start: raw.observation_start,
      observation_end:   raw.observation_end,
    } : null,
  }));
});

// FRED series search.
financialDataAgentRouter.get("/macro_search", requireAgentKey, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const t0 = Date.now();

  if (!q || q.length === 0) {
    return res.status(400).json({ error: "q required (free-text search query)" });
  }
  if (q.length > 200) {
    return res.status(400).json({ error: "q too long (max 200 chars)" });
  }
  if (applyToggleGate(req, res, "FRED_API_KEY")) return;

  const apiKey = process.env.FRED_API_KEY!;
  const url = new URL("https://api.stlouisfed.org/fred/series/search");
  url.searchParams.set("search_text", q);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("api_key", apiKey);

  const result = await fetchWithLimits(url);
  const status = result.kind === "ok" ? 200
              : result.kind === "non-2xx" ? (result.status === 429 ? 429 : 502)
              : result.kind === "timeout" ? 502
              : result.kind === "too-large" ? 413
              : 500;
  logCall("fred", "macro_search", null, status, Date.now() - t0);
  return respondFromFetch(res, "fred", "macro_search", null, result, (raw: any) => ({
    matches: Array.isArray(raw?.seriess) ? raw.seriess : [],
    meta: raw && typeof raw === "object" ? {
      count:  raw.count,
      offset: raw.offset,
      limit:  raw.limit,
    } : null,
  }));
});

// Health / registry probe — NO toggle gate (must be introspectable when
// EXTERNAL_DATA_ENABLED=false so operators can confirm endpoint shape).
//
// /ping shape (top-level provider keys — flat, easy for routines to inspect):
//   { ok, enabled, fmp: { key_configured }, alphavantage: { key_configured },
//     fred: { key_configured }, datasets }
// All three providers need API keys after the FMP swap (yahoo-finance2 was
// dropped — Yahoo blocks Railway IPs at the network level).
financialDataAgentRouter.get("/ping", requireAgentKey, (_req, res) => {
  res.json({
    ok: true,
    enabled: process.env.EXTERNAL_DATA_ENABLED !== "false",
    fmp:          { key_configured: !!process.env.FMP_API_KEY },
    alphavantage: { key_configured: !!process.env.ALPHA_VANTAGE_API_KEY },
    fred:         { key_configured: !!process.env.FRED_API_KEY },
    datasets: EXTERNAL_DATASETS,
  });
});
