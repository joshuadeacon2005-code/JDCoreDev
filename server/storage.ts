import { eq, desc, and, or, ne, gte, lte, sql, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  users, clients, contacts, projects, availabilityRules, availabilityBlocks,
  officeDayRequests, milestones, documents, activityEvents, contactSubmissions,
  projectProcessSteps, projectPrompts, projectAgreements, projectHistoryEvents,
  calendarBlocks, googleCalendarAccounts, meetingRequests, meetingProposals, reminders,
  hostingTerms, projectHostingTerms, generatedContracts, recurringPayments,
  hostingInvoices, hostingInvoiceLineItems, paymentSettings, maintenanceLogs, maintenanceLogCosts,
  type User, type InsertUser, type Client, type InsertClient,
  type Contact, type InsertContact, type Project, type InsertProject,
  type AvailabilityRules, type InsertAvailabilityRules,
  type AvailabilityBlock, type InsertAvailabilityBlock,
  type OfficeDayRequest, type InsertOfficeDayRequest,
  type Milestone, type InsertMilestone,
  type Document, type InsertDocument,
  type ActivityEvent, type InsertActivityEvent,
  type ContactSubmission, type InsertContactSubmission,
  type ProjectProcessStep, type InsertProjectProcessStep,
  type ProjectPrompt, type InsertProjectPrompt,
  type ProjectAgreement, type InsertProjectAgreement,
  type ProjectHistoryEvent, type InsertProjectHistoryEvent,
  type CalendarBlock, type InsertCalendarBlock,
  type GoogleCalendarAccount, type InsertGoogleCalendarAccount,
  type MeetingRequest, type InsertMeetingRequest,
  type MeetingProposal, type InsertMeetingProposal,
  type Reminder, type InsertReminder,
  type HostingTerms, type InsertHostingTerms,
  type ProjectHostingTerms, type InsertProjectHostingTerms,
  type GeneratedContract, type InsertGeneratedContract,
  type RecurringPayment, type InsertRecurringPayment,
  type RecurringPaymentWithProject,
  type HostingInvoice, type InsertHostingInvoice,
  type HostingInvoiceLineItem, type InsertHostingInvoiceLineItem,
  type PaymentSettings, type InsertPaymentSettings,
  type MaintenanceLog, type InsertMaintenanceLog,
  type MaintenanceLogCost, type InsertMaintenanceLogCost,
  replitCharges, type ReplitCharge, type InsertReplitCharge,
  leadAudits, type LeadAudit, type InsertLeadAudit,
  leadDrafts, type LeadDraft, type InsertLeadDraft,
  leadEngineSettings,
  referralPartners, type ReferralPartner, type InsertReferralPartner,
  projectCosts, type ProjectCost, type InsertProjectCost,
  commissionEntries, type CommissionEntry, type InsertCommissionEntry,
  type ReferralPartnerSummary,
} from "@shared/schema";


