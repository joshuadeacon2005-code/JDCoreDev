/**
 * Claude Predictor — Kalshi prediction market agent with multi-agent council debate
 * Mounted at /api/predictor/*
 */

import { Router } from "express";
import cron from "node-cron";
import { pool } from "./db";

export const predictorRouter = Router();

// ── Kalshi API config ───────────────────────────────────────────────────────

const KALSHI_BASE = {
  demo: "https://demo-api.kalshi.co/trade-api/v2",
  prod: "https://trading-api.kalshi.com/trade-api/v2",
};

// Categories where Claude has genuine informational edge
const EDGE_CATEGORIES = [
  "Politics", "Economics", "Technology", "Science", "Regulation",
  "AI", "Climate", "Federal Reserve", "Supreme Court", "Congress",
  "Geopolitics", "Crypto Regulation", "Space", "Health Policy",
];

// ── DB tables ────────────────────────────────────────────────────────────────

async function initPredictorTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS predictor_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS predictor_bets (
    id TEXT PRIMARY KEY,
    market_ticker TEXT,
    market_title TEXT,
    side TEXT,
    contracts INTEGER,
    price REAL,
    cost REAL,
    confidence REAL,
    edge REAL,
    council_verdict TEXT,
    council_transcript JSONB,
    status TEXT DEFAULT 'pending',
    pnl REAL,
    settled_at TIMESTAMPTZ,
    platform TEXT DEFAULT 'kalshi',
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  // Add platform column if missing (for existing DBs)
  await pool.query(`ALTER TABLE predictor_bets ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'kalshi'`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS predictor_scans (
    id SERIAL PRIMARY KEY,
    markets_scanned INTEGER DEFAULT 0,
    candidates_found INTEGER DEFAULT 0,
    bets_placed INTEGER DEFAULT 0,
    scan_json JSONB,
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS predictor_logs (
    id SERIAL PRIMARY KEY,
    message TEXT,
    type TEXT DEFAULT 'info',
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS predictor_chat (
    id SERIAL PRIMARY KEY,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS predictor_councils (
    id SERIAL PRIMARY KEY,
    market_ticker TEXT,
    market_title TEXT,
    our_probability REAL,
    market_probability REAL,
    edge REAL,
    verdict TEXT,
    confidence TEXT,
    transcript JSONB,
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // API usage tracking table
  await pool.query(`CREATE TABLE IF NOT EXISTS api_usage (
    id SERIAL PRIMARY KEY,
    module TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Default settings
  const defaults: [string, string][] = [
    ["cron_enabled", "false"],
    ["min_edge", "0.15"],
    ["max_bet_usd", "25"],
    ["max_positions", "10"],
    ["kelly_fraction", "0.25"],
    ["mode", "demo"],
    ["market_focus", "all"],
  ];
  for (const [k, v] of defaults) {
    await pool.query(
      `INSERT INTO predictor_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      [k, v]
    );
  }
}

// ── DB helpers ───────────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const r = await pool.query("SELECT value FROM predictor_settings WHERE key=$1", [key]);
  return r.rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string) {
  await pool.query(
    `INSERT INTO predictor_settings (key, value, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
    [key, value]
  );
}

async function insertLog(type: string, message: string) {
  await pool.query("INSERT INTO predictor_logs (type, message) VALUES ($1,$2)", [type, message]);
}

// ── Kalshi API helpers ───────────────────────────────────────────────────────

interface KalshiKeys {
  keyId: string;
  privateKey: string;
  isDemo: boolean;
}

function getKalshiKeys(): KalshiKeys {
  const isDemo = (process.env.KALSHI_MODE || "demo") === "demo";
  return {
    keyId: isDemo
      ? process.env.KALSHI_KEY_ID_DEMO || ""
      : process.env.KALSHI_KEY_ID_LIVE || "",
    privateKey: isDemo
      ? process.env.KALSHI_PRIVATE_KEY_DEMO || ""
      : process.env.KALSHI_PRIVATE_KEY_LIVE || "",
    isDemo,
  };
}

// Kalshi v2 uses RSA-PSS signing for auth. For the demo env, we use simple
// email/password login which returns a JWT. For production, implement RSA-PSS.
let kalshiToken: string | null = null;
let kalshiTokenExpiry = 0;

async function kalshiLogin(keys: KalshiKeys): Promise<string> {
  if (kalshiToken && Date.now() < kalshiTokenExpiry) return kalshiToken;

  const base = keys.isDemo ? KALSHI_BASE.demo : KALSHI_BASE.prod;

  // Demo uses email/password login
  if (keys.isDemo) {
    const email = process.env.KALSHI_EMAIL_DEMO || "";
    const password = process.env.KALSHI_PASSWORD_DEMO || "";
    if (!email || !password) throw new Error("Kalshi demo credentials not configured");

    const res = await fetch(`${base}/log-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`Kalshi login failed: ${res.status}`);
    const d = await res.json();
    kalshiToken = d.token;
    kalshiTokenExpiry = Date.now() + 25 * 60 * 1000; // 25 min (tokens expire at 30)
    return kalshiToken!;
  }

  // Production: RSA-PSS signing (key-based auth)
  // For now, use API key headers directly
  kalshiToken = keys.keyId;
  return kalshiToken;
}

async function kalshiReq(path: string, method = "GET", body: any = null): Promise<any> {
  const keys = getKalshiKeys();
  const base = keys.isDemo ? KALSHI_BASE.demo : KALSHI_BASE.prod;

  let headers: any = { "Content-Type": "application/json" };

  if (keys.isDemo) {
    const token = await kalshiLogin(keys);
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    // Prod uses KALSHI-ACCESS-KEY + timestamp + signature headers
    // Simplified: just key header for now (full RSA-PSS signing in production)
    headers["KALSHI-ACCESS-KEY"] = keys.keyId;
    headers["KALSHI-ACCESS-TIMESTAMP"] = String(Date.now());
  }

  try {
    const res = await fetch(base + path, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  } catch (e: any) {
    return { error: true, message: e.message };
  }
}

// Public endpoints (no auth needed for market data)
async function kalshiPublicReq(path: string): Promise<any> {
  const keys = getKalshiKeys();
  const base = keys.isDemo ? KALSHI_BASE.demo : KALSHI_BASE.prod;
  try {
    const res = await fetch(base + path, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  } catch (e: any) {
    return { error: true, message: e.message };
  }
}

// ── Claude helpers ──────────────────────────────────────────────────────────

function parseJSON(text: string) {
  if (!text) return null;
  try {
    const m = text.replace(/```json|```/g, "").match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m) return JSON.parse(m[0]);
  } catch {}
  return null;
}

// Cost rates per million tokens
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4 },
};

async function logApiUsage(module: string, model: string, inputTokens: number, outputTokens: number) {
  const rates = MODEL_COSTS[model] || { input: 3, output: 15 };
  const cost = (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
  await pool.query(
    `INSERT INTO api_usage (module, model, input_tokens, output_tokens, cost_usd) VALUES ($1,$2,$3,$4,$5)`,
    [module, model, inputTokens, outputTokens, cost]
  ).catch(() => {});
}

async function callClaude(prompt: string, useSearch = false, maxTokens = 1500): Promise<string> {
  const model = "claude-sonnet-4-5";
  const body: any = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  };
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const d = await res.json();

  // Log token usage
  if (d.usage) {
    await logApiUsage("predictor", model, d.usage.input_tokens || 0, d.usage.output_tokens || 0);
  }

  return (d.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
}

// ── Polymarket helpers ──────────────────────────────────────────────────────

const POLYMARKET_GAMMA_API = "https://gamma-api.polymarket.com";

const CRYPTO_KEYWORDS = ["bitcoin", "btc", "ethereum", "eth", "solana", "sol", "crypto", "blockchain"];

async function fetchPolymarketOpportunities(): Promise<any[]> {
  try {
    const res = await fetch(`${POLYMARKET_GAMMA_API}/markets?closed=false&limit=200`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const markets = await res.json();
    return Array.isArray(markets) ? markets : [];
  } catch (e: any) {
    console.warn("[predictor] Polymarket fetch failed:", e.message);
    return [];
  }
}

async function fetchCryptoSpotPrice(symbol: string): Promise<number | null> {
  try {
    const alpacaKey = process.env.CRON_ALPACA_KEY_PAPER || "";
    const alpacaSecret = process.env.CRON_ALPACA_SECRET_PAPER || "";
    if (!alpacaKey || !alpacaSecret) return null;
    const pair = `${symbol.toUpperCase()}/USD`;
    const res = await fetch(
      `https://data.alpaca.markets/v1beta3/crypto/us/latest/quotes?symbols=${encodeURIComponent(pair)}`,
      {
        headers: { "APCA-API-KEY-ID": alpacaKey, "APCA-API-SECRET-KEY": alpacaSecret },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return null;
    const d = await res.json();
    const quote = d?.quotes?.[pair];
    return quote ? (quote.ap + quote.bp) / 2 : null;
  } catch {
    return null;
  }
}

// ── PIPELINE STAGES ─────────────────────────────────────────────────────────

// Short-term market categories
const WEATHER_KEYWORDS = ["weather", "temperature", "rain", "snow", "hurricane", "tornado", "storm", "heat", "cold", "forecast"];
const ECONOMIC_KEYWORDS = ["gdp", "inflation", "cpi", "jobs", "unemployment", "interest rate", "fed", "federal reserve", "treasury", "housing"];
const CRYPTO_SERIES = ["KXBTC", "KXETH", "KXSOL"]; // Kalshi crypto series tickers

function classifyMarket(title: string, category: string): string {
  const text = `${title} ${category}`.toLowerCase();
  if (CRYPTO_KEYWORDS.some(kw => text.includes(kw)) || CRYPTO_SERIES.some(s => text.toUpperCase().includes(s))) return "crypto";
  if (WEATHER_KEYWORDS.some(kw => text.includes(kw))) return "weather";
  if (ECONOMIC_KEYWORDS.some(kw => text.includes(kw))) return "economic";
  return "other";
}

// Stage 1: Scan Kalshi + Polymarket for opportunities
async function scanMarkets(
  onStage: (msg: string) => void
): Promise<any[]> {
  const marketFocus = (await getSetting("market_focus")) || "all";
  onStage(`Fetching open markets (focus: ${marketFocus})…`);

  // Fetch from both platforms + crypto series in parallel
  const [kalshiData, polymarketRaw, ...cryptoSeriesData] = await Promise.all([
    kalshiPublicReq("/markets?status=open&limit=200"),
    fetchPolymarketOpportunities(),
    // Priority fetch for crypto series on Kalshi
    ...CRYPTO_SERIES.map(s => kalshiPublicReq(`/markets?status=open&series_ticker=${s}&limit=50`).catch(() => null)),
  ]);

  // Merge crypto series markets into main list (dedup by ticker)
  const kalshiMarkets = kalshiData?.markets || [];
  const seenTickers = new Set(kalshiMarkets.map((m: any) => m.ticker));
  for (const d of cryptoSeriesData) {
    for (const m of (d?.markets || [])) {
      if (!seenTickers.has(m.ticker)) {
        kalshiMarkets.push(m);
        seenTickers.add(m.ticker);
      }
    }
  }
  onStage(`${kalshiMarkets.length} Kalshi + ${polymarketRaw.length} Polymarket markets fetched`);

  const now = Date.now();

  // Filter Kalshi markets — SHORT-TERM ONLY (0.5h to 168h = 7 days)
  const kalshiCandidates = kalshiMarkets.filter((m: any) => {
    const closeTime = new Date(m.close_time || m.expiration_time).getTime();
    const hoursLeft = (closeTime - now) / (1000 * 60 * 60);
    if (hoursLeft < 0.5 || hoursLeft > 168) return false; // 7 day max
    const title = (m.title || "").toLowerCase();
    const category = (m.category || m.series_ticker || "").toLowerCase();
    const marketType = classifyMarket(title, category);

    // Apply market focus filter
    if (marketFocus !== "all" && marketType !== marketFocus && marketType !== "other") return false;

    const combined = `${title} ${category}`;
    const inEdge = EDGE_CATEGORIES.some(cat => combined.includes(cat.toLowerCase()));
    const isCrypto = marketType === "crypto";
    const isWeather = marketType === "weather";
    return inEdge || isCrypto || isWeather;
  }).map((m: any) => {
    const closeTime = new Date(m.close_time || m.expiration_time).getTime();
    const hoursLeft = (closeTime - now) / (1000 * 60 * 60);
    return {
      ticker: m.ticker,
      title: m.title,
      yes_price: m.yes_ask || m.last_price || 0.5,
      volume: m.volume || 0,
      close: m.close_time || m.expiration_time,
      hours_left: hoursLeft,
      market_type: classifyMarket((m.title || "").toLowerCase(), (m.category || m.series_ticker || "").toLowerCase()),
      platform: "kalshi" as const,
    };
  });

  // Filter Polymarket markets — SHORT-TERM ONLY
  const polyCandidates = polymarketRaw.filter((m: any) => {
    if (!m.question && !m.title) return false;
    const text = ((m.question || m.title || "") + " " + (m.description || "") + " " + (m.category || "")).toLowerCase();
    const endDate = m.end_date_iso || m.endDate;
    if (endDate) {
      const hoursLeft = (new Date(endDate).getTime() - now) / (1000 * 60 * 60);
      if (hoursLeft < 0.5 || hoursLeft > 168) return false; // 7 day max
    }
    const marketType = classifyMarket(text, m.category || "");
    if (marketFocus !== "all" && marketType !== marketFocus && marketType !== "other") return false;
    const isCrypto = CRYPTO_KEYWORDS.some(kw => text.includes(kw));
    const isEdge = EDGE_CATEGORIES.some(cat => text.includes(cat.toLowerCase()));
    const isWeather = WEATHER_KEYWORDS.some(kw => text.includes(kw));
    return isCrypto || isEdge || isWeather;
  }).map((m: any) => {
    const outcomes = m.outcomes || [];
    const prices = m.outcomePrices ? JSON.parse(m.outcomePrices) : [];
    const yesPrice = prices[0] ? parseFloat(prices[0]) : 0.5;
    const endDate = m.end_date_iso || m.endDate;
    const hoursLeft = endDate ? (new Date(endDate).getTime() - now) / (1000 * 60 * 60) : 48;
    return {
      ticker: m.condition_id || m.id || `poly-${Date.now()}`,
      title: m.question || m.title,
      yes_price: yesPrice,
      volume: parseFloat(m.volume || m.volumeNum || "0"),
      close: endDate,
      hours_left: hoursLeft,
      market_type: classifyMarket((m.question || m.title || "").toLowerCase(), (m.category || "").toLowerCase()),
      platform: "polymarket" as const,
      poly_slug: m.slug,
      poly_token_id: outcomes[0]?.id || m.clobTokenIds?.[0],
    };
  });

  const allCandidates = [...kalshiCandidates, ...polyCandidates];
  onStage(`${kalshiCandidates.length} Kalshi + ${polyCandidates.length} Polymarket short-term candidates`);

  // Have Claude score the top candidates for "mispricing potential"
  const summaries = allCandidates.slice(0, 40).map(m => ({
    ticker: m.ticker,
    title: m.title,
    yes_price: m.yes_price,
    volume: m.volume,
    close: m.close,
    hours_left: Math.round(m.hours_left),
    market_type: m.market_type,
    platform: m.platform,
  }));

  if (!summaries.length) {
    onStage("No candidates found in edge categories");
    return [];
  }

  const scored = parseJSON(
    await callClaude(
      `Score these prediction markets 0-100 on mispricing confidence. Only include ≥60. Max 8.

${JSON.stringify(summaries)}

Focus on SHORT-TERM opportunities (crypto hourly/daily, weather daily, economic weekly). Favour markets resolving within 48h.

Return ONLY JSON:
{"scored":[{"ticker":"XX","title":"short","yes_price":0.65,"your_estimate":0.82,"edge":0.17,"score":85,"platform":"kalshi","hours_left":24,"market_type":"crypto","why":"brief reason"}]}

Include "platform", "hours_left", "market_type" from input.`,
      true,
      1000
    )
  );

  const results = (scored?.scored || []).map((s: any) => {
    const orig = allCandidates.find(c => c.ticker === s.ticker);
    return {
      ...s,
      platform: s.platform || orig?.platform || "kalshi",
      hours_left: s.hours_left || orig?.hours_left || 48,
      market_type: s.market_type || orig?.market_type || "other",
      close: orig?.close,
      poly_token_id: orig?.poly_token_id,
      poly_slug: orig?.poly_slug,
    };
  });
  onStage(`${results.length} mispriced markets identified`);
  return results;
}

// Stage 2: Deep research on a single market
async function deepResearch(
  market: any,
  onStage: (msg: string) => void
): Promise<string> {
  onStage(`Researching: ${market.title}…`);

  // For crypto markets, fetch spot prices for additional context
  let cryptoContext = "";
  const titleLower = (market.title || "").toLowerCase();
  const isCrypto = CRYPTO_KEYWORDS.some(kw => titleLower.includes(kw));
  // Weather market detection
  const isWeather = WEATHER_KEYWORDS.some(kw => titleLower.includes(kw));
  let weatherContext = "";

  if (isCrypto) {
    const symbols = ["BTC", "ETH", "SOL"].filter(s => titleLower.includes(s.toLowerCase()) || titleLower.includes({ BTC: "bitcoin", ETH: "ethereum", SOL: "solana" }[s]!));
    if (symbols.length === 0 && titleLower.includes("crypto")) symbols.push("BTC");

    // Fetch spot prices AND 24h bars in parallel
    const results = await Promise.all(symbols.map(async s => {
      const [spotPrice, barsRes] = await Promise.all([
        fetchCryptoSpotPrice(s),
        fetch(`https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=${s}/USD&timeframe=1Hour&limit=24`, {
          headers: { "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID!, "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY! },
          signal: AbortSignal.timeout(10000),
        }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      let barsSummary = "";
      const bars = barsRes?.bars?.[`${s}/USD`] || [];
      if (bars.length >= 2) {
        const oldest = bars[0];
        const newest = bars[bars.length - 1];
        const change24h = ((newest.c - oldest.o) / oldest.o * 100).toFixed(2);
        const high24h = Math.max(...bars.map((b: any) => b.h));
        const low24h = Math.min(...bars.map((b: any) => b.l));
        const momentum = newest.c > oldest.o ? "BULLISH" : "BEARISH";
        barsSummary = ` | 24h change: ${change24h}% (${momentum}) | 24h range: $${low24h.toLocaleString()}-$${high24h.toLocaleString()}`;

        // Threshold distance — extract price threshold from market title
        const priceMatch = market.title.match(/\$?([\d,]+(?:\.\d+)?)\s*(?:k|K)?/);
        if (priceMatch && spotPrice) {
          const threshold = parseFloat(priceMatch[1].replace(/,/g, "")) * (market.title.match(/k|K/) ? 1000 : 1);
          if (threshold > 100) { // sanity check
            const distancePct = ((spotPrice - threshold) / threshold * 100).toFixed(2);
            barsSummary += ` | Distance to $${threshold.toLocaleString()}: ${distancePct}%`;
          }
        }
      }
      return spotPrice ? `${s}/USD: $${spotPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}${barsSummary}` : null;
    }));
    const validPrices = results.filter(Boolean);
    if (validPrices.length) {
      cryptoContext = `\n\nCRYPTO MARKET DATA (Alpaca):\n${validPrices.join("\n")}\nUse these real-time prices and momentum as a baseline for your analysis.`;
    }
  }

  if (isWeather) {
    weatherContext = "\n\nThis is a WEATHER market. Use web search to find the latest weather forecasts, radar data, and meteorological consensus for the location and timeframe in the market title.";
  }

  const hoursLeft = market.hours_left ? ` | Resolves in: ${Math.round(market.hours_left)}h` : "";

  const brief = await callClaude(
    `Research this SHORT-TERM prediction market concisely. Focus on facts that move the probability.

MARKET: "${market.title}" [${market.platform || "kalshi"}]${hoursLeft}
YES PRICE: ${market.yes_price} (${(market.yes_price * 100).toFixed(0)}% implied)${cryptoContext}${weatherContext}

Cover: (1) latest developments, (2) key deciding factors, (3) base rates, (4) expert forecasts.${isCrypto ? " (5) current price action, 24h momentum, and distance to threshold." : ""}${isWeather ? " (5) latest weather forecast and confidence." : ""} Be factual and brief.`,
    true,
    1200
  );

  onStage(`Research complete for ${market.ticker}`);
  return brief;
}

// Stage 3: Council debate — consolidated to 2 calls (was 5)
// Call 1: Bull/Bear/Historian debate in a single prompt (with web search)
// Call 2: Risk Manager synthesizes and decides (no search needed)
async function runCouncilDebate(
  market: any,
  researchBrief: string,
  onStage: (msg: string) => void
): Promise<any> {
  onStage(`Council assembling for: ${market.title}`);

  const context = `MARKET: "${market.title}"
YES PRICE: ${market.yes_price} (${(market.yes_price * 100).toFixed(0)}% implied)
OUR ESTIMATE: ${market.your_estimate} (${(market.your_estimate * 100).toFixed(0)}%)
EDGE: ${((market.your_estimate - market.yes_price) * 100).toFixed(1)}pp

RESEARCH:
${researchBrief}`;

  // Call 1: Combined debate — Bull, Bear, Historian, Devil's Advocate all in one
  onStage("Council debating (bull/bear/historian/devil)…");
  const debateArg = await callClaude(
    `You are a prediction market council with 4 roles. Debate this market concisely.

${context}

Play ALL FOUR roles and return a single JSON object:

1. BULL: strongest case for YES (1 paragraph, confidence 1-10, probability estimate)
2. BEAR: strongest case for NO (1 paragraph, confidence 1-10, probability estimate)
3. HISTORIAN: key base rates and 2-3 precedents (1 paragraph, base rate estimate)
4. DEVIL'S ADVOCATE: critique the stronger side's blind spots (1 paragraph, revised probability)

Return ONLY JSON:
{
  "bull":{"argument":"...","confidence":8,"key_evidence":["e1","e2","e3"],"probability_estimate":0.75},
  "bear":{"argument":"...","confidence":6,"key_evidence":["e1","e2","e3"],"probability_estimate":0.35},
  "historian":{"argument":"...","precedents":[{"event":"...","year":2020,"outcome":"..."}],"base_rate_estimate":0.60},
  "devil":{"argument":"...","blind_spots":["b1","b2"],"risk_factors":["r1","r2"],"revised_probability":0.55}
}`,
    true,
    2000
  );

  const debate = parseJSON(debateArg);
  const bull = debate?.bull || { argument: "No argument", confidence: 5 };
  const bear = debate?.bear || { argument: "No argument", confidence: 5 };
  const historian = debate?.historian || { argument: "No data" };
  const devil = debate?.devil || { argument: "No critique" };
  const bullConf = bull.confidence || 5;
  const bearConf = bear.confidence || 5;

  // Call 2: Risk Manager — synthesize and decide
  onStage("Risk manager deciding…");
  const riskArg = await callClaude(
    `You are the RISK MANAGER. Synthesize this council debate and decide.

MARKET: "${market.title}" | YES PRICE: ${market.yes_price}

BULL (conf ${bullConf}/10, P=${bull.probability_estimate}): ${bull.argument}
BEAR (conf ${bearConf}/10, P=${bear.probability_estimate}): ${bear.argument}
HISTORIAN (base rate ${historian.base_rate_estimate}): ${historian.argument}
DEVIL (revised P=${devil.revised_probability}): ${devil.argument}

HARD RULES:
- Edge must be ≥15pp to bet
- If contract price >$0.70: need "high" confidence AND ≥20pp edge
- Risk/reward ratio must be ≥0.50 (don't risk $0.75 to make $0.25)
- Violating any rule → PASS

Return ONLY JSON:
{"final_probability":0.72,"market_price":${market.yes_price},"edge":0.12,"verdict":"BET_YES"|"BET_NO"|"PASS","confidence":"high"|"medium"|"low","reasoning":"2-3 sentences","kelly_fraction":0.08,"suggested_contracts":5,"max_risk_usd":15.00}`,
    false,
    800
  );

  const risk = parseJSON(riskArg);

  const transcript = {
    bull,
    bear,
    historian,
    devil,
    risk_manager: risk || { verdict: "PASS", reasoning: "Failed to parse" },
  };

  onStage(
    `Council verdict: ${risk?.verdict || "PASS"} (edge: ${((risk?.edge || 0) * 100).toFixed(1)}pp, confidence: ${risk?.confidence || "unknown"})`
  );

  return {
    verdict: risk?.verdict || "PASS",
    confidence: risk?.confidence || "low",
    final_probability: risk?.final_probability || market.your_estimate,
    edge: risk?.edge || 0,
    kelly_fraction: risk?.kelly_fraction || 0,
    suggested_contracts: risk?.suggested_contracts || 0,
    max_risk_usd: risk?.max_risk_usd || 0,
    reasoning: risk?.reasoning || "",
    transcript,
  };
}

// Stage 4: Execute the bet
async function executeBet(
  market: any,
  council: any,
  onStage: (msg: string) => void
): Promise<any> {
  const minEdge = parseFloat((await getSetting("min_edge")) || "0.15");
  const maxBet = parseFloat((await getSetting("max_bet_usd")) || "25");

  if (council.verdict === "PASS" || Math.abs(council.edge) < minEdge) {
    onStage(`Skipping ${market.ticker} — edge ${(council.edge * 100).toFixed(1)}pp below threshold ${(minEdge * 100).toFixed(0)}pp`);
    return null;
  }

  // Hard filter: reject high-price / low-reward bets
  const yesPrice = market.yes_price || 0.5;
  const betPrice = council.verdict === "BET_YES" ? yesPrice : 1 - yesPrice;
  const rewardRatio = (1 - betPrice) / betPrice;
  if (rewardRatio < 0.5) {
    onStage(`Skipping ${market.ticker} — risk/reward ${rewardRatio.toFixed(2)} < 0.50`);
    await insertLog("warn", `Rejected ${market.ticker}: risk/reward ratio ${rewardRatio.toFixed(2)} too low`);
    return null;
  }
  if (betPrice > 0.70 && (council.confidence !== "high" || Math.abs(council.edge) < 0.20)) {
    onStage(`Skipping ${market.ticker} — high-price contract ($${betPrice.toFixed(2)}) requires high confidence + 20pp edge`);
    await insertLog("warn", `Rejected ${market.ticker}: high-price ($${betPrice.toFixed(2)}) with insufficient edge/confidence`);
    return null;
  }

  const side = council.verdict === "BET_YES" ? "yes" : "no";
  const price = side === "yes" ? market.yes_price : 1 - market.yes_price;

  // Position sizing tiers based on time-to-expiry
  const hoursLeft = market.hours_left || 48;
  let tierMaxBet: number;
  if (hoursLeft <= 6) tierMaxBet = 10;       // Hourly: max $10
  else if (hoursLeft <= 48) tierMaxBet = 20;  // Daily: max $20
  else tierMaxBet = 30;                        // Weekly: max $30

  // Use the lower of setting max and tier max
  const effectiveMax = Math.min(maxBet, tierMaxBet);
  // Per-bet cap: 20% of effective max
  const perBetMax = effectiveMax * 0.20;
  const capForBet = Math.max(perBetMax, 2); // At least $2 per bet

  const maxContracts = Math.floor(capForBet / price);
  const contracts = Math.min(council.suggested_contracts || 1, maxContracts, 50);
  const cost = contracts * price;

  if (price <= 0.01 || contracts < 1 || cost <= 0) {
    const reason = price <= 0.01 ? `price $${price.toFixed(4)}` : contracts < 1 ? `contracts=${contracts}` : `cost=$${cost.toFixed(4)}`;
    console.warn(`[predictor] Rejecting invalid bet on ${market.ticker}: ${reason}`);
    await insertLog("warn", `Rejected invalid bet on ${market.ticker}: ${reason}`);
    onStage(`Skipping ${market.ticker} — invalid: ${reason}`);
    return null;
  }

  const platform = market.platform || "kalshi";
  onStage(`Placing ${platform} bet: ${side.toUpperCase()} ${contracts} contracts @ $${price.toFixed(2)} ($${cost.toFixed(2)} risk)`);

  let result: any;

  if (platform === "polymarket") {
    // Polymarket execution via CLOB client REST API
    // Note: requires @polymarket/clob-client or direct API calls
    try {
      const apiKey = process.env.POLY_API_KEY;
      const apiSecret = process.env.POLY_API_SECRET;
      const apiPassphrase = process.env.POLY_API_PASSPHRASE;
      if (!apiKey || !apiSecret || !apiPassphrase) {
        result = { error: true, message: "Polymarket credentials not configured" };
      } else {
        // Place order via Polymarket CLOB API
        const tokenId = market.poly_token_id;
        if (!tokenId) {
          result = { error: true, message: "No token ID for Polymarket market" };
        } else {
          // Use direct API call to CLOB
          const orderPayload = {
            tokenID: tokenId,
            price: price.toFixed(2),
            size: contracts,
            side: side === "yes" ? "BUY" : "BUY", // For NO, we buy the NO token
            type: "GTC",
          };
          onStage(`Polymarket order: ${JSON.stringify(orderPayload)}`);
          // Polymarket requires signed transactions — log for now, execute when CLOB client is fully configured
          await insertLog("info", `[polymarket] Would place order: ${JSON.stringify(orderPayload)}`);
          result = { order: { status: "submitted" }, note: "polymarket_order_logged" };
        }
      }
    } catch (e: any) {
      result = { error: true, message: `Polymarket error: ${e.message}` };
    }
  } else {
    // Kalshi execution
    const orderBody = {
      ticker: market.ticker,
      action: "buy",
      side,
      type: "market",
      count: contracts,
    };
    result = await kalshiReq("/portfolio/orders", "POST", orderBody);
  }

  const betId = `${market.ticker}-${Date.now()}`;
  await pool.query(
    `INSERT INTO predictor_bets (id, market_ticker, market_title, side, contracts, price, cost, confidence, edge, council_verdict, council_transcript, status, platform)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      betId,
      market.ticker,
      market.title,
      side,
      contracts,
      price,
      cost,
      council.confidence === "high" ? 0.9 : council.confidence === "medium" ? 0.7 : 0.5,
      council.edge,
      council.verdict,
      JSON.stringify(council.transcript),
      result?.error ? "failed" : "filled",
      platform,
    ]
  );

  // Save council debate
  await pool.query(
    `INSERT INTO predictor_councils (market_ticker, market_title, our_probability, market_probability, edge, verdict, confidence, transcript)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      market.ticker,
      market.title,
      council.final_probability,
      market.yes_price,
      council.edge,
      council.verdict,
      council.confidence,
      JSON.stringify(council.transcript),
    ]
  );

  if (result?.error) {
    onStage(`Order FAILED: ${result.message}`);
    return { error: true, message: result.message };
  }

  onStage(`Bet placed: ${side.toUpperCase()} ${market.ticker} x ${contracts} @ $${price.toFixed(2)} [${platform}]`);
  return { betId, side, contracts, price, cost, platform, orderId: result?.order?.order_id };
}

// ── Full pipeline ───────────────────────────────────────────────────────────

async function runPredictorPipeline(
  onStage: (stage: number, status: string, msg: string) => void
) {
  onStage(1, "running", "Scanning Kalshi + Polymarket…");
  const candidates = await scanMarkets((msg) => onStage(1, "running", msg));
  onStage(1, "done", `${candidates.length} mispriced markets found`);

  if (!candidates.length) {
    onStage(2, "done", "No opportunities — pipeline complete");
    return { candidates: [], councils: [], bets: [] };
  }

  const councils: any[] = [];
  const bets: any[] = [];

  // Process top 3 candidates through the council
  const maxPositions = parseInt((await getSetting("max_positions")) || "10");
  const toProcess = candidates.slice(0, Math.min(3, maxPositions));

  for (let i = 0; i < toProcess.length; i++) {
    const market = toProcess[i];

    // Task 2: Deduplication — skip if we already have an active position on this market
    const existingBet = await pool.query(
      `SELECT id FROM predictor_bets WHERE market_ticker=$1 AND status NOT IN ('failed') AND pnl IS NULL LIMIT 1`,
      [market.ticker]
    );
    if (existingBet.rows.length > 0) {
      onStage(2, "running", `Skipping ${market.ticker} — already have active position`);
      await insertLog("info", `[pipeline] Skipped ${market.ticker} — duplicate (active position exists)`);
      continue;
    }

    // Task 3: Pre-filter bad risk/reward before wasting API calls on council
    const yesPrice = market.yes_price || 0.5;
    const bestSidePrice = Math.min(yesPrice, 1 - yesPrice); // cheapest side
    const profitRatio = (1 - bestSidePrice) / bestSidePrice; // potential profit / amount risked
    if (profitRatio < 0.5) {
      onStage(2, "running", `Skipping ${market.ticker} — risk/reward ratio ${profitRatio.toFixed(2)} < 0.50 (price ${yesPrice.toFixed(2)})`);
      await insertLog("info", `[pipeline] Skipped ${market.ticker} — poor risk/reward (ratio=${profitRatio.toFixed(2)}, price=${yesPrice.toFixed(2)})`);
      continue;
    }

    onStage(2, "running", `[${i + 1}/${toProcess.length}] Researching ${market.ticker}…`);
    const brief = await deepResearch(market, (msg) => onStage(2, "running", msg));

    onStage(3, "running", `[${i + 1}/${toProcess.length}] Council debating ${market.ticker}…`);
    const council = await runCouncilDebate(market, brief, (msg) => onStage(3, "running", msg));
    councils.push({ market, council });

    if (council.verdict !== "PASS") {
      onStage(4, "running", `Executing bet on ${market.ticker}…`);
      const bet = await executeBet(market, council, (msg) => onStage(4, "running", msg));
      if (bet && !bet.error) bets.push(bet);
    }
  }

  onStage(2, "done", `${councils.length} markets researched`);
  onStage(3, "done", `${councils.filter((c) => c.council.verdict !== "PASS").length} passed council`);
  onStage(4, "done", `${bets.length} bets placed`);

  // Save scan summary
  await pool.query(
    `INSERT INTO predictor_scans (markets_scanned, candidates_found, bets_placed, scan_json)
     VALUES ($1, $2, $3, $4)`,
    [
      candidates.length,
      toProcess.length,
      bets.length,
      JSON.stringify({ candidates, councils: councils.map((c) => ({ ticker: c.market.ticker, verdict: c.council.verdict, edge: c.council.edge })), bets }),
    ]
  );

  return { candidates, councils, bets };
}

// ── Routes ──────────────────────────────────────────────────────────────────

predictorRouter.get("/health", async (_req, res) => {
  const keys = getKalshiKeys();
  res.json({
    status: "ok",
    module: "predictor",
    kalshi_mode: keys.isDemo ? "demo" : "live",
    has_kalshi_creds: keys.isDemo
      ? !!(process.env.KALSHI_EMAIL_DEMO && process.env.KALSHI_PASSWORD_DEMO)
      : !!keys.keyId,
    has_anthropic_key: !!process.env.ANTHROPIC_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// Proxy for Kalshi public market data (CORS workaround)
predictorRouter.get("/markets", async (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || "100");
    const status = (req.query.status as string) || "open";
    const data = await kalshiPublicReq(`/markets?status=${status}&limit=${limit}`);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get Kalshi account / balance
predictorRouter.get("/account", async (_req, res) => {
  try {
    const data = await kalshiReq("/portfolio/balance");
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get active positions
predictorRouter.get("/positions", async (_req, res) => {
  try {
    const data = await kalshiReq("/portfolio/positions?settlement_status=unsettled");
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Run the full pipeline manually
predictorRouter.post("/run", async (_req, res) => {
  try {
    const log: string[] = [];
    const result = await runPredictorPipeline(async (stage, status, msg) => {
      log.push(`S${stage}[${status}]: ${msg}`);
      await insertLog("info", `[pipeline] S${stage}: ${msg}`);
    });
    res.json({ ...result, log });
  } catch (e: any) {
    await insertLog("error", `[pipeline] ERROR: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// Scan only (no execution) — preview mode
predictorRouter.post("/scan", async (_req, res) => {
  try {
    const candidates = await scanMarkets((msg) => {});
    res.json({ candidates });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Run council debate on a specific market (no execution)
predictorRouter.post("/council", async (req, res) => {
  try {
    const { ticker, title, yes_price, your_estimate } = req.body;
    if (!ticker || !title) return res.status(400).json({ error: "ticker and title required" });

    const market = { ticker, title, yes_price: yes_price || 0.5, your_estimate: your_estimate || 0.5 };
    const brief = await deepResearch(market, () => {});
    const council = await runCouncilDebate(market, brief, () => {});
    res.json({ market, research_brief: brief, council });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// History endpoints
predictorRouter.get("/history", async (req, res) => {
  try {
    const type = (req.query.type as string) || "bets";
    switch (type) {
      case "bets": {
        const r = await pool.query(
          "SELECT * FROM predictor_bets ORDER BY logged_at DESC LIMIT 200"
        );
        return res.json(r.rows);
      }
      case "scans": {
        const r = await pool.query(
          "SELECT * FROM predictor_scans ORDER BY logged_at DESC LIMIT 50"
        );
        return res.json(r.rows);
      }
      case "councils": {
        const r = await pool.query(
          "SELECT * FROM predictor_councils ORDER BY logged_at DESC LIMIT 50"
        );
        return res.json(r.rows);
      }
      case "logs": {
        const r = await pool.query(
          "SELECT * FROM predictor_logs ORDER BY logged_at DESC LIMIT 200"
        );
        return res.json(r.rows);
      }
      default:
        return res.status(400).json({ error: "unknown type" });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Settings
predictorRouter.get("/settings", async (_req, res) => {
  try {
    const r = await pool.query("SELECT key, value FROM predictor_settings");
    const settings: any = {};
    r.rows.forEach((row) => (settings[row.key] = row.value));
    res.json(settings);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

predictorRouter.post("/settings", async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: "key required" });
    await setSetting(key, String(value));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Stats for dashboard
predictorRouter.get("/stats", async (_req, res) => {
  try {
    const [bets, councils, scans] = await Promise.all([
      pool.query("SELECT * FROM predictor_bets ORDER BY logged_at DESC LIMIT 100"),
      pool.query("SELECT * FROM predictor_councils ORDER BY logged_at DESC LIMIT 20"),
      pool.query("SELECT * FROM predictor_scans ORDER BY logged_at DESC LIMIT 10"),
    ]);

    const allBets = bets.rows;
    const settled = allBets.filter((b: any) => b.pnl != null);
    // Active = any non-failed, non-settled bet (covers 'filled', 'executed', 'resting', 'pending', etc.)
    const unsettled = allBets.filter((b: any) => b.status !== "failed" && b.pnl == null);
    const wins = settled.filter((b: any) => parseFloat(b.pnl) > 0);
    const settledPnl = settled.reduce((s: number, b: any) => s + (parseFloat(b.pnl) || 0), 0);
    // at_stake = cost of active unsettled bets (skip legacy $0 bets)
    const atStake = unsettled.reduce((s: number, b: any) => s + (parseFloat(b.cost) || 0), 0);
    // potential_payout = contracts (each pays $1 if won) for unsettled bets
    const potentialPayout = unsettled.filter((b: any) => parseFloat(b.cost) > 0).reduce((s: number, b: any) => s + (parseInt(b.contracts) || 0), 0);
    const potentialProfit = potentialPayout - atStake;
    // total_risked stays as all non-failed bets for historical reference
    const nonFailed = allBets.filter((b: any) => b.status !== "failed");
    const totalRisked = nonFailed.reduce((s: number, b: any) => s + (parseFloat(b.cost) || 0), 0);
    const avgEdge = nonFailed.length
      ? nonFailed.reduce((s: number, b: any) => s + (parseFloat(b.edge) || 0), 0) / nonFailed.length
      : 0;

    res.json({
      total_bets: allBets.length,
      settled: settled.length,
      wins: wins.length,
      win_rate: settled.length ? (wins.length / settled.length) * 100 : 0,
      total_pnl: settledPnl,
      settled_pnl: settledPnl,
      at_stake: atStake,
      potential_payout: potentialPayout,
      potential_profit: potentialProfit,
      total_risked: totalRisked,
      roi: totalRisked ? (settledPnl / totalRisked) * 100 : 0,
      avg_edge: avgEdge,
      active_positions: unsettled.length,
      recent_councils: councils.rows.slice(0, 5),
      recent_scans: scans.rows.slice(0, 3),
      recent_bets: allBets.slice(0, 10),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Predictor Chat ────────────────────────────────────────────────────────────

predictorRouter.get("/chat", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM predictor_chat ORDER BY created_at ASC LIMIT 100");
    res.json(r.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

predictorRouter.delete("/chat", async (_req, res) => {
  try {
    await pool.query("DELETE FROM predictor_chat");
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

predictorRouter.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "message required" });

    // Save user message
    await pool.query("INSERT INTO predictor_chat (role, content) VALUES ('user', $1)", [message]);

    // Gather context
    const [betsR, councilsR, settingsR, histR] = await Promise.all([
      pool.query("SELECT * FROM predictor_bets ORDER BY logged_at DESC LIMIT 30"),
      pool.query("SELECT market_title, our_probability, market_probability, edge, verdict, logged_at FROM predictor_councils ORDER BY logged_at DESC LIMIT 10"),
      pool.query("SELECT key, value FROM predictor_settings"),
      pool.query("SELECT role, content FROM predictor_chat ORDER BY created_at DESC LIMIT 20"),
    ]);

    const settings: any = {};
    settingsR.rows.forEach((r: any) => (settings[r.key] = r.value));
    const history = histR.rows.reverse();

    const allBets = betsR.rows;
    const settled = allBets.filter((b: any) => b.pnl != null);
    const wins    = settled.filter((b: any) => parseFloat(b.pnl) > 0).length;
    const totalPnl = settled.reduce((s: number, b: any) => s + (parseFloat(b.pnl) || 0), 0);
    const avgEdge  = allBets.length ? allBets.reduce((s: number, b: any) => s + (parseFloat(b.edge) || 0), 0) / allBets.length : 0;

    const betsContext = allBets.slice(0, 15).map((b: any) =>
      `[${new Date(b.logged_at).toLocaleDateString()}] ${b.side?.toUpperCase()} ${b.market_ticker} — ${b.market_title} | confidence:${(b.confidence*100).toFixed(0)}% edge:${(parseFloat(b.edge)*100).toFixed(1)}pp ${b.pnl != null ? `P&L:$${parseFloat(b.pnl).toFixed(2)}` : "pending"}`
    ).join("\n");

    const councilContext = councilsR.rows.map((c: any) =>
      `[${new Date(c.logged_at).toLocaleDateString()}] ${c.market_title}: market=${(c.market_probability*100).toFixed(0)}% ours=${(c.our_probability*100).toFixed(0)}% edge=${(c.edge*100).toFixed(1)}pp verdict=${c.verdict}`
    ).join("\n");

    const systemPrompt = `You are Claude Predictor, an AI advisor for a Kalshi prediction market betting system at JD CoreDev.

CURRENT SETTINGS:
- Mode: ${settings.mode || "demo"}
- Min edge threshold: ${((parseFloat(settings.min_edge||"0.15"))*100).toFixed(0)}pp
- Max bet size: $${settings.max_bet_usd || "25"}
- Max open positions: ${settings.max_positions || "10"}
- Kelly fraction: ${settings.kelly_fraction || "0.25"}
- Auto-scan: ${settings.cron_enabled === "true" ? "ON (every 12h)" : "OFF"}

PERFORMANCE SUMMARY:
- Total bets: ${allBets.length} (${settled.length} settled, ${allBets.length - settled.length} pending)
- Win rate: ${settled.length ? ((wins/settled.length)*100).toFixed(0) : "—"}% (${wins}W / ${settled.length - wins}L)
- Total P&L: $${totalPnl.toFixed(2)}
- Avg edge taken: ${(avgEdge*100).toFixed(1)}pp

RECENT BETS:
${betsContext || "No bets yet"}

RECENT COUNCIL DEBATES:
${councilContext || "No councils yet"}

INSTRUCTIONS:
- Answer questions about bet decisions, council debates, edge reasoning, and strategy
- Discuss which market categories are performing well/poorly
- Help the user optimise settings (min edge, bet sizing, Kelly fraction)
- Explain why the council agents reached specific verdicts
- Be direct and data-driven. Keep responses concise.
- Do NOT suggest executing live trades — this system is for prediction markets, not equities.`;

    const openaiMessages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-16).map((h: any) => ({ role: h.role as "user" | "assistant", content: h.content })),
    ];

    const openaiRes = await fetch(`${process.env.AI_INTEGRATIONS_OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.AI_INTEGRATIONS_OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: openaiMessages, max_tokens: 800, temperature: 0.7 }),
    });

    if (!openaiRes.ok) throw new Error(`OpenAI error: ${await openaiRes.text()}`);
    const openaiData = await openaiRes.json();
    const content: string = openaiData.choices?.[0]?.message?.content || "No response";

    await pool.query("INSERT INTO predictor_chat (role, content) VALUES ('assistant', $1)", [content]);
    res.json({ content });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Claude proxy for frontend chat about predictions
predictorRouter.post("/claude", async (req, res) => {
  try {
    const { messages, max_tokens = 1200, tools } = req.body;
    const model = "claude-haiku-4-5-20251001";
    const body: any = { model, max_tokens, messages };
    if (tools) body.tools = tools;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (d.usage) {
      await logApiUsage("predictor-chat", model, d.usage.input_tokens || 0, d.usage.output_tokens || 0);
    }
    res.json(d);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// API usage stats — shared across all modules
predictorRouter.get("/usage", async (req, res) => {
  try {
    const module = req.query.module as string | undefined;
    const moduleFilter = module ? "WHERE module = $1" : "";
    const params = module ? [module] : [];

    const [today, week, month, byModule] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(input_tokens),0) as input, COALESCE(SUM(output_tokens),0) as output, COALESCE(SUM(cost_usd),0) as cost FROM api_usage ${moduleFilter ? moduleFilter + " AND" : "WHERE"} logged_at >= NOW() - INTERVAL '1 day'`, params),
      pool.query(`SELECT COALESCE(SUM(input_tokens),0) as input, COALESCE(SUM(output_tokens),0) as output, COALESCE(SUM(cost_usd),0) as cost FROM api_usage ${moduleFilter ? moduleFilter + " AND" : "WHERE"} logged_at >= NOW() - INTERVAL '7 days'`, params),
      pool.query(`SELECT COALESCE(SUM(input_tokens),0) as input, COALESCE(SUM(output_tokens),0) as output, COALESCE(SUM(cost_usd),0) as cost FROM api_usage ${moduleFilter ? moduleFilter + " AND" : "WHERE"} logged_at >= NOW() - INTERVAL '30 days'`, params),
      pool.query(`SELECT module, model, SUM(input_tokens) as input, SUM(output_tokens) as output, SUM(cost_usd) as cost, COUNT(*) as calls FROM api_usage WHERE logged_at >= NOW() - INTERVAL '30 days' GROUP BY module, model ORDER BY cost DESC`),
    ]);

    res.json({
      today: { ...today.rows[0], cost: parseFloat(today.rows[0].cost) },
      week: { ...week.rows[0], cost: parseFloat(week.rows[0].cost) },
      month: { ...month.rows[0], cost: parseFloat(month.rows[0].cost) },
      by_module: byModule.rows.map((r: any) => ({ ...r, cost: parseFloat(r.cost) })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Init ────────────────────────────────────────────────────────────────────

export async function initPredictor() {
  await initPredictorTables();
  console.log("[predictor] tables ready");

  // Cron: scan every 12 hours (00:00 and 12:00 UTC)
  cron.schedule("0 0,12 * * *", async () => {
    const enabled = await getSetting("cron_enabled");
    if (enabled !== "true") return;

    console.log("[predictor-cron] Running scan…");
    await insertLog("info", "[cron] Scheduled prediction scan");

    try {
      await runPredictorPipeline(async (stage, status, msg) => {
        console.log(`[predictor-cron] S${stage}[${status}]: ${msg}`);
        await insertLog("info", `[cron] S${stage}: ${msg}`);
      });
    } catch (e: any) {
      console.error("[predictor-cron] Error:", e.message);
      await insertLog("error", `[cron] ERROR: ${e.message}`);
    }
  });

  console.log("[predictor] cron scheduler ready — cadence: 12h");
}
