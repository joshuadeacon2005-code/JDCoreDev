CREATE TYPE "public"."agreement_type" AS ENUM('contract', 'sow', 'msa', 'nda', 'other');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('active', 'triggered', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."alert_type" AS ENUM('price_above', 'price_below', 'percent_increase', 'percent_decrease');--> statement-breakpoint
CREATE TYPE "public"."billing_model" AS ENUM('fixed', 'retainer', 'day_rate');--> statement-breakpoint
CREATE TYPE "public"."calendar_block_source" AS ENUM('client_booking', 'manual', 'google_sync', 'meeting');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('lead', 'active', 'past');--> statement-breakpoint
CREATE TYPE "public"."contract_type" AS ENUM('development', 'hosting');--> statement-breakpoint
CREATE TYPE "public"."day_type" AS ENUM('onsite', 'remote', 'both');--> statement-breakpoint
CREATE TYPE "public"."doc_type" AS ENUM('contract', 'sow', 'prd', 'invoice', 'brief', 'other');--> statement-breakpoint
CREATE TYPE "public"."history_event_type" AS ENUM('meeting', 'email', 'note', 'deliverable', 'call', 'other');--> statement-breakpoint
CREATE TYPE "public"."hosting_invoice_status" AS ENUM('pending', 'paid', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."hosting_terms_status" AS ENUM('none', 'draft', 'active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('requested', 'proposed', 'confirmed', 'denied', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."meeting_type" AS ENUM('call', 'video');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('planned', 'invoiced', 'paid', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."office_day_status" AS ENUM('requested', 'approved', 'rejected', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."process_step_status" AS ENUM('planned', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('lead', 'active', 'paused', 'completed', 'hosting');--> statement-breakpoint
CREATE TYPE "public"."reminder_channel" AS ENUM('email', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."reminder_recipient" AS ENUM('admin', 'client');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('pending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."reminder_type" AS ENUM('meeting', 'office_day');--> statement-breakpoint
CREATE TYPE "public"."risk_state" AS ENUM('on_track', 'at_risk', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'client');--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"message" text NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_blocks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "availability_blocks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"date" date NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "availability_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"monday" boolean DEFAULT true NOT NULL,
	"tuesday" boolean DEFAULT true NOT NULL,
	"wednesday" boolean DEFAULT true NOT NULL,
	"thursday" boolean DEFAULT true NOT NULL,
	"friday" boolean DEFAULT true NOT NULL,
	"saturday" boolean DEFAULT false NOT NULL,
	"sunday" boolean DEFAULT false NOT NULL,
	"default_type" "day_type" DEFAULT 'both' NOT NULL,
	"max_days_per_week" integer DEFAULT 5 NOT NULL,
	"max_days_per_month" integer DEFAULT 20 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_blocks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "calendar_blocks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"source" "calendar_block_source" DEFAULT 'manual' NOT NULL,
	"title" text,
	"office_day_request_id" integer,
	"meeting_request_id" integer,
	"google_event_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "clients_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"city" text,
	"state" text,
	"zip_code" text,
	"country" text,
	"company_name" text,
	"industry" text,
	"notes" text,
	"first_contact_date" date,
	"status" "client_status" DEFAULT 'lead' NOT NULL,
	"billing_json" jsonb,
	"accounts_dept_name" text,
	"accounts_dept_email" text,
	"accounts_dept_phone" text,
	"accounts_dept_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coin_news" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "coin_news_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"coin_id" varchar(50) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"url" text NOT NULL,
	"source_name" varchar(100),
	"author" varchar(255),
	"image_url" text,
	"content_snippet" text,
	"published_at" timestamp,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"relevance_score" numeric(3, 2),
	"sentiment" varchar(20),
	CONSTRAINT "coin_news_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "contact_submissions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contact_submissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text,
	"app_type" text,
	"budget" text,
	"timeline" text,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contacts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"client_id" integer NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"title" text
);
--> statement-breakpoint
CREATE TABLE "crypto_notification_settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "crypto_notification_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"recipient_phone_number" varchar(20),
	"recipient_whatsapp_number" varchar(20),
	"enable_sms" boolean DEFAULT true,
	"enable_whatsapp" boolean DEFAULT true,
	"quiet_hours_start" varchar(5),
	"quiet_hours_end" varchar(5),
	"max_notifications_per_hour" integer DEFAULT 10,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"client_id" integer NOT NULL,
	"project_id" integer,
	"filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text,
	"doc_type" "doc_type" DEFAULT 'other' NOT NULL,
	"signed" boolean DEFAULT false NOT NULL,
	"expiry_date" date,
	"version" integer DEFAULT 1 NOT NULL,
	"uploaded_by_user_id" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_contracts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "generated_contracts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"contract_type" "contract_type" NOT NULL,
	"reference_number" text NOT NULL,
	"client_name" text NOT NULL,
	"project_name" text NOT NULL,
	"start_date" date,
	"delivery_deadline" date,
	"total_amount_cents" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"monthly_hosting_fee_cents" integer,
	"min_hosting_months" integer DEFAULT 6,
	"scope_of_work" text,
	"milestones_json" jsonb,
	"governing_law" text DEFAULT 'Hong Kong SAR' NOT NULL,
	"warranty_days" integer DEFAULT 30,
	"pdf_path" text,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_calendar_accounts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "google_calendar_accounts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token" text,
	"token_expiry" timestamp,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"sync_cursor" text,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosting_invoice_line_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "hosting_invoice_line_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"invoice_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"project_name" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "hosting_invoices" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "hosting_invoices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"invoice_number" text NOT NULL,
	"client_id" integer NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"total_amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" "hosting_invoice_status" DEFAULT 'pending' NOT NULL,
	"billing_period" text,
	"notes" text,
	"pdf_path" text,
	"created_by_user_id" integer,
	"reminder_count" integer DEFAULT 0 NOT NULL,
	"last_reminder_sent" timestamp,
	"cancelled_reminders" integer[] DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hosting_invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "hosting_terms" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "hosting_terms_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"content_markdown" text NOT NULL,
	"updated_by_user_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_proposals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "meeting_proposals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"meeting_request_id" integer NOT NULL,
	"proposed_date" date NOT NULL,
	"proposed_time" text NOT NULL,
	"duration" integer DEFAULT 30 NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "meeting_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"client_id" integer,
	"project_id" integer,
	"contact_submission_id" integer,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text,
	"meeting_type" "meeting_type" DEFAULT 'call' NOT NULL,
	"requested_date" date NOT NULL,
	"requested_time" text NOT NULL,
	"duration" integer DEFAULT 30 NOT NULL,
	"status" "meeting_status" DEFAULT 'requested' NOT NULL,
	"admin_notes" text,
	"secure_token" text NOT NULL,
	"decided_by_user_id" integer,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "milestones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"due_date" date,
	"paid_date" date,
	"status" "milestone_status" DEFAULT 'planned' NOT NULL,
	"invoice_ref" text,
	"notes" text,
	"reminder_count" integer DEFAULT 0 NOT NULL,
	"last_reminder_sent" timestamp,
	"cancelled_reminders" integer[] DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "office_day_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "office_day_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"client_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"requested_by_user_id" integer NOT NULL,
	"date" date NOT NULL,
	"day_type" "day_type" DEFAULT 'onsite' NOT NULL,
	"notes" text,
	"status" "office_day_status" DEFAULT 'requested' NOT NULL,
	"decided_by_user_id" integer,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bank_name" text,
	"account_holder_name" text,
	"account_number" text,
	"routing_number" text,
	"swift_code" text,
	"iban" text,
	"paypal_email" text,
	"venmo_username" text,
	"cashapp_tag" text,
	"zelle_email" text,
	"stripe_payment_link" text,
	"bitcoin_address" text,
	"ethereum_address" text,
	"check_payable_to" text,
	"mailing_address" text,
	"payment_notes" text,
	"default_currency" text DEFAULT 'USD' NOT NULL,
	"usd_to_hkd_rate" numeric(10, 4) DEFAULT '7.8000' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_alerts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "price_alerts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"coin_id" varchar(50) NOT NULL,
	"alert_type" "alert_type" NOT NULL,
	"target_price" numeric(20, 8),
	"percent_change" numeric(5, 2),
	"timeframe_hours" integer DEFAULT 24,
	"status" "alert_status" DEFAULT 'active',
	"triggered_at" timestamp,
	"trigger_price" numeric(20, 8),
	"notify_sms" boolean DEFAULT false,
	"notify_whatsapp" boolean DEFAULT true,
	"notification_sent" boolean DEFAULT false,
	"label" varchar(255),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "price_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"coin_id" varchar(50) NOT NULL,
	"price_usd" numeric(20, 8) NOT NULL,
	"price_hkd" numeric(20, 8),
	"market_cap" numeric(30, 0),
	"volume_24h" numeric(30, 0),
	"percent_change_1h" numeric(10, 4),
	"percent_change_24h" numeric(10, 4),
	"percent_change_7d" numeric(10, 4),
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_agreements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_agreements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"agreement_type" "agreement_type" DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"signed" boolean DEFAULT false NOT NULL,
	"effective_date" date,
	"expiry_date" date,
	"notes" text,
	"document_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_history_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_history_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"event_type" "history_event_type" DEFAULT 'note' NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"summary" text NOT NULL,
	"details" text,
	"linked_document_id" integer,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_hosting_terms" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_hosting_terms_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"status" "hosting_terms_status" DEFAULT 'draft' NOT NULL,
	"start_date" date,
	"initial_term_months" integer DEFAULT 6 NOT NULL,
	"monthly_fee_cents" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"billed_in_advance" boolean DEFAULT true NOT NULL,
	"invoice_due_days" integer DEFAULT 14 NOT NULL,
	"included_services" text,
	"excluded_services" text,
	"client_responsibilities" text,
	"availability_disclaimer" text,
	"term_extension_notes" text,
	"self_hosting_handover_notes" text,
	"ip_notes" text,
	"confidentiality_notes" text,
	"liability_cap_notes" text,
	"force_majeure_notes" text,
	"governing_law" text DEFAULT 'Hong Kong SAR' NOT NULL,
	"termination_notice_days" integer DEFAULT 30 NOT NULL,
	"agreement_full_text" text,
	"agreement_document_id" integer,
	"updated_by_user_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_hosting_terms_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "project_process_steps" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_process_steps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"step_order" integer DEFAULT 0 NOT NULL,
	"status" "process_step_status" DEFAULT 'planned' NOT NULL,
	"is_milestone" boolean DEFAULT false NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_prompts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_prompts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"prompt_title" text NOT NULL,
	"prompt_text" text NOT NULL,
	"output_summary" text,
	"tags" text,
	"visible_to_client" boolean DEFAULT false NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "projects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"client_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "project_status" DEFAULT 'lead' NOT NULL,
	"billing_model" "billing_model" DEFAULT 'fixed' NOT NULL,
	"risk_state" "risk_state" DEFAULT 'on_track' NOT NULL,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_payments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "recurring_payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"payment_day" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"last_processed_date" date,
	"next_payment_date" date NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reminders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"reminder_type" "reminder_type" NOT NULL,
	"entity_id" integer NOT NULL,
	"recipient_type" "reminder_recipient" NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_whatsapp" text,
	"channel" "reminder_channel" DEFAULT 'email' NOT NULL,
	"send_at" timestamp NOT NULL,
	"sent_at" timestamp,
	"status" "reminder_status" DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "tracked_coins" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tracked_coins_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"coin_id" varchar(50) NOT NULL,
	"symbol" varchar(10) NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true,
	"check_interval_minutes" integer DEFAULT 15,
	"icon_url" text,
	"added_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_coins_coin_id_unique" UNIQUE("coin_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"username" text,
	"password" text NOT NULL,
	"role" "user_role" DEFAULT 'client' NOT NULL,
	"client_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_blocks" ADD CONSTRAINT "calendar_blocks_office_day_request_id_office_day_requests_id_fk" FOREIGN KEY ("office_day_request_id") REFERENCES "public"."office_day_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_blocks" ADD CONSTRAINT "calendar_blocks_meeting_request_id_meeting_requests_id_fk" FOREIGN KEY ("meeting_request_id") REFERENCES "public"."meeting_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_news" ADD CONSTRAINT "coin_news_coin_id_tracked_coins_coin_id_fk" FOREIGN KEY ("coin_id") REFERENCES "public"."tracked_coins"("coin_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_contracts" ADD CONSTRAINT "generated_contracts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_contracts" ADD CONSTRAINT "generated_contracts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_contracts" ADD CONSTRAINT "generated_contracts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_accounts" ADD CONSTRAINT "google_calendar_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_invoice_line_items" ADD CONSTRAINT "hosting_invoice_line_items_invoice_id_hosting_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."hosting_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_invoice_line_items" ADD CONSTRAINT "hosting_invoice_line_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_invoices" ADD CONSTRAINT "hosting_invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_invoices" ADD CONSTRAINT "hosting_invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosting_terms" ADD CONSTRAINT "hosting_terms_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_proposals" ADD CONSTRAINT "meeting_proposals_meeting_request_id_meeting_requests_id_fk" FOREIGN KEY ("meeting_request_id") REFERENCES "public"."meeting_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_requests" ADD CONSTRAINT "meeting_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_requests" ADD CONSTRAINT "meeting_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_requests" ADD CONSTRAINT "meeting_requests_contact_submission_id_contact_submissions_id_fk" FOREIGN KEY ("contact_submission_id") REFERENCES "public"."contact_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_requests" ADD CONSTRAINT "meeting_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_day_requests" ADD CONSTRAINT "office_day_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_day_requests" ADD CONSTRAINT "office_day_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_day_requests" ADD CONSTRAINT "office_day_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_day_requests" ADD CONSTRAINT "office_day_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_coin_id_tracked_coins_coin_id_fk" FOREIGN KEY ("coin_id") REFERENCES "public"."tracked_coins"("coin_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_coin_id_tracked_coins_coin_id_fk" FOREIGN KEY ("coin_id") REFERENCES "public"."tracked_coins"("coin_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_agreements" ADD CONSTRAINT "project_agreements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_agreements" ADD CONSTRAINT "project_agreements_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_history_events" ADD CONSTRAINT "project_history_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_history_events" ADD CONSTRAINT "project_history_events_linked_document_id_documents_id_fk" FOREIGN KEY ("linked_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_history_events" ADD CONSTRAINT "project_history_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_hosting_terms" ADD CONSTRAINT "project_hosting_terms_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_hosting_terms" ADD CONSTRAINT "project_hosting_terms_agreement_document_id_documents_id_fk" FOREIGN KEY ("agreement_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_hosting_terms" ADD CONSTRAINT "project_hosting_terms_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_process_steps" ADD CONSTRAINT "project_process_steps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_prompts" ADD CONSTRAINT "project_prompts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_prompts" ADD CONSTRAINT "project_prompts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;