import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { storage } from "./storage";
import { 
  insertClientSchema, insertProjectSchema, insertMilestoneSchema,
  insertAvailabilityBlockSchema, insertContactSubmissionSchema, insertDocumentSchema,
  insertProjectProcessStepSchema, insertProjectPromptSchema, insertProjectAgreementSchema,
  insertProjectHistoryEventSchema, insertCalendarBlockSchema, insertMeetingRequestSchema, insertMeetingProposalSchema,
  insertProjectHostingTermsSchema, insertContactSchema, insertOfficeDayRequestSchema, insertGeneratedContractSchema,
  type User, type MeetingRequest
} from "@shared/schema";
import crypto from "crypto";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "./replit_integrations/object_storage";
import { sendEmail, formatContactInquiryEmail } from "./email";

function logSecurityEvent(
  eventType: string,
  details: Record<string, any>,
  ip?: string
) {
  const timestamp = new Date().toISOString();
  console.log(
    `[SECURITY] ${timestamp} | ${eventType} | IP: ${ip || "unknown"} | ${JSON.stringify(details)}`
  );
}

const rateLimitConfig = {
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
};

const loginLimiter = rateLimit({
  ...rateLimitConfig,
  windowMs: 60 * 1000,
  max: 5,
  message: { message: "Too many login attempts. Please try again in 1 minute." },
  handler: (req, res) => {
    logSecurityEvent("RATE_LIMIT_LOGIN", { email: req.body?.email }, req.ip);
    res.status(429).json({ message: "Too many login attempts. Please try again in 1 minute." });
  },
});

const registrationLimiter = rateLimit({
  ...rateLimitConfig,
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { message: "Too many registration attempts. Please try again later." },
  handler: (req, res) => {
    logSecurityEvent("RATE_LIMIT_REGISTRATION", { email: req.body?.email }, req.ip);
    res.status(429).json({ message: "Too many registration attempts. Please try again later." });
  },
});

const generalApiLimiter = rateLimit({
  ...rateLimitConfig,
  windowMs: 60 * 1000,
  max: 100,
  message: { message: "Too many requests. Please slow down." },
});

const uploadLimiter = rateLimit({
  ...rateLimitConfig,
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { message: "Upload limit reached. Please try again later." },
});

const idParamSchema = z.coerce.number().int().positive();
const uuidSchema = z.string().uuid();

function validateIdParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = idParamSchema.safeParse(req.params[paramName]);
    if (!result.success) {
      return res.status(400).json({ message: `Invalid ${paramName}` });
    }
    next();
  };
}

// Helper to get week key for capacity tracking
function getWeekKey(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(date);
  weekStart.setDate(diff);
  return weekStart.toISOString().split('T')[0];
}

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User {
      id: number;
      email: string;
      username: string | null;
      password: string;
      role: "admin" | "client";
      clientId: number | null;
      createdAt: Date;
    }
  }
}

// Middleware to require authentication
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

// Middleware to require admin role
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

