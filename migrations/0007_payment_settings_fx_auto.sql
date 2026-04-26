-- 0007 — Auto-refreshed FX rates on payment_settings.
-- Daily cron pulls USD → local rates from Frankfurter (ECB) into
-- fx_rates_auto. User overrides in fx_rates take precedence at render.

ALTER TABLE "payment_settings"
  ADD COLUMN "fx_rates_auto" jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN "fx_rates_auto_updated_at" timestamp;
