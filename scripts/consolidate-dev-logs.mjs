#!/usr/bin/env node
/**
 * Consolidate Claude-Code auto-logs that were split across multiple rows
 * by the watcher's mid-session idle flush.
 *
 * Each maintenance_logs row's description footer ends with "*Session <abc12345> · ..."
 * — that 8-char prefix is the Claude session id. Group rows by that prefix.
 * For sessions with >1 row:
 *   - Keep the LATEST row (highest id, has the freshest summary block).
 *   - SUM minutes_spent of all siblings → write to the keeper.
 *   - DELETE the other rows.
 *
 * After this runs, regenerate-dev-logs.mjs --rebuild can be run safely:
 * each surviving log has no same-session sibling, so its regen slice
 * extends back to t=0 and the description re-derives from the FULL
 * session transcript.
 *
 * Default: dry-run. Pass --apply to actually delete + update.
 *
 * Run via:
 *   railway run --service Postgres -- node /tmp/jdcd-pg/consolidate.mjs --apply
 */
import pg from "pg";

const APPLY = process.argv.includes("--apply");

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const SESSION_RE = /\*Session\s+([a-f0-9]{8})/i;
function extractSession(desc) {
  const m = desc?.match(SESSION_RE);
  return m ? m[1] : null;
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (will mutate)" : "DRY-RUN"}`);

  const r = await pool.query(`
    SELECT id, project_id, log_date, minutes_spent, description, created_at
      FROM maintenance_logs
     WHERE category = 'claude-code-session'
     ORDER BY id ASC
  `);
  console.log(`Loaded ${r.rows.length} claude-code-session rows`);

  // Group by (session prefix, project_id) — same session can hit two projects
  // if cwd changes mid-session, and we must preserve per-project billing.
  const byBucket = new Map();
  let unknown = 0;
  for (const row of r.rows) {
    const sid = extractSession(row.description);
    if (!sid) { unknown++; continue; }
    const key = `${sid}::${row.project_id}`;
    if (!byBucket.has(key)) byBucket.set(key, []);
    byBucket.get(key).push(row);
  }
  if (unknown) console.log(`(${unknown} rows had no session prefix in footer — left alone)`);

  // Surface multi-row buckets.
  const multi = Array.from(byBucket.entries())
    .filter(([_, rows]) => rows.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`\n(session, project) buckets with multiple rows: ${multi.length}`);
  let willDelete = 0;
  for (const [key, rows] of multi) {
    rows.sort((a, b) => a.id - b.id);
    const keeper = rows[rows.length - 1];
    const losers = rows.slice(0, -1);
    const totalMin = rows.reduce((s, x) => s + (x.minutes_spent || 0), 0);
    willDelete += losers.length;
    const [sid, pid] = key.split("::");
    console.log(
      `  · ${sid} proj=${pid} — ${rows.length} rows, sum=${totalMin}m, keep id=${keeper.id} (was ${keeper.minutes_spent}m), delete ids=[${losers.map(l => l.id).join(",")}]`
    );
  }

  console.log(`\nWould delete ${willDelete} duplicate rows; update ${multi.length} keepers' minutes_spent.`);

  if (!APPLY) {
    console.log(`\n(Dry run — pass --apply to mutate)`);
    await pool.end();
    return;
  }

  let deleted = 0, updated = 0;
  for (const [sid, rows] of multi) {
    rows.sort((a, b) => a.id - b.id);
    const keeper = rows[rows.length - 1];
    const losers = rows.slice(0, -1);
    const totalMin = rows.reduce((s, x) => s + (x.minutes_spent || 0), 0);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE maintenance_logs
            SET minutes_spent = $1
          WHERE id = $2 AND category = 'claude-code-session'`,
        [totalMin, keeper.id]
      );
      const del = await client.query(
        `DELETE FROM maintenance_logs
          WHERE id = ANY($1::int[]) AND category = 'claude-code-session'
        RETURNING id`,
        [losers.map(l => l.id)]
      );
      await client.query("COMMIT");
      updated++;
      deleted += del.rowCount;
    } catch (e) {
      await client.query("ROLLBACK");
      console.log(`  ! ${sid}: ${e.message}`);
    } finally {
      client.release();
    }
  }

  console.log(`\n✓ updated ${updated} keepers, deleted ${deleted} sibling rows`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
