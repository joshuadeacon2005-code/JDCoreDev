/**
 * Predictor agent-routine endpoints
 * ──────────────────────────────────────────────────────────────────────────
 * These endpoints back an Anthropic-hosted scheduled routine that drives the
 * Kalshi (+ optional Polymarket) prediction agent. The routine fetches
 * GET /agent-state to read balances + open markets + recent bets, runs its
 * own council debate via WebSearch, and POSTs decisions to /agent-decisions
 * for execution. Replaces the cron-driven Claude API pipeline in predictor.ts
 * — costs the user's Claude subscription quota instead of metered API spend.
 *
 * Auth: x-jdcd-agent-key header matched against env JDCD_AGENT_KEY (shared
 * with the trader agent).
 * Mounted at /api/predictor/agent.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { OrderType, Side } from "@polymarket/clob-client";
import { pool } from "./db";
import {
  kalshiReq,
  kalshiPublicReq,
  getKalshiKeys,
  getPolyClobClient,
  getPolyCredentials,
  getSetting,
} from "./predictor";

export const predictorAgentRouter = Router();

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
// Defaults; live values pulled from predictor_settings each call so the
// existing /admin/predictor settings UI continues to drive both pipelines.
const DEFAULTS = {
  minEdge:        0.05,
  maxBetUsd:      25,
  polyMaxBetUsd:  20,
  maxPositions:   10,
  maxDecisions:   5,    // hard cap per routine run regardless of settings
  noPriceCeiling: 0.80, // skip NO bets where NO costs more than this
} as const;

async function loadConstraints() {
  const [minEdge, maxBetUsd, polyMaxBetUsd, maxPositions] = await Promise.all([
    getSetting("min_edge"),
    getSetting("max_bet_usd"),
    getSetting("poly_max_bet_usd"),
    getSetting("max_positions"),
  ]);
  return {
    minEdge:        parseFloat(minEdge       || String(DEFAULTS.minEdge)),
    maxBetUsd:      parseFloat(maxBetUsd     || String(DEFAULTS.maxBetUsd)),
    polyMaxBetUsd:  parseFloat(polyMaxBetUsd || String(DEFAULTS.polyMaxBetUsd)),
    maxPositions:   parseInt(maxPositions    || String(DEFAULTS.maxPositions)),
    maxDecisions:   DEFAULTS.maxDecisions,
    noPriceCeiling: DEFAULTS.noPriceCeiling,
  };
}

// ── GET /api/predictor/agent/state ────────────────────────────────────────
// One call returns everything the routine needs to decide.
predictorAgentRouter.get("/state", requireAgentKey, async (_req, res) => {
  try {
    const constraints = await loadConstraints();
    const [kalshiKeys, polyEnabled, mode] = await Promise.all([
      getKalshiKeys().catch(() => null),
      getSetting("poly_enabled"),
      getSetting("mode"),
    ]);

    // Kalshi balance + positions (best-effort — don't fail the whole call)
    const [kalshiBalance, kalshiPositions] = await Promise.all([
      kalshiReq("/portfolio/balance").catch((e: any) => ({ error: e.message })),
      kalshiReq("/portfolio/positions?settlement_status=unsettled").catch(() => ({ market_positions: [] })),
    ]);

    // Polymarket balance (best-effort)
    let polyBalance: number | null = null;
    if (polyEnabled === "true") {
      try {
        const clob = await getPolyClobClient();
        if (clob) {
          for (const sigType of [1, 0, 2] as const) {
            const balResp = await clob
              .getBalanceAllowance({ asset_type: "COLLATERAL" as any, signature_type: sigType })
              .catch(() => null);
            const item = Array.isArray(balResp) ? balResp[0] : balResp;
            const bal = parseFloat((item as any)?.balance ?? 0);
            if (Number.isFinite(bal) && bal > (polyBalance ?? 0)) polyBalance = bal;
          }
        }
      } catch {}
    }

    const recentBets = await pool.query(`
      SELECT id, market_ticker, market_title, side, contracts, price, cost,
             confidence, edge, council_verdict, status, platform, outcome,
             pnl, close_time, logged_at
      FROM predictor_bets
      ORDER BY logged_at DESC
      LIMIT 60
    `);

    const recentCouncils = await pool.query(`
      SELECT id, market_ticker, market_title, our_probability, market_probability,
             edge, verdict, confidence, platform, logged_at
      FROM predictor_councils
      ORDER BY logged_at DESC
      LIMIT 20
    `);

    const recentScans = await pool.query(`
      SELECT id, markets_scanned, candidates_found, bets_placed, rounds,
             result_summary, logged_at
      FROM predictor_scans
      ORDER BY logged_at DESC
      LIMIT 10
    `);

    const heldCount = Array.isArray((kalshiPositions as any)?.market_positions)
      ? (kalshiPositions as any).market_positions.filter((p: any) => p.position !== 0).length
      : 0;

    res.json({
      service: "predictor",
      mode: mode || (kalshiKeys?.isDemo ? "demo" : "live"),
      polyEnabled: polyEnabled === "true",
      generatedAt: new Date().toISOString(),
      constraints,
      kalshi: {
        balance:   kalshiBalance,
        positions: (kalshiPositions as any)?.market_positions ?? [],
        heldCount,
      },
      polymarket: {
        enabled:  polyEnabled === "true",
        balance:  polyBalance,
        funder:   getPolyCredentials().funder ? "configured" : "missing",
      },
      recentBets:     recentBets.rows,
      recentCouncils: recentCouncils.rows,
      recentScans:    recentScans.rows,
      marketHints: {
        kalshiOpenMarkets:  "/api/predictor/markets?status=open&limit=200",
        kalshiSeriesMarket: "/api/predictor/markets?status=open&limit=500 (filter client-side by category if needed)",
        note: "Use these public endpoints to fetch the full open-market list. " +
              "For each candidate, run your own council via WebSearch + WebFetch. " +
              "POST decisions back to /api/predictor/agent/decisions when you have at most " +
              `${DEFAULTS.maxDecisions} qualifying bets.`,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/predictor/agent/decisions ───────────────────────────────────
// Routine submits decisions. Server validates against constraints, executes
// survivors against Kalshi / Polymarket, records the run.
predictorAgentRouter.post("/decisions", requireAgentKey, async (req, res) => {
  try {
    const body     = req.body || {};
    const thesis   = (body.thesis || "").toString().slice(0, 4000);
    const decisions: any[] = Array.isArray(body.decisions) ? body.decisions : [];

    if (!thesis || decisions.length === 0) {
      return res.status(400).json({ error: "thesis and non-empty decisions array required" });
    }

    const constraints = await loadConstraints();

    if (decisions.length > constraints.maxDecisions) {
      return res.status(400).json({
        error: `Too many decisions (${decisions.length}); max per run is ${constraints.maxDecisions}.`,
      });
    }

    // Held position count for global cap.
    const heldRow = await kalshiReq("/portfolio/positions?settlement_status=unsettled").catch(() => ({ market_positions: [] }));
    const heldCount = Array.isArray((heldRow as any)?.market_positions)
      ? (heldRow as any).market_positions.filter((p: any) => p.position !== 0).length
      : 0;

    const incomingBets = decisions.filter(d => d.action === "bet_yes" || d.action === "bet_no").length;
    const accountBlockers: string[] = [];
    if (heldCount + incomingBets > constraints.maxPositions) {
      accountBlockers.push(
        `Decision would push positions to ${heldCount + incomingBets} ` +
        `(held ${heldCount} + new ${incomingBets}); maxPositions=${constraints.maxPositions}.`
      );
    }

    const results: any[] = [];
    let executedCount = 0;
    let rejectedCount = 0;

    for (const d of decisions) {
      const action       = (d.action || "").toString().toLowerCase();
      const platform     = (d.platform || "kalshi").toString().toLowerCase();
      const marketTicker = (d.market_ticker || "").toString();
      const rationale    = (d.rationale || "").toString().slice(0, 500);
      const confidence   = Number(d.confidence ?? 0);
      const edge         = Number(d.edge ?? 0);
      const ourProb      = Number(d.our_probability ?? 0);
      const marketProb   = Number(d.market_probability ?? 0);

      const reasons: string[] = [];

      if (!["bet_yes", "bet_no", "skip"].includes(action)) {
        reasons.push(`Invalid action "${action}".`);
      }
      if (action === "skip") {
        results.push({ marketTicker, action, status: "noop", rationale });
        continue;
      }
      if (!marketTicker) reasons.push("market_ticker required.");
      if (!["kalshi", "polymarket"].includes(platform)) {
        reasons.push(`Invalid platform "${platform}".`);
      }
      if (Math.abs(edge) < constraints.minEdge) {
        reasons.push(
          `Edge ${(edge * 100).toFixed(1)}pp below minEdge ${(constraints.minEdge * 100).toFixed(1)}pp.`
        );
      }
      if (accountBlockers.length > 0) for (const b of accountBlockers) reasons.push(b);

      if (reasons.length > 0) {
        rejectedCount++;
        results.push({ marketTicker, action, status: "rejected", reasons, rationale });
        continue;
      }

      const side = action === "bet_yes" ? "yes" : "no";

      try {
        if (platform === "kalshi") {
          const exec = await executeKalshiDecision({
            marketTicker, side, suggestedContracts: Number(d.contracts) || 1,
            yesPrice: Number(d.yes_price ?? d.price ?? 0),
            limitMaxUsd: constraints.maxBetUsd,
            noPriceCeiling: constraints.noPriceCeiling,
            confidence, edge, ourProb, marketProb, rationale,
          });
          if (exec.skipped) {
            rejectedCount++;
            results.push({ marketTicker, action, status: "rejected", reasons: [exec.reason!], rationale });
          } else if (exec.error) {
            rejectedCount++;
            results.push({ marketTicker, action, status: "order_failed", reasons: [exec.error], rationale });
          } else {
            executedCount++;
            results.push({
              marketTicker, action, status: "executed",
              orderId: exec.orderId, contracts: exec.contracts, price: exec.price, cost: exec.cost, rationale,
            });
          }
        } else {
          const exec = await executePolyDecision({
            marketTicker,
            yesTokenId: (d.yes_token_id || "").toString(),
            noTokenId:  (d.no_token_id  || "").toString(),
            side, yesPrice: Number(d.yes_price ?? d.price ?? 0),
            suggestedContracts: Number(d.contracts) || 3,
            limitMaxUsd: constraints.polyMaxBetUsd,
            noPriceCeiling: constraints.noPriceCeiling,
            confidence, edge, ourProb, marketProb, rationale,
          });
          if (exec.skipped) {
            rejectedCount++;
            results.push({ marketTicker, action, status: "rejected", reasons: [exec.reason!], rationale });
          } else if (exec.error) {
            rejectedCount++;
            results.push({ marketTicker, action, status: "order_failed", reasons: [exec.error], rationale });
          } else {
            executedCount++;
            results.push({
              marketTicker, action, status: "executed",
              orderId: exec.orderId, contracts: exec.contracts, price: exec.price, cost: exec.cost, rationale,
            });
          }
        }
      } catch (e: any) {
        rejectedCount++;
        results.push({ marketTicker, action, status: "error", reasons: [e.message], rationale });
      }
    }

    // Snapshot the run.
    await pool.query(
      `INSERT INTO predictor_scans (markets_scanned, candidates_found, bets_placed, rounds, result_summary, scan_json)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        decisions.length,
        decisions.filter(d => d.action !== "skip").length,
        executedCount,
        1,
        `[agent-routine] ${executedCount} executed / ${rejectedCount} rejected. ${thesis.slice(0, 120)}`,
        JSON.stringify({ source: "agent-routine", thesis, decisions, results }),
      ]
    ).catch(() => {});

    await pool.query(
      `INSERT INTO predictor_logs (message, type) VALUES ($1, $2)`,
      [
        `[agent-routine] ${executedCount} executed / ${rejectedCount} rejected. ${thesis.slice(0, 120)}`,
        rejectedCount === decisions.length ? "warn" : "info",
      ]
    ).catch(() => {});

    const runStatus =
      rejectedCount === 0 && executedCount > 0 ? "executed"
      : executedCount > 0                       ? "partial"
      : "rejected";

    res.status(201).json({
      status: runStatus,
      executed: executedCount,
      rejected: rejectedCount,
      results,
      accountBlockers,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/predictor/agent/run ─────────────────────────────────────────
// Fires the Anthropic-hosted predictor routine on demand.
//
// One-time setup:
//   1. Open https://claude.ai/code/routines (no routine yet — create one)
//   2. Add an API trigger → Generate token (shown once)
//   3. Set Railway env CLAUDE_ROUTINE_PREDICTOR_TOKEN + CLAUDE_ROUTINE_PREDICTOR_ID
const ROUTINE_FIRE_BETA = "experimental-cc-routine-2026-04-01";

predictorAgentRouter.post("/run", async (req, res) => {
  const token     = process.env.CLAUDE_ROUTINE_PREDICTOR_TOKEN;
  const routineId = process.env.CLAUDE_ROUTINE_PREDICTOR_ID;

  if (!token || !routineId) {
    return res.status(503).json({
      error: "Predictor routine not configured",
      hint:  "Set both CLAUDE_ROUTINE_PREDICTOR_TOKEN and CLAUDE_ROUTINE_PREDICTOR_ID " +
             "in Railway. Create the routine at https://claude.ai/code/routines, then " +
             "Add another trigger → API → Generate token.",
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
        method: "POST",
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
        `INSERT INTO predictor_logs (message, type) VALUES ($1, $2)`,
        [`[agent-run] dispatch failed (${upstream.status}): ${bodyText.slice(0, 200)}`, "warn"]
      ).catch(() => {});
      return res.status(upstream.status).json({
        error:    "Anthropic routine-fire rejected the request",
        status:   upstream.status,
        upstream: bodyJson ?? bodyText,
      });
    }

    await pool.query(
      `INSERT INTO predictor_logs (message, type) VALUES ($1, $2)`,
      [`[agent-run] routine ${routineId} dispatched manually`, "info"]
    ).catch(() => {});

    res.status(202).json({
      status:       "dispatched",
      routineId,
      dispatchedAt: new Date().toISOString(),
      note:         "Routine queued — bets land in predictor_bets when it completes.",
      upstream:     bodyJson ?? bodyText,
    });
  } catch (e: any) {
    res.status(502).json({ error: `Failed to reach Anthropic API: ${e.message}` });
  }
});

// ── GET /api/predictor/agent/ping ─────────────────────────────────────────
predictorAgentRouter.get("/ping", requireAgentKey, (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ──────────────────────────────────────────────────────────────────────────
// Internal order helpers — thin wrappers around the Kalshi / Polymarket
// primitives in predictor.ts. The routine is the council, so these skip the
// council-debate scaffolding executeBet / executePolyBet rely on.

interface KalshiDecision {
  marketTicker: string;
  side: "yes" | "no";
  suggestedContracts: number;
  yesPrice: number;            // 0–1, the YES side's price (NO price = 1 - yesPrice)
  limitMaxUsd: number;
  noPriceCeiling: number;
  confidence: number;
  edge: number;
  ourProb: number;
  marketProb: number;
  rationale: string;
}

async function executeKalshiDecision(d: KalshiDecision): Promise<{
  skipped?: true; reason?: string;
  error?: string;
  orderId?: string; contracts?: number; price?: number; cost?: number;
}> {
  const yesPrice = Math.max(0, Math.min(1, d.yesPrice));
  const price    = d.side === "yes" ? yesPrice : 1 - yesPrice;

  if (d.side === "no" && price > d.noPriceCeiling) {
    return { skipped: true, reason: `NO price ${(price * 100).toFixed(0)}¢ above ceiling ${(d.noPriceCeiling * 100).toFixed(0)}¢.` };
  }

  const priceCents = Math.round(price * 100);
  if (priceCents < 1 || priceCents > 99) {
    return { skipped: true, reason: `Invalid contract price $${price.toFixed(3)} (must be $0.01–$0.99).` };
  }

  const maxContracts = Math.floor(d.limitMaxUsd / price);
  const contracts    = Math.min(d.suggestedContracts, maxContracts, 50);
  if (contracts < 1) {
    return { skipped: true, reason: `Cost per contract too high for max bet of $${d.limitMaxUsd}.` };
  }
  const cost = contracts * price;

  const yesPriceCents = Math.max(1, Math.min(99, Math.round(yesPrice * 100)));
  const orderBody = {
    ticker:    d.marketTicker,
    action:    "buy",
    side:      d.side,
    type:      "limit",
    count:     contracts,
    yes_price: yesPriceCents,
  };

  const result  = await kalshiReq("/portfolio/orders", "POST", orderBody);
  const orderId = result?.order?.order_id ?? null;
  const errMsg  = result?.error?.message || (result?.error === true ? result?.message : null);

  const betId  = `${d.marketTicker}-${Date.now()}`;
  const status = errMsg ? "failed" : "resting";

  await pool.query(
    `INSERT INTO predictor_bets
     (id, market_ticker, side, contracts, price, cost, confidence, edge,
      council_verdict, status, order_id, platform)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      betId, d.marketTicker, d.side, contracts, price, cost,
      d.confidence, d.edge,
      d.side === "yes" ? "BET_YES" : "BET_NO",
      status, orderId, "kalshi",
    ]
  ).catch(() => {});

  await pool.query(
    `INSERT INTO predictor_councils
     (market_ticker, our_probability, market_probability, edge, verdict, confidence, platform, transcript)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      d.marketTicker, d.ourProb, d.marketProb, d.edge,
      d.side === "yes" ? "BET_YES" : "BET_NO",
      d.confidence >= 0.85 ? "high" : d.confidence >= 0.65 ? "medium" : "low",
      "kalshi",
      JSON.stringify({ source: "agent-routine", rationale: d.rationale }),
    ]
  ).catch(() => {});

  if (errMsg) return { error: errMsg };
  return { orderId, contracts, price, cost };
}

interface PolyDecision extends KalshiDecision {
  yesTokenId: string;
  noTokenId:  string;
}

async function executePolyDecision(d: PolyDecision): Promise<{
  skipped?: true; reason?: string;
  error?: string;
  orderId?: string; contracts?: number; price?: number; cost?: number;
}> {
  const tokenId = d.side === "yes" ? d.yesTokenId : d.noTokenId;
  if (!tokenId) return { error: "Missing token ID — include yes_token_id and no_token_id in decision." };

  const yesPrice = Math.max(0, Math.min(1, d.yesPrice));
  const price    = d.side === "yes" ? yesPrice : 1 - yesPrice;

  if (d.side === "no" && price > d.noPriceCeiling) {
    return { skipped: true, reason: `NO price ${(price * 100).toFixed(0)}¢ above ceiling ${(d.noPriceCeiling * 100).toFixed(0)}¢.` };
  }

  const clobClient = await getPolyClobClient();
  if (!clobClient) return { error: "Polymarket credentials not configured." };

  const maxContracts = Math.max(1, Math.floor(d.suggestedContracts));
  const cost         = Math.min(d.limitMaxUsd, maxContracts * price);

  let orderResult: any = { error: true, message: "not sent" };
  try {
    orderResult = await clobClient.createAndPostOrder(
      {
        tokenID: tokenId,
        price:   parseFloat(price.toFixed(2)),
        side:    d.side === "yes" ? Side.BUY : Side.SELL,
        size:    parseFloat(cost.toFixed(2)),
      },
      undefined,
      OrderType.GTC,
    );
  } catch (e: any) {
    orderResult = { error: true, message: e.message ?? String(e) };
  }

  const orderId = orderResult?.orderID || orderResult?.id || null;
  const errMsg  = orderResult?.error?.message || (orderResult?.error === true ? orderResult?.message : null);
  const betId   = `poly-${d.marketTicker}-${Date.now()}`;
  const status  = errMsg ? "failed" : "resting";

  await pool.query(
    `INSERT INTO predictor_bets
     (id, market_ticker, side, contracts, price, cost, confidence, edge,
      council_verdict, status, order_id, platform)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      betId, d.marketTicker, d.side, maxContracts, price, cost,
      d.confidence, d.edge,
      d.side === "yes" ? "BET_YES" : "BET_NO",
      status, orderId, "polymarket",
    ]
  ).catch(() => {});

  if (errMsg) return { error: errMsg };
  return { orderId, contracts: maxContracts, price, cost };
}
