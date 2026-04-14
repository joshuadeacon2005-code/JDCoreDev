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
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);
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

  // Default settings
  const defaults: [string, string][] = [
    ["cron_enabled", "false"],
    ["min_edge", "0.15"],
    ["max_bet_usd", "25"],
    ["max_positions", "10"],
    ["kelly_fraction", "0.25"],
    ["mode", "demo"],
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

async function callClaude(prompt: string, useSearch = false, maxTokens = 1500): Promise<string> {
  const body: any = {
    model: "claude-sonnet-4-5",
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
  return (d.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
}

// ── PIPELINE STAGES ─────────────────────────────────────────────────────────

// Stage 1: Scan Kalshi markets for opportunities
async function scanMarkets(
  onStage: (msg: string) => void
): Promise<any[]> {
  onStage("Fetching open markets from Kalshi…");

  // Fetch active markets
  const data = await kalshiPublicReq("/markets?status=open&limit=200");
  const markets = data?.markets || [];

  if (!markets.length) {
    onStage("No markets returned — check Kalshi API connection");
    return [];
  }

  onStage(`${markets.length} open markets — filtering for edge categories…`);

  // Filter to categories where Claude has knowledge edge
  // Also filter out markets closing in <2 hours (too little time to research)
  // and markets with very low volume (illiquid)
  const now = Date.now();
  const candidates = markets.filter((m: any) => {
    const closeTime = new Date(m.close_time || m.expiration_time).getTime();
    const hoursLeft = (closeTime - now) / (1000 * 60 * 60);
    if (hoursLeft < 2 || hoursLeft > 2160) return false; // 2h to 90 days

    // Check if the market title/category matches our edge areas
    const title = (m.title || "").toLowerCase();
    const category = (m.category || m.series_ticker || "").toLowerCase();
    const combined = `${title} ${category}`;

    return EDGE_CATEGORIES.some(
      (cat) =>
        combined.includes(cat.toLowerCase()) ||
        title.includes(cat.toLowerCase())
    );
  });

  onStage(`${candidates.length} candidates in edge categories`);

  // Have Claude quickly score the top candidates for "mispricing potential"
  const summaries = candidates.slice(0, 40).map((m: any) => ({
    ticker: m.ticker,
    title: m.title,
    yes_price: m.yes_ask || m.last_price || 0.5,
    volume: m.volume || 0,
    close: m.close_time || m.expiration_time,
  }));

  const scored = parseJSON(
    await callClaude(
      `You are a prediction market scanner. Review these Kalshi markets and identify ones where the current price seems MISPRICED based on your knowledge. Focus on markets where you have strong domain knowledge and the odds look wrong.

Markets:
${JSON.stringify(summaries, null, 1)}

Score each 0-100 on "mispricing confidence" — how sure are you the market price is significantly wrong?

Return ONLY JSON:
{"scored":[{"ticker":"XX","title":"short title","yes_price":0.65,"your_estimate":0.82,"edge":0.17,"score":85,"why":"brief reason you think it's mispriced"}]}

Only include markets scoring ≥60. Max 8 results.`,
      true
    )
  );

  const results = scored?.scored || [];
  onStage(`${results.length} mispriced markets identified`);
  return results;
}

// Stage 2: Deep research on a single market
async function deepResearch(
  market: any,
  onStage: (msg: string) => void
): Promise<string> {
  onStage(`Researching: ${market.title}…`);

  const brief = await callClaude(
    `You are a prediction market research analyst. Research this market thoroughly:

MARKET: "${market.title}"
CURRENT YES PRICE: ${market.yes_price} (${(market.yes_price * 100).toFixed(0)}% implied probability)

Search for the latest news, data, expert opinions, and historical precedents relevant to this question. Build a comprehensive research brief covering:
1. Current state of affairs and latest developments
2. Key factors that will determine the outcome
3. Historical base rates for similar events
4. Expert/institutional forecasts if available
5. Potential surprises or black swan scenarios

Be thorough but factual. Cite what you find.`,
    true,
    2000
  );

  onStage(`Research complete for ${market.ticker}`);
  return brief;
}

// Stage 3: Council debate — the core innovation
async function runCouncilDebate(
  market: any,
  researchBrief: string,
  onStage: (msg: string) => void
): Promise<any> {
  onStage(`Council assembling for: ${market.title}`);

  const context = `
MARKET: "${market.title}"
CURRENT YES PRICE: ${market.yes_price} (${(market.yes_price * 100).toFixed(0)}% implied probability)
OUR INITIAL ESTIMATE: ${market.your_estimate} (${(market.your_estimate * 100).toFixed(0)}%)
PERCEIVED EDGE: ${((market.your_estimate - market.yes_price) * 100).toFixed(1)}pp

RESEARCH BRIEF:
${researchBrief}
`;

  // Agent 1: The Bull (argues for YES)
  onStage("Bull agent making the case for YES…");
  const bullArg = await callClaude(
    `You are the BULL on a prediction market council. Your role is to make the strongest possible case that this event WILL happen (YES is the right bet).

${context}

Make your strongest argument for YES. Use specific evidence, data, and reasoning. Be persuasive but honest — if the case is weak, say so. Rate your confidence 1-10.

Return ONLY JSON:
{"argument":"your full argument (2-3 paragraphs)","confidence":8,"key_evidence":["evidence1","evidence2","evidence3"],"probability_estimate":0.75}`,
    true
  );

  // Agent 2: The Bear (argues for NO)
  onStage("Bear agent making the case for NO…");
  const bearArg = await callClaude(
    `You are the BEAR on a prediction market council. Your role is to make the strongest possible case that this event will NOT happen (NO is the right bet).

${context}

Make your strongest argument for NO. Use specific evidence, data, and reasoning. Be persuasive but honest — if the case is weak, say so. Rate your confidence 1-10.

Return ONLY JSON:
{"argument":"your full argument (2-3 paragraphs)","confidence":8,"key_evidence":["evidence1","evidence2","evidence3"],"probability_estimate":0.35}`,
    true
  );

  // Agent 3: The Historian (base rates and precedents)
  onStage("Historian agent finding precedents…");
  const historianArg = await callClaude(
    `You are the HISTORIAN on a prediction market council. Your role is to find historical base rates and analogies for this event.

${context}

Find the most relevant historical precedents. What has happened in similar situations? What are the base rates? How often do events like this occur? Be specific with dates, numbers, and percentages.

Return ONLY JSON:
{"argument":"your analysis with specific precedents (2-3 paragraphs)","precedents":[{"event":"description","year":2020,"outcome":"what happened","relevance":"why it matters"}],"base_rate_estimate":0.60}`,
    true,
    2000
  );

  // Agent 4: Devil's Advocate (stress-tests the strongest position)
  const bull = parseJSON(bullArg);
  const bear = parseJSON(bearArg);
  const bullConf = bull?.confidence || 5;
  const bearConf = bear?.confidence || 5;
  const strongerSide = bullConf >= bearConf ? "YES/Bull" : "NO/Bear";
  const strongerArg = bullConf >= bearConf ? bull?.argument : bear?.argument;

  onStage("Devil's advocate stress-testing the leading position…");
  const devilArg = await callClaude(
    `You are the DEVIL'S ADVOCATE on a prediction market council. The ${strongerSide} side is currently winning the debate. Your job is to find every possible flaw, blind spot, and weakness in their argument.

${context}

THE ${strongerSide} ARGUMENT:
${strongerArg}

Tear this apart. What are they missing? What could go wrong with their reasoning? What assumptions are they making? What information might they not have?

Return ONLY JSON:
{"argument":"your critique (2-3 paragraphs)","blind_spots":["blind spot 1","blind spot 2"],"risk_factors":["risk 1","risk 2"],"revised_probability":0.55}`,
    true
  );

  // Agent 5: Risk Manager (sizes the bet)
  onStage("Risk manager calculating optimal position…");
  const historian = parseJSON(historianArg);
  const devil = parseJSON(devilArg);

  const riskArg = await callClaude(
    `You are the RISK MANAGER on a prediction market council. All agents have debated. Now you must synthesize and decide.

${context}

BULL CASE (confidence ${bullConf}/10):
${bull?.argument || "No argument"}
Probability estimate: ${bull?.probability_estimate || "unknown"}

BEAR CASE (confidence ${bearConf}/10):
${bear?.argument || "No argument"}
Probability estimate: ${bear?.probability_estimate || "unknown"}

HISTORIAN BASE RATE: ${historian?.base_rate_estimate || "unknown"}

DEVIL'S ADVOCATE (revised probability): ${devil?.revised_probability || "unknown"}
Blind spots: ${JSON.stringify(devil?.blind_spots || [])}

Your job:
1. Synthesize all perspectives into a final probability estimate
2. Compare to market price to determine if there's a real edge
3. Decide: BET YES, BET NO, or PASS (if edge < 10pp or confidence too low)
4. If betting, recommend position size using fractional Kelly criterion

Return ONLY JSON:
{
  "final_probability": 0.72,
  "market_price": ${market.yes_price},
  "edge": 0.12,
  "verdict": "BET_YES" | "BET_NO" | "PASS",
  "confidence": "high" | "medium" | "low",
  "reasoning": "2-3 sentence synthesis",
  "kelly_fraction": 0.08,
  "suggested_contracts": 5,
  "max_risk_usd": 15.00
}`,
    false
  );

  const risk = parseJSON(riskArg);

  const transcript = {
    bull: bull || { argument: bullArg, confidence: 5 },
    bear: bear || { argument: bearArg, confidence: 5 },
    historian: historian || { argument: historianArg },
    devil: devil || { argument: devilArg },
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

  const side = council.verdict === "BET_YES" ? "yes" : "no";
  const price = side === "yes" ? market.yes_price : 1 - market.yes_price;
  const maxContracts = Math.floor(maxBet / price);
  const contracts = Math.min(council.suggested_contracts || 1, maxContracts, 50);
  const cost = contracts * price;

  if (contracts < 1) {
    onStage(`Skipping — cost per contract too high for max bet of $${maxBet}`);
    return null;
  }

  onStage(`Placing bet: ${side.toUpperCase()} ${contracts} contracts @ $${price.toFixed(2)} ($${cost.toFixed(2)} risk)`);

  // Place the order via Kalshi API
  const orderBody = {
    ticker: market.ticker,
    action: "buy",
    side,
    type: "market",
    count: contracts,
  };

  const result = await kalshiReq("/portfolio/orders", "POST", orderBody);

  const betId = `${market.ticker}-${Date.now()}`;
  await pool.query(
    `INSERT INTO predictor_bets (id, market_ticker, market_title, side, contracts, price, cost, confidence, edge, council_verdict, council_transcript, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
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

  onStage(`✓ Bet placed: ${side.toUpperCase()} ${market.ticker} × ${contracts} @ $${price.toFixed(2)}`);
  return { betId, side, contracts, price, cost, orderId: result?.order?.order_id };
}

// ── Full pipeline ───────────────────────────────────────────────────────────

async function runPredictorPipeline(
  onStage: (stage: number, status: string, msg: string) => void
) {
  onStage(1, "running", "Scanning Kalshi markets…");
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
    const wins = settled.filter((b: any) => parseFloat(b.pnl) > 0);
    const totalPnl = settled.reduce((s: number, b: any) => s + (parseFloat(b.pnl) || 0), 0);
    const totalRisked = allBets.reduce((s: number, b: any) => s + (parseFloat(b.cost) || 0), 0);
    const avgEdge = allBets.length
      ? allBets.reduce((s: number, b: any) => s + (parseFloat(b.edge) || 0), 0) / allBets.length
      : 0;

    res.json({
      total_bets: allBets.length,
      settled: settled.length,
      wins: wins.length,
      win_rate: settled.length ? (wins.length / settled.length) * 100 : 0,
      total_pnl: totalPnl,
      total_risked: totalRisked,
      roi: totalRisked ? (totalPnl / totalRisked) * 100 : 0,
      avg_edge: avgEdge,
      active_positions: allBets.filter((b: any) => b.status === "filled" && b.pnl == null).length,
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
- Auto-scan: ${settings.cron_enabled === "true" ? "ON (every 2h)" : "OFF"}

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
    const body: any = { model: "claude-sonnet-4-5", max_tokens, messages };
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
    res.json(d);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Init ────────────────────────────────────────────────────────────────────

export async function initPredictor() {
  await initPredictorTables();
  console.log("[predictor] tables ready");

  // Cron: scan every 2 hours
  cron.schedule("0 */2 * * *", async () => {
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

  console.log("[predictor] cron scheduler ready — cadence: 2h");
}
