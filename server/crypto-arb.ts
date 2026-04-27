/**
 * Crypto Hedge Arb Engine — Kalshi crypto prediction contracts vs actual spot prices
 * Finds mispriced Kalshi contracts and hedges with opposite position on Alpaca
 * Mounted at /api/crypto-arb/*
 */

import { Router } from "express";
import cron from "node-cron";
import crypto from "crypto";
import { pool } from "./db";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY });

export const cryptoArbRouter = Router();

// ── Config ──────────────────────────────────────────────────────────────────

const KALSHI_BASE = {
  demo: "https://demo-api.kalshi.co/trade-api/v2",
  prod: "https://trading-api.kalshi.com/trade-api/v2",
};

const ALPACA = {
  paper: "https://paper-api.alpaca.markets",
  live: "https://api.alpaca.markets",
  data: "https://data.alpaca.markets",
};

const CRYPTO_SYMBOLS: Record<string, string> = {
  BTC: "BTCUSD",
  ETH: "ETHUSD",
  SOL: "SOLUSD",
  XRP: "XRPUSD",
  DOGE: "DOGEUSD",
};

// ── DB ──────────────────────────────────────────────────────────────────────

async function initCryptoArbTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS crypto_arb_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS crypto_arb_opportunities (
    id SERIAL PRIMARY KEY,
    kalshi_ticker TEXT,
    kalshi_title TEXT,
    crypto_symbol TEXT,
    contract_type TEXT,
    threshold REAL,
    direction TEXT,
    kalshi_price REAL,
    fair_value REAL,
    spot_price REAL,
    edge REAL,
    edge_pct REAL,
    time_to_expiry_min INTEGER,
    volatility_context TEXT,
    strategy TEXT,
    council_json JSONB,
    status TEXT DEFAULT 'detected',
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS crypto_arb_executions (
    id TEXT PRIMARY KEY,
    opportunity_id INTEGER,
    kalshi_side TEXT,
    kalshi_price REAL,
    kalshi_contracts INTEGER,
    kalshi_order_id TEXT,
    hedge_symbol TEXT,
    hedge_side TEXT,
    hedge_qty REAL,
    hedge_order_id TEXT,
    total_cost REAL,
    expected_profit REAL,
    actual_pnl REAL,
    status TEXT DEFAULT 'pending',
    settled_at TIMESTAMPTZ,
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS crypto_arb_scans (
    id SERIAL PRIMARY KEY,
    contracts_scanned INTEGER DEFAULT 0,
    opportunities_found INTEGER DEFAULT 0,
    executions INTEGER DEFAULT 0,
    scan_json JSONB,
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS crypto_arb_logs (
    id SERIAL PRIMARY KEY,
    message TEXT,
    type TEXT DEFAULT 'info',
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  const defaults: [string, string][] = [
    ["cron_enabled", "false"],
    ["min_edge_pct", "8"],
    ["max_bet_usd", "50"],
    ["max_concurrent", "5"],
    ["auto_execute", "false"],
    ["kalshi_mode", "demo"],
    ["hedge_enabled", "true"],
    ["scan_interval_min", "3"],
    ["cron_last_run", ""],
    ["bot_enabled", "false"],
    ["daily_max_loss_usd", "150"],
  ];
  for (const [k, v] of defaults) {
    await pool.query(`INSERT INTO crypto_arb_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`, [k, v]);
  }
}

async function getSetting(key: string): Promise<string | null> {
  const r = await pool.query("SELECT value FROM crypto_arb_settings WHERE key=$1", [key]);
  return r.rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string) {
  await pool.query(`INSERT INTO crypto_arb_settings (key,value,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`, [key, value]);
}

async function insertLog(type: string, message: string) {
  await pool.query("INSERT INTO crypto_arb_logs (type,message) VALUES ($1,$2)", [type, message]);
}

// ── Kalshi API (public, no auth for market data) ────────────────────────────

async function fetchKalshiCryptoContracts(): Promise<any[]> {
  const isDemo = (await getSetting("kalshi_mode")) === "demo";
  const base = isDemo ? KALSHI_BASE.demo : KALSHI_BASE.prod;

  try {
    // Fetch crypto markets — hourly and daily
    const res = await fetch(`${base}/markets?status=open&limit=500&series_ticker=KXBTC,KXETH,KXSOL,KXBTCD,KXETHD,KXSOLD,KXBTCR,KXETHR,KXSOLR`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      // Fallback: fetch all open markets and filter for crypto
      const fallbackRes = await fetch(`${base}/markets?status=open&limit=1000`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20000),
      });
      if (!fallbackRes.ok) return [];
      const d = await fallbackRes.json();
      const all = d.markets || [];
      return all.filter((m: any) => {
        const t = (m.title || "").toLowerCase();
        const ticker = (m.ticker || "").toUpperCase();
        return (
          t.includes("bitcoin") || t.includes("btc") ||
          t.includes("ethereum") || t.includes("eth") ||
          t.includes("solana") || t.includes("sol") ||
          ticker.includes("KXBTC") || ticker.includes("KXETH") || ticker.includes("KXSOL")
        );
      }).map(parseKalshiContract);
    }

    const d = await res.json();
    return (d.markets || []).map(parseKalshiContract);
  } catch (e: any) {
    console.error("[crypto-arb] Kalshi fetch error:", e.message);
    return [];
  }
}

function parseKalshiContract(m: any) {
  const title = m.title || "";
  const ticker = m.ticker || "";

  // Parse crypto symbol from title
  let crypto = "BTC";
  if (title.toLowerCase().includes("ethereum") || title.toLowerCase().includes("eth")) crypto = "ETH";
  else if (title.toLowerCase().includes("solana") || title.toLowerCase().includes("sol")) crypto = "SOL";
  else if (title.toLowerCase().includes("ripple") || title.toLowerCase().includes("xrp")) crypto = "XRP";

  // Parse threshold and direction from title
  // e.g. "Bitcoin price today at 5pm EST? $77,500 or above"
  // e.g. "Bitcoin price range today at 5pm EST? $76,000 to $76,499.99"
  const thresholdMatch = title.match(/\$?([\d,]+(?:\.\d+)?)\s*or\s*(above|below)/i);
  const rangeMatch = title.match(/\$?([\d,]+(?:\.\d+)?)\s*to\s*\$?([\d,]+(?:\.\d+)?)/i);

  let threshold = 0;
  let direction = "above";
  let contractType = "threshold";

  if (thresholdMatch) {
    threshold = parseFloat(thresholdMatch[1].replace(/,/g, ""));
    direction = thresholdMatch[2].toLowerCase();
    contractType = "threshold";
  } else if (rangeMatch) {
    threshold = parseFloat(rangeMatch[1].replace(/,/g, ""));
    const upper = parseFloat(rangeMatch[2].replace(/,/g, ""));
    direction = "range";
    contractType = "range";
    threshold = (threshold + upper) / 2; // midpoint
  }

  // Parse expiry
  const closeTime = m.close_time || m.expiration_time || "";
  const expiryMs = new Date(closeTime).getTime();
  const minutesToExpiry = Math.max(0, Math.round((expiryMs - Date.now()) / 60000));

  // Determine if hourly or daily
  const isHourly = minutesToExpiry <= 120;

  return {
    ticker: ticker,
    title: title,
    crypto,
    alpacaSymbol: CRYPTO_SYMBOLS[crypto] || "BTCUSD",
    threshold,
    direction,
    contractType,
    isHourly,
    minutesToExpiry,
    yesAsk: parseFloat(m.yes_ask) || parseFloat(m.last_price) || 0.5,
    noAsk: m.no_ask ? parseFloat(m.no_ask) : null,
    yesBid: parseFloat(m.yes_bid) || 0,
    noBid: parseFloat(m.no_bid) || 0,
    volume: parseInt(m.volume) || 0,
    openInterest: parseInt(m.open_interest) || 0,
    closeTime,
  };
}

// ── Actual crypto prices via multiple sources ───────────────────────────────

async function fetchSpotPrices(): Promise<Record<string, { price: number; change24h: number; high24h: number; low24h: number; volume: number }>> {
  const prices: Record<string, any> = {};

  // Source 1: CoinGecko (free, no auth)
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,dogecoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true",
      { signal: AbortSignal.timeout(8000) }
    );
    if (res.ok) {
      const d = await res.json();
      const map: Record<string, string> = { bitcoin: "BTC", ethereum: "ETH", solana: "SOL", ripple: "XRP", dogecoin: "DOGE" };
      for (const [id, sym] of Object.entries(map)) {
        if (d[id]) {
          prices[sym] = {
            price: d[id].usd,
            change24h: d[id].usd_24h_change || 0,
            high24h: 0,
            low24h: 0,
            volume: d[id].usd_24h_vol || 0,
          };
        }
      }
    }
  } catch {}

  // Source 2: Alpaca crypto data (if keys available)
  try {
    const isPaper = true;
    const key = process.env.CRON_ALPACA_KEY_PAPER || process.env.CRON_ALPACA_KEY || "";
    const secret = process.env.CRON_ALPACA_SECRET_PAPER || process.env.CRON_ALPACA_SECRET || "";
    if (key && secret) {
      for (const [sym, alpSym] of Object.entries(CRYPTO_SYMBOLS)) {
        try {
          const r = await fetch(`${ALPACA.data}/v1beta3/crypto/us/latest/quotes?symbols=${alpSym}`, {
            headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
            signal: AbortSignal.timeout(5000),
          });
          if (r.ok) {
            const d = await r.json();
            const q = d.quotes?.[alpSym];
            if (q) {
              const mid = (q.ap + q.bp) / 2;
              if (prices[sym]) {
                prices[sym].alpacaPrice = mid;
                prices[sym].spread = q.ap - q.bp;
              } else {
                prices[sym] = { price: mid, change24h: 0, high24h: 0, low24h: 0, volume: 0, alpacaPrice: mid, spread: q.ap - q.bp };
              }
            }
          }
        } catch {}
      }
    }
  } catch {}

  return prices;
}

