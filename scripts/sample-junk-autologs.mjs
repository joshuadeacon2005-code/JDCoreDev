import pg from "pg";
const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function main() {
  // Find logs whose description contains a Request: line with very short content
  const r = await pool.query(`
    SELECT id, project_id, minutes_spent,
           SUBSTRING(description FROM 'Request:\\s*"([^"]{1,40})"') AS request_text,
           SUBSTRING(description FROM 1 FOR 300) AS preview
      FROM maintenance_logs
     WHERE category = 'claude-code-session'
       AND description ~ 'Request:\\s*"[^"]{1,40}"'
     ORDER BY id DESC
     LIMIT 30
  `);
  console.log(`Found ${r.rows.length} logs with short Request: lines`);
  for (const row of r.rows) {
    console.log(`  id=${row.id} proj=${row.project_id} ${row.minutes_spent}m  request="${row.request_text}"`);
  }
  await pool.end();
}
main();
