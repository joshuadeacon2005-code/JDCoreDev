-- 0004 — Per-client invoice currency.
-- Null means fall back to payment_settings.default_currency at render time.

ALTER TABLE "clients" ADD COLUMN "invoice_currency" text;
