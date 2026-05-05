/**
 * Business expenses agent-routine endpoints
 * ──────────────────────────────────────────────────────────────────────────
 * Backs an Anthropic-hosted Claude routine that scans Gmail across the
 * configured inboxes for receipts/invoices/subscription renewals, classifies
 * each as business vs personal at the configured confidence floor, and posts
 * findings back. Server splits by confidence:
 *   - confidence >= AUTO_APPROVE_FLOOR  → business_expenses (live)
 *   - confidence  < AUTO_APPROVE_FLOOR  → expense_queue (review on /admin/expenses)
 *
 * Dedup: hard UNIQUE on gmail_message_id (per-message, NULL allowed for
 * manual entries) + soft (vendor, amount, dated_at within 7 days) check
 * that marks possible_duplicate=true so the queue surfaces them for review.
 *
 * Auth: x-jdcd-agent-key header matched against env JDCD_AGENT_KEY.
 * Mounted at /api/expenses/agent.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { pool } from "./db";
import { convertToUsd } from "./fx";
import * as XLSX from "xlsx";
import Anthropic from "@anthropic-ai/sdk";

export const expensesAgentRouter = Router();
export const expensesRouter = Router();

const AUTO_APPROVE_FLOOR = 0.85;
const MAX_DECISIONS_PER_RUN = 25;
const DEDUP_WINDOW_DAYS = 7;

// ── Schema bootstrap ──────────────────────────────────────────────────────
let schemaReady: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS business_expenses (
        id                 SERIAL PRIMARY KEY,
        vendor             TEXT NOT NULL,
        amount             NUMERIC(14,2) NOT NULL,
        currency           TEXT NOT NULL DEFAULT 'HKD',
        category           TEXT,
        frequency          TEXT NOT NULL DEFAULT 'one_off',
        dated_at           TIMESTAMPTZ NOT NULL,
        period_started_at  TIMESTAMPTZ,
        period_ended_at    TIMESTAMPTZ,
        notes              TEXT,
        source             TEXT NOT NULL DEFAULT 'manual',
        gmail_account      TEXT,
        gmail_message_id   TEXT UNIQUE,
        gmail_message_url  TEXT,
        ai_confidence      REAL,
        ai_rationale       TEXT,
        possible_duplicate_of INTEGER REFERENCES business_expenses(id),
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS expense_queue (
        id                 SERIAL PRIMARY KEY,
        vendor             TEXT NOT NULL,
        amount             NUMERIC(14,2) NOT NULL,
        currency           TEXT NOT NULL DEFAULT 'HKD',
        suggested_category TEXT,
        dated_at           TIMESTAMPTZ NOT NULL,
        notes              TEXT,
        gmail_account      TEXT,
        gmail_message_id   TEXT UNIQUE,
        gmail_message_url  TEXT,
        raw_excerpt        TEXT,
        ai_confidence      REAL,
        ai_rationale       TEXT,
        possible_duplicate_of_expense INTEGER,
        possible_duplicate_of_queue   INTEGER,
        status             TEXT NOT NULL DEFAULT 'pending',
        decided_at         TIMESTAMPTZ,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Vendor-level memory: once you mark "Railway → business", future Railway
    // emails skip the queue and auto-file to business_expenses.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vendor_decisions (
        vendor_norm  TEXT PRIMARY KEY,
        decision     TEXT NOT NULL,
        category     TEXT,
        decided_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reviewed_count INTEGER NOT NULL DEFAULT 1
      )
    `);
    // USD baseline columns — snapshot at insert time so historical totals
    // don't drift when FX moves. Original amount + currency stays authoritative.
    await pool.query(`ALTER TABLE business_expenses ADD COLUMN IF NOT EXISTS amount_usd NUMERIC(14,2)`);
    await pool.query(`ALTER TABLE business_expenses ADD COLUMN IF NOT EXISTS fx_rate_to_usd NUMERIC(18,8)`);
    await pool.query(`ALTER TABLE expense_queue     ADD COLUMN IF NOT EXISTS amount_usd NUMERIC(14,2)`);
    await pool.query(`ALTER TABLE expense_queue     ADD COLUMN IF NOT EXISTS fx_rate_to_usd NUMERIC(18,8)`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_business_expenses_dated_at ON business_expenses (dated_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_business_expenses_vendor ON business_expenses (LOWER(vendor))
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_expense_queue_status ON expense_queue (status, created_at DESC)
    `);
    // Per-fire audit: records every routine fire (even empty ones) so the
    // scan-window cursor advances and we have a heartbeat trail.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS expense_agent_runs (
        id           SERIAL PRIMARY KEY,
        scanned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        thesis       TEXT,
        approved     INTEGER NOT NULL DEFAULT 0,
        queued       INTEGER NOT NULL DEFAULT 0,
        duplicates   INTEGER NOT NULL DEFAULT 0,
        rejected     INTEGER NOT NULL DEFAULT 0,
        decisions_n  INTEGER NOT NULL DEFAULT 0
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_expense_agent_runs_scanned_at ON expense_agent_runs (scanned_at DESC)
    `);
  })();
  return schemaReady;
}
// Kick off schema build at import time so the first request doesn't pay for it.
ensureSchema().catch(e => console.error("[expenses] schema init error:", e.message));

// ── Auth ──────────────────────────────────────────────────────────────────
function requireAgentKey(req: Request, res: Response, next: NextFunction) {
  const provided = req.headers["x-jdcd-agent-key"];
  const expected = process.env.JDCD_AGENT_KEY;
  if (!expected) return res.status(503).json({ error: "JDCD_AGENT_KEY not configured" });
  if (typeof provided !== "string" || provided !== expected) {
    return res.status(401).json({ error: "Invalid or missing x-jdcd-agent-key" });
  }
  next();
}

function normaliseVendor(v: string): string {
  return (v || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── GET /api/expenses/agent/state ─────────────────────────────────────────
// Returns: configured inboxes, last-scan timestamps per inbox, vendor
// decisions (so routine knows what's auto-business / auto-personal), recent
// gmail_message_ids (so routine can skip already-ingested), and the
// auto-approve floor.
const CONFIGURED_INBOXES = [
  "joshuadeacon888@gmail.com",
  "josh@bloomandgrowgroup.com",
  "Joshuadeacon2005@gmail.com",
  "JoshuaD@JDcoredev.com",
];

expensesAgentRouter.get("/state", requireAgentKey, async (_req, res) => {
  try {
    await ensureSchema();
    const [vendorRows, recentExpenses, recentQueue, lastScan] = await Promise.all([
      pool.query(`SELECT vendor_norm, decision, category FROM vendor_decisions ORDER BY decided_at DESC LIMIT 200`),
      pool.query(`SELECT gmail_message_id, vendor, amount, dated_at FROM business_expenses WHERE gmail_message_id IS NOT NULL ORDER BY created_at DESC LIMIT 100`),
      pool.query(`SELECT gmail_message_id, vendor, amount, dated_at, status FROM expense_queue WHERE gmail_message_id IS NOT NULL ORDER BY created_at DESC LIMIT 100`),
      pool.query(`SELECT MAX(scanned_at) AS last_scan FROM expense_agent_runs`),
    ]);
    const messageIds = new Set<string>();
    for (const r of recentExpenses.rows) if (r.gmail_message_id) messageIds.add(r.gmail_message_id);
    for (const r of recentQueue.rows)    if (r.gmail_message_id) messageIds.add(r.gmail_message_id);
    res.json({
      service: "expenses",
      generatedAt: new Date().toISOString(),
      autoApproveFloor: AUTO_APPROVE_FLOOR,
      maxDecisionsPerRun: MAX_DECISIONS_PER_RUN,
      dedupWindowDays: DEDUP_WINDOW_DAYS,
      configuredInboxes: CONFIGURED_INBOXES,
      lastRoutineScan: lastScan.rows[0]?.last_scan || null,
      vendorDecisions: vendorRows.rows.reduce((acc: Record<string, any>, r: any) => {
        acc[r.vendor_norm] = { decision: r.decision, category: r.category };
        return acc;
      }, {}),
      recentMessageIds: Array.from(messageIds),
      recentExpenses: recentExpenses.rows.slice(0, 20),
      recentQueue: recentQueue.rows.slice(0, 20),
      hint:
        "For each Gmail message in the configured inboxes that looks like a " +
        "receipt / invoice / subscription renewal AND whose id is not in " +
        "recentMessageIds AND whose normalised vendor is not pre-decided as " +
        "'personal' in vendorDecisions, extract {vendor, amount, currency, " +
        "dated_at, gmail_message_id, gmail_account, gmail_message_url, " +
        "ai_confidence, ai_rationale, suggested_category} and POST them as " +
        "decisions. Server will route by confidence floor and dedup by " +
        "gmail_message_id (hard UNIQUE) + (vendor, amount, dated_at within 7 days) " +
        "soft check.",
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/expenses/agent/decisions ────────────────────────────────────
expensesAgentRouter.post("/decisions", requireAgentKey, async (req, res) => {
  try {
    await ensureSchema();
    const body = req.body || {};
    const decisions: any[] = Array.isArray(body.decisions) ? body.decisions : [];
    const thesis = (body.thesis || "").toString().slice(0, 4000);

    if (decisions.length > MAX_DECISIONS_PER_RUN) {
      return res.status(400).json({
        error: `Too many decisions (${decisions.length}); max per run is ${MAX_DECISIONS_PER_RUN}.`,
      });
    }

    const results: any[] = [];
    let approvedCount = 0, queuedCount = 0, rejectedCount = 0, dupCount = 0;

    for (const d of decisions) {
      try {
        const vendor       = (d.vendor || "").toString().trim();
        const amount       = Number(d.amount);
        const currency     = (d.currency || "HKD").toString().toUpperCase().slice(0, 3);
        const datedAt      = d.dated_at ? new Date(d.dated_at) : null;
        const messageId    = (d.gmail_message_id || "").toString().trim() || null;
        const messageUrl   = (d.gmail_message_url || "").toString().trim() || null;
        const account      = (d.gmail_account || "").toString().trim() || null;
        const aiConfidence = Number(d.ai_confidence ?? 0);
        const aiRationale  = (d.ai_rationale || "").toString().slice(0, 1000);
        const suggCategory = (d.suggested_category || "").toString().slice(0, 60) || null;
        const rawExcerpt   = (d.raw_excerpt || "").toString().slice(0, 2000);

        if (!vendor) { rejectedCount++; results.push({ status: "rejected", reasons: ["vendor required"], messageId }); continue; }
        if (!Number.isFinite(amount) || amount <= 0) { rejectedCount++; results.push({ status: "rejected", reasons: ["positive amount required"], messageId }); continue; }
        if (!datedAt || isNaN(datedAt.getTime())) { rejectedCount++; results.push({ status: "rejected", reasons: ["valid dated_at required"], messageId }); continue; }

        // Hard dedup: gmail_message_id seen before (in either table)?
        if (messageId) {
          const dupExp = await pool.query(`SELECT id FROM business_expenses WHERE gmail_message_id = $1`, [messageId]);
          if (dupExp.rows.length > 0) { dupCount++; results.push({ status: "duplicate", reasons: ["gmail_message_id already filed"], messageId, existingId: dupExp.rows[0].id }); continue; }
          const dupQueue = await pool.query(`SELECT id FROM expense_queue WHERE gmail_message_id = $1`, [messageId]);
          if (dupQueue.rows.length > 0) { dupCount++; results.push({ status: "duplicate", reasons: ["gmail_message_id already in queue"], messageId, existingQueueId: dupQueue.rows[0].id }); continue; }
        }

        // Vendor-level pre-decision: skip if marked personal.
        const vendorNorm = normaliseVendor(vendor);
        const vendorRow = await pool.query(`SELECT decision, category FROM vendor_decisions WHERE vendor_norm = $1`, [vendorNorm]);
        const vendorDecision = vendorRow.rows[0]?.decision;
        if (vendorDecision === "personal") {
          rejectedCount++;
          results.push({ status: "rejected", reasons: [`vendor previously marked personal`], messageId, vendor });
          continue;
        }

        // Soft dedup: same vendor + amount within DEDUP_WINDOW_DAYS in either table.
        const softDupExp = await pool.query(
          `SELECT id FROM business_expenses
           WHERE LOWER(vendor) = LOWER($1) AND amount = $2 AND dated_at BETWEEN $3 AND $4
           LIMIT 1`,
          [vendor, amount, new Date(datedAt.getTime() - DEDUP_WINDOW_DAYS * 86400000), new Date(datedAt.getTime() + DEDUP_WINDOW_DAYS * 86400000)]
        );
        const softDupExpId = softDupExp.rows[0]?.id ?? null;
        const softDupQueue = await pool.query(
          `SELECT id FROM expense_queue
           WHERE LOWER(vendor) = LOWER($1) AND amount = $2 AND dated_at BETWEEN $3 AND $4 AND status = 'pending'
           LIMIT 1`,
          [vendor, amount, new Date(datedAt.getTime() - DEDUP_WINDOW_DAYS * 86400000), new Date(datedAt.getTime() + DEDUP_WINDOW_DAYS * 86400000)]
        );
        const softDupQueueId = softDupQueue.rows[0]?.id ?? null;

        // Decide route. Vendor pre-decision = business AND vendor_norm match
        // → auto-approve regardless of confidence (Josh has explicitly trusted).
        // Otherwise use confidence floor.
        const route =
          vendorDecision === "business"          ? "approve" :
          aiConfidence >= AUTO_APPROVE_FLOOR     ? "approve" :
          /* else */                                "queue";

        const { amountUsd, fxRateToUsd } = await convertToUsd(amount, currency, datedAt);

        if (route === "approve") {
          const ins = await pool.query(
            `INSERT INTO business_expenses
             (vendor, amount, currency, amount_usd, fx_rate_to_usd,
              category, frequency, dated_at, notes,
              source, gmail_account, gmail_message_id, gmail_message_url,
              ai_confidence, ai_rationale, possible_duplicate_of)
             VALUES ($1,$2,$3,$4,$5,$6,'one_off',$7,$8,'gmail-routine',$9,$10,$11,$12,$13,$14)
             RETURNING id`,
            [
              vendor, amount, currency, amountUsd, fxRateToUsd,
              vendorRow.rows[0]?.category || suggCategory || null,
              datedAt, aiRationale,
              account, messageId, messageUrl, aiConfidence, aiRationale, softDupExpId,
            ]
          );
          // Bump vendor reviewed_count for memory.
          if (vendorDecision === "business") {
            await pool.query(`UPDATE vendor_decisions SET reviewed_count = reviewed_count + 1 WHERE vendor_norm = $1`, [vendorNorm]).catch(() => {});
          }
          approvedCount++;
          results.push({
            status: "approved",
            id: ins.rows[0].id,
            vendor, amount, currency,
            possibleDuplicateOf: softDupExpId,
          });
        } else {
          const ins = await pool.query(
            `INSERT INTO expense_queue
             (vendor, amount, currency, amount_usd, fx_rate_to_usd,
              suggested_category, dated_at, notes,
              gmail_account, gmail_message_id, gmail_message_url, raw_excerpt,
              ai_confidence, ai_rationale,
              possible_duplicate_of_expense, possible_duplicate_of_queue)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
             RETURNING id`,
            [
              vendor, amount, currency, amountUsd, fxRateToUsd,
              suggCategory, datedAt, aiRationale,
              account, messageId, messageUrl, rawExcerpt,
              aiConfidence, aiRationale,
              softDupExpId, softDupQueueId,
            ]
          );
          queuedCount++;
          results.push({
            status: "queued",
            id: ins.rows[0].id,
            vendor, amount, currency,
            confidence: aiConfidence,
            possibleDuplicateOfExpense: softDupExpId,
            possibleDuplicateOfQueue:   softDupQueueId,
          });
        }
      } catch (e: any) {
        // Most likely: UNIQUE constraint race on gmail_message_id.
        if ((e.message || "").includes("duplicate key")) {
          dupCount++;
          results.push({ status: "duplicate", reasons: ["unique constraint hit (race)"] });
        } else {
          rejectedCount++;
          results.push({ status: "error", reasons: [e.message] });
        }
      }
    }

    console.log(`[expenses-agent] thesis: "${thesis.slice(0, 80)}" — approved=${approvedCount} queued=${queuedCount} duplicates=${dupCount} rejected=${rejectedCount}`);

    // Always record the fire — even empty ones — so lastRoutineScan advances
    // and we have a heartbeat trail even for clean (zero-candidate) runs.
    await pool.query(
      `INSERT INTO expense_agent_runs (thesis, approved, queued, duplicates, rejected, decisions_n)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [thesis || null, approvedCount, queuedCount, dupCount, rejectedCount, decisions.length]
    ).catch((e) => console.error("[expenses-agent] failed to record agent_run:", e.message));

    res.status(201).json({
      status: "ok",
      approved:   approvedCount,
      queued:     queuedCount,
      duplicates: dupCount,
      rejected:   rejectedCount,
      results,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── /api/expenses/agent/run handler ───────────────────────────────────────
// Mounted at app-level (NOT on expensesAgentRouter) in routes.ts so it can
// be gated by requireAdmin — the router-level mount runs before passport.
const ROUTINE_FIRE_BETA = "experimental-cc-routine-2026-04-01";
export async function fireExpenseScannerRoutine(req: Request, res: Response) {
  const token     = process.env.CLAUDE_ROUTINE_EXPENSE_SCANNER_TOKEN;
  const routineId = process.env.CLAUDE_ROUTINE_EXPENSE_SCANNER_ID;
  if (!token || !routineId) {
    return res.status(503).json({
      error: "Expense Scanner routine not configured",
      hint:  "Set both CLAUDE_ROUTINE_EXPENSE_SCANNER_TOKEN and CLAUDE_ROUTINE_EXPENSE_SCANNER_ID in Railway.",
    });
  }
  const note = (req.body?.note || "").toString().slice(0, 200);
  const text = note
    ? `Manual fire from JDCoreDev admin UI — ${note}`
    : `Manual fire from JDCoreDev admin UI at ${new Date().toISOString()}`;
  try {
    const upstream = await fetch(`https://api.anthropic.com/v1/claude_code/routines/${routineId}/fire`, {
      method: "POST",
      headers: {
        "Authorization":     `Bearer ${token}`,
        "anthropic-beta":    ROUTINE_FIRE_BETA,
        "anthropic-version": "2023-06-01",
        "Content-Type":      "application/json",
      },
      body: JSON.stringify({ text }),
    });
    const bodyText = await upstream.text();
    let bodyJson: any = null;
    try { bodyJson = JSON.parse(bodyText); } catch {}
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: "Anthropic routine-fire rejected the request",
        status: upstream.status,
        upstream: bodyJson ?? bodyText,
      });
    }
    res.status(202).json({
      status: "dispatched",
      routineId,
      dispatchedAt: new Date().toISOString(),
      note: "Routine queued — new expenses + queue items appear when it completes.",
      upstream: bodyJson ?? bodyText,
    });
  } catch (e: any) {
    res.status(502).json({ error: `Failed to reach Anthropic API: ${e.message}` });
  }
}