export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmailOrUsername(identifier: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  hasAdminUser(): Promise<boolean>;

  // Clients
  getClients(): Promise<Client[]>;
  getClient(id: number): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: number, data: Partial<InsertClient>): Promise<Client | undefined>;

  // Contacts
  getContactsByClient(clientId: number): Promise<Contact[]>;
  getContact(id: number): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: number, data: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: number): Promise<void>;

  // Projects
  getProjects(): Promise<Project[]>;
  getProjectsByClient(clientId: number): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, data: Partial<InsertProject>): Promise<Project | undefined>;
  getSubProjects(parentId: number): Promise<Project[]>;

  // Availability Rules
  getAvailabilityRules(): Promise<AvailabilityRules | undefined>;
  upsertAvailabilityRules(rules: InsertAvailabilityRules): Promise<AvailabilityRules>;

  // Availability Blocks
  getAvailabilityBlocks(): Promise<AvailabilityBlock[]>;
  createAvailabilityBlock(block: InsertAvailabilityBlock): Promise<AvailabilityBlock>;
  deleteAvailabilityBlock(id: number): Promise<void>;

  // Office Day Requests
  getOfficeDayRequests(): Promise<OfficeDayRequest[]>;
  getOfficeDayRequest(id: number): Promise<OfficeDayRequest | undefined>;
  getOfficeDayRequestById(id: number): Promise<OfficeDayRequest | undefined>;
  getOfficeDayRequestsByClient(clientId: number): Promise<OfficeDayRequest[]>;
  createOfficeDayRequest(request: InsertOfficeDayRequest): Promise<OfficeDayRequest>;
  updateOfficeDayRequest(id: number, data: Partial<OfficeDayRequest>): Promise<OfficeDayRequest | undefined>;

  // Milestones
  getMilestones(): Promise<Milestone[]>;
  getMilestone(id: number): Promise<Milestone | undefined>;
  getMilestonesByProject(projectId: number): Promise<Milestone[]>;
  getMilestonesByClient(clientId: number): Promise<Milestone[]>;
  createMilestone(milestone: InsertMilestone): Promise<Milestone>;
  updateMilestone(id: number, data: Partial<InsertMilestone> & { reminderCount?: number; lastReminderSent?: Date | null }): Promise<Milestone | undefined>;
  deleteMilestone(id: number): Promise<void>;
  getInvoicedMilestonesWithDetails(): Promise<(Milestone & { project: Project; client: Client })[]>;
  getAllMilestonesWithClients(): Promise<(Milestone & { project: Project; client: Client })[]>;
  getUnpaidMilestonesForReminders(): Promise<(Milestone & { project: Project; client: Client })[]>;

  // Documents
  getDocuments(): Promise<Document[]>;
  getDocumentsByClient(clientId: number): Promise<Document[]>;
  createDocument(doc: InsertDocument): Promise<Document>;
  deleteDocument(id: number): Promise<void>;

  // Office Day Capacity
  getOfficeDayCountForWeek(date: string): Promise<number>;
  getOfficeDayCountForMonth(year: number, month: number): Promise<number>;

  // Activity Events
  getActivityEvents(limit?: number): Promise<ActivityEvent[]>;
  createActivityEvent(event: InsertActivityEvent): Promise<ActivityEvent>;

  // Contact Submissions
  createContactSubmission(submission: InsertContactSubmission): Promise<ContactSubmission>;

  // Project Process Steps
  getProcessStepsByProject(projectId: number): Promise<ProjectProcessStep[]>;
  createProcessStep(step: InsertProjectProcessStep): Promise<ProjectProcessStep>;
  updateProcessStep(id: number, data: Partial<InsertProjectProcessStep>): Promise<ProjectProcessStep | undefined>;
  deleteProcessStep(id: number): Promise<void>;
  reorderProcessSteps(updates: { id: number; stepOrder: number }[]): Promise<void>;
  getActiveTasksAcrossProjects(): Promise<(ProjectProcessStep & { projectName: string; clientName: string })[]>;

  // Project Prompts
  getPromptsByProject(projectId: number, clientVisible?: boolean): Promise<ProjectPrompt[]>;
  createPrompt(prompt: InsertProjectPrompt): Promise<ProjectPrompt>;
  updatePrompt(id: number, data: Partial<InsertProjectPrompt>): Promise<ProjectPrompt | undefined>;
  deletePrompt(id: number): Promise<void>;

  // Project Agreements
  getAgreementsByProject(projectId: number): Promise<ProjectAgreement[]>;
  createAgreement(agreement: InsertProjectAgreement): Promise<ProjectAgreement>;
  updateAgreement(id: number, data: Partial<InsertProjectAgreement>): Promise<ProjectAgreement | undefined>;
  deleteAgreement(id: number): Promise<void>;

  // Documents by Project
  getDocumentsByProject(projectId: number): Promise<Document[]>;
  getDocument(id: number): Promise<Document | undefined>;

  // Project History Events
  getHistoryEventsByProject(projectId: number): Promise<ProjectHistoryEvent[]>;
  createHistoryEvent(event: InsertProjectHistoryEvent): Promise<ProjectHistoryEvent>;
  updateHistoryEvent(id: number, data: Partial<InsertProjectHistoryEvent>): Promise<ProjectHistoryEvent | undefined>;
  deleteHistoryEvent(id: number): Promise<void>;

  // Calendar Blocks
  getCalendarBlocks(): Promise<CalendarBlock[]>;
  getCalendarBlocksInRange(startAt: Date, endAt: Date): Promise<CalendarBlock[]>;
  createCalendarBlock(block: InsertCalendarBlock): Promise<CalendarBlock>;
  deleteCalendarBlock(id: number): Promise<void>;
  getCalendarBlockByOfficeDayRequest(officeDayRequestId: number): Promise<CalendarBlock | undefined>;

  // Google Calendar Accounts
  getGoogleCalendarAccount(userId: number): Promise<GoogleCalendarAccount | undefined>;
  createGoogleCalendarAccount(account: InsertGoogleCalendarAccount): Promise<GoogleCalendarAccount>;
  updateGoogleCalendarAccount(id: number, data: Partial<InsertGoogleCalendarAccount>): Promise<GoogleCalendarAccount | undefined>;
  deleteGoogleCalendarAccount(id: number): Promise<void>;

  // Meeting Requests
  getMeetingRequests(): Promise<MeetingRequest[]>;
  getMeetingRequest(id: number): Promise<MeetingRequest | undefined>;
  getMeetingRequestByToken(token: string): Promise<MeetingRequest | undefined>;
  createMeetingRequest(request: InsertMeetingRequest): Promise<MeetingRequest>;
  updateMeetingRequest(id: number, data: Partial<MeetingRequest>): Promise<MeetingRequest | undefined>;

  // Meeting Proposals
  getMeetingProposals(meetingRequestId: number): Promise<MeetingProposal[]>;
  getMeetingProposal(id: number): Promise<MeetingProposal | undefined>;
  createMeetingProposal(proposal: InsertMeetingProposal): Promise<MeetingProposal>;
  updateMeetingProposal(id: number, data: Partial<MeetingProposal>): Promise<MeetingProposal | undefined>;

  // Reminders
  getReminders(): Promise<Reminder[]>;
  getPendingReminders(beforeTime: Date): Promise<Reminder[]>;
  getReminderByIdempotencyKey(key: string): Promise<Reminder | undefined>;
  createReminder(reminder: InsertReminder): Promise<Reminder>;
  updateReminder(id: number, data: Partial<Reminder>): Promise<Reminder | undefined>;
  cancelRemindersForEntity(reminderType: string, entityId: number): Promise<void>;

  // Hosting Terms (admin-only)
  getHostingTerms(): Promise<HostingTerms[]>;
  getHostingTerm(id: number): Promise<HostingTerms | undefined>;
  createHostingTerm(term: InsertHostingTerms): Promise<HostingTerms>;
  updateHostingTerm(id: number, data: Partial<InsertHostingTerms>): Promise<HostingTerms | undefined>;

  // Project Hosting Terms (per-project hosting agreements)
  getProjectHostingTerms(projectId: number): Promise<ProjectHostingTerms | undefined>;
  upsertProjectHostingTerms(projectId: number, data: Partial<InsertProjectHostingTerms>): Promise<ProjectHostingTerms>;

  // Generated Contracts
  getGeneratedContracts(projectId: number): Promise<GeneratedContract[]>;
  getGeneratedContract(id: number): Promise<GeneratedContract | undefined>;
  createGeneratedContract(contract: InsertGeneratedContract): Promise<GeneratedContract>;
  deleteGeneratedContract(id: number): Promise<void>;

  // Recurring Payments
  getRecurringPayments(): Promise<RecurringPaymentWithProject[]>;
  getRecurringPayment(id: number): Promise<RecurringPayment | undefined>;
  getRecurringPaymentByProject(projectId: number): Promise<RecurringPayment | undefined>;
  createRecurringPayment(payment: InsertRecurringPayment): Promise<RecurringPayment>;
  updateRecurringPayment(id: number, data: Partial<InsertRecurringPayment>): Promise<RecurringPayment | undefined>;
  deleteRecurringPayment(id: number): Promise<void>;

  // Hosting Invoices
  getHostingInvoices(): Promise<HostingInvoice[]>;
  getHostingInvoicesByClient(clientId: number): Promise<HostingInvoice[]>;
  getHostingInvoice(id: number): Promise<HostingInvoice | undefined>;
  createHostingInvoice(invoice: InsertHostingInvoice): Promise<HostingInvoice>;
  createHostingInvoiceLineItem(item: InsertHostingInvoiceLineItem): Promise<HostingInvoiceLineItem>;
  getNextHostingInvoiceNumber(clientId: number): Promise<string>;
  getHostingProjectsWithTerms(clientId?: number): Promise<(Project & { hostingTerms: ProjectHostingTerms | null })[]>;
  updateHostingInvoice(id: number, data: Partial<InsertHostingInvoice> & { reminderCount?: number; lastReminderSent?: Date | null }): Promise<HostingInvoice | undefined>;
  deleteHostingInvoice(id: number): Promise<void>;
  getUnpaidHostingInvoicesForReminders(): Promise<(HostingInvoice & { client: Client })[]>;
  getAllHostingInvoicesWithDetails(): Promise<(HostingInvoice & { client: Client; lineItems: HostingInvoiceLineItem[] })[]>;

  // Payment Settings
  getPaymentSettings(): Promise<PaymentSettings | undefined>;
  upsertPaymentSettings(settings: Partial<InsertPaymentSettings>): Promise<PaymentSettings>;

  // Maintenance Logs
  getMaintenanceLogs(projectId: number, logType?: string): Promise<MaintenanceLog[]>;
  getMaintenanceLogsByMonth(projectId: number, year: number, month: number, logType?: string): Promise<MaintenanceLog[]>;
  getMaintenanceLogsByDateRange(projectId: number, startDate: string, endDate: string, logType?: string): Promise<MaintenanceLog[]>;
  createMaintenanceLog(log: InsertMaintenanceLog): Promise<MaintenanceLog>;
  updateMaintenanceLog(id: number, data: Partial<InsertMaintenanceLog>): Promise<MaintenanceLog | undefined>;
  deleteMaintenanceLog(id: number): Promise<void>;
  getMaintenanceLogSummary(projectId: number, year: number, month: number, logType?: string): Promise<{ totalMinutes: number; totalCostCents: number }>;
  getMaintenanceLogSummaryByDateRange(projectId: number, startDate: string, endDate: string, logType?: string): Promise<{ totalMinutes: number; totalCostCents: number }>;
  getMaintenanceLogAllTimeSummary(projectId: number, logType?: string): Promise<{ totalMinutes: number; totalCostCents: number }>;

  getClientDevSummary(clientId: number, cycleSince?: string): Promise<{
    totalMinutes: number;
    totalCostCents: number;
    totalBudgetCents: number;
    totalBudgetMinutes: number;
    cycleMinutes: number;
    cycleCostCents: number;
    cycleSince: string;
    byProject: Array<{
      projectId: number;
      projectName: string;
      totalMinutes: number;
      totalCostCents: number;
      budgetCents: number;
      budgetMinutes: number;
      cycleMinutes: number;
      cycleCostCents: number;
    }>;
  }>;

  getAllMaintenanceLogsSummary(year: number, month: number): Promise<{
    totalMinutes: number;
    totalCostCents: number;
    devMinutes: number;
    devCostCents: number;
    hostingMinutes: number;
    hostingCostCents: number;
    byProject: Array<{
      projectId: number;
      projectName: string;
      logType: string;
      totalMinutes: number;
      totalCostCents: number;
    }>;
  }>;

  // Maintenance Log Costs
  getMaintenanceLogCosts(maintenanceLogId: number): Promise<MaintenanceLogCost[]>;
  createMaintenanceLogCost(cost: InsertMaintenanceLogCost): Promise<MaintenanceLogCost>;
  deleteMaintenanceLogCost(id: number): Promise<void>;

  // Replit Charges
  getReplitCharges(year: number, month: number): Promise<ReplitCharge[]>;
  getAllReplitCharges(): Promise<ReplitCharge[]>;
  createReplitCharge(charge: InsertReplitCharge): Promise<ReplitCharge>;
  deleteReplitCharge(id: number): Promise<void>;
  getReplitChargesSummary(year: number, month: number): Promise<{ totalCents: number; count: number }>;

  // Lead Engine
  getAllLeadAudits(): Promise<LeadAudit[]>;
  getLeadAuditBySlug(slug: string): Promise<LeadAudit | null>;
  upsertLeadAudit(data: InsertLeadAudit): Promise<LeadAudit>;
  updateLeadAuditHtml(domain: string, html: string): Promise<void>;
  updateLeadAuditStatus(domain: string, status: string): Promise<void>;
  deleteLeadAudit(domain: string): Promise<void>;
  getAllLeadDrafts(): Promise<LeadDraft[]>;
  createLeadDraft(data: InsertLeadDraft): Promise<LeadDraft>;
  markLeadDraftSent(id: number): Promise<void>;
  updateLeadDraft(id: number, data: { domain?: string; subject?: string; body?: string; auditUrl?: string | null }): Promise<void>;
  deleteLeadDraft(id: number): Promise<void>;
  getLeadEngineSettings(): Promise<{ industries: string[]; signals: string[]; exclusions: string[]; count: number; fromEmail: string; replyTo: string; } | null>;
  upsertLeadEngineSettings(data: { industries: string[]; signals: string[]; exclusions: string[]; count: number; fromEmail: string; replyTo: string; }): Promise<void>;

  getAllDevLogsSummary(): Promise<{
    totalMinutes: number;
    totalCostCents: number;
    devCostCents: number;
    hostingCostCents: number;
    logs: Array<{
      id: number;
      projectId: number;
      projectName: string;
      description: string;
      logDate: string;
      minutesSpent: number;
      totalCostCents: number;
      logType: string;
    }>;
  }>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username.toLowerCase()));
    return user;
  }

  async getUserByEmailOrUsername(identifier: string): Promise<User | undefined> {
    const lowerIdentifier = identifier.toLowerCase();
    const [user] = await db.select().from(users).where(
      or(
        sql`LOWER(${users.email}) = ${lowerIdentifier}`,
        sql`LOWER(${users.username}) = ${lowerIdentifier}`
      )
    );
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async hasAdminUser(): Promise<boolean> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, "admin"));
    return (result?.count ?? 0) > 0;
  }

  // Clients
  async getClients(): Promise<Client[]> {
    return db.select().from(clients).orderBy(desc(clients.createdAt));
  }

  async getClient(id: number): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client;
  }

  async createClient(client: InsertClient): Promise<Client> {
    const [newClient] = await db.insert(clients).values(client).returning();
    return newClient;
  }

  async updateClient(id: number, data: Partial<InsertClient>): Promise<Client | undefined> {
    const [updated] = await db.update(clients).set(data).where(eq(clients.id, id)).returning();
    return updated;
  }

  // Contacts
  async getContactsByClient(clientId: number): Promise<Contact[]> {
    return db.select().from(contacts).where(eq(contacts.clientId, clientId));
  }

  async getContact(id: number): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact;
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const [newContact] = await db.insert(contacts).values(contact).returning();
    return newContact;
  }

  async updateContact(id: number, data: Partial<InsertContact>): Promise<Contact | undefined> {
    const [updated] = await db.update(contacts).set(data).where(eq(contacts.id, id)).returning();
    return updated;
  }

  async deleteContact(id: number): Promise<void> {
    await db.delete(contacts).where(eq(contacts.id, id));
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    return db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getProjectsByClient(clientId: number): Promise<Project[]> {
    return db.select().from(projects).where(eq(projects.clientId, clientId)).orderBy(desc(projects.createdAt));
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [newProject] = await db.insert(projects).values(project).returning();
    return newProject;
  }

  async updateProject(id: number, data: Partial<InsertProject>): Promise<Project | undefined> {
    const [updated] = await db.update(projects).set(data).where(eq(projects.id, id)).returning();
    return updated;
  }

  async getSubProjects(parentId: number): Promise<Project[]> {
    return db.select().from(projects).where(eq(projects.parentProjectId, parentId)).orderBy(desc(projects.createdAt));
  }

  // Availability Rules
  async getAvailabilityRules(): Promise<AvailabilityRules | undefined> {
    const [rules] = await db.select().from(availabilityRules).limit(1);
    return rules;
  }

  async upsertAvailabilityRules(rules: InsertAvailabilityRules): Promise<AvailabilityRules> {
    const existing = await this.getAvailabilityRules();
    if (existing) {
      const [updated] = await db.update(availabilityRules).set(rules).where(eq(availabilityRules.id, existing.id)).returning();
      return updated;
    }
    const [newRules] = await db.insert(availabilityRules).values(rules).returning();
    return newRules;
  }

  // Availability Blocks
  async getAvailabilityBlocks(): Promise<AvailabilityBlock[]> {
    return db.select().from(availabilityBlocks).orderBy(availabilityBlocks.date);
  }

  async createAvailabilityBlock(block: InsertAvailabilityBlock): Promise<AvailabilityBlock> {
    const [newBlock] = await db.insert(availabilityBlocks).values(block).returning();
    return newBlock;
  }

  async deleteAvailabilityBlock(id: number): Promise<void> {
    await db.delete(availabilityBlocks).where(eq(availabilityBlocks.id, id));
  }

  // Office Day Requests
  async getOfficeDayRequests(): Promise<OfficeDayRequest[]> {
    return db.select().from(officeDayRequests).orderBy(desc(officeDayRequests.createdAt));
  }

  async getOfficeDayRequest(id: number): Promise<OfficeDayRequest | undefined> {
    const [request] = await db.select().from(officeDayRequests).where(eq(officeDayRequests.id, id));
    return request;
  }

  async getOfficeDayRequestById(id: number): Promise<OfficeDayRequest | undefined> {
    return this.getOfficeDayRequest(id);
  }

  async getOfficeDayRequestsByClient(clientId: number): Promise<OfficeDayRequest[]> {
    return db.select().from(officeDayRequests).where(eq(officeDayRequests.clientId, clientId)).orderBy(desc(officeDayRequests.createdAt));
  }

  async createOfficeDayRequest(request: InsertOfficeDayRequest): Promise<OfficeDayRequest> {
    const [newRequest] = await db.insert(officeDayRequests).values(request).returning();
    return newRequest;
  }

  async updateOfficeDayRequest(id: number, data: Partial<OfficeDayRequest>): Promise<OfficeDayRequest | undefined> {
    const [updated] = await db.update(officeDayRequests).set(data).where(eq(officeDayRequests.id, id)).returning();
    return updated;
  }

  // Milestones
  async getMilestones(): Promise<Milestone[]> {
    return db.select().from(milestones).orderBy(desc(milestones.createdAt));
  }

  async getMilestone(id: number): Promise<Milestone | undefined> {
    const [milestone] = await db.select().from(milestones).where(eq(milestones.id, id));
    return milestone;
  }

  async getMilestonesByProject(projectId: number): Promise<Milestone[]> {
    return db.select().from(milestones).where(eq(milestones.projectId, projectId)).orderBy(milestones.id);
  }

  async getMilestonesByClient(clientId: number): Promise<Milestone[]> {
    const clientProjects = await this.getProjectsByClient(clientId);
    const projectIds = clientProjects.map(p => p.id);
    if (projectIds.length === 0) return [];
    
    const result: Milestone[] = [];
    for (const pid of projectIds) {
      const projectMilestones = await this.getMilestonesByProject(pid);
      result.push(...projectMilestones);
    }
    return result;
  }

  async createMilestone(milestone: InsertMilestone): Promise<Milestone> {
    const [newMilestone] = await db.insert(milestones).values(milestone).returning();
    return newMilestone;
  }

  async updateMilestone(id: number, data: Partial<InsertMilestone> & { reminderCount?: number; lastReminderSent?: Date | null }): Promise<Milestone | undefined> {
    const [updated] = await db.update(milestones).set(data).where(eq(milestones.id, id)).returning();
    return updated;
  }

  async deleteMilestone(id: number): Promise<void> {
    await db.delete(milestones).where(eq(milestones.id, id));
  }

  async getInvoicedMilestonesWithDetails(): Promise<(Milestone & { project: Project; client: Client })[]> {
    const invoicedMilestones = await db.select()
      .from(milestones)
      .where(or(
        eq(milestones.status, "invoiced"),
        eq(milestones.status, "overdue")
      ))
      .orderBy(desc(milestones.createdAt));
    
    const result: (Milestone & { project: Project; client: Client })[] = [];
    
    for (const milestone of invoicedMilestones) {
      const [project] = await db.select().from(projects).where(eq(projects.id, milestone.projectId));
      if (project) {
        const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId));
        if (client) {
          result.push({ ...milestone, project, client });
        }
      }
    }
    
    return result;
  }

  async getAllMilestonesWithClients(): Promise<(Milestone & { project: Project; client: Client })[]> {
    const allMilestones = await db.select()
      .from(milestones)
      .orderBy(desc(milestones.createdAt));
    
    const result: (Milestone & { project: Project; client: Client })[] = [];
    
    for (const milestone of allMilestones) {
      const [project] = await db.select().from(projects).where(eq(projects.id, milestone.projectId));
      if (project) {
        const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId));
        if (client) {
          result.push({ ...milestone, project, client });
        }
      }
    }
    
    return result;
  }

  async getUnpaidMilestonesForReminders(): Promise<(Milestone & { project: Project; client: Client })[]> {
    const unpaidMilestones = await db.select()
      .from(milestones)
      .where(or(
        eq(milestones.status, "invoiced"),
        eq(milestones.status, "overdue")
      ));
    
    const result: (Milestone & { project: Project; client: Client })[] = [];
    
    for (const milestone of unpaidMilestones) {
      const [project] = await db.select().from(projects).where(eq(projects.id, milestone.projectId));
      if (project) {
        const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId));
        if (client) {
          result.push({ ...milestone, project, client });
        }
      }
    }
    
    return result;
  }

  // Documents
  async getDocuments(): Promise<Document[]> {
    return db.select().from(documents).orderBy(desc(documents.uploadedAt));
  }

  async getDocumentsByClient(clientId: number): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.clientId, clientId)).orderBy(desc(documents.uploadedAt));
  }

  async createDocument(doc: InsertDocument): Promise<Document> {
    const [newDoc] = await db.insert(documents).values(doc).returning();
    return newDoc;
  }

  async deleteDocument(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  // Office Day Capacity - counts non-rejected requests (requested, approved, completed)
  async getOfficeDayCountForWeek(dateStr: string): Promise<number> {
    // Get the start and end of the week containing the given date
    const date = new Date(dateStr);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
    const weekStart = new Date(date);
    weekStart.setDate(diff);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    
    // Count non-rejected, non-cancelled requests
    const requests = await db.select().from(officeDayRequests).where(
      and(
        ne(officeDayRequests.status, "rejected"),
        ne(officeDayRequests.status, "cancelled"),
      )
    );
    
    return requests.filter(r => r.date >= weekStartStr && r.date <= weekEndStr).length;
  }

  async getOfficeDayCountForMonth(year: number, month: number): Promise<number> {
    const monthStr = String(month).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    const endDate = `${year}-${monthStr}-31`;
    
    // Count non-rejected, non-cancelled requests
    const requests = await db.select().from(officeDayRequests).where(
      and(
        ne(officeDayRequests.status, "rejected"),
        ne(officeDayRequests.status, "cancelled"),
      )
    );
    
    return requests.filter(r => r.date >= startDate && r.date <= endDate).length;
  }

  // Activity Events
  async getActivityEvents(limit = 50): Promise<ActivityEvent[]> {
    return db.select().from(activityEvents).orderBy(desc(activityEvents.createdAt)).limit(limit);
  }

  async createActivityEvent(event: InsertActivityEvent): Promise<ActivityEvent> {
    const [newEvent] = await db.insert(activityEvents).values(event).returning();
    return newEvent;
  }

  // Contact Submissions
  async createContactSubmission(submission: InsertContactSubmission): Promise<ContactSubmission> {
    const [newSubmission] = await db.insert(contactSubmissions).values(submission).returning();
    return newSubmission;
  }

  // Project Process Steps
  async getProcessStepsByProject(projectId: number): Promise<ProjectProcessStep[]> {
    return db.select().from(projectProcessSteps)
      .where(eq(projectProcessSteps.projectId, projectId))
      .orderBy(projectProcessSteps.stepOrder);
  }

  async createProcessStep(step: InsertProjectProcessStep): Promise<ProjectProcessStep> {
    const [newStep] = await db.insert(projectProcessSteps).values(step).returning();
    return newStep;
  }

  async updateProcessStep(id: number, data: Partial<InsertProjectProcessStep>): Promise<ProjectProcessStep | undefined> {
    const [updated] = await db.update(projectProcessSteps).set(data).where(eq(projectProcessSteps.id, id)).returning();
    return updated;
  }

  async deleteProcessStep(id: number): Promise<void> {
    await db.delete(projectProcessSteps).where(eq(projectProcessSteps.id, id));
  }

  async reorderProcessSteps(updates: { id: number; stepOrder: number }[]): Promise<void> {
    for (const update of updates) {
      await db.update(projectProcessSteps)
        .set({ stepOrder: update.stepOrder })
        .where(eq(projectProcessSteps.id, update.id));
    }
  }

  async getActiveTasksAcrossProjects(): Promise<(ProjectProcessStep & { projectName: string; clientName: string })[]> {
    const rows = await db.select({
      step: projectProcessSteps,
      projectName: projects.name,
      clientName: clients.companyName,
    })
    .from(projectProcessSteps)
    .innerJoin(projects, eq(projectProcessSteps.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .where(
      and(
        inArray(projects.status, ["lead", "active", "hosting"]),
        inArray(projectProcessSteps.status, ["planned", "in_progress"])
      )
    )
    .orderBy(projectProcessSteps.stepOrder);

    return rows.map(r => ({
      ...r.step,
      projectName: r.projectName,
      clientName: r.clientName || "Unknown Client",
    }));
  }

  // Project Prompts
  async getPromptsByProject(projectId: number, clientVisible?: boolean): Promise<ProjectPrompt[]> {
    if (clientVisible !== undefined) {
      return db.select().from(projectPrompts)
        .where(and(
          eq(projectPrompts.projectId, projectId),
          eq(projectPrompts.visibleToClient, clientVisible)
        ))
        .orderBy(desc(projectPrompts.createdAt));
    }
    return db.select().from(projectPrompts)
      .where(eq(projectPrompts.projectId, projectId))
      .orderBy(desc(projectPrompts.createdAt));
  }

  async createPrompt(prompt: InsertProjectPrompt): Promise<ProjectPrompt> {
    const [newPrompt] = await db.insert(projectPrompts).values(prompt).returning();
    return newPrompt;
  }

  async updatePrompt(id: number, data: Partial<InsertProjectPrompt>): Promise<ProjectPrompt | undefined> {
    const [updated] = await db.update(projectPrompts).set(data).where(eq(projectPrompts.id, id)).returning();
    return updated;
  }

  async deletePrompt(id: number): Promise<void> {
    await db.delete(projectPrompts).where(eq(projectPrompts.id, id));
  }

  // Project Agreements
  async getAgreementsByProject(projectId: number): Promise<ProjectAgreement[]> {
    return db.select().from(projectAgreements)
      .where(eq(projectAgreements.projectId, projectId))
      .orderBy(desc(projectAgreements.createdAt));
  }

  async createAgreement(agreement: InsertProjectAgreement): Promise<ProjectAgreement> {
    const [newAgreement] = await db.insert(projectAgreements).values(agreement).returning();
    return newAgreement;
  }

  async updateAgreement(id: number, data: Partial<InsertProjectAgreement>): Promise<ProjectAgreement | undefined> {
    const [updated] = await db.update(projectAgreements).set(data).where(eq(projectAgreements.id, id)).returning();
    return updated;
  }

  async deleteAgreement(id: number): Promise<void> {
    await db.delete(projectAgreements).where(eq(projectAgreements.id, id));
  }

  // Documents by Project
  async getDocumentsByProject(projectId: number): Promise<Document[]> {
    return db.select().from(documents)
      .where(eq(documents.projectId, projectId))
      .orderBy(desc(documents.uploadedAt));
  }

  async getDocument(id: number): Promise<Document | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    return doc;
  }

  // Project History Events
  async getHistoryEventsByProject(projectId: number): Promise<ProjectHistoryEvent[]> {
    return db.select().from(projectHistoryEvents)
      .where(eq(projectHistoryEvents.projectId, projectId))
      .orderBy(desc(projectHistoryEvents.occurredAt));
  }

  async createHistoryEvent(event: InsertProjectHistoryEvent): Promise<ProjectHistoryEvent> {
    const [newEvent] = await db.insert(projectHistoryEvents).values(event).returning();
    return newEvent;
  }

  async updateHistoryEvent(id: number, data: Partial<InsertProjectHistoryEvent>): Promise<ProjectHistoryEvent | undefined> {
    const [updated] = await db.update(projectHistoryEvents).set(data).where(eq(projectHistoryEvents.id, id)).returning();
    return updated;
  }

  async deleteHistoryEvent(id: number): Promise<void> {
    await db.delete(projectHistoryEvents).where(eq(projectHistoryEvents.id, id));
  }

  // Calendar Blocks
  async getCalendarBlocks(): Promise<CalendarBlock[]> {
    return db.select().from(calendarBlocks).orderBy(calendarBlocks.startAt);
  }

  async getCalendarBlocksInRange(startAt: Date, endAt: Date): Promise<CalendarBlock[]> {
    return db.select().from(calendarBlocks)
      .where(and(
        gte(calendarBlocks.startAt, startAt),
        lte(calendarBlocks.endAt, endAt)
      ))
      .orderBy(calendarBlocks.startAt);
  }

  async createCalendarBlock(block: InsertCalendarBlock): Promise<CalendarBlock> {
    const [newBlock] = await db.insert(calendarBlocks).values(block).returning();
    return newBlock;
  }

  async deleteCalendarBlock(id: number): Promise<void> {
    await db.delete(calendarBlocks).where(eq(calendarBlocks.id, id));
  }

  async getCalendarBlockByOfficeDayRequest(officeDayRequestId: number): Promise<CalendarBlock | undefined> {
    const [block] = await db.select().from(calendarBlocks)
      .where(eq(calendarBlocks.officeDayRequestId, officeDayRequestId));
    return block;
  }

  // Google Calendar Accounts
  async getGoogleCalendarAccount(userId: number): Promise<GoogleCalendarAccount | undefined> {
    const [account] = await db.select().from(googleCalendarAccounts)
      .where(eq(googleCalendarAccounts.userId, userId));
    return account;
  }

  async createGoogleCalendarAccount(account: InsertGoogleCalendarAccount): Promise<GoogleCalendarAccount> {
    const [newAccount] = await db.insert(googleCalendarAccounts).values(account).returning();
    return newAccount;
  }

  async updateGoogleCalendarAccount(id: number, data: Partial<InsertGoogleCalendarAccount>): Promise<GoogleCalendarAccount | undefined> {
    const [updated] = await db.update(googleCalendarAccounts).set(data).where(eq(googleCalendarAccounts.id, id)).returning();
    return updated;
  }

  async deleteGoogleCalendarAccount(id: number): Promise<void> {
    await db.delete(googleCalendarAccounts).where(eq(googleCalendarAccounts.id, id));
  }

  // Meeting Requests
  async getMeetingRequests(): Promise<MeetingRequest[]> {
    return db.select().from(meetingRequests).orderBy(desc(meetingRequests.createdAt));
  }

  async getMeetingRequest(id: number): Promise<MeetingRequest | undefined> {
    const [request] = await db.select().from(meetingRequests).where(eq(meetingRequests.id, id));
    return request;
  }

  async getMeetingRequestByToken(token: string): Promise<MeetingRequest | undefined> {
    const [request] = await db.select().from(meetingRequests).where(eq(meetingRequests.secureToken, token));
    return request;
  }

  async createMeetingRequest(request: InsertMeetingRequest): Promise<MeetingRequest> {
    const [newRequest] = await db.insert(meetingRequests).values(request).returning();
    return newRequest;
  }

  async updateMeetingRequest(id: number, data: Partial<MeetingRequest>): Promise<MeetingRequest | undefined> {
    const [updated] = await db.update(meetingRequests).set(data).where(eq(meetingRequests.id, id)).returning();
    return updated;
  }

  // Meeting Proposals
  async getMeetingProposals(meetingRequestId: number): Promise<MeetingProposal[]> {
    return db.select().from(meetingProposals).where(eq(meetingProposals.meetingRequestId, meetingRequestId)).orderBy(meetingProposals.createdAt);
  }

  async getMeetingProposal(id: number): Promise<MeetingProposal | undefined> {
    const [proposal] = await db.select().from(meetingProposals).where(eq(meetingProposals.id, id));
    return proposal;
  }

  async createMeetingProposal(proposal: InsertMeetingProposal): Promise<MeetingProposal> {
    const [newProposal] = await db.insert(meetingProposals).values(proposal).returning();
    return newProposal;
  }

  async updateMeetingProposal(id: number, data: Partial<MeetingProposal>): Promise<MeetingProposal | undefined> {
    const [updated] = await db.update(meetingProposals).set(data).where(eq(meetingProposals.id, id)).returning();
    return updated;
  }

  // Reminders
  async getReminders(): Promise<Reminder[]> {
    return db.select().from(reminders).orderBy(reminders.sendAt);
  }

  async getPendingReminders(beforeTime: Date): Promise<Reminder[]> {
    return db.select().from(reminders)
      .where(and(
        eq(reminders.status, "pending"),
        lte(reminders.sendAt, beforeTime)
      ))
      .orderBy(reminders.sendAt);
  }

  async getReminderByIdempotencyKey(key: string): Promise<Reminder | undefined> {
    const [reminder] = await db.select().from(reminders).where(eq(reminders.idempotencyKey, key));
    return reminder;
  }

  async createReminder(reminder: InsertReminder): Promise<Reminder> {
    const [newReminder] = await db.insert(reminders).values(reminder).returning();
    return newReminder;
  }

  async updateReminder(id: number, data: Partial<Reminder>): Promise<Reminder | undefined> {
    const [updated] = await db.update(reminders).set(data).where(eq(reminders.id, id)).returning();
    return updated;
  }

  async cancelRemindersForEntity(reminderType: string, entityId: number): Promise<void> {
    await db.update(reminders)
      .set({ status: "cancelled" })
      .where(and(
        eq(reminders.reminderType, reminderType as "meeting" | "office_day"),
        eq(reminders.entityId, entityId),
        eq(reminders.status, "pending")
      ));
  }

  // Hosting Terms (admin-only)
  async getHostingTerms(): Promise<HostingTerms[]> {
    return db.select().from(hostingTerms).orderBy(desc(hostingTerms.updatedAt));
  }

  async getHostingTerm(id: number): Promise<HostingTerms | undefined> {
    const [term] = await db.select().from(hostingTerms).where(eq(hostingTerms.id, id));
    return term;
  }

  async createHostingTerm(term: InsertHostingTerms): Promise<HostingTerms> {
    const [newTerm] = await db.insert(hostingTerms).values(term).returning();
    return newTerm;
  }

  async updateHostingTerm(id: number, data: Partial<InsertHostingTerms>): Promise<HostingTerms | undefined> {
    const updateData = { ...data, updatedAt: new Date() };
    const [updated] = await db.update(hostingTerms).set(updateData).where(eq(hostingTerms.id, id)).returning();
    return updated;
  }

  // Project Hosting Terms (per-project hosting agreements)
  async getProjectHostingTerms(projectId: number): Promise<ProjectHostingTerms | undefined> {
    const [terms] = await db.select().from(projectHostingTerms).where(eq(projectHostingTerms.projectId, projectId));
    return terms;
  }

  async upsertProjectHostingTerms(projectId: number, data: Partial<InsertProjectHostingTerms>): Promise<ProjectHostingTerms> {
    const existing = await this.getProjectHostingTerms(projectId);
    if (existing) {
      const updateData = { ...data, updatedAt: new Date() };
      const [updated] = await db.update(projectHostingTerms)
        .set(updateData)
        .where(eq(projectHostingTerms.projectId, projectId))
        .returning();
      return updated;
    } else {
      const insertData = { ...data, projectId };
      const [created] = await db.insert(projectHostingTerms).values(insertData as any).returning();
      return created;
    }
  }

  // Generated Contracts
  async getGeneratedContracts(projectId: number): Promise<GeneratedContract[]> {
    return await db.select().from(generatedContracts)
      .where(eq(generatedContracts.projectId, projectId))
      .orderBy(desc(generatedContracts.createdAt));
  }

  async getGeneratedContract(id: number): Promise<GeneratedContract | undefined> {
    const [contract] = await db.select().from(generatedContracts).where(eq(generatedContracts.id, id));
    return contract;
  }

  async createGeneratedContract(contract: InsertGeneratedContract): Promise<GeneratedContract> {
    const [created] = await db.insert(generatedContracts).values(contract).returning();
    return created;
  }

  async deleteGeneratedContract(id: number): Promise<void> {
    await db.delete(generatedContracts).where(eq(generatedContracts.id, id));
  }

  // Recurring Payments
  async getRecurringPayments(): Promise<RecurringPaymentWithProject[]> {
    const payments = await db.select().from(recurringPayments).orderBy(recurringPayments.nextPaymentDate);
    const result: RecurringPaymentWithProject[] = [];
    for (const payment of payments) {
      const [project] = await db.select().from(projects).where(eq(projects.id, payment.projectId));
      if (project) {
        const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId));
        if (client) {
          result.push({ ...payment, project: { ...project, client } });
        }
      }
    }
    return result;
  }

  async getRecurringPayment(id: number): Promise<RecurringPayment | undefined> {
    const [payment] = await db.select().from(recurringPayments).where(eq(recurringPayments.id, id));
    return payment;
  }

  async getRecurringPaymentByProject(projectId: number): Promise<RecurringPayment | undefined> {
    const [payment] = await db.select().from(recurringPayments)
      .where(and(eq(recurringPayments.projectId, projectId), eq(recurringPayments.isActive, true)));
    return payment;
  }

  async createRecurringPayment(payment: InsertRecurringPayment): Promise<RecurringPayment> {
    const [created] = await db.insert(recurringPayments).values(payment).returning();
    return created;
  }

  async updateRecurringPayment(id: number, data: Partial<InsertRecurringPayment>): Promise<RecurringPayment | undefined> {
    const updateData = { ...data, updatedAt: new Date() };
    const [updated] = await db.update(recurringPayments).set(updateData).where(eq(recurringPayments.id, id)).returning();
    return updated;
  }

  async deleteRecurringPayment(id: number): Promise<void> {
    await db.delete(recurringPayments).where(eq(recurringPayments.id, id));
  }

  // Hosting Invoices
  async getHostingInvoices(): Promise<HostingInvoice[]> {
    return db.select().from(hostingInvoices).orderBy(desc(hostingInvoices.createdAt));
  }

  async getHostingInvoicesByClient(clientId: number): Promise<HostingInvoice[]> {
    return db.select().from(hostingInvoices)
      .where(eq(hostingInvoices.clientId, clientId))
      .orderBy(desc(hostingInvoices.createdAt));
  }

  async getHostingInvoice(id: number): Promise<HostingInvoice | undefined> {
    const [invoice] = await db.select().from(hostingInvoices).where(eq(hostingInvoices.id, id));
    return invoice;
  }

  async createHostingInvoice(invoice: InsertHostingInvoice): Promise<HostingInvoice> {
    const [created] = await db.insert(hostingInvoices).values(invoice).returning();
    return created;
  }

  async createHostingInvoiceLineItem(item: InsertHostingInvoiceLineItem): Promise<HostingInvoiceLineItem> {
    const [created] = await db.insert(hostingInvoiceLineItems).values(item).returning();
    return created;
  }

  async getNextHostingInvoiceNumber(clientId: number): Promise<string> {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `HOST-${clientId}-${yearMonth}`;
    
    const existing = await db.select().from(hostingInvoices)
      .where(sql`${hostingInvoices.invoiceNumber} LIKE ${prefix + '%'}`)
      .orderBy(desc(hostingInvoices.invoiceNumber));
    
    const nextNum = existing.length + 1;
    return `${prefix}-${String(nextNum).padStart(3, '0')}`;
  }

  async getHostingProjectsWithTerms(clientId?: number): Promise<(Project & { hostingTerms: ProjectHostingTerms | null })[]> {
    const projectsList = clientId 
      ? await db.select().from(projects).where(and(eq(projects.clientId, clientId), eq(projects.status, "hosting")))
      : await db.select().from(projects).where(eq(projects.status, "hosting"));
    
    const result = await Promise.all(projectsList.map(async (project) => {
      const [terms] = await db.select().from(projectHostingTerms).where(eq(projectHostingTerms.projectId, project.id));
      return { ...project, hostingTerms: terms || null };
    }));
    
    return result;
  }

  async updateHostingInvoice(id: number, data: Partial<InsertHostingInvoice> & { reminderCount?: number; lastReminderSent?: Date | null }): Promise<HostingInvoice | undefined> {
    const updateData = { ...data, updatedAt: new Date() };
    const [updated] = await db.update(hostingInvoices).set(updateData).where(eq(hostingInvoices.id, id)).returning();
    return updated;
  }

  async deleteHostingInvoice(id: number): Promise<void> {
    // Line items are deleted automatically via onDelete: cascade
    await db.delete(hostingInvoices).where(eq(hostingInvoices.id, id));
  }

  async getUnpaidHostingInvoicesForReminders(): Promise<(HostingInvoice & { client: Client })[]> {
    // Get invoices that are pending or overdue
    const invoices = await db.select()
      .from(hostingInvoices)
      .where(
        or(
          eq(hostingInvoices.status, "pending"),
          eq(hostingInvoices.status, "overdue")
        )
      );
    
    const result: (HostingInvoice & { client: Client })[] = [];
    
    for (const invoice of invoices) {
      const [client] = await db.select().from(clients).where(eq(clients.id, invoice.clientId));
      if (client) {
        result.push({ ...invoice, client });
      }
    }
    
    return result;
  }

  async getAllHostingInvoicesWithDetails(): Promise<(HostingInvoice & { client: Client; lineItems: HostingInvoiceLineItem[] })[]> {
    const allInvoices = await db.select()
      .from(hostingInvoices)
      .orderBy(desc(hostingInvoices.createdAt));
    
    const result: (HostingInvoice & { client: Client; lineItems: HostingInvoiceLineItem[] })[] = [];
    
    for (const invoice of allInvoices) {
      const [client] = await db.select().from(clients).where(eq(clients.id, invoice.clientId));
      const lineItems = await db.select().from(hostingInvoiceLineItems)
        .where(eq(hostingInvoiceLineItems.invoiceId, invoice.id));
      
      if (client) {
        result.push({ ...invoice, client, lineItems });
      }
    }
    
    return result;
  }

  async getPaymentSettings(): Promise<PaymentSettings | undefined> {
    const [settings] = await db.select().from(paymentSettings).limit(1);
    return settings;
  }

  async upsertPaymentSettings(settings: Partial<InsertPaymentSettings>): Promise<PaymentSettings> {
    const existing = await this.getPaymentSettings();
    if (existing) {
      const [updated] = await db.update(paymentSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(paymentSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(paymentSettings)
        .values({ ...settings, defaultCurrency: settings.defaultCurrency || "USD" })
        .returning();
      return created;
    }
  }

  // Maintenance Logs
  async getMaintenanceLogs(projectId: number, logType?: string): Promise<MaintenanceLog[]> {
    const conditions = [eq(maintenanceLogs.projectId, projectId)];
    if (logType) {
      conditions.push(eq(maintenanceLogs.logType, logType));
    }
    return db.select().from(maintenanceLogs)
      .where(and(...conditions))
      .orderBy(desc(maintenanceLogs.logDate), desc(maintenanceLogs.id));
  }

  async getMaintenanceLogsByMonth(projectId: number, year: number, month: number, logType?: string): Promise<MaintenanceLog[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    const conditions = [
      eq(maintenanceLogs.projectId, projectId),
      gte(maintenanceLogs.logDate, startStr),
      lte(maintenanceLogs.logDate, endStr)
    ];
    if (logType) {
      conditions.push(eq(maintenanceLogs.logType, logType));
    }
    return db.select().from(maintenanceLogs)
      .where(and(...conditions))
      .orderBy(desc(maintenanceLogs.logDate), desc(maintenanceLogs.id));
  }

  async getMaintenanceLogsByDateRange(projectId: number, startDate: string, endDate: string, logType?: string): Promise<MaintenanceLog[]> {
    const conditions = [
      eq(maintenanceLogs.projectId, projectId),
      gte(maintenanceLogs.logDate, startDate),
      lte(maintenanceLogs.logDate, endDate)
    ];
    if (logType) {
      conditions.push(eq(maintenanceLogs.logType, logType));
    }
    return db.select().from(maintenanceLogs)
      .where(and(...conditions))
      .orderBy(desc(maintenanceLogs.logDate), desc(maintenanceLogs.id));
  }

  async createMaintenanceLog(log: InsertMaintenanceLog): Promise<MaintenanceLog> {
    const [created] = await db.insert(maintenanceLogs).values(log).returning();
    return created;
  }

  async updateMaintenanceLog(id: number, data: Partial<InsertMaintenanceLog>): Promise<MaintenanceLog | undefined> {
    const [updated] = await db.update(maintenanceLogs)
      .set(data)
      .where(eq(maintenanceLogs.id, id))
      .returning();
    return updated;
  }

  async deleteMaintenanceLog(id: number): Promise<void> {
    await db.delete(maintenanceLogs).where(eq(maintenanceLogs.id, id));
  }

  async getMaintenanceLogSummary(projectId: number, year: number, month: number, logType?: string): Promise<{ totalMinutes: number; totalCostCents: number }> {
    const logs = await this.getMaintenanceLogsByMonth(projectId, year, month, logType);
    const totalMinutes = logs.reduce((sum, log) => sum + log.minutesSpent, 0);
    
    // Sum base cost from logs plus all cost entries
    let totalCostCents = logs.reduce((sum, log) => sum + (log.estimatedCostCents || 0), 0);
    
    // Add costs from sub-entries
    for (const log of logs) {
      const costs = await this.getMaintenanceLogCosts(log.id);
      totalCostCents += costs.reduce((sum, cost) => sum + cost.costCents, 0);
    }
    
    return { totalMinutes, totalCostCents };
  }

  async getMaintenanceLogSummaryByDateRange(projectId: number, startDate: string, endDate: string, logType?: string): Promise<{ totalMinutes: number; totalCostCents: number }> {
    const logs = await this.getMaintenanceLogsByDateRange(projectId, startDate, endDate, logType);
    const totalMinutes = logs.reduce((sum, log) => sum + log.minutesSpent, 0);
    
    let totalCostCents = logs.reduce((sum, log) => sum + (log.estimatedCostCents || 0), 0);
    
    for (const log of logs) {
      const costs = await this.getMaintenanceLogCosts(log.id);
      totalCostCents += costs.reduce((sum, cost) => sum + cost.costCents, 0);
    }
    
    return { totalMinutes, totalCostCents };
  }

  async getMaintenanceLogAllTimeSummary(projectId: number, logType?: string): Promise<{ totalMinutes: number; totalCostCents: number }> {
    const logs = await this.getMaintenanceLogs(projectId, logType);
    const totalMinutes = logs.reduce((sum, log) => sum + log.minutesSpent, 0);
    
    let totalCostCents = logs.reduce((sum, log) => sum + (log.estimatedCostCents || 0), 0);
    
    for (const log of logs) {
      const costs = await this.getMaintenanceLogCosts(log.id);
      totalCostCents += costs.reduce((sum, cost) => sum + cost.costCents, 0);
    }
    
    return { totalMinutes, totalCostCents };
  }

  async getClientDevSummary(clientId: number, cycleSince?: string) {
    const today = new Date();
    const defaultCycleSince = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

    // Fetch ALL projects for this client (no status filter — include hosting projects)
    const allProjects = await db.select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.clientId, clientId));

    const allProjectIds = allProjects.map(p => p.id);

    // Budget + per-project cycle start from hosting terms
    const hostingTermsRows = allProjectIds.length > 0
      ? await db.select({
          projectId: projectHostingTerms.projectId,
          maintenanceBudgetCents: projectHostingTerms.maintenanceBudgetCents,
          maintenanceBudgetMinutes: projectHostingTerms.maintenanceBudgetMinutes,
          currentCycleStartDate: projectHostingTerms.currentCycleStartDate,
        })
          .from(projectHostingTerms)
          .where(inArray(projectHostingTerms.projectId, allProjectIds))
      : [];

    const budgetCentsByProject   = new Map<number, number>();
    const budgetMinutesByProject = new Map<number, number>();
    // Each project gets its OWN cycle start — fall back to caller override, then 1st of month
    const cycleStartByProject    = new Map<number, string>();
    for (const t of hostingTermsRows) {
      if (t.maintenanceBudgetCents)   budgetCentsByProject.set(t.projectId, t.maintenanceBudgetCents);
      if (t.maintenanceBudgetMinutes) budgetMinutesByProject.set(t.projectId, t.maintenanceBudgetMinutes);
      cycleStartByProject.set(t.projectId, cycleSince || t.currentCycleStartDate || defaultCycleSince);
    }

    // For projects with no hosting terms entry, fall back to caller override or 1st of month
    for (const proj of allProjects) {
      if (!cycleStartByProject.has(proj.id)) {
        cycleStartByProject.set(proj.id, cycleSince || defaultCycleSince);
      }
    }

    // Fetch ALL maintenance logs for ALL projects under this client
    const logs = await db.select({
      id: maintenanceLogs.id,
      projectId: maintenanceLogs.projectId,
      projectName: projects.name,
      minutesSpent: maintenanceLogs.minutesSpent,
      estimatedCostCents: maintenanceLogs.estimatedCostCents,
      logDate: maintenanceLogs.logDate,
      logType: maintenanceLogs.logType,
    })
      .from(maintenanceLogs)
      .innerJoin(projects, eq(maintenanceLogs.projectId, projects.id))
      .where(eq(projects.clientId, clientId));

    // Resolve extra log costs
    const logIds = logs.map(l => l.id);
    const allCosts = logIds.length > 0
      ? await db.select({ maintenanceLogId: maintenanceLogCosts.maintenanceLogId, costCents: maintenanceLogCosts.costCents })
          .from(maintenanceLogCosts)
          .where(inArray(maintenanceLogCosts.maintenanceLogId, logIds))
      : [];
    const costsByLogId = new Map<number, number>();
    for (const c of allCosts) {
      costsByLogId.set(c.maintenanceLogId, (costsByLogId.get(c.maintenanceLogId) || 0) + c.costCents);
    }

    // Aggregate per project — use each project's OWN cycle start date
    const projectMap = new Map<number, {
      projectId: number; projectName: string;
      totalMinutes: number; totalCostCents: number;
      budgetCents: number; budgetMinutes: number;
      cycleMinutes: number; cycleCostCents: number;
      cycleStart: string;
    }>();
    for (const proj of allProjects) {
      projectMap.set(proj.id, {
        projectId: proj.id, projectName: proj.name,
        totalMinutes: 0, totalCostCents: 0,
        budgetCents:   budgetCentsByProject.get(proj.id)   || 0,
        budgetMinutes: budgetMinutesByProject.get(proj.id) || 0,
        cycleMinutes: 0, cycleCostCents: 0,
        cycleStart: cycleStartByProject.get(proj.id) || defaultCycleSince,
      });
    }

    let totalMinutes = 0, totalCostCents = 0;
    let cycleMinutes = 0, cycleCostCents = 0;

    for (const log of logs) {
      const logCost = (log.estimatedCostCents || 0) + (costsByLogId.get(log.id) || 0);
      totalMinutes += log.minutesSpent;
      totalCostCents += logCost;

      const entry = projectMap.get(log.projectId);
      if (entry) {
        entry.totalMinutes += log.minutesSpent;
        entry.totalCostCents += logCost;
        // Use THIS project's cycle start, not a client-wide one
        const inCycle = log.logDate && log.logDate >= entry.cycleStart;
        if (inCycle) {
          entry.cycleMinutes += log.minutesSpent;
          entry.cycleCostCents += logCost;
          cycleMinutes += log.minutesSpent;
          cycleCostCents += logCost;
        }
      }
    }

    // Total budgets = sum across all projects from hosting terms
    let totalBudgetCents = 0, totalBudgetMinutes = 0;
    for (const t of hostingTermsRows) {
      totalBudgetCents   += t.maintenanceBudgetCents   || 0;
      totalBudgetMinutes += t.maintenanceBudgetMinutes || 0;
    }

    // cycleSince for display = earliest per-project cycle start
    const allCycleStarts = Array.from(cycleStartByProject.values());
    const displayCycleStart = allCycleStarts.length > 0 ? allCycleStarts.sort()[0] : defaultCycleSince;

    return {
      totalMinutes,
      totalCostCents,
      totalBudgetCents,
      totalBudgetMinutes,
      cycleMinutes,
      cycleCostCents,
      cycleSince: displayCycleStart,
      byProject: Array.from(projectMap.values())
        .filter(p => p.totalMinutes > 0 || p.totalCostCents > 0 || p.budgetCents > 0 || p.budgetMinutes > 0)
        .map(({ cycleStart: _cs, ...rest }) => rest),
    };
  }

  async getAllMaintenanceLogsSummary(year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const logs = await db.select({
      id: maintenanceLogs.id,
      projectId: maintenanceLogs.projectId,
      minutesSpent: maintenanceLogs.minutesSpent,
      estimatedCostCents: maintenanceLogs.estimatedCostCents,
      logType: maintenanceLogs.logType,
      projectName: projects.name,
    })
      .from(maintenanceLogs)
      .innerJoin(projects, eq(maintenanceLogs.projectId, projects.id))
      .where(and(
        gte(maintenanceLogs.logDate, startStr),
        lte(maintenanceLogs.logDate, endStr)
      ));

    let totalMinutes = 0;
    let totalCostCents = 0;
    let devMinutes = 0;
    let devCostCents = 0;
    let hostingMinutes = 0;
    let hostingCostCents = 0;

    const projectMap = new Map<string, { projectId: number; projectName: string; logType: string; totalMinutes: number; totalCostCents: number }>();

    for (const log of logs) {
      const baseCost = log.estimatedCostCents || 0;
      const costs = await this.getMaintenanceLogCosts(log.id);
      const subCosts = costs.reduce((sum, c) => sum + c.costCents, 0);
      const logCost = baseCost + subCosts;

      totalMinutes += log.minutesSpent;
      totalCostCents += logCost;

      if (log.logType === "development") {
        devMinutes += log.minutesSpent;
        devCostCents += logCost;
      } else {
        hostingMinutes += log.minutesSpent;
        hostingCostCents += logCost;
      }

      const key = `${log.projectId}-${log.logType}`;
      const existing = projectMap.get(key);
      if (existing) {
        existing.totalMinutes += log.minutesSpent;
        existing.totalCostCents += logCost;
      } else {
        projectMap.set(key, {
          projectId: log.projectId,
          projectName: log.projectName,
          logType: log.logType,
          totalMinutes: log.minutesSpent,
          totalCostCents: logCost,
        });
      }
    }

    return {
      totalMinutes,
      totalCostCents,
      devMinutes,
      devCostCents,
      hostingMinutes,
      hostingCostCents,
      byProject: Array.from(projectMap.values()).sort((a, b) => b.totalCostCents - a.totalCostCents),
    };
  }

  // Maintenance Log Costs
  async getMaintenanceLogCosts(maintenanceLogId: number): Promise<MaintenanceLogCost[]> {
    return db.select().from(maintenanceLogCosts)
      .where(eq(maintenanceLogCosts.maintenanceLogId, maintenanceLogId))
      .orderBy(desc(maintenanceLogCosts.createdAt));
  }

  async createMaintenanceLogCost(cost: InsertMaintenanceLogCost): Promise<MaintenanceLogCost> {
    const [created] = await db.insert(maintenanceLogCosts).values(cost).returning();
    return created;
  }

  async deleteMaintenanceLogCost(id: number): Promise<void> {
    await db.delete(maintenanceLogCosts).where(eq(maintenanceLogCosts.id, id));
  }

  // Replit Charges
  async getAllReplitCharges(): Promise<ReplitCharge[]> {
    return db.select().from(replitCharges)
      .orderBy(desc(replitCharges.chargeDate));
  }

  async getAllDevLogsSummary() {
    const logs = await db.select({
      id: maintenanceLogs.id,
      projectId: maintenanceLogs.projectId,
      description: maintenanceLogs.description,
      logDate: maintenanceLogs.logDate,
      minutesSpent: maintenanceLogs.minutesSpent,
      estimatedCostCents: maintenanceLogs.estimatedCostCents,
      logType: maintenanceLogs.logType,
      projectName: projects.name,
    })
      .from(maintenanceLogs)
      .innerJoin(projects, eq(maintenanceLogs.projectId, projects.id))
      .orderBy(desc(maintenanceLogs.logDate));

    if (logs.length === 0) {
      return { totalMinutes: 0, totalCostCents: 0, devCostCents: 0, hostingCostCents: 0, logs: [] };
    }

    const logIds = logs.map(l => l.id);
    const allCosts = await db.select({
      maintenanceLogId: maintenanceLogCosts.maintenanceLogId,
      costCents: maintenanceLogCosts.costCents,
    })
      .from(maintenanceLogCosts)
      .where(inArray(maintenanceLogCosts.maintenanceLogId, logIds));

    const costsByLogId = new Map<number, number>();
    for (const cost of allCosts) {
      costsByLogId.set(cost.maintenanceLogId, (costsByLogId.get(cost.maintenanceLogId) || 0) + cost.costCents);
    }

    let totalMinutes = 0;
    let totalCostCents = 0;
    let devCostCents = 0;
    let hostingCostCents = 0;
    const enrichedLogs = [];

    for (const log of logs) {
      const baseCost = log.estimatedCostCents || 0;
      const subCosts = costsByLogId.get(log.id) || 0;
      const logCost = baseCost + subCosts;

      totalMinutes += log.minutesSpent;
      totalCostCents += logCost;
      if (log.logType === "development") {
        devCostCents += logCost;
      } else {
        hostingCostCents += logCost;
      }

      enrichedLogs.push({
        id: log.id,
        projectId: log.projectId,
        projectName: log.projectName,
        description: log.description,
        logDate: log.logDate,
        minutesSpent: log.minutesSpent,
        totalCostCents: logCost,
        logType: log.logType,
      });
    }

    return { totalMinutes, totalCostCents, devCostCents, hostingCostCents, logs: enrichedLogs };
  }

  async getReplitCharges(year: number, month: number): Promise<ReplitCharge[]> {
    return db.select().from(replitCharges)
      .where(and(
        eq(replitCharges.billingYear, year),
        eq(replitCharges.billingMonth, month)
      ))
      .orderBy(desc(replitCharges.chargeDate));
  }

  async createReplitCharge(charge: InsertReplitCharge): Promise<ReplitCharge> {
    const [created] = await db.insert(replitCharges).values(charge).returning();
    return created;
  }

  async deleteReplitCharge(id: number): Promise<void> {
    await db.delete(replitCharges).where(eq(replitCharges.id, id));
  }

  async getReplitChargesSummary(year: number, month: number): Promise<{ totalCents: number; count: number }> {
    const charges = await db.select().from(replitCharges)
      .where(and(
        eq(replitCharges.billingYear, year),
        eq(replitCharges.billingMonth, month)
      ));
    const totalCents = charges.reduce((sum, c) => sum + c.amountCents, 0);
    return { totalCents, count: charges.length };
  }

  // Lead Engine
  async getAllLeadAudits(): Promise<LeadAudit[]> {
    return db.select().from(leadAudits).orderBy(desc(leadAudits.contactedAt));
  }

  async getLeadAuditBySlug(slug: string): Promise<LeadAudit | null> {
    const url = `https://jdcoredev.com/audits/${slug}`;
    const [row] = await db.select().from(leadAudits).where(eq(leadAudits.auditUrl, url)).limit(1);
    return row ?? null;
  }

  async upsertLeadAudit(data: InsertLeadAudit): Promise<LeadAudit> {
    const [result] = await db
      .insert(leadAudits)
      .values(data)
      .onConflictDoUpdate({
        target: leadAudits.domain,
        set: {
          name: data.name,
          location: data.location,
          industry: data.industry,
          auditUrl: data.auditUrl,
          htmlContent: data.htmlContent ?? undefined,
          channel: data.channel,
          status: data.status,
        },
      })
      .returning();
    return result;
  }

  async updateLeadAuditHtml(domain: string, html: string): Promise<void> {
    await db.update(leadAudits).set({ htmlContent: html }).where(eq(leadAudits.domain, domain));
  }

  async updateLeadAuditStatus(domain: string, status: string): Promise<void> {
    await db.update(leadAudits).set({ status }).where(eq(leadAudits.domain, domain));
  }

  async getAllLeadDrafts(): Promise<LeadDraft[]> {
    return db.select().from(leadDrafts).orderBy(desc(leadDrafts.createdAt));
  }

  async createLeadDraft(data: InsertLeadDraft): Promise<LeadDraft> {
    const [result] = await db.insert(leadDrafts).values(data).returning();
    return result;
  }

  async markLeadDraftSent(id: number): Promise<void> {
    await db.update(leadDrafts).set({ sent: true, sentAt: new Date() }).where(eq(leadDrafts.id, id));
  }

  async updateLeadDraft(id: number, data: { domain?: string; subject?: string; body?: string; auditUrl?: string | null }): Promise<void> {
    await db.update(leadDrafts).set(data).where(eq(leadDrafts.id, id));
  }

  async deleteLeadAudit(domain: string): Promise<void> {
    await db.delete(leadAudits).where(eq(leadAudits.domain, domain));
  }

  async deleteLeadDraft(id: number): Promise<void> {
    await db.delete(leadDrafts).where(eq(leadDrafts.id, id));
  }

  async getLeadEngineSettings() {
    const [row] = await db.select().from(leadEngineSettings).limit(1);
    return row ? { industries: row.industries, signals: row.signals, exclusions: row.exclusions, count: row.count, fromEmail: row.fromEmail, replyTo: row.replyTo } : null;
  }

  async upsertLeadEngineSettings(data: { industries: string[]; signals: string[]; exclusions: string[]; count: number; fromEmail: string; replyTo: string; }): Promise<void> {
    const [existing] = await db.select({ id: leadEngineSettings.id }).from(leadEngineSettings).limit(1);
    if (existing) {
      await db.update(leadEngineSettings).set({ ...data, updatedAt: new Date() }).where(eq(leadEngineSettings.id, existing.id));
    } else {
      await db.insert(leadEngineSettings).values(data);
    }
  }

  // ─── Referral Partners ──────────────────────────────────────────────────
  async getReferralPartners(): Promise<ReferralPartner[]> {
    return db.select().from(referralPartners).orderBy(desc(referralPartners.createdAt));
  }

  async getReferralPartner(id: number): Promise<ReferralPartner | undefined> {
    const [row] = await db.select().from(referralPartners).where(eq(referralPartners.id, id));
    return row;
  }

  async createReferralPartner(data: InsertReferralPartner): Promise<ReferralPartner> {
    const [row] = await db.insert(referralPartners).values(data).returning();
    return row;
  }

  async updateReferralPartner(id: number, data: Partial<InsertReferralPartner>): Promise<ReferralPartner | undefined> {
    const [row] = await db.update(referralPartners)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(referralPartners.id, id))
      .returning();
    return row;
  }

  async getReferralPartnerSummary(id: number): Promise<ReferralPartnerSummary | undefined> {
    const partner = await this.getReferralPartner(id);
    if (!partner) return undefined;

    // Active clients attributed to partner.
    const [{ activeClientCount }] = await db
      .select({ activeClientCount: sql<number>`count(*)::int` })
      .from(clients)
      .where(and(eq(clients.referredByPartnerId, id), ne(clients.status, "past")));

    // Active projects under those clients (excluding completed projects).
    const [{ activeProjectCount }] = await db
      .select({ activeProjectCount: sql<number>`count(*)::int` })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(
        and(
          eq(clients.referredByPartnerId, id),
          ne(projects.status, "completed"),
        ),
      );

    // Lifetime totals.
    const [accruedRow] = await db
      .select({ total: sql<number>`coalesce(sum(${commissionEntries.commissionCents}), 0)::bigint` })
      .from(commissionEntries)
      .where(and(eq(commissionEntries.partnerId, id), ne(commissionEntries.status, "cancelled")));

    const [paidRow] = await db
      .select({ total: sql<number>`coalesce(sum(${commissionEntries.commissionCents}), 0)::bigint` })
      .from(commissionEntries)
      .where(and(eq(commissionEntries.partnerId, id), eq(commissionEntries.status, "paid")));

    const [dueRow] = await db
      .select({ total: sql<number>`coalesce(sum(${commissionEntries.commissionCents}), 0)::bigint` })
      .from(commissionEntries)
      .where(and(eq(commissionEntries.partnerId, id), eq(commissionEntries.status, "due")));

    return {
      ...partner,
      activeClientCount: Number(activeClientCount ?? 0),
      activeProjectCount: Number(activeProjectCount ?? 0),
      totalAccruedCents: Number(accruedRow.total ?? 0),
      totalPaidCents: Number(paidRow.total ?? 0),
      totalDueCents: Number(dueRow.total ?? 0),
    };
  }

  // ─── Project Costs ──────────────────────────────────────────────────────
  async getProjectCosts(projectId: number): Promise<ProjectCost[]> {
    return db.select().from(projectCosts)
      .where(eq(projectCosts.projectId, projectId))
      .orderBy(desc(projectCosts.incurredDate), desc(projectCosts.id));
  }

  async createProjectCost(data: InsertProjectCost): Promise<ProjectCost> {
    const [row] = await db.insert(projectCosts).values(data).returning();
    return row;
  }

  async updateProjectCost(id: number, data: Partial<InsertProjectCost>): Promise<ProjectCost | undefined> {
    const [row] = await db.update(projectCosts).set(data).where(eq(projectCosts.id, id)).returning();
    return row;
  }

  async deleteProjectCost(id: number): Promise<void> {
    await db.delete(projectCosts).where(eq(projectCosts.id, id));
  }

  async getProjectCostsSum(projectId: number): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${projectCosts.amountCents}), 0)::bigint` })
      .from(projectCosts)
      .where(eq(projectCosts.projectId, projectId));
    return Number(row?.total ?? 0);
  }

  // ─── Commission Entries ─────────────────────────────────────────────────
  async getCommissionEntries(filter?: { partnerId?: number; clientId?: number; projectId?: number; status?: string; }): Promise<CommissionEntry[]> {
    const conds = [];
    if (filter?.partnerId !== undefined) conds.push(eq(commissionEntries.partnerId, filter.partnerId));
    if (filter?.clientId !== undefined) conds.push(eq(commissionEntries.clientId, filter.clientId));
    if (filter?.projectId !== undefined) conds.push(eq(commissionEntries.projectId, filter.projectId));
    if (filter?.status !== undefined) conds.push(eq(commissionEntries.status, filter.status as any));
    const q = db.select().from(commissionEntries);
    if (conds.length > 0) {
      return q.where(and(...conds)).orderBy(desc(commissionEntries.createdAt));
    }
    return q.orderBy(desc(commissionEntries.createdAt));
  }

  async getCommissionEntry(id: number): Promise<CommissionEntry | undefined> {
    const [row] = await db.select().from(commissionEntries).where(eq(commissionEntries.id, id));
    return row;
  }

  async getCommissionEntryByProject(projectId: number, sourceType: string): Promise<CommissionEntry | undefined> {
    const [row] = await db.select().from(commissionEntries)
      .where(and(eq(commissionEntries.projectId, projectId), eq(commissionEntries.sourceType, sourceType)));
    return row;
  }

  async createCommissionEntry(data: InsertCommissionEntry): Promise<CommissionEntry> {
    const [row] = await db.insert(commissionEntries).values(data).returning();
    return row;
  }

  async updateCommissionEntry(id: number, data: Partial<InsertCommissionEntry>): Promise<CommissionEntry | undefined> {
    const [row] = await db.update(commissionEntries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(commissionEntries.id, id))
      .returning();
    return row;
  }

  async getProjectGrossPaidCents(projectId: number): Promise<number> {
    // Gross commissionable revenue = sum of milestones marked "paid" on this project.
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${milestones.amountCents}), 0)::bigint` })
      .from(milestones)
      .where(and(eq(milestones.projectId, projectId), eq(milestones.status, "paid")));
    return Number(row?.total ?? 0);
  }
}

export const storage = new DatabaseStorage();
