CREATE TABLE "maintenance_log_costs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "maintenance_log_costs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"maintenance_log_id" integer NOT NULL,
	"cost_cents" integer NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "maintenance_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"log_date" date NOT NULL,
	"minutes_spent" integer NOT NULL,
	"description" text NOT NULL,
	"estimated_cost_cents" integer,
	"category" text,
	"log_type" text DEFAULT 'hosting' NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replit_charges" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "replit_charges_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"charge_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"description" text,
	"billing_month" integer NOT NULL,
	"billing_year" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracked_coins" ALTER COLUMN "coin_id" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "tracked_coins" ALTER COLUMN "symbol" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "project_hosting_terms" ADD COLUMN "maintenance_budget_cents" integer;--> statement-breakpoint
ALTER TABLE "project_hosting_terms" ADD COLUMN "maintenance_budget_minutes" integer;--> statement-breakpoint
ALTER TABLE "project_hosting_terms" ADD COLUMN "maintenance_terms_notes" text;--> statement-breakpoint
ALTER TABLE "project_hosting_terms" ADD COLUMN "maintenance_prompts" text;--> statement-breakpoint
ALTER TABLE "tracked_coins" ADD COLUMN "blockchain" varchar(20) DEFAULT 'coingecko';--> statement-breakpoint
ALTER TABLE "maintenance_log_costs" ADD CONSTRAINT "maintenance_log_costs_maintenance_log_id_maintenance_logs_id_fk" FOREIGN KEY ("maintenance_log_id") REFERENCES "public"."maintenance_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;