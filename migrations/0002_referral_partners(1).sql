-- 0002 — Referral partner support.
-- Adds referral_partners, project_costs, commission_entries, plus
-- referred_by_partner_id / partner_actively_involved on clients and
-- commission columns on projects.

CREATE TYPE "partner_status" AS ENUM ('active', 'paused', 'terminated');
CREATE TYPE "commission_status" AS ENUM ('due', 'paid', 'waived', 'cancelled');
CREATE TYPE "project_cost_category" AS ENUM (
  'third_party_software',
  'contractor',
  'infrastructure',
  'stock_assets',
  'vat_passthrough',
  'other'
);

CREATE TABLE "referral_partners" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "name" text NOT NULL,
  "trading_name" text,
  "contact_email" text,
  "contact_phone" text,
  "default_commission_rate" numeric(6, 5) NOT NULL,
  "default_recurring_share_rate" numeric(6, 5),
  "status" partner_status NOT NULL DEFAULT 'active',
  "partnership_start_date" date,
  "default_tail_months" integer NOT NULL DEFAULT 12,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "clients"
  ADD COLUMN "referred_by_partner_id" integer,
  ADD COLUMN "partner_actively_involved" boolean NOT NULL DEFAULT false;

ALTER TABLE "clients"
  ADD CONSTRAINT "clients_referred_by_partner_id_fk"
  FOREIGN KEY ("referred_by_partner_id") REFERENCES "referral_partners"("id")
  ON DELETE SET NULL;

CREATE INDEX "clients_referred_by_partner_id_idx" ON "clients" ("referred_by_partner_id");

ALTER TABLE "projects"
  ADD COLUMN "completed_at" timestamp,
  ADD COLUMN "commission_waived" boolean NOT NULL DEFAULT false,
  ADD COLUMN "commission_rate_override" numeric(6, 5);

CREATE TABLE "project_costs" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "incurred_date" date,
  "category" project_cost_category,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "project_costs_project_id_idx" ON "project_costs" ("project_id");

CREATE TABLE "commission_entries" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "partner_id" integer NOT NULL REFERENCES "referral_partners"("id") ON DELETE RESTRICT,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "project_id" integer REFERENCES "projects"("id") ON DELETE SET NULL,
  "source_type" text NOT NULL,
  "source_ref" text,
  "gross_cents" integer NOT NULL,
  "costs_cents" integer NOT NULL DEFAULT 0,
  "net_cents" integer NOT NULL,
  "rate_applied" numeric(6, 5) NOT NULL,
  "commission_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "status" commission_status NOT NULL DEFAULT 'due',
  "paid_at" timestamp,
  "payment_date" date,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "commission_entries_partner_id_idx" ON "commission_entries" ("partner_id");
CREATE INDEX "commission_entries_client_id_idx" ON "commission_entries" ("client_id");
CREATE INDEX "commission_entries_project_id_idx" ON "commission_entries" ("project_id");
CREATE INDEX "commission_entries_status_idx" ON "commission_entries" ("status");

-- Idempotency: only one project-completion entry per project.
CREATE UNIQUE INDEX "commission_entries_one_per_project_completion"
  ON "commission_entries" ("project_id")
  WHERE "source_type" = 'project_completion' AND "project_id" IS NOT NULL;

-- Seed the first referral partner — James Maloney / Unsolved-Market.
-- Idempotent: only inserts if no partner with this email already exists.
INSERT INTO "referral_partners"
  (name, trading_name, contact_email, default_commission_rate, default_tail_months, status, partnership_start_date, notes)
SELECT
  'James Maloney',
  'Unsolved-Market',
  'unsolvedmarket@gmail.com',
  0.12500,
  12,
  'active',
  CURRENT_DATE,
  'First referral partner. 12.5% commission on net project fees. 12-month tail period. Recurring revenue (hosting/maintenance) is excluded from commission unless partner_actively_involved is set on the client.'
WHERE NOT EXISTS (
  SELECT 1 FROM "referral_partners" WHERE contact_email = 'unsolvedmarket@gmail.com'
);
