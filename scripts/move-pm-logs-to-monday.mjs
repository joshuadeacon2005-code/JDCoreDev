#!/usr/bin/env node
/**
 * Move 14 maintenance_logs from project 6 (Marketing Planner) to
 * project 10 (monday.com rebuild sub-project). One-off, idempotent.
 */
import pg from "pg";

const FROM_PROJECT = 6;
const TO_PROJECT   = 10;
const LOG_IDS = [308, 341, 342, 343, 344, 345, 352, 353, 355, 356, 360, 361, 363, 364];

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }

const pool = new pg.Pool({
  connectionString: url,
  ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function main() {
  // Sanity check: verify the destination project exists
  const dest = await pool.query(`SELECT id, name FROM projects WHERE id = $1`, [TO_PROJECT]);
  if (dest.rows.length === 0) { console.error(`Project ${TO_PROJECT} not found`); process.exit(1); }
  console.log(`Destination: project ${TO_PROJECT} = "${dest.rows[0].name}"`);

  // Show before-state
  const before = await pool.query(
    `SELECT id, project_id, log_date, minutes_spent
       FROM maintenance_logs
      WHERE id = ANY($1::int[])
      ORDER BY id`,
    [LOG_IDS]
  );
  const wrongProject = before.rows.filter(r => r.project_id !== FROM_PROJECT);
  if (wrongProject.length > 0) {
    console.log(`! ${wrongProject.length} log(s) NOT on project ${FROM_PROJECT} (already moved or wrong source). Re-pointing them all to ${TO_PROJECT} regardless:`);
    for (const r of wrongProject) console.log(`    id=${r.id} currently on project ${r.project_id}`);
  }
  console.log(`Found ${before.rows.length} of ${LOG_IDS.length} requested log(s).`);

  const res = await pool.query(
    `UPDATE maintenance_logs SET project_id = $1 WHERE id = ANY($2::int[]) RETURNING id`,
    [TO_PROJECT, LOG_IDS]
  );
  console.log(`✓ moved ${res.rowCount} log(s) to project ${TO_PROJECT}`);

  // Verify
  const after = await pool.query(
    `SELECT project_id, COUNT(*)::int AS n, SUM(minutes_spent)::int AS total_minutes
       FROM maintenance_logs
      WHERE id = ANY($1::int[])
      GROUP BY 1`,
    [LOG_IDS]
  );
  for (const r of after.rows) {
    console.log(`  project ${r.project_id}: ${r.n} log(s), ${r.total_minutes}m`);
  }
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