// ── Recent volatility calculation ───────────────────────────────────────────

async function fetchVolatilityContext(symbol: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${symbol === "BTC" ? "bitcoin" : symbol === "ETH" ? "ethereum" : "solana"}/market_chart?vs_currency=usd&days=1&interval=hourly`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return "unknown";
    const d = await res.json();
    const prices = (d.prices || []).map((p: any) => p[1]);
    if (prices.length < 2) return "unknown";

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.abs((prices[i] - prices[i - 1]) / prices[i - 1]) * 100);
    }
    const avgHourlyMove = returns.reduce((a: number, b: number) => a + b, 0) / returns.length;
    const maxHourlyMove = Math.max(...returns);
    const trend = prices[prices.length - 1] > prices[0] ? "up" : "down";
    const trendPct = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;

    return `24h trend: ${trend} ${Math.abs(trendPct).toFixed(2)}% | avg hourly move: ${avgHourlyMove.toFixed(3)}% | max hourly move: ${maxHourlyMove.toFixed(3)}% | current: $${prices[prices.length - 1].toLocaleString()}`;
  } catch {
    return "unknown";
  }
}

// ── Fair value estimation ───────────────────────────────────────────────────

function estimateFairValue(
  spotPrice: number,
  threshold: number,
  direction: string,
  minutesToExpiry: number,
  avgHourlyMovePct: number
): number {
  // Simple probability estimation based on distance from threshold and time to expiry
  const distancePct = ((spotPrice - threshold) / threshold) * 100;

  if (direction === "above") {
    // How likely is price to be above threshold at expiry?
    if (spotPrice > threshold) {
      // Already above — probability depends on how far above and how much time for it to drop
      const stdMovesAway = Math.abs(distancePct) / (avgHourlyMovePct * Math.sqrt(minutesToExpiry / 60));
      // Approximate normal CDF
      const prob = 0.5 + 0.5 * Math.tanh(stdMovesAway * 0.85);
      return Math.min(0.98, Math.max(0.02, prob));
    } else {
      // Below threshold — needs to climb
      const stdMovesNeeded = Math.abs(distancePct) / (avgHourlyMovePct * Math.sqrt(minutesToExpiry / 60));
      const prob = 0.5 - 0.5 * Math.tanh(stdMovesNeeded * 0.85);
      return Math.min(0.98, Math.max(0.02, prob));
    }
  } else if (direction === "below") {
    // Mirror of above
    return 1 - estimateFairValue(spotPrice, threshold, "above", minutesToExpiry, avgHourlyMovePct);
  }

  // Range contracts: simplified
  return 0.5;
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
// not reachable from Railway. The council debate now runs in a scheduled
// Claude Code routine that POSTs verdicts to /place-hedge.
async function callClaude(_prompt: string, _useSearch = false, _maxTokens = 1500): Promise<string> {
  throw new Error("crypto-arb: in-process Claude calls disabled. Use the scheduled routine + /api/crypto-arb/place-hedge.");
}

// ── Council ─────────────────────────────────────────────────────────────────

async function runCryptoCouncil(opp: any, onStage: (msg: string) => void): Promise<any> {
  const context = `
CRYPTO HEDGE ARBITRAGE OPPORTUNITY:
Contract: "${opp.title}" (${opp.ticker})
Crypto: ${opp.crypto} | Spot price: $${opp.spotPrice.toLocaleString()}
Threshold: $${opp.threshold.toLocaleString()} | Direction: ${opp.direction}
Kalshi YES price: $${opp.yesAsk.toFixed(2)} (${(opp.yesAsk * 100).toFixed(0)}% implied)
Our fair value: $${opp.fairValue.toFixed(2)} (${(opp.fairValue * 100).toFixed(0)}% estimated)
Edge: ${(opp.edgePct).toFixed(1)}% | Time to expiry: ${opp.minutesToExpiry} minutes
${opp.volatilityContext ? `Volatility: ${opp.volatilityContext}` : ""}

PROPOSED STRATEGY: ${opp.strategy}
`;

  // Agent 1: Crypto Market Analyst — is the mispricing real?
  onStage(`Crypto analyst assessing ${opp.crypto} mispricing…`);
  const analystArg = await callClaude(
    `You are a CRYPTO MARKET ANALYST on a hedge arb council. Assess whether this Kalshi contract is genuinely mispriced relative to the actual ${opp.crypto} spot price.

${context}

Research and analyse:
1. Is ${opp.crypto} currently at $${opp.spotPrice.toLocaleString()} — is it likely to stay ${opp.direction} $${opp.threshold.toLocaleString()} in the next ${opp.minutesToExpiry} minutes?
2. What's the recent momentum? Any news catalysts that could cause a sudden move?
3. Are there major support/resistance levels near the threshold?
4. Is the Kalshi contract actually mispriced, or does the market know something we don't?

Return ONLY JSON:
{"verdict":"MISPRICED"|"FAIR"|"OVERPRICED","confidence":8,"our_probability":0.82,"reasoning":"analysis","catalysts":["catalyst1"],"risk_factors":["risk1"]}`,
    true,
    1500
  );

  // Agent 2: Volatility Analyst — will it move enough to matter?
  onStage(`Volatility analyst checking ${opp.crypto} movement patterns…`);
  const volArg = await callClaude(
    `You are a VOLATILITY ANALYST on a hedge arb council. Assess whether ${opp.crypto} is likely to make a significant move in the next ${opp.minutesToExpiry} minutes that could affect this trade.

${context}

Analyse:
1. What's the typical ${opp.minutesToExpiry}-minute price range for ${opp.crypto} right now?
2. Is volatility elevated or compressed? (use the vol context data)
3. Are there any imminent events that could spike volatility? (FOMC, CPI, options expiry, liquidation cascades)
4. How confident should we be that the price stays on this side of the threshold?

Return ONLY JSON:
{"verdict":"STABLE"|"VOLATILE"|"DANGEROUS","expected_move_pct":0.3,"probability_of_threshold_cross":0.15,"vol_regime":"low|normal|high|extreme","timing_risk":"assessment","reasoning":"analysis"}`,
    true,
    1200
  );

  // Agent 3: Hedge Strategist — optimal hedge structure
  onStage(`Hedge strategist designing position…`);
  const hedgeArg = await callClaude(
    `You are a HEDGE STRATEGIST on a crypto arb council. Design the optimal hedge for this Kalshi contract using Alpaca's crypto trading.

${context}

Design the hedge:
1. If we buy YES on Kalshi (betting price stays ${opp.direction} threshold), what's the hedge on Alpaca?
2. If we buy NO on Kalshi (betting it crosses), what's the hedge?
3. Calculate exact position sizes for a $${(await getSetting("max_bet_usd")) || "50"} max position
4. What's the worst case P&L for each strategy?
5. Which direction (YES or NO) gives us the better risk/reward given the edge?

Return ONLY JSON:
{"recommended_side":"yes"|"no","kalshi_contracts":10,"kalshi_cost":6.50,"hedge_action":"long|short|none","hedge_qty":0.001,"hedge_symbol":"BTCUSD","max_loss":3.50,"expected_profit":2.80,"breakeven_price":85000,"reasoning":"explanation"}`,
    false,
    1200
  );

  // Agent 4: Risk Manager — final call
  onStage(`Risk manager making final decision…`);
  const analyst = parseJSON(analystArg);
  const vol = parseJSON(volArg);
  const hedge = parseJSON(hedgeArg);

  const riskArg = await callClaude(
    `You are the RISK MANAGER on a crypto hedge arb council. All agents have reported. Make the final call.

${context}

CRYPTO ANALYST: ${JSON.stringify(analyst)}
VOLATILITY: ${JSON.stringify(vol)}
HEDGE STRATEGIST: ${JSON.stringify(hedge)}

Final decision:
- EXECUTE: Edge is real, hedge is sound, risk is manageable
- PASS: Not worth it — edge too thin, vol too high, or hedge too expensive
- WAIT: Edge exists but timing is wrong — wait for better entry

Return ONLY JSON:
{
  "verdict":"EXECUTE"|"PASS"|"WAIT",
  "confidence":"high"|"medium"|"low",
  "side":"yes"|"no",
  "kalshi_contracts":10,
  "hedge_action":"long"|"short"|"none",
  "hedge_qty":0.001,
  "max_risk_usd":5.00,
  "expected_net_usd":2.50,
  "reasoning":"2-3 sentence synthesis",
  "warnings":["warning1"]
}`,
    false,
    1000
  );

  const risk = parseJSON(riskArg);

  return {
    verdict: risk?.verdict || "PASS",
    confidence: risk?.confidence || "low",
    side: risk?.side || "yes",
    kalshi_contracts: risk?.kalshi_contracts || 0,
    hedge_action: risk?.hedge_action || "none",
    hedge_qty: risk?.hedge_qty || 0,
    max_risk_usd: risk?.max_risk_usd || 0,
    expected_net_usd: risk?.expected_net_usd || 0,
    reasoning: risk?.reasoning || "",
    warnings: risk?.warnings || [],
    transcript: {
      analyst: analyst || { argument: analystArg },
      volatility: vol || { argument: volArg },
      hedge: hedge || { argument: hedgeArg },
      risk_manager: risk || { verdict: "PASS" },
    },
  };
}

// ── Full pipeline ───────────────────────────────────────────────────────────

async function runCryptoArbPipeline(
  onStage: (stage: number, status: string, msg: string) => void
) {
  const minEdgePct = parseFloat((await getSetting("min_edge_pct")) || "8");

  // Stage 1: Fetch Kalshi crypto contracts + spot prices
  onStage(1, "running", "Fetching Kalshi crypto contracts…");
  const contracts = await fetchKalshiCryptoContracts();
  onStage(1, "running", `${contracts.length} crypto contracts found`);

  onStage(1, "running", "Fetching live spot prices…");
  const spotPrices = await fetchSpotPrices();
  const symbols = Object.keys(spotPrices);
  onStage(1, "done", `${contracts.length} contracts + ${symbols.length} spot prices (${symbols.map(s => `${s}: $${spotPrices[s].price.toLocaleString()}`).join(", ")})`);

  if (!contracts.length) {
    onStage(2, "done", "No crypto contracts available");
    return { contracts: 0, opportunities: [], councils: [], executions: [] };
  }

  // Stage 2: Calculate fair values and find edge
  onStage(2, "running", "Calculating fair values and scanning for edge…");

  // Get volatility context for main cryptos
  const volContexts: Record<string, string> = {};
  for (const sym of ["BTC", "ETH", "SOL"]) {
    if (spotPrices[sym]) {
      volContexts[sym] = await fetchVolatilityContext(sym);
    }
  }

  // Parse avg hourly move from volatility context
  function getAvgHourlyMove(volCtx: string): number {
    const match = volCtx.match(/avg hourly move: ([\d.]+)%/);
    return match ? parseFloat(match[1]) : 0.5; // default 0.5%
  }

  const opportunities: any[] = [];

  for (const contract of contracts) {
    const spot = spotPrices[contract.crypto];
    if (!spot || !contract.threshold || contract.threshold === 0) continue;
    if (contract.minutesToExpiry < 5 || contract.minutesToExpiry > 1440) continue; // 5min to 24h
    if (contract.direction === "range") continue; // skip range contracts for now

    const avgHourlyMove = getAvgHourlyMove(volContexts[contract.crypto] || "");
    const fairValue = estimateFairValue(spot.price, contract.threshold, contract.direction, contract.minutesToExpiry, avgHourlyMove);

    const edge = Math.abs(fairValue - contract.yesAsk);
    const edgePct = (edge / contract.yesAsk) * 100;

    if (edgePct < minEdgePct) continue;

    // Determine strategy
    let strategy: string;
    if (fairValue > contract.yesAsk) {
      // Contract is underpriced — buy YES on Kalshi, short crypto as hedge
      strategy = `BUY YES @ $${contract.yesAsk.toFixed(2)} (worth ~$${fairValue.toFixed(2)}) + SHORT ${contract.crypto} hedge`;
    } else {
      // Contract is overpriced — buy NO on Kalshi, long crypto as hedge
      strategy = `BUY NO @ $${(1 - contract.yesAsk).toFixed(2)} (YES overpriced at $${contract.yesAsk.toFixed(2)}, fair ~$${fairValue.toFixed(2)}) + LONG ${contract.crypto} hedge`;
    }

    opportunities.push({
      ...contract,
      spotPrice: spot.price,
      alpacaPrice: spot.alpacaPrice || spot.price,
      fairValue,
      edge,
      edgePct,
      strategy,
      volatilityContext: volContexts[contract.crypto] || "unknown",
    });
  }

  // Sort by edge descending
  opportunities.sort((a, b) => b.edgePct - a.edgePct);
  onStage(2, "done", `${opportunities.length} mispriced contracts found (≥${minEdgePct}% edge)`);

  if (!opportunities.length) {
    await pool.query(
      `INSERT INTO crypto_arb_scans (contracts_scanned, opportunities_found, executions) VALUES ($1, $2, 0)`,
      [contracts.length, 0]
    );
    return { contracts: contracts.length, opportunities: [], councils: [], executions: [] };
  }

  // Stage 3: Council review top opportunities
  const topOpps = opportunities.slice(0, 3);
  const councils: any[] = [];
  const executions: any[] = [];

  for (let i = 0; i < topOpps.length; i++) {
    const opp = topOpps[i];

    // Save to DB
    const oppRes = await pool.query(
      `INSERT INTO crypto_arb_opportunities
       (kalshi_ticker, kalshi_title, crypto_symbol, contract_type, threshold, direction,
        kalshi_price, fair_value, spot_price, edge, edge_pct, time_to_expiry_min,
        volatility_context, strategy, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [
        opp.ticker, opp.title, opp.crypto, opp.contractType, opp.threshold, opp.direction,
        opp.yesAsk, opp.fairValue, opp.spotPrice, opp.edge, opp.edgePct, opp.minutesToExpiry,
        opp.volatilityContext, opp.strategy, "detected",
      ]
    );
    const oppId = oppRes.rows[0].id;

    onStage(3, "running", `[${i + 1}/${topOpps.length}] Council reviewing ${opp.crypto} ${opp.direction} $${opp.threshold.toLocaleString()} (${opp.edgePct.toFixed(1)}% edge)…`);
    const council = await runCryptoCouncil(opp, (msg) => onStage(3, "running", msg));
    councils.push({ opp, council });

    // Update with council result
    await pool.query(
      "UPDATE crypto_arb_opportunities SET council_json=$1, status=$2 WHERE id=$3",
      [JSON.stringify(council.transcript), council.verdict === "EXECUTE" ? "approved" : council.verdict === "WAIT" ? "watching" : "rejected", oppId]
    );

    // Execute if approved
    if (council.verdict === "EXECUTE" && (await getSetting("auto_execute")) === "true") {
      const execId = `ca-${Date.now()}`;
      onStage(4, "running", `Executing: ${council.side?.toUpperCase()} Kalshi + ${council.hedge_action} ${opp.crypto}…`);

      await pool.query(
        `INSERT INTO crypto_arb_executions
         (id, opportunity_id, kalshi_side, kalshi_price, kalshi_contracts,
          hedge_symbol, hedge_side, hedge_qty, total_cost, expected_profit, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          execId, oppId,
          council.side, opp.yesAsk, council.kalshi_contracts,
          opp.alpacaSymbol, council.hedge_action, council.hedge_qty,
          council.max_risk_usd, council.expected_net_usd, "pending_execution",
        ]
      );

      executions.push({ execId, opp, council });
      onStage(4, "running", `✓ Logged: ${execId}`);
    }
  }

  onStage(3, "done", `${councils.length} reviewed | ${councils.filter(c => c.council.verdict === "EXECUTE").length} approved`);
  onStage(4, "done", `${executions.length} executed`);

  // Save scan
  await pool.query(
    `INSERT INTO crypto_arb_scans (contracts_scanned, opportunities_found, executions, scan_json) VALUES ($1,$2,$3,$4)`,
    [contracts.length, opportunities.length, executions.length, JSON.stringify({
      spot_prices: Object.fromEntries(Object.entries(spotPrices).map(([k, v]) => [k, v.price])),
      top_opportunities: opportunities.slice(0, 10).map(o => ({ ticker: o.ticker, crypto: o.crypto, edge: o.edgePct, fair: o.fairValue, kalshi: o.yesAsk })),
    })]
  );

  return { contracts: contracts.length, spotPrices, opportunities, councils, executions };
}

// ── Routine bridge: /trigger-routine ────────────────────────────────────────
cryptoArbRouter.post("/trigger-routine", async (req, res) => {
  try {
    const url = process.env.CRYPTO_ARB_ROUTINE_URL;
    if (!url) return res.status(503).json({ error: "CRYPTO_ARB_ROUTINE_URL not configured" });
    const apiKey = process.env.ANTHROPIC_TRIGGER_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(req.body || {}),
    }).catch((e) => {
      console.error("[crypto-arb] trigger-routine error:", e.message);
      void insertLog("error", `[trigger-routine] ${e.message}`);
    });

    await insertLog("info", "[trigger-routine] fired");
    res.status(202).json({ ok: true, status: "fired" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Authenticated broker helpers ────────────────────────────────────────────

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
  const keyObj = crypto.createPrivateKey({ key: pem, format: "pem" });
  return crypto.sign("sha256", Buffer.from(message), {
    key: keyObj,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  }).toString("base64");
}

async function kalshiAuthedReq(path: string, method = "GET", body: any = null): Promise<any> {
  const isDemo = (await getSetting("kalshi_mode")) === "demo";
  const base = isDemo ? KALSHI_BASE.demo : KALSHI_BASE.prod;
  const keyId      = isDemo ? (process.env.KALSHI_KEY_ID_DEMO     || "") : (process.env.KALSHI_KEY_ID_LIVE     || "");
  const privateKey = isDemo ? (process.env.KALSHI_PRIVATE_KEY_DEMO || "") : (process.env.KALSHI_PRIVATE_KEY_LIVE || "");
  if (!keyId || !privateKey) {
    return { error: true, message: `Kalshi ${isDemo ? "demo" : "live"} keys missing` };
  }
  const timestamp = String(Date.now());
  const sig = kalshiSign(privateKey, timestamp, method, path);
  try {
    const res = await fetch(base + path, {
      method,
      headers: {
        "Content-Type":              "application/json",
        "KALSHI-ACCESS-KEY":         keyId,
        "KALSHI-ACCESS-TIMESTAMP":   timestamp,
        "KALSHI-ACCESS-SIGNATURE":   sig,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  } catch (e: any) {
    return { error: true, message: e.message };
  }
}

function getCryptoAlpacaKeys(): { key: string; secret: string; isPaper: boolean } {
  const liveKey    = process.env.CRON_ALPACA_KEY_LIVE   || "";
  const liveSecret = process.env.CRON_ALPACA_SECRET_LIVE || "";
  if (liveKey && liveSecret && process.env.CRON_ALPACA_PAPER === "false") {
    return { key: liveKey, secret: liveSecret, isPaper: false };
  }
  return {
    key:    process.env.CRON_ALPACA_KEY_PAPER    || process.env.CRON_ALPACA_KEY    || "",
    secret: process.env.CRON_ALPACA_SECRET_PAPER || process.env.CRON_ALPACA_SECRET || "",
    isPaper: true,
  };
}

async function alpacaCryptoOrder(symbol: string, side: "buy" | "sell", qty: number): Promise<any> {
  const keys = getCryptoAlpacaKeys();
  if (!keys.key || !keys.secret) return { error: true, message: "Alpaca keys missing" };
  const base = keys.isPaper ? ALPACA.paper : ALPACA.live;
  const body = {
    symbol,
    side,
    type:           "market",
    time_in_force:  "gtc",
    qty:            String(qty),
  };
  try {
    const res = await fetch(base + "/v2/orders", {
      method: "POST",
      headers: {
        "APCA-API-KEY-ID":     keys.key,
        "APCA-API-SECRET-KEY": keys.secret,
        "Content-Type":        "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  } catch (e: any) {
    return { error: true, message: e.message };
  }
}

// ── Routine bridge: /place-hedge ────────────────────────────────────────────
// Receives a Kalshi-crypto + Alpaca-spot pair from a scheduled routine and
// places both orders. Notional matching, settlement-timing checks, and the
// council debate happen in the routine; the server holds the broker keys
// and enforces kill switch + daily loss cap.
cryptoArbRouter.post("/place-hedge", async (req, res) => {
  try {
    const {
      kalshi_ticker, kalshi_side, kalshi_contracts, kalshi_price,
      alpaca_symbol, alpaca_side, alpaca_qty,
      expected_edge,
      council_transcript,
      opportunity_id,
    } = req.body || {};

    if (!kalshi_ticker || !kalshi_side || !kalshi_contracts || !alpaca_symbol || !alpaca_side || !alpaca_qty) {
      return res.status(400).json({ error: "missing required Kalshi or Alpaca leg fields" });
    }
    if (kalshi_side !== "yes" && kalshi_side !== "no") {
      return res.status(400).json({ error: "kalshi_side must be 'yes' or 'no'" });
    }
    if (alpaca_side !== "buy" && alpaca_side !== "sell") {
      return res.status(400).json({ error: "alpaca_side must be 'buy' or 'sell'" });
    }

    const botEnabled = (await getSetting("bot_enabled")) === "true";
    if (!botEnabled) {
      return res.status(409).json({ error: "bot_enabled is false — kill switch engaged" });
    }

    const lossCapRaw = await getSetting("daily_max_loss_usd");
    if (lossCapRaw) {
      const cap = parseFloat(lossCapRaw);
      if (cap > 0) {
        const r = await pool.query(
          `SELECT COALESCE(SUM(actual_pnl), 0) AS pnl
             FROM crypto_arb_executions
            WHERE settled_at > NOW() - INTERVAL '24 hours'`
        );
        const pnl24h = parseFloat(r.rows?.[0]?.pnl ?? "0");
        if (pnl24h <= -cap) {
          return res.status(409).json({
            error: `daily loss cap hit (pnl24h=${pnl24h.toFixed(2)}, cap=${cap})`,
          });
        }
      }
    }

    const execId = `crypto-arb-${Date.now()}`;
    const totalCost = (kalshi_contracts * (kalshi_price ?? 0));

    await pool.query(
      `INSERT INTO crypto_arb_executions
       (id, opportunity_id, kalshi_side, kalshi_price, kalshi_contracts,
        hedge_symbol, hedge_side, hedge_qty,
        total_cost, expected_profit, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        execId, opportunity_id ?? null,
        kalshi_side, kalshi_price ?? null, kalshi_contracts,
        alpaca_symbol, alpaca_side, alpaca_qty,
        totalCost, (expected_edge ?? 0) * kalshi_contracts,
        "executing",
      ]
    );

    // Leg A — Kalshi crypto contract.
    const yesPriceCents = Math.max(1, Math.min(99, Math.round((kalshi_price ?? 0.5) * 100)));
    const kRes = await kalshiAuthedReq("/portfolio/orders", "POST", {
      ticker:    kalshi_ticker,
      action:    "buy",
      side:      kalshi_side,
      type:      "limit",
      count:     kalshi_contracts,
      yes_price: yesPriceCents,
    });
    if (kRes?.error) {
      const msg = kRes?.message || "kalshi order failed";
      await pool.query(`UPDATE crypto_arb_executions SET status='leg_a_failed' WHERE id=$1`, [execId]);
      await insertLog("error", `[place-hedge] ${execId} kalshi: ${msg}`);
      return res.status(502).json({ error: msg, execId, leg: "kalshi" });
    }
    const kalshiOrderId = kRes?.order?.order_id ?? null;

    // Leg B — Alpaca crypto spot hedge.
    const aRes = await alpacaCryptoOrder(alpaca_symbol, alpaca_side, alpaca_qty);
    if (aRes?.error || aRes?.code) {
      const msg = aRes?.message || "alpaca order failed";
      await pool.query(
        `UPDATE crypto_arb_executions SET status='leg_b_failed', kalshi_order_id=$2 WHERE id=$1`,
        [execId, kalshiOrderId]
      );
      await insertLog("error", `[place-hedge] ${execId} alpaca: ${msg}`);
      return res.status(502).json({ error: msg, execId, leg: "alpaca", kalshiOrderId });
    }

    await pool.query(
      `UPDATE crypto_arb_executions
          SET status='executed', kalshi_order_id=$2, hedge_order_id=$3
        WHERE id=$1`,
      [execId, kalshiOrderId, aRes?.id ?? null]
    );
    await insertLog("execution", `[place-hedge] ${execId} executed (council=${council_transcript ? "yes" : "no"})`);

    return res.json({ ok: true, execId, kalshiOrderId, alpacaOrderId: aRes?.id });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── Routes ──────────────────────────────────────────────────────────────────

cryptoArbRouter.get("/health", async (_req, res) => {
  res.json({ status: "ok", module: "crypto-arb", timestamp: new Date().toISOString() });
});

cryptoArbRouter.post("/run", async (_req, res) => {
  try {
    const log: string[] = [];
    const result = await runCryptoArbPipeline(async (stage, status, msg) => {
      log.push(`S${stage}[${status}]: ${msg}`);
      await insertLog("info", `[pipeline] S${stage}: ${msg}`);
    });
    res.json({ ...result, log });
  } catch (e: any) {
    await insertLog("error", `[pipeline] ERROR: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

cryptoArbRouter.post("/scan", async (_req, res) => {
  try {
    const minEdgePct = parseFloat((await getSetting("min_edge_pct")) || "8");
    const [contracts, spotPrices] = await Promise.all([fetchKalshiCryptoContracts(), fetchSpotPrices()]);

    const volContexts: Record<string, string> = {};
    for (const sym of ["BTC", "ETH", "SOL"]) {
      if (spotPrices[sym]) volContexts[sym] = await fetchVolatilityContext(sym);
    }

    const getAvgMove = (ctx: string) => { const m = ctx.match(/avg hourly move: ([\d.]+)%/); return m ? parseFloat(m[1]) : 0.5; };

    const opportunities = contracts
      .filter(c => spotPrices[c.crypto] && c.threshold > 0 && c.minutesToExpiry >= 5 && c.minutesToExpiry <= 1440 && c.direction !== "range")
      .map(c => {
        const spot = spotPrices[c.crypto];
        const fairValue = estimateFairValue(spot.price, c.threshold, c.direction, c.minutesToExpiry, getAvgMove(volContexts[c.crypto] || ""));
        const edge = Math.abs(fairValue - c.yesAsk);
        const edgePct = (edge / c.yesAsk) * 100;
        return { ...c, spotPrice: spot.price, fairValue, edge, edgePct };
      })
      .filter(c => c.edgePct >= minEdgePct)
      .sort((a, b) => b.edgePct - a.edgePct)
      .slice(0, 20);

    res.json({
      contracts_count: contracts.length,
      spot_prices: Object.fromEntries(Object.entries(spotPrices).map(([k, v]) => [k, { price: v.price, change24h: v.change24h }])),
      volatility: volContexts,
      opportunities,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

cryptoArbRouter.get("/spot-prices", async (_req, res) => {
  try {
    const prices = await fetchSpotPrices();
    res.json(prices);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

cryptoArbRouter.get("/history", async (req, res) => {
  try {
    const type = (req.query.type as string) || "opportunities";
    switch (type) {
      case "opportunities": return res.json((await pool.query("SELECT * FROM crypto_arb_opportunities ORDER BY logged_at DESC LIMIT 200")).rows);
      case "executions": return res.json((await pool.query("SELECT * FROM crypto_arb_executions ORDER BY logged_at DESC LIMIT 100")).rows);
      case "scans": return res.json((await pool.query("SELECT * FROM crypto_arb_scans ORDER BY logged_at DESC LIMIT 50")).rows);
      case "logs": return res.json((await pool.query("SELECT * FROM crypto_arb_logs ORDER BY logged_at DESC LIMIT 200")).rows);
      default: return res.status(400).json({ error: "unknown type" });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

cryptoArbRouter.get("/stats", async (_req, res) => {
  try {
    const [opps, execs, scans] = await Promise.all([
      pool.query("SELECT * FROM crypto_arb_opportunities ORDER BY logged_at DESC LIMIT 100"),
      pool.query("SELECT * FROM crypto_arb_executions ORDER BY logged_at DESC LIMIT 50"),
      pool.query("SELECT * FROM crypto_arb_scans ORDER BY logged_at DESC LIMIT 10"),
    ]);
    const allOpps = opps.rows;
    const allExecs = execs.rows;
    const settled = allExecs.filter((e: any) => e.actual_pnl != null);
    const totalPnl = settled.reduce((s: number, e: any) => s + (parseFloat(e.actual_pnl) || 0), 0);
    const avgEdge = allOpps.length ? allOpps.reduce((s: number, o: any) => s + (parseFloat(o.edge_pct) || 0), 0) / allOpps.length : 0;

    res.json({
      total_opportunities: allOpps.length,
      approved: allOpps.filter((o: any) => o.status === "approved").length,
      total_executions: allExecs.length,
      total_pnl: totalPnl,
      avg_edge: avgEdge,
      recent_opportunities: allOpps.slice(0, 10),
      recent_executions: allExecs.slice(0, 10),
      recent_scans: scans.rows.slice(0, 5),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

cryptoArbRouter.get("/settings", async (_req, res) => {
  try {
    const r = await pool.query("SELECT key, value FROM crypto_arb_settings");
    const s: any = {};
    r.rows.forEach(row => s[row.key] = row.value);
    res.json(s);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

cryptoArbRouter.post("/settings", async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: "key required" });
    await setSetting(key, String(value));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Init ────────────────────────────────────────────────────────────────────

export async function initCryptoArb() {
  await initCryptoArbTables();
  console.log("[crypto-arb] tables ready");

  // Tick every minute; interval controlled by scan_interval_min setting
  cron.schedule("* * * * *", async () => {
    const enabled = await getSetting("cron_enabled");
    if (enabled !== "true") return;

    const intervalMin = parseFloat((await getSetting("scan_interval_min")) || "3");
    const lastRaw = await getSetting("cron_last_run");
    if (lastRaw) {
      const elapsed = (Date.now() - new Date(lastRaw).getTime()) / 60000;
      if (elapsed < intervalMin) return;
    }
    await setSetting("cron_last_run", new Date().toISOString());

    console.log("[crypto-arb-cron] Running scan…");
    await insertLog("info", "[cron] Crypto arb scan triggered");
    try {
      await runCryptoArbPipeline(async (stage, status, msg) => {
        console.log(`[crypto-arb-cron] S${stage}[${status}]: ${msg}`);
        await insertLog("info", `[cron] S${stage}: ${msg}`);
      });
    } catch (e: any) {
      console.error("[crypto-arb-cron] Error:", e.message);
      await insertLog("error", `[cron] ERROR: ${e.message}`);
    }
  });

  console.log("[crypto-arb] cron scheduler ready — interval controlled by scan_interval_min");
}
