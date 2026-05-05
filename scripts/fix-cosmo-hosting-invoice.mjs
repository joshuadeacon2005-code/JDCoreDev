#!/usr/bin/env node
/**
 * Re-apply HOST-2-202604-001 (Cosmo / Stuffed toy visualiser) recalc.
 * The previous "revert to $150" was wrong — there IS overage in the
 * cycle window (47m over the 180m budget = $23.50). Sets the cycle
 * window, derives line items + total from actual logs.
 */
import pg from "pg";

const TARGET_INVOICE = "HOST-2-202604-001";
const CYCLE_START    = "2026-03-17"; // day after Mar 16 payment cleared
const CYCLE_END      = "2026-04-26"; // invoice date

const HOSTING_OVERAGE_RATE_CENTS_PER_HOUR = 3000;

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }
const pool = new pg.Pool({
  connectionString: url,
  ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function main() {
  const r = await pool.query(
    `SELECT id, total_amount_cents FROM hosting_invoices WHERE invoice_number = $1`,
    [TARGET_INVOICE]
  );
  if (r.rows.length === 0) { console.error(`${TARGET_INVOICE} not found`); process.exit(1); }
  const inv = r.rows[0];
  console.log(`──── ${TARGET_INVOICE} (id=${inv.id}) ────`);
  console.log(`  current total: $${(inv.total_amount_cents / 100).toFixed(2)}`);

  // cycle window
  await pool.query(
    `UPDATE hosting_invoices SET cycle_start_date = $1, cycle_end_date = $2 WHERE id = $3`,
    [CYCLE_START, CYCLE_END, inv.id]
  );

  // Recover projects from existing line items
  const projRes = await pool.query(
    `SELECT DISTINCT project_id FROM hosting_invoice_line_items WHERE invoice_id = $1`,
    [inv.id]
  );
  const projectIds = projRes.rows.map(r => r.project_id);
  const projects = [];
  for (const pid of projectIds) {
    const p = await pool.query(`SELECT id, name FROM projects WHERE id = $1`, [pid]);
    if (p.rows.length === 0) continue;
    const t = await pool.query(
      `SELECT monthly_fee_cents, maintenance_budget_minutes
         FROM project_hosting_terms WHERE project_id = $1`,
      [pid]
    );
    projects.push({
      id: p.rows[0].id,
      name: (p.rows[0].name || "").trim(),
      monthlyFeeCents: t.rows[0]?.monthly_fee_cents || 0,
      budgetMinutes: t.rows[0]?.maintenance_budget_minutes ?? null,
    });
  }
  const hostingFeesTotal = projects.reduce((s, p) => s + p.monthlyFeeCents, 0);

  // Logs in cycle window per project
  let combinedActualMinutes = 0;
  let combinedBudgetMinutes = 0;
  const logsByProject = {};
  for (const project of projects) {
    const logs = await pool.query(
      `SELECT id, log_date, minutes_spent, description
         FROM maintenance_logs
        WHERE project_id = $1
          AND log_date BETWEEN $2 AND $3
        ORDER BY log_date DESC, id DESC`,
      [project.id, CYCLE_START, CYCLE_END]
    );
    logsByProject[project.id] = logs.rows;
    const minutes = logs.rows.reduce((s, l) => s + l.minutes_spent, 0);
    combinedActualMinutes += minutes;
    if (project.budgetMinutes !== null) combinedBudgetMinutes += project.budgetMinutes;
    console.log(`    · ${project.name}: ${logs.rows.length} log(s), ${minutes}m logged, budget ${project.budgetMinutes ?? "—"}m`);
  }
  const overtimeMins = Math.max(0, combinedActualMinutes - combinedBudgetMinutes);
  const overageCents = Math.round((overtimeMins * HOSTING_OVERAGE_RATE_CENTS_PER_HOUR) / 60);
  const newTotalCents = hostingFeesTotal + overageCents;

  console.log(`  combined: ${combinedActualMinutes}m vs ${combinedBudgetMinutes}m budget = ${overtimeMins}m over → overage $${(overageCents / 100).toFixed(2)}`);

  // Wipe + recreate line items
  await pool.query(`DELETE FROM hosting_invoice_line_items WHERE invoice_id = $1`, [inv.id]);
  for (const project of projects) {
    await pool.query(
      `INSERT INTO hosting_invoice_line_items (invoice_id, project_id, project_name, amount_cents, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [inv.id, project.id, project.name, project.monthlyFeeCents, "Monthly Hosting & Support"]
    );
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
  if (overageCents > 0) {
    const overageHours = (overtimeMins / 60).toFixed(2);
    const budgetHours  = (combinedBudgetMinutes / 60).toFixed(1);
    const actualHours  = (combinedActualMinutes / 60).toFixed(2);
    await pool.query(
      `INSERT INTO hosting_invoice_line_items (invoice_id, project_id, project_name, amount_cents, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        inv.id,
        projects[0].id,
        "All projects (combined)",
        overageCents,
        `Maintenance Overage — ${actualHours}h logged vs ${budgetHours}h budget = ${overageHours}h over @ $30/hr (cycle ${CYCLE_START} → ${CYCLE_END})`,
      ]
    );
  }
  await pool.query(
    `UPDATE hosting_invoices SET total_amount_cents = $1, updated_at = NOW() WHERE id = $2`,
    [newTotalCents, inv.id]
  );
  console.log(`  ✓ new total: $${(newTotalCents / 100).toFixed(2)}`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
