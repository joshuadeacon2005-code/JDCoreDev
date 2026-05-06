/**
 * Trader agent-routine endpoints
 * ──────────────────────────────────────────────────────────────────────────
 * These endpoints back an Anthropic-hosted scheduled routine (created by the
 * user via /schedule). The routine fires every 4 hours during US market
 * hours, calls GET /agent-state to read the world, decides what to do, and
 * POSTs decisions back to /agent-decisions for execution against Alpaca.
 *
 * The legacy server-side cron + Claude API pipeline in trader.ts is being
 * phased out — the routine model uses the user's Claude subscription quota
 * instead of metered API spend.
 *
 * Auth: x-jdcd-agent-key header matched against env JDCD_AGENT_KEY.
 * Mounted at /api/trader/agent.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { pool } from "./db";
import {
  alpacaReq,
  getAlpacaEnvKeys,
  fetchEarningsCalendar,
} from "./trader";

export const traderAgentRouter = Router();

// ── Auth ──────────────────────────────────────────────────────────────────
function requireAgentKey(req: Request, res: Response, next: NextFunction) {
  const provided = req.headers["x-jdcd-agent-key"];
  const expected = process.env.JDCD_AGENT_KEY;
  if (!expected) {
    return res.status(503).json({ error: "JDCD_AGENT_KEY not configured on server" });
  }
  if (typeof provided !== "string" || provided !== expected) {
    return res.status(401).json({ error: "Invalid or missing x-jdcd-agent-key" });
  }
  next();
}

// ── Hard risk constraints ─────────────────────────────────────────────────
// The routine receives these in /agent-state. Any decision that violates them
// is rejected at submission time regardless of what the routine proposes.
const AGENT_CONSTRAINTS = {
  maxPositions:         10,
  maxPositionPct:       10,    // % of equity per position — tighter for small/mid-cap diversification
  stopLossPct:          8,     // wider stop — small/mid-caps need room to breathe through intraday noise
  takeProfitPct:        18,    // let catalyst-driven winners run
  maxDrawdown7dPct:     10,
  noEarningsWithinDays: 3,
} as const;

// ── DB helpers (small, inline to avoid widening trader.ts exports) ────────
async function getSetting(key: string): Promise<string | null> {
  const r = await pool.query("SELECT value FROM trader_settings WHERE key=$1", [key]);
  return r.rows[0]?.value ?? null;
}

async function getActiveAlpacaKeys() {
  const dbPaper = await getSetting("alpaca_paper");
  const isPaper = dbPaper !== null
    ? dbPaper !== "false"
    : process.env.CRON_ALPACA_PAPER !== "false";
  const keys = getAlpacaEnvKeys(isPaper);
  return { keys, isPaper };
}

async function compute7dDrawdownPct(equityNow: number): Promise<number> {
  const r = await pool.query(`
    SELECT equity FROM trader_snapshots
    WHERE logged_at > NOW() - INTERVAL '7 days'
    ORDER BY logged_at ASC
  `);
  if (r.rows.length === 0) return 0;
  const eqs = r.rows.map((row: any) => parseFloat(row.equity)).filter((n: number) => Number.isFinite(n));
  if (eqs.length === 0) return 0;
  const peak = Math.max(...eqs, equityNow);
  return peak > 0 ? Math.round((peak - equityNow) / peak * 1000) / 10 : 0;
}

// ── GET /api/trader/agent/state ───────────────────────────────────────────
// Single call returns everything the routine needs to decide. Routine may
// supplement with /api/trader/market-signals or /api/trader/stock-bars on
// specific symbols if it wants fresher technical data.
traderAgentRouter.get("/state", requireAgentKey, async (_req, res) => {
  try {
    const { keys, isPaper } = await getActiveAlpacaKeys();
    if (!keys.key || !keys.secret) {
      return res.status(503).json({ error: `Alpaca ${isPaper ? "paper" : "live"} keys not configured` });
    }

    const [account, positions] = await Promise.all([
      alpacaReq(keys, "/v2/account").catch(() => null),
      alpacaReq(keys, "/v2/positions").catch(() => []),
    ]);

    const recentRuns = await pool.query(`
      SELECT id, logged_at, decision_source, mode, risk, thesis, decisions_json,
             positions_json, executed_status, score, pass
      FROM trader_pipelines
      ORDER BY logged_at DESC
      LIMIT 30
    `);

    const recentTrades = await pool.query(`
      SELECT id, symbol, side, qty, notional, price, pnl, mode, catalyst_class, strategy_profile, logged_at, executed_at
      FROM trader_trades
      ORDER BY logged_at DESC
      LIMIT 60
    `);

    const equityHistory = await pool.query(`
      SELECT logged_at, equity
      FROM trader_snapshots
      WHERE logged_at > NOW() - INTERVAL '7 days'
      ORDER BY logged_at ASC
    `);

    // Reflection memory: last N reflections + trades that closed but haven't
    // been reflected on yet + hit-rate-by-catalyst aggregates.
    const recentReflections = await pool.query(`
      SELECT id, ticker, closed_at, hold_days, pnl_usd, pnl_pct,
             catalyst_class, strategy_profile, reflection, what_worked, what_didnt, next_time
      FROM trader_reflections
      ORDER BY created_at DESC
      LIMIT 10
    `);

    const tradesNeedingReflection = await pool.query(`
      SELECT t.id, t.symbol, t.side, t.qty, t.notional, t.price, t.pnl,
             t.catalyst_class, t.strategy_profile, t.logged_at, t.executed_at
      FROM trader_trades t
      LEFT JOIN trader_reflections r ON r.trade_id = t.id
      WHERE t.pnl IS NOT NULL
        AND t.logged_at > NOW() - INTERVAL '30 days'
        AND r.id IS NULL
      ORDER BY t.logged_at DESC
      LIMIT 20
    `);

    const catalystHitRate = await pool.query(`
      SELECT catalyst_class,
             COUNT(*)::int                                   AS trades,
             SUM(CASE WHEN pnl_usd > 0 THEN 1 ELSE 0 END)::int AS wins,
             ROUND(AVG(pnl_pct)::numeric, 2)                 AS avg_pnl_pct,
             ROUND(SUM(pnl_usd)::numeric, 2)                 AS total_pnl_usd
      FROM trader_reflections
      WHERE catalyst_class IS NOT NULL
      GROUP BY catalyst_class
      ORDER BY total_pnl_usd DESC NULLS LAST
    `);

    const equityNow = parseFloat(account?.equity || "0");
    const drawdown7dPct = await compute7dDrawdownPct(equityNow);
    const strategyProfile = (await getSetting("strategy_profile")) || "aggressive";

    res.json({
      mode: "swing",
      isPaper,
      generatedAt: new Date().toISOString(),
      constraints: AGENT_CONSTRAINTS,
      account: account ? {
        equity:         equityNow,
        cash:           parseFloat(account.cash || "0"),
        buyingPower:    parseFloat(account.buying_power || "0"),
        portfolioValue: parseFloat(account.portfolio_value || "0"),
        accountNumber:  account.account_number,
        currency:       account.currency || "USD",
      } : null,
      positions: (positions || []).map((p: any) => ({
        symbol:          p.symbol,
        qty:             parseFloat(p.qty || "0"),
        side:            p.side,
        avgEntry:        parseFloat(p.avg_entry_price || "0"),
        currentPrice:    parseFloat(p.current_price || "0"),
        marketValue:     parseFloat(p.market_value || "0"),
        unrealizedPL:    parseFloat(p.unrealized_pl || "0"),
        unrealizedPLPct: parseFloat(p.unrealized_plpc || "0") * 100,
      })),
      drawdown7dPct,
      equityHistory: equityHistory.rows.map((r: any) => ({
        ts:     r.logged_at,
        equity: parseFloat(r.equity),
      })),
      recentDecisions: recentRuns.rows.map((r: any) => ({
        id:             r.id,
        loggedAt:       r.logged_at,
        source:         r.decision_source || "legacy-cron",
        mode:           r.mode,
        risk:           r.risk,
        thesis:         r.thesis,
        decisions:      r.decisions_json,
        positions:      r.positions_json,
        executedStatus: r.executed_status,
        score:          r.score,
        pass:           r.pass,
      })),
      recentTrades: recentTrades.rows.map((r: any) => ({
        id:         r.id,
        symbol:     r.symbol,
        side:       r.side,
        qty:        r.qty,
        notional:   r.notional,
        price:      r.price,
        pnl:        r.pnl,
        mode:       r.mode,
        loggedAt:   r.logged_at,
        executedAt: r.executed_at,
      })),
      currentRisk: (await getSetting("cron_risk")) || "medium",
      strategyProfile,
      recentReflections: recentReflections.rows,
      tradesNeedingReflection: tradesNeedingReflection.rows,
      catalystHitRate: catalystHitRate.rows,
      marketHints: {
        marketSignalsEndpoint: "/api/trader/market-signals?mode=swing",
        stockBarsEndpoint:     "/api/trader/stock-bars/{SYMBOL}?limit=60&timeframe=1Day",
        reflectionsEndpoint:   "/api/trader/agent/reflections (POST)",
        note: "Call market-signals for fresh indicators / news / earnings. " +
              "Call stock-bars for price history on a specific ticker. " +
              "Both endpoints are public — no auth header needed. " +
              "POST reflections at end of fire to seed next-fire memory.",
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/trader/agent/decisions ──────────────────────────────────────
// Routine submits decisions. Server validates against hard constraints,
// executes survivors against Alpaca (respecting current paper/live setting),
// records the run to trader_pipelines.
traderAgentRouter.post("/decisions", requireAgentKey, async (req, res) => {
  try {
    const body = req.body || {};
    const thesis: string = (body.thesis || "").toString().slice(0, 4000);
    const decisions: any[] = Array.isArray(body.decisions) ? body.decisions : [];

    if (!thesis || decisions.length === 0) {
      return res.status(400).json({ error: "thesis and non-empty decisions array required" });
    }

    const { keys, isPaper } = await getActiveAlpacaKeys();
    if (!keys.key || !keys.secret) {
      return res.status(503).json({ error: `Alpaca ${isPaper ? "paper" : "live"} keys not configured` });
    }

    const account   = await alpacaReq(keys, "/v2/account");
    const positions = await alpacaReq(keys, "/v2/positions");
    const equity    = parseFloat(account?.equity || "0");
    const heldSymbols = new Set((positions || []).map((p: any) => p.symbol));

    const drawdown7dPct = await compute7dDrawdownPct(equity);

    // Earnings within N days for any symbol the routine wants to BUY.
    const buySymbols = decisions
      .filter(d => d.action === "buy" && typeof d.symbol === "string")
      .map(d => d.symbol.toUpperCase());
    const earningsCtx = buySymbols.length > 0 ? await fetchEarningsCalendar(buySymbols) : "";
    const earningsRiskSymbols = new Set<string>();
    for (const sym of buySymbols) {
      if (earningsCtx.toUpperCase().includes(sym)) earningsRiskSymbols.add(sym);
    }

    // Account-level blockers stop the whole run.
    const accountBlockers: string[] = [];
    const incomingBuyCount = decisions.filter(d => d.action === "buy").length;
    const wouldBeTotal = heldSymbols.size + incomingBuyCount;
    if (wouldBeTotal > AGENT_CONSTRAINTS.maxPositions) {
      accountBlockers.push(
        `Decision would push positions to ${wouldBeTotal} (held ${heldSymbols.size} + new ${incomingBuyCount}); ` +
        `maxPositions=${AGENT_CONSTRAINTS.maxPositions}.`
      );
    }
    if (drawdown7dPct > AGENT_CONSTRAINTS.maxDrawdown7dPct) {
      accountBlockers.push(
        `7-day drawdown ${drawdown7dPct}% exceeds limit ${AGENT_CONSTRAINTS.maxDrawdown7dPct}% — no new entries.`
      );
    }

    const results: any[] = [];
    let executedCount = 0;
    let rejectedCount = 0;

    for (const d of decisions) {
      const symbol    = (d.symbol || "").toString().toUpperCase();
      const action    = (d.action || "").toString().toLowerCase();
      const rationale = (d.rationale || "").toString().slice(0, 500);

      const reasons: string[] = [];

      if (!["buy", "sell", "hold"].includes(action)) reasons.push(`Invalid action "${action}".`);
      if (!symbol) reasons.push("Symbol required.");

      if (action === "hold") {
        results.push({ symbol, action, status: "noop", rationale });
        continue;
      }

      if (action === "buy") {
        const notional = Number(d.notional);
        if (!Number.isFinite(notional) || notional <= 0) {
          reasons.push("Buy decisions require positive `notional`.");
        } else if (equity > 0 && (notional / equity) * 100 > AGENT_CONSTRAINTS.maxPositionPct) {
          reasons.push(
            `Notional $${notional.toFixed(2)} = ${((notional / equity) * 100).toFixed(1)}% of equity, ` +
            `exceeds maxPositionPct=${AGENT_CONSTRAINTS.maxPositionPct}%.`
          );
        }
        if (earningsRiskSymbols.has(symbol) && !d.earnings_aware) {
          reasons.push(
            `${symbol} has earnings within ${AGENT_CONSTRAINTS.noEarningsWithinDays} days — ` +
            `set earnings_aware:true to acknowledge.`
          );
        }
      }

      if (action === "sell") {
        const heldPos = (positions || []).find((p: any) => p.symbol === symbol);
        if (!heldPos) reasons.push(`Cannot sell ${symbol} — no open position.`);
      }

      if (accountBlockers.length > 0) {
        for (const b of accountBlockers) reasons.push(b);
      }

      if (reasons.length > 0) {
        rejectedCount++;
        results.push({ symbol, action, status: "rejected", reasons, rationale });
        continue;
      }

      // Execute via Alpaca.
      try {
        let orderBody: any;
        if (action === "buy") {
          orderBody = {
            symbol,
            side: "buy",
            type: d.type === "limit" ? "limit" : "market",
            time_in_force: "day",
            notional: Number(d.notional).toFixed(2),
          };
          if (d.type === "limit" && d.limit_price) orderBody.limit_price = String(d.limit_price);
        } else {
          const heldPos = (positions || []).find((p: any) => p.symbol === symbol);
          const qty = d.qty || heldPos?.qty;
          orderBody = {
            symbol,
            side: "sell",
            type: "market",
            time_in_force: "day",
            qty: String(qty),
          };
        }
        const order = await alpacaReq(keys, "/v2/orders", "POST", orderBody);
        if (order && order.id) {
          executedCount++;
          await pool.query(`
            INSERT INTO trader_trades (id, symbol, side, qty, notional, status, rationale, risk, mode, order_id, catalyst_class, strategy_profile, is_paper)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            ON CONFLICT (id) DO NOTHING
          `, [
            order.id, symbol, action,
            parseFloat(order.qty || "0") || null,
            parseFloat(order.notional || "0") || null,
            order.status, rationale,
            d.risk_level || (await getSetting("cron_risk")) || "medium",
            "swing",
            order.id,
            (d.catalyst_class || "").toString().slice(0, 64) || null,
            (d.strategy_profile || "").toString().slice(0, 32) || null,
            isPaper,
          ]);
          results.push({ symbol, action, status: "executed", orderId: order.id, rationale });
        } else {
          rejectedCount++;
          results.push({
            symbol, action, status: "order_failed",
            reasons: [order?.message || "Unknown order error"], rationale,
          });
        }
      } catch (e: any) {
        rejectedCount++;
        results.push({ symbol, action, status: "error", reasons: [e.message], rationale });
      }
    }

    // Snapshot post-execution.
    try {
      const post = await alpacaReq(keys, "/v2/account");
      await pool.query(`
        INSERT INTO trader_snapshots (equity, buying_power, pnl_day, positions_count, is_paper)
        VALUES ($1,$2,$3,$4,$5)
      `, [
        parseFloat(post?.equity || "0"),
        parseFloat(post?.buying_power || "0"),
        parseFloat(post?.equity || "0") - parseFloat(post?.last_equity || "0"),
        (positions || []).length,
        isPaper,
      ]);
    } catch {}

    const runStatus =
      rejectedCount === 0 && executedCount > 0 ? "executed"
      : executedCount > 0                       ? "partial"
      : "rejected";

    await pool.query(`
      INSERT INTO trader_pipelines
        (risk, mode, positions_count, ter, thesis, pass, score,
         decision_source, decisions_json, executed_status, positions_json, is_paper)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      (await getSetting("cron_risk")) || "medium",
      "swing",
      executedCount,
      null,
      thesis,
      rejectedCount === 0,
      Math.max(0, 100 - rejectedCount * 10),
      "agent-routine",
      JSON.stringify(decisions),
      runStatus,
      JSON.stringify(results),
      isPaper,
    ]);

    await pool.query(`
      INSERT INTO trader_logs (message, type, is_paper)
      VALUES ($1, $2, $3)
    `, [
      `[agent-routine] ${executedCount} executed / ${rejectedCount} rejected. ${thesis.slice(0, 120)}`,
      runStatus === "rejected" ? "warn" : "info",
      isPaper,
    ]);

    res.status(201).json({
      status: runStatus,
      executed: executedCount,
      rejected: rejectedCount,
      results,
      isPaper,
      accountBlockers,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/trader/agent/reflections ────────────────────────────────────
// Routine writes one or more post-trade reflections at the end of a fire.
// Each reflection links to a closed trade row and captures what_worked /
// what_didnt / next_time so the next fire can inject prior lessons into the
// Analyst+Contrarian prompt. Hit-rate-by-catalyst aggregates roll up from
// these rows in /state.
traderAgentRouter.post("/reflections", requireAgentKey, async (req, res) => {
  try {
    const reflections: any[] = Array.isArray(req.body?.reflections) ? req.body.reflections : [];
    if (reflections.length === 0) {
      return res.status(400).json({ error: "non-empty `reflections` array required" });
    }

    const { isPaper } = await getActiveAlpacaKeys();
    let inserted = 0;
    const errors: string[] = [];

    for (const r of reflections) {
      const ticker = (r.ticker || "").toString().toUpperCase().slice(0, 16);
      const reflection = (r.reflection || "").toString().slice(0, 4000);
      if (!ticker || !reflection) {
        errors.push(`Skipped: missing ticker or reflection (${JSON.stringify(r).slice(0, 80)})`);
        continue;
      }

      try {
        await pool.query(`
          INSERT INTO trader_reflections
            (trade_id, ticker, closed_at, hold_days, pnl_usd, pnl_pct,
             catalyst_class, strategy_profile, reflection, what_worked, what_didnt, next_time, is_paper)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `, [
          r.trade_id ?? null,
          ticker,
          r.closed_at ?? null,
          Number.isFinite(+r.hold_days) ? +r.hold_days : null,
          Number.isFinite(+r.pnl_usd)   ? +r.pnl_usd   : null,
          Number.isFinite(+r.pnl_pct)   ? +r.pnl_pct   : null,
          (r.catalyst_class || "").toString().slice(0, 64) || null,
          (r.strategy_profile || "").toString().slice(0, 32) || null,
          reflection,
          (r.what_worked || "").toString().slice(0, 1000) || null,
          (r.what_didnt  || "").toString().slice(0, 1000) || null,
          (r.next_time   || "").toString().slice(0, 1000) || null,
          isPaper,
        ]);
        inserted++;
      } catch (e: any) {
        errors.push(`${ticker}: ${e.message}`);
      }
    }

    res.status(201).json({ inserted, errors, total: reflections.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/trader/agent/ping ────────────────────────────────────────────
// Connectivity + auth check — useful for verifying the routine's setup.
traderAgentRouter.get("/ping", requireAgentKey, (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ── POST /api/trader/agent/run ────────────────────────────────────────────
// Fires the Anthropic-hosted trader routine on demand (the "Start Agent"
// button on /admin/trader). Uses the routine's per-trigger API token, not an
// Anthropic API key — costs subscription quota, not metered API spend.
//
// One-time setup:
//   1. Open https://claude.ai/code/routines/{CLAUDE_ROUTINE_TRADER_ID}
//   2. Add another trigger → API → Generate token (shown once)
//   3. Paste into Railway env CLAUDE_ROUTINE_TRADER_TOKEN
const DEFAULT_ROUTINE_ID = "trig_01RdmE8PHaQyfruhHQeheDDb";
const ROUTINE_FIRE_BETA  = "experimental-cc-routine-2026-04-01";

traderAgentRouter.post("/run", async (req, res) => {
  const token     = process.env.CLAUDE_ROUTINE_TRADER_TOKEN;
  const routineId = process.env.CLAUDE_ROUTINE_TRADER_ID || DEFAULT_ROUTINE_ID;

  if (!token) {
    return res.status(503).json({
      error: "CLAUDE_ROUTINE_TRADER_TOKEN not configured",
      hint:  "Generate an API trigger token at https://claude.ai/code/routines/" +
             routineId + " and set it in Railway env.",
    });
  }

  const note = (req.body?.note || "").toString().slice(0, 200);
  const text = note
    ? `Manual fire from JDCoreDev admin UI — ${note}`
    : `Manual fire from JDCoreDev admin UI at ${new Date().toISOString()}`;

  try {
    const upstream = await fetch(
      `https://api.anthropic.com/v1/claude_code/routines/${routineId}/fire`,
      {
        method:  "POST",
        headers: {
          "Authorization":     `Bearer ${token}`,
          "anthropic-beta":    ROUTINE_FIRE_BETA,
          "anthropic-version": "2023-06-01",
          "Content-Type":      "application/json",
        },
        body: JSON.stringify({ text }),
      }
    );
    const bodyText = await upstream.text();
    let bodyJson: any = null;
    try { bodyJson = JSON.parse(bodyText); } catch {}

    if (!upstream.ok) {
      await pool.query(
        `INSERT INTO trader_logs (message, type) VALUES ($1, $2)`,
        [`[agent-run] dispatch failed (${upstream.status}): ${bodyText.slice(0, 200)}`, "warn"]
      ).catch(() => {});
      return res.status(upstream.status).json({
        error:    "Anthropic routine-fire rejected the request",
        status:   upstream.status,
        upstream: bodyJson ?? bodyText,
      });
    }

    await pool.query(
      `INSERT INTO trader_logs (message, type) VALUES ($1, $2)`,
      [`[agent-run] routine ${routineId} dispatched manually`, "info"]
    ).catch(() => {});

    res.status(202).json({
      status:    "dispatched",
      routineId,
      dispatchedAt: new Date().toISOString(),
      note:      "Routine queued — decisions land in trader_pipelines (source: agent-routine) when it completes.",
      upstream:  bodyJson ?? bodyText,
    });
  } catch (e: any) {
    res.status(502).json({ error: `Failed to reach Anthropic API: ${e.message}` });
  }
});
