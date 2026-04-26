-- 0005 — Per-partner payout currency.
-- When set, new commission_entries for this partner use this currency
-- regardless of the source project's currency.

ALTER TABLE "referral_partners" ADD COLUMN "payout_currency" text;

-- Default the seeded partner (James / Unsolved-Market) to GBP since the
-- agreement is on UK terms.
UPDATE "referral_partners"
SET "payout_currency" = 'GBP'
WHERE contact_email = 'unsolvedmarket@gmail.com';
