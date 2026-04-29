import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { db } from "./db";
import {
  users, clients, projects, availabilityRules, milestones, activityEvents, officeDayRequests,
  projectProcessSteps, projectPrompts, projectAgreements, projectHistoryEvents, meetingRequests,
  meetingProposals, reminders
} from "@shared/schema";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  await db.delete(activityEvents);
  await db.delete(reminders);
  await db.delete(meetingProposals);
  await db.delete(meetingRequests);
  await db.delete(officeDayRequests);
  await db.delete(projectHistoryEvents);
  await db.delete(projectAgreements);
  await db.delete(projectPrompts);
  await db.delete(projectProcessSteps);
  await db.delete(milestones);
  await db.delete(projects);
  await db.delete(users);
  await db.delete(clients);

  const adminPassword = await bcrypt.hash("admin123", 10);
  const [adminUser] = await db
    .insert(users)
    .values({
      email: "joshuadeacon888@gmail.com",
      password: adminPassword,
      role: "admin",
    })
    .returning();

  console.log("Created admin user:", adminUser?.email);

  const [client1] = await db
    .insert(clients)
    .values({
      name: "Sarah Mitchell",
      email: "sarah@techstartup.io",
      phone: "+1 (415) 555-0123",
      address: "123 Innovation Way",
      city: "San Francisco",
      state: "CA",
      zipCode: "94105",
      country: "USA",
      companyName: "TechStartup Inc",
      industry: "Technology",
      notes: "Referred by John from NetworkingEvent. Very interested in rapid prototyping.",
      firstContactDate: "2025-10-15",
      status: "active",
    })
    .returning();

  const [client2] = await db
    .insert(clients)
    .values({
      name: "Marcus Chen",
      email: "marcus@greenleaf.com",
      phone: "+1 (212) 555-0456",
      address: "456 Sustainable Blvd",
      city: "New York",
      state: "NY",
      zipCode: "10001",
      country: "USA",
      companyName: "GreenLeaf Solutions",
      industry: "Environmental Services",
      notes: "Met at sustainability conference. Needs inventory management system.",
      firstContactDate: "2025-09-01",
      status: "active",
    })
    .returning();

  const [client3] = await db
    .insert(clients)
    .values({
      name: "Emma Rodriguez",
      email: "emma@artisanfoods.co",
      phone: "+1 (512) 555-0789",
      address: "789 Culinary Lane",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      country: "USA",
      companyName: "Artisan Foods Co",
      industry: "Food & Beverage",
      notes: "Small business owner expanding to e-commerce. Budget conscious.",
      firstContactDate: "2025-11-20",
      status: "active",
    })
    .returning();

  const [client4] = await db
    .insert(clients)
    .values({
      name: "David Thompson",
      email: "david@legalpro.law",
      phone: "+1 (617) 555-0321",
      address: "321 Justice Ave",
      city: "Boston",
      state: "MA",
      zipCode: "02108",
      country: "USA",
      companyName: "LegalPro Associates",
      industry: "Legal Services",
      notes: "Completed website redesign. Very satisfied. May return for phase 2.",
      firstContactDate: "2025-06-10",
      status: "past",
    })
    .returning();

  console.log("Created example clients");

  const clientPassword = await bcrypt.hash("demo123", 10);
  const [clientUser] = await db
    .insert(users)
    .values({
      email: "demo@client.com",
      password: clientPassword,
      role: "client",
      clientId: client1.id,
    })
    .returning();

  console.log("Created client user:", clientUser?.email);

  const [project1] = await db
    .insert(projects)
    .values({
      clientId: client1.id,
      name: "SaaS Dashboard MVP",
      description: "Full-stack SaaS dashboard with user authentication, analytics, and subscription management",
      status: "active",
      billingModel: "fixed",
      riskState: "on_track",
      startDate: "2025-12-01",
      endDate: "2026-02-28",
    })
    .returning();

  const [project2] = await db
    .insert(projects)
    .values({
      clientId: client2.id,
      name: "Inventory Management System",
      description: "Custom inventory tracking with barcode scanning and automated reordering",
      status: "active",
      billingModel: "fixed",
      riskState: "at_risk",
      startDate: "2025-11-15",
      endDate: "2026-01-31",
    })
    .returning();

  const [project3] = await db
    .insert(projects)
    .values({
      clientId: client3.id,
      name: "E-commerce Platform",
      description: "Online store with product catalog, cart, and Stripe payment integration",
      status: "active",
      billingModel: "fixed",
      riskState: "on_track",
      startDate: "2025-12-15",
      endDate: "2026-03-15",
    })
    .returning();

  const [project4] = await db
    .insert(projects)
    .values({
      clientId: client4.id,
      name: "Law Firm Website Redesign",
      description: "Modern responsive website with case study portfolio and contact forms",
      status: "completed",
      billingModel: "fixed",
      riskState: "on_track",
      startDate: "2025-07-01",
      endDate: "2025-09-30",
    })
    .returning();

  const [project5] = await db
    .insert(projects)
    .values({
      clientId: client1.id,
      name: "Mobile App Prototype",
      description: "React Native mobile companion app for the SaaS dashboard",
      status: "lead",
      billingModel: "day_rate",
      riskState: "on_track",
      startDate: null,
      endDate: null,
    })
    .returning();

  console.log("Created example projects");

  await db.insert(milestones).values([
    { projectId: project1.id, name: "Discovery & Planning", amountCents: 200000, dueDate: "2025-12-15", status: "paid" },
    { projectId: project1.id, name: "UI/UX Design", amountCents: 300000, dueDate: "2025-12-31", status: "paid" },
    { projectId: project1.id, name: "Frontend Development", amountCents: 400000, dueDate: "2026-01-20", status: "invoiced" },
    { projectId: project1.id, name: "Backend & API", amountCents: 400000, dueDate: "2026-02-10", status: "planned" },
    { projectId: project1.id, name: "Testing & Launch", amountCents: 200000, dueDate: "2026-02-28", status: "planned" },
  ]);

  await db.insert(milestones).values([
    { projectId: project2.id, name: "Requirements Gathering", amountCents: 150000, dueDate: "2025-11-25", status: "paid" },
    { projectId: project2.id, name: "Database Design", amountCents: 200000, dueDate: "2025-12-10", status: "overdue" },
    { projectId: project2.id, name: "Core Features", amountCents: 350000, dueDate: "2026-01-10", status: "planned" },
    { projectId: project2.id, name: "Integration & Testing", amountCents: 300000, dueDate: "2026-01-31", status: "planned" },
  ]);

  await db.insert(milestones).values([
    { projectId: project3.id, name: "Store Setup", amountCents: 250000, dueDate: "2025-12-31", status: "invoiced" },
    { projectId: project3.id, name: "Product Catalog", amountCents: 300000, dueDate: "2026-01-31", status: "planned" },
    { projectId: project3.id, name: "Payment Integration", amountCents: 250000, dueDate: "2026-02-28", status: "planned" },
    { projectId: project3.id, name: "Launch & Training", amountCents: 200000, dueDate: "2026-03-15", status: "planned" },
  ]);

  await db.insert(milestones).values([
    { projectId: project4.id, name: "Design Phase", amountCents: 300000, dueDate: "2025-07-31", status: "paid" },
    { projectId: project4.id, name: "Development", amountCents: 400000, dueDate: "2025-08-31", status: "paid" },
    { projectId: project4.id, name: "Content & Launch", amountCents: 300000, dueDate: "2025-09-30", status: "paid" },
  ]);

  console.log("Created milestones for all projects");

  await db.insert(projectProcessSteps).values([
    { projectId: project1.id, title: "Discovery & Requirements", description: "Initial meetings to gather requirements and understand business needs", stepOrder: 0, status: "done" },
    { projectId: project1.id, title: "UI/UX Design", description: "Create wireframes and mockups for the dashboard interface", stepOrder: 1, status: "done" },
    { projectId: project1.id, title: "Frontend Development", description: "Build the React frontend with all dashboard components", stepOrder: 2, status: "in_progress" },
    { projectId: project1.id, title: "Backend API", description: "Develop the Express API with authentication and data endpoints", stepOrder: 3, status: "planned" },
    { projectId: project1.id, title: "Testing & QA", description: "Comprehensive testing and bug fixes", stepOrder: 4, status: "planned" },
    { projectId: project1.id, title: "Deployment & Launch", description: "Deploy to production and provide training", stepOrder: 5, status: "planned" },
  ]);

  await db.insert(projectProcessSteps).values([
    { projectId: project2.id, title: "Requirements Analysis", description: "Document all inventory tracking requirements", stepOrder: 0, status: "done" },
    { projectId: project2.id, title: "Database Design", description: "Design the database schema for inventory data", stepOrder: 1, status: "in_progress" },
    { projectId: project2.id, title: "Core Features", description: "Build scanning, tracking, and reporting features", stepOrder: 2, status: "planned" },
    { projectId: project2.id, title: "Integration", description: "Integrate with existing systems", stepOrder: 3, status: "planned" },
  ]);

  console.log("Created process steps for projects");

  await db.insert(projectPrompts).values([
    { projectId: project1.id, promptTitle: "Dashboard Layout Review", promptText: "Generate a modern dashboard layout with sidebar navigation, metric cards, and data tables", outputSummary: "Created responsive layout with collapsible sidebar, 4 KPI cards, and interactive data grid", tags: "ui,dashboard,layout", visibleToClient: true, createdByUserId: adminUser.id },
    { projectId: project1.id, promptTitle: "Authentication Flow Design", promptText: "Design secure authentication flow with email/password and OAuth options", outputSummary: "Implemented JWT-based auth with session management and Google OAuth integration", tags: "auth,security", visibleToClient: true, createdByUserId: adminUser.id },
    { projectId: project1.id, promptTitle: "Database Schema Planning", promptText: "Plan the database schema for users, subscriptions, and analytics data", outputSummary: "Created normalized schema with 12 tables covering all core entities", tags: "database,schema", visibleToClient: false, createdByUserId: adminUser.id },
    { projectId: project2.id, promptTitle: "Barcode Integration Research", promptText: "Research best libraries for barcode scanning in React Native", outputSummary: "Recommended react-native-camera with ML Kit for reliable scanning", tags: "research,mobile", visibleToClient: true, createdByUserId: adminUser.id },
  ]);

  console.log("Created prompts for projects");

  await db.insert(projectAgreements).values([
    { projectId: project1.id, title: "SaaS Dashboard - Statement of Work", agreementType: "sow", signed: true, notes: "Covers full project scope and deliverables" },
    { projectId: project1.id, title: "Master Services Agreement", agreementType: "msa", signed: true, notes: "Standard consulting terms" },
    { projectId: project1.id, title: "Non-Disclosure Agreement", agreementType: "nda", signed: true, notes: "Mutual NDA for project confidentiality" },
    { projectId: project2.id, title: "Inventory System SOW", agreementType: "sow", signed: true, notes: "Detailed scope for inventory management system" },
    { projectId: project2.id, title: "Master Services Agreement", agreementType: "msa", signed: false, notes: "Pending legal review" },
    { projectId: project3.id, title: "E-commerce Platform SOW", agreementType: "sow", signed: true, notes: "Complete e-commerce deliverables" },
    { projectId: project4.id, title: "Website Redesign Contract", agreementType: "contract", signed: true, notes: "Fixed price contract for website redesign" },
  ]);

  console.log("Created agreements for projects");

  await db.insert(projectHistoryEvents).values([
    { projectId: project1.id, eventType: "meeting", occurredAt: new Date("2025-10-20"), summary: "Initial discovery call", details: "Discussed project scope, timeline, and budget. Client wants SaaS dashboard with analytics.", createdByUserId: adminUser.id },
    { projectId: project1.id, eventType: "email", occurredAt: new Date("2025-10-22"), summary: "Sent project proposal", details: "Shared detailed proposal including feature list, timeline, and pricing breakdown.", createdByUserId: adminUser.id },
    { projectId: project1.id, eventType: "call", occurredAt: new Date("2025-10-25"), summary: "Proposal review call", details: "Client had questions about the timeline. Agreed to start in November.", createdByUserId: adminUser.id },
    { projectId: project1.id, eventType: "meeting", occurredAt: new Date("2025-11-01"), summary: "Project kickoff meeting", details: "Walked through the PRD, discussed design preferences, and set up communication channels.", createdByUserId: adminUser.id },
    { projectId: project1.id, eventType: "deliverable", occurredAt: new Date("2025-11-15"), summary: "Delivered initial wireframes", details: "Shared Figma link with wireframes for dashboard, analytics, and settings pages.", createdByUserId: adminUser.id },
    { projectId: project1.id, eventType: "note", occurredAt: new Date("2025-12-01"), summary: "Client feedback on designs", details: "Client loves the direction. Requested minor tweaks to color scheme.", createdByUserId: adminUser.id },
    { projectId: project2.id, eventType: "meeting", occurredAt: new Date("2025-09-15"), summary: "Initial consultation", details: "Discussed inventory management needs. Client has 500+ SKUs to track.", createdByUserId: adminUser.id },
    { projectId: project2.id, eventType: "email", occurredAt: new Date("2025-09-20"), summary: "Sent requirements questionnaire", details: "Asked client to fill out detailed requirements form.", createdByUserId: adminUser.id },
    { projectId: project3.id, eventType: "meeting", occurredAt: new Date("2025-11-25"), summary: "E-commerce discovery call", details: "Small business owner wants simple Shopify alternative with lower fees.", createdByUserId: adminUser.id },
  ]);

  console.log("Created history events for projects");

  await db.insert(officeDayRequests).values([
    {
      clientId: client1.id,
      projectId: project1.id,
      requestedByUserId: clientUser.id,
      date: "2026-01-06",
      dayType: "onsite",
      notes: "Sprint planning for frontend development",
      status: "approved",
    },
    {
      clientId: client1.id,
      projectId: project1.id,
      requestedByUserId: clientUser.id,
      date: "2026-01-08",
      dayType: "remote",
      notes: "Code review session",
      status: "approved",
    },
    {
      clientId: client2.id,
      projectId: project2.id,
      requestedByUserId: adminUser.id,
      date: "2026-01-07",
      dayType: "onsite",
      notes: "Emergency database architecture review",
      status: "approved",
    },
    {
      clientId: client3.id,
      projectId: project3.id,
      requestedByUserId: adminUser.id,
      date: "2026-01-10",
      dayType: "onsite",
      notes: "Product catalog demo",
      status: "requested",
    },
    {
      clientId: client1.id,
      projectId: project1.id,
      requestedByUserId: clientUser.id,
      date: "2026-01-13",
      dayType: "onsite",
      notes: "Backend API review",
      status: "requested",
    },
  ]);

  console.log("Created office day requests");

  const [meetingRequest1] = await db.insert(meetingRequests).values({
    name: "Alex Johnson",
    email: "alex@startup.io",
    company: "InnovateTech",
    meetingType: "video",
    requestedDate: "2026-01-08",
    requestedTime: "10:00",
    duration: 30,
    status: "requested",
    secureToken: randomBytes(32).toString("hex"),
  }).returning();

  const [meetingRequest2] = await db.insert(meetingRequests).values({
    name: "Jessica Lee",
    email: "jessica@designstudio.com",
    company: "Creative Design Studio",
    meetingType: "call",
    requestedDate: "2026-01-09",
    requestedTime: "14:00",
    duration: 30,
    status: "confirmed",
    secureToken: randomBytes(32).toString("hex"),
  }).returning();

  const [meetingRequest3] = await db.insert(meetingRequests).values({
    name: "Robert Kim",
    email: "robert@enterprise.co",
    company: "Enterprise Solutions",
    meetingType: "video",
    requestedDate: "2026-01-10",
    requestedTime: "11:00",
    duration: 60,
    status: "proposed",
    secureToken: randomBytes(32).toString("hex"),
  }).returning();

  console.log("Created meeting requests");

  await db.insert(meetingProposals).values([
    {
      meetingRequestId: meetingRequest3.id,
      proposedDate: "2026-01-11",
      proposedTime: "09:00",
      duration: 60,
      accepted: false,
    },
    {
      meetingRequestId: meetingRequest3.id,
      proposedDate: "2026-01-12",
      proposedTime: "14:00",
      duration: 60,
      accepted: false,
    },
  ]);

  console.log("Created meeting proposals");

  const meeting2Date = new Date("2026-01-09T14:00:00Z");
  const reminder24hBefore = new Date(meeting2Date.getTime() - 24 * 60 * 60 * 1000);
  const reminder1hBefore = new Date(meeting2Date.getTime() - 1 * 60 * 60 * 1000);

  await db.insert(reminders).values([
    {
      reminderType: "meeting",
      entityId: meetingRequest2.id,
      recipientType: "admin",
      recipientEmail: adminUser.email,
      channel: "email",
      sendAt: reminder24hBefore,
      status: "pending",
      idempotencyKey: `meeting:${meetingRequest2.id}:admin:email:24h`,
    },
    {
      reminderType: "meeting",
      entityId: meetingRequest2.id,
      recipientType: "admin",
      recipientEmail: adminUser.email,
      channel: "email",
      sendAt: reminder1hBefore,
      status: "pending",
      idempotencyKey: `meeting:${meetingRequest2.id}:admin:email:1h`,
    },
    {
      reminderType: "meeting",
      entityId: meetingRequest2.id,
      recipientType: "client",
      recipientEmail: "jessica@designstudio.com",
      channel: "email",
      sendAt: reminder24hBefore,
      status: "pending",
      idempotencyKey: `meeting:${meetingRequest2.id}:client:email:24h`,
    },
    {
      reminderType: "meeting",
      entityId: meetingRequest2.id,
      recipientType: "client",
      recipientEmail: "jessica@designstudio.com",
      channel: "email",
      sendAt: reminder1hBefore,
      status: "pending",
      idempotencyKey: `meeting:${meetingRequest2.id}:client:email:1h`,
    },
  ]);

  console.log("Created reminders");

  const existingRules = await db.select().from(availabilityRules);
  if (existingRules.length === 0) {
    await db.insert(availabilityRules).values({
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: false,
      sunday: false,
      defaultType: "both",
      maxDaysPerWeek: 5,
      maxDaysPerMonth: 20,
    });
    console.log("Created availability rules");
  }

  console.log("\n=== Login Credentials ===");
  console.log("Admin: joshuadeacon888@gmail.com / admin123");
  console.log("Demo Client: demo@client.com / demo123");
  console.log("=========================\n");
  
  console.log("Seeding complete!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
