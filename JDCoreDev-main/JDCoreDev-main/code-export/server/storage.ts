import { eq, desc, and, or, ne, gte, lte, sql } from "drizzle-orm";
import { db } from "./db";
import {
  users, clients, contacts, projects, availabilityRules, availabilityBlocks,
  officeDayRequests, milestones, documents, activityEvents, contactSubmissions,
  projectProcessSteps, projectPrompts, projectAgreements, projectHistoryEvents,
  calendarBlocks, googleCalendarAccounts, meetingRequests, meetingProposals, reminders,
  hostingTerms, projectHostingTerms, generatedContracts,
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
  getMilestonesByProject(projectId: number): Promise<Milestone[]>;
  getMilestonesByClient(clientId: number): Promise<Milestone[]>;
  createMilestone(milestone: InsertMilestone): Promise<Milestone>;
  updateMilestone(id: number, data: Partial<InsertMilestone>): Promise<Milestone | undefined>;
  deleteMilestone(id: number): Promise<void>;

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

  async updateMilestone(id: number, data: Partial<InsertMilestone>): Promise<Milestone | undefined> {
    const [updated] = await db.update(milestones).set(data).where(eq(milestones.id, id)).returning();
    return updated;
  }

  async deleteMilestone(id: number): Promise<void> {
    await db.delete(milestones).where(eq(milestones.id, id));
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
}

export const storage = new DatabaseStorage();
