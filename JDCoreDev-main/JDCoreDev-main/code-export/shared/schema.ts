import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, date, jsonb, pgEnum } from "drizzle-orm/pg-core";
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
  name: text("name").notNull(),
  description: text("description"),
  status: projectStatusEnum("status").notNull().default("lead"),
  billingModel: billingModelEnum("billing_model").notNull().default("fixed"),
  riskState: riskStateEnum("risk_state").notNull().default("on_track"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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

// Extended types for frontend use
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
