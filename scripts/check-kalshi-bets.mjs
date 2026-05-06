import pg from "pg";
const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const r = await pool.query(`
  SELECT id, market_ticker, market_title, side, contracts, price, cost,
         confidence, edge, council_verdict, status, logged_at,
         settled_at, pnl
    FROM predictor_bets
   WHERE platform = 'kalshi'
   ORDER BY logged_at DESC
   LIMIT 30
`);
console.log(`Total: ${r.rows.length} kalshi bets (latest 30)\n`);
for (const b of r.rows) {
  const cost = parseFloat(b.cost);
  const price = parseFloat(b.price);
  const contracts = b.contracts;
  // Max payout if winning side: contracts × $1 (Kalshi binary contracts settle at $0 or $1)
  const maxPayout = contracts * 1;
  const maxProfit = maxPayout - cost;
  const ratioPct = ((maxProfit / cost) * 100).toFixed(1);
  const edge = parseFloat(b.edge || 0);
  const date = new Date(b.logged_at).toISOString().slice(0, 10);
  console.log(`${date} ${b.status.padEnd(10)} ${b.side.toUpperCase()} ${contracts}c @ $${price.toFixed(2)} cost $${cost.toFixed(2)} max-win $${maxProfit.toFixed(2)} (${ratioPct}%) edge=${(edge*100).toFixed(1)}pp`);
  console.log(`   ${(b.market_title || b.market_ticker || '').slice(0,90)}`);
}
console.log(`\n\nStatus breakdown:`);
const statuses = await pool.query(
  `SELECT status, COUNT(*)::int as n FROM predictor_bets WHERE platform='kalshi' GROUP BY status ORDER BY n DESC`
);
for (const s of statuses.rows) console.log(`  ${s.status}: ${s.n}`);
console.log(`\nP&L on settled bets:`);
const pnl = await pool.query(
  `SELECT COUNT(*)::int as settled, COALESCE(SUM(pnl)::numeric(10,2),0) as total_pnl,
          COUNT(*) FILTER (WHERE pnl > 0)::int as wins,
          COUNT(*) FILTER (WHERE pnl < 0)::int as losses
     FROM predictor_bets WHERE platform='kalshi' AND status='settled' AND pnl IS NOT NULL`
);
console.log(`  ${JSON.stringify(pnl.rows[0])}`);
await pool.end();
