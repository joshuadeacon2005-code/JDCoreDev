/** Crypto Prediction Market Arbitrage — Kalshi crypto contracts vs Alpaca spot prices. Mounted at /api/crypto-arb/* */
import { Router } from "express";
import cron from "node-cron";
import { pool } from "./db";

export const cryptoArbRouter = Router();

const KALSHI_BASE = {
  demo: "https://demo-api.kalshi.co/trade-api/v2",
  prod: "https://trading-api.kalshi.com/trade-api/v2",
};

const CRYPTO_KEYWORDS = ["bitcoin", "btc", "ethereum", "eth", "solana", "sol", "crypto"];

async function initCryptoArbTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS crypto_arb_settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS crypto_arb_opportunities (
    id SERIAL PRIMARY KEY, kalshi_ticker TEXT, kalshi_title TEXT, crypto_symbol TEXT,
    kalshi_price REAL, spot_price REAL, implied_target REAL, edge_pct REAL,
    status TEXT DEFAULT 'detected', logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS crypto_arb_trades (
    id SERIAL PRIMARY KEY, opportunity_id INTEGER REFERENCES crypto_arb_opportunities(id),
    platform TEXT, side TEXT, contracts INTEGER, price REAL, cost REAL, pnl REAL,
    status TEXT DEFAULT 'pending', logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS crypto_arb_logs (
    id SERIAL PRIMARY KEY, message TEXT, type TEXT DEFAULT 'info', logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS crypto_arb_chat (
    id SERIAL PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL,
    metadata JSONB, created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  const defaults: [string, string][] = [
    ["cron_enabled", "false"], ["min_edge_pct", "5"], ["max_bet_usd", "50"],
    ["mode", process.env.KALSHI_MODE || "demo"],
  ];
  for (const [k, v] of defaults) {
    await pool.query(
      `INSERT INTO crypto_arb_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`, [k, v]
    );
  }
}
async function getSetting(key: string): Promise<string | null> {
  const r = await pool.query("SELECT value FROM crypto_arb_settings WHERE key=$1", [key]);
  return r.rows[0]?.value ?? null;
}
async function setSetting(key: string, value: string) {
  await pool.query(
    `INSERT INTO crypto_arb_settings (key, value, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`, [key, value]
  );
}
async function insertLog(type: string, message: string) {
  await pool.query("INSERT INTO crypto_arb_logs (type, message) VALUES ($1,$2)", [type, message]);
}
let kalshiToken: string | null = null;
let kalshiTokenExpiry = 0;

function getKalshiKeys() {
  const isDemo = (process.env.KALSHI_MODE || "demo") === "demo";
  return {
    keyId: isDemo ? process.env.KALSHI_KEY_ID_DEMO || "" : process.env.KALSHI_KEY_ID_LIVE || "",
    privateKey: isDemo ? process.env.KALSHI_PRIVATE_KEY_DEMO || "" : process.env.KALSHI_PRIVATE_KEY_LIVE || "",
    isDemo,
  };
}

async function kalshiLogin(): Promise<string> {
  if (kalshiToken && Date.now() < kalshiTokenExpiry) return kalshiToken;
  const keys = getKalshiKeys();
  const base = keys.isDemo ? KALSHI_BASE.demo : KALSHI_BASE.prod;
  if (keys.isDemo) {
    const email = process.env.KALSHI_EMAIL_DEMO || "";
    const password = process.env.KALSHI_PASSWORD_DEMO || "";
    if (!email || !password) throw new Error("Kalshi demo credentials not configured");
    const res = await fetch(`${base}/log-in`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`Kalshi login failed: ${res.status}`);
    const d = await res.json();
    kalshiToken = d.token;
    kalshiTokenExpiry = Date.now() + 25 * 60 * 1000;
    return kalshiToken!;
  }
  kalshiToken = keys.keyId;
  return kalshiToken;
}

async function kalshiReq(path: string, method = "GET", body: any = null): Promise<any> {
  const keys = getKalshiKeys();
  const base = keys.isDemo ? KALSHI_BASE.demo : KALSHI_BASE.prod;
  const headers: any = { "Content-Type": "application/json" };
  if (keys.isDemo) {
    headers["Authorization"] = `Bearer ${await kalshiLogin()}`;
  } else {
    headers["KALSHI-ACCESS-KEY"] = keys.keyId;
    headers["KALSHI-ACCESS-TIMESTAMP"] = String(Date.now());
  }
  try {
    const res = await fetch(base + path, {
      method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  } catch (e: any) {
    return { error: true, message: e.message };
  }
}

async function kalshiPublicReq(path: string): Promise<any> {
  const keys = getKalshiKeys();
  const base = keys.isDemo ? KALSHI_BASE.demo : KALSHI_BASE.prod;
  try {
    const res = await fetch(base + path, {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  } catch (e: any) {
    return { error: true, message: e.message };
  }
}

function parseJSON(text: string) {
  if (!text) return null;
  try {
    const m = text.replace(/```json|```/g, "").match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m) return JSON.parse(m[0]);
  } catch {}
  return null;
}

async function callClaude(prompt: string, maxTokens = 1500): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5", max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${errText.substring(0, 200)}`);
  }
  const d = await res.json();
  // Log usage
  if (d.usage) {
    const model = "claude-sonnet-4-5";
    const cost = (d.usage.input_tokens / 1_000_000) * 3 + (d.usage.output_tokens / 1_000_000) * 15;
    pool.query(`INSERT INTO api_usage (module, model, input_tokens, output_tokens, cost_usd) VALUES ($1,$2,$3,$4,$5)`, ["crypto-arb", model, d.usage.input_tokens, d.usage.output_tokens, cost]).catch(() => {});
  }
  return (d.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
}

interface SpotQuote { symbol: string; price: number; bid: number; ask: number }

async function fetchCryptoSpotPrices(): Promise<SpotQuote[]> {
  const alpacaKey = process.env.CRON_ALPACA_KEY_PAPER || "";
  const alpacaSecret = process.env.CRON_ALPACA_SECRET_PAPER || "";
  if (!alpacaKey || !alpacaSecret) return [];
  const pairs = ["BTC/USD", "ETH/USD", "SOL/USD"];
  try {
    const res = await fetch(
      `https://data.alpaca.markets/v1beta3/crypto/us/latest/quotes?symbols=${encodeURIComponent(pairs.join(","))}`,
      {
        headers: { "APCA-API-KEY-ID": alpacaKey, "APCA-API-SECRET-KEY": alpacaSecret },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return [];
    const d = await res.json();
    const quotes = d?.quotes || {};
    return pairs.map(pair => {
      const q = quotes[pair];
      if (!q) return null;
      const bid = q.bp || 0;
      const ask = q.ap || 0;
      return { symbol: pair, price: (bid + ask) / 2, bid, ask };
    }).filter(Boolean) as SpotQuote[];
  } catch {
    return [];
  }
}

function matchCryptoSymbol(title: string): string | null {
  const t = title.toLowerCase();
  if (t.includes("bitcoin") || t.includes("btc")) return "BTC/USD";
  if (t.includes("ethereum") || t.includes("eth")) return "ETH/USD";
  if (t.includes("solana") || t.includes("sol")) return "SOL/USD";
  return null;
}

function extractTargetPrice(title: string): { target: number; direction: "above" | "below" } | null {
  const m = title.match(/(?:above|over|reach|exceed|hit)\s*\$?([\d,]+)/i);
  if (m) return { target: parseFloat(m[1].replace(/,/g, "")), direction: "above" };
  const m2 = title.match(/(?:below|under|drop|fall)\s*\$?([\d,]+)/i);
  if (m2) return { target: parseFloat(m2[1].replace(/,/g, "")), direction: "below" };
  // Try bare dollar amount
  const m3 = title.match(/\$?([\d,]{4,})/);
  if (m3) return { target: parseFloat(m3[1].replace(/,/g, "")), direction: "above" };
  return null;
}

async function scanCryptoMarkets(spotPrices: SpotQuote[]): Promise<any[]> {
  const data = await kalshiPublicReq("/markets?status=open&limit=200");
  const markets = data?.markets || [];

  const cryptoMarkets = markets.filter((m: any) => {
    const title = (m.title || "").toLowerCase();
    return CRYPTO_KEYWORDS.some(kw => title.includes(kw));
  });

  if (!cryptoMarkets.length) return [];

  const spotMap: Record<string, SpotQuote> = {};
  for (const s of spotPrices) spotMap[s.symbol] = s;

  const opportunities: any[] = [];
  for (const m of cryptoMarkets) {
    const symbol = matchCryptoSymbol(m.title);
    if (!symbol || !spotMap[symbol]) continue;
    const spot = spotMap[symbol];
    const target = extractTargetPrice(m.title);
    const kalshiPrice = m.yes_ask || m.last_price || 0.5;
    const impliedTarget = target?.target || 0;
    const edgePct = impliedTarget > 0
      ? ((spot.price - impliedTarget) / impliedTarget) * 100
      : 0;

    opportunities.push({
      kalshi_ticker: m.ticker, kalshi_title: m.title, crypto_symbol: symbol,
      kalshi_price: kalshiPrice, spot_price: spot.price,
      implied_target: impliedTarget, edge_pct: edgePct,
    });
  }

  // Use Claude to analyse the top opportunities
  if (opportunities.length) {
    const summary = opportunities.slice(0, 15).map(o => ({
      ticker: o.kalshi_ticker, title: o.kalshi_title, price: o.kalshi_price,
      spot: o.spot_price, target: o.implied_target, edge_pct: o.edge_pct.toFixed(2),
    }));
    const analysis = parseJSON(await callClaude(
      `You are a crypto arbitrage analyst. Compare these Kalshi prediction markets to current spot prices and identify mispriced contracts.

MARKETS:
${JSON.stringify(summary, null, 1)}

For each, determine if the Kalshi price is mispriced given the spot price and target. Return ONLY JSON:
{"opportunities":[{"ticker":"XX","mispriced":true,"reasoning":"brief reason","suggested_side":"yes"|"no","confidence":"high"|"medium"|"low"}]}

Only include markets where mispriced=true.`
    ));

    const mispriced = new Set((analysis?.opportunities || []).filter((a: any) => a.mispriced).map((a: any) => a.ticker));
    for (const opp of opportunities) {
      const a = (analysis?.opportunities || []).find((x: any) => x.ticker === opp.kalshi_ticker);
      if (a) { opp.claude_analysis = a; opp.status = a.mispriced ? "mispriced" : "fair"; }
    }
    // Persist mispriced opportunities
    for (const opp of opportunities.filter((o: any) => mispriced.has(o.kalshi_ticker))) {
      await pool.query(
        `INSERT INTO crypto_arb_opportunities (kalshi_ticker, kalshi_title, crypto_symbol, kalshi_price, spot_price, implied_target, edge_pct, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [opp.kalshi_ticker, opp.kalshi_title, opp.crypto_symbol, opp.kalshi_price, opp.spot_price, opp.implied_target, opp.edge_pct, "mispriced"]
      );
    }
  }

  return opportunities;
}

cryptoArbRouter.get("/health", async (_req, res) => {
  res.json({ status: "ok", module: "crypto-arb", ts: new Date().toISOString() });
});

cryptoArbRouter.post("/scan", async (_req, res) => {
  try {
    await insertLog("info", "Manual crypto arb scan triggered");
    const spotPrices = await fetchCryptoSpotPrices();
    const opportunities = await scanCryptoMarkets(spotPrices);
    const mispriced = opportunities.filter(o => o.status === "mispriced");
    await insertLog("info", `Scan complete: ${opportunities.length} crypto markets, ${mispriced.length} mispriced`);
    res.json({ total: opportunities.length, mispriced: mispriced.length, opportunities, spotPrices });
  } catch (e: any) {
    await insertLog("error", `Scan failed: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

cryptoArbRouter.post("/execute/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { contracts = 1, side = "yes" } = req.body || {};
    const oppR = await pool.query("SELECT * FROM crypto_arb_opportunities WHERE id=$1", [id]);
    if (!oppR.rows.length) return res.status(404).json({ error: "Opportunity not found" });
    const opp = oppR.rows[0];

    const price = side === "yes" ? opp.kalshi_price : 1 - opp.kalshi_price;
    const cost = contracts * price;

    if (price <= 0.01 || contracts < 1 || cost <= 0) {
      const reason = price <= 0.01 ? `price $${price.toFixed(4)}` : contracts < 1 ? `contracts=${contracts}` : `cost=$${cost.toFixed(4)}`;
      await insertLog("warn", `Rejected trade on ${opp.kalshi_ticker}: ${reason}`);
      return res.status(400).json({ error: `Invalid trade: ${reason}` });
    }

    const result = await kalshiReq("/portfolio/orders", "POST", {
      ticker: opp.kalshi_ticker, action: "buy", side, type: "market", count: contracts,
    });

    const status = result?.error ? "failed" : "filled";
    await pool.query(
      `INSERT INTO crypto_arb_trades (opportunity_id, platform, side, contracts, price, cost, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [opp.id, "kalshi", side, contracts, price, cost, status]
    );
    await insertLog("info", `Trade ${status}: ${side} ${contracts}x ${opp.kalshi_ticker} @ $${price.toFixed(2)}`);
    res.json({ status, side, contracts, price, cost, ticker: opp.kalshi_ticker, order: result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

cryptoArbRouter.get("/opportunities", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM crypto_arb_opportunities ORDER BY logged_at DESC LIMIT 100");
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

cryptoArbRouter.get("/trades", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM crypto_arb_trades ORDER BY logged_at DESC LIMIT 100");
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

cryptoArbRouter.get("/stats", async (_req, res) => {
  try {
    const [trades, opps] = await Promise.all([
      pool.query("SELECT * FROM crypto_arb_trades ORDER BY logged_at DESC LIMIT 200"),
      pool.query("SELECT * FROM crypto_arb_opportunities WHERE status='mispriced' ORDER BY logged_at DESC LIMIT 50"),
    ]);
    const allTrades = trades.rows;
    const settled = allTrades.filter((t: any) => t.pnl != null);
    const totalPnl = settled.reduce((s: number, t: any) => s + (parseFloat(t.pnl) || 0), 0);
    const active = allTrades.filter((t: any) => t.status === "filled" && t.pnl == null);
    const avgEdge = opps.rows.length
      ? opps.rows.reduce((s: number, o: any) => s + Math.abs(parseFloat(o.edge_pct) || 0), 0) / opps.rows.length
      : 0;
    res.json({
      total_trades: allTrades.length, settled: settled.length, total_pnl: totalPnl,
      active_positions: active.length, avg_edge_pct: avgEdge,
      recent_trades: allTrades.slice(0, 10), recent_opportunities: opps.rows.slice(0, 10),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

cryptoArbRouter.get("/settings", async (_req, res) => {
  try {
    const r = await pool.query("SELECT key, value FROM crypto_arb_settings");
    const settings: Record<string, string> = {};
    r.rows.forEach((row: any) => (settings[row.key] = row.value));
    res.json(settings);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

cryptoArbRouter.post("/settings", async (req, res) => {
  try {
    const entries = Object.entries(req.body || {});
    for (const [k, v] of entries) await setSetting(k, String(v));
    res.json({ ok: true, updated: entries.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

cryptoArbRouter.get("/spot-prices", async (_req, res) => {
  try {
    const prices = await fetchCryptoSpotPrices();
    res.json(prices);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

cryptoArbRouter.get("/chat", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM crypto_arb_chat ORDER BY created_at ASC LIMIT 100");
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

cryptoArbRouter.delete("/chat", async (_req, res) => {
  try {
    await pool.query("DELETE FROM crypto_arb_chat");
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

cryptoArbRouter.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "message required" });

    await pool.query("INSERT INTO crypto_arb_chat (role, content) VALUES ('user', $1)", [message]);

    const [spotPrices, oppsR, tradesR, settingsR, histR] = await Promise.all([
      fetchCryptoSpotPrices(),
      pool.query("SELECT * FROM crypto_arb_opportunities ORDER BY logged_at DESC LIMIT 20"),
      pool.query("SELECT * FROM crypto_arb_trades ORDER BY logged_at DESC LIMIT 20"),
      pool.query("SELECT key, value FROM crypto_arb_settings"),
      pool.query("SELECT role, content FROM crypto_arb_chat ORDER BY created_at DESC LIMIT 20"),
    ]);

    const settings: any = {};
    settingsR.rows.forEach((r: any) => (settings[r.key] = r.value));
    const history = histR.rows.reverse();

    const spotCtx = spotPrices.map(s => `${s.symbol}: $${s.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} (bid: $${s.bid.toFixed(2)}, ask: $${s.ask.toFixed(2)})`).join("\n");
    const oppCtx = oppsR.rows.slice(0, 10).map((o: any) =>
      `[${new Date(o.logged_at).toLocaleDateString()}] ${o.kalshi_ticker} — ${o.kalshi_title} | spot:$${o.spot_price} target:$${o.implied_target} edge:${parseFloat(o.edge_pct).toFixed(1)}% status:${o.status}`
    ).join("\n");
    const tradeCtx = tradesR.rows.slice(0, 10).map((t: any) =>
      `[${new Date(t.logged_at).toLocaleDateString()}] ${t.side} ${t.contracts}x @ $${parseFloat(t.price).toFixed(2)} cost:$${parseFloat(t.cost).toFixed(2)} ${t.pnl != null ? `P&L:$${parseFloat(t.pnl).toFixed(2)}` : "pending"} status:${t.status}`
    ).join("\n");

    const allTrades = tradesR.rows;
    const settled = allTrades.filter((t: any) => t.pnl != null);
    const totalPnl = settled.reduce((s: number, t: any) => s + (parseFloat(t.pnl) || 0), 0);

    const systemPrompt = `You are a crypto arbitrage advisor for JD CoreDev. You analyse Kalshi crypto prediction markets vs real-time spot prices to find mispriced contracts.

CURRENT SPOT PRICES:
${spotCtx || "Unavailable"}

SETTINGS:
- Mode: ${settings.mode || "demo"}
- Min edge: ${settings.min_edge_pct || "5"}%
- Max bet: $${settings.max_bet_usd || "50"}
- Auto-scan: ${settings.cron_enabled === "true" ? "ON (every 15 min)" : "OFF"}

PERFORMANCE: ${allTrades.length} trades, ${settled.length} settled, P&L: $${totalPnl.toFixed(2)}

RECENT OPPORTUNITIES:
${oppCtx || "None yet"}

RECENT TRADES:
${tradeCtx || "None yet"}

INSTRUCTIONS:
- Discuss crypto spot prices vs Kalshi contract pricing
- Identify arbitrage opportunities and mispricing
- Help optimise edge thresholds and position sizing
- Be direct and data-driven. Keep responses concise.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", max_tokens: 800,
        system: systemPrompt,
        messages: history.slice(-16).map((h: any) => ({ role: h.role as "user" | "assistant", content: h.content })),
      }),
    });

    if (!claudeRes.ok) throw new Error(`Anthropic error: ${claudeRes.status}`);
    const claudeData = await claudeRes.json();
    if (claudeData.usage) {
      const cost = (claudeData.usage.input_tokens / 1_000_000) * 0.80 + (claudeData.usage.output_tokens / 1_000_000) * 4;
      pool.query(`INSERT INTO api_usage (module, model, input_tokens, output_tokens, cost_usd) VALUES ($1,$2,$3,$4,$5)`, ["crypto-arb-chat", "claude-haiku-4-5-20251001", claudeData.usage.input_tokens, claudeData.usage.output_tokens, cost]).catch(() => {});
    }
    const content = (claudeData.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");

    await pool.query("INSERT INTO crypto_arb_chat (role, content) VALUES ('assistant', $1)", [content]);
    res.json({ content });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export async function initCryptoArb() {
  await initCryptoArbTables();
  console.log("[crypto-arb] tables ready");

  cron.schedule("*/15 * * * *", async () => {
    const enabled = await getSetting("cron_enabled");
    if (enabled !== "true") return;
    console.log("[crypto-arb-cron] Running scan...");
    try {
      const spotPrices = await fetchCryptoSpotPrices();
      const opps = await scanCryptoMarkets(spotPrices);
      const mispriced = opps.filter(o => o.status === "mispriced");
      await insertLog("cron", `Cron scan: ${opps.length} markets, ${mispriced.length} mispriced`);
      console.log(`[crypto-arb-cron] ${opps.length} markets scanned, ${mispriced.length} mispriced`);
    } catch (e: any) {
      await insertLog("error", `Cron scan failed: ${e.message}`);
      console.error("[crypto-arb-cron] Error:", e.message);
    }
  });
}
