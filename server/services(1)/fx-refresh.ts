// Daily refresh of USD → local FX rates from Frankfurter (api.frankfurter.dev).
//
// Free, no API key, ECB-backed. Covers every currency in
// SUPPORTED_INVOICE_CURRENCIES (minus USD itself). Results are written
// into payment_settings.fx_rates_auto. The user's manual overrides in
// payment_settings.fx_rates take precedence at render time, so this is
// a no-op for currencies the user has explicitly pinned.

import { db } from "../db";
import { paymentSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { SUPPORTED_INVOICE_CURRENCIES } from "@shared/currency";

const FX_API_URL = "https://api.frankfurter.dev/v1/latest";

const SYMBOLS = SUPPORTED_INVOICE_CURRENCIES
  .map((c) => c.code)
  .filter((c) => c !== "USD");

export async function refreshFxRatesNow(): Promise<{
  ok: boolean;
  count: number;
  date?: string;
  error?: string;
  rates?: Record<string, number>;
}> {
  try {
    const url = `${FX_API_URL}?base=USD&symbols=${SYMBOLS.join(",")}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      const msg = `Frankfurter HTTP ${res.status}`;
      console.error(`[fx-refresh] ${msg}`);
      return { ok: false, count: 0, error: msg };
    }
    const data = (await res.json()) as { date?: string; rates?: Record<string, number> };
    if (!data?.rates || typeof data.rates !== "object") {
      console.error(`[fx-refresh] unexpected payload`, data);
      return { ok: false, count: 0, error: "Unexpected response shape" };
    }
    const fxRatesAuto: Record<string, number> = {};
    for (const code of SYMBOLS) {
      const v = data.rates[code];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        fxRatesAuto[code] = v;
      }
    }

    const [existing] = await db.select().from(paymentSettings).limit(1);
    if (!existing) {
      // No row yet — create one so the cron can land somewhere.
      await db.insert(paymentSettings).values({
        fxRatesAuto: fxRatesAuto as any,
        fxRatesAutoUpdatedAt: new Date(),
      });
    } else {
      await db
        .update(paymentSettings)
        .set({
          fxRatesAuto: fxRatesAuto as any,
          fxRatesAutoUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(paymentSettings.id, existing.id));
    }
    console.log(
      `[fx-refresh] ${Object.keys(fxRatesAuto).length} rates updated (frankfurter date=${data.date ?? "?"})`,
    );
    return { ok: true, count: Object.keys(fxRatesAuto).length, date: data.date, rates: fxRatesAuto };
  } catch (e: any) {
    console.error(`[fx-refresh] failed:`, e);
    return { ok: false, count: 0, error: e?.message ?? "unknown error" };
  }
}

let scheduled = false;

export function startFxRefreshSchedule(): void {
  if (scheduled) return;
  scheduled = true;
  // Frankfurter publishes shortly after ECB ~16:00 CET. Run at 06:00 UTC
  // daily so morning invoices have fresh rates.
  // Using setInterval rather than node-cron to keep this self-contained;
  // if the existing app uses node-cron elsewhere, swap to that.
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const FIRST_DELAY_MS = 5 * 60 * 1000; // first run 5 min after boot

  // First run shortly after startup so a freshly-deployed instance gets
  // rates without waiting for the schedule.
  setTimeout(() => {
    void refreshFxRatesNow();
    setInterval(() => {
      void refreshFxRatesNow();
    }, ONE_DAY_MS);
  }, FIRST_DELAY_MS);
  console.log("[fx-refresh] scheduled daily refresh; first run in 5 min");
}
