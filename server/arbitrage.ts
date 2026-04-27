/**
 * Claude Arbitrage Engine — Cross-platform prediction market arbitrage
 * Kalshi ↔ Polymarket with AI-powered market matching & risk council
 * Mounted at /api/arbitrage/*
 */

import { Router } from "express";
import cron from "node-cron";
import { pool } from "./db";
import crypto from "crypto";
import { ethers } from "ethers";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY });

export const arbitrageRouter = Router();

// ── Platform API configs ────────────────────────────────────────────────────

const KALSHI_BASE = {
  demo: "https://demo-api.kalshi.co/trade-api/v2",
  prod: "https://trading-api.kalshi.com/trade-api/v2",
};

const POLYMARKET = {
  gamma: "https://gamma-api.polymarket.com",
  clob: "https://clob.polymarket.com",
};

// Kalshi fee model: ceil(0.07 × contracts × price × (1 - price))
function kalshiFee(contracts: number, price: number): number {
  return Math.ceil(0.07 * contracts * price * (1 - price) * 100) / 100;
}

// Polymarket fee: dynamic taker fee, ~2% on most markets (varies)
function polymarketFee(contracts: number, price: number): number {
  return contracts * price * 0.02;
}

// ── DB tables ───────────────────────────────────────────────────────────────

async function initArbTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS arb_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS arb_opportunities (
    id SERIAL PRIMARY KEY,
    kalshi_ticker TEXT,
    kalshi_title TEXT,
    poly_slug TEXT,
    poly_title TEXT,
    match_confidence REAL,
    kalshi_yes_ask REAL,
    kalshi_no_ask REAL,
    poly_yes_ask REAL,
    poly_no_ask REAL,
    best_strategy TEXT,
    combined_cost REAL,
    gross_profit REAL,
    net_profit REAL,
    roi_pct REAL,
    status TEXT DEFAULT 'detected',
    council_json JSONB,
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS arb_executions (
    id TEXT PRIMARY KEY,
    opportunity_id INTEGER REFERENCES arb_opportunities(id),
    leg_a_platform TEXT,
    leg_a_side TEXT,
    leg_a_price REAL,
    leg_a_contracts INTEGER,
    leg_a_order_id TEXT,
    leg_b_platform TEXT,
    leg_b_side TEXT,
    leg_b_price REAL,
    leg_b_contracts INTEGER,
    leg_b_order_id TEXT,
    total_cost REAL,
    expected_profit REAL,
    actual_pnl REAL,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    settled_at TIMESTAMPTZ,
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`ALTER TABLE arb_executions ADD COLUMN IF NOT EXISTS notes TEXT`);

  await pool.query(`CREATE TABLE IF NOT EXISTS arb_matched_markets (
    id SERIAL PRIMARY KEY,
    kalshi_ticker TEXT,
    kalshi_title TEXT,
    kalshi_category TEXT,
    poly_condition_id TEXT,
    poly_slug TEXT,
    poly_title TEXT,
    poly_category TEXT,
    match_method TEXT,
    match_confidence REAL,
    last_checked TIMESTAMPTZ DEFAULT NOW(),
    active BOOLEAN DEFAULT true,
    UNIQUE(kalshi_ticker, poly_condition_id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS arb_scans (
    id SERIAL PRIMARY KEY,
    kalshi_markets INTEGER DEFAULT 0,
    poly_markets INTEGER DEFAULT 0,
    matched_pairs INTEGER DEFAULT 0,
    opportunities_found INTEGER DEFAULT 0,
    executions INTEGER DEFAULT 0,
    scan_json JSONB,
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS arb_logs (
    id SERIAL PRIMARY KEY,
    message TEXT,
    type TEXT DEFAULT 'info',
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  const defaults: [string, string][] = [
    ["cron_enabled", "false"],
    ["min_profit_pct", "1.5"],
    ["max_bet_usd", "50"],
    ["max_concurrent", "8"],
    ["auto_execute", "false"],
    ["kalshi_mode", "demo"],
    ["scan_interval_min", "5"],
    ["cron_last_run", ""],
    ["bot_enabled", "false"],
    ["daily_max_loss_usd", "200"],
  ];
  for (const [k, v] of defaults) {
    await pool.query(
      `INSERT INTO arb_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      [k, v]
    );
  }
}

