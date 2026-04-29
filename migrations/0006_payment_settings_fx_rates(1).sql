-- 0006 — Per-currency FX overrides on payment_settings.
-- Map of ISO 4217 code → USD-to-X rate. Missing entries fall back to
-- the static defaults compiled into shared/currency.ts.

ALTER TABLE "payment_settings" ADD COLUMN "fx_rates" jsonb DEFAULT '{}'::jsonb;
