#!/usr/bin/env node
/**
 * Fix HOST-1-202604-002 to match the PDF Josh sent ($665):
 *   - Hosting fees: 5 projects × monthly fee = $545
 *   - Logged work entries (informational): only Customer Pulse +
 *     Marketing Planner + LMS Bloom & Grow (the 3 projects shown on the
 *     PDF). Happy Hangouts + SlackCompLeave Bot have no log lines on
 *     the PDF so they're excluded.
 *   - Maintenance overage: $120 (combined 17h logged vs 13h budget,
 *     4h over @ $30/hr) — this is hardcoded to match the PDF, not
 *     re-derived from DB to avoid drift.
 *   - Total: $665.
 *
 * Also reverts HOST-2-202604-001 to its original state (single hosting
 * fee line, total $150) since the previous run touched it but Josh said
 * to only fix HOST-1.
 *
 * Run via:  railway run --service Postgres -- node /tmp/inv-fix/fix.mjs
 */
import pg from "pg";

// Per the PDF's "MAINTENANCE & SUPPORT SUMMARY" section.
const HOST1_TARGET_TOTAL_CENTS    = 66500;     // $665.00
const HOST1_OVERAGE_CENTS         = 12000;     // $120.00
const HOST1_LOGGED_HOURS          = 17;
const HOST1_BUDGET_HOURS          = 13;
const HOST1_OVERAGE_HOURS         = 4;

// Only these 3 projects had logs on the PDF; the other two
// (SlackCompLeave Bot, The Happy Hangouts) had no log section.
const HOST1_PROJECTS_WITH_LOGS = new Set([
  "Customer Pulse",
  "Marketing Planner",
  "LMS Bloom & Grow Group",
  "LMS Bloom & Grow  Group",  // observed double-space in DB
]);

// Cycle window — set to bracket the earliest log on the PDF (Feb 25)
// through the invoice date (Apr 26). Using the PDF as source of truth.
const HOST1_CYCLE_START = "2026-02-25";
const HOST1_CYCLE_END   = "2026-04-26";

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL — run via `railway run --service Postgres -- node …`"); process.exit(1); }

