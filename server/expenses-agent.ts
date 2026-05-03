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

        if (route === "approve") {
          const ins = await pool.query(
            `INSERT INTO business_expenses
             (vendor, amount, currency, category, frequency, dated_at, notes,
              source, gmail_account, gmail_message_id, gmail_message_url,
              ai_confidence, ai_rationale, possible_duplicate_of)
             VALUES ($1,$2,$3,$4,'one_off',$5,$6,'gmail-routine',$7,$8,$9,$10,$11,$12)
             RETURNING id`,
            [
              vendor, amount, currency,
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
             (vendor, amount, currency, suggested_category, dated_at, notes,
              gmail_account, gmail_message_id, gmail_message_url, raw_excerpt,
              ai_confidence, ai_rationale,
              possible_duplicate_of_expense, possible_duplicate_of_queue)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             RETURNING id`,
            [
              vendor, amount, currency, suggCategory, datedAt, aiRationale,
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

// ──────────────────────────────────────────────────────────────────────────
// PUBLIC EXPENSE CRUD (mounted at /api/expenses, no agent-key required —
// these are called by the admin UI).

expensesRouter.get("/", async (_req, res) => {
  try {
    await ensureSchema();
    const r = await pool.query(`
      SELECT id, vendor, amount, currency, category, frequency, dated_at,
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
    const r = await pool.query(
      `INSERT INTO business_expenses
       (vendor, amount, currency, category, frequency, dated_at,
        period_started_at, period_ended_at, notes, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual')
       RETURNING *`,
      [
        vendor,
        amount,
        (b.currency || "HKD").toString().toUpperCase().slice(0, 3),
        (b.category || null),
        (b.frequency || "one_off"),
        b.dated_at ? new Date(b.dated_at) : new Date(),
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
    const ins = await pool.query(
      `INSERT INTO business_expenses
       (vendor, amount, currency, category, frequency, dated_at, notes,
        source, gmail_account, gmail_message_id, gmail_message_url,
        ai_confidence, ai_rationale, possible_duplicate_of)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'manual-approved',$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        overrides.vendor || q.vendor,
        overrides.amount ?? q.amount,
        overrides.currency || q.currency,
        overrides.category || q.suggested_category,
        overrides.frequency || "one_off",
        overrides.dated_at ? new Date(overrides.dated_at) : q.dated_at,
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
        await pool.query(
          `INSERT INTO business_expenses
           (vendor, amount, currency, category, frequency, dated_at, notes, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'manual-import')`,
          [
            (it.vendor || "").toString().trim(),
            Number(it.amount),
            (it.currency || "HKD").toString().toUpperCase().slice(0, 3),
            it.category || null,
            it.frequency || "one_off",
            it.dated_at ? new Date(it.dated_at) : new Date(),
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

// Aggregated P&L view for the dashboard.
expensesRouter.get("/summary", async (_req, res) => {
  try {
    await ensureSchema();
    const [byMonth, byCategory, totalsByFrequency, queuePending] = await Promise.all([
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
    ]);
    res.json({
      byMonth:    byMonth.rows,
      byCategory: byCategory.rows,
      totalsByFrequency: totalsByFrequency.rows,
      queuePending: queuePending.rows[0]?.n ?? 0,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