expensesAgentRouter.get("/ping", requireAgentKey, (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ── Backfill USD snapshot on existing rows ────────────────────────────────
// Mounted in routes.ts at /api/expenses/backfill-fx behind requireAdmin.
// Walks business_expenses + expense_queue rows where amount_usd IS NULL,
// fetches the rate at each row's dated_at via the FX cache, and writes the
// snapshot. Idempotent — re-running only touches still-NULL rows.
export async function backfillFx(req: Request, res: Response) {
  try {
    await ensureSchema();
    const limit = Math.min(Math.max(parseInt(String(req.body?.limit ?? "500"), 10) || 500, 1), 5000);
    const dryRun = Boolean(req.body?.dryRun);

    const targets = await pool.query(
      `SELECT id, amount, currency, dated_at, 'expense' AS table_name
         FROM business_expenses
        WHERE amount_usd IS NULL
        UNION ALL
       SELECT id, amount, currency, dated_at, 'queue' AS table_name
         FROM expense_queue
        WHERE amount_usd IS NULL AND status = 'pending'
        ORDER BY dated_at ASC
        LIMIT $1`,
      [limit]
    );

    let patched = 0, failed = 0;
    const failures: any[] = [];
    for (const row of targets.rows) {
      const { amountUsd, fxRateToUsd } = await convertToUsd(
        Number(row.amount), row.currency, new Date(row.dated_at)
      );
      if (amountUsd === null) {
        failed++;
        failures.push({ table: row.table_name, id: row.id, currency: row.currency, datedAt: row.dated_at });
        continue;
      }
      if (!dryRun) {
        const table = row.table_name === "expense" ? "business_expenses" : "expense_queue";
        await pool.query(
          `UPDATE ${table} SET amount_usd = $1, fx_rate_to_usd = $2 WHERE id = $3`,
          [amountUsd, fxRateToUsd, row.id]
        );
      }
      patched++;
    }
    res.json({
      candidates: targets.rows.length,
      patched: dryRun ? 0 : patched,
      wouldPatch: dryRun ? patched : undefined,
      failed,
      failures: failures.slice(0, 20),
      remaining: Math.max(0, targets.rows.length - patched - failed),
      hint: targets.rows.length === limit
        ? `Hit batch limit (${limit}). Re-run to continue.`
        : "All eligible rows processed.",
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────
// PUBLIC EXPENSE CRUD (mounted at /api/expenses, no agent-key required —
// these are called by the admin UI).

expensesRouter.get("/", async (_req, res) => {
  try {
    await ensureSchema();
    const r = await pool.query(`
      SELECT id, vendor, amount, currency, amount_usd, fx_rate_to_usd,
             category, frequency, dated_at,
             period_started_at, period_ended_at, notes, source, gmail_account,
             gmail_message_id, gmail_message_url, ai_confidence,
             possible_duplicate_of, created_at
      FROM business_expenses
      ORDER BY dated_at DESC
      LIMIT 500
    `);
    res.json({ expenses: r.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

expensesRouter.post("/", async (req, res) => {
  try {
    await ensureSchema();
    const b = req.body || {};
    const vendor = (b.vendor || "").toString().trim();
    const amount = Number(b.amount);
    if (!vendor || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "vendor and positive amount required" });
    }
    const currency = (b.currency || "HKD").toString().toUpperCase().slice(0, 3);
    const datedAt = b.dated_at ? new Date(b.dated_at) : new Date();
    const { amountUsd, fxRateToUsd } = await convertToUsd(amount, currency, datedAt);
    const r = await pool.query(
      `INSERT INTO business_expenses
       (vendor, amount, currency, amount_usd, fx_rate_to_usd,
        category, frequency, dated_at,
        period_started_at, period_ended_at, notes, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'manual')
       RETURNING *`,
      [
        vendor,
        amount,
        currency,
        amountUsd,
        fxRateToUsd,
        (b.category || null),
        (b.frequency || "one_off"),
        datedAt,
        b.period_started_at ? new Date(b.period_started_at) : null,
        b.period_ended_at   ? new Date(b.period_ended_at)   : null,
        b.notes || null,
      ]
    );
    res.status(201).json({ expense: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

expensesRouter.patch("/:id", async (req, res) => {
  try {
    await ensureSchema();
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
    const b = req.body || {};
    const fields: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const k of ["vendor", "amount", "currency", "category", "frequency", "dated_at", "period_started_at", "period_ended_at", "notes"] as const) {
      if (b[k] !== undefined) {
        fields.push(`${k} = $${i++}`);
        vals.push(k.endsWith("_at") && b[k] ? new Date(b[k]) : b[k]);
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: "no updatable fields" });
    // If anything affecting USD changed, recompute the snapshot from the
    // post-update row values (fall back to existing values for unchanged fields).
    if (b.amount !== undefined || b.currency !== undefined || b.dated_at !== undefined) {
      const [existing] = (await pool.query(
        `SELECT amount, currency, dated_at FROM business_expenses WHERE id = $1`,
        [id]
      )).rows;
      if (existing) {
        const newAmount   = b.amount   !== undefined ? Number(b.amount)                 : Number(existing.amount);
        const newCurrency = b.currency !== undefined ? String(b.currency).toUpperCase().slice(0,3) : existing.currency;
        const newDatedAt  = b.dated_at !== undefined ? new Date(b.dated_at)             : new Date(existing.dated_at);
        const { amountUsd, fxRateToUsd } = await convertToUsd(newAmount, newCurrency, newDatedAt);
        // Don't overwrite an existing snapshot with NULL on FX-lookup failure
        // — leaves the row temporarily stale but recoverable via backfill,
        // rather than degrading data we already had.
        if (amountUsd !== null) {
          fields.push(`amount_usd = $${i++}`);     vals.push(amountUsd);
          fields.push(`fx_rate_to_usd = $${i++}`); vals.push(fxRateToUsd);
        }
      }
    }
    fields.push(`updated_at = NOW()`);
    vals.push(id);
    const r = await pool.query(
      `UPDATE business_expenses SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
      vals
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "not found" });
    res.json({ expense: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

expensesRouter.delete("/:id", async (req, res) => {
  try {
    await ensureSchema();
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
    await pool.query(`DELETE FROM business_expenses WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Queue endpoints
expensesRouter.get("/queue", async (req, res) => {
  try {
    await ensureSchema();
    const status = (req.query.status as string) || "pending";
    const r = await pool.query(
      `SELECT * FROM expense_queue WHERE status = $1 ORDER BY created_at DESC LIMIT 200`,
      [status]
    );
    res.json({ queue: r.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

expensesRouter.get("/queue/count", async (_req, res) => {
  try {
    await ensureSchema();
    const r = await pool.query(`SELECT COUNT(*)::int AS n FROM expense_queue WHERE status = 'pending'`);
    res.json({ pending: r.rows[0]?.n ?? 0 });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

expensesRouter.post("/queue/:id/approve", async (req, res) => {
  try {
    await ensureSchema();
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
    const queueRow = await pool.query(`SELECT * FROM expense_queue WHERE id = $1`, [id]);
    if (queueRow.rows.length === 0) return res.status(404).json({ error: "queue item not found" });
    const q = queueRow.rows[0];

    // Hard dedup check at promotion time.
    if (q.gmail_message_id) {
      const dup = await pool.query(`SELECT id FROM business_expenses WHERE gmail_message_id = $1`, [q.gmail_message_id]);
      if (dup.rows.length > 0) {
        await pool.query(`UPDATE expense_queue SET status = 'duplicate', decided_at = NOW() WHERE id = $1`, [id]);
        return res.status(409).json({ error: "already promoted to business_expenses", existingId: dup.rows[0].id });
      }
    }

    const overrides = req.body || {};
    const finalVendor   = overrides.vendor || q.vendor;
    const finalAmount   = Number(overrides.amount ?? q.amount);
    const finalCurrency = (overrides.currency || q.currency || "HKD").toString().toUpperCase().slice(0, 3);
    const finalDatedAt  = overrides.dated_at ? new Date(overrides.dated_at) : new Date(q.dated_at);
    // Recompute USD snapshot — overrides may change amount/currency/date,
    // and the queue row's snapshot may be stale or NULL.
    const { amountUsd, fxRateToUsd } = await convertToUsd(finalAmount, finalCurrency, finalDatedAt);
    const ins = await pool.query(
      `INSERT INTO business_expenses
       (vendor, amount, currency, amount_usd, fx_rate_to_usd,
        category, frequency, dated_at, notes,
        source, gmail_account, gmail_message_id, gmail_message_url,
        ai_confidence, ai_rationale, possible_duplicate_of)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual-approved',$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        finalVendor,
        finalAmount,
        finalCurrency,
        amountUsd,
        fxRateToUsd,
        overrides.category || q.suggested_category,
        overrides.frequency || "one_off",
        finalDatedAt,
        overrides.notes ?? q.notes,
        q.gmail_account, q.gmail_message_id, q.gmail_message_url,
        q.ai_confidence, q.ai_rationale, q.possible_duplicate_of_expense,
      ]
    );

    await pool.query(`UPDATE expense_queue SET status = 'approved', decided_at = NOW() WHERE id = $1`, [id]);

    // Remember vendor decision for next time.
    const vendorNorm = normaliseVendor(q.vendor);
    await pool.query(
      `INSERT INTO vendor_decisions (vendor_norm, decision, category)
       VALUES ($1, 'business', $2)
       ON CONFLICT (vendor_norm) DO UPDATE SET decision = 'business', category = COALESCE(EXCLUDED.category, vendor_decisions.category), reviewed_count = vendor_decisions.reviewed_count + 1`,
      [vendorNorm, overrides.category || q.suggested_category || null]
    );

    res.status(201).json({ expense: ins.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

expensesRouter.post("/queue/:id/reject", async (req, res) => {
  try {
    await ensureSchema();
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
    const queueRow = await pool.query(`SELECT vendor FROM expense_queue WHERE id = $1`, [id]);
    if (queueRow.rows.length === 0) return res.status(404).json({ error: "queue item not found" });
    await pool.query(`UPDATE expense_queue SET status = 'rejected', decided_at = NOW() WHERE id = $1`, [id]);
    // Remember vendor decision so future emails from this vendor auto-skip.
    const vendorNorm = normaliseVendor(queueRow.rows[0].vendor);
    await pool.query(
      `INSERT INTO vendor_decisions (vendor_norm, decision)
       VALUES ($1, 'personal')
       ON CONFLICT (vendor_norm) DO UPDATE SET decision = 'personal', reviewed_count = vendor_decisions.reviewed_count + 1`,
      [vendorNorm]
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Vendor decisions (so the user can override or audit the routine's memory).
expensesRouter.get("/vendors", async (_req, res) => {
  try {
    await ensureSchema();
    const r = await pool.query(`SELECT * FROM vendor_decisions ORDER BY decided_at DESC`);
    res.json({ vendors: r.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk import (used when Josh sends a backfill document).
expensesRouter.post("/import", async (req, res) => {
  try {
    await ensureSchema();
    const items: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) return res.status(400).json({ error: "items array required" });
    let imported = 0, dups = 0, errors = 0;
    for (const it of items) {
      try {
        const amount   = Number(it.amount);
        const currency = (it.currency || "HKD").toString().toUpperCase().slice(0, 3);
        const datedAt  = it.dated_at ? new Date(it.dated_at) : new Date();
        const { amountUsd, fxRateToUsd } = await convertToUsd(amount, currency, datedAt);
        await pool.query(
          `INSERT INTO business_expenses
           (vendor, amount, currency, amount_usd, fx_rate_to_usd,
            category, frequency, dated_at, notes, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual-import')`,
          [
            (it.vendor || "").toString().trim(),
            amount,
            currency,
            amountUsd,
            fxRateToUsd,
            it.category || null,
            it.frequency || "one_off",
            datedAt,
            it.notes || null,
          ]
        );
        imported++;
      } catch (e: any) {
        if ((e.message || "").includes("duplicate key")) dups++;
        else errors++;
      }
    }
    res.status(201).json({ imported, duplicates: dups, errors, total: items.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Bulk XLSX upload + auto-classification ────────────────────────────────
// Accepts a base64-encoded .xlsx body, parses every row, asks Claude to
// classify each as "business" / "personal" / "undefined" + suggest a
// category, and returns a preview the user reviews before committing.
//
// Expected XLSX columns (case-insensitive, common variants accepted):
//   vendor / merchant / payee / description
//   amount / total / cost / price
//   currency / ccy        (default HKD)
//   date / dated_at / transaction_date
//   notes / memo / category (optional)
//
// Doesn't write anything — caller posts confirmed items back to /import.
expensesRouter.post("/parse-xlsx", async (req, res) => {
  try {
    const b64 = (req.body?.fileBase64 || "").toString();
    if (!b64) return res.status(400).json({ error: "fileBase64 (base64 .xlsx contents) required" });
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured — classification needs it" });
    }

    let workbook;
    try {
      const buf = Buffer.from(b64, "base64");
      workbook = XLSX.read(buf, { type: "buffer", cellDates: true });
    } catch (e: any) {
      return res.status(400).json({ error: `Could not parse XLSX: ${e.message}` });
    }
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return res.status(400).json({ error: "XLSX has no sheets" });
    const sheet = workbook.Sheets[sheetName];
    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
    if (rawRows.length === 0) return res.status(400).json({ error: "XLSX sheet is empty" });
    if (rawRows.length > 1000) {
      return res.status(400).json({ error: `Too many rows (${rawRows.length}); max 1000 per upload` });
    }

    // Normalise column names — accept common variants.
    const pickField = (row: any, candidates: string[]): any => {
      const keys = Object.keys(row);
      for (const c of candidates) {
        const k = keys.find(x => x.trim().toLowerCase() === c.toLowerCase());
        if (k && row[k] !== null && row[k] !== "") return row[k];
      }
      return null;
    };
    const normalised = rawRows.map((r, idx) => {
      const dateField = pickField(r, ["date", "dated_at", "transaction_date", "txn_date", "tx_date"]);
      let datedAtIso: string | null = null;
      if (dateField instanceof Date) {
        datedAtIso = dateField.toISOString().slice(0, 10);
      } else if (typeof dateField === "string") {
        const parsed = new Date(dateField);
        if (!isNaN(parsed.getTime())) datedAtIso = parsed.toISOString().slice(0, 10);
      } else if (typeof dateField === "number") {
        // Excel serial date
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const parsed = new Date(excelEpoch.getTime() + dateField * 86400000);
        if (!isNaN(parsed.getTime())) datedAtIso = parsed.toISOString().slice(0, 10);
      }
      return {
        rowIndex: idx + 2, // +2 = header row + 1-indexed
        vendor:   (pickField(r, ["vendor", "merchant", "payee", "description"]) || "").toString().trim(),
        amount:   Number(pickField(r, ["amount", "total", "cost", "price", "value"])),
        currency: (pickField(r, ["currency", "ccy"]) || "HKD").toString().toUpperCase().slice(0, 3),
        datedAt:  datedAtIso,
        notes:    pickField(r, ["notes", "memo", "description"]) || null,
        existingCategory: pickField(r, ["category", "type"]) || null,
      };
    });

    // Drop obviously invalid rows.
    const valid = normalised.filter(r =>
      r.vendor && Number.isFinite(r.amount) && r.amount > 0 && r.datedAt
    );
    const skipped = normalised.length - valid.length;

    // Classify in batches to keep prompts small. Claude returns JSON
    // with classification + category + brief rationale per row.
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const BATCH_SIZE = 30;
    const classified: any[] = [];
    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batch = valid.slice(i, i + BATCH_SIZE);
      const prompt = `You are classifying historical expenses as business / personal / undefined for a Hong Kong software consultancy (JD CoreDev). The owner builds custom software. Business = anything plausibly tied to running the consultancy (SaaS subscriptions, hosting, dev tools, AI APIs, business meals/travel, accounting, comms, professional services). Personal = clearly consumer (groceries, personal entertainment, personal travel unrelated to business). Undefined = ambiguous or insufficient info to call it.

For each row, also pick a short category from: SaaS · AI, SaaS · Dev, SaaS · Hosting, SaaS · Email, SaaS · Banking, SaaS · Domains, Comms · Mobile, Comms · Internet, Travel · Business, Travel · Ancillary, Meals · Business, Office · Supplies, Professional · Legal, Professional · Accounting, Other · Business, Other · Personal — or invent one if none fit.

Return ONLY a JSON array, one object per input row in the same order:
[{"index": <row_index>, "classification": "business"|"personal"|"undefined", "category": "...", "confidence": 0.0-1.0, "rationale": "1 sentence why"}]

Input rows:
${JSON.stringify(batch.map((r, j) => ({ index: r.rowIndex, vendor: r.vendor, amount: r.amount, currency: r.currency, dated_at: r.datedAt, notes: r.notes, existingCategory: r.existingCategory })), null, 2)}`;

      const result = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      });
      const text = result.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");
      const m = text.match(/\[[\s\S]*\]/);
      if (!m) {
        console.error("[parse-xlsx] no JSON array in response:", text.slice(0, 200));
        continue;
      }
      try {
        const parsed = JSON.parse(m[0]);
        for (const row of batch) {
          const cls = parsed.find((p: any) => p.index === row.rowIndex);
          classified.push({
            ...row,
            classification: cls?.classification || "undefined",
            suggestedCategory: cls?.category || row.existingCategory || null,
            classificationConfidence: cls?.confidence ?? 0.5,
            classificationRationale: cls?.rationale || null,
          });
        }
      } catch (e: any) {
        console.error("[parse-xlsx] JSON parse failed:", e.message);
      }
    }

    res.json({
      sheet: sheetName,
      totalRows: rawRows.length,
      validRows: valid.length,
      skipped,
      classified,
      summary: {
        business:  classified.filter(c => c.classification === "business").length,
        personal:  classified.filter(c => c.classification === "personal").length,
        undefined: classified.filter(c => c.classification === "undefined").length,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Aggregated P&L view for the dashboard.
expensesRouter.get("/summary", async (_req, res) => {
  try {
    await ensureSchema();
    const [byMonth, byCategory, totalsByFrequency, queuePending,
           byMonthUsd, byCategoryUsd, totalsByFrequencyUsd, fxCoverage] = await Promise.all([
      pool.query(`
        SELECT TO_CHAR(dated_at, 'YYYY-MM') AS month,
               currency,
               SUM(amount)::numeric(14,2) AS total
        FROM business_expenses
        WHERE dated_at > NOW() - INTERVAL '12 months'
        GROUP BY 1, 2
        ORDER BY 1 ASC
      `),
      pool.query(`
        SELECT COALESCE(category, 'uncategorised') AS category,
               currency,
               SUM(amount)::numeric(14,2) AS total
        FROM business_expenses
        WHERE dated_at > NOW() - INTERVAL '12 months'
        GROUP BY 1, 2
        ORDER BY 3 DESC
      `),
      pool.query(`
        SELECT frequency, COUNT(*)::int AS n, SUM(amount)::numeric(14,2) AS total
        FROM business_expenses
        GROUP BY 1
      `),
      pool.query(`SELECT COUNT(*)::int AS n FROM expense_queue WHERE status = 'pending'`),
      // USD-baseline aggregates (snapshot at expense's dated_at).
      pool.query(`
        SELECT TO_CHAR(dated_at, 'YYYY-MM') AS month,
               SUM(amount_usd)::numeric(14,2) AS total_usd
        FROM business_expenses
        WHERE dated_at > NOW() - INTERVAL '12 months' AND amount_usd IS NOT NULL
        GROUP BY 1
        ORDER BY 1 ASC
      `),
      pool.query(`
        SELECT COALESCE(category, 'uncategorised') AS category,
               SUM(amount_usd)::numeric(14,2) AS total_usd
        FROM business_expenses
        WHERE dated_at > NOW() - INTERVAL '12 months' AND amount_usd IS NOT NULL
        GROUP BY 1
        ORDER BY 2 DESC
      `),
      pool.query(`
        SELECT frequency,
               COUNT(*)::int AS n,
               SUM(amount_usd)::numeric(14,2) AS total_usd
        FROM business_expenses
        WHERE amount_usd IS NOT NULL
        GROUP BY 1
      `),
      pool.query(`
        SELECT COUNT(*)::int AS total_rows,
               COUNT(amount_usd)::int AS rows_with_usd,
               COUNT(*) FILTER (WHERE amount_usd IS NULL)::int AS rows_missing_usd
        FROM business_expenses
      `),
    ]);
    res.json({
      byMonth:    byMonth.rows,
      byCategory: byCategory.rows,
      totalsByFrequency: totalsByFrequency.rows,
      queuePending: queuePending.rows[0]?.n ?? 0,
      byMonthUSD:    byMonthUsd.rows,
      byCategoryUSD: byCategoryUsd.rows,
      totalsByFrequencyUSD: totalsByFrequencyUsd.rows,
      fxCoverage: fxCoverage.rows[0] ?? { total_rows: 0, rows_with_usd: 0, rows_missing_usd: 0 },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
