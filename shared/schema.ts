import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, date, jsonb, pgEnum, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["admin", "client"]);
export const clientStatusEnum = pgEnum("client_status", ["lead", "active", "past"]);
export const projectStatusEnum = pgEnum("project_status", ["lead", "active", "paused", "completed", "hosting"]);
export const billingModelEnum = pgEnum("billing_model", ["fixed", "retainer", "day_rate"]);
export const riskStateEnum = pgEnum("risk_state", ["on_track", "at_risk", "blocked"]);
export const dayTypeEnum = pgEnum("day_type", ["onsite", "remote", "both"]);
export const officeDayStatusEnum = pgEnum("office_day_status", ["requested", "approved", "rejected", "completed", "cancelled"]);
export const milestoneStatusEnum = pgEnum("milestone_status", ["planned", "invoiced", "paid", "overdue"]);
export const docTypeEnum = pgEnum("doc_type", ["contract", "sow", "prd", "invoice", "brief", "other"]);
export const processStepStatusEnum = pgEnum("process_step_status", ["planned", "in_progress", "done"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high"]);
export const agreementTypeEnum = pgEnum("agreement_type", ["contract", "sow", "msa", "nda", "other"]);
export const historyEventTypeEnum = pgEnum("history_event_type", ["meeting", "email", "note", "deliverable", "call", "other"]);
export const calendarBlockSourceEnum = pgEnum("calendar_block_source", ["client_booking", "manual", "google_sync", "meeting"]);
export const meetingTypeEnum = pgEnum("meeting_type", ["call", "video"]);
export const meetingStatusEnum = pgEnum("meeting_status", ["requested", "proposed", "confirmed", "denied", "cancelled"]);
export const reminderTypeEnum = pgEnum("reminder_type", ["meeting", "office_day"]);
export const reminderRecipientEnum = pgEnum("reminder_recipient", ["admin", "client"]);
export const reminderChannelEnum = pgEnum("reminder_channel", ["email", "whatsapp"]);
export const reminderStatusEnum = pgEnum("reminder_status", ["pending", "sent", "failed", "cancelled"]);
export const hostingTermsStatusEnum = pgEnum("hosting_terms_status", ["none", "draft", "active", "ended"]);
export const contractTypeEnum = pgEnum("contract_type", ["development", "hosting"]);
export const partnerStatusEnum = pgEnum("partner_status", ["active", "paused", "terminated"]);
export const commissionStatusEnum = pgEnum("commission_status", ["due", "paid", "waived", "cancelled"]);
export const projectCostCategoryEnum = pgEnum("project_cost_category", [
  "third_party_software",
  "contractor",
  "infrastructure",
  "stock_assets",
  "vat_passthrough",
  "other",
]);

// Users table
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: text("email").notNull().unique(),
  username: text("username"),
  password: text("password").notNull(),
  role: userRoleEnum("role").notNull().default("client"),
  clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Referral Partners table — external introducers who originate clients in
// exchange for commission. Distinct from `clients` (we pay them, not the
// other way round). Defaults here cascade onto clients/projects unless
// overridden per-row.
export const referralPartners = pgTable("referral_partners", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  tradingName: text("trading_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  // Decimal stored as fraction (0.1250 = 12.5%).
  defaultCommissionRate: decimal("default_commission_rate", { precision: 6, scale: 5 }).notNull(),
  // Optional default share applied to recurring revenue when partner stays
  // actively involved. Null/zero means no recurring share by default.
  defaultRecurringShareRate: decimal("default_recurring_share_rate", { precision: 6, scale: 5 }),
  status: partnerStatusEnum("status").notNull().default("active"),
  partnershipStartDate: date("partnership_start_date"),
  // Months of "tail" period: direct repeat work from a partner-originated
  // client within this window still attracts commission.
  defaultTailMonths: integer("default_tail_months").notNull().default(12),
  // Currency the partner prefers to be paid in (ISO 4217). When set, all
  // new commission entries for this partner use this code regardless of
  // the source project's currency. Null = inherit from source.
  payoutCurrency: text("payout_currency"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Clients table
export const clients = pgTable("clients", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  country: text("country"),
  companyName: text("company_name"),
  industry: text("industry"),
  notes: text("notes"),
  firstContactDate: date("first_contact_date"),
  status: clientStatusEnum("status").notNull().default("lead"),
  billingJson: jsonb("billing_json"),
  // Accounts Department Contact
  accountsDeptName: text("accounts_dept_name"),
  accountsDeptEmail: text("accounts_dept_email"),
  accountsDeptPhone: text("accounts_dept_phone"),
  accountsDeptNotes: text("accounts_dept_notes"),
  // Optional referral partner who introduced this client. Null = direct
  // client (existing default — no commission, no behaviour change).
  referredByPartnerId: integer("referred_by_partner_id").references(() => referralPartners.id, { onDelete: "set null" }),
  // When true, hosting/maintenance retainers for this client also generate
  // partner-share commission on each billing cycle.
  partnerActivelyInvolved: boolean("partner_actively_involved").notNull().default(false),
  // Default currency for invoices billed to this client. Null falls back to
  // paymentSettings.defaultCurrency. ISO 4217 codes: USD, GBP, EUR, HKD,
  // AUD, CAD, SGD, JPY, CNY (free-form text — extend as needed).
  invoiceCurrency: text("invoice_currency"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Contacts table
export const contacts = pgTable("contacts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  title: text("title"),
});

// Projects table
export const projects = pgTable("projects", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  // Optional parent project: a sub-project tracks its own budget/billing/scope
  // but rolls up visually under the parent on the projects list. Single-level
  // only — the API rejects nested chains. on delete set null so deleting a
  // parent doesn't cascade-kill its sub-projects.
  parentProjectId: integer("parent_project_id").references((): any => projects.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  status: projectStatusEnum("status").notNull().default("lead"),
  billingModel: billingModelEnum("billing_model").notNull().default("fixed"),
  riskState: riskStateEnum("risk_state").notNull().default("on_track"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  // Commission tracking. completedAt is set when status flips to "completed"
  // and is the anchor for the partner's tail-period clock. Override fields
  // are nullable — null means "use the partner default from clients.referredByPartnerId".
  completedAt: timestamp("completed_at"),
  commissionWaived: boolean("commission_waived").notNull().default(false),
  commissionRateOverride: decimal("commission_rate_override", { precision: 6, scale: 5 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Project Costs — dev/external/contractor expenses subtracted from gross
// project revenue before commission is calculated. Multiple rows per
// project, free-form description, optional category for reporting.
export const projectCosts = pgTable("project_costs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  incurredDate: date("incurred_date"),
  category: projectCostCategoryEnum("category"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Commission Entries — ledger of accrued commission owed to a partner. One
// row per commission event (project completion, recurring billing cycle,
// manual adjustment). status flips due → paid when the user records payment.
export const commissionEntries = pgTable("commission_entries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  partnerId: integer("partner_id").notNull().references(() => referralPartners.id, { onDelete: "restrict" }),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  // 'project_completion' | 'recurring_cycle' | 'manual_adjustment'
  sourceType: text("source_type").notNull(),
  // For idempotency: external ref to the source row (e.g. project id, hosting_invoice_line_item id).
  sourceRef: text("source_ref"),
  grossCents: integer("gross_cents").notNull(),
  costsCents: integer("costs_cents").notNull().default(0),
  netCents: integer("net_cents").notNull(),
  rateApplied: decimal("rate_applied", { precision: 6, scale: 5 }).notNull(),
  commissionCents: integer("commission_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: commissionStatusEnum("status").notNull().default("due"),
  paidAt: timestamp("paid_at"),
  paymentDate: date("payment_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Availability Rules table (singleton for admin settings)
export const availabilityRules = pgTable("availability_rules", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  monday: boolean("monday").notNull().default(true),
  tuesday: boolean("tuesday").notNull().default(true),
  wednesday: boolean("wednesday").notNull().default(true),
  thursday: boolean("thursday").notNull().default(true),
  friday: boolean("friday").notNull().default(true),
  saturday: boolean("saturday").notNull().default(false),
  sunday: boolean("sunday").notNull().default(false),
  defaultType: dayTypeEnum("default_type").notNull().default("both"),
  maxDaysPerWeek: integer("max_days_per_week").notNull().default(5),
  maxDaysPerMonth: integer("max_days_per_month").notNull().default(20),
});

// Availability Blocks table (blocked dates)
export const availabilityBlocks = pgTable("availability_blocks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  date: date("date").notNull(),
  reason: text("reason"),
});

// Office Day Requests table
export const officeDayRequests = pgTable("office_day_requests", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  requestedByUserId: integer("requested_by_user_id").notNull().references(() => users.id),
  date: date("date").notNull(),
  dayType: dayTypeEnum("day_type").notNull().default("onsite"),
  notes: text("notes"),
  status: officeDayStatusEnum("status").notNull().default("requested"),
  decidedByUserId: integer("decided_by_user_id").references(() => users.id),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Milestones table
export const milestones = pgTable("milestones", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  amountCents: integer("amount_cents").notNull().default(0),
  dueDate: date("due_date"),
  paidDate: date("paid_date"),
  status: milestoneStatusEnum("status").notNull().default("planned"),
  invoiceRef: text("invoice_ref"),
  notes: text("notes"),
  reminderCount: integer("reminder_count").notNull().default(0),
  lastReminderSent: timestamp("last_reminder_sent"),
  cancelledReminders: integer("cancelled_reminders").array().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Documents table
export const documents = pgTable("documents", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  filename: text("filename").notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type"),
  docType: docTypeEnum("doc_type").notNull().default("other"),
  signed: boolean("signed").notNull().default(false),
  expiryDate: date("expiry_date"),
  version: integer("version").notNull().default(1),
  uploadedByUserId: integer("uploaded_by_user_id").notNull().references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

// Activity Events table
export const activityEvents = pgTable("activity_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  eventType: text("event_type").notNull(),
  message: text("message").notNull(),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Contact Form Submissions (public)
export const contactSubmissions = pgTable("contact_submissions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company"),
  appType: text("app_type"),
  budget: text("budget"),
  timeline: text("timeline"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Project Process Steps table
export const projectProcessSteps = pgTable("project_process_steps", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  stepOrder: integer("step_order").notNull().default(0),
  status: processStepStatusEnum("status").notNull().default("planned"),
  isMilestone: boolean("is_milestone").notNull().default(false),
  amountCents: integer("amount_cents").notNull().default(0),
  dueDate: date("due_date"),
  priority: taskPriorityEnum("priority").notNull().default("medium"),
  completionPercentage: integer("completion_percentage").notNull().default(0),
  autoDetectedStatus: text("auto_detected_status"),
  lastAutoChecked: timestamp("last_auto_checked"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Project Prompts table (prompt history)
export const projectPrompts = pgTable("project_prompts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  promptTitle: text("prompt_title").notNull(),
  promptText: text("prompt_text").notNull(),
  outputSummary: text("output_summary"),
  tags: text("tags"),
  visibleToClient: boolean("visible_to_client").notNull().default(false),
  createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Project Agreements table
export const projectAgreements = pgTable("project_agreements", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  agreementType: agreementTypeEnum("agreement_type").notNull().default("other"),
  title: text("title").notNull(),
  signed: boolean("signed").notNull().default(false),
  effectiveDate: date("effective_date"),
  expiryDate: date("expiry_date"),
  notes: text("notes"),
  documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Project History Events table (meetings, emails, calls, notes)
export const projectHistoryEvents = pgTable("project_history_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  eventType: historyEventTypeEnum("event_type").notNull().default("note"),
  occurredAt: timestamp("occurred_at").notNull(),
  summary: text("summary").notNull(),
  details: text("details"),
  linkedDocumentId: integer("linked_document_id").references(() => documents.id, { onDelete: "set null" }),
  createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Meeting Requests table (calls and video meetings)
export const meetingRequests = pgTable("meeting_requests", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  contactSubmissionId: integer("contact_submission_id").references(() => contactSubmissions.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company"),
  meetingType: meetingTypeEnum("meeting_type").notNull().default("call"),
  requestedDate: date("requested_date").notNull(),
  requestedTime: text("requested_time").notNull(),
  duration: integer("duration").notNull().default(30),
  status: meetingStatusEnum("status").notNull().default("requested"),
  adminNotes: text("admin_notes"),
  secureToken: text("secure_token").notNull(),
  decidedByUserId: integer("decided_by_user_id").references(() => users.id),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Meeting Proposals table (alternate time proposals)
export const meetingProposals = pgTable("meeting_proposals", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  meetingRequestId: integer("meeting_request_id").notNull().references(() => meetingRequests.id, { onDelete: "cascade" }),
  proposedDate: date("proposed_date").notNull(),
  proposedTime: text("proposed_time").notNull(),
  duration: integer("duration").notNull().default(30),
  accepted: boolean("accepted").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Calendar Blocks table (time blocks for availability)
export const calendarBlocks = pgTable("calendar_blocks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  source: calendarBlockSourceEnum("source").notNull().default("manual"),
  title: text("title"),
  officeDayRequestId: integer("office_day_request_id").references(() => officeDayRequests.id, { onDelete: "set null" }),
  meetingRequestId: integer("meeting_request_id").references(() => meetingRequests.id, { onDelete: "set null" }),
  googleEventId: text("google_event_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Google Calendar Accounts table (OAuth tokens for sync)
export const googleCalendarAccounts = pgTable("google_calendar_accounts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  refreshToken: text("refresh_token").notNull(),
  accessToken: text("access_token"),
  tokenExpiry: timestamp("token_expiry"),
  calendarId: text("calendar_id").notNull().default("primary"),
  syncCursor: text("sync_cursor"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Hosting Terms table (admin-only internal reference)
export const hostingTerms = pgTable("hosting_terms", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  contentMarkdown: text("content_markdown").notNull(),
  updatedByUserId: integer("updated_by_user_id").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Project Hosting Terms table (per-project hosting/maintenance agreements)
export const projectHostingTerms = pgTable("project_hosting_terms", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }).unique(),
  status: hostingTermsStatusEnum("status").notNull().default("draft"),
  startDate: date("start_date"),
  initialTermMonths: integer("initial_term_months").notNull().default(6),
  monthlyFeeCents: integer("monthly_fee_cents"),
  currency: text("currency").notNull().default("USD"),
  billedInAdvance: boolean("billed_in_advance").notNull().default(true),
  invoiceDueDays: integer("invoice_due_days").notNull().default(14),
  includedServices: text("included_services"),
  excludedServices: text("excluded_services"),
  clientResponsibilities: text("client_responsibilities"),
  availabilityDisclaimer: text("availability_disclaimer"),
  termExtensionNotes: text("term_extension_notes"),
  selfHostingHandoverNotes: text("self_hosting_handover_notes"),
  ipNotes: text("ip_notes"),
  confidentialityNotes: text("confidentiality_notes"),
  liabilityCapNotes: text("liability_cap_notes"),
  forceMajeureNotes: text("force_majeure_notes"),
  maintenanceBudgetCents: integer("maintenance_budget_cents"), // Monthly budget for agent/maintenance work
  maintenanceBudgetMinutes: integer("maintenance_budget_minutes"), // Monthly time budget in minutes
  maintenanceTermsNotes: text("maintenance_terms_notes"), // Clarifies what maintenance time is included and overage rates
  maintenancePrompts: text("maintenance_prompts"), // Prompts/instructions for AI maintenance work
  currentCycleStartDate: date("current_cycle_start_date"), // Start date of current billing cycle for maintenance tracking
  governingLaw: text("governing_law").notNull().default("Hong Kong SAR"),
  terminationNoticeDays: integer("termination_notice_days").notNull().default(30),
  agreementFullText: text("agreement_full_text"),
  agreementDocumentId: integer("agreement_document_id").references(() => documents.id, { onDelete: "set null" }),
  updatedByUserId: integer("updated_by_user_id").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Generated Contracts table
export const generatedContracts = pgTable("generated_contracts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  contractType: contractTypeEnum("contract_type").notNull(),
  referenceNumber: text("reference_number").notNull(),
  clientName: text("client_name").notNull(),
  projectName: text("project_name").notNull(),
  startDate: date("start_date"),
  deliveryDeadline: date("delivery_deadline"),
  totalAmount: integer("total_amount_cents"),
  currency: text("currency").notNull().default("USD"),
  monthlyHostingFee: integer("monthly_hosting_fee_cents"),
  minHostingMonths: integer("min_hosting_months").default(6),
  scopeOfWork: text("scope_of_work"),
  milestonesJson: jsonb("milestones_json"),
  governingLaw: text("governing_law").notNull().default("Hong Kong SAR"),
  warrantyDays: integer("warranty_days").default(30),
  pdfPath: text("pdf_path"),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Reminders table (for meeting and office day notifications)
export const reminders = pgTable("reminders", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  reminderType: reminderTypeEnum("reminder_type").notNull(),
  entityId: integer("entity_id").notNull(),
  recipientType: reminderRecipientEnum("recipient_type").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  recipientWhatsapp: text("recipient_whatsapp"),
  channel: reminderChannelEnum("channel").notNull().default("email"),
  sendAt: timestamp("send_at").notNull(),
  sentAt: timestamp("sent_at"),
  status: reminderStatusEnum("status").notNull().default("pending"),
  lastError: text("last_error"),
  retryCount: integer("retry_count").notNull().default(0),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Recurring Payments table (for hosting monthly subscriptions)
export const recurringPayments = pgTable("recurring_payments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  paymentDay: integer("payment_day").notNull(), // 1-31
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  isActive: boolean("is_active").notNull().default(true),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  lastProcessedDate: date("last_processed_date"),
  nextPaymentDate: date("next_payment_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Hosting invoice status enum
export const hostingInvoiceStatusEnum = pgEnum("hosting_invoice_status", ["pending", "paid", "overdue", "cancelled"]);

// Hosting Invoices table (for multi-project hosting invoices)
export const hostingInvoices = pgTable("hosting_invoices", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date").notNull(),
  totalAmountCents: integer("total_amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: hostingInvoiceStatusEnum("status").notNull().default("pending"),
  billingPeriod: text("billing_period"),
  notes: text("notes"),
  pdfPath: text("pdf_path"),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  // Email reminder tracking
  reminderCount: integer("reminder_count").notNull().default(0),
  lastReminderSent: timestamp("last_reminder_sent"),
  cancelledReminders: integer("cancelled_reminders").array().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Hosting Invoice Line Items table
export const hostingInvoiceLineItems = pgTable("hosting_invoice_line_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  invoiceId: integer("invoice_id").notNull().references(() => hostingInvoices.id, { onDelete: "cascade" }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  projectName: text("project_name").notNull(),
  amountCents: integer("amount_cents").notNull(),
  description: text("description"),
});

// Payment Settings table (singleton for invoice configuration)
export const paymentSettings = pgTable("payment_settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  // Bank Transfer (international / SWIFT)
  bankName: text("bank_name"),
  accountHolderName: text("account_holder_name"),
  accountNumber: text("account_number"),
  routingNumber: text("routing_number"),
  swiftCode: text("swift_code"),
  iban: text("iban"),
  // UK Bank (HSBC / Revolut etc.) — sort code + 8-digit account number.
  // Rendered as a separate "UK Bank Transfer" block on invoices when set.
  ukBankName: text("uk_bank_name"),
  ukAccountHolderName: text("uk_account_holder_name"),
  ukAccountNumber: text("uk_account_number"),
  ukSortCode: text("uk_sort_code"),
  // Digital Payments
  paypalEmail: text("paypal_email"),
  venmoUsername: text("venmo_username"),
  cashappTag: text("cashapp_tag"),
  zelleEmail: text("zelle_email"),
  stripePaymentLink: text("stripe_payment_link"),
  // Crypto
  bitcoinAddress: text("bitcoin_address"),
  ethereumAddress: text("ethereum_address"),
  // Check Payments
  checkPayableTo: text("check_payable_to"),
  mailingAddress: text("mailing_address"),
  // Notes & Currency
  paymentNotes: text("payment_notes"),
  defaultCurrency: text("default_currency").notNull().default("USD"),
  usdToHkdRate: decimal("usd_to_hkd_rate", { precision: 10, scale: 4 }).notNull().default("7.8000"),
  // Manual per-currency overrides for the static FX rates in
  // shared/currency.ts. Map of ISO 4217 code → USD-to-X rate. PDFs
  // resolve in order: fxRates (manual) → fxRatesAuto (daily refresh)
  // → DEFAULT_USD_FX_RATES (static).
  fxRates: jsonb("fx_rates").$type<Record<string, number>>().default({}),
  // Auto-refreshed daily from a free FX feed (Frankfurter / ECB).
  // Never edited by the user directly.
  fxRatesAuto: jsonb("fx_rates_auto").$type<Record<string, number>>().default({}),
  fxRatesAutoUpdatedAt: timestamp("fx_rates_auto_updated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  client: one(clients, {
    fields: [users.clientId],
    references: [clients.id],
  }),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  users: many(users),
  contacts: many(contacts),
  projects: many(projects),
  officeDayRequests: many(officeDayRequests),
  documents: many(documents),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  client: one(clients, {
    fields: [contacts.clientId],
    references: [clients.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, {
    fields: [projects.clientId],
    references: [clients.id],
  }),
  officeDayRequests: many(officeDayRequests),
  milestones: many(milestones),
  documents: many(documents),
  processSteps: many(projectProcessSteps),
  prompts: many(projectPrompts),
  agreements: many(projectAgreements),
  recurringPayments: many(recurringPayments),
}));

export const recurringPaymentsRelations = relations(recurringPayments, ({ one }) => ({
  project: one(projects, {
    fields: [recurringPayments.projectId],
    references: [projects.id],
  }),
}));

export const hostingInvoicesRelations = relations(hostingInvoices, ({ one, many }) => ({
  client: one(clients, {
    fields: [hostingInvoices.clientId],
    references: [clients.id],
  }),
  createdBy: one(users, {
    fields: [hostingInvoices.createdByUserId],
    references: [users.id],
  }),
  lineItems: many(hostingInvoiceLineItems),
}));

export const hostingInvoiceLineItemsRelations = relations(hostingInvoiceLineItems, ({ one }) => ({
  invoice: one(hostingInvoices, {
    fields: [hostingInvoiceLineItems.invoiceId],
    references: [hostingInvoices.id],
  }),
  project: one(projects, {
    fields: [hostingInvoiceLineItems.projectId],
    references: [projects.id],
  }),
}));

export const projectProcessStepsRelations = relations(projectProcessSteps, ({ one }) => ({
  project: one(projects, {
    fields: [projectProcessSteps.projectId],
    references: [projects.id],
  }),
}));

export const projectPromptsRelations = relations(projectPrompts, ({ one }) => ({
  project: one(projects, {
    fields: [projectPrompts.projectId],
    references: [projects.id],
  }),
  createdBy: one(users, {
    fields: [projectPrompts.createdByUserId],
    references: [users.id],
  }),
}));

export const projectAgreementsRelations = relations(projectAgreements, ({ one }) => ({
  project: one(projects, {
    fields: [projectAgreements.projectId],
    references: [projects.id],
  }),
  document: one(documents, {
    fields: [projectAgreements.documentId],
    references: [documents.id],
  }),
}));

export const projectHistoryEventsRelations = relations(projectHistoryEvents, ({ one }) => ({
  project: one(projects, {
    fields: [projectHistoryEvents.projectId],
    references: [projects.id],
  }),
  linkedDocument: one(documents, {
    fields: [projectHistoryEvents.linkedDocumentId],
    references: [documents.id],
  }),
  createdBy: one(users, {
    fields: [projectHistoryEvents.createdByUserId],
    references: [users.id],
  }),
}));

export const meetingRequestsRelations = relations(meetingRequests, ({ one, many }) => ({
  client: one(clients, {
    fields: [meetingRequests.clientId],
    references: [clients.id],
  }),
  project: one(projects, {
    fields: [meetingRequests.projectId],
    references: [projects.id],
  }),
  contactSubmission: one(contactSubmissions, {
    fields: [meetingRequests.contactSubmissionId],
    references: [contactSubmissions.id],
  }),
  decidedBy: one(users, {
    fields: [meetingRequests.decidedByUserId],
    references: [users.id],
  }),
  proposals: many(meetingProposals),
}));

export const meetingProposalsRelations = relations(meetingProposals, ({ one }) => ({
  meetingRequest: one(meetingRequests, {
    fields: [meetingProposals.meetingRequestId],
    references: [meetingRequests.id],
  }),
}));

export const calendarBlocksRelations = relations(calendarBlocks, ({ one }) => ({
  officeDayRequest: one(officeDayRequests, {
    fields: [calendarBlocks.officeDayRequestId],
    references: [officeDayRequests.id],
  }),
  meetingRequest: one(meetingRequests, {
    fields: [calendarBlocks.meetingRequestId],
    references: [meetingRequests.id],
  }),
}));

export const googleCalendarAccountsRelations = relations(googleCalendarAccounts, ({ one }) => ({
  user: one(users, {
    fields: [googleCalendarAccounts.userId],
    references: [users.id],
  }),
}));

export const officeDayRequestsRelations = relations(officeDayRequests, ({ one }) => ({
  client: one(clients, {
    fields: [officeDayRequests.clientId],
    references: [clients.id],
  }),
  project: one(projects, {
    fields: [officeDayRequests.projectId],
    references: [projects.id],
  }),
  requestedBy: one(users, {
    fields: [officeDayRequests.requestedByUserId],
    references: [users.id],
  }),
  decidedBy: one(users, {
    fields: [officeDayRequests.decidedByUserId],
    references: [users.id],
  }),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  project: one(projects, {
    fields: [milestones.projectId],
    references: [projects.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  client: one(clients, {
    fields: [documents.clientId],
    references: [clients.id],
  }),
  project: one(projects, {
    fields: [documents.projectId],
    references: [projects.id],
  }),
  uploadedBy: one(users, {
    fields: [documents.uploadedByUserId],
    references: [users.id],
  }),
}));

export const activityEventsRelations = relations(activityEvents, ({ one }) => ({
  createdBy: one(users, {
    fields: [activityEvents.createdByUserId],
    references: [users.id],
  }),
}));

export const projectHostingTermsRelations = relations(projectHostingTerms, ({ one }) => ({
  project: one(projects, {
    fields: [projectHostingTerms.projectId],
    references: [projects.id],
  }),
  updatedBy: one(users, {
    fields: [projectHostingTerms.updatedByUserId],
    references: [users.id],
  }),
  agreementDocument: one(documents, {
    fields: [projectHostingTerms.agreementDocumentId],
    references: [documents.id],
  }),
}));

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true });
export const insertContactSchema = createInsertSchema(contacts).omit({ id: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });
export const insertAvailabilityRulesSchema = createInsertSchema(availabilityRules).omit({ id: true });
export const insertAvailabilityBlockSchema = createInsertSchema(availabilityBlocks).omit({ id: true });
export const insertOfficeDayRequestSchema = createInsertSchema(officeDayRequests).omit({ id: true, createdAt: true, decidedByUserId: true, decidedAt: true });
export const insertMilestoneSchema = createInsertSchema(milestones).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, uploadedAt: true });
export const insertActivityEventSchema = createInsertSchema(activityEvents).omit({ id: true, createdAt: true });
export const insertContactSubmissionSchema = createInsertSchema(contactSubmissions).omit({ id: true, createdAt: true });
export const insertProjectProcessStepSchema = createInsertSchema(projectProcessSteps).omit({ id: true, createdAt: true });
export const insertProjectPromptSchema = createInsertSchema(projectPrompts).omit({ id: true, createdAt: true });
export const insertProjectAgreementSchema = createInsertSchema(projectAgreements).omit({ id: true, createdAt: true });
export const insertProjectHistoryEventSchema = createInsertSchema(projectHistoryEvents).omit({ id: true, createdAt: true });
export const insertCalendarBlockSchema = createInsertSchema(calendarBlocks).omit({ id: true, createdAt: true });
export const insertGoogleCalendarAccountSchema = createInsertSchema(googleCalendarAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMeetingRequestSchema = createInsertSchema(meetingRequests).omit({ id: true, createdAt: true, decidedByUserId: true, decidedAt: true });
export const insertMeetingProposalSchema = createInsertSchema(meetingProposals).omit({ id: true, createdAt: true });
export const insertReminderSchema = createInsertSchema(reminders).omit({ id: true, createdAt: true, sentAt: true, retryCount: true });
export const insertHostingTermsSchema = createInsertSchema(hostingTerms).omit({ id: true, updatedAt: true });
export const insertProjectHostingTermsSchema = createInsertSchema(projectHostingTerms).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGeneratedContractSchema = createInsertSchema(generatedContracts).omit({ id: true, createdAt: true });
export const insertRecurringPaymentSchema = createInsertSchema(recurringPayments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertHostingInvoiceSchema = createInsertSchema(hostingInvoices).omit({ id: true, createdAt: true, updatedAt: true });
export const insertHostingInvoiceLineItemSchema = createInsertSchema(hostingInvoiceLineItems).omit({ id: true });
export const insertPaymentSettingsSchema = createInsertSchema(paymentSettings).omit({ id: true, createdAt: true, updatedAt: true });

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type AvailabilityRules = typeof availabilityRules.$inferSelect;
export type InsertAvailabilityRules = z.infer<typeof insertAvailabilityRulesSchema>;
export type AvailabilityBlock = typeof availabilityBlocks.$inferSelect;
export type InsertAvailabilityBlock = z.infer<typeof insertAvailabilityBlockSchema>;
export type OfficeDayRequest = typeof officeDayRequests.$inferSelect;
export type InsertOfficeDayRequest = z.infer<typeof insertOfficeDayRequestSchema>;
export type Milestone = typeof milestones.$inferSelect;
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type ActivityEvent = typeof activityEvents.$inferSelect;
export type InsertActivityEvent = z.infer<typeof insertActivityEventSchema>;
export type ContactSubmission = typeof contactSubmissions.$inferSelect;
export type InsertContactSubmission = z.infer<typeof insertContactSubmissionSchema>;
export type ProjectProcessStep = typeof projectProcessSteps.$inferSelect;
export type InsertProjectProcessStep = z.infer<typeof insertProjectProcessStepSchema>;
export type ProjectPrompt = typeof projectPrompts.$inferSelect;
export type InsertProjectPrompt = z.infer<typeof insertProjectPromptSchema>;
export type ProjectAgreement = typeof projectAgreements.$inferSelect;
export type InsertProjectAgreement = z.infer<typeof insertProjectAgreementSchema>;
export type ProjectHistoryEvent = typeof projectHistoryEvents.$inferSelect;
export type InsertProjectHistoryEvent = z.infer<typeof insertProjectHistoryEventSchema>;
export type CalendarBlock = typeof calendarBlocks.$inferSelect;
export type InsertCalendarBlock = z.infer<typeof insertCalendarBlockSchema>;
export type GoogleCalendarAccount = typeof googleCalendarAccounts.$inferSelect;
export type InsertGoogleCalendarAccount = z.infer<typeof insertGoogleCalendarAccountSchema>;
export type MeetingRequest = typeof meetingRequests.$inferSelect;
export type InsertMeetingRequest = z.infer<typeof insertMeetingRequestSchema>;
export type MeetingProposal = typeof meetingProposals.$inferSelect;
export type InsertMeetingProposal = z.infer<typeof insertMeetingProposalSchema>;
export type Reminder = typeof reminders.$inferSelect;
export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type HostingTerms = typeof hostingTerms.$inferSelect;
export type InsertHostingTerms = z.infer<typeof insertHostingTermsSchema>;
export type ProjectHostingTerms = typeof projectHostingTerms.$inferSelect;
export type InsertProjectHostingTerms = z.infer<typeof insertProjectHostingTermsSchema>;
export type GeneratedContract = typeof generatedContracts.$inferSelect;
export type InsertGeneratedContract = z.infer<typeof insertGeneratedContractSchema>;
export type RecurringPayment = typeof recurringPayments.$inferSelect;
export type InsertRecurringPayment = z.infer<typeof insertRecurringPaymentSchema>;
export type HostingInvoice = typeof hostingInvoices.$inferSelect;
export type InsertHostingInvoice = z.infer<typeof insertHostingInvoiceSchema>;
export type HostingInvoiceLineItem = typeof hostingInvoiceLineItems.$inferSelect;
export type InsertHostingInvoiceLineItem = z.infer<typeof insertHostingInvoiceLineItemSchema>;
export type PaymentSettings = typeof paymentSettings.$inferSelect;
export type InsertPaymentSettings = z.infer<typeof insertPaymentSettingsSchema>;

// Extended types for frontend use
export type RecurringPaymentWithProject = RecurringPayment & { project: Project & { client: Client } };
export type ProjectWithClient = Project & { client: Client };
export type ProjectWithMilestones = Project & { milestones: Milestone[] };
export type OfficeDayRequestWithDetails = OfficeDayRequest & { 
  client: Client; 
  project: Project;
  requestedBy: User;
};
export type DocumentWithDetails = Document & {
  client: Client;
  project?: Project | null;
  uploadedBy: User;
};
export type ActivityEventWithUser = ActivityEvent & { createdBy?: User | null };
export type HostingInvoiceWithDetails = HostingInvoice & { 
  client: Client;
  lineItems: HostingInvoiceLineItem[];
  createdBy?: User | null;
};

// ============================================
// Crypto Tracker Schema
// ============================================

export const alertTypeEnum = pgEnum("alert_type", [
  "price_above", "price_below", "percent_increase", "percent_decrease"
]);

export const alertStatusEnum = pgEnum("alert_status", [
  "active", "triggered", "disabled"
]);

// Tracked Coins table
export const trackedCoins = pgTable("tracked_coins", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  coinId: varchar("coin_id", { length: 100 }).notNull().unique(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  blockchain: varchar("blockchain", { length: 20 }).default("coingecko"),
  isActive: boolean("is_active").default(true),
  checkIntervalMinutes: integer("check_interval_minutes").default(15),
  iconUrl: text("icon_url"),
  addedAt: timestamp("added_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Price Alerts table
export const priceAlerts = pgTable("price_alerts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  coinId: varchar("coin_id", { length: 50 }).notNull().references(() => trackedCoins.coinId, { onDelete: "cascade" }),
  alertType: alertTypeEnum("alert_type").notNull(),
  targetPrice: decimal("target_price", { precision: 20, scale: 8 }),
  percentChange: decimal("percent_change", { precision: 5, scale: 2 }),
  timeframeHours: integer("timeframe_hours").default(24),
  status: alertStatusEnum("status").default("active"),
  triggeredAt: timestamp("triggered_at"),
  triggerPrice: decimal("trigger_price", { precision: 20, scale: 8 }),
  notifySms: boolean("notify_sms").default(false),
  notifyWhatsapp: boolean("notify_whatsapp").default(true),
  notificationSent: boolean("notification_sent").default(false),
  label: varchar("label", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Price History table
export const priceHistory = pgTable("price_history", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  coinId: varchar("coin_id", { length: 50 }).notNull().references(() => trackedCoins.coinId, { onDelete: "cascade" }),
  priceUsd: decimal("price_usd", { precision: 20, scale: 8 }).notNull(),
  priceHkd: decimal("price_hkd", { precision: 20, scale: 8 }),
  marketCap: decimal("market_cap", { precision: 30, scale: 0 }),
  volume24h: decimal("volume_24h", { precision: 30, scale: 0 }),
  percentChange1h: decimal("percent_change_1h", { precision: 10, scale: 4 }),
  percentChange24h: decimal("percent_change_24h", { precision: 10, scale: 4 }),
  percentChange7d: decimal("percent_change_7d", { precision: 10, scale: 4 }),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

// Coin News table
export const coinNews = pgTable("coin_news", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  coinId: varchar("coin_id", { length: 50 }).notNull().references(() => trackedCoins.coinId, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url").notNull().unique(),
  sourceName: varchar("source_name", { length: 100 }),
  author: varchar("author", { length: 255 }),
  imageUrl: text("image_url"),
  contentSnippet: text("content_snippet"),
  publishedAt: timestamp("published_at"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  relevanceScore: decimal("relevance_score", { precision: 3, scale: 2 }),
  sentiment: varchar("sentiment", { length: 20 }),
});

// Maintenance Logs table (for tracking time/cost spent on projects)
export const maintenanceLogs = pgTable("maintenance_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  logDate: date("log_date").notNull(),
  minutesSpent: integer("minutes_spent").notNull(),
  description: text("description").notNull(),
  estimatedCostCents: integer("estimated_cost_cents"),
  category: text("category"), // e.g., "bug_fix", "update", "monitoring", "support"
  logType: text("log_type").default("hosting").notNull(), // "hosting" or "development"
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Maintenance Log Costs table (multiple cost entries per maintenance log)
export const maintenanceLogCosts = pgTable("maintenance_log_costs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  maintenanceLogId: integer("maintenance_log_id").notNull().references(() => maintenanceLogs.id, { onDelete: "cascade" }),
  costCents: integer("cost_cents").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Crypto Notification Settings table
export const cryptoNotificationSettings = pgTable("crypto_notification_settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  recipientPhoneNumber: varchar("recipient_phone_number", { length: 20 }),
  recipientWhatsappNumber: varchar("recipient_whatsapp_number", { length: 20 }),
  enableSms: boolean("enable_sms").default(true),
  enableWhatsapp: boolean("enable_whatsapp").default(true),
  quietHoursStart: varchar("quiet_hours_start", { length: 5 }), // HH:MM format
  quietHoursEnd: varchar("quiet_hours_end", { length: 5 }),
  maxNotificationsPerHour: integer("max_notifications_per_hour").default(10),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Crypto tracker insert schemas
export const insertTrackedCoinSchema = createInsertSchema(trackedCoins).omit({ id: true, createdAt: true, updatedAt: true, addedAt: true });
export const insertPriceAlertSchema = createInsertSchema(priceAlerts).omit({ id: true, createdAt: true, updatedAt: true, triggeredAt: true, triggerPrice: true, notificationSent: true });
export const insertPriceHistorySchema = createInsertSchema(priceHistory).omit({ id: true, recordedAt: true });
export const insertCoinNewsSchema = createInsertSchema(coinNews).omit({ id: true, fetchedAt: true });
export const insertCryptoNotificationSettingsSchema = createInsertSchema(cryptoNotificationSettings).omit({ id: true, createdAt: true, updatedAt: true });

// Crypto tracker types
export type TrackedCoin = typeof trackedCoins.$inferSelect;
export type InsertTrackedCoin = z.infer<typeof insertTrackedCoinSchema>;
export type PriceAlert = typeof priceAlerts.$inferSelect;
export type InsertPriceAlert = z.infer<typeof insertPriceAlertSchema>;
export type PriceHistory = typeof priceHistory.$inferSelect;
export type InsertPriceHistory = z.infer<typeof insertPriceHistorySchema>;
export type CoinNews = typeof coinNews.$inferSelect;
export type InsertCoinNews = z.infer<typeof insertCoinNewsSchema>;
export type CryptoNotificationSettings = typeof cryptoNotificationSettings.$inferSelect;
export type InsertCryptoNotificationSettings = z.infer<typeof insertCryptoNotificationSettingsSchema>;

// Replit Charges table (for tracking actual Replit billing to reconcile against maintenance logs)
export const replitCharges = pgTable("replit_charges", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  chargeDate: date("charge_date").notNull(),
  amountCents: integer("amount_cents").notNull(),
  description: text("description"),
  billingMonth: integer("billing_month").notNull(),
  billingYear: integer("billing_year").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Maintenance logs insert schema and types
export const insertMaintenanceLogSchema = createInsertSchema(maintenanceLogs).omit({ id: true, createdAt: true });
export type MaintenanceLog = typeof maintenanceLogs.$inferSelect;
export type InsertMaintenanceLog = z.infer<typeof insertMaintenanceLogSchema>;

// Maintenance log costs insert schema and types
export const insertMaintenanceLogCostSchema = createInsertSchema(maintenanceLogCosts).omit({ id: true, createdAt: true });
export type MaintenanceLogCost = typeof maintenanceLogCosts.$inferSelect;
export type InsertMaintenanceLogCost = z.infer<typeof insertMaintenanceLogCostSchema>;

// Replit charges insert schema and types
export const insertReplitChargeSchema = createInsertSchema(replitCharges).omit({ id: true, createdAt: true });
export type ReplitCharge = typeof replitCharges.$inferSelect;
export type InsertReplitCharge = z.infer<typeof insertReplitChargeSchema>;

// Lead Engine — Audits (one row per company audited)
export const leadAudits = pgTable("lead_audits", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  domain: text("domain").notNull().unique(),
  location: text("location"),
  industry: text("industry"),
  auditUrl: text("audit_url"),
  htmlContent: text("html_content"),
  channel: text("channel").notNull().default("manual"),
  status: text("status").notNull().default("draft"),
  contactedAt: timestamp("contacted_at").defaultNow().notNull(),
});
export const insertLeadAuditSchema = createInsertSchema(leadAudits).omit({ id: true, contactedAt: true });
export type LeadAudit = typeof leadAudits.$inferSelect;
export type InsertLeadAudit = z.infer<typeof insertLeadAuditSchema>;

// Lead Engine — Drafts / Sent emails (one row per outreach message)
export const leadDrafts = pgTable("lead_drafts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  company: text("company").notNull(),
  domain: text("domain"),
  email: text("email"),
  instagram: text("instagram"),
  whatsapp: text("whatsapp"),
  auditUrl: text("audit_url"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  sent: boolean("sent").notNull().default(false),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertLeadDraftSchema = createInsertSchema(leadDrafts).omit({ id: true, createdAt: true });
export type LeadDraft = typeof leadDrafts.$inferSelect;
export type InsertLeadDraft = z.infer<typeof insertLeadDraftSchema>;

export const leadEngineSettings = pgTable("lead_engine_settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  industries: text("industries").array().notNull().default(sql`ARRAY[]::text[]`),
  signals: text("signals").array().notNull().default(sql`ARRAY[]::text[]`),
  exclusions: text("exclusions").array().notNull().default(sql`ARRAY[]::text[]`),
  count: integer("count").notNull().default(5),
  fromEmail: text("from_email").notNull().default("joshuad@jdcoredev.com"),
  replyTo: text("reply_to").notNull().default("joshuad@jdcoredev.com"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Referral partner inserts
export const insertReferralPartnerSchema = createInsertSchema(referralPartners).omit({ id: true, createdAt: true, updatedAt: true });
export type ReferralPartner = typeof referralPartners.$inferSelect;
export type InsertReferralPartner = z.infer<typeof insertReferralPartnerSchema>;

export const insertProjectCostSchema = createInsertSchema(projectCosts).omit({ id: true, createdAt: true });
export type ProjectCost = typeof projectCosts.$inferSelect;
export type InsertProjectCost = z.infer<typeof insertProjectCostSchema>;

export const insertCommissionEntrySchema = createInsertSchema(commissionEntries).omit({ id: true, createdAt: true, updatedAt: true });
export type CommissionEntry = typeof commissionEntries.$inferSelect;
export type InsertCommissionEntry = z.infer<typeof insertCommissionEntrySchema>;

// Aggregated views used by the partner dashboard.
export type CommissionEntryWithRefs = CommissionEntry & {
  partner: ReferralPartner;
  client: Client;
  project?: Project | null;
};

export type ReferralPartnerSummary = ReferralPartner & {
  activeClientCount: number;
  activeProjectCount: number;
  totalAccruedCents: number;
  totalPaidCents: number;
  totalDueCents: number;
};
