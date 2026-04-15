/**
 * Cross-Platform Arbitrage — Kalshi ↔ Polymarket prediction market arbitrage
 * Mounted at /api/arbitrage/*
 */

import { Router } from "express";
import cron from "node-cron";
import { pool } from "./db";

export const arbitrageRouter = Router();

// ── DB tables ────────────────────────────────────────────────────────────────

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
    poly_condition_id TEXT,
    poly_title TEXT,
    kalshi_yes_price REAL,
    poly_yes_price REAL,
    spread REAL,
    status TEXT DEFAULT 'open',
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS arb_trades (
    id SERIAL PRIMARY KEY,
    opportunity_id INTEGER,
    platform TEXT,
    side TEXT,
    contracts INTEGER,
    price REAL,
    cost REAL,
    pnl REAL,
    status TEXT DEFAULT 'pending',
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS arb_logs (
    id SERIAL PRIMARY KEY,
    message TEXT,
    type TEXT DEFAULT 'info',
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS arb_chat (
    id SERIAL PRIMARY KEY,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  const defaults: [string, string][] = [
    ["cron_enabled", "false"],
    ["min_spread", "0.05"],
    ["max_trade_usd", "50"],
    ["max_positions", "5"],
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

// ── Claude helpers ──────────────────────────────────────────────────────────
function parseJSON(text: string) {
  if (!text) return null;
  try {
    const m = text.replace(/```json|```/g, "").match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m) return JSON.parse(m[0]);
  } catch {}
  return null;
}

const CLAUDE_HEADERS = {
  "Content-Type": "application/json",
  "x-api-key": "",
  "anthropic-version": "2023-06-01",
};

function claudeHeaders() {
  return { ...CLAUDE_HEADERS, "x-api-key": process.env.ANTHROPIC_API_KEY! };
}

async function callClaude(
  prompt: string,
  maxTokens = 1500,
  opts?: { system?: string; messages?: { role: string; content: string }[]; model?: string }
): Promise<string> {
  const body: any = { model: opts?.model || "claude-sonnet-4-5", max_tokens: maxTokens };
  if (opts?.system) body.system = opts.system;
  body.messages = opts?.messages
    ? opts.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
    : [{ role: "user", content: prompt }];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: claudeHeaders(), body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${errText.substring(0, 200)}`);
  }
  const d = await res.json();
  // Log usage
  if (d.usage) {
    const model = opts?.model || "claude-sonnet-4-5";
    const rates: Record<string, { input: number; output: number }> = { "claude-sonnet-4-5": { input: 3, output: 15 }, "claude-haiku-4-5-20251001": { input: 0.80, output: 4 } };
    const r = rates[model] || { input: 3, output: 15 };
    const cost = (d.usage.input_tokens / 1_000_000) * r.input + (d.usage.output_tokens / 1_000_000) * r.output;
    pool.query(`INSERT INTO api_usage (module, model, input_tokens, output_tokens, cost_usd) VALUES ($1,$2,$3,$4,$5)`, ["arbitrage", model, d.usage.input_tokens, d.usage.output_tokens, cost]).catch(() => {});
  }
  return (d.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
}

// ── Market fetching ─────────────────────────────────────────────────────────
async function fetchKalshiMarkets(): Promise<any[]> {
  try {
    const res = await fetch(
      "https://trading-api.kalshi.com/trade-api/v2/markets?status=open&limit=200",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.markets) ? data.markets : [];
  } catch (e: any) {
    console.warn("[arbitrage] Kalshi fetch failed:", e.message);
    return [];
  }
}

async function fetchPolymarketMarkets(): Promise<any[]> {
  try {
    const res = await fetch(
      "https://gamma-api.polymarket.com/markets?closed=false&limit=200",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e: any) {
    console.warn("[arbitrage] Polymarket fetch failed:", e.message);
    return [];
  }
}

// ── AI market matching ──────────────────────────────────────────────────────
interface MatchedPair {
  kalshi_ticker: string;
  kalshi_title: string;
  kalshi_yes_price: number;
  poly_condition_id: string;
  poly_title: string;
  poly_yes_price: number;
}

async function matchMarkets(
  kalshiMarkets: any[],
  polyMarkets: any[]
): Promise<MatchedPair[]> {
  if (!kalshiMarkets.length || !polyMarkets.length) return [];

  const kalshiSummary = kalshiMarkets.slice(0, 80).map((m: any) => ({
    ticker: m.ticker,
    title: m.title || m.subtitle,
    yes_price: m.yes_ask ?? m.last_price ?? 0.5,
  }));
  const polySummary = polyMarkets.slice(0, 80).map((m: any) => ({
    condition_id: m.conditionId || m.id,
    title: m.question || m.title,
    yes_price: parseFloat(m.outcomePrices?.[0] || m.bestAsk || "0.5"),
  }));

  const prompt = `You are a prediction market analyst. Identify Kalshi/Polymarket pairs referring to the EXACT same event.

KALSHI: ${JSON.stringify(kalshiSummary)}
POLYMARKET: ${JSON.stringify(polySummary)}

Return ONLY JSON: [{"kalshi_ticker":"...","kalshi_title":"...","kalshi_yes_price":0.XX,"poly_condition_id":"...","poly_title":"...","poly_yes_price":0.XX}]
Only exact event matches. Include yes prices from data above. Return [] if none.`;

  const text = await callClaude(prompt, 2000);
  const parsed = parseJSON(text);
  return Array.isArray(parsed) ? parsed : [];
}

// ── Spread & fee calculation ────────────────────────────────────────────────
function kalshiFee(contracts: number, price: number): number {
  return Math.ceil(0.07 * contracts * price * (1 - price) * 100) / 100;
}

function polymarketFee(cost: number): number {
  return cost * 0.02;
}

function calculateSpread(pair: MatchedPair, contracts: number) {
  const kYes = pair.kalshi_yes_price, pYes = pair.poly_yes_price;
  const spreadA = pYes - kYes, spreadB = kYes - pYes;
  const [kalshi_side, poly_side, spread, kPrice, pPrice] = spreadA >= spreadB
    ? ["yes", "no", spreadA, kYes, 1 - pYes] as const
    : ["no", "yes", spreadB, 1 - kYes, pYes] as const;
  const kCost = contracts * kPrice, pCost = contracts * pPrice;
  const kFee = kalshiFee(contracts, kPrice), pFee = polymarketFee(pCost);
  const gross_profit = contracts - kCost - pCost;
  return { spread, kalshi_side, poly_side, gross_profit, kalshi_fee: kFee, poly_fee: pFee, net_profit: gross_profit - kFee - pFee };
}

// ── Trade execution ─────────────────────────────────────────────────────────

async function executeArbTrade(opportunityId: number): Promise<{ ok: boolean; error?: string }> {
  const oppR = await pool.query("SELECT * FROM arb_opportunities WHERE id=$1", [opportunityId]);
  if (!oppR.rows.length) return { ok: false, error: "Opportunity not found" };
  const opp = oppR.rows[0];

  const maxUsd = parseFloat((await getSetting("max_trade_usd")) || "50");
  const cheaperPrice = Math.min(opp.kalshi_yes_price, 1 - opp.kalshi_yes_price, opp.poly_yes_price, 1 - opp.poly_yes_price);
  const contracts = Math.max(1, Math.floor(maxUsd / (cheaperPrice + 0.5)));
  const calc = calculateSpread(opp as MatchedPair, contracts);

  const kPrice = calc.kalshi_side === "yes" ? opp.kalshi_yes_price : 1 - opp.kalshi_yes_price;
  const kCost = contracts * kPrice;
  const pPrice = calc.poly_side === "yes" ? opp.poly_yes_price : 1 - opp.poly_yes_price;
  const pCost = contracts * pPrice;

  for (const [plat, price, cost, label] of [
    ["kalshi", kPrice, kCost, "Kalshi"], ["polymarket", pPrice, pCost, "Polymarket"],
  ] as const) {
    if (price <= 0.01 || contracts < 1 || cost <= 0) {
      const msg = `[arb] REJECTED ${label} order: price=${price} contracts=${contracts} cost=${cost}`;
      console.warn(msg);
      await insertLog("warn", msg);
      return { ok: false, error: `Invalid ${label} order parameters` };
    }
  }

  const insertTrade = `INSERT INTO arb_trades (opportunity_id, platform, side, contracts, price, cost, status) VALUES ($1,$2,$3,$4,$5,$6,'executed')`;
  await pool.query(insertTrade, [opportunityId, "kalshi", calc.kalshi_side, contracts, kPrice, kCost]);
  await pool.query(insertTrade, [opportunityId, "polymarket", calc.poly_side, contracts, pPrice, pCost]);

  await pool.query("UPDATE arb_opportunities SET status='executed' WHERE id=$1", [opportunityId]);
  await insertLog("info", `[arb] Executed arb #${opportunityId}: K-${calc.kalshi_side}@${kPrice} + P-${calc.poly_side}@${pPrice} x${contracts}`);

  return { ok: true };
}

// ── Scan pipeline ───────────────────────────────────────────────────────────

async function runArbScan(): Promise<{ opportunities: any[]; matched: number; kalshi: number; poly: number }> {
  await insertLog("info", "[arb] Starting cross-platform scan");

  const [kalshiMarkets, polyMarkets] = await Promise.all([
    fetchKalshiMarkets(),
    fetchPolymarketMarkets(),
  ]);

  await insertLog("info", `[arb] Fetched ${kalshiMarkets.length} Kalshi + ${polyMarkets.length} Polymarket markets`);
  if (!kalshiMarkets.length || !polyMarkets.length) {
    return { opportunities: [], matched: 0, kalshi: kalshiMarkets.length, poly: polyMarkets.length };
  }

  const pairs = await matchMarkets(kalshiMarkets, polyMarkets);
  await insertLog("info", `[arb] AI matched ${pairs.length} pairs`);

  const minSpread = parseFloat((await getSetting("min_spread")) || "0.05");
  const saved: any[] = [];

  for (const pair of pairs) {
    const calc = calculateSpread(pair, 10);
    if (calc.spread < minSpread) continue;

    const r = await pool.query(
      `INSERT INTO arb_opportunities (kalshi_ticker, kalshi_title, poly_condition_id, poly_title, kalshi_yes_price, poly_yes_price, spread)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [pair.kalshi_ticker, pair.kalshi_title, pair.poly_condition_id, pair.poly_title, pair.kalshi_yes_price, pair.poly_yes_price, calc.spread]
    );
    saved.push(r.rows[0]);
  }

  await insertLog("info", `[arb] Found ${saved.length} arb opportunities (min spread: ${(minSpread * 100).toFixed(0)}%)`);
  return { opportunities: saved, matched: pairs.length, kalshi: kalshiMarkets.length, poly: polyMarkets.length };
}

// ── Routes ──────────────────────────────────────────────────────────────────

arbitrageRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", module: "arbitrage", timestamp: new Date().toISOString() });
});

arbitrageRouter.post("/scan", async (_req, res) => {
  try {
    const result = await runArbScan();
    res.json(result);
  } catch (e: any) {
    await insertLog("error", `[arb] Scan error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

arbitrageRouter.post("/execute/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid opportunity ID" });
    const result = await executeArbTrade(id);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

arbitrageRouter.get("/opportunities", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM arb_opportunities ORDER BY logged_at DESC LIMIT 100");
    res.json(r.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

arbitrageRouter.get("/trades", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM arb_trades ORDER BY logged_at DESC LIMIT 100");
    res.json(r.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

arbitrageRouter.get("/stats", async (_req, res) => {
  try {
    const [tradesR, oppsR] = await Promise.all([
      pool.query("SELECT * FROM arb_trades"),
      pool.query("SELECT * FROM arb_opportunities"),
    ]);
    const trades = tradesR.rows;
    const opps = oppsR.rows;
    const totalPnl = trades.reduce((s: number, t: any) => s + (parseFloat(t.pnl) || 0), 0);
    const activeArbs = opps.filter((o: any) => o.status === "executed").length;
    const avgSpread = opps.length
      ? opps.reduce((s: number, o: any) => s + (parseFloat(o.spread) || 0), 0) / opps.length
      : 0;

    res.json({
      total_trades: trades.length,
      total_pnl: parseFloat(totalPnl.toFixed(2)),
      active_arbs: activeArbs,
      avg_spread: parseFloat((avgSpread * 100).toFixed(2)),
      total_opportunities: opps.length,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

arbitrageRouter.get("/settings", async (_req, res) => {
  try {
    const r = await pool.query("SELECT key, value FROM arb_settings");
    const settings: Record<string, string> = {};
    r.rows.forEach((row: any) => (settings[row.key] = row.value));
    res.json(settings);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

arbitrageRouter.post("/settings", async (req, res) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== "object") return res.status(400).json({ error: "Object required" });
    for (const [k, v] of Object.entries(updates)) {
      await setSetting(k, String(v));
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Chat routes ─────────────────────────────────────────────────────────────

arbitrageRouter.get("/chat", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM arb_chat ORDER BY created_at ASC LIMIT 100");
    res.json(r.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

arbitrageRouter.delete("/chat", async (_req, res) => {
  try {
    await pool.query("DELETE FROM arb_chat");
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

arbitrageRouter.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "message required" });

    await pool.query("INSERT INTO arb_chat (role, content) VALUES ('user', $1)", [message]);

    const [oppsR, tradesR, settingsR, histR] = await Promise.all([
      pool.query("SELECT * FROM arb_opportunities ORDER BY logged_at DESC LIMIT 20"),
      pool.query("SELECT * FROM arb_trades ORDER BY logged_at DESC LIMIT 20"),
      pool.query("SELECT key, value FROM arb_settings"),
      pool.query("SELECT role, content FROM arb_chat ORDER BY created_at DESC LIMIT 20"),
    ]);

    const settings: Record<string, string> = {};
    settingsR.rows.forEach((r: any) => (settings[r.key] = r.value));
    const history = histR.rows.reverse();

    const trades = tradesR.rows;
    const totalPnl = trades.reduce((s: number, t: any) => s + (parseFloat(t.pnl) || 0), 0);

    const oppsContext = oppsR.rows.slice(0, 10).map((o: any) =>
      `[${new Date(o.logged_at).toLocaleDateString()}] K:${o.kalshi_title} vs P:${o.poly_title} | spread:${(parseFloat(o.spread) * 100).toFixed(1)}% status:${o.status}`
    ).join("\n");

    const tradesContext = trades.slice(0, 10).map((t: any) =>
      `[${new Date(t.logged_at).toLocaleDateString()}] ${t.platform} ${t.side} x${t.contracts}@${t.price} cost=$${parseFloat(t.cost).toFixed(2)} ${t.pnl != null ? `P&L:$${parseFloat(t.pnl).toFixed(2)}` : "pending"}`
    ).join("\n");

    const systemPrompt = `You are an AI arbitrage advisor for a cross-platform prediction market system (Kalshi + Polymarket) at JD CoreDev.

SETTINGS:
- Min spread: ${((parseFloat(settings.min_spread || "0.05")) * 100).toFixed(0)}%
- Max trade: $${settings.max_trade_usd || "50"}
- Max positions: ${settings.max_positions || "5"}
- Auto-scan: ${settings.cron_enabled === "true" ? "ON (every 30m)" : "OFF"}

PERFORMANCE:
- Total trades: ${trades.length}
- Total P&L: $${totalPnl.toFixed(2)}
- Open opportunities: ${oppsR.rows.filter((o: any) => o.status === "open").length}

RECENT OPPORTUNITIES:
${oppsContext || "None yet"}

RECENT TRADES:
${tradesContext || "None yet"}

INSTRUCTIONS:
- Answer questions about arb opportunities, spread analysis, and cross-platform pricing
- Explain fee structures (Kalshi: 7% capped, Polymarket: 2% taker)
- Help optimize settings for minimum spread and position sizing
- Discuss market matching quality and pricing discrepancies
- Be direct and data-driven. Keep responses concise.`;

    const content = await callClaude("", 800, {
      system: systemPrompt,
      messages: history.slice(-16).map((h: any) => ({ role: h.role, content: h.content })),
      model: "claude-haiku-4-5-20251001",
    });

    await pool.query("INSERT INTO arb_chat (role, content) VALUES ('assistant', $1)", [content]);
    res.json({ content });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Init ────────────────────────────────────────────────────────────────────

export async function initArbitrage() {
  await initArbTables();
  console.log("[arbitrage] tables ready");

  cron.schedule("*/30 * * * *", async () => {
    const enabled = await getSetting("cron_enabled");
    if (enabled !== "true") return;

    console.log("[arbitrage-cron] Running arb scan...");
    await insertLog("info", "[cron] Scheduled arb scan");

    try {
      const result = await runArbScan();
      console.log(`[arbitrage-cron] Found ${result.opportunities.length} opportunities`);
    } catch (e: any) {
      console.error("[arbitrage-cron] Error:", e.message);
      await insertLog("error", `[cron] ERROR: ${e.message}`);
    }
  });

  console.log("[arbitrage] cron scheduler ready — cadence: 30m");
}
