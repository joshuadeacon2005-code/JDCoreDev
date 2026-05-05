import pg from "pg";
const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const IDS = [308, 341, 342, 343, 344, 345, 352, 353, 355, 356, 360, 361, 363, 364];

const before = await pool.query(
  `SELECT id, log_type FROM maintenance_logs WHERE id = ANY($1::int[]) ORDER BY id`,
  [IDS]
);
console.log(`Before: ${before.rows.length} log(s) found`);
const counts = {};
for (const r of before.rows) counts[r.log_type] = (counts[r.log_type] || 0) + 1;
console.log(` log_type breakdown: ${JSON.stringify(counts)}`);

const r = await pool.query(
  `UPDATE maintenance_logs SET log_type = 'development' WHERE id = ANY($1::int[]) RETURNING id`,
  [IDS]
);
console.log(`✓ updated ${r.rowCount} log(s) to log_type='development'`);

await pool.end();