// ── DB helpers ──────────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const r = await pool.query("SELECT value FROM arb_settings WHERE key=$1", [key]);
  return r.rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string) {
  await pool.query(
    `INSERT INTO arb_settings (key, value, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
    [key, value]
  );
}

async function insertLog(type: string, message: string) {
  await pool.query("INSERT INTO arb_logs (type, message) VALUES ($1,$2)", [type, message]);
}

// ── Platform API helpers ────────────────────────────────────────────────────

// Kalshi public market data (no auth needed)
async function fetchKalshiMarkets(): Promise<any[]> {
  try {
    const isDemo = (await getSetting("kalshi_mode")) === "demo";
    const base = isDemo ? KALSHI_BASE.demo : KALSHI_BASE.prod;
    const res = await fetch(`${base}/markets?status=open&limit=500`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const d = await res.json();
    return (d.markets || []).map((m: any) => ({
      platform: "kalshi",
      ticker: m.ticker,
      title: m.title || m.subtitle || "",
      category: m.category || m.series_ticker || "",
      yes_ask: parseFloat(m.yes_ask) || parseFloat(m.last_price) || 0.5,
      no_ask: m.no_ask ? parseFloat(m.no_ask) : 1 - (parseFloat(m.yes_ask) || 0.5),
      yes_bid: parseFloat(m.yes_bid) || 0,
      no_bid: parseFloat(m.no_bid) || 0,
      volume: parseInt(m.volume) || 0,
      open_interest: parseInt(m.open_interest) || 0,
      close_time: m.close_time || m.expiration_time,
      status: m.status,
    }));
  } catch (e: any) {
    console.error("[arb] Kalshi fetch error:", e.message);
    return [];
  }
}

// Polymarket public market data via Gamma API
async function fetchPolymarketMarkets(): Promise<any[]> {
  try {
    // Fetch active markets with decent volume
    const res = await fetch(
      `${POLYMARKET.gamma}/markets?closed=false&limit=500&order=volume24hr&ascending=false`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!res.ok) return [];
    const markets: any[] = await res.json();

    return markets
      .filter((m: any) => m.active && !m.closed)
      .map((m: any) => {
        const outcomePrices = m.outcomePrices
          ? JSON.parse(m.outcomePrices)
          : [0.5, 0.5];
        const tokens = m.clobTokenIds
          ? JSON.parse(m.clobTokenIds)
          : [];

        return {
          platform: "polymarket",
          condition_id: m.conditionId || m.id,
          slug: m.slug || "",
          title: m.question || m.title || "",
          category: m.category || "",
          yes_ask: parseFloat(outcomePrices[0]) || 0.5,
          no_ask: parseFloat(outcomePrices[1]) || 0.5,
          yes_token: tokens[0] || "",
          no_token: tokens[1] || "",
          volume: parseFloat(m.volume) || 0,
          volume_24h: parseFloat(m.volume24hr) || 0,
          liquidity: parseFloat(m.liquidity) || 0,
          end_date: m.endDate,
          status: m.active ? "open" : "closed",
        };
      });
  } catch (e: any) {
    console.error("[arb] Polymarket fetch error:", e.message);
    return [];
  }
}

// Fetch Polymarket CLOB orderbook for precise pricing
async function fetchPolyOrderbook(tokenId: string): Promise<any> {
  try {
    const res = await fetch(`${POLYMARKET.clob}/book?token_id=${tokenId}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Kalshi order placement ──────────────────────────────────────────────────

function normalisePem(raw: string): string {
  let pem = raw.replace(/\\n/g, "\n").trim();
  if (!pem.includes("-----BEGIN")) {
    const b64 = pem.replace(/\s+/g, "");
    const folded = (b64.match(/.{1,64}/g) ?? [b64]).join("\n");
    return `-----BEGIN PRIVATE KEY-----\n${folded}\n-----END PRIVATE KEY-----\n`;
  }
  const typeMatch = pem.match(/-----BEGIN ([^-]+)-----/);
  const keyType = typeMatch?.[1] ?? "PRIVATE KEY";
  const b64 = pem
    .replace(/-----BEGIN[^-]+-----/g, "")
    .replace(/-----END[^-]+-----/g, "")
    .replace(/\s+/g, "");
  const folded = (b64.match(/.{1,64}/g) ?? [b64]).join("\n");
  return `-----BEGIN ${keyType}-----\n${folded}\n-----END ${keyType}-----\n`;
}

function kalshiSign(privateKeyPem: string, timestamp: string, method: string, path: string): string {
  const pathWithoutQuery = path.split("?")[0];
  const message = `${timestamp}${method.toUpperCase()}/trade-api/v2${pathWithoutQuery}`;
  const pem = normalisePem(privateKeyPem);
  let keyObj: crypto.KeyObject;
  try {
    keyObj = crypto.createPrivateKey({ key: pem, format: "pem" });
  } catch {
    const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    const folded = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
    keyObj = crypto.createPrivateKey({ key: `-----BEGIN RSA PRIVATE KEY-----\n${folded}\n-----END RSA PRIVATE KEY-----\n`, format: "pem" });
  }
  return crypto.sign("sha256", Buffer.from(message), {
    key: keyObj,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  }).toString("base64");
}

async function arbKalshiReq(path: string, method = "GET", body: any = null): Promise<any> {
  const keyId     = process.env.CRON_ALPACA_KEY || ""; // note: Kalshi key stored here
  const privateKey = process.env.CRON_ALPACA_SECRET || "";
  // Determine if demo or prod
  const kalshiKeyId = process.env.KALSHI_KEY_ID_LIVE || "";
  const kalshiPrivKey = process.env.KALSHI_PRIVATE_KEY_LIVE || "";
  const isDemo = !kalshiKeyId || !kalshiPrivKey;
  const base = isDemo ? KALSHI_BASE.demo : KALSHI_BASE.prod;
  const resolvedKey = kalshiKeyId || keyId;
  const resolvedPriv = kalshiPrivKey || privateKey;

  let headers: any = { "Content-Type": "application/json" };
  if (isDemo) {
    headers["Authorization"] = `Bearer ${resolvedKey}`;
  } else {
    const timestamp = String(Date.now());
    const sig = kalshiSign(resolvedPriv, timestamp, method, path);
    headers["KALSHI-ACCESS-KEY"]       = resolvedKey;
    headers["KALSHI-ACCESS-TIMESTAMP"] = timestamp;
    headers["KALSHI-ACCESS-SIGNATURE"] = sig;
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

// ── Polymarket order placement ──────────────────────────────────────────────

const POLY_EXCHANGE_ADDR = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
const POLY_CHAIN_ID_ARB  = 137;

const POLY_ORDER_TYPES_ARB = {
  Order: [
    { name: "salt",          type: "uint256" },
    { name: "maker",         type: "address" },
    { name: "signer",        type: "address" },
    { name: "taker",         type: "address" },
    { name: "tokenId",       type: "uint256" },
    { name: "makerAmount",   type: "uint256" },
    { name: "takerAmount",   type: "uint256" },
    { name: "expiration",    type: "uint256" },
    { name: "nonce",         type: "uint256" },
    { name: "feeRateBps",    type: "uint256" },
    { name: "side",          type: "uint8"   },
    { name: "signatureType", type: "uint8"   },
  ],
};

const POLY_DOMAIN_ARB = {
  name: "Polymarket CTF Exchange",
  version: "1",
  chainId: POLY_CHAIN_ID_ARB,
  verifyingContract: POLY_EXCHANGE_ADDR,
};

function arbPolyHmacHeaders(method: string, path: string, body: string): Record<string, string> {
  const apiKey     = process.env.POLY_API_KEY      || "";
  const apiSecret  = process.env.POLY_API_SECRET   || "";
  const passphrase = process.env.POLY_API_PASSPHRASE || "";
  const ts = String(Math.floor(Date.now() / 1000));
  const message = ts + method.toUpperCase() + path + body;
  const secretBytes = Buffer.from(apiSecret, "base64");
  const sig = crypto.createHmac("sha256", secretBytes).update(message).digest("base64");
  return {
    "POLY-API-KEY":    apiKey,
    "POLY-SIGNATURE":  sig,
    "POLY-TIMESTAMP":  ts,
    "POLY-PASSPHRASE": passphrase,
    "Content-Type":    "application/json",
  };
}

async function arbPlacePolyOrder(
  tokenId: string,
  spendUsdc: number,
  side: 0 | 1, // 0=BUY 1=SELL
  price: number
): Promise<{ orderId: string | null; error?: string }> {
  try {
    const privateKey = process.env.POLY_PRIVATE_KEY || "";
    const funder     = process.env.POLY_FUNDER      || "";
    if (!privateKey || !funder) return { orderId: null, error: "Missing POLY credentials" };

    const pk = privateKey.startsWith("0x") ? privateKey : "0x" + privateKey;
    const wallet = new ethers.Wallet(pk);
    const salt = Math.floor(Math.random() * 1e15);
    const ZERO = "0x0000000000000000000000000000000000000000";
    const takerTokens = price > 0 ? spendUsdc / price : spendUsdc;
    const makerAmt = BigInt(Math.round(spendUsdc * 1e6));
    const takerAmt = BigInt(Math.round(takerTokens * 1e6));

    const orderValue = {
      salt: BigInt(salt), maker: funder, signer: wallet.address, taker: ZERO,
      tokenId: BigInt(tokenId), makerAmount: makerAmt, takerAmount: takerAmt,
      expiration: BigInt(0), nonce: BigInt(0), feeRateBps: BigInt(0),
      side, signatureType: 0,
    };
    const signature = await wallet._signTypedData(POLY_DOMAIN_ARB, POLY_ORDER_TYPES_ARB, orderValue);
    const orderPayload = {
      salt: String(salt), maker: funder, signer: wallet.address, taker: ZERO,
      tokenId, makerAmount: String(makerAmt), takerAmount: String(takerAmt),
      expiration: "0", nonce: "0", feeRateBps: "0", side, signatureType: 0, signature,
    };
    const body = JSON.stringify({ order: orderPayload, orderType: "GTC" });
    const headers = arbPolyHmacHeaders("POST", "/order", body);
    const res = await fetch(`${POLYMARKET.clob}/order`, {
      method: "POST", headers, body, signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (!res.ok || data.errorMsg) return { orderId: null, error: data.errorMsg || `HTTP ${res.status}` };
    return { orderId: data.orderId || data.order_id || null };
  } catch (e: any) {
    return { orderId: null, error: e.message };
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

// In-process Claude calls flowed through Replit's modelfarm proxy, which is
// not reachable from Railway. The matching + council reasoning now runs in a
// scheduled Claude Code routine that POSTs verdicts to /place-arb. Throwing
// here keeps the legacy /run pipeline from silently failing on bad keys.
async function callClaude(_prompt: string, _useSearch = false, _maxTokens = 1500): Promise<string> {
  throw new Error("arbitrage: in-process Claude calls disabled. Use the scheduled routine + /api/arbitrage/place-arb.");
}

// ── STAGE 1: AI-powered market matching ─────────────────────────────────────

async function matchMarkets(
  kalshiMarkets: any[],
  polyMarkets: any[],
  onStage: (msg: string) => void
): Promise<any[]> {
  onStage(`Matching ${kalshiMarkets.length} Kalshi × ${polyMarkets.length} Polymarket markets…`);

  // Check cached matches first
  const cachedRes = await pool.query(
    "SELECT * FROM arb_matched_markets WHERE active = true AND last_checked > NOW() - INTERVAL '6 hours'"
  );
  const cached = cachedRes.rows;
  if (cached.length > 0) {
    onStage(`${cached.length} cached matches found, refreshing prices…`);
  }

  // Build summaries for Claude to match
  const kalshiSummaries = kalshiMarkets.slice(0, 200).map((m) => ({
    ticker: m.ticker,
    title: m.title,
    category: m.category,
    close: m.close_time,
  }));

  const polySummaries = polyMarkets.slice(0, 200).map((m) => ({
    id: m.condition_id,
    slug: m.slug,
    title: m.title,
    category: m.category,
    end: m.end_date,
  }));

  // Claude does the intelligent matching
  const matchResult = parseJSON(
    await callClaude(
      `You are a prediction market analyst. Match markets between Kalshi and Polymarket that are asking the SAME question about the SAME event with the SAME resolution criteria and timeframe.

KALSHI MARKETS:
${JSON.stringify(kalshiSummaries, null, 1)}

POLYMARKET MARKETS:
${JSON.stringify(polySummaries, null, 1)}

Rules:
- Only match if the markets are asking essentially the SAME binary question
- The resolution date/timeframe must be the same or very close
- Partial matches don't count (e.g. "Bitcoin above $100K by June" ≠ "Bitcoin above $95K by June")
- Rate confidence 0-1 (only include ≥0.8)

Return ONLY JSON:
{"matches":[{"kalshi_ticker":"XX","poly_id":"YY","poly_slug":"slug","confidence":0.95,"reasoning":"why they match"}]}

Max 30 matches. Be strict — false matches lose money.`,
      false,
      3000
    )
  );

  const matches = matchResult?.matches || [];
  onStage(`${matches.length} AI-matched pairs found`);

  // Enrich with prices and save to DB
  const enriched = [];
  for (const match of matches) {
    const kalshi = kalshiMarkets.find((m) => m.ticker === match.kalshi_ticker);
    const poly = polyMarkets.find(
      (m) => m.condition_id === match.poly_id || m.slug === match.poly_slug
    );
    if (!kalshi || !poly) continue;

    // Upsert into matched markets cache
    await pool.query(
      `INSERT INTO arb_matched_markets
       (kalshi_ticker, kalshi_title, kalshi_category, poly_condition_id, poly_slug, poly_title, poly_category, match_method, match_confidence, last_checked)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (kalshi_ticker, poly_condition_id)
       DO UPDATE SET match_confidence=$9, last_checked=NOW(), active=true`,
      [
        kalshi.ticker, kalshi.title, kalshi.category,
        poly.condition_id, poly.slug, poly.title, poly.category,
        "claude_ai", match.confidence,
      ]
    );

    enriched.push({
      ...match,
      kalshi,
      poly,
    });
  }

  // Merge with cached matches that weren't re-matched
  for (const c of cached) {
    if (enriched.find((e) => e.kalshi_ticker === c.kalshi_ticker)) continue;
    const kalshi = kalshiMarkets.find((m) => m.ticker === c.kalshi_ticker);
    const poly = polyMarkets.find((m) => m.condition_id === c.poly_condition_id);
    if (kalshi && poly) {
      enriched.push({
        kalshi_ticker: c.kalshi_ticker,
        poly_id: c.poly_condition_id,
        poly_slug: c.poly_slug,
        confidence: c.match_confidence,
        reasoning: "cached match",
        kalshi,
        poly,
      });
    }
  }

  onStage(`${enriched.length} total matched pairs with live prices`);
  return enriched;
}

// ── STAGE 2: Arb detection with fee-adjusted calculations ───────────────────

interface ArbOpportunity {
  kalshi: any;
  poly: any;
  match_confidence: number;
  strategy: string;
  leg_a: { platform: string; side: string; price: number };
  leg_b: { platform: string; side: string; price: number };
  combined_cost: number;
  gross_profit: number;
  fees: number;
  net_profit: number;
  roi_pct: number;
  contracts_recommended: number;
}

function detectArbs(
  matchedPairs: any[],
  minProfitPct: number
): ArbOpportunity[] {
  const opportunities: ArbOpportunity[] = [];

  for (const pair of matchedPairs) {
    const k = pair.kalshi;
    const p = pair.poly;

    // Strategy 1: Buy YES on Kalshi + Buy NO on Polymarket
    const strat1Cost = k.yes_ask + p.no_ask;
    // Strategy 2: Buy NO on Kalshi + Buy YES on Polymarket
    const strat2Cost = k.no_ask + p.yes_ask;
    // Strategy 3: Kalshi same-platform (YES + NO < $1)
    const strat3Cost = k.yes_ask + k.no_ask;
    // Strategy 4: Polymarket same-platform (YES + NO < $1)
    const strat4Cost = p.yes_ask + p.no_ask;

    const strategies = [
      {
        name: "kalshi_yes_poly_no",
        cost: strat1Cost,
        leg_a: { platform: "kalshi", side: "yes", price: k.yes_ask },
        leg_b: { platform: "polymarket", side: "no", price: p.no_ask },
      },
      {
        name: "kalshi_no_poly_yes",
        cost: strat2Cost,
        leg_a: { platform: "kalshi", side: "no", price: k.no_ask },
        leg_b: { platform: "polymarket", side: "yes", price: p.yes_ask },
      },
      {
        name: "kalshi_internal",
        cost: strat3Cost,
        leg_a: { platform: "kalshi", side: "yes", price: k.yes_ask },
        leg_b: { platform: "kalshi", side: "no", price: k.no_ask },
      },
      {
        name: "poly_internal",
        cost: strat4Cost,
        leg_a: { platform: "polymarket", side: "yes", price: p.yes_ask },
        leg_b: { platform: "polymarket", side: "no", price: p.no_ask },
      },
    ];

    for (const strat of strategies) {
      if (strat.cost >= 1.0) continue; // No arb

      const grossProfit = 1.0 - strat.cost;
      const contracts = 10; // Base calculation
      const feeA =
        strat.leg_a.platform === "kalshi"
          ? kalshiFee(contracts, strat.leg_a.price)
          : polymarketFee(contracts, strat.leg_a.price);
      const feeB =
        strat.leg_b.platform === "kalshi"
          ? kalshiFee(contracts, strat.leg_b.price)
          : polymarketFee(contracts, strat.leg_b.price);
      const totalFees = feeA + feeB;
      const netProfitPerContract = grossProfit - totalFees / contracts;
      const roiPct = (netProfitPerContract / strat.cost) * 100;

      if (roiPct < minProfitPct) continue;

      opportunities.push({
        kalshi: k,
        poly: p,
        match_confidence: pair.confidence,
        strategy: strat.name,
        leg_a: strat.leg_a,
        leg_b: strat.leg_b,
        combined_cost: strat.cost,
        gross_profit: grossProfit,
        fees: totalFees / contracts,
        net_profit: netProfitPerContract,
        roi_pct: roiPct,
        contracts_recommended: contracts,
      });
    }
  }

  // Sort by ROI descending
  opportunities.sort((a, b) => b.roi_pct - a.roi_pct);
  return opportunities;
}

// ── STAGE 3: Arb risk council ───────────────────────────────────────────────

async function runArbCouncil(
  opp: ArbOpportunity,
  onStage: (msg: string) => void
): Promise<any> {
  const context = `
ARBITRAGE OPPORTUNITY:
Strategy: ${opp.strategy}
Match confidence: ${(opp.match_confidence * 100).toFixed(0)}%

Kalshi: "${opp.kalshi.title}" (ticker: ${opp.kalshi.ticker})
  YES ask: $${opp.kalshi.yes_ask.toFixed(2)} | NO ask: $${opp.kalshi.no_ask.toFixed(2)}
  Volume: ${opp.kalshi.volume} | Close: ${opp.kalshi.close_time}

Polymarket: "${opp.poly.title}" (slug: ${opp.poly.slug})
  YES ask: $${opp.poly.yes_ask.toFixed(2)} | NO ask: $${opp.poly.no_ask.toFixed(2)}
  Volume: $${opp.poly.volume?.toLocaleString()} | Liquidity: $${opp.poly.liquidity?.toLocaleString()}

LEG A: Buy ${opp.leg_a.side.toUpperCase()} on ${opp.leg_a.platform} @ $${opp.leg_a.price.toFixed(2)}
LEG B: Buy ${opp.leg_b.side.toUpperCase()} on ${opp.leg_b.platform} @ $${opp.leg_b.price.toFixed(2)}
Combined cost: $${opp.combined_cost.toFixed(4)} | Gross profit: $${opp.gross_profit.toFixed(4)} per contract
Estimated fees: $${opp.fees.toFixed(4)} | Net profit: $${opp.net_profit.toFixed(4)} | ROI: ${opp.roi_pct.toFixed(2)}%
`;

  // Agent 1: Market Matcher Validator — are these truly the same market?
  onStage("Validator checking market equivalence…");
  const validatorArg = await callClaude(
    `You are a MARKET EQUIVALENCE VALIDATOR on an arbitrage risk council. Your job is critical: verify these two markets will resolve IDENTICALLY. A false match means guaranteed loss, not guaranteed profit.

${context}

Investigate deeply:
1. Are the resolution criteria identical? (same threshold, same date, same source?)
2. Could one resolve YES while the other resolves NO due to a technicality?
3. Are there edge cases in how each platform defines the outcome?
4. Do the close/end dates match exactly?

Return ONLY JSON:
{"verdict":"MATCH"|"MISMATCH"|"UNCERTAIN","confidence":0.95,"risks":["risk1","risk2"],"resolution_analysis":"detailed analysis of how each platform resolves this market","recommendation":"proceed or abort and why"}`,
    true,
    1500
  );

  // Agent 2: Liquidity Analyst — can we actually execute at these prices?
  onStage("Liquidity analyst checking orderbook depth…");
  const liquidityArg = await callClaude(
    `You are a LIQUIDITY ANALYST on an arbitrage risk council. Your job is to assess whether this arb can actually be executed at the quoted prices without slippage eating the profit.

${context}

Analyse:
1. Is there enough volume on both sides to fill our order at the quoted prices?
2. What's the likely slippage for 10, 50, 100 contracts?
3. How wide are the bid-ask spreads? Could the price move before we execute both legs?
4. Is one platform significantly more liquid than the other? (execution risk)
5. What's the optimal contract count to maximise total profit without excess slippage?

Return ONLY JSON:
{"verdict":"LIQUID"|"THIN"|"ILLIQUID","max_safe_contracts":25,"expected_slippage_pct":0.3,"spread_risk":"low|medium|high","timing_risk":"how fast do we need to execute","optimal_size":15,"reasoning":"analysis"}`,
    false,
    1200
  );

  // Agent 3: Settlement Risk Analyst — what could go wrong between now and settlement?
  onStage("Settlement analyst researching resolution risks…");
  const settlementArg = await callClaude(
    `You are a SETTLEMENT RISK ANALYST on an arbitrage risk council. Your job is to identify everything that could go wrong between trade execution and market settlement.

${context}

Research and consider:
1. Could either platform void/cancel this market before settlement?
2. Are there regulatory risks that could freeze funds on either platform?
3. How long until settlement? Is our capital locked for days, weeks, months?
4. Could the market be settled differently on each platform (ambiguous outcome)?
5. Is there counterparty risk on either platform? (Polymarket is on-chain, Kalshi is centralised)
6. What's the opportunity cost of locking capital in this position?

Return ONLY JSON:
{"verdict":"LOW_RISK"|"MEDIUM_RISK"|"HIGH_RISK","days_to_settlement":14,"capital_lock_concern":"low|medium|high","void_risk":"low|medium|high","platform_risks":["risk1"],"settlement_mismatch_risk":"assessment","recommendation":"proceed or abort"}`,
    true,
    1500
  );

  // Agent 4: Fee & Execution Strategist — optimise the trade
  onStage("Execution strategist optimising trade structure…");
  const executionArg = await callClaude(
    `You are an EXECUTION STRATEGIST on an arbitrage risk council. Your job is to optimise how we execute this arb for maximum profit.

${context}

Optimise:
1. Which leg should we execute first? (the less liquid side first to avoid being stuck with one leg)
2. Should we use limit orders or market orders on each leg?
3. What's the maximum time delay between legs that's acceptable?
4. Should we stagger the execution or go all-in at once?
5. Calculate the exact optimal position size given a max bet of $${(await getSetting("max_bet_usd")) || "50"}
6. Factor in ALL fees precisely: Kalshi fees, Polymarket taker fees, gas costs for Poly

Return ONLY JSON:
{"execute_first":"kalshi|polymarket","order_type_a":"limit|market","order_type_b":"limit|market","max_delay_seconds":30,"stagger":false,"optimal_contracts":15,"total_cost":7.35,"expected_net_profit":0.45,"true_roi_pct":6.12,"execution_plan":"step by step plan"}`,
    false,
    1200
  );

  // Agent 5: Final Risk Manager — synthesise and decide
  onStage("Risk manager synthesising council verdict…");
  const validator = parseJSON(validatorArg);
  const liquidity = parseJSON(liquidityArg);
  const settlement = parseJSON(settlementArg);
  const execution = parseJSON(executionArg);

  const riskArg = await callClaude(
    `You are the FINAL RISK MANAGER on an arbitrage risk council. All agents have reported. Synthesise and make the final call.

${context}

VALIDATOR: ${JSON.stringify(validator)}
LIQUIDITY: ${JSON.stringify(liquidity)}
SETTLEMENT: ${JSON.stringify(settlement)}
EXECUTION: ${JSON.stringify(execution)}

Make the final decision:
- EXECUTE: All agents agree, risks are manageable, profit is real after fees
- PASS: Too risky, false match, insufficient liquidity, or profit too thin after fees
- MONITOR: Opportunity is real but conditions aren't right yet (wait for better prices)

Return ONLY JSON:
{
  "verdict": "EXECUTE"|"PASS"|"MONITOR",
  "confidence": "high"|"medium"|"low",
  "final_roi_pct": 4.5,
  "optimal_contracts": 15,
  "execute_first": "kalshi|polymarket",
  "max_position_usd": 25.00,
  "reasoning": "2-3 sentence final synthesis",
  "warnings": ["warning1"],
  "kill_conditions": ["condition that should trigger immediate exit"]
}`,
    false,
    1000
  );

  const risk = parseJSON(riskArg);

  const transcript = {
    validator: validator || { verdict: "UNCERTAIN", argument: validatorArg },
    liquidity: liquidity || { verdict: "THIN", argument: liquidityArg },
    settlement: settlement || { verdict: "MEDIUM_RISK", argument: settlementArg },
    execution: execution || { argument: executionArg },
    risk_manager: risk || { verdict: "PASS", reasoning: "Failed to parse" },
  };

  onStage(
    `Council verdict: ${risk?.verdict || "PASS"} | ROI: ${risk?.final_roi_pct?.toFixed(2) || "?"}% | Confidence: ${risk?.confidence || "unknown"}`
  );

  return {
    verdict: risk?.verdict || "PASS",
    confidence: risk?.confidence || "low",
    final_roi_pct: risk?.final_roi_pct || opp.roi_pct,
    optimal_contracts: risk?.optimal_contracts || 0,
    execute_first: risk?.execute_first || "kalshi",
    max_position_usd: risk?.max_position_usd || 0,
    reasoning: risk?.reasoning || "",
    warnings: risk?.warnings || [],
    kill_conditions: risk?.kill_conditions || [],
    transcript,
  };
}

// ── STAGE 4: Execution ──────────────────────────────────────────────────────

async function executeArb(
  opp: ArbOpportunity,
  council: any,
  oppId: number,
  onStage: (msg: string) => void
): Promise<any> {
  const autoExec = (await getSetting("auto_execute")) === "true";
  if (!autoExec) {
    onStage(`Auto-execute OFF — opportunity logged for manual review`);
    return { status: "logged", message: "Auto-execute disabled" };
  }

  if (council.verdict !== "EXECUTE") {
    onStage(`Council said ${council.verdict} — skipping execution`);
    return { status: "skipped", verdict: council.verdict };
  }

  const contracts = council.optimal_contracts || 10;
  const execFirst = council.execute_first || "kalshi";
  const execId = `arb-${Date.now()}`;

  onStage(`Executing ${contracts} contracts — ${execFirst} first…`);

  const legA = execFirst === "kalshi" ? opp.leg_a : opp.leg_b;
  const legB = execFirst === "kalshi" ? opp.leg_b : opp.leg_a;

  // Insert execution record as pending
  await pool.query(
    `INSERT INTO arb_executions
     (id, opportunity_id, leg_a_platform, leg_a_side, leg_a_price, leg_a_contracts,
      leg_b_platform, leg_b_side, leg_b_price, leg_b_contracts,
      total_cost, expected_profit, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      execId, oppId,
      legA.platform, legA.side, legA.price, contracts,
      legB.platform, legB.side, legB.price, contracts,
      opp.combined_cost * contracts,
      opp.net_profit * contracts,
      "executing",
    ]
  );

  // ── Execute leg A ────────────────────────────────────────────────────────
  let legAOrderId: string | null = null;
  let legAError: string | undefined;

  if (legA.platform === "kalshi") {
    onStage(`[Leg A] Placing Kalshi ${legA.side.toUpperCase()} order on ${opp.kalshi.ticker}…`);
    const yesPriceCents = Math.max(1, Math.min(99, Math.round(opp.kalshi.yes_ask * 100)));
    const res = await arbKalshiReq("/portfolio/orders", "POST", {
      ticker:    opp.kalshi.ticker,
      action:    "buy",
      side:      legA.side,
      type:      "limit",
      count:     contracts,
      yes_price: yesPriceCents,
    });
    legAOrderId  = res?.order?.order_id ?? null;
    legAError    = res?.error ? res?.message : undefined;
    onStage(legAError ? `[Leg A] Kalshi order failed: ${legAError}` : `[Leg A] Kalshi order placed: ${legAOrderId}`);
  } else if (legA.platform === "polymarket") {
    const tokenId = legA.side === "yes" ? opp.poly.yes_token : opp.poly.no_token;
    const spendUsdc = contracts * legA.price;
    onStage(`[Leg A] Placing Polymarket ${legA.side.toUpperCase()} order on ${opp.poly.slug} (token ${tokenId?.slice(0, 8)}…)…`);
    const res = await arbPlacePolyOrder(tokenId, spendUsdc, 0, legA.price);
    legAOrderId = res.orderId;
    legAError   = res.error;
    onStage(legAError ? `[Leg A] Polymarket order failed: ${legAError}` : `[Leg A] Polymarket order placed: ${legAOrderId}`);
  }

  if (legAError) {
    await pool.query(`UPDATE arb_executions SET status='leg_a_failed', notes=$2 WHERE id=$1`, [execId, legAError]);
    return { status: "leg_a_failed", execId, error: legAError };
  }

  // ── Execute leg B (hedge) ───────────────────────────────────────────────
  let legBOrderId: string | null = null;
  let legBError: string | undefined;

  if (legB.platform === "kalshi") {
    onStage(`[Leg B] Placing Kalshi ${legB.side.toUpperCase()} hedge on ${opp.kalshi.ticker}…`);
    const yesPriceCents = Math.max(1, Math.min(99, Math.round(opp.kalshi.yes_ask * 100)));
    const res = await arbKalshiReq("/portfolio/orders", "POST", {
      ticker:    opp.kalshi.ticker,
      action:    "buy",
      side:      legB.side,
      type:      "limit",
      count:     contracts,
      yes_price: yesPriceCents,
    });
    legBOrderId = res?.order?.order_id ?? null;
    legBError   = res?.error ? res?.message : undefined;
    onStage(legBError ? `[Leg B] Kalshi hedge failed: ${legBError}` : `[Leg B] Kalshi hedge placed: ${legBOrderId}`);
  } else if (legB.platform === "polymarket") {
    const tokenId = legB.side === "yes" ? opp.poly.yes_token : opp.poly.no_token;
    const spendUsdc = contracts * legB.price;
    onStage(`[Leg B] Placing Polymarket ${legB.side.toUpperCase()} hedge on ${opp.poly.slug}…`);
    const res = await arbPlacePolyOrder(tokenId, spendUsdc, 0, legB.price);
    legBOrderId = res.orderId;
    legBError   = res.error;
    onStage(legBError ? `[Leg B] Polymarket hedge failed: ${legBError}` : `[Leg B] Polymarket hedge placed: ${legBOrderId}`);
  }

  const finalStatus = legBError ? "leg_b_failed" : "executed";
  await pool.query(
    `UPDATE arb_executions SET status=$2, notes=$3 WHERE id=$1`,
    [execId, finalStatus, legBError ? `LegB failed: ${legBError}` : `LegA: ${legAOrderId} | LegB: ${legBOrderId}`]
  );

  onStage(`✓ Arb ${finalStatus === "executed" ? "complete" : "partial"}: ${execId} — ${contracts}× ${opp.strategy} | Expected profit: $${(opp.net_profit * contracts).toFixed(2)}`);
  await insertLog("execution", `Arb ${finalStatus}: ${execId} | strategy=${opp.strategy} | profit=$${(opp.net_profit * contracts).toFixed(2)}`);
  return { status: finalStatus, execId, contracts, expectedProfit: opp.net_profit * contracts, legAOrderId, legBOrderId };
}

// ── Full pipeline ───────────────────────────────────────────────────────────

async function runArbPipeline(
  onStage: (stage: number, status: string, msg: string) => void
) {
  const minProfitPct = parseFloat((await getSetting("min_profit_pct")) || "1.5");

  // Stage 1: Fetch markets from both platforms
  onStage(1, "running", "Fetching Kalshi markets…");
  const kalshiMarkets = await fetchKalshiMarkets();
  onStage(1, "running", `${kalshiMarkets.length} Kalshi markets`);

  onStage(1, "running", "Fetching Polymarket markets…");
  const polyMarkets = await fetchPolymarketMarkets();
  onStage(1, "done", `${kalshiMarkets.length} Kalshi + ${polyMarkets.length} Polymarket markets fetched`);

  if (!kalshiMarkets.length || !polyMarkets.length) {
    onStage(2, "done", "Missing market data from one or both platforms");
    return { kalshiMarkets: kalshiMarkets.length, polyMarkets: polyMarkets.length, matched: 0, opportunities: [], councils: [], executions: [] };
  }

  // Stage 2: AI-powered market matching
  onStage(2, "running", "AI matching markets across platforms…");
  const matched = await matchMarkets(kalshiMarkets, polyMarkets, (msg) => onStage(2, "running", msg));
  onStage(2, "done", `${matched.length} matched pairs`);

  // Stage 3: Detect arb opportunities
  onStage(3, "running", "Scanning for price discrepancies…");
  const rawOpps = detectArbs(matched, minProfitPct);
  onStage(3, "running", `${rawOpps.length} raw opportunities (≥${minProfitPct}% ROI after fees)`);

  if (!rawOpps.length) {
    onStage(3, "done", "No profitable opportunities found this scan");
    await pool.query(
      `INSERT INTO arb_scans (kalshi_markets, poly_markets, matched_pairs, opportunities_found, executions)
       VALUES ($1,$2,$3,$4,$5)`,
      [kalshiMarkets.length, polyMarkets.length, matched.length, 0, 0]
    );
    return { kalshiMarkets: kalshiMarkets.length, polyMarkets: polyMarkets.length, matched: matched.length, opportunities: [], councils: [], executions: [] };
  }

  // Stage 4: Run council on top opportunities
  const topOpps = rawOpps.slice(0, 3);
  const councils: any[] = [];
  const executions: any[] = [];

  for (let i = 0; i < topOpps.length; i++) {
    const opp = topOpps[i];

    // Save opportunity to DB
    const oppRes = await pool.query(
      `INSERT INTO arb_opportunities
       (kalshi_ticker, kalshi_title, poly_slug, poly_title, match_confidence,
        kalshi_yes_ask, kalshi_no_ask, poly_yes_ask, poly_no_ask,
        best_strategy, combined_cost, gross_profit, net_profit, roi_pct, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [
        opp.kalshi.ticker, opp.kalshi.title, opp.poly.slug, opp.poly.title,
        opp.match_confidence,
        opp.kalshi.yes_ask, opp.kalshi.no_ask, opp.poly.yes_ask, opp.poly.no_ask,
        opp.strategy, opp.combined_cost, opp.gross_profit, opp.net_profit, opp.roi_pct,
        "detected",
      ]
    );
    const oppId = oppRes.rows[0].id;

    // Run council
    onStage(4, "running", `[${i + 1}/${topOpps.length}] Council reviewing ${opp.kalshi.ticker} ↔ ${opp.poly.slug}…`);
    const council = await runArbCouncil(opp, (msg) => onStage(4, "running", msg));
    councils.push({ opp, council });

    // Update opportunity with council result
    await pool.query(
      `UPDATE arb_opportunities SET council_json = $1, status = $2 WHERE id = $3`,
      [JSON.stringify(council.transcript), council.verdict === "EXECUTE" ? "approved" : council.verdict === "MONITOR" ? "monitoring" : "rejected", oppId]
    );

    // Execute if approved
    if (council.verdict === "EXECUTE") {
      onStage(5, "running", `Executing arb on ${opp.kalshi.ticker}…`);
      const exec = await executeArb(opp, council, oppId, (msg) => onStage(5, "running", msg));
      executions.push(exec);
    }
  }

  onStage(4, "done", `${councils.length} opportunities reviewed by council`);
  onStage(5, "done", `${executions.length} arbs executed`);

  // Save scan summary
  await pool.query(
    `INSERT INTO arb_scans (kalshi_markets, poly_markets, matched_pairs, opportunities_found, executions, scan_json)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      kalshiMarkets.length, polyMarkets.length, matched.length,
      rawOpps.length, executions.length,
      JSON.stringify({
        all_opportunities: rawOpps.map((o) => ({
          strategy: o.strategy,
          kalshi: o.kalshi.ticker,
          poly: o.poly.slug,
          roi: o.roi_pct,
          cost: o.combined_cost,
        })),
      }),
    ]
  );

  return {
    kalshiMarkets: kalshiMarkets.length,
    polyMarkets: polyMarkets.length,
    matched: matched.length,
    opportunities: rawOpps,
    councils,
    executions,
  };
}

// ── Routine bridge: /trigger-routine ────────────────────────────────────────
arbitrageRouter.post("/trigger-routine", async (req, res) => {
  try {
    const url = process.env.ARBITRAGE_ROUTINE_URL;
    if (!url) return res.status(503).json({ error: "ARBITRAGE_ROUTINE_URL not configured" });
    const apiKey = process.env.ANTHROPIC_TRIGGER_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(req.body || {}),
    }).catch((e) => {
      console.error("[arbitrage] trigger-routine error:", e.message);
      void insertLog("error", `[trigger-routine] ${e.message}`);
    });

    await insertLog("info", "[trigger-routine] fired");
    res.status(202).json({ ok: true, status: "fired" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Routine bridge: /place-arb ──────────────────────────────────────────────
// A scheduled routine resolves the council debate in its own context, then
// posts a structured verdict here for the server to execute on Kalshi and
// Polymarket. Both legs go in atomic-ish — on Leg-A failure we abort, on
// Leg-B failure we mark the execution leg_b_failed for human cleanup.
arbitrageRouter.post("/place-arb", async (req, res) => {
  try {
    const {
      matched_market_id,
      kalshi_ticker, kalshi_side, kalshi_contracts, kalshi_price,
      poly_token_id, poly_side, poly_size, poly_price,
      expected_edge,
      council_transcript,
    } = req.body || {};

    if (!kalshi_ticker || !kalshi_side || !kalshi_contracts || !poly_token_id || !poly_side || !poly_size) {
      return res.status(400).json({ error: "missing kalshi_/poly_ leg fields" });
    }
    if (kalshi_side !== "yes" && kalshi_side !== "no") {
      return res.status(400).json({ error: "kalshi_side must be 'yes' or 'no'" });
    }
    if (poly_side !== "BUY" && poly_side !== "SELL") {
      return res.status(400).json({ error: "poly_side must be 'BUY' or 'SELL'" });
    }

    const botEnabled = (await getSetting("bot_enabled")) === "true";
    if (!botEnabled) {
      return res.status(409).json({ error: "bot_enabled is false — kill switch engaged" });
    }
    if (!process.env.POLY_API_SECRET || !process.env.POLY_API_PASSPHRASE) {
      return res.status(503).json({ error: "POLY_API_SECRET / POLY_API_PASSPHRASE not configured" });
    }

    const lossCapRaw = await getSetting("daily_max_loss_usd");
    if (lossCapRaw) {
      const cap = parseFloat(lossCapRaw);
      if (cap > 0) {
        // arb_executions.expected_profit is positive on win — we approximate
        // realised loss using executions marked leg_b_failed in the last 24h.
        const r = await pool.query(
          `SELECT COALESCE(SUM(CASE WHEN status LIKE 'leg_%_failed' THEN total_cost ELSE 0 END), 0) AS loss
             FROM arb_executions
            WHERE logged_at > NOW() - INTERVAL '24 hours'`
        );
        const loss24h = parseFloat(r.rows?.[0]?.loss ?? "0");
        if (loss24h >= cap) {
          return res.status(409).json({
            error: `daily loss cap hit (loss24h=${loss24h.toFixed(2)}, cap=${cap})`,
          });
        }
      }
    }

    const execId = `arb-${Date.now()}`;
    const totalCost = (kalshi_contracts * kalshi_price) + (poly_size * poly_price);

    await pool.query(
      `INSERT INTO arb_executions
       (id, opportunity_id, leg_a_platform, leg_a_side, leg_a_price, leg_a_contracts,
        leg_b_platform, leg_b_side, leg_b_price, leg_b_contracts,
        total_cost, expected_profit, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        execId, matched_market_id ?? null,
        "kalshi", kalshi_side, kalshi_price, kalshi_contracts,
        "polymarket", poly_side.toLowerCase(), poly_price, poly_size,
        totalCost, (expected_edge || 0) * (kalshi_contracts + poly_size),
        "executing",
      ]
    );

    // Leg A — Kalshi.
    const yesPriceCents = Math.max(1, Math.min(99, Math.round(kalshi_price * 100)));
    const kRes = await arbKalshiReq("/portfolio/orders", "POST", {
      ticker:    kalshi_ticker,
      action:    "buy",
      side:      kalshi_side,
      type:      "limit",
      count:     kalshi_contracts,
      yes_price: yesPriceCents,
    });
    if (kRes?.error) {
      const msg = kRes?.message || "kalshi order failed";
      await pool.query(`UPDATE arb_executions SET status='leg_a_failed', notes=$2 WHERE id=$1`, [execId, msg]);
      await insertLog("error", `[place-arb] ${execId} kalshi: ${msg}`);
      return res.status(502).json({ error: msg, execId, leg: "kalshi" });
    }
    const kalshiOrderId = kRes?.order?.order_id ?? null;

    // Leg B — Polymarket.
    const polySpendUsdc = poly_size * poly_price;
    const polySideCode = poly_side === "BUY" ? 0 : 1;
    const pRes = await arbPlacePolyOrder(poly_token_id, polySpendUsdc, polySideCode as 0 | 1, poly_price);
    if (pRes?.error) {
      await pool.query(
        `UPDATE arb_executions SET status='leg_b_failed', notes=$2 WHERE id=$1`,
        [execId, `kalshi=${kalshiOrderId} poly_failed: ${pRes.error}`]
      );
      await insertLog("error", `[place-arb] ${execId} poly: ${pRes.error}`);
      return res.status(502).json({ error: pRes.error, execId, leg: "polymarket", kalshiOrderId });
    }

    const notes = `kalshi=${kalshiOrderId} | poly=${pRes.orderId} | council=${council_transcript ? "yes" : "no"}`;
    await pool.query(`UPDATE arb_executions SET status='executed', notes=$2 WHERE id=$1`, [execId, notes]);
    await insertLog("execution", `[place-arb] ${execId} executed`);

    return res.json({ ok: true, execId, kalshiOrderId, polyOrderId: pRes.orderId });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── Routes ──────────────────────────────────────────────────────────────────

arbitrageRouter.get("/health", async (_req, res) => {
  res.json({
    status: "ok",
    module: "arbitrage",
    has_anthropic_key: !!process.env.ANTHROPIC_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// Run full pipeline
arbitrageRouter.post("/run", async (_req, res) => {
  try {
    const log: string[] = [];
    const result = await runArbPipeline(async (stage, status, msg) => {
      log.push(`S${stage}[${status}]: ${msg}`);
      await insertLog("info", `[pipeline] S${stage}: ${msg}`);
    });
    res.json({ ...result, log });
  } catch (e: any) {
    await insertLog("error", `[pipeline] ERROR: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// Quick scan (no council, no execution — just find opps)
arbitrageRouter.post("/scan", async (_req, res) => {
  try {
    const minProfitPct = parseFloat((await getSetting("min_profit_pct")) || "1.5");
    const [kalshi, poly] = await Promise.all([fetchKalshiMarkets(), fetchPolymarketMarkets()]);
    const matched = await matchMarkets(kalshi, poly, () => {});
    const opps = detectArbs(matched, minProfitPct);
    res.json({
      kalshi_count: kalshi.length,
      poly_count: poly.length,
      matched_pairs: matched.length,
      opportunities: opps.slice(0, 20),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Run council on specific opportunity
arbitrageRouter.post("/council", async (req, res) => {
  try {
    const { opportunity_id } = req.body;
    const oppRes = await pool.query("SELECT * FROM arb_opportunities WHERE id = $1", [opportunity_id]);
    if (!oppRes.rows.length) return res.status(404).json({ error: "Opportunity not found" });

    const opp = oppRes.rows[0];
    const arbOpp: ArbOpportunity = {
      kalshi: { ticker: opp.kalshi_ticker, title: opp.kalshi_title, yes_ask: opp.kalshi_yes_ask, no_ask: opp.kalshi_no_ask, volume: 0, close_time: "" },
      poly: { slug: opp.poly_slug, title: opp.poly_title, yes_ask: opp.poly_yes_ask, no_ask: opp.poly_no_ask, volume: 0, liquidity: 0 },
      match_confidence: opp.match_confidence,
      strategy: opp.best_strategy,
      leg_a: { platform: opp.best_strategy.startsWith("kalshi") ? "kalshi" : "polymarket", side: opp.best_strategy.includes("yes") ? "yes" : "no", price: opp.best_strategy.startsWith("kalshi") ? opp.kalshi_yes_ask : opp.poly_yes_ask },
      leg_b: { platform: opp.best_strategy.includes("poly") ? "polymarket" : "kalshi", side: opp.best_strategy.endsWith("no") ? "no" : "yes", price: opp.best_strategy.includes("poly") ? opp.poly_no_ask : opp.kalshi_no_ask },
      combined_cost: opp.combined_cost,
      gross_profit: opp.gross_profit,
      fees: 0,
      net_profit: opp.net_profit,
      roi_pct: opp.roi_pct,
      contracts_recommended: 10,
    };

    const council = await runArbCouncil(arbOpp, () => {});
    await pool.query("UPDATE arb_opportunities SET council_json = $1, status = $2 WHERE id = $3", [
      JSON.stringify(council.transcript),
      council.verdict === "EXECUTE" ? "approved" : council.verdict === "MONITOR" ? "monitoring" : "rejected",
      opportunity_id,
    ]);

    res.json({ opportunity: opp, council });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Fetch matched markets
arbitrageRouter.get("/matched-markets", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM arb_matched_markets WHERE active = true ORDER BY match_confidence DESC");
    res.json(r.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// History
arbitrageRouter.get("/history", async (req, res) => {
  try {
    const type = (req.query.type as string) || "opportunities";
    switch (type) {
      case "opportunities": {
        const r = await pool.query("SELECT * FROM arb_opportunities ORDER BY logged_at DESC LIMIT 200");
        return res.json(r.rows);
      }
      case "executions": {
        const r = await pool.query("SELECT * FROM arb_executions ORDER BY logged_at DESC LIMIT 100");
        return res.json(r.rows);
      }
      case "scans": {
        const r = await pool.query("SELECT * FROM arb_scans ORDER BY logged_at DESC LIMIT 50");
        return res.json(r.rows);
      }
      case "logs": {
        const r = await pool.query("SELECT * FROM arb_logs ORDER BY logged_at DESC LIMIT 200");
        return res.json(r.rows);
      }
      default:
        return res.status(400).json({ error: "unknown type" });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Stats
arbitrageRouter.get("/stats", async (_req, res) => {
  try {
    const [opps, execs, scans, matched] = await Promise.all([
      pool.query("SELECT * FROM arb_opportunities ORDER BY logged_at DESC LIMIT 100"),
      pool.query("SELECT * FROM arb_executions ORDER BY logged_at DESC LIMIT 50"),
      pool.query("SELECT * FROM arb_scans ORDER BY logged_at DESC LIMIT 10"),
      pool.query("SELECT COUNT(*) as count FROM arb_matched_markets WHERE active = true"),
    ]);

    const allExecs = execs.rows;
    const settled = allExecs.filter((e: any) => e.actual_pnl != null);
    const totalPnl = settled.reduce((s: number, e: any) => s + (parseFloat(e.actual_pnl) || 0), 0);
    const totalRisked = allExecs.reduce((s: number, e: any) => s + (parseFloat(e.total_cost) || 0), 0);
    const wins = settled.filter((e: any) => parseFloat(e.actual_pnl) > 0);

    const allOpps = opps.rows;
    const avgRoi = allOpps.length
      ? allOpps.reduce((s: number, o: any) => s + (parseFloat(o.roi_pct) || 0), 0) / allOpps.length
      : 0;

    res.json({
      matched_markets: parseInt(matched.rows[0].count),
      total_opportunities: allOpps.length,
      approved: allOpps.filter((o: any) => o.status === "approved").length,
      rejected: allOpps.filter((o: any) => o.status === "rejected").length,
      monitoring: allOpps.filter((o: any) => o.status === "monitoring").length,
      total_executions: allExecs.length,
      settled: settled.length,
      wins: wins.length,
      win_rate: settled.length ? (wins.length / settled.length) * 100 : 0,
      total_pnl: totalPnl,
      total_risked: totalRisked,
      avg_roi: avgRoi,
      recent_opportunities: allOpps.slice(0, 10),
      recent_executions: allExecs.slice(0, 10),
      recent_scans: scans.rows.slice(0, 5),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Settings
arbitrageRouter.get("/settings", async (_req, res) => {
  try {
    const r = await pool.query("SELECT key, value FROM arb_settings");
    const settings: any = {};
    r.rows.forEach((row) => (settings[row.key] = row.value));
    res.json(settings);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

arbitrageRouter.post("/settings", async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: "key required" });
    await setSetting(key, String(value));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Claude proxy
arbitrageRouter.post("/claude", async (req, res) => {
  try {
    const { messages, max_tokens = 1200, tools } = req.body;
    const params: any = { model: "claude-sonnet-4-5", max_tokens, messages };
    if (tools) params.tools = tools;
    const d = await anthropic.messages.create(params);
    res.json(d);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Init ────────────────────────────────────────────────────────────────────

export async function initArbitrage() {
  await initArbTables();
  console.log("[arbitrage] tables ready");

  // Tick every minute; interval is controlled by scan_interval_min setting
  cron.schedule("* * * * *", async () => {
    const enabled = await getSetting("cron_enabled");
    if (enabled !== "true") return;

    const intervalMin = parseFloat((await getSetting("scan_interval_min")) || "5");
    const lastRaw = await getSetting("cron_last_run");
    if (lastRaw) {
      const elapsed = (Date.now() - new Date(lastRaw).getTime()) / 60000;
      if (elapsed < intervalMin) return;
    }
    await setSetting("cron_last_run", new Date().toISOString());

    console.log("[arb-cron] Running scan…");
    await insertLog("info", "[cron] Arbitrage scan triggered");

    try {
      await runArbPipeline(async (stage, status, msg) => {
        console.log(`[arb-cron] S${stage}[${status}]: ${msg}`);
        await insertLog("info", `[cron] S${stage}: ${msg}`);
      });
    } catch (e: any) {
      console.error("[arb-cron] Error:", e.message);
      await insertLog("error", `[cron] ERROR: ${e.message}`);
    }
  });

  console.log("[arbitrage] cron scheduler ready — interval controlled by scan_interval_min");
}