const pool = new pg.Pool({
  connectionString: url,
  ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function fixHost1() {
  const r = await pool.query(
    `SELECT id, total_amount_cents FROM hosting_invoices WHERE invoice_number = 'HOST-1-202604-002'`
  );
  if (r.rows.length === 0) { console.log(`✗ HOST-1-202604-002 not found`); return; }
  const inv = r.rows[0];
  console.log(`\n──── HOST-1-202604-002 (id=${inv.id}) ────`);
  console.log(`  current total: $${(inv.total_amount_cents / 100).toFixed(2)}`);

  // Set cycle window
  await pool.query(
    `UPDATE hosting_invoices SET cycle_start_date = $1, cycle_end_date = $2 WHERE id = $3`,
    [HOST1_CYCLE_START, HOST1_CYCLE_END, inv.id]
  );

  // Distinct projectIds from existing line items (covers all 5 projects on this invoice)
  const projRes = await pool.query(
    `SELECT DISTINCT project_id FROM hosting_invoice_line_items WHERE invoice_id = $1`,
    [inv.id]
  );
  const projectIds = projRes.rows.map(r => r.project_id);

  // Load each project + its hosting terms
  const projects = [];
  for (const pid of projectIds) {
    const p = await pool.query(`SELECT id, name FROM projects WHERE id = $1`, [pid]);
    if (p.rows.length === 0) continue;
    const t = await pool.query(
      `SELECT monthly_fee_cents FROM project_hosting_terms WHERE project_id = $1`,
      [pid]
    );
    projects.push({
      id: p.rows[0].id,
      name: (p.rows[0].name || "").trim(),
      rawName: p.rows[0].name,
      monthlyFeeCents: t.rows[0]?.monthly_fee_cents || 0,
    });
  }
  const hostingFeesTotal = projects.reduce((s, p) => s + p.monthlyFeeCents, 0);
  console.log(`  hosting fees total: $${(hostingFeesTotal / 100).toFixed(2)} (${projects.length} project(s))`);

  // Load logs for ONLY the 3 projects on the PDF, in the cycle window.
  // Sort: project order first, then date ascending.
  const logsByProject = {};
  let totalDisplayedMinutes = 0;
  for (const project of projects) {
    if (!HOST1_PROJECTS_WITH_LOGS.has(project.rawName) && !HOST1_PROJECTS_WITH_LOGS.has(project.name)) {
      logsByProject[project.id] = [];
      continue;
    }
    // Filter to logs that EXISTED when the invoice was generated.
    // The PDF was issued Apr 26 with HKD reissue Apr 27 — anything
    // added after that wasn't on the PDF and shouldn't be on the
    // line-item breakdown either.
    const logs = await pool.query(
      `SELECT id, log_date, minutes_spent, description
         FROM maintenance_logs
        WHERE project_id = $1
          AND log_date BETWEEN $2 AND $3
          AND created_at <= '2026-04-27 23:59:59+00'
        ORDER BY log_date DESC, id DESC`,
      [project.id, HOST1_CYCLE_START, HOST1_CYCLE_END]
    );
    logsByProject[project.id] = logs.rows;
    const minutes = logs.rows.reduce((s, l) => s + l.minutes_spent, 0);
    totalDisplayedMinutes += minutes;
    console.log(`    · ${project.name}: ${logs.rows.length} log(s), ${minutes}m`);
  }
  console.log(`  combined logged: ${totalDisplayedMinutes}m (${(totalDisplayedMinutes/60).toFixed(2)}h) [PDF says ${HOST1_LOGGED_HOURS}h]`);

  // Wipe + recreate
  await pool.query(`DELETE FROM hosting_invoice_line_items WHERE invoice_id = $1`, [inv.id]);

  // Hosting fee per project (all 5)
  for (const project of projects) {
    await pool.query(
      `INSERT INTO hosting_invoice_line_items (invoice_id, project_id, project_name, amount_cents, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [inv.id, project.id, project.name, project.monthlyFeeCents, "Monthly Hosting & Support"]
    );
  }
  // Log entries (informational, $0) for the 3 PDF projects only
  for (const project of projects) {
    for (const log of logsByProject[project.id] || []) {
      const minutes = log.minutes_spent || 0;
      const hrs = Math.floor(minutes / 60);
      const mins = minutes % 60;
      const dur = hrs > 0 ? `${hrs}h${mins > 0 ? ` ${mins}m` : ""}` : `${mins}m`;
      const desc = (log.description || "").toString().replace(/\s+/g, " ").trim().slice(0, 200);
      const dateLabel = log.log_date instanceof Date
        ? log.log_date.toISOString().slice(0, 10)
        : String(log.log_date).slice(0, 10);
      await pool.query(
        `INSERT INTO hosting_invoice_line_items (invoice_id, project_id, project_name, amount_cents, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [inv.id, project.id, project.name, 0, `${dateLabel} · ${dur} · ${desc || "(no description)"}`]
      );
    }
  }
  // ONE combined overage line — hardcoded to match PDF
  await pool.query(
    `INSERT INTO hosting_invoice_line_items (invoice_id, project_id, project_name, amount_cents, description)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      inv.id,
      projects[0].id,
      "All projects (combined)",
      HOST1_OVERAGE_CENTS,
      `Maintenance Overage — ${HOST1_LOGGED_HOURS}h logged vs ${HOST1_BUDGET_HOURS}h combined budget = ${HOST1_OVERAGE_HOURS}h over @ $30/hr`,
    ]
  );
  // Set total to PDF value
  await pool.query(
    `UPDATE hosting_invoices SET total_amount_cents = $1, updated_at = NOW() WHERE id = $2`,
    [HOST1_TARGET_TOTAL_CENTS, inv.id]
  );
  console.log(`  ✓ total set to $${(HOST1_TARGET_TOTAL_CENTS / 100).toFixed(2)}`);
}

async function revertHost2() {
  // Earlier run made HOST-2-202604-001 = $173.50 with extras. Per Josh,
  // only fix HOST-1; restore HOST-2 to its single hosting line item +
  // original $150 total.
  const r = await pool.query(
    `SELECT id, client_id, total_amount_cents FROM hosting_invoices WHERE invoice_number = 'HOST-2-202604-001'`
  );
  if (r.rows.length === 0) { console.log(`\n(HOST-2-202604-001 not found, skipping revert)`); return; }
  const inv = r.rows[0];
  console.log(`\n──── HOST-2-202604-001 (id=${inv.id}) ────`);
  console.log(`  current total: $${(inv.total_amount_cents / 100).toFixed(2)}`);

  // Recover project + monthly fee
  const projRes = await pool.query(
    `SELECT DISTINCT project_id FROM hosting_invoice_line_items WHERE invoice_id = $1`,
    [inv.id]
  );
  const projectIds = projRes.rows.map(r => r.project_id);
  if (projectIds.length === 0) {
    console.log(`  ! no line items, can't determine project — skipping`);
    return;
  }
  const projects = [];
  for (const pid of projectIds) {
    const p = await pool.query(`SELECT id, name FROM projects WHERE id = $1`, [pid]);
    if (p.rows.length === 0) continue;
    const t = await pool.query(
      `SELECT monthly_fee_cents FROM project_hosting_terms WHERE project_id = $1`,
      [pid]
    );
    projects.push({
      id: p.rows[0].id,
      name: (p.rows[0].name || "").trim(),
      monthlyFeeCents: t.rows[0]?.monthly_fee_cents || 0,
    });
  }
  const hostingFeesTotal = projects.reduce((s, p) => s + p.monthlyFeeCents, 0);

  await pool.query(`DELETE FROM hosting_invoice_line_items WHERE invoice_id = $1`, [inv.id]);
  for (const project of projects) {
    await pool.query(
      `INSERT INTO hosting_invoice_line_items (invoice_id, project_id, project_name, amount_cents, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [inv.id, project.id, project.name, project.monthlyFeeCents, "Monthly Hosting & Support"]
    );
  }
  await pool.query(
    `UPDATE hosting_invoices
        SET total_amount_cents = $1,
            cycle_start_date = NULL,
            cycle_end_date = NULL,
            updated_at = NOW()
      WHERE id = $2`,
    [hostingFeesTotal, inv.id]
  );
  console.log(`  ✓ reverted to $${(hostingFeesTotal / 100).toFixed(2)} (hosting fee only, no overage)`);
}

async function main() {
  await pool.query(`ALTER TABLE hosting_invoices ADD COLUMN IF NOT EXISTS cycle_start_date DATE`);
  await pool.query(`ALTER TABLE hosting_invoices ADD COLUMN IF NOT EXISTS cycle_end_date DATE`);
  await fixHost1();
  await revertHost2();
  await pool.end();
  console.log(`\n✓ done`);
}

main().catch(e => { console.error(e); process.exit(1); });
