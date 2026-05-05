import pg from "pg";
const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const IDS = [308, 341, 342, 343, 344, 345, 352, 353, 355, 356, 360, 361, 363, 364];
const r = await pool.query(
  `SELECT id, project_id, log_type, category FROM maintenance_logs WHERE id = ANY($1::int[]) ORDER BY id`,
  [IDS]
);
console.log("logs:");
for (const row of r.rows) console.log(` id=${row.id} proj=${row.project_id} log_type=${row.log_type} cat=${row.category}`);
const p = await pool.query(`SELECT id, name, status FROM projects WHERE id IN (6, 10)`);
console.log("\nprojects:");
for (const row of p.rows) console.log(` id=${row.id} status=${row.status} name=${row.name}`);
await pool.end();
