-- 0003 — UK bank transfer fields on payment_settings.
-- Used to render an additional "UK Bank Transfer" block on invoice PDFs
-- (sort code + 8-digit account number convention, e.g. HSBC / Revolut).

ALTER TABLE "payment_settings"
  ADD COLUMN "uk_bank_name" text,
  ADD COLUMN "uk_account_holder_name" text,
  ADD COLUMN "uk_account_number" text,
  ADD COLUMN "uk_sort_code" text;
