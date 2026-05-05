#!/usr/bin/env node
/**
 * Sweep maintenance_logs for junk Claude-Code auto-log entries:
 *   - thin prompt quotes ("go", "ok", "fix it", "where is it", "do it",
 *     ≤5 word steers)
 *   - tiny single-file single-edit slices with no real outcome
 *   - "Outcome:" lines that end with a colon (mid-thought continuation
 *     that escaped the lib.mjs filter, or pre-filter logs)
 *
 * Default: dry-run — prints what would be deleted, deletes nothing.
 * Pass --apply to actually delete.
 *
 * Run via:
 *   railway run --service Postgres -- node /tmp/inv-fix/cleanup.mjs --apply
 */
import pg from "pg";

const APPLY = process.argv.includes("--apply");

// Patterns that flag a junk log. Each is OR'd.
// All match against the description column.
const JUNK_PATTERNS = [
  // 1. Thin Request: line — anything ≤ 20 chars in the quotes is almost
  //    always a one-line steer ("go", "ok", "where is it", "my bad go",
  //    "Hello?!", "ok keep going"). The actual user-visible bad logs.
  { name: "thin-request",
    sql: `description ~ 'Request:\\s*"[^"]{1,22}"'`,
  },
  // 2. Single-file single-edit slices with no Outcome and ≤10m active
  { name: "tiny-no-outcome",
    sql: `description LIKE '%Touched 1 file (1 edit):%' AND description NOT LIKE '%Outcome:%' AND minutes_spent <= 10`,
  },
  // 3. Outcome line ending with colon — mid-thought continuation
  //    ("Outcome: Fixing the searchPm return path:" etc.)
  { name: "outcome-colon",
    sql: `description ~ 'Outcome:[^\n]*:\\s*(\\n|$)'`,
  },
];

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }
const pool = new pg.Pool({
  connectionString: url,
  ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (will delete)" : "DRY-RUN (no deletes)"}`);

  const matchedIds = new Set();
  for (const pat of JUNK_PATTERNS) {
    const r = await pool.query(
      `SELECT id, project_id, log_date, minutes_spent,
              SUBSTRING(description FROM 1 FOR 200) AS preview
         FROM maintenance_logs
        WHERE category = 'claude-code-session'
          AND (${pat.sql})
        ORDER BY id`
    );
    console.log(`\n[${pat.name}] ${r.rows.length} match(es)`);
    for (const row of r.rows.slice(0, 5)) {
      console.log(`  id=${row.id} proj=${row.project_id} ${row.log_date} ${row.minutes_spent}m`);
      console.log(`    ${row.preview.split("\n").slice(0, 2).join(" | ")}`);
    }
    if (r.rows.length > 5) console.log(`  ...+${r.rows.length - 5} more`);
    for (const row of r.rows) matchedIds.add(row.id);
  }

  console.log(`\nUnique junk logs: ${matchedIds.size}`);
  if (matchedIds.size === 0) {
    await pool.end();
    return;
  }

  if (!APPLY) {
    console.log(`\n(Dry run — pass --apply to delete)`);
    await pool.end();
    return;
  }

  const ids = Array.from(matchedIds);
  const batches = [];
  for (let i = 0; i < ids.length; i += 500) batches.push(ids.slice(i, i + 500));

  let totalDeleted = 0;
  for (const batch of batches) {
    const r = await pool.query(
      `DELETE FROM maintenance_logs WHERE id = ANY($1::int[]) RETURNING id`,
      [batch]
    );
    totalDeleted += r.rowCount;
  }
  console.log(`\n✓ deleted ${totalDeleted} junk log(s)`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