// Middleware to require client role
function requireClient(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Trust proxy (behind Replit's reverse proxy in both dev and prod)
  app.set("trust proxy", 1);

  // Apply general rate limiting to all API routes
  app.use("/api", generalApiLimiter);

  // PostgreSQL session store with 7-day expiration
  const PgSession = connectPgSimple(session);
  const sessionStore = new PgSession({
    pool: pool,
    tableName: "user_sessions",
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 60, // Prune expired sessions every hour
  });

  app.use(
    session({
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    })
  );

  // Passport setup
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (emailOrUsername, password, done) => {
        try {
          // Allow login with either email or username
          const user = await storage.getUserByEmailOrUsername(emailOrUsername);
          if (!user) {
            return done(null, false, { message: "Invalid credentials" });
          }
          const isValid = await bcrypt.compare(password, user.password);
          if (!isValid) {
            return done(null, false, { message: "Invalid credentials" });
          }
          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || null);
    } catch (error) {
      done(error);
    }
  });

  // ============ Auth Routes ============
  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      const { password, ...userWithoutPassword } = req.user!;
      res.json(userWithoutPassword);
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  const loginSchema = z.object({
    email: z.string().min(1).max(255).trim(),
    password: z.string().min(1).max(128),
  });

  app.post("/api/login", loginLimiter, (req, res, next) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      logSecurityEvent("LOGIN_INVALID_INPUT", { errors: result.error.issues }, req.ip);
      return res.status(400).json({ message: "Invalid input" });
    }

    passport.authenticate("local", (err: any, user: User | false, info: any) => {
      if (err) return next(err);
      if (!user) {
        logSecurityEvent("LOGIN_FAILED", { email: result.data.email }, req.ip);
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.logIn(user, (err) => {
        if (err) return next(err);
        logSecurityEvent("LOGIN_SUCCESS", { userId: user.id, email: user.email }, req.ip);
        const { password, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      });
    })(req, res, next);
  });

  const registerSchema = z.object({
    email: z.string().email().max(255).trim(),
    password: z.string().min(8).max(128),
    role: z.enum(["admin", "client"]).optional(),
  });

  app.post("/api/register", registrationLimiter, async (req, res, next) => {
    try {
      const result = registerSchema.safeParse(req.body);
      if (!result.success) {
        logSecurityEvent("REGISTRATION_INVALID_INPUT", { errors: result.error.issues }, req.ip);
        return res.status(400).json({ message: "Invalid input" });
      }

      const { email, password, role } = result.data;
      const normalizedEmail = email.toLowerCase();
      
      const existing = await storage.getUserByEmail(normalizedEmail);
      if (existing) {
        logSecurityEvent("REGISTRATION_EMAIL_EXISTS", { email: normalizedEmail }, req.ip);
        return res.status(400).json({ message: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        email: normalizedEmail,
        password: hashedPassword,
        role: role || "client",
      });

      logSecurityEvent("REGISTRATION_SUCCESS", { userId: user.id, email: normalizedEmail }, req.ip);

      req.logIn(user, (err) => {
        if (err) return next(err);
        const { password: _, ...userWithoutPassword } = user;
        res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });

  // ============ First-Time Admin Setup ============
  const setupAdminSchema = z.object({
    email: z.string().email().max(255).trim(),
    username: z.string().min(3).max(50).trim(),
    password: z.string().min(8).max(128),
  });

  app.post("/api/setup-admin", registrationLimiter, async (req, res, next) => {
    try {
      // Only allow if no admin exists yet
      const hasAdmin = await storage.hasAdminUser();
      if (hasAdmin) {
        logSecurityEvent("SETUP_ADMIN_BLOCKED", { reason: "admin_exists" }, req.ip);
        return res.status(403).json({ message: "Admin account already exists" });
      }

      const result = setupAdminSchema.safeParse(req.body);
      if (!result.success) {
        logSecurityEvent("SETUP_ADMIN_INVALID_INPUT", { errors: result.error.issues }, req.ip);
        return res.status(400).json({ message: "Email, username, and password are required" });
      }

      const { email, username, password } = result.data;
      const normalizedEmail = email.toLowerCase();
      const normalizedUsername = username.toLowerCase();

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        email: normalizedEmail,
        username: normalizedUsername,
        password: hashedPassword,
        role: "admin",
      });

      logSecurityEvent("SETUP_ADMIN_SUCCESS", { userId: user.id, email: normalizedEmail }, req.ip);

      req.logIn(user, (err) => {
        if (err) return next(err);
        const { password: _, ...userWithoutPassword } = user;
        res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      next(error);
    }
  });

  // Check if setup is needed
  app.get("/api/setup-status", async (req, res) => {
    const hasAdmin = await storage.hasAdminUser();
    res.json({ setupComplete: hasAdmin });
  });

  // ============ Contact Form (Public) ============
  app.post("/api/contact", async (req, res, next) => {
    try {
      const data = insertContactSubmissionSchema.parse(req.body);
      const submission = await storage.createContactSubmission(data);
      
      // Send email notification to admin
      const emailData = formatContactInquiryEmail({
        name: data.name,
        email: data.email,
        company: data.company || undefined,
        appType: data.appType || undefined,
        budget: data.budget || undefined,
        timeline: data.timeline || undefined,
        message: data.message,
      });
      
      if (emailData.to) {
        sendEmail(emailData).catch(err => {
          console.error("[Contact] Failed to send notification email:", err);
        });
      }
      
      res.status(201).json(submission);
    } catch (error) {
      next(error);
    }
  });

  // ============ Admin Routes ============
  
  // Clients
  app.get("/api/admin/clients", requireAdmin, async (req, res, next) => {
    try {
      const clients = await storage.getClients();
      res.json(clients);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/clients", requireAdmin, async (req, res, next) => {
    try {
      const data = insertClientSchema.parse(req.body);
      const client = await storage.createClient(data);
      await storage.createActivityEvent({
        entityType: "client",
        entityId: client.id,
        eventType: "client_created",
        message: `Client "${client.name}" was created`,
        createdByUserId: req.user!.id,
      });
      res.status(201).json(client);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/clients/:id", requireAdmin, async (req, res, next) => {
    try {
      const clientId = parseInt(req.params.id);
      const data = insertClientSchema.partial().parse(req.body);
      const updated = await storage.updateClient(clientId, data);
      if (!updated) {
        return res.status(404).json({ message: "Client not found" });
      }
      await storage.createActivityEvent({
        entityType: "client",
        entityId: updated.id,
        eventType: "client_updated",
        message: `Client "${updated.name}" was updated`,
        createdByUserId: req.user!.id,
      });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  // Projects
  app.get("/api/admin/projects", requireAdmin, async (req, res, next) => {
    try {
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/projects", requireAdmin, async (req, res, next) => {
    try {
      const data = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(data);
      await storage.createActivityEvent({
        entityType: "project",
        entityId: project.id,
        eventType: "project_created",
        message: `Project "${project.name}" was created`,
        createdByUserId: req.user!.id,
      });
      res.status(201).json(project);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/projects/:id", requireAdmin, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.id);
      const updated = await storage.updateProject(projectId, req.body);
      if (!updated) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  // Availability Rules
  app.get("/api/admin/availability/rules", requireAdmin, async (req, res, next) => {
    try {
      let rules = await storage.getAvailabilityRules();
      if (!rules) {
        // Create default rules
        rules = await storage.upsertAvailabilityRules({
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
      }
      res.json(rules);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/admin/availability/rules", requireAdmin, async (req, res, next) => {
    try {
      const rules = await storage.upsertAvailabilityRules(req.body);
      res.json(rules);
    } catch (error) {
      next(error);
    }
  });

  // Availability Blocks
  app.get("/api/admin/availability/blocks", requireAdmin, async (req, res, next) => {
    try {
      const blocks = await storage.getAvailabilityBlocks();
      res.json(blocks);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/availability/blocks", requireAdmin, async (req, res, next) => {
    try {
      const data = insertAvailabilityBlockSchema.parse(req.body);
      const block = await storage.createAvailabilityBlock(data);
      res.status(201).json(block);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/availability/blocks/:id", requireAdmin, async (req, res, next) => {
    try {
      await storage.deleteAvailabilityBlock(parseInt(req.params.id));
      res.json({ message: "Block deleted" });
    } catch (error) {
      next(error);
    }
  });

  // Office Day Requests
  app.get("/api/admin/office-days", requireAdmin, async (req, res, next) => {
    try {
      const requests = await storage.getOfficeDayRequests();
      // Enrich with client and project data
      const enriched = await Promise.all(
        requests.map(async (r) => {
          const client = await storage.getClient(r.clientId);
          const project = await storage.getProject(r.projectId);
          return { ...r, client, project };
        })
      );
      res.json(enriched);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/office-days/:id", requireAdmin, async (req, res, next) => {
    try {
      const { status } = req.body;
      const requestId = parseInt(req.params.id);
      const updated = await storage.updateOfficeDayRequest(requestId, {
        status,
        decidedByUserId: req.user!.id,
        decidedAt: new Date(),
      });
      if (updated) {
        await storage.createActivityEvent({
          entityType: "office_day_request",
          entityId: updated.id,
          eventType: `office_day_${status}`,
          message: `Office day request for ${updated.date} was ${status}`,
          createdByUserId: req.user!.id,
        });

        // Auto-block calendar when approved
        if (status === "approved") {
          const client = await storage.getClient(updated.clientId);
          const startAt = new Date(`${updated.date}T09:00:00`);
          const endAt = new Date(`${updated.date}T17:00:00`);
          await storage.createCalendarBlock({
            startAt,
            endAt,
            source: "client_booking",
            title: client ? `Office Day: ${client.name}` : "Office Day",
            officeDayRequestId: requestId,
          });
        }
      }
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  // Admin-initiated Office Days (admin schedules directly, sends notifications)
  app.post("/api/admin/office-days", requireAdmin, async (req, res, next) => {
    try {
      const { clientId, projectId, date, dayType, notes } = req.body;
      
      // Validate required fields
      if (!clientId || !projectId || !date) {
        return res.status(400).json({ message: "clientId, projectId, and date are required" });
      }
      
      // Get client and project for email
      const client = await storage.getClient(clientId);
      const project = await storage.getProject(projectId);
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Create the office day request as already approved
      const officeDay = await storage.createOfficeDayRequest({
        clientId,
        projectId,
        requestedByUserId: req.user!.id,
        date,
        dayType: dayType || "onsite",
        notes,
        status: "approved",
      });
      
      // Update with decided info
      await storage.updateOfficeDayRequest(officeDay.id, {
        decidedByUserId: req.user!.id,
        decidedAt: new Date(),
      });
      
      // Create calendar block
      const startAt = new Date(`${date}T09:00:00`);
      const endAt = new Date(`${date}T17:00:00`);
      await storage.createCalendarBlock({
        startAt,
        endAt,
        source: "client_booking",
        title: `Office Day: ${client.name}`,
        officeDayRequestId: officeDay.id,
      });
      
      // Log activity
      await storage.createActivityEvent({
        entityType: "office_day_request",
        entityId: officeDay.id,
        eventType: "office_day_scheduled",
        message: `Admin scheduled office day with ${client.name} on ${date}`,
        createdByUserId: req.user!.id,
      });
      
      // Format date for email
      const formattedDate = new Date(date).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      
      // Get contacts for this client to email
      const contacts = await storage.getContactsByClient(clientId);
      const clientEmails = contacts.filter(c => c.email).map(c => c.email!);
      // Also include the client's main email if set
      if (client.email && !clientEmails.includes(client.email)) {
        clientEmails.push(client.email);
      }
      
      const adminEmail = process.env.ADMIN_EMAIL;
      const emailResults: { client: boolean; admin: boolean } = { client: false, admin: false };
      
      // Send notification to client contacts
      if (clientEmails.length > 0) {
        const clientEmailContent = {
          to: clientEmails.join(", "),
          subject: `Office Day Scheduled - ${formattedDate}`,
          text: `Hi,

This is to confirm that an office day has been scheduled with JD CoreDev.

Details:
- Date: ${formattedDate}
- Type: ${dayType === "remote" ? "Remote" : dayType === "onsite" ? "On-site" : "Flexible"}
- Project: ${project.name}
${notes ? `- Notes: ${notes}` : ""}

We look forward to working with you.

Best regards,
JD CoreDev`,
          html: `
<h2>Office Day Scheduled</h2>
<p>Hi,</p>
<p>This is to confirm that an office day has been scheduled with JD CoreDev.</p>
<h3>Details:</h3>
<ul>
  <li><strong>Date:</strong> ${formattedDate}</li>
  <li><strong>Type:</strong> ${dayType === "remote" ? "Remote" : dayType === "onsite" ? "On-site" : "Flexible"}</li>
  <li><strong>Project:</strong> ${project.name}</li>
  ${notes ? `<li><strong>Notes:</strong> ${notes}</li>` : ""}
</ul>
<p>We look forward to working with you.</p>
<p>Best regards,<br>JD CoreDev</p>
`,
        };
        const result = await sendEmail(clientEmailContent);
        emailResults.client = result.success;
      }
      
      // Send confirmation to admin
      if (adminEmail) {
        const adminEmailContent = {
          to: adminEmail,
          subject: `Office Day Confirmation - ${client.name} on ${formattedDate}`,
          text: `Office day scheduled confirmation.

You have scheduled an office day:

Details:
- Client: ${client.name}
- Date: ${formattedDate}
- Type: ${dayType === "remote" ? "Remote" : dayType === "onsite" ? "On-site" : "Flexible"}
- Project: ${project.name}
${notes ? `- Notes: ${notes}` : ""}

Notified contacts: ${clientEmails.length > 0 ? clientEmails.join(", ") : "None (no contact emails on file)"}

Best regards,
JD CoreDev System`,
          html: `
<h2>Office Day Confirmation</h2>
<p>You have scheduled an office day:</p>
<h3>Details:</h3>
<ul>
  <li><strong>Client:</strong> ${client.name}</li>
  <li><strong>Date:</strong> ${formattedDate}</li>
  <li><strong>Type:</strong> ${dayType === "remote" ? "Remote" : dayType === "onsite" ? "On-site" : "Flexible"}</li>
  <li><strong>Project:</strong> ${project.name}</li>
  ${notes ? `<li><strong>Notes:</strong> ${notes}</li>` : ""}
</ul>
<p><strong>Notified contacts:</strong> ${clientEmails.length > 0 ? clientEmails.join(", ") : "None (no contact emails on file)"}</p>
<p>Best regards,<br>JD CoreDev System</p>
`,
        };
        const result = await sendEmail(adminEmailContent);
        emailResults.admin = result.success;
      }
      
      res.status(201).json({ 
        ...officeDay, 
        client, 
        project,
        emailsSent: emailResults,
      });
    } catch (error) {
      next(error);
    }
  });

  // Milestones
  app.get("/api/admin/milestones", requireAdmin, async (req, res, next) => {
    try {
      const milestones = await storage.getMilestones();
      // Enrich with project data
      const enriched = await Promise.all(
        milestones.map(async (m) => {
          const project = await storage.getProject(m.projectId);
          return { ...m, project };
        })
      );
      res.json(enriched);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/milestones", requireAdmin, async (req, res, next) => {
    try {
      // Convert empty strings to null for date fields
      const body = {
        ...req.body,
        dueDate: req.body.dueDate || null,
        paidDate: req.body.paidDate || null,
      };
      const data = insertMilestoneSchema.parse(body);
      const milestone = await storage.createMilestone(data);
      await storage.createActivityEvent({
        entityType: "milestone",
        entityId: milestone.id,
        eventType: "milestone_created",
        message: `Milestone "${milestone.name}" was created`,
        createdByUserId: req.user!.id,
      });
      res.status(201).json(milestone);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/milestones/:id", requireAdmin, async (req, res, next) => {
    try {
      const { name, projectId, amountCents, dueDate, paidDate, status, invoiceRef } = req.body;
      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (projectId !== undefined) updateData.projectId = projectId;
      if (amountCents !== undefined) updateData.amountCents = amountCents;
      if (dueDate !== undefined) updateData.dueDate = dueDate || null;
      if (paidDate !== undefined) updateData.paidDate = paidDate || null;
      if (status !== undefined) updateData.status = status;
      if (invoiceRef !== undefined) updateData.invoiceRef = invoiceRef || null;
      
      const updated = await storage.updateMilestone(parseInt(req.params.id), updateData);
      if (updated) {
        await storage.createActivityEvent({
          entityType: "milestone",
          entityId: updated.id,
          eventType: "milestone_updated",
          message: `Milestone "${updated.name}" was updated`,
          createdByUserId: req.user!.id,
        });
      }
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/milestones/:id", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteMilestone(id);
      await storage.createActivityEvent({
        entityType: "milestone",
        entityId: id,
        eventType: "milestone_deleted",
        message: `Milestone was deleted`,
        createdByUserId: req.user!.id,
      });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // Project Detail - Get single project with all related data
  app.get("/api/admin/projects/:id", requireAdmin, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const client = await storage.getClient(project.clientId);
      const milestones = await storage.getMilestonesByProject(projectId);
      const processSteps = await storage.getProcessStepsByProject(projectId);
      const prompts = await storage.getPromptsByProject(projectId);
      const agreements = await storage.getAgreementsByProject(projectId);
      const documents = await storage.getDocumentsByProject(projectId);
      const historyEvents = await storage.getHistoryEventsByProject(projectId);
      
      res.json({
        ...project,
        client,
        milestones,
        processSteps,
        prompts,
        agreements,
        documents,
        historyEvents,
      });
    } catch (error) {
      next(error);
    }
  });

  // Client Detail - Get single client with all projects and contacts
  app.get("/api/admin/clients/:id", requireAdmin, async (req, res, next) => {
    try {
      const clientId = parseInt(req.params.id);
      const client = await storage.getClient(clientId);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      const projects = await storage.getProjectsByClient(clientId);
      const contacts = await storage.getContactsByClient(clientId);
      
      // Enrich projects with milestones
      const enrichedProjects = await Promise.all(
        projects.map(async (p) => {
          const milestones = await storage.getMilestonesByProject(p.id);
          return { ...p, milestones };
        })
      );
      
      res.json({
        ...client,
        projects: enrichedProjects,
        contacts,
        projectCount: projects.length,
      });
    } catch (error) {
      next(error);
    }
  });

  // Contacts CRUD
  app.post("/api/admin/clients/:clientId/contacts", requireAdmin, async (req, res, next) => {
    try {
      const data = insertContactSchema.parse({
        ...req.body,
        clientId: parseInt(req.params.clientId),
      });
      const contact = await storage.createContact(data);
      res.status(201).json(contact);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/contacts/:id", requireAdmin, async (req, res, next) => {
    try {
      const data = insertContactSchema.partial().parse(req.body);
      const updated = await storage.updateContact(parseInt(req.params.id), data);
      if (!updated) {
        return res.status(404).json({ message: "Contact not found" });
      }
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/contacts/:id", requireAdmin, async (req, res, next) => {
    try {
      await storage.deleteContact(parseInt(req.params.id));
      res.json({ message: "Contact deleted" });
    } catch (error) {
      next(error);
    }
  });

  // Process Steps CRUD
  app.get("/api/admin/projects/:projectId/process-steps", requireAdmin, async (req, res, next) => {
    try {
      const steps = await storage.getProcessStepsByProject(parseInt(req.params.projectId));
      res.json(steps);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/projects/:projectId/process-steps", requireAdmin, async (req, res, next) => {
    try {
      const data = insertProjectProcessStepSchema.parse({
        ...req.body,
        projectId: parseInt(req.params.projectId),
      });
      const step = await storage.createProcessStep(data);
      res.status(201).json(step);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/process-steps/:id", requireAdmin, async (req, res, next) => {
    try {
      const data = insertProjectProcessStepSchema.partial().parse(req.body) as Record<string, unknown>;
      // Ensure amountCents is 0 when isMilestone is explicitly set to false
      if (data.isMilestone === false) {
        data.amountCents = 0;
      }
      const updated = await storage.updateProcessStep(parseInt(req.params.id), data);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/process-steps/:id", requireAdmin, async (req, res, next) => {
    try {
      await storage.deleteProcessStep(parseInt(req.params.id));
      res.json({ message: "Step deleted" });
    } catch (error) {
      next(error);
    }
  });

  // Prompts CRUD
  app.get("/api/admin/projects/:projectId/prompts", requireAdmin, async (req, res, next) => {
    try {
      const prompts = await storage.getPromptsByProject(parseInt(req.params.projectId));
      res.json(prompts);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/projects/:projectId/prompts", requireAdmin, async (req, res, next) => {
    try {
      const data = insertProjectPromptSchema.parse({
        ...req.body,
        projectId: parseInt(req.params.projectId),
        createdByUserId: req.user!.id,
      });
      const prompt = await storage.createPrompt(data);
      res.status(201).json(prompt);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/prompts/:id", requireAdmin, async (req, res, next) => {
    try {
      const updated = await storage.updatePrompt(parseInt(req.params.id), req.body);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/prompts/:id", requireAdmin, async (req, res, next) => {
    try {
      await storage.deletePrompt(parseInt(req.params.id));
      res.json({ message: "Prompt deleted" });
    } catch (error) {
      next(error);
    }
  });

  // Agreements CRUD
  app.get("/api/admin/projects/:projectId/agreements", requireAdmin, async (req, res, next) => {
    try {
      const agreements = await storage.getAgreementsByProject(parseInt(req.params.projectId));
      res.json(agreements);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/projects/:projectId/agreements", requireAdmin, async (req, res, next) => {
    try {
      const data = insertProjectAgreementSchema.parse({
        ...req.body,
        projectId: parseInt(req.params.projectId),
      });
      const agreement = await storage.createAgreement(data);
      res.status(201).json(agreement);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/agreements/:id", requireAdmin, async (req, res, next) => {
    try {
      const updated = await storage.updateAgreement(parseInt(req.params.id), req.body);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/agreements/:id", requireAdmin, async (req, res, next) => {
    try {
      await storage.deleteAgreement(parseInt(req.params.id));
      res.json({ message: "Agreement deleted" });
    } catch (error) {
      next(error);
    }
  });

  // Project History Events
  app.get("/api/admin/projects/:projectId/history-events", requireAdmin, async (req, res, next) => {
    try {
      const events = await storage.getHistoryEventsByProject(parseInt(req.params.projectId));
      res.json(events);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/projects/:projectId/history-events", requireAdmin, async (req, res, next) => {
    try {
      const data = insertProjectHistoryEventSchema.parse({
        ...req.body,
        occurredAt: new Date(req.body.occurredAt),
        projectId: parseInt(req.params.projectId),
        createdByUserId: req.user!.id,
      });
      const event = await storage.createHistoryEvent(data);
      res.status(201).json(event);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/history-events/:id", requireAdmin, async (req, res, next) => {
    try {
      const updated = await storage.updateHistoryEvent(parseInt(req.params.id), req.body);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/history-events/:id", requireAdmin, async (req, res, next) => {
    try {
      await storage.deleteHistoryEvent(parseInt(req.params.id));
      res.json({ message: "History event deleted" });
    } catch (error) {
      next(error);
    }
  });

  // Calendar Blocks
  app.get("/api/admin/calendar-blocks", requireAdmin, async (req, res, next) => {
    try {
      const blocks = await storage.getCalendarBlocks();
      res.json(blocks);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/calendar-blocks", requireAdmin, async (req, res, next) => {
    try {
      const data = insertCalendarBlockSchema.parse(req.body);
      const block = await storage.createCalendarBlock(data);
      res.status(201).json(block);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/calendar-blocks/:id", requireAdmin, async (req, res, next) => {
    try {
      await storage.deleteCalendarBlock(parseInt(req.params.id));
      res.json({ message: "Calendar block deleted" });
    } catch (error) {
      next(error);
    }
  });

  // Documents
  app.get("/api/admin/documents", requireAdmin, async (req, res, next) => {
    try {
      const docs = await storage.getDocuments();
      // Enrich with client data
      const enriched = await Promise.all(
        docs.map(async (d) => {
          const client = await storage.getClient(d.clientId);
          const project = d.projectId ? await storage.getProject(d.projectId) : null;
          return { ...d, client, project };
        })
      );
      res.json(enriched);
    } catch (error) {
      next(error);
    }
  });

  // Document upload - create document record
  app.post("/api/admin/documents", requireAdmin, uploadLimiter, async (req, res, next) => {
    try {
      // Validate with Zod schema
      const documentSchema = insertDocumentSchema.extend({
        clientId: z.number(),
        filename: z.string().min(1),
        storagePath: z.string().min(1),
        mimeType: z.string().min(1),
      });
      const validated = documentSchema.parse({
        ...req.body,
        uploadedByUserId: req.user!.id,
        docType: req.body.docType || "other",
        signed: req.body.signed || false,
        version: req.body.version || 1,
      });
      const doc = await storage.createDocument(validated);
      await storage.createActivityEvent({
        entityType: "document",
        entityId: doc.id,
        eventType: "document_uploaded",
        message: `Document "${doc.filename}" was uploaded`,
        createdByUserId: req.user!.id,
      });
      res.status(201).json(doc);
    } catch (error) {
      next(error);
    }
  });

  // Initialize object storage service
  const objectStorageService = new ObjectStorageService();

  // Document delete
  app.delete("/api/admin/documents/:id", requireAdmin, async (req, res, next) => {
    try {
      const doc = await storage.getDocument(parseInt(req.params.id));
      if (doc && doc.storagePath) {
        try {
          await objectStorageService.deleteObjectEntity(doc.storagePath);
        } catch (e) {
          console.error("Failed to delete object from storage:", e);
        }
      }
      await storage.deleteDocument(parseInt(req.params.id));
      res.json({ message: "Document deleted" });
    } catch (error) {
      next(error);
    }
  });

  // Presigned URL for document upload (cloud storage)
  
  app.post("/api/uploads/request-url", requireAuth, uploadLimiter, async (req, res, next) => {
    try {
      const { name, size, contentType } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Missing required field: name" });
      }
      
      // Get presigned URL from cloud storage
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      
      // Extract object path from the presigned URL for later reference
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      
      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      next(error);
    }
  });
  
  // Serve uploaded documents
  app.get("/objects/:objectPath(*)", requireAuth, async (req, res, next) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      next(error);
    }
  });

  // Activity
  app.get("/api/admin/activity", requireAdmin, async (req, res, next) => {
    try {
      const events = await storage.getActivityEvents(100);
      // Enrich with user data
      const enriched = await Promise.all(
        events.map(async (e) => {
          const createdBy = e.createdByUserId ? await storage.getUser(e.createdByUserId) : null;
          return { ...e, createdBy: createdBy ? { id: createdBy.id, email: createdBy.email } : null };
        })
      );
      res.json(enriched);
    } catch (error) {
      next(error);
    }
  });

  // ============ Client Portal Routes ============
  
  // Projects for client
  app.get("/api/portal/projects", requireClient, async (req, res, next) => {
    try {
      const clientId = req.user!.clientId;
      if (!clientId) {
        return res.json([]);
      }
      const projects = await storage.getProjectsByClient(clientId);
      // Enrich with milestones
      const enriched = await Promise.all(
        projects.map(async (p) => {
          const milestones = await storage.getMilestonesByProject(p.id);
          return { ...p, milestones };
        })
      );
      res.json(enriched);
    } catch (error) {
      next(error);
    }
  });

  // Office days for client
  app.get("/api/portal/office-days", requireClient, async (req, res, next) => {
    try {
      const clientId = req.user!.clientId;
      if (!clientId) {
        return res.json([]);
      }
      const requests = await storage.getOfficeDayRequestsByClient(clientId);
      res.json(requests);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/portal/office-days", requireClient, async (req, res, next) => {
    try {
      const { projectId, dayType, notes, dates } = req.body;
      const clientId = req.user!.clientId;
      
      if (!clientId) {
        return res.status(400).json({ message: "Client not linked to account" });
      }

      if (!Array.isArray(dates) || dates.length === 0) {
        return res.status(400).json({ message: "At least one date is required" });
      }

      // Get availability rules for validation
      const rules = await storage.getAvailabilityRules();
      const blocks = await storage.getAvailabilityBlocks();
      
      // Track dates being added in this request for cumulative capacity check
      const pendingDatesByWeek: Map<string, number> = new Map();
      const pendingDatesByMonth: Map<string, number> = new Map();
      
      // Validate each date against rules
      const validationErrors: string[] = [];
      const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
      
      for (const dateStr of dates) {
        const dateObj = new Date(dateStr);
        const dayOfWeek = daysOfWeek[dateObj.getDay()];
        
        // Check if this day is available
        if (rules && !rules[dayOfWeek]) {
          validationErrors.push(`${dateStr}: ${dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)} is not available`);
          continue;
        }
        
        // Check availability blocks (single date check)
        const blocked = blocks.find(b => b.date === dateStr);
        if (blocked) {
          validationErrors.push(`${dateStr}: This date is blocked (${blocked.reason || 'unavailable'})`);
          continue;
        }
        
        // Check weekly capacity (including pending dates in this request)
        if (rules?.maxDaysPerWeek) {
          const weekKey = getWeekKey(dateStr);
          const pendingWeekCount = pendingDatesByWeek.get(weekKey) || 0;
          const existingWeekCount = await storage.getOfficeDayCountForWeek(dateStr);
          const totalWeekCount = existingWeekCount + pendingWeekCount;
          
          if (totalWeekCount >= rules.maxDaysPerWeek) {
            validationErrors.push(`${dateStr}: Weekly capacity (${rules.maxDaysPerWeek} days) reached`);
            continue;
          }
          
          // Track this date for cumulative counting
          pendingDatesByWeek.set(weekKey, pendingWeekCount + 1);
        }
        
        // Check monthly capacity (including pending dates in this request)
        if (rules?.maxDaysPerMonth) {
          const month = dateObj.getMonth() + 1;
          const year = dateObj.getFullYear();
          const monthKey = `${year}-${month}`;
          const pendingMonthCount = pendingDatesByMonth.get(monthKey) || 0;
          const existingMonthCount = await storage.getOfficeDayCountForMonth(year, month);
          const totalMonthCount = existingMonthCount + pendingMonthCount;
          
          if (totalMonthCount >= rules.maxDaysPerMonth) {
            validationErrors.push(`${dateStr}: Monthly capacity (${rules.maxDaysPerMonth} days) reached`);
            continue;
          }
          
          // Track this date for cumulative counting
          pendingDatesByMonth.set(monthKey, pendingMonthCount + 1);
        }
      }
      
      if (validationErrors.length > 0) {
        return res.status(400).json({ 
          message: "Some dates are not available", 
          errors: validationErrors 
        });
      }

      // Create requests for each date
      const created = [];
      for (const date of dates) {
        const request = await storage.createOfficeDayRequest({
          clientId,
          projectId,
          requestedByUserId: req.user!.id,
          date,
          dayType,
          notes,
          status: "requested",
        });
        created.push(request);

        await storage.createActivityEvent({
          entityType: "office_day_request",
          entityId: request.id,
          eventType: "office_day_requested",
          message: `Office day requested for ${date}`,
          createdByUserId: req.user!.id,
        });
      }

      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  // Availability for client portal
  app.get("/api/portal/availability/rules", requireClient, async (req, res, next) => {
    try {
      const rules = await storage.getAvailabilityRules();
      res.json(rules || {
        monday: true, tuesday: true, wednesday: true, thursday: true, friday: true,
        saturday: false, sunday: false, defaultType: "both", maxDaysPerWeek: 5, maxDaysPerMonth: 20
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/portal/availability/blocks", requireClient, async (req, res, next) => {
    try {
      const blocks = await storage.getAvailabilityBlocks();
      res.json(blocks);
    } catch (error) {
      next(error);
    }
  });

  // Milestones for client
  app.get("/api/portal/milestones", requireClient, async (req, res, next) => {
    try {
      const clientId = req.user!.clientId;
      if (!clientId) {
        return res.json([]);
      }
      const milestones = await storage.getMilestonesByClient(clientId);
      res.json(milestones);
    } catch (error) {
      next(error);
    }
  });

  // Documents for client
  app.get("/api/portal/documents", requireClient, async (req, res, next) => {
    try {
      const clientId = req.user!.clientId;
      if (!clientId) {
        return res.json([]);
      }
      const docs = await storage.getDocumentsByClient(clientId);
      // Enrich with project data
      const enriched = await Promise.all(
        docs.map(async (d) => {
          const project = d.projectId ? await storage.getProject(d.projectId) : null;
          return { ...d, project };
        })
      );
      res.json(enriched);
    } catch (error) {
      next(error);
    }
  });

  // Portal Project Detail - read-only for clients
  app.get("/api/portal/projects/:id", requireClient, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.id);
      const clientId = req.user!.clientId;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Permission check - client can only see their own projects
      if (project.clientId !== clientId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const client = await storage.getClient(project.clientId);
      const milestones = await storage.getMilestonesByProject(projectId);
      const processSteps = await storage.getProcessStepsByProject(projectId);
      // Only show prompts that are visible to client
      const prompts = await storage.getPromptsByProject(projectId, true);
      const agreements = await storage.getAgreementsByProject(projectId);
      const documents = await storage.getDocumentsByProject(projectId);
      const historyEvents = await storage.getHistoryEventsByProject(projectId);
      
      res.json({
        ...project,
        client,
        milestones,
        processSteps,
        prompts,
        agreements,
        documents,
        historyEvents,
      });
    } catch (error) {
      next(error);
    }
  });

  // ============ Public Meeting Request Routes ============
  
  // Submit a meeting request (public)
  app.post("/api/meeting-request", async (req, res, next) => {
    try {
      const schema = z.object({
        name: z.string().min(2),
        email: z.string().email(),
        company: z.string().optional(),
        meetingType: z.enum(["call", "video"]),
        requestedDate: z.string(),
        requestedTime: z.string(),
        duration: z.number().optional().default(30),
      });
      
      const data = schema.parse(req.body);
      const secureToken = crypto.randomBytes(32).toString("hex");
      
      const request = await storage.createMeetingRequest({
        ...data,
        secureToken,
        status: "requested",
      });
      
      await storage.createActivityEvent({
        entityType: "meeting_request",
        entityId: request.id,
        eventType: "meeting_requested",
        message: `Meeting request from ${data.name} for ${data.requestedDate} at ${data.requestedTime}`,
      });
      
      res.status(201).json({ 
        message: "Meeting request submitted. You will receive a confirmation email once approved.",
        token: secureToken 
      });
    } catch (error) {
      next(error);
    }
  });

  // View meeting proposals (public with token)
  app.get("/api/meeting-request/:token", async (req, res, next) => {
    try {
      const { token } = req.params;
      const request = await storage.getMeetingRequestByToken(token);
      
      if (!request) {
        return res.status(404).json({ message: "Meeting request not found" });
      }
      
      const proposals = await storage.getMeetingProposals(request.id);
      
      res.json({
        id: request.id,
        name: request.name,
        email: request.email,
        meetingType: request.meetingType,
        requestedDate: request.requestedDate,
        requestedTime: request.requestedTime,
        duration: request.duration,
        status: request.status,
        adminNotes: request.adminNotes,
        proposals,
      });
    } catch (error) {
      next(error);
    }
  });

  // Accept a proposal (public with token)
  app.post("/api/meeting-request/:token/accept/:proposalId", async (req, res, next) => {
    try {
      const { token, proposalId } = req.params;
      const request = await storage.getMeetingRequestByToken(token);
      
      if (!request) {
        return res.status(404).json({ message: "Meeting request not found" });
      }
      
      if (request.status !== "proposed") {
        return res.status(400).json({ message: "This meeting request is not in proposed status" });
      }
      
      const proposal = await storage.getMeetingProposal(parseInt(proposalId));
      if (!proposal || proposal.meetingRequestId !== request.id) {
        return res.status(404).json({ message: "Proposal not found" });
      }
      
      // Accept the proposal
      await storage.updateMeetingProposal(proposal.id, { accepted: true });
      
      // Update the meeting request with the accepted time
      await storage.updateMeetingRequest(request.id, {
        status: "confirmed",
        requestedDate: proposal.proposedDate,
        requestedTime: proposal.proposedTime,
        duration: proposal.duration,
        decidedAt: new Date(),
      });
      
      // Create calendar block for confirmed meeting
      const startDate = new Date(`${proposal.proposedDate}T${proposal.proposedTime}`);
      const endDate = new Date(startDate.getTime() + proposal.duration * 60 * 1000);
      
      await storage.createCalendarBlock({
        startAt: startDate,
        endAt: endDate,
        source: "meeting",
        title: `Meeting with ${request.name}`,
        meetingRequestId: request.id,
      });
      
      // Schedule reminders
      await scheduleRemindersForMeeting(request.id, request.email, startDate);
      
      await storage.createActivityEvent({
        entityType: "meeting_request",
        entityId: request.id,
        eventType: "meeting_confirmed_from_proposal",
        message: `${request.name} accepted proposal for ${proposal.proposedDate} at ${proposal.proposedTime}`,
      });
      
      res.json({ message: "Meeting confirmed successfully" });
    } catch (error) {
      next(error);
    }
  });

  // ============ Admin Meeting Request Routes ============
  
  app.get("/api/admin/meeting-requests", requireAdmin, async (req, res, next) => {
    try {
      const requests = await storage.getMeetingRequests();
      res.json(requests);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/meeting-requests/:id", requireAdmin, async (req, res, next) => {
    try {
      const request = await storage.getMeetingRequest(parseInt(req.params.id));
      if (!request) {
        return res.status(404).json({ message: "Meeting request not found" });
      }
      const proposals = await storage.getMeetingProposals(request.id);
      res.json({ ...request, proposals });
    } catch (error) {
      next(error);
    }
  });

  // Confirm a meeting request
  app.post("/api/admin/meeting-requests/:id/confirm", requireAdmin, async (req, res, next) => {
    try {
      const request = await storage.getMeetingRequest(parseInt(req.params.id));
      if (!request) {
        return res.status(404).json({ message: "Meeting request not found" });
      }
      
      if (request.status !== "requested") {
        return res.status(400).json({ message: "Meeting request is not in requested status" });
      }
      
      // Update status to confirmed
      await storage.updateMeetingRequest(request.id, {
        status: "confirmed",
        decidedByUserId: req.user!.id,
        decidedAt: new Date(),
      });
      
      // Create calendar block
      const startDate = new Date(`${request.requestedDate}T${request.requestedTime}`);
      const endDate = new Date(startDate.getTime() + request.duration * 60 * 1000);
      
      await storage.createCalendarBlock({
        startAt: startDate,
        endAt: endDate,
        source: "meeting",
        title: `Meeting with ${request.name}`,
        meetingRequestId: request.id,
      });
      
      // Schedule reminders
      await scheduleRemindersForMeeting(request.id, request.email, startDate);
      
      await storage.createActivityEvent({
        entityType: "meeting_request",
        entityId: request.id,
        eventType: "meeting_confirmed",
        message: `Meeting with ${request.name} confirmed for ${request.requestedDate} at ${request.requestedTime}`,
        createdByUserId: req.user!.id,
      });
      
      res.json({ message: "Meeting confirmed" });
    } catch (error) {
      next(error);
    }
  });

  // Deny a meeting request
  app.post("/api/admin/meeting-requests/:id/deny", requireAdmin, async (req, res, next) => {
    try {
      const request = await storage.getMeetingRequest(parseInt(req.params.id));
      if (!request) {
        return res.status(404).json({ message: "Meeting request not found" });
      }
      
      const { adminNotes } = req.body;
      
      await storage.updateMeetingRequest(request.id, {
        status: "denied",
        adminNotes,
        decidedByUserId: req.user!.id,
        decidedAt: new Date(),
      });
      
      // Cancel any pending reminders
      await storage.cancelRemindersForEntity("meeting", request.id);
      
      await storage.createActivityEvent({
        entityType: "meeting_request",
        entityId: request.id,
        eventType: "meeting_denied",
        message: `Meeting request from ${request.name} was denied`,
        createdByUserId: req.user!.id,
      });
      
      res.json({ message: "Meeting request denied" });
    } catch (error) {
      next(error);
    }
  });

  // Propose alternate times
  app.post("/api/admin/meeting-requests/:id/propose", requireAdmin, async (req, res, next) => {
    try {
      const request = await storage.getMeetingRequest(parseInt(req.params.id));
      if (!request) {
        return res.status(404).json({ message: "Meeting request not found" });
      }
      
      const schema = z.object({
        proposals: z.array(z.object({
          proposedDate: z.string(),
          proposedTime: z.string(),
          duration: z.number().optional().default(30),
        })).min(1).max(3),
        adminNotes: z.string().optional(),
      });
      
      const { proposals, adminNotes } = schema.parse(req.body);
      
      // Create proposals
      for (const p of proposals) {
        await storage.createMeetingProposal({
          meetingRequestId: request.id,
          proposedDate: p.proposedDate,
          proposedTime: p.proposedTime,
          duration: p.duration,
        });
      }
      
      await storage.updateMeetingRequest(request.id, {
        status: "proposed",
        adminNotes,
        decidedByUserId: req.user!.id,
      });
      
      await storage.createActivityEvent({
        entityType: "meeting_request",
        entityId: request.id,
        eventType: "meeting_proposed",
        message: `Proposed ${proposals.length} alternate time(s) to ${request.name}`,
        createdByUserId: req.user!.id,
      });
      
      res.json({ message: "Proposals sent" });
    } catch (error) {
      next(error);
    }
  });

  // ============ Admin Reminders Routes ============
  
  app.get("/api/admin/reminders", requireAdmin, async (req, res, next) => {
    try {
      const remindersList = await storage.getReminders();
      res.json(remindersList);
    } catch (error) {
      next(error);
    }
  });

  // ============ Admin Hosting Terms Routes (Internal Reference Only) ============

  app.get("/api/admin/hosting-terms", requireAdmin, async (req, res, next) => {
    try {
      const terms = await storage.getHostingTerms();
      res.json(terms);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/hosting-terms/:id", requireAdmin, async (req, res, next) => {
    try {
      const term = await storage.getHostingTerm(parseInt(req.params.id));
      if (!term) {
        return res.status(404).json({ error: "Hosting term not found" });
      }
      res.json(term);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/hosting-terms", requireAdmin, async (req, res, next) => {
    try {
      const { title, contentMarkdown } = req.body;
      if (!title || !contentMarkdown) {
        return res.status(400).json({ error: "Title and content are required" });
      }
      const term = await storage.createHostingTerm({
        title,
        contentMarkdown,
        updatedByUserId: req.user!.id,
      });
      res.status(201).json(term);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/hosting-terms/:id", requireAdmin, async (req, res, next) => {
    try {
      const { title, contentMarkdown } = req.body;
      const term = await storage.updateHostingTerm(parseInt(req.params.id), {
        ...(title && { title }),
        ...(contentMarkdown && { contentMarkdown }),
        updatedByUserId: req.user!.id,
      });
      if (!term) {
        return res.status(404).json({ error: "Hosting term not found" });
      }
      res.json(term);
    } catch (error) {
      next(error);
    }
  });

  // ============ Project Hosting Terms (per-project hosting agreements) ============
  
  // Get hosting terms for a specific project (admin)
  app.get("/api/admin/projects/:projectId/hosting-terms", requireAdmin, async (req, res, next) => {
    try {
      const terms = await storage.getProjectHostingTerms(parseInt(req.params.projectId));
      res.json(terms || null);
    } catch (error) {
      next(error);
    }
  });

  // Upsert (create or update) hosting terms for a project
  app.put("/api/admin/projects/:projectId/hosting-terms", requireAdmin, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      const data = insertProjectHostingTermsSchema.omit({ projectId: true }).partial().parse(req.body);
      const terms = await storage.upsertProjectHostingTerms(projectId, data);
      res.json(terms);
    } catch (error) {
      next(error);
    }
  });

  // Get hosting terms for a specific project (client portal - read only)
  app.get("/api/portal/projects/:projectId/hosting-terms", requireClient, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const project = await storage.getProject(projectId);
      
      if (!project || project.clientId !== req.user!.clientId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const terms = await storage.getProjectHostingTerms(projectId);
      res.json(terms || null);
    } catch (error) {
      next(error);
    }
  });

  // ============ Contract Generation Routes ============

  // Get contracts for a project
  app.get("/api/admin/projects/:projectId/contracts", requireAdmin, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const contracts = await storage.getGeneratedContracts(projectId);
      res.json(contracts);
    } catch (error) {
      next(error);
    }
  });

  // Generate a new contract
  app.post("/api/admin/projects/:projectId/contracts", requireAdmin, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      const client = await storage.getClient(project.clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      // Generate reference number
      const year = new Date().getFullYear();
      const existingContracts = await storage.getGeneratedContracts(projectId);
      const prefix = req.body.contractType === "hosting" ? "HOST" : "DEV";
      const referenceNumber = `${prefix}-${year}-${String(existingContracts.length + 1).padStart(3, '0')}`;

      const contractData = {
        projectId,
        clientId: project.clientId,
        contractType: req.body.contractType,
        referenceNumber,
        clientName: client.companyName || client.name,
        projectName: project.name,
        startDate: req.body.startDate,
        deliveryDeadline: req.body.deliveryDeadline,
        totalAmount: req.body.totalAmount,
        currency: req.body.currency || "USD",
        monthlyHostingFee: req.body.monthlyHostingFee,
        minHostingMonths: req.body.minHostingMonths || 6,
        scopeOfWork: req.body.scopeOfWork,
        milestonesJson: req.body.milestones,
        governingLaw: req.body.governingLaw || "Hong Kong SAR",
        warrantyDays: req.body.warrantyDays || 30,
        createdByUserId: req.user!.id,
      };

      const contract = await storage.createGeneratedContract(contractData);
      
      await storage.createActivityEvent({
        entityType: "project",
        entityId: projectId,
        eventType: "contract_generated",
        message: `${req.body.contractType === "hosting" ? "Hosting" : "Development"} contract generated: ${referenceNumber}`,
        createdByUserId: req.user!.id,
      });

      res.status(201).json(contract);
    } catch (error) {
      next(error);
    }
  });

  // Delete a contract
  app.delete("/api/admin/contracts/:id", requireAdmin, async (req, res, next) => {
    try {
      const contractId = parseInt(req.params.id);
      await storage.deleteGeneratedContract(contractId);
      res.json({ message: "Contract deleted" });
    } catch (error) {
      next(error);
    }
  });

  // ============ Analytics Routes ============
  
  /**
   * REVENUE DEFINITION (used consistently across the application):
   * - Revenue = SUM(milestones.amountCents) WHERE milestones.status === "paid"
   * - All amounts stored in cents (integer) to avoid floating-point issues
   * - For time-based revenue: uses paidDate if available, else dueDate, else createdAt
   * - This same logic is used in:
   *   - Dashboard frontend (client/src/pages/admin/dashboard.tsx)
   *   - Projects list (client/src/pages/admin/projects.tsx)
   *   - Client detail (client/src/pages/admin/client-detail.tsx)
   *   - Project detail (client/src/pages/admin/project-detail.tsx)
   */
  app.get("/api/admin/analytics", requireAdmin, async (req, res, next) => {
    try {
      const [clients, projects, milestones, officeDays, activityEvents, calendarBlocks] = await Promise.all([
        storage.getClients(),
        storage.getProjects(),
        storage.getMilestones(),
        storage.getOfficeDayRequests(),
        storage.getActivityEvents(100),
        storage.getCalendarBlocks(),
      ]);
      
      const now = new Date();
      const currentYear = now.getFullYear();
      const monthlyRevenue: Record<string, number> = {};
      const monthlyMilestones: Record<string, { count: number; paid: number }> = {};
      
      // Initialize months for current and previous year
      for (let year = currentYear - 1; year <= currentYear; year++) {
        for (let i = 0; i < 12; i++) {
          const monthKey = `${year}-${String(i + 1).padStart(2, "0")}`;
          monthlyRevenue[monthKey] = 0;
          monthlyMilestones[monthKey] = { count: 0, paid: 0 };
        }
      }
      
      milestones.forEach(m => {
        // Use paidDate for paid milestones, otherwise dueDate, otherwise createdAt
        const effectiveDate = m.status === "paid" && m.paidDate 
          ? new Date(m.paidDate) 
          : m.dueDate 
            ? new Date(m.dueDate) 
            : new Date(m.createdAt);
        
        const milestoneYear = effectiveDate.getFullYear();
        // Include current year and previous year
        if (milestoneYear >= currentYear - 1 && milestoneYear <= currentYear) {
          const monthKey = `${milestoneYear}-${String(effectiveDate.getMonth() + 1).padStart(2, "0")}`;
          if (monthlyMilestones[monthKey]) {
            monthlyMilestones[monthKey].count++;
            if (m.status === "paid") {
              monthlyRevenue[monthKey] += m.amountCents;
              monthlyMilestones[monthKey].paid++;
            }
          }
        }
      });
      
      const revenueTrends = Object.entries(monthlyRevenue).map(([month, amountCents]) => ({
        month,
        amountCents,
        milestoneCount: monthlyMilestones[month].count,
        paidCount: monthlyMilestones[month].paid,
      })).sort((a, b) => a.month.localeCompare(b.month));
      
      const approvedOfficeDays = officeDays.filter(od => od.status === "approved");
      const totalOfficeDays = approvedOfficeDays.length;
      const thisYearOfficeDays = approvedOfficeDays.filter(od => {
        const date = new Date(od.date);
        return date.getFullYear() === currentYear;
      }).length;
      
      const meetingBlocks = calendarBlocks.filter(b => b.source === "meeting");
      const totalMeetings = meetingBlocks.length;
      
      const totalClients = clients.length;
      const activeClients = clients.filter(c => c.status === "active").length;
      const leadClients = clients.filter(c => c.status === "lead").length;
      
      const totalProjects = projects.length;
      const activeProjects = projects.filter(p => p.status === "active").length;
      const completedProjects = projects.filter(p => p.status === "completed").length;
      const leadProjects = projects.filter(p => p.status === "lead").length;
      
      const clientActivity = clients.map(client => {
        const clientProjects = projects.filter(p => p.clientId === client.id);
        const clientMilestones = milestones.filter(m => clientProjects.some(p => p.id === m.projectId));
        const totalValue = clientMilestones.reduce((sum, m) => sum + m.amountCents, 0);
        const paidValue = clientMilestones.filter(m => m.status === "paid").reduce((sum, m) => sum + m.amountCents, 0);
        const clientOfficeDays = approvedOfficeDays.filter(od => od.clientId === client.id).length;
        
        return {
          id: client.id,
          name: client.companyName,
          status: client.status,
          projectCount: clientProjects.length,
          activeProjects: clientProjects.filter(p => p.status === "active").length,
          totalValueCents: totalValue,
          paidValueCents: paidValue,
          officeDays: clientOfficeDays,
        };
      }).sort((a, b) => b.totalValueCents - a.totalValueCents);
      
      const totalRevenue = milestones.filter(m => m.status === "paid").reduce((sum, m) => sum + m.amountCents, 0);
      const totalPipeline = milestones.filter(m => m.status !== "paid").reduce((sum, m) => sum + m.amountCents, 0);
      const overdueCount = milestones.filter(m => m.status === "overdue").length;
      
      const recentActivity = activityEvents.slice(0, 20).map(e => ({
        id: e.id,
        type: e.eventType,
        description: e.message,
        timestamp: e.createdAt,
        entityType: e.entityType,
        entityId: e.entityId,
      }));
      
      res.json({
        summary: {
          totalRevenueCents: totalRevenue,
          totalPipelineCents: totalPipeline,
          overdueCount,
          totalClients,
          activeClients,
          leadClients,
          totalProjects,
          activeProjects,
          completedProjects,
          leadProjects,
          totalOfficeDays,
          thisYearOfficeDays,
          totalMeetings,
        },
        revenueTrends,
        clientActivity,
        recentActivity,
      });
    } catch (error) {
      next(error);
    }
  });

  // ============ Helper Functions ============
  
  // Schedule reminders for a meeting
  async function scheduleRemindersForMeeting(meetingId: number, clientEmail: string, meetingTime: Date) {
    const adminEmail = process.env.ADMIN_EMAIL || "admin@jdcoredev.com";
    const offsets = [24 * 60, 60]; // 24 hours and 1 hour before (in minutes)
    
    for (const offsetMinutes of offsets) {
      const sendAt = new Date(meetingTime.getTime() - offsetMinutes * 60 * 1000);
      
      // Only schedule if sendAt is in the future
      if (sendAt > new Date()) {
        // Admin email reminder
        const adminKey = `meeting:${meetingId}:admin:email:${offsetMinutes}`;
        const existingAdmin = await storage.getReminderByIdempotencyKey(adminKey);
        if (!existingAdmin) {
          await storage.createReminder({
            reminderType: "meeting",
            entityId: meetingId,
            recipientType: "admin",
            recipientEmail: adminEmail,
            channel: "email",
            sendAt,
            status: "pending",
            idempotencyKey: adminKey,
          });
        }
        
        // Client email reminder
        const clientKey = `meeting:${meetingId}:client:email:${offsetMinutes}`;
        const existingClient = await storage.getReminderByIdempotencyKey(clientKey);
        if (!existingClient) {
          await storage.createReminder({
            reminderType: "meeting",
            entityId: meetingId,
            recipientType: "client",
            recipientEmail: clientEmail,
            channel: "email",
            sendAt,
            status: "pending",
            idempotencyKey: clientKey,
          });
        }
      }
    }
  }

  // Error handling
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(err);
    if (err.name === "ZodError") {
      return res.status(400).json({ message: "Validation error", errors: err.errors });
    }
    res.status(500).json({ message: err.message || "Internal server error" });
  });

  return httpServer;
}
