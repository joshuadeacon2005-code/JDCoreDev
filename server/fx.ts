/**
 * FX conversion to USD baseline for expense tracking.
 *
 * Snapshots the rate at the expense's dated_at so historical totals don't
 * drift when exchange rates move. Uses ECB reference rates via frankfurter.app
 * (no API key, no rate limit headache for our volume). Rates are cached in
 * the fx_rates table on first lookup so repeat conversions are free.
 *
 * Behaviour:
 *   - currency === "USD" → rate 1.0, no API call
 *   - hit fx_rates cache → return cached rate
 *   - miss → fetch from frankfurter.app/{YYYY-MM-DD}?from=X&to=USD
 *   - frankfurter returns the most recent published rate at-or-before the
 *     requested date (handles weekends + holidays automatically)
 *   - on API failure, throws — caller decides whether to insert NULL or retry
 */
import { pool } from "./db";

// .app 301s to .dev/v1; pointing directly avoids the redirect hop on every call.
// Response shape verified: {amount, base, date, rates: {USD: number}}.
const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";

let fxSchemaReady: Promise<void> | null = null;
async function ensureFxSchema(): Promise<void> {
  if (fxSchemaReady) return fxSchemaReady;
  fxSchemaReady = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fx_rates (
        rate_date  DATE NOT NULL,
        base       TEXT NOT NULL,
        quote      TEXT NOT NULL,
        rate       NUMERIC(18,8) NOT NULL,
        source     TEXT NOT NULL DEFAULT 'frankfurter',
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (rate_date, base, quote)
      )
    `);
  })();
  return fxSchemaReady;
}
ensureFxSchema().catch(e => console.error("[fx] schema init error:", e.message));

function toIsoDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

/**
 * Fetch the X→USD rate for `date`, with caching. Returns the numeric rate.
 * Throws on network / API error so the caller can decide how to fail-safe.
 */
export async function getRateToUsd(currency: string, date: Date | string): Promise<number> {
  const cur = currency.toUpperCase().slice(0, 3);
  if (cur === "USD") return 1;
  await ensureFxSchema();

  const isoDate = toIsoDate(date);

  const cached = await pool.query(
    `SELECT rate FROM fx_rates WHERE rate_date = $1 AND base = $2 AND quote = 'USD'`,
    [isoDate, cur]
  );
  if (cached.rows.length > 0) {
    return Number(cached.rows[0].rate);
  }

  const url = `${FRANKFURTER_BASE}/${isoDate}?from=${cur}&to=USD`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`frankfurter ${url} → ${res.status} ${await res.text().catch(() => "")}`);
  }
  const json: any = await res.json();
  const rate = Number(json?.rates?.USD);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`frankfurter returned no USD rate for ${cur} on ${isoDate}: ${JSON.stringify(json)}`);
  }
  // frankfurter snaps to the nearest published business day; cache under
  // BOTH the requested date AND the actual published date so subsequent
  // weekend-dated lookups for the same currency don't re-hit the API.
  const publishedDate: string = (json?.date || isoDate).toString();
  await pool.query(
    `INSERT INTO fx_rates (rate_date, base, quote, rate)
     VALUES ($1,$2,'USD',$3)
     ON CONFLICT (rate_date, base, quote) DO NOTHING`,
    [isoDate, cur, rate]
  );
  if (publishedDate !== isoDate) {
    await pool.query(
      `INSERT INTO fx_rates (rate_date, base, quote, rate)
       VALUES ($1,$2,'USD',$3)
       ON CONFLICT (rate_date, base, quote) DO NOTHING`,
      [publishedDate, cur, rate]
    );
  }
  return rate;
}

/**
 * Convert `amount` of `currency` at `date` to USD. Returns
 * { amountUsd, fxRateToUsd } or { amountUsd: null, fxRateToUsd: null } if the
 * lookup failed (logged but non-fatal — the row still inserts, the USD
 * column just stays NULL until a backfill picks it up).
 */
export async function convertToUsd(
  amount: number,
  currency: string,
  date: Date | string
): Promise<{ amountUsd: number | null; fxRateToUsd: number | null }> {
  try {
    const rate = await getRateToUsd(currency, date);
    const usd = Math.round(Number(amount) * rate * 100) / 100;
    return { amountUsd: usd, fxRateToUsd: rate };
  } catch (e: any) {
    console.error(`[fx] convert ${amount} ${currency} @ ${toIsoDate(date)} → USD failed:`, e.message);
    return { amountUsd: null, fxRateToUsd: null };
  }
}
