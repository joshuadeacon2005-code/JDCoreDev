/**
 * Claude Trader — Express router + server-side cron pipeline
 * Mounted at /api/trader/*
 */

import { Router } from "express";
import cron from "node-cron";
import { pool } from "./db";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export const traderRouter = Router();

// ── DB helpers ──────────────────────────────────────────────────────────────

async function initTraderTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS trader_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS trader_chat (
    id SERIAL PRIMARY KEY,
    mode TEXT DEFAULT 'general',
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS trader_trades (
    id TEXT PRIMARY KEY,
    symbol TEXT,
    side TEXT,
    qty REAL,
    notional REAL,
    price REAL,
    status TEXT,
    rationale TEXT,
    risk TEXT,
    mode TEXT,
    order_id TEXT,
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS trader_logs (
    id SERIAL PRIMARY KEY,
    message TEXT,
    type TEXT DEFAULT 'info',
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS trader_snapshots (
    id SERIAL PRIMARY KEY,
    equity REAL,
    buying_power REAL,
    pnl_day REAL,
    positions_count INTEGER DEFAULT 0,
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS trader_pipelines (
    id SERIAL PRIMARY KEY,
    risk TEXT,
    mode TEXT,
    positions_count INTEGER,
    ter TEXT,
    thesis TEXT,
    pass BOOLEAN,
    score INTEGER,
    logged_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Add analytics columns if missing
  await pool.query(`ALTER TABLE trader_trades ADD COLUMN IF NOT EXISTS pnl REAL`);
  await pool.query(`ALTER TABLE trader_trades ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ`);

  // Add rich pipeline detail columns if missing
  await pool.query(`ALTER TABLE trader_pipelines ADD COLUMN IF NOT EXISTS screened_json JSONB`);
  await pool.query(`ALTER TABLE trader_pipelines ADD COLUMN IF NOT EXISTS analysis_json JSONB`);
  await pool.query(`ALTER TABLE trader_pipelines ADD COLUMN IF NOT EXISTS positions_json JSONB`);
  await pool.query(`ALTER TABLE trader_pipelines ADD COLUMN IF NOT EXISTS validation_json JSONB`);

  await pool.query(`INSERT INTO trader_settings (key, value) VALUES ('cron_enabled', 'false') ON CONFLICT (key) DO NOTHING`);
  await pool.query(`INSERT INTO trader_settings (key, value) VALUES ('cron_risk', $1) ON CONFLICT (key) DO NOTHING`, [process.env.CRON_RISK || 'medium']);
  await pool.query(`INSERT INTO trader_settings (key, value) VALUES ('cron_mode', $1) ON CONFLICT (key) DO NOTHING`, [process.env.CRON_MODE || 'day']);
  await pool.query(`INSERT INTO trader_settings (key, value) VALUES ('cron_interval_day', '15') ON CONFLICT (key) DO NOTHING`);
  await pool.query(`INSERT INTO trader_settings (key, value) VALUES ('cron_interval_swing', '240') ON CONFLICT (key) DO NOTHING`);
  await pool.query(`INSERT INTO trader_settings (key, value) VALUES ('cron_interval_portfolio', '1440') ON CONFLICT (key) DO NOTHING`);
  await pool.query(`INSERT INTO trader_settings (key, value) VALUES ('cron_interval_crypto', '1440') ON CONFLICT (key) DO NOTHING`);
}

async function getSetting(key: string): Promise<string | null> {
  const r = await pool.query('SELECT value FROM trader_settings WHERE key=$1', [key]);
  return r.rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string) {
  await pool.query(`
    INSERT INTO trader_settings (key, value, updated_at) VALUES ($1,$2,NOW())
    ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()
  `, [key, value]);
}

async function insertLog(type: string, message: string) {
  await pool.query('INSERT INTO trader_logs (type, message) VALUES ($1,$2)', [type, message]);
}

async function insertTrade(t: any) {
  const id = `${t.symbol}-${Date.now()}`;
  await pool.query(`
    INSERT INTO trader_trades (id,symbol,side,qty,notional,price,status,rationale,risk,mode,order_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (id) DO NOTHING
  `, [id, t.symbol, t.side, t.qty||null, t.notional||null, t.price||null, t.status||null, t.rationale||null, t.risk||null, t.mode||null, t.orderId||null]);
}

async function insertSnapshot(s: any) {
  await pool.query(`
    INSERT INTO trader_snapshots (equity,buying_power,pnl_day,positions_count)
    VALUES ($1,$2,$3,$4)
  `, [s.equity||0, s.cash||0, s.pnl||0, s.positions||0]);
}

async function insertPipelineRun(p: any) {
  await pool.query(`
    INSERT INTO trader_pipelines (risk,mode,positions_count,ter,thesis,pass,score,screened_json,analysis_json,positions_json,validation_json)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  `, [
    p.risk, p.mode, p.positions?.length||0, p.ter||'N/A', p.thesis||'',
    p.validation?.pass??true, p.validation?.score||80,
    JSON.stringify(p.screened||[]),
    JSON.stringify(p.analysis||[]),
    JSON.stringify(p.positions||[]),
    JSON.stringify(p.validation||{}),
  ]);
}

async function syncTradesPnl(keys: any): Promise<{ updated: number; errors: string[] }> {
  const fills = await alpacaReq(keys, '/v2/account/activities/FILL?page_size=200&direction=desc');
  if (!Array.isArray(fills)) return { updated: 0, errors: ['Failed to fetch fills from Alpaca'] };

  fills.sort((a: any, b: any) => new Date(a.transaction_time).getTime() - new Date(b.transaction_time).getTime());

  const buyQueues: Record<string, Array<{ price: number; qty: number }>> = {};
  const matchedSells: Array<{ orderId: string; symbol: string; pnl: number; executedAt: string }> = [];

  for (const fill of fills) {
    const qty   = parseFloat(fill.qty)   || 0;
    const price = parseFloat(fill.price) || 0;
    const sym   = fill.symbol;
    if (!sym || qty <= 0 || price <= 0) continue;
    if (!buyQueues[sym]) buyQueues[sym] = [];

    if (fill.side === 'buy') {
      buyQueues[sym].push({ price, qty });
    } else if (fill.side === 'sell') {
      let remaining  = qty;
      let costBasis  = 0;
      const queue    = buyQueues[sym];
      while (remaining > 0 && queue.length > 0) {
        const top  = queue[0];
        const used = Math.min(remaining, top.qty);
        costBasis += used * top.price;
        top.qty   -= used;
        remaining -= used;
        if (top.qty <= 0) queue.shift();
      }
      const pnl = (qty * price) - costBasis;
      matchedSells.push({ orderId: fill.order_id, symbol: sym, pnl: parseFloat(pnl.toFixed(4)), executedAt: fill.transaction_time });
    }
  }

  let updated = 0;
  const errors: string[] = [];

  for (const sell of matchedSells) {
    try {
      let res = await pool.query(`
        UPDATE trader_trades SET pnl = $1, executed_at = $2
        WHERE id = (
          SELECT id FROM trader_trades
          WHERE order_id = $3 AND pnl IS NULL
          ORDER BY logged_at ASC LIMIT 1
        ) RETURNING id
      `, [sell.pnl, sell.executedAt, sell.orderId]);

      if (!res.rowCount && sell.symbol) {
        res = await pool.query(`
          UPDATE trader_trades SET pnl = $1, executed_at = $2
          WHERE id = (
            SELECT id FROM trader_trades
            WHERE symbol = $3 AND side = 'sell' AND pnl IS NULL
            ORDER BY logged_at ASC LIMIT 1
          ) RETURNING id
        `, [sell.pnl, sell.executedAt, sell.symbol]);
      }

      if ((res.rowCount ?? 0) > 0) updated++;
    } catch (e: any) {
      errors.push(`${sell.symbol}: ${e.message}`);
    }
  }

  return { updated, errors };
}

// ── Alpaca helpers ──────────────────────────────────────────────────────────

const ALPACA = {
  paper: 'https://paper-api.alpaca.markets',
  live:  'https://api.alpaca.markets',
  data:  'https://data.alpaca.markets',
};

async function alpacaReq(keys: any, path: string, method = 'GET', body: any = null) {
  const base = keys.isPaper ? ALPACA.paper : ALPACA.live;
  try {
    const res = await fetch(base + path, {
      method,
      headers: {
        'APCA-API-KEY-ID':     keys.key,
        'APCA-API-SECRET-KEY': keys.secret,
        'Content-Type':        'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  } catch (e: any) {
    return { error: true, message: e.message };
  }
}

async function getQuote(keys: any, symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`${ALPACA.data}/v2/stocks/${symbol}/quotes/latest`, {
      headers: { 'APCA-API-KEY-ID': keys.key, 'APCA-API-SECRET-KEY': keys.secret },
    });
    const d = await res.json();
    const ap = d.quote?.ap; const bp = d.quote?.bp;
    if (ap && bp) return (ap + bp) / 2;
    return ap || bp || null;
  } catch { return null; }
}

// ── Alpaca data API helper ────────────────────────────────────────────────────
async function alpacaDataReq(keys: any, path: string): Promise<any> {
  try {
    const res = await fetch(`${ALPACA.data}${path}`, {
      headers: { 'APCA-API-KEY-ID': keys.key, 'APCA-API-SECRET-KEY': keys.secret },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Technical indicator calculators ──────────────────────────────────────────
function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const gains   = changes.map(c => c > 0 ? c : 0);
  const losses  = changes.map(c => c < 0 ? Math.abs(c) : 0);
  let avgGain   = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss   = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  if (avgLoss === 0) return 100;
  return parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(1));
}

function calcEMA(vals: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [vals[0]];
  for (let i = 1; i < vals.length; i++) ema.push(vals[i] * k + ema[i - 1] * (1 - k));
  return ema;
}

function calcMACD(closes: number[]): { bullish: boolean; crossover: boolean } {
  if (closes.length < 35) return { bullish: false, crossover: false };
  const ema12    = calcEMA(closes, 12);
  const ema26    = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const sig      = calcEMA(macdLine.slice(-9), 9);
  const cur      = macdLine[macdLine.length - 1];
  const prev     = macdLine[macdLine.length - 2];
  const sigCur   = sig[sig.length - 1];
  const sigPrev  = sig[sig.length - 2];
  return {
    bullish:   cur > sigCur,
    crossover: (cur > sigCur) !== (prev > sigPrev), // crossed in last bar
  };
}

// ── Fetch technicals via Alpaca historical bars ───────────────────────────────
async function fetchTechnicals(keys: any, symbols: string[]): Promise<string> {
  if (!keys?.key || !symbols.length) return '';
  try {
    const params = `symbols=${symbols.join(',')}&timeframe=1Day&limit=52&adjustment=raw&sort=asc`;
    const d = await alpacaDataReq(keys, `/v2/stocks/bars?${params}`);
    if (!d?.bars) return '';
    const lines: string[] = [];
    for (const [sym, bars] of Object.entries(d.bars) as any) {
      if (!Array.isArray(bars) || bars.length < 20) continue;
      const closes  = bars.map((b: any) => b.c as number);
      const volumes = bars.map((b: any) => b.v as number);
      const rsi     = calcRSI(closes);
      const macd    = calcMACD(closes);
      const sma20   = closes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
      const sma50   = closes.length >= 50 ? closes.slice(-50).reduce((a: number, b: number) => a + b, 0) / 50 : null;
      const price   = closes[closes.length - 1];
      const avgVol  = volumes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
      const volSpike = volumes[volumes.length - 1] > avgVol * 1.5;
      const trend   = sma50 ? (sma20 > sma50 ? 'uptrend' : 'downtrend') : (price > sma20 ? 'above20SMA' : 'below20SMA');
      const rsiTag  = rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : rsi < 45 ? 'near-oversold' : '';
      lines.push([
        `${sym}: RSI${rsi}${rsiTag ? `(${rsiTag})` : ''}`,
        `MACD${macd.bullish ? '▲' : '▼'}${macd.crossover ? '⚡cross' : ''}`,
        trend,
        volSpike ? 'vol-spike' : '',
      ].filter(Boolean).join(' '));
    }
    return lines.length ? `Technical signals:\n${lines.join('\n')}` : '';
  } catch { return ''; }
}

// ── Fetch recent news via Alpaca news API ─────────────────────────────────────
async function fetchAlpacaNews(keys: any, symbols: string[]): Promise<string> {
  if (!keys?.key || !symbols.length) return '';
  try {
    const params = `symbols=${symbols.slice(0, 8).join(',')}&limit=15&sort=desc&include_content=false&exclude_contentless=true`;
    const d = await alpacaDataReq(keys, `/v1beta1/news?${params}`);
    if (!d?.news?.length) return '';
    const headlines = (d.news as any[])
      .map((n: any) => `[${(n.symbols || []).join('/')}] ${n.headline}`)
      .join('\n');
    return `Recent news:\n${headlines}`;
  } catch { return ''; }
}

// ── Fetch upcoming earnings dates via Yahoo Finance ───────────────────────────
async function fetchEarningsCalendar(symbols: string[]): Promise<string> {
  if (!symbols.length) return '';
  try {
    const results = await Promise.all(symbols.slice(0, 8).map(async sym => {
      try {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${sym}?modules=calendarEvents`,
          { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(5000) }
        );
        if (!r.ok) return null;
        const data = await r.json();
        const dates = data?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate || [];
        if (!dates.length) return null;
        const next = new Date(dates[0].raw * 1000);
        const daysOut = Math.round((next.getTime() - Date.now()) / 86400000);
        if (daysOut < 0 || daysOut > 30) return null;
        return `${sym} earnings in ${daysOut}d (${next.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
      } catch { return null; }
    }));
    const lines = results.filter(Boolean);
    return lines.length ? `Upcoming earnings:\n${lines.join('\n')}` : '';
  } catch { return ''; }
}

function buildOrderBody(o: any) {
  const { symbol, side, notional, price, mode, stopLossPct, takeProfitPct } = o;
  const tif = mode === 'day' ? 'day' : 'gtc';
  if (side === 'sell') return { symbol, side: 'sell', type: 'market', time_in_force: tif, notional: notional.toFixed(2) };
  if (!price) return { symbol, side: 'buy', type: 'market', time_in_force: tif, notional: notional.toFixed(2) };
  const qty = Math.floor(notional / price);
  if (qty < 1) return null;
  const body: any = { symbol, side: 'buy', type: 'limit', time_in_force: tif, qty: qty.toString(), limit_price: price.toFixed(2) };
  if (stopLossPct && takeProfitPct) {
    body.order_class = 'bracket';
    body.stop_loss   = { stop_price: (price * (1 - stopLossPct / 100)).toFixed(2) };
    body.take_profit = { limit_price: (price * (1 + takeProfitPct / 100)).toFixed(2) };
  }
  return body;
}

// ── Claude helpers ──────────────────────────────────────────────────────────

function parseJSON(text: string) {
  if (!text) return null;
  try {
    const m = text.replace(/```json|```/g, '').match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m) return JSON.parse(m[0]);
  } catch {}
  return null;
}

async function callClaudeTrader(prompt: string, _useSearch = false): Promise<string> {
  const msg = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });
  return msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
}

// ── RISK_CONFIGS ─────────────────────────────────────────────────────────────

const RISK_CONFIGS: any = {
  low:    { maxPos:12, stopLoss:2,  takeProfit:4,  maxSinglePct:12 },
  medium: { maxPos:10, stopLoss:4,  takeProfit:8,  maxSinglePct:15 },
  high:   { maxPos:8,  stopLoss:6,  takeProfit:15, maxSinglePct:15 },
};

const UNIVERSES: any = {
  low:    ['JNJ','PG','KO','WMT','NEE','VYM','SCHD','SO','VZ','MCD','ABBV','T','DUK','O','JEPI'],
  medium: ['AAPL','MSFT','GOOGL','AMZN','META','NVDA','AVGO','LLY','UNH','JPM','V','HD','MA','CRM','MRK'],
  high:   ['MSTR','COIN','HOOD','IONQ','SMCI','PLTR','RKLB','CLSK','MARA','TSLA','AMD','SOXL','TQQQ','ARKK','NVDA'],
  meme:   ['DOGE','SHIB','PEPE','WIF','BONK'],
};

// ── Server-side pipeline (for cron) ─────────────────────────────────────────

// ── Market Signals (Reddit sentiment + congressional whale trades) ─────────

const YAHOO_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept': 'application/json' };

// ── Yahoo Finance stock signals ───────────────────────────────────────────
async function fetchYahooScreener(scrId: string, count = 15): Promise<any[]> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&scrIds=${scrId}&count=${count}`,
      { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return [];
    const d = await r.json();
    const quotes: any[] = d?.finance?.result?.[0]?.quotes || [];
    return quotes.map(q => ({
      ticker:  q.symbol,
      name:    q.shortName || q.longName || q.symbol,
      price:   q.regularMarketPrice,
      change:  q.regularMarketChangePercent,
      volume:  q.regularMarketVolume,
      mktCap:  q.marketCap,
      sector:  q.sector || '',
    }));
  } catch {
    return [];
  }
}

async function fetchYahooSignals(): Promise<{
  mostActive: any[]; gainers: any[]; losers: any[];
}> {
  const [mostActive, gainers, losers] = await Promise.all([
    fetchYahooScreener('most_actives', 15),
    fetchYahooScreener('day_gainers',  10),
    fetchYahooScreener('day_losers',   10),
  ]);
  return { mostActive, gainers, losers };
}

// ── StockTwits trending equities (social sentiment) ───────────────────────
async function fetchStockTwitsTrending(): Promise<{
  equities: any[]; crypto: any[];
}> {
  try {
    const r = await fetch('https://api.stocktwits.com/api/2/trending/symbols.json', {
      headers: { 'User-Agent': 'jdcoredev-signals/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { equities: [], crypto: [] };
    const d = await r.json();
    const syms: any[] = d.symbols || [];
    const equities = syms
      .filter(s => s.instrument_class !== 'CRYPTO')
      .map(s => ({
        ticker:  s.symbol_display || s.symbol,
        name:    s.title,
        score:   Math.round((s.trending_score || 0) * 10) / 10,
        summary: s.trends?.summary || '',
        watchlist: s.watchlist_count || 0,
        class:   s.instrument_class || 'equity',
      }));
    const crypto = syms
      .filter(s => s.instrument_class === 'CRYPTO')
      .map(s => ({
        ticker:  s.symbol_display || s.symbol,
        name:    s.title,
        score:   Math.round((s.trending_score || 0) * 10) / 10,
        summary: s.trends?.summary || '',
        watchlist: s.watchlist_count || 0,
        class:   'crypto',
      }));
    return { equities, crypto };
  } catch {
    return { equities: [], crypto: [] };
  }
}

// ── StockTwits message stream (explicit bullish/bearish tags) ─────────────
async function fetchStockTwitsStream(): Promise<{
  messages: any[]; sentiment: Record<string, { bull: number; bear: number }>;
}> {
  try {
    const r = await fetch('https://api.stocktwits.com/api/2/streams/trending.json?limit=30', {
      headers: { 'User-Agent': 'jdcoredev-signals/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { messages: [], sentiment: {} };
    const d = await r.json();
    const msgs: any[] = d.messages || [];
    const sentiment: Record<string, { bull: number; bear: number }> = {};
    for (const m of msgs) {
      const sent = m.entities?.sentiment?.basic?.toLowerCase();
      for (const sym of (m.symbols || [])) {
        const t = sym.symbol_display || sym.symbol;
        if (!sentiment[t]) sentiment[t] = { bull: 0, bear: 0 };
        if (sent === 'bullish') sentiment[t].bull++;
        else if (sent === 'bearish') sentiment[t].bear++;
      }
    }
    return {
      messages: msgs.slice(0, 20).map((m: any) => ({
        body:      m.body?.slice(0, 140),
        sentiment: m.entities?.sentiment?.basic || null,
        symbols:   (m.symbols || []).map((s: any) => s.symbol_display || s.symbol),
        likes:     m.likes?.total || 0,
      })),
      sentiment,
    };
  } catch {
    return { messages: [], sentiment: {} };
  }
}

// ── Crypto Fear & Greed index ─────────────────────────────────────────────
async function fetchFearAndGreed(): Promise<{
  value: number; classification: string; history: any[];
}> {
  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=7', {
      headers: { 'User-Agent': 'jdcoredev-signals/1.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return { value: 50, classification: 'Neutral', history: [] };
    const d = await r.json();
    const data: any[] = d.data || [];
    const latest = data[0] || {};
    return {
      value:          parseInt(latest.value || '50'),
      classification: latest.value_classification || 'Neutral',
      history:        data.map(p => ({
        value: parseInt(p.value),
        label: p.value_classification,
        date:  new Date(parseInt(p.timestamp) * 1000).toLocaleDateString('en-US', { month:'short', day:'numeric' }),
      })),
    };
  } catch {
    return { value: 50, classification: 'Neutral', history: [] };
  }
}

async function fetchMarketSignals(mode: string, keys?: any) {
  const [yahoo, stocktwits, stream, fearGreed] = await Promise.all([
    fetchYahooSignals(),
    fetchStockTwitsTrending(),
    fetchStockTwitsStream(),
    fetchFearAndGreed(),
  ]);

  // Merge stream sentiment into stocktwits symbols
  const enrich = (sym: any) => {
    const sent = stream.sentiment[sym.ticker] || { bull: 0, bear: 0 };
    const total = sent.bull + sent.bear;
    const sentLabel: 'bullish' | 'bearish' | 'neutral' =
      total === 0 ? 'neutral' : sent.bull > sent.bear ? 'bullish' : 'bearish';
    return { ...sym, bull: sent.bull, bear: sent.bear, sentiment: sentLabel };
  };
  const stEquities = stocktwits.equities.map(enrich);
  const stCrypto   = stocktwits.crypto.map(enrich);

  // Build Claude context strings
  const isCrypto = mode === 'crypto';
  const stockTwitsCtx = [
    !isCrypto && yahoo.mostActive.length
      ? `Yahoo most active stocks: ${yahoo.mostActive.slice(0, 8).map(s => `${s.ticker}(${s.change >= 0 ? '+' : ''}${s.change?.toFixed(1)}%)`).join(', ')}`
      : '',
    !isCrypto && yahoo.gainers.length
      ? `Today's top gainers: ${yahoo.gainers.slice(0, 5).map(s => `${s.ticker}(+${s.change?.toFixed(1)}%)`).join(', ')}`
      : '',
    !isCrypto && stEquities.length
      ? `StockTwits trending stocks: ${stEquities.slice(0, 6).map(s => `${s.ticker}(${s.sentiment})`).join(', ')}`
      : '',
    isCrypto && stCrypto.length
      ? `StockTwits trending crypto: ${stCrypto.slice(0, 8).map(s => `${s.ticker}(score:${s.score},${s.sentiment})`).join(', ')}`
      : '',
    `Crypto Fear & Greed: ${fearGreed.value}/100 — ${fearGreed.classification}`,
  ].filter(Boolean).join('\n');

  // ── Extended research (requires Alpaca keys) ──────────────────────────────
  let techCtx = '', newsCtx = '', earningsCtx = '';
  if (keys?.key) {
    const topSyms = [
      ...(!isCrypto ? yahoo.mostActive.slice(0, 6).map((s: any) => s.ticker) : []),
      ...(!isCrypto ? stEquities.slice(0, 5).map((s: any) => s.ticker) : []),
      ...(isCrypto  ? stCrypto.slice(0, 6).map((s: any) => s.ticker.replace('/', '')) : []),
    ];
    const uniq = [...new Set(topSyms)].slice(0, 8);
    [techCtx, newsCtx, earningsCtx] = await Promise.all([
      fetchTechnicals(keys, uniq),
      fetchAlpacaNews(keys, uniq),
      isCrypto ? Promise.resolve('') : fetchEarningsCalendar(uniq),
    ]);
  }

  return {
    yahoo,
    equities: stEquities,
    crypto:   stCrypto,
    stream:   stream.messages,
    fearGreed,
    stockTwitsCtx,
    techCtx,
    newsCtx,
    earningsCtx,
    fetchedAt: new Date().toISOString(),
  };
}

async function runServerPipeline(config: any, onStage: (s: number, st: string, msg: string) => void) {
  const { risk, mode, equity = 10000, buyingPower = 5000, keys } = config;
  const rc      = RISK_CONFIGS[risk];
  const tickers = UNIVERSES[risk];
  const meme    = risk === 'high' ? UNIVERSES.meme : [];

  // Fetch all market signals (social + extended research) in parallel
  onStage(1, 'running', `Fetching market signals + technicals + news + scoring ${tickers.length + meme.length} assets…`);
  const signals    = await fetchMarketSignals(mode, keys);
  const signalsCtx = signals.stockTwitsCtx || '';
  const techCtx    = signals.techCtx    || '';
  const newsCtx    = signals.newsCtx    || '';
  const earningsCtx = signals.earningsCtx || '';

  const s1 = parseJSON(await callClaudeTrader(
    `Financial screening. Mode:${mode}. Risk:${risk}.\nStocks:${tickers.join(',')}${meme.length ? '\nMeme:' + meme.join(',') : ''}\nScore 0-100: momentum 30%, fundamentals 40%, sentiment 30%.\n${mode === 'day' ? 'Favour pre-market movers and intraday volume.' : ''}\n${signalsCtx ? `\nLIVE SOCIAL SIGNALS (weight heavily):\n${signalsCtx}` : ''}${techCtx ? `\n\nTECHNICAL INDICATORS (RSI oversold <30=buy signal, overbought >70=avoid; MACD▲=bullish momentum; vol-spike=unusual interest):\n${techCtx}` : ''}${earningsCtx ? `\n\nEARNINGS RISK — avoid buying within 3 days of earnings unless thesis is earnings-driven:\n${earningsCtx}` : ''}\nReturn ONLY JSON:{"screened":[{"t":"XX","score":82,"type":"stock","why":"reason"}],"top":["T1","T2","T3","T4","T5","T6","T7"]}`
  )) || { screened: [], top: tickers.slice(0, 7) };
  onStage(1, 'done', `${s1.screened?.length || 0} scored · ${signals.equities.length + signals.crypto.length} social signals${techCtx ? ' · technicals' : ''}${newsCtx ? ' · news' : ''}`);

  const tops = (s1.top || tickers.slice(0, 7)).slice(0, 8);
  onStage(2, 'running', `Bull/bear debate on ${tops.length}…`);
  const s2 = parseJSON(await callClaudeTrader(
    `Adversarial research — ONLY last 7 days count.\nTickers:${tops.join(',')}. Mode:${mode}. Risk:${risk}.\n${signalsCtx ? `\nLIVE SOCIAL SIGNALS:\n${signalsCtx}` : ''}${newsCtx ? `\n\nRECENT NEWS (factor into bull/bear case):\n${newsCtx}` : ''}${techCtx ? `\n\nTECHNICAL SIGNALS:\n${techCtx}` : ''}${earningsCtx ? `\n\nEARNINGS SCHEDULE:\n${earningsCtx}` : ''}\nReturn ONLY JSON:{"analysis":[{"t":"XX","bull":"why","bear":"why","bs":8,"be":3,"v":"BUY","note":"catalyst"}]}\nv=BUY|HOLD|SELL`, true
  )) || { analysis: [] };
  onStage(2, 'done', `${s2.analysis?.length || 0} dossiers`);

  const buyList = (s2.analysis || []).filter((a: any) => a.v !== 'SELL').map((a: any) => a.t);
  const mkList  = buyList.length ? buyList : tops.slice(0, 6);
  onStage(3, 'running', `Scenarios for ${mkList.length} assets…`);
  const s3 = parseJSON(await callClaudeTrader(
    `Scenario modeling. Assets:${mkList.join(',')}.\nBull/base/bear. Probs sum to 100. 3-month targets.\nReturn ONLY JSON:{"models":[{"t":"XX","bp":30,"mp":55,"bep":15,"bt":"+40%","mt":"+12%","bet":"-20%","er":"+15%","c":8}]}`
  )) || { models: [] };
  onStage(3, 'done', `${s3.models?.length || 0} models`);

  onStage(4, 'running', 'Building portfolio…');
  const s4 = parseJSON(await callClaudeTrader(
    `Portfolio optimizer. Models:${JSON.stringify(s3.models || [])}.\nBuild ≤${rc.maxPos} positions. Equity $${equity.toFixed(0)}. BP $${buyingPower.toFixed(0)}.\nAllocs sum=100%, max single ${rc.maxSinglePct}%, min 3%, all positive EV.\n${risk === 'high' ? 'Max meme total 20%, max per coin 5%.' : ''}\nReturn ONLY JSON:{"positions":[{"t":"XX","alloc":12,"type":"stock","sector":"Tech","er":"+15%","why":"reason","notional":1200}],"ter":"+14%","thesis":"2 sentences"}`
  )) || { positions: [], ter: 'N/A', thesis: '' };
  onStage(4, 'done', `${s4.positions?.length || 0} positions`);

  onStage(5, 'running', 'Validating…');
  const s5 = parseJSON(await callClaudeTrader(
    `Validate ${risk} portfolio:${JSON.stringify(s4.positions || [])}.\nMode:${mode}. SL ${rc.stopLoss}% TP ${rc.takeProfit}%.${earningsCtx ? `\nEarnings risk: ${earningsCtx}` : ''}\nReturn ONLY JSON:{"score":85,"pass":true,"strengths":["s1"],"warnings":["w1"],"suggestion":"tip"}`
  )) || { score: 80, pass: true, strengths: [], warnings: [] };
  onStage(5, 'done', `Score ${s5.score}/100 — ${s5.pass ? 'PASS' : 'FAIL'}`);

  return { risk, mode, screened: s1.screened || [], analysis: s2.analysis || [], models: s3.models || [], positions: s4.positions || [], ter: s4.ter || 'N/A', thesis: s4.thesis || '', validation: s5, signals, timestamp: new Date().toISOString() };
}

// ── Routes ───────────────────────────────────────────────────────────────────

// ── Alpaca config (tells frontend whether env keys are present) ─────────────
traderRouter.get('/alpaca-config', async (_req, res) => {
  const dbPaper = await getSetting('alpaca_paper');
  let isPaper = dbPaper !== null ? dbPaper !== 'false' : process.env.CRON_ALPACA_PAPER !== 'false';
  const paperKeys = getAlpacaEnvKeys(true);
  const liveKeys  = getAlpacaEnvKeys(false);
  const hasPaperKeys = !!(paperKeys.key && paperKeys.secret);
  const hasLiveKeys  = !!(liveKeys.key && liveKeys.secret);
  // Auto-correct if the stored mode has no keys but the other mode does.
  // Also default to paper when no keys are found at all (safest fallback).
  if (!isPaper && !hasLiveKeys && hasPaperKeys) {
    isPaper = true;
    await setSetting('alpaca_paper', 'true');
  } else if (isPaper && !hasPaperKeys && hasLiveKeys) {
    isPaper = false;
    await setSetting('alpaca_paper', 'false');
  } else if (!hasPaperKeys && !hasLiveKeys && !isPaper) {
    // No keys found at all — reset to paper (safer default)
    isPaper = true;
    await setSetting('alpaca_paper', 'true');
  }
  res.json({ configured: isPaper ? hasPaperKeys : hasLiveKeys, isPaper, hasPaperKeys, hasLiveKeys });
});

traderRouter.post('/alpaca-paper', async (req, res) => {
  const { isPaper } = req.body;
  await setSetting('alpaca_paper', isPaper ? 'true' : 'false');
  res.json({ ok: true, isPaper });
});

// ── Alpaca key resolution ─────────────────────────────────────────────────────
// Supports two separate key pairs: CRON_ALPACA_KEY_PAPER / _LIVE.
// Paper mode falls back to legacy CRON_ALPACA_KEY / CRON_ALPACA_SECRET (original
// single-key setup was always paper). Live mode does NOT fall back to those — it
// requires an explicit CRON_ALPACA_KEY_LIVE to prevent paper keys hitting the live
// endpoint and getting "request is not authorized".
function getAlpacaEnvKeys(isPaper: boolean) {
  if (isPaper) {
    return {
      key:    process.env.CRON_ALPACA_KEY_PAPER    || process.env.CRON_ALPACA_KEY    || '',
      secret: process.env.CRON_ALPACA_SECRET_PAPER  || process.env.CRON_ALPACA_SECRET || '',
      isPaper: true,
    };
  }
  return {
    key:    process.env.CRON_ALPACA_KEY_LIVE    || '',
    secret: process.env.CRON_ALPACA_SECRET_LIVE  || '',
    isPaper: false,
  };
}

// ── Alpaca proxy (CORS workaround — browser cannot call Alpaca directly) ────
// Pass key="_env_" / secret="_env_" to use saved Replit secrets instead of
// submitting credentials from the browser.
// The frontend always passes the correct isPaper (saved to DB first via connect()),
// so we trust it directly instead of re-reading from DB here.
async function resolveKeys(key: string, secret: string, isPaper: boolean) {
  if (key === '_env_') {
    return getAlpacaEnvKeys(isPaper);
  }
  return { key, secret, isPaper };
}

traderRouter.post('/alpaca-proxy', async (req, res) => {
  try {
    const { key, secret, isPaper: _ip, path, method = 'GET', body } = req.body;
    if (!key || !secret || !path) return res.status(400).json({ error: 'key, secret, path required' });
    const k = await resolveKeys(key, secret, _ip);
    const base = k.isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
    const r = await fetch(base + path, {
      method,
      headers: { 'APCA-API-KEY-ID': k.key, 'APCA-API-SECRET-KEY': k.secret, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await r.text();
    res.status(r.status).json(text ? JSON.parse(text) : {});
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

traderRouter.post('/alpaca-data-proxy', async (req, res) => {
  try {
    const { key, secret, isPaper: _ip, path } = req.body;
    if (!key || !secret || !path) return res.status(400).json({ error: 'key, secret, path required' });
    const k = await resolveKeys(key, secret, _ip ?? true);
    const r = await fetch('https://data.alpaca.markets' + path, {
      headers: { 'APCA-API-KEY-ID': k.key, 'APCA-API-SECRET-KEY': k.secret },
    });
    const text = await r.text();
    res.status(r.status).json(text ? JSON.parse(text) : {});
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

traderRouter.post('/claude', async (req, res) => {
  try {
    const { messages, max_tokens = 8192 } = req.body;
    const msg = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens,
      messages,
    });
    res.json(msg);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

traderRouter.get('/health', async (_req, res) => {
  const dbPaper = await getSetting('alpaca_paper');
  const isPaper = dbPaper !== null ? dbPaper !== 'false' : process.env.CRON_ALPACA_PAPER !== 'false';

  const paperKeys = getAlpacaEnvKeys(true);
  const liveKeys  = getAlpacaEnvKeys(false);
  const hasPaperKeys = !!(paperKeys.key && paperKeys.secret);
  const hasLiveKeys  = !!(liveKeys.key && liveKeys.secret);
  const activeKeys   = isPaper ? paperKeys : liveKeys;
  const hasActiveKeys = isPaper ? hasPaperKeys : hasLiveKeys;

  let alpacaConnected = false;
  if (hasActiveKeys) {
    try {
      const base = isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
      const r = await fetch(`${base}/v2/account`, {
        headers: {
          'APCA-API-KEY-ID':     activeKeys.key,
          'APCA-API-SECRET-KEY': activeKeys.secret,
        },
        signal: AbortSignal.timeout(5000),
      });
      alpacaConnected = r.ok;
    } catch {}
  }

  res.json({
    status: 'ok', app: 'claude-trader', timestamp: new Date().toISOString(),
    isPaper,
    alpacaConnected,
    hasPaperKeys,
    hasLiveKeys,
    env: {
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      hasCronSecret:   !!process.env.CRON_SECRET,
      hasPaperKeys,
      hasLiveKeys,
      hasEmail:        !!process.env.SMTP_HOST,
      hasSlack:        !!process.env.SLACK_WEBHOOK_URL,
    },
  });
});

// ── Market signals endpoint ───────────────────────────────────────────────
traderRouter.get('/market-signals', async (req, res) => {
  try {
    const mode = (req.query.mode as string) || 'day';
    const signals = await fetchMarketSignals(mode);
    res.json(signals);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Per-stock daily bars (for sparkline charts) ────────────────────────────
traderRouter.get('/stock-bars/:ticker', async (req, res) => {
  try {
    const ticker = (req.params.ticker || '').toUpperCase();
    if (!ticker) return res.status(400).json({ error: 'ticker required' });
    const limit = Math.min(parseInt((req.query.limit as string) || '30'), 90);
    const timeframe = (req.query.timeframe as string) || '1Day';

    const dbPaper = await getSetting('alpaca_paper');
    const isPaper = dbPaper !== 'false';
    const keys = getAlpacaEnvKeys(isPaper);
    if (!keys.key) return res.json({ bars: [], source: 'no-key' });

    const params = new URLSearchParams({
      symbols: ticker,
      timeframe,
      limit: String(limit),
      adjustment: 'raw',
      sort: 'asc',
    });
    const d = await alpacaDataReq(keys, `/v2/stocks/bars?${params}`);
    const raw: any[] = d?.bars?.[ticker] || [];
    const bars = raw.map((b: any) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
    res.json({ bars });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Insider / congressional trade tracker ─────────────────────────────────
// Proxies House & Senate Stock Watcher public APIs (no auth needed)
traderRouter.get('/insider-trades', async (req, res) => {
  try {
    const chamber = (req.query.chamber as string) || 'both';
    const results: any[] = [];

    const fetchSafe = async (url: string, label: string) => {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': 'jdcoredev-trader/1.0' }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) return [];
        const data = await r.json();
        const arr: any[] = Array.isArray(data) ? data : (data.data || data.trades || []);
        return arr.slice(0, 200).map((t: any) => ({ ...t, _source: label }));
      } catch { return []; }
    };

    const sourceStatus: Record<string, string> = {};

    if (chamber === 'house' || chamber === 'both') {
      const house = await fetchSafe('https://housestockwatcher.com/api', 'House');
      results.push(...house);
      sourceStatus.house = house.length > 0 ? 'ok' : 'unavailable';
    }
    if (chamber === 'senate' || chamber === 'both') {
      const senate = await fetchSafe('https://senatestockwatcher.com/api', 'Senate');
      results.push(...senate);
      sourceStatus.senate = senate.length > 0 ? 'ok' : 'unavailable';
    }

    // Sort by transaction_date desc, normalise field names
    const normalised = results
      .map((t: any) => ({
        name:           t.representative || t.senator || t.first_name ? `${t.first_name||''} ${t.last_name||''}`.trim() : 'Unknown',
        ticker:         (t.ticker || t.asset_description || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
        type:           (t.type || t.transaction_type || t.transaction || '').toLowerCase(),
        amount:         t.amount || t.amount_range || '',
        date:           t.transaction_date || t.transactionDate || t.disclosure_date || '',
        chamber:        t._source,
        asset:          t.asset_description || t.ticker || '',
        party:          t.party || '',
        state:          t.state || t.district ? `${t.state||''}${t.district?'-'+t.district:''}` : '',
      }))
      .filter((t: any) => t.ticker && t.ticker.length >= 1)
      .sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
      .slice(0, 300);

    res.json({ trades: normalised, total: normalised.length, sources: chamber, sourceStatus });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

traderRouter.get('/history', async (req, res) => {
  try {
    const type = req.query.type as string || 'trades';
    const days = parseInt(req.query.days as string || '30');
    switch (type) {
      case 'trades': {
        const limit = parseInt(req.query.limit as string || '500');
        const r = await pool.query(
          `SELECT *, COALESCE(executed_at, logged_at) AS executed_at FROM trader_trades ORDER BY COALESCE(executed_at, logged_at) DESC LIMIT $1`,
          [limit]
        );
        return res.json(r.rows);
      }
      case 'snapshots': {
        const r = await pool.query('SELECT * FROM trader_snapshots WHERE logged_at > NOW()-INTERVAL \'1 day\'*$1 ORDER BY logged_at ASC', [days]);
        return res.json(r.rows);
      }
      case 'pipelines': {
        const r = await pool.query('SELECT * FROM trader_pipelines ORDER BY logged_at DESC LIMIT 50');
        return res.json(r.rows);
      }
      case 'logs': {
        const r = await pool.query('SELECT * FROM trader_logs ORDER BY logged_at DESC LIMIT 200');
        return res.json(r.rows);
      }
      default: return res.status(400).json({ error: 'unknown type' });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

traderRouter.post('/history', async (req, res) => {
  try {
    const { type, ...data } = req.body;
    if (type === 'trade') await insertTrade(data);
    if (type === 'log')   await insertLog(data.logType || 'info', data.message);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

traderRouter.get('/run-summaries', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 60, 200);
    const mode  = (req.query.mode as string) || 'all';

    const whereClause = mode !== 'all' ? `WHERE p.mode = $2` : '';
    const params: any[] = mode !== 'all' ? [limit, mode] : [limit];

    const pipelinesRes = await pool.query(`
      SELECT p.*
      FROM trader_pipelines p
      ${whereClause}
      ORDER BY p.logged_at DESC
      LIMIT $1
    `, params);

    const pipelines = pipelinesRes.rows;
    if (!pipelines.length) return res.json([]);

    // For each pipeline run, gather trades that happened within 10 minutes after the run
    const enriched = await Promise.all(pipelines.map(async (p: any) => {
      const tradesRes = await pool.query(`
        SELECT * FROM trader_trades
        WHERE mode = $1
          AND logged_at >= $2
          AND logged_at <= $2 + INTERVAL '10 minutes'
        ORDER BY logged_at ASC
      `, [p.mode, p.logged_at]);

      // Parse JSONB fields
      const screened   = p.screened_json   || [];
      const analysis   = p.analysis_json   || [];
      const positions  = p.positions_json  || [];
      const validation = p.validation_json || {};

      // Identify declined / high-potential tickers that didn't get a position
      const positionSet = new Set((positions as any[]).map((pos: any) => pos.t));
      const declined = (analysis as any[]).filter((a: any) => !positionSet.has(a.t)).map((a: any) => ({
        ...a,
        screened: (screened as any[]).find((s: any) => s.t === a.t),
      }));

      return {
        id:           p.id,
        mode:         p.mode,
        risk:         p.risk,
        ter:          p.ter,
        thesis:       p.thesis,
        pass:         p.pass,
        score:        p.score,
        logged_at:    p.logged_at,
        screened,
        analysis,
        positions,
        validation,
        declined,
        trades:       tradesRes.rows,
      };
    }));

    res.json(enriched);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

traderRouter.post('/sync-pnl', async (_req, res) => {
  try {
    const dbPaper = await getSetting('alpaca_paper');
    const isPaper = dbPaper !== null ? dbPaper !== 'false' : process.env.CRON_ALPACA_PAPER !== 'false';
    const keys = getAlpacaEnvKeys(isPaper);
    if (!keys.key || !keys.secret) return res.status(400).json({ error: 'Alpaca keys not configured' });

    const result = await syncTradesPnl(keys);

    // Also snapshot current account equity so Performance page updates
    try {
      const acct = await alpacaReq(keys, '/v2/account');
      if (!acct.error) {
        const positions = await alpacaReq(keys, '/v2/positions');
        await insertSnapshot({
          equity:    parseFloat(acct.equity),
          cash:      parseFloat(acct.buying_power),
          pnl:       parseFloat(acct.equity) - parseFloat(acct.last_equity),
          positions: Array.isArray(positions) ? positions.length : 0,
        });
      }
    } catch {}

    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

traderRouter.get('/performance', async (_req, res) => {
  try {
    const [trades, snapshots, pipelines] = await Promise.all([
      pool.query('SELECT * FROM trader_trades ORDER BY logged_at DESC LIMIT 200'),
      pool.query('SELECT * FROM trader_snapshots ORDER BY logged_at ASC'),
      pool.query('SELECT * FROM trader_pipelines ORDER BY logged_at DESC LIMIT 100'),
    ]);
    res.json({ trades: trades.rows, snapshots: snapshots.rows, pipelines: pipelines.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Agent Activity (homepage widget) ─────────────────────────────────────
traderRouter.get('/agent-activity', async (_req, res) => {
  try {
    const [pipelines, trades, logs] = await Promise.all([
      pool.query(`SELECT id, mode, risk, thesis, pass, score, ter, positions_count, logged_at
                  FROM trader_pipelines ORDER BY logged_at DESC LIMIT 20`),
      pool.query(`SELECT id, symbol, side, qty, notional, rationale, mode, status, logged_at
                  FROM trader_trades ORDER BY logged_at DESC LIMIT 10`),
      pool.query(`SELECT id, type, message, logged_at
                  FROM trader_logs WHERE type != 'info' OR message LIKE '%cron%'
                  ORDER BY logged_at DESC LIMIT 10`),
    ]);
    res.json({ pipelines: pipelines.rows, trades: trades.rows, logs: logs.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Chat: get history ─────────────────────────────────────────────────────
traderRouter.get('/chat', async (req, res) => {
  try {
    const mode = (req.query.mode as string) || 'general';
    const limit = parseInt(req.query.limit as string || '50');
    const q = mode === 'all'
      ? pool.query(`SELECT * FROM trader_chat ORDER BY created_at ASC LIMIT $1`, [limit])
      : pool.query(`SELECT * FROM trader_chat WHERE mode=$1 OR mode='general' ORDER BY created_at ASC LIMIT $2`, [mode, limit]);
    const r = await q;
    res.json(r.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Chat: send message ────────────────────────────────────────────────────
traderRouter.post('/chat', async (req, res) => {
  try {
    const { message, mode = 'general' } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message required' });

    // Save user message
    await pool.query(
      `INSERT INTO trader_chat (mode, role, content) VALUES ($1, 'user', $2)`,
      [mode, message]
    );

    // Gather context from DB
    const [pipelinesR, tradesR, positionsInfo] = await Promise.all([
      pool.query(`SELECT mode, risk, thesis, pass, score, ter, positions_count, logged_at
                  FROM trader_pipelines ORDER BY logged_at DESC LIMIT 10`),
      pool.query(`SELECT symbol, side, qty, notional, rationale, mode, status, logged_at
                  FROM trader_trades ORDER BY logged_at DESC LIMIT 20`),
      // Try to get current positions from Alpaca if configured
      (async () => {
        try {
          const dbPaper = await getSetting('alpaca_paper');
          const isPaper = dbPaper !== null ? dbPaper !== 'false' : true;
          const keys = getAlpacaEnvKeys(isPaper);
          if (!keys.key || !keys.secret) return [];
          const raw = await alpacaReq(keys, '/v2/positions');
          if (!Array.isArray(raw)) return [];
          return raw.map((p: any) => ({
            symbol: p.symbol,
            qty: parseFloat(p.qty),
            mktVal: parseFloat(p.market_value),
            unrealizedPl: parseFloat(p.unrealized_pl),
            unrealizedPlPct: parseFloat(p.unrealized_plpc) * 100,
            side: p.side,
          }));
        } catch { return []; }
      })(),
    ]);

    // Get recent chat history for context
    const histR = await pool.query(
      `SELECT role, content FROM trader_chat WHERE mode=$1 OR mode='general'
       ORDER BY created_at DESC LIMIT 20`, [mode]
    );
    const history = histR.rows.reverse();

    // Build system context
    const recentPipelines = pipelinesR.rows.map((p: any) =>
      `[${new Date(p.logged_at).toLocaleString()}] Mode:${p.mode} Risk:${p.risk} Score:${p.score} Pass:${p.pass} TER:${p.ter} Positions:${p.positions_count} Thesis:"${p.thesis}"`
    ).join('\n');

    const recentTrades = tradesR.rows.map((t: any) =>
      `[${new Date(t.logged_at).toLocaleString()}] ${t.side?.toUpperCase()} ${t.symbol} $${t.notional?.toFixed(0)||t.qty} (${t.mode}) Status:${t.status} Reason:"${t.rationale}"`
    ).join('\n');

    const currentPositions = positionsInfo.length > 0
      ? positionsInfo.map((p: any) =>
          `${p.symbol}: qty=${p.qty} val=$${p.mktVal?.toFixed(0)} P&L=${p.unrealizedPl?.toFixed(0)} (${p.unrealizedPlPct?.toFixed(1)}%)`
        ).join('\n')
      : 'No positions data available (Alpaca not connected or no open positions)';

    const systemPrompt = `You are the Claude Trader AI assistant for JD CoreDev's autonomous trading system. You have access to the system's trading history and can help explain decisions, discuss potential trades, and suggest executable actions.

CURRENT OPEN POSITIONS:
${currentPositions}

RECENT AI PIPELINE RUNS (last 10):
${recentPipelines || 'No pipeline history yet'}

RECENT TRADES (last 20):
${recentTrades || 'No trade history yet'}

ACTIVE TRADING MODE: ${mode === 'general' ? 'All modes' : mode}

INSTRUCTIONS:
- Answer questions about why the agent made specific decisions using the pipeline and trade history above
- Discuss potential investments and market ideas with the user
- If the conversation leads to a clear, agreed-upon trade action, include a special ACTION block at the END of your response:
  ACTION:{"type":"buy"|"sell","symbol":"TICKER","amount_usd":500,"reason":"brief reason","confidence":"high"|"medium"|"low"}
- Only suggest an ACTION if the user clearly wants to execute something specific and you both agree it makes sense
- Be direct, data-driven, and conversational. Keep responses concise but informative.
- For "why are we holding X" questions: reference the specific pipeline run and rationale from the trade data above.
- Flag if a position has deteriorated significantly and the original thesis no longer holds.`;

    // Call OpenAI via Replit AI integration
    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-16).map((h: any) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    ];

    const openaiRes = await fetch(`${process.env.AI_INTEGRATIONS_OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AI_INTEGRATIONS_OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: openaiMessages,
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      throw new Error(`OpenAI error: ${err}`);
    }

    const openaiData = await openaiRes.json();
    const rawContent: string = openaiData.choices?.[0]?.message?.content || 'No response';

    // Extract any ACTION block
    let action: any = null;
    let displayContent = rawContent;
    const actionMatch = rawContent.match(/ACTION:\s*(\{[\s\S]*?\})\s*$/);
    if (actionMatch) {
      try {
        action = JSON.parse(actionMatch[1]);
        displayContent = rawContent.replace(/ACTION:\s*\{[\s\S]*?\}\s*$/, '').trim();
      } catch {}
    }

    // Save assistant response
    await pool.query(
      `INSERT INTO trader_chat (mode, role, content, metadata) VALUES ($1, 'assistant', $2, $3)`,
      [mode, displayContent, action ? JSON.stringify({ action }) : null]
    );

    res.json({ content: displayContent, action });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Chat: execute a task suggested by the AI ──────────────────────────────
traderRouter.post('/chat/execute-task', async (req, res) => {
  try {
    const { symbol, type, amount_usd, reason, mode = 'general' } = req.body;
    if (!symbol || !type) return res.status(400).json({ error: 'symbol and type required' });

    const dbPaper = await getSetting('alpaca_paper');
    const isPaper = dbPaper !== null ? dbPaper !== 'false' : true;
    const keys = getAlpacaEnvKeys(isPaper);
    if (!keys.key || !keys.secret) return res.status(500).json({ error: 'Alpaca not configured' });

    let orderBody: any;
    if (type === 'buy') {
      const notional = parseFloat(amount_usd) || 500;
      orderBody = { symbol, side: 'buy', type: 'market', time_in_force: 'day', notional: notional.toFixed(2) };
    } else if (type === 'sell') {
      // Close full position
      const posRes = await alpacaReq(keys, `/v2/positions/${symbol}`);
      if (posRes.error) return res.status(400).json({ error: `No open position for ${symbol}` });
      orderBody = { symbol, side: 'sell', type: 'market', time_in_force: 'day', qty: posRes.qty };
    } else {
      return res.status(400).json({ error: 'type must be buy or sell' });
    }

    const order = await alpacaReq(keys, '/v2/orders', 'POST', orderBody);
    if (order.error) throw new Error(`Alpaca: ${order.message}`);

    await insertTrade({
      symbol, side: type, notional: type === 'buy' ? parseFloat(amount_usd) : null,
      rationale: `[Chat-initiated] ${reason || 'User-requested via AI chat'}`,
      risk: 'medium', mode, orderId: order.id, status: order.status || 'submitted',
    });

    const confirmMsg = `✓ Order submitted: ${type.toUpperCase()} ${symbol}${type === 'buy' ? ` $${amount_usd}` : ' (close position)'}. Order ID: ${order.id}`;
    await pool.query(
      `INSERT INTO trader_chat (mode, role, content, metadata) VALUES ($1, 'assistant', $2, $3)`,
      [mode, confirmMsg, JSON.stringify({ executed: true, orderId: order.id, symbol, type })]
    );

    res.json({ ok: true, orderId: order.id, status: order.status, message: confirmMsg });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

traderRouter.get('/settings', async (_req, res) => {
  try {
    const r = await pool.query('SELECT key, value FROM trader_settings');
    const settings: any = {};
    r.rows.forEach(row => settings[row.key] = row.value);
    res.json(settings);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

traderRouter.post('/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key required' });
    await setSetting(key, String(value));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

traderRouter.post('/cron/run', async (req, res) => {
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const risk = (req.body.risk || process.env.CRON_RISK || 'medium') as string;
  const mode = (req.body.mode || process.env.CRON_MODE || 'day') as string;
  const dbPaper = await getSetting('alpaca_paper');
  const isPaperMode = dbPaper !== null ? dbPaper !== 'false' : process.env.CRON_ALPACA_PAPER !== 'false';
  const keys = getAlpacaEnvKeys(isPaperMode);
  if (!keys.key || !keys.secret) return res.status(500).json({ error: 'Alpaca creds not configured' });

  const log: string[] = [];
  const push = async (msg: string, type = 'info') => { log.push(msg); await insertLog(type, `[cron] ${msg}`); };

  try {
    await push('Fetching account…');
    const rawAcct = await alpacaReq(keys, '/v2/account');
    if (rawAcct.error) throw new Error(`Alpaca: ${rawAcct.message}`);

    const account = {
      equity:       parseFloat(rawAcct.equity),
      buyingPower:  parseFloat(rawAcct.buying_power),
      cash:         parseFloat(rawAcct.cash),
      pnl:          parseFloat(rawAcct.equity) - parseFloat(rawAcct.last_equity),
    };
    await push(`Equity $${account.equity.toFixed(2)}`);

    const rawPos = await alpacaReq(keys, '/v2/positions');
    const positions = Array.isArray(rawPos) ? rawPos.map((p: any) => ({ symbol: p.symbol, mktVal: parseFloat(p.market_value) })) : [];
    await insertSnapshot({ equity: account.equity, cash: account.buyingPower, pnl: account.pnl, pnlPct: 0, positions: positions.length });

    const clock = await alpacaReq(keys, '/v2/clock');
    if (!clock.is_open && mode === 'day') {
      await push('Market closed — skipping');
      return res.json({ skipped: true, reason: 'market closed', log });
    }

    if (mode === 'day') {
      const now = new Date();
      const etH = now.getUTCHours() - 4;
      const etM = now.getUTCMinutes();
      if (etH >= 15 && etM >= 45) {
        // Only close positions that were opened by day-mode trades today
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const dayBuysRes = await pool.query<{ symbol: string }>(
          `SELECT DISTINCT symbol FROM trader_trades
           WHERE mode = 'day' AND side = 'buy'
             AND COALESCE(executed_at, logged_at) >= $1`,
          [todayStart.toISOString()]
        );
        const daySymbols = dayBuysRes.rows.map(r => r.symbol);
        const openSymbols = Array.isArray(positions) ? positions.map((p: any) => p.symbol) : [];
        const toClose = daySymbols.filter(s => openSymbols.includes(s));
        if (toClose.length) {
          await push(`3:45 PM ET — closing ${toClose.length} day trade position(s): ${toClose.join(', ')}`);
          for (const sym of toClose) {
            try { await alpacaReq(keys, `/v2/positions/${sym}`, 'DELETE'); } catch {}
            await new Promise(r => setTimeout(r, 300));
          }
        } else {
          await push('3:45 PM ET — no day trade positions to close');
        }
        return res.json({ action: 'close_day_positions', symbols: toClose, reason: 'eod', log });
      }
    }

    await push('Running Claude pipeline…');
    let pipeline: any = null;
    try {
      pipeline = await runServerPipeline(
        { risk, mode, equity: account.equity, buyingPower: account.buyingPower, keys },
        async (s, status, msg) => await push(`S${s}[${status}]: ${msg}`)
      );
      await insertPipelineRun(pipeline);
    } catch (pipeErr: any) {
      await push(`Pipeline error: ${pipeErr.message}`, 'error');
      try {
        await insertPipelineRun({
          risk, mode,
          screened: pipeline?.screened || [],
          analysis: pipeline?.analysis || [],
          positions: pipeline?.positions || [],
          ter: pipeline?.ter || 'N/A',
          thesis: `Pipeline failed: ${pipeErr.message}`,
          validation: { pass: false, score: 0, strengths: [], warnings: [`Error: ${pipeErr.message}`] },
        });
      } catch {}
      return res.status(500).json({ error: pipeErr.message, log });
    }

    if (!pipeline.validation.pass) {
      await push(`Validation failed (${pipeline.validation.score}) — skipping`, 'warn');
      return res.json({ skipped: true, reason: 'validation', log });
    }

    const rc = RISK_CONFIGS[risk];
    const sellSet = new Set((pipeline.analysis||[]).filter((a:any)=>a.v==='SELL').map((a:any)=>a.t));
    const heldSet = new Set(positions.map(p=>p.symbol));
    const trades: any[] = [];

    for (const pos of positions) {
      if (sellSet.has(pos.symbol)) trades.push({ symbol: pos.symbol, side: 'sell', notional: pos.mktVal, rationale: 'SELL signal' });
    }
    for (const p of (pipeline.positions||[])) {
      if (heldSet.has(p.t)) continue;
      const notional = p.notional || (account.equity * (p.alloc / 100));
      if (notional >= 1) trades.push({ symbol: p.t, side: 'buy', notional, rationale: p.why || 'AI signal' });
    }

    let orders = 0;
    for (const t of trades.filter(x=>x.side==='sell')) {
      const body = { symbol:t.symbol, side:'sell', type:'market', time_in_force:'day', notional:t.notional.toFixed(2) };
      const res2 = await alpacaReq(keys, '/v2/orders', 'POST', body);
      await insertTrade({ ...t, orderId:res2.id, status:res2.status||'submitted', risk, mode });
      orders++;
    }
    for (const t of trades.filter(x=>x.side==='buy')) {
      if (account.buyingPower < t.notional) continue;
      const price = await getQuote(keys, t.symbol);
      const body = buildOrderBody({ ...t, price, mode, stopLossPct:rc.stopLoss, takeProfitPct:rc.takeProfit });
      if (!body) continue;
      const res2 = await alpacaReq(keys, '/v2/orders', 'POST', body);
      await insertTrade({ ...t, orderId:res2.id, status:res2.status||'submitted', risk, mode });
      account.buyingPower -= t.notional;
      orders++;
    }

    await push(`Done — ${orders} orders submitted`);
    res.json({ action: 'executed', orders, log });

  } catch (e: any) {
    await push(`ERROR: ${e.message}`, 'error');
    res.status(500).json({ error: e.message, log });
  }
});

// ── Cron scheduler ───────────────────────────────────────────────────────────
// Runs every 15 minutes (finest granularity). Internally checks whether it's
// actually time to act based on the active mode's cadence:
//   day       → every 15 min, market hours only (9:30–16:00 ET, Mon–Fri)
//   swing     → every 4 hours, market hours only
//   portfolio → once per day at market open (9:30 ET)
//   crypto    → once per day, 24/7 including weekends

const MODE_INTERVAL_MINUTES: Record<string, number> = {
  day:       15,
  swing:     240,
  portfolio: 1440,
  crypto:    1440,
};

function isMarketHours(): boolean {
  const now  = new Date();
  const day  = now.getUTCDay();                       // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const etH  = now.getUTCHours() - 4;                // rough ET (ignores DST edge)
  const etM  = now.getUTCMinutes();
  const mins = etH * 60 + etM;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;      // 9:30–16:00 ET
}

async function shouldRunNow(mode: string): Promise<boolean> {
  const dbInterval = await getSetting(`cron_interval_${mode}`);
  const interval = dbInterval ? parseFloat(dbInterval) : (MODE_INTERVAL_MINUTES[mode] ?? 15);

  if (mode === 'crypto') {
    // 24/7 — just check the time interval
    const lastRaw = await getSetting(`cron_last_run_${mode}`);
    if (!lastRaw) return true;
    const mins = (Date.now() - new Date(lastRaw).getTime()) / 60000;
    return mins >= interval;
  }

  // Stock modes: only run during market hours
  if (!isMarketHours()) return false;

  const lastRaw = await getSetting(`cron_last_run_${mode}`);
  if (!lastRaw) return true;
  const mins = (Date.now() - new Date(lastRaw).getTime()) / 60000;
  return mins >= interval;
}

let cronJob: cron.ScheduledTask | null = null;

export async function initTrader() {
  await initTraderTables();
  console.log('[trader] tables ready');

  // Tick every 15 minutes around the clock so crypto and the scheduler itself
  // are always evaluated. Mode-specific gating happens inside the callback.
  const schedule = '*/15 * * * *';

  cronJob = cron.schedule(schedule, async () => {
    const enabled = await getSetting('cron_enabled');
    if (enabled !== 'true') return;

    const cronDbPaper = await getSetting('alpaca_paper');
    const cronIsPaper = cronDbPaper !== null ? cronDbPaper !== 'false' : process.env.CRON_ALPACA_PAPER !== 'false';
    const cronKeys = getAlpacaEnvKeys(cronIsPaper);
    if (!cronKeys.key || !cronKeys.secret) {
      console.log('[trader-cron] Alpaca creds not set — skipping');
      return;
    }

    const risk = await getSetting('cron_risk') || process.env.CRON_RISK || 'medium';

    // Run every enabled mode independently on its own cadence
    for (const mode of ['day', 'swing', 'portfolio', 'crypto']) {
      const modeEnabled = await getSetting(`cron_${mode}_enabled`);
      if (modeEnabled !== 'true') continue;

      const ready = await shouldRunNow(mode);
      if (!ready) {
        console.log(`[trader-cron] ${mode} — not yet time, skipping`);
        continue;
      }

      // Record run time before executing so overlapping ticks can't double-fire
      await setSetting(`cron_last_run_${mode}`, new Date().toISOString());

      const intervalLabel = MODE_INTERVAL_MINUTES[mode] >= 60
        ? `${MODE_INTERVAL_MINUTES[mode] / 60}h`
        : `${MODE_INTERVAL_MINUTES[mode]}m`;
      console.log(`[trader-cron] Running — ${risk}/${mode} (cadence: ${intervalLabel})`);
      await insertLog('info', `[cron] Scheduled cycle — ${risk}/${mode} · cadence ${intervalLabel}`);

      try {
        // Day-trading EOD: close only day-tagged positions between 3:45–4 PM ET
        if (mode === 'day') {
          const now = new Date();
          const etH = now.getUTCHours() - 4;
          const etM = now.getUTCMinutes();
          if (etH === 15 && etM >= 45) {
            await insertLog('info', '[cron] Day EOD — closing day-tagged positions');
            const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
            const dayBuysRes = await pool.query<{ symbol: string }>(
              `SELECT DISTINCT symbol FROM trader_trades
               WHERE mode = 'day' AND side = 'buy'
                 AND COALESCE(executed_at, logged_at) >= $1`,
              [todayStart.toISOString()]
            );
            const rawPos = await alpacaReq(cronKeys, '/v2/positions');
            const openSymbols: string[] = Array.isArray(rawPos) ? rawPos.map((p: any) => p.symbol) : [];
            const toClose = dayBuysRes.rows.map(r => r.symbol).filter(s => openSymbols.includes(s));
            for (const sym of toClose) {
              try { await alpacaReq(cronKeys, `/v2/positions/${sym}`, 'DELETE'); } catch {}
              await new Promise(r => setTimeout(r, 300));
            }
            await insertLog('info', `[cron] EOD closed ${toClose.length} day positions: ${toClose.join(', ') || 'none'}`);
            continue;
          }
        }

        // Fetch live account data, insert equity snapshot, pass real values to pipeline
        let cronEquity = 10000;
        let cronBp = 5000;
        try {
          const cronAcct = await alpacaReq(cronKeys, '/v2/account');
          if (!cronAcct.error) {
            cronEquity = parseFloat(cronAcct.equity) || 10000;
            cronBp     = parseFloat(cronAcct.buying_power) || 5000;
            const cronPnlDay = cronEquity - parseFloat(cronAcct.last_equity || String(cronEquity));
            const cronPos    = await alpacaReq(cronKeys, '/v2/positions');
            const cronPosCount = Array.isArray(cronPos) ? cronPos.length : 0;
            await insertSnapshot({ equity: cronEquity, cash: cronBp, pnl: cronPnlDay, positions: cronPosCount });
            await insertLog('info', `[cron:${mode}] Snapshot — equity $${cronEquity.toFixed(2)}, ${cronPosCount} positions`);
          }
        } catch (snapErr: any) {
          await insertLog('warn', `[cron:${mode}] Snapshot failed: ${snapErr.message}`);
        }

        let pipeline: any = null;
        try {
          pipeline = await runServerPipeline({ risk, mode, equity: cronEquity, buyingPower: cronBp, keys: cronKeys }, async (s, st, msg) => {
            console.log(`[trader-cron][${mode}] S${s}[${st}]: ${msg}`);
            await insertLog('info', `[cron:${mode}] S${s}: ${msg}`);
          });
          await insertPipelineRun(pipeline);
          await insertLog('info', `[cron:${mode}] Pipeline complete — ${pipeline.positions.length} positions · ${pipeline.ter}`);
        } catch (pipeErr: any) {
          console.error(`[trader-cron][${mode}] Pipeline error:`, pipeErr.message);
          await insertLog('error', `[cron:${mode}] Pipeline ERROR: ${pipeErr.message}`);
          // Always save a failure record so the Runs page shows what happened
          try {
            await insertPipelineRun({
              risk, mode,
              screened: pipeline?.screened || [],
              analysis: pipeline?.analysis || [],
              positions: pipeline?.positions || [],
              ter: pipeline?.ter || 'N/A',
              thesis: `Pipeline failed: ${pipeErr.message}`,
              validation: { pass: false, score: 0, strengths: [], warnings: [`Error: ${pipeErr.message}`] },
            });
          } catch {}
        }

        // Reconcile P&L from Alpaca fill activities (runs regardless of pipeline success)
        try {
          const { updated } = await syncTradesPnl(cronKeys);
          if (updated > 0) await insertLog('info', `[cron:${mode}] PnL sync — ${updated} trade(s) updated`);
        } catch (syncErr: any) {
          await insertLog('warn', `[cron:${mode}] PnL sync failed: ${syncErr.message}`);
        }
      } catch (e: any) {
        console.error(`[trader-cron][${mode}] Error:`, e.message);
        await insertLog('error', `[cron:${mode}] ERROR: ${e.message}`);
      }

      // Brief pause between modes to avoid Alpaca rate limits
      await new Promise(r => setTimeout(r, 1000));
    }
  }, { timezone: 'America/New_York' });

  const cadences = Object.entries(MODE_INTERVAL_MINUTES)
    .map(([m, mins]) => `${m}=${mins >= 60 ? mins/60+'h' : mins+'m'}`)
    .join(', ');
  console.log(`[trader] cron scheduler ready — cadences: ${cadences}`);
}
