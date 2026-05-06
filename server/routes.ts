import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import connectPgSimple from "connect-pg-simple";
import { format } from "date-fns";
import { pool, db } from "./db";
import { storage } from "./storage";
import { 
  insertClientSchema, insertProjectSchema, insertMilestoneSchema,
  insertAvailabilityBlockSchema, insertContactSubmissionSchema, insertDocumentSchema,
  insertProjectProcessStepSchema, insertProjectPromptSchema, insertProjectAgreementSchema,
  insertProjectHistoryEventSchema, insertCalendarBlockSchema, insertMeetingRequestSchema, insertMeetingProposalSchema,
  insertProjectHostingTermsSchema, insertContactSchema, insertOfficeDayRequestSchema, insertGeneratedContractSchema,
  insertTrackedCoinSchema, insertPriceAlertSchema, insertCryptoNotificationSettingsSchema,
  insertMaintenanceLogCostSchema, insertReplitChargeSchema,
  trackedCoins, priceAlerts, priceHistory, coinNews, cryptoNotificationSettings,
  type User, type MeetingRequest, clients, projects, projectHostingTerms, maintenanceLogs,
  referralPartners, commissionEntries, projectCosts,
  hostingInvoiceLineItems,
  type Project, type ReferralPartner,
} from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { leadEngineRouter, initDbBridge } from "../pipeline/route.js";
import { leadEngineAgentRouter, fireLeadEngineRoutine } from "./lead-engine-agent";
import { expensesAgentRouter, expensesRouter, fireExpenseScannerRoutine, backfillFx } from "./expenses-agent";
import { socialSignalsRouter } from "./social-signals";
import { traderRouter, initTrader } from "./trader";
import { traderAgentRouter } from "./trader-agent";
import { predictorRouter, initPredictor } from "./predictor";
import { predictorAgentRouter, firePredictorRoutine } from "./predictor-agent";
import { devLogsIngestRouter } from "./dev-logs-ingest";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError, verifyUploadToken } from "./replit_integrations/object_storage";
import { sendEmail, formatContactInquiryEmail } from "./email";
import { searchCoins, getCoinPrices, getCoinDetails, getCoinMarketChart } from "./services/coingecko";
import { searchJupiterTokens, getJupiterTokenInfo, getJupiterTokenPrices } from "./services/jupiter";
import { fetchCoinNews } from "./services/cryptoNews";
import { manualPriceCheck, startPriceMonitoring } from "./services/priceMonitor";

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
  // One-shot bypass for the Replit-bucket migration: requests carrying a
  // matching X-Migration-Bypass header skip the limit. Unset the env var
  // after migration to disable.
  skip: (req) => {
    const bypass = process.env.UPLOAD_LIMIT_BYPASS_TOKEN;
    if (!bypass) return false;
    const provided = req.headers["x-migration-bypass"];
    return typeof provided === "string" && provided === bypass;
  },
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

// Helper to calculate next payment date for recurring payments
// Takes paymentDay (1-31), startDate, optional endDate, optional lastProcessedDate, and isActive flag
function calculateNextPaymentDate(
  paymentDay: number, 
  startDate: string, 
  endDate?: string | null,
  lastProcessedDate?: string | null,
  isActive: boolean = true
): string | null {
  // If inactive, return null - no next payment date
  if (!isActive) {
    return null;
  }

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Helper to get days in a month
  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  
  // Determine baseline date: use last processed + 1 month, or start date, whichever is later
  let baselineDate: Date;
  if (lastProcessedDate) {
    const lastProcessed = new Date(lastProcessedDate);
    lastProcessed.setHours(0, 0, 0, 0);
    // Move to next month from last processed
    const nextMonth = new Date(lastProcessed);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    baselineDate = nextMonth > start ? nextMonth : start;
  } else {
    baselineDate = start;
  }
  
  // Use today if we're past the baseline
  let checkDate = baselineDate > today ? baselineDate : today;
  
  // Get the year and month to start checking from
  let year = checkDate.getFullYear();
  let month = checkDate.getMonth();
  
  // If we're past the payment day this month, move to next month
  const daysInCurrentMonth = getDaysInMonth(year, month);
  const actualPaymentDay = Math.min(paymentDay, daysInCurrentMonth);
  
  if (checkDate.getDate() > actualPaymentDay) {
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
  }
  
  // Get the actual payment day for the target month (handle short months)
  const daysInTargetMonth = getDaysInMonth(year, month);
  const targetPaymentDay = Math.min(paymentDay, daysInTargetMonth);
  
  const nextDate = new Date(year, month, targetPaymentDay);
  
  // Check if the next payment date is before the start date
  if (nextDate < start) {
    // Recalculate based on start date
    year = start.getFullYear();
    month = start.getMonth();
    const daysInStartMonth = getDaysInMonth(year, month);
    const startMonthPaymentDay = Math.min(paymentDay, daysInStartMonth);
    
    if (start.getDate() > startMonthPaymentDay) {
      month++;
      if (month > 11) {
        month = 0;
        year++;
      }
    }
    const newDaysInMonth = getDaysInMonth(year, month);
    const newPaymentDay = Math.min(paymentDay, newDaysInMonth);
    nextDate.setFullYear(year);
    nextDate.setMonth(month);
    nextDate.setDate(newPaymentDay);
  }
  
  // Check if end date is set and we're past it
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    if (nextDate > end) {
      return null; // No more payments after end date
    }
  }
  
  return nextDate.toISOString().split('T')[0];
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

// ─── Commission calculation ────────────────────────────────────────────────
// Called when a project flips to status="completed" (and via the manual
// recalc endpoint). Looks up the partner attribution chain via the project's
// client, sums paid milestones (gross), subtracts logged project_costs, and
// writes a commission_entries row at status="due".
//
// Idempotent: a unique partial index in the DB ensures only one
// project_completion entry exists per project. recalc:true updates that
// row in place; otherwise existing rows are left alone.
async function generateCommissionForCompletedProject(
  project: Project,
  opts: { recalc?: boolean } = {},
): Promise<unknown | null> {
  if (project.commissionWaived) return null;

  const client = await storage.getClient(project.clientId);
  if (!client?.referredByPartnerId) return null;

  const partner = await storage.getReferralPartner(client.referredByPartnerId);
  if (!partner) return null;

  // Recurring revenue (hosting / retainer projects) is excluded from
  // commission unless the client has partner_actively_involved=true.
  const isRecurring =
    project.status === "hosting" || project.billingModel === "retainer";
  if (isRecurring && !client.partnerActivelyInvolved) return null;

  const grossCents = await storage.getProjectGrossPaidCents(project.id);
  const costsCents = await storage.getProjectCostsSum(project.id);
  const netCents = Math.max(0, grossCents - costsCents);

  const rate = project.commissionRateOverride ?? partner.defaultCommissionRate;
  const commissionCents = Math.round(netCents * Number(rate));

  const existing = await storage.getCommissionEntryByProject(
    project.id,
    "project_completion",
  );

  if (existing && !opts.recalc) return existing;

  if (existing && opts.recalc) {
    return storage.updateCommissionEntry(existing.id, {
      grossCents,
      costsCents,
      netCents,
      rateApplied: String(rate),
      commissionCents,
    } as any);
  }

  return storage.createCommissionEntry({
    partnerId: partner.id,
    clientId: client.id,
    projectId: project.id,
    sourceType: "project_completion",
    sourceRef: `project:${project.id}`,
    grossCents,
    costsCents,
    netCents,
    rateApplied: String(rate),
    commissionCents,
    // All commercial amounts live in USD on disk. Per-client/per-partner
    // local currency is a *display* concern handled at render time using
    // the FX rates from shared/currency.ts.
    currency: "USD",
    status: "due",
    notes: null,
  } as any);
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

  // Public audit report pages — served before any auth middleware
  const auditsDir =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public/audits")
      : path.resolve(process.cwd(), "client/public/audits");

  const auditPages: Record<string, string> = {
    carfarm: "carfarm.html",
    carlab: "carlab.html",
    classicsracer: "classicsracer.html",
    victoria: "victoria.html",
    groundzero: "groundzero.html",
    midwest: "midwest.html",
    muzepens: "muzepens.html",
    incredible: "incredible.html",
  };

  for (const [slug, filename] of Object.entries(auditPages)) {
    app.get(`/audit/${slug}`, (_req, res) => {
      res.sendFile(path.join(auditsDir, filename));
    });
  }

  // ── One-time migration: move audit files from old public/audits/ path to pipeline/data/audits/ ──
  (async () => {
    const oldBase = path.join(process.cwd(), "public", "audits");
    const newBase = path.join(process.cwd(), "pipeline", "data", "audits");
    if (fs.existsSync(oldBase)) {
      const slugs = fs.readdirSync(oldBase).filter(s =>
        fs.statSync(path.join(oldBase, s)).isDirectory()
      );
      for (const slug of slugs) {
        const oldFile = path.join(oldBase, slug, "index.html");
        const newDir  = path.join(newBase, slug);
        const newFile = path.join(newDir, "index.html");
        if (fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
          fs.mkdirSync(newDir, { recursive: true });
          fs.copyFileSync(oldFile, newFile);
          console.log(`[AuditMigration] Moved ${slug} → pipeline/data/audits/`);
        }
      }
    }
  })();

  // Lead engine: serve generated audit pages (public, no auth required)
  // Priority: 1) DB html_content  2) pipeline/data/audits/ disk  3) public/audits/ fallback
  app.get("/audits/:slug", async (req, res) => {
    const slug = req.params.slug;
    try {
      const record = await storage.getLeadAuditBySlug(slug);
      if (record?.htmlContent) {
        res.setHeader("Content-Type", "text/html");
        return res.send(record.htmlContent);
      }
    } catch { /* fall through to disk */ }
    const primaryPath  = path.join(process.cwd(), "pipeline/data/audits", slug, "index.html");
    const fallbackPath = path.join(process.cwd(), "public/audits", slug, "index.html");
    if (fs.existsSync(primaryPath)) {
      res.sendFile(primaryPath);
    } else if (fs.existsSync(fallbackPath)) {
      res.sendFile(fallbackPath);
    } else {
      res.status(404).send("Audit not found");
    }
  });

  // ── SEO: robots.txt ─────────────────────────────────────────────────────
  // Explicitly allow crawling of public content; deny private surfaces.
  // (If Cloudflare's content-signals layer is intercepting /robots.txt at the
  // edge, this Express response will be ignored — Cloudflare → Customize →
  // robots.txt to disable the managed default.)
  app.get("/robots.txt", (_req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send([
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /api",
      "Disallow: /lead-engine",
      "",
      "Sitemap: https://www.jdcoredev.com/sitemap.xml",
      "",
    ].join("\n"));
  });

  // ── SEO: sitemap.xml ────────────────────────────────────────────────────
  // Dynamic — lists homepage, key static pages, and every published audit.
  // Google fetches this on a recurring crawl; updating the audit table is
  // automatically reflected on next fetch.
  app.get("/sitemap.xml", async (_req, res) => {
    const SITE = "https://www.jdcoredev.com";
    type SitemapEntry = { loc: string; priority: string; changefreq: string; lastmod?: string };
    const staticUrls: SitemapEntry[] = [
      { loc: SITE + "/",                                  priority: "1.0", changefreq: "weekly"  },
      { loc: SITE + "/services/ai-advertising-audit",     priority: "0.8", changefreq: "monthly" },
      { loc: SITE + "/audits",                            priority: "0.8", changefreq: "daily"   },
    ];
    const auditUrls: SitemapEntry[] = [];
    try {
      const audits = await storage.getAllLeadAudits();
      for (const a of (audits || [])) {
        if (!a.auditUrl) continue;
        const slug = String(a.auditUrl).split("/audits/")[1]?.replace(/\/$/, "");
        if (!slug) continue;
        auditUrls.push({
          loc: `${SITE}/audits/${slug}`,
          priority: "0.6",
          changefreq: "monthly",
          lastmod: a.contactedAt ? new Date(a.contactedAt).toISOString().slice(0, 10) : undefined,
        });
      }
    } catch { /* empty audit table — sitemap only contains static URLs */ }

    const all: SitemapEntry[] = [...staticUrls, ...auditUrls];
    const xml = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
      ...all.map((u) =>
        `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
      ),
      `</urlset>`,
    ].join("\n");
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.send(xml);
  });

  // ── Public audits index page ────────────────────────────────────────────
  // Server-rendered HTML so Google has a crawl entry point that links to
  // every audit. Deliberately simple — purpose is internal linking + SEO,
  // not a marketing page.
  app.get("/audits", async (_req, res) => {
    type AuditRow = { name: string; slug: string; location: string | null; industry: string | null; date: string };
    const rows: AuditRow[] = [];
    try {
      const audits = await storage.getAllLeadAudits();
      for (const a of (audits || [])) {
        if (!a.auditUrl) continue;
        const slug = String(a.auditUrl).split("/audits/")[1]?.replace(/\/$/, "");
        if (!slug) continue;
        rows.push({
          name:     a.name || slug,
          slug,
          location: a.location || null,
          industry: a.industry || null,
          date:     a.contactedAt ? new Date(a.contactedAt).toISOString().slice(0, 10) : "",
        });
      }
      rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    } catch { /* empty list */ }
    const esc = (s: string) =>
      String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hong Kong Small Business Audits | JD CoreDev</title>
<meta name="description" content="Free digital audits of Hong Kong small businesses — website, social, infrastructure, growth scoring. Updated daily by JD CoreDev.">
<link rel="canonical" href="https://www.jdcoredev.com/audits">
<meta property="og:type" content="website">
<meta property="og:title" content="Hong Kong Small Business Audits | JD CoreDev">
<meta property="og:description" content="Free digital audits of Hong Kong small businesses — updated daily by JD CoreDev.">
<meta property="og:url" content="https://www.jdcoredev.com/audits">
<meta property="og:image" content="https://www.jdcoredev.com/og-default.png">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 880px; margin: 0 auto; padding: 48px 24px; color: #1a1a1a; line-height: 1.6; background: #fafaf8; }
  h1 { font-size: 28px; margin-bottom: 8px; }
  .lead { color: #555; margin-bottom: 32px; }
  ul { list-style: none; padding: 0; }
  li { padding: 16px 0; border-bottom: 1px solid #eaeaea; }
  li a { font-size: 17px; font-weight: 500; color: #1a1a1a; text-decoration: none; }
  li a:hover { color: #2d7a6b; }
  .meta { font-size: 13px; color: #888; margin-top: 4px; }
  .empty { color: #888; padding: 40px 0; text-align: center; }
  footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #eaeaea; font-size: 14px; color: #888; }
  footer a { color: #2d7a6b; text-decoration: none; }
</style>
</head>
<body>
<h1>Hong Kong Small Business Audits</h1>
<p class="lead">${rows.length} audits and counting. Each one is a free assessment of a real Hong Kong small business — website, social, infrastructure, growth — by <a href="/">JD CoreDev</a>.</p>
${rows.length === 0
  ? `<p class="empty">No published audits yet. Check back soon.</p>`
  : `<ul>${rows.map(r => `<li><a href="/audits/${esc(r.slug)}">${esc(r.name)}</a><div class="meta">${[esc(r.industry || ""), esc(r.location || "")].filter(Boolean).join(" · ")}${r.date ? " · " + r.date : ""}</div></li>`).join("")}</ul>`
}
<footer>
  Want one for your business? <a href="/">Get in touch with JD CoreDev →</a>
</footer>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  // Lead engine dashboard (ENGINE_SECRET required in API calls from the UI)
  app.get("/lead-engine", (_req, res) => {
    res.sendFile(path.join(process.cwd(), "pipeline/lead-engine-dashboard.html"));
  });

  // Initialise the pipeline ↔ database bridge (dual-write for audits/drafts)
  initDbBridge({
    upsertLeadAudit:          (d: any) => storage.upsertLeadAudit(d),
    updateLeadAuditStatus:    (domain: string, status: string) => storage.updateLeadAuditStatus(domain, status),
    updateLeadAuditHtml:      (domain: string, html: string) => storage.updateLeadAuditHtml(domain, html),
    getLeadAuditBySlug:       (slug: string) => storage.getLeadAuditBySlug(slug),
    deleteLeadAudit:          (domain: string) => storage.deleteLeadAudit(domain),
    createLeadDraft:          (d: any) => storage.createLeadDraft(d),
    markLeadDraftSent:        (id: number) => storage.markLeadDraftSent(id),
    updateLeadDraft:          (id: number, data: any) => storage.updateLeadDraft(id, data),
    deleteLeadDraft:          (id: number) => storage.deleteLeadDraft(id),
    getAllLeadAudits:          () => storage.getAllLeadAudits(),
    getAllLeadDrafts:          () => storage.getAllLeadDrafts(),
    getLeadEngineSettings:    () => storage.getLeadEngineSettings(),
    upsertLeadEngineSettings: (data: any) => storage.upsertLeadEngineSettings(data),
  });

  // One-time migration: seed DB with existing JSON file data if DB is empty
  (async () => {
    try {
      const existingAudits = await storage.getAllLeadAudits();
      if (existingAudits.length === 0) {
        const contactedFile = path.join(process.cwd(), "pipeline/data/contacted.json");
        if (fs.existsSync(contactedFile)) {
          const raw = JSON.parse(fs.readFileSync(contactedFile, "utf-8"));
          const entries = Object.values(raw) as any[];
          for (const e of entries) {
            if (!e.domain) continue;
            await storage.upsertLeadAudit({
              name: e.name || e.domain,
              domain: e.domain,
              location: e.location || null,
              industry: e.industry || null,
              auditUrl: e.auditUrl || null,
              channel: e.channel || "manual",
              status: e.status || "draft",
            }).catch(() => {});
          }
          console.log(`[LeadEngine] Migrated ${entries.length} audit(s) from JSON to DB`);
        }
      }

      const existingDrafts = await storage.getAllLeadDrafts();
      if (existingDrafts.length === 0) {
        const draftFile = path.join(process.cwd(), "pipeline/data/draft-queue.json");
        if (fs.existsSync(draftFile)) {
          const drafts = JSON.parse(fs.readFileSync(draftFile, "utf-8")) as any[];
          for (const d of drafts) {
            await storage.createLeadDraft({
              company: d.company,
              domain: d.domain || null,
              email: d.email || null,
              instagram: d.instagram || null,
              whatsapp: d.whatsapp || null,
              auditUrl: d.auditUrl || null,
              subject: d.subject,
              body: d.body,
              sent: !!d.sent,
              sentAt: d.sentAt ? new Date(d.sentAt) : null,
            }).catch(() => {});
          }
          console.log(`[LeadEngine] Migrated ${drafts.length} draft(s) from JSON to DB`);
        }
      }

      // Backfill html_content from disk files into DB for any audit that lacks it
      const audits = await storage.getAllLeadAudits();
      const auditsDir = path.join(process.cwd(), "pipeline/data/audits");
      let backfilled = 0;
      for (const a of audits) {
        if (a.htmlContent || !a.auditUrl) continue;
        const slug = a.auditUrl.split("/audits/")[1]?.replace(/\/$/, "");
        if (!slug) continue;
        const diskFile = path.join(auditsDir, slug, "index.html");
        if (fs.existsSync(diskFile)) {
          const html = fs.readFileSync(diskFile, "utf-8");
          await storage.updateLeadAuditHtml(a.domain, html).catch(() => {});
          backfilled++;
        }
      }
      if (backfilled > 0) console.log(`[LeadEngine] Backfilled html_content for ${backfilled} audit(s)`);
    } catch (err: any) {
      console.error("[LeadEngine] JSON migration error:", err.message);
    }
  })();

  // Lead engine API routes (auth: x-engine-secret header per-route via requireSecret).
  // requireAdmin was tried here but fails — this mount runs before passport.initialize
  // so req.isAuthenticated is undefined. The router's own requireSecret is sufficient.
  app.use("/api/lead-engine", leadEngineRouter);
  // Agent-routine endpoints (called by an Anthropic-hosted scheduled routine
  // — replaces the legacy /run server-side Anthropic API pipeline).
  app.use("/api/lead-engine/agent", leadEngineAgentRouter);

  // Business expense tracker — Gmail scanner routine + admin CRUD.
  app.use("/api/expenses", expensesRouter);
  app.use("/api/expenses/agent", expensesAgentRouter);

  // Social trader signal ingestion — admin-only review queue for posts
  // from tracked Instagram (etc.) traders. Auto-scraping deferred; manual
  // paste-in flow with Claude extraction.
  app.use("/api/social-signals", requireAdmin, socialSignalsRouter);

  // Dev-logs ingest (API-key auth, called by Claude Code hook scripts on dev machines).
  // Writes into maintenance_logs so entries count toward project_hosting_terms budgets.
  app.use("/api/dev-logs", devLogsIngestRouter);

  // ── External Leads Import API ─────────────────────────────────────────────
  // POST /api/leads/import  — coworker automation pushes pre-researched leads
  // GET  /api/leads          — verify what's been imported
  // Auth: auth_key in request body (POST) or ?auth_key= / Authorization header (GET)
  (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        business_name TEXT NOT NULL,
        industry TEXT,
        location TEXT,
        priority TEXT,
        owner_name TEXT,
        phone TEXT,
        email TEXT,
        website TEXT,
        instagram TEXT,
        facebook TEXT,
        google_rating REAL,
        google_review_count INTEGER,
        overall_score REAL,
        scores_json TEXT,
        missing_features_json TEXT,
        ai_opportunities_json TEXT,
        competitor_intel TEXT,
        draft_email_subject TEXT,
        draft_email_body TEXT,
        draft_dm TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      )
    `);
    // Migrations for fields the cowork-engine sends that the original schema
    // didn't capture. Idempotent — safe to run on every boot.
    await pool.query(`
      ALTER TABLE leads
        ADD COLUMN IF NOT EXISTS channel TEXT,
        ADD COLUMN IF NOT EXISTS recommendations_json TEXT,
        ADD COLUMN IF NOT EXISTS currency TEXT,
        ADD COLUMN IF NOT EXISTS estimated_monthly_saas_spend REAL,
        ADD COLUMN IF NOT EXISTS primary_pain_point TEXT,
        ADD COLUMN IF NOT EXISTS linkedin TEXT
    `);
    // angle: classification the Lead Engine routine assigns to each draft —
    // "creative" | "system" | "rebuild". Drives coloured badges + filtering in
    // /admin/lead-engine. Idempotent so old prod DBs pick it up on boot.
    await pool.query(`
      ALTER TABLE lead_drafts
        ADD COLUMN IF NOT EXISTS angle TEXT
    `).catch(() => {}); // table may not exist yet on first boot — Drizzle migrations create it
  })();

  const leadsImportCors = (_req: Request, res: Response, next: NextFunction) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
  };

  app.options("/api/leads/import", leadsImportCors, (_req, res) => res.sendStatus(204));
  app.options("/api/leads", leadsImportCors, (_req, res) => res.sendStatus(204));

  app.post("/api/leads/import", leadsImportCors, async (req: Request, res: Response) => {
    try {
      const { auth_key, lead } = req.body || {};
      const expectedKey = process.env.LEADS_IMPORT_KEY || "jdcd-leads-1776161970";

      if (!auth_key || auth_key !== expectedKey) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
      if (!lead || !lead.business_name) {
        return res.status(400).json({ ok: false, error: "business_name is required" });
      }

      // Dedup check — same business_name (case-insensitive) or same website
      const dupCheck = await pool.query(
        `SELECT id FROM leads WHERE LOWER(business_name) = LOWER($1) OR (website IS NOT NULL AND website = $2) LIMIT 1`,
        [lead.business_name, lead.website || null]
      );
      if (dupCheck.rows.length > 0) {
        return res.status(409).json({ ok: false, error: "Duplicate lead", existing_id: dupCheck.rows[0].id });
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await pool.query(
        `INSERT INTO leads (
          id, business_name, industry, location, priority, owner_name, phone, email,
          website, instagram, facebook, linkedin, google_rating, google_review_count, overall_score,
          scores_json, missing_features_json, ai_opportunities_json, recommendations_json, competitor_intel,
          draft_email_subject, draft_email_body, draft_dm, notes,
          channel, currency, estimated_monthly_saas_spend, primary_pain_point,
          created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)`,
        [
          id,
          lead.business_name,
          lead.industry || null,
          lead.location || null,
          lead.priority || null,
          lead.owner_name || null,
          lead.phone || null,
          lead.email || null,
          lead.website || null,
          lead.instagram || null,
          lead.facebook || null,
          lead.linkedin || null,
          lead.google_rating ?? null,
          lead.google_review_count ?? null,
          lead.overall_score ?? null,
          lead.scores ? JSON.stringify(lead.scores) : null,
          lead.missing_features ? JSON.stringify(lead.missing_features) : null,
          lead.ai_opportunities ? JSON.stringify(lead.ai_opportunities) : null,
          lead.recommendations ? JSON.stringify(lead.recommendations) : null,
          lead.competitor_intel || null,
          lead.draft_email_subject || null,
          lead.draft_email_body || null,
          lead.draft_dm || null,
          lead.notes || null,
          lead.channel || "cowork-engine",
          lead.currency || null,
          lead.estimated_monthly_saas_spend ?? null,
          lead.primary_pain_point || null,
          now,
        ]
      );

      // ── Bridge to Lead Engine audit system ────────────────────────────────
      // After saving to the leads table, also upsert into lead_audits + lead_drafts
      // so the lead appears in the Lead Engine dashboard immediately. Generate
      // the audit page from the imported scores so the dashboard has a clickable
      // Audit link for cowork-engine leads (previously these were silently null).
      try {
        // Extract a clean hostname from the website URL for use as the unique domain key
        let auditDomain: string;
        if (lead.website) {
          try {
            const url = lead.website.startsWith("http") ? lead.website : `https://${lead.website}`;
            auditDomain = new URL(url).hostname.replace(/^www\./, "");
          } catch {
            auditDomain = lead.website;
          }
        } else {
          auditDomain = `${lead.business_name.toLowerCase().replace(/[^a-z0-9]/g, "-")}.cowork`;
        }

        // Build the audit page from cowork's payload and persist the URL.
        // generateAuditPage handles file write + DB upsert + html backfill;
        // any failure here is non-fatal so the lead row still survives.
        let generatedAuditUrl: string | null = null;
        try {
          const { generateAuditPage } = await import("../pipeline/generate-page.js");
          const { synthesiseCoworkAudit } = await import("../pipeline/synthesise-cowork-audit.js");
          const auditObj = synthesiseCoworkAudit(lead);
          generatedAuditUrl = await generateAuditPage(
            { name: lead.business_name, domain: auditDomain, industry: lead.industry, location: lead.location },
            auditObj
          );
        } catch (genErr: any) {
          console.error("[leads/import] audit page generation failed:", genErr.message);
        }

        // Upsert audit — generateAuditPage already writes the row, but call this
        // again to set channel + status correctly (it defaults to 'draft' channel).
        await storage.upsertLeadAudit({
          name: lead.business_name,
          domain: auditDomain,
          location: lead.location || null,
          industry: lead.industry || null,
          auditUrl: generatedAuditUrl,
          htmlContent: null,
          channel: lead.channel || "cowork-engine",
          status: "draft",
        });

        // Create or update draft if outreach content is provided
        if (lead.draft_email_subject && lead.draft_email_body) {
          const existingDraft = await pool.query(
            `SELECT id FROM lead_drafts WHERE domain = $1 LIMIT 1`,
            [auditDomain]
          );
          if (existingDraft.rows.length > 0) {
            await storage.updateLeadDraft(existingDraft.rows[0].id, {
              subject: lead.draft_email_subject,
              body: lead.draft_email_body,
              domain: auditDomain,
              auditUrl: generatedAuditUrl,
            });
          } else {
            await storage.createLeadDraft({
              company: lead.business_name,
              domain: auditDomain,
              email: lead.email || null,
              instagram: lead.instagram || null,
              whatsapp: null,
              auditUrl: generatedAuditUrl,
              subject: lead.draft_email_subject,
              body: lead.draft_email_body,
              sent: false,
              sentAt: null,
            });
          }
        }

        console.log(`[leads/import] bridged to Lead Engine: ${lead.business_name} (${auditDomain})`);
      } catch (bridgeErr: any) {
        // Bridge failure is non-fatal — the lead was still saved to the leads table
        console.error("[leads/import] Lead Engine bridge error:", bridgeErr.message);
      }
      // ── End Lead Engine bridge ─────────────────────────────────────────────

      return res.json({ ok: true, id, business_name: lead.business_name });
    } catch (err: any) {
      console.error("[leads/import] error:", err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get("/api/leads", leadsImportCors, async (req: Request, res: Response) => {
    try {
      const expectedKey = process.env.LEADS_IMPORT_KEY || "jdcd-leads-1776161970";
      const authHeader = req.headers.authorization || "";
      const keyFromHeader = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
      const key = (req.query.auth_key as string) || keyFromHeader;

      if (!key || key !== expectedKey) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      const result = await pool.query(`SELECT * FROM leads ORDER BY created_at DESC`);
      return res.json(result.rows.map(r => ({
        ...r,
        scores: r.scores_json ? JSON.parse(r.scores_json) : null,
        missing_features: r.missing_features_json ? JSON.parse(r.missing_features_json) : null,
        ai_opportunities: r.ai_opportunities_json ? JSON.parse(r.ai_opportunities_json) : null,
        recommendations: r.recommendations_json ? JSON.parse(r.recommendations_json) : null,
      })));
    } catch (err: any) {
      console.error("[leads] error:", err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });
  // ── End External Leads Import API ─────────────────────────────────────────

  // Claude Trader API routes
  app.use("/api/trader", traderRouter);
  // Agent-routine endpoints (called by an Anthropic-hosted scheduled routine
  // — replaces the legacy server-side cron + Claude API pipeline).
  app.use("/api/trader/agent", traderAgentRouter);
  initTrader().catch(e => console.error('[trader] init error:', e));

  // Claude Predictor API routes
  app.use("/api/predictor", predictorRouter);
  // Agent-routine endpoints (called by an Anthropic-hosted scheduled routine
  // — replaces the legacy server-side cron + Claude API pipeline).
  app.use("/api/predictor/agent", predictorAgentRouter);
  initPredictor().catch(e => console.error('[predictor] init error:', e));

  // ── Automation Master Control ─────────────────────────────────────────────
  // GET /api/automation — returns cron_enabled for all services
  app.get("/api/automation", async (_req, res) => {
    try {
      const tables = [
        { id: "predictor",  table: "predictor_settings"  },
        { id: "trader",     table: "trader_settings"     },
        { id: "arbitrage",  table: "arb_settings"        },
        { id: "crypto_arb", table: "crypto_arb_settings" },
      ];
      const result: Record<string, string> = {};
      for (const { id, table } of tables) {
        try {
          const r = await pool.query(`SELECT value FROM ${table} WHERE key='cron_enabled'`);
          result[id] = r.rows[0]?.value ?? "false";
        } catch { result[id] = "false"; }
      }
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/automation — set cron_enabled for all services at once
  app.post("/api/automation", async (req, res) => {
    const { enabled } = req.body as { enabled: boolean };
    const val = enabled ? "true" : "false";
    const tables = [
      { table: "predictor_settings"  },
      { table: "trader_settings"     },
      { table: "arb_settings"        },
      { table: "crypto_arb_settings" },
    ];
    try {
      for (const { table } of tables) {
        try {
          await pool.query(
            `INSERT INTO ${table} (key, value, updated_at) VALUES ('cron_enabled', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
            [val]
          );
        } catch {}
      }
      res.json({ ok: true, enabled });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PATCH /api/automation/:service — toggle one service's cron
  app.patch("/api/automation/:service", async (req, res) => {
    const { service } = req.params;
    const { enabled } = req.body as { enabled: boolean };
    const tableMap: Record<string, string> = {
      predictor: "predictor_settings",
      trader:    "trader_settings",
      arbitrage: "arb_settings",
      crypto_arb:"crypto_arb_settings",
    };
    const table = tableMap[service];
    if (!table) return res.status(400).json({ error: "Unknown service" });
    try {
      await pool.query(
        `INSERT INTO ${table} (key, value, updated_at) VALUES ('cron_enabled', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
        [enabled ? "true" : "false"]
      );
      res.json({ ok: true, service, enabled });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  // ── End Automation Master Control ──────────────────────────────────────────

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

  // Expense Scanner manual fire — gated by admin session.
  // (The expensesAgentRouter mount runs before passport, so the /run route
  // lives here at app-level instead of on the router itself.)
  app.post("/api/expenses/agent/run", requireAdmin, fireExpenseScannerRoutine);

  // Backfill USD snapshot on rows where amount_usd IS NULL. Idempotent.
  app.post("/api/expenses/backfill-fx", requireAdmin, backfillFx);

  // Predictor manual fire — same pattern as the expense scanner.
  app.post("/api/predictor/agent/run", requireAdmin, firePredictorRoutine);

  // Lead Engine manual fire — same pattern.
  app.post("/api/lead-engine/agent/run", requireAdmin, fireLeadEngineRoutine);

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
      if (data.parentProjectId) {
        const parent = await storage.getProject(data.parentProjectId);
        if (!parent) return res.status(400).json({ message: "Parent project not found" });
        if (parent.clientId !== data.clientId) return res.status(400).json({ message: "Parent project must belong to the same client" });
        if (parent.parentProjectId) return res.status(400).json({ message: "Sub-projects cannot themselves have a parent (single-level only)" });
      }
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
      const oldProject = await storage.getProject(projectId);
      const incoming: any = { ...req.body };

      // Validate parent_project_id if it's being set/changed.
      if (incoming.parentProjectId !== undefined && incoming.parentProjectId !== null) {
        if (incoming.parentProjectId === projectId) {
          return res.status(400).json({ message: "A project cannot be its own parent" });
        }
        const parent = await storage.getProject(incoming.parentProjectId);
        if (!parent) return res.status(400).json({ message: "Parent project not found" });
        const targetClientId = incoming.clientId ?? oldProject?.clientId;
        if (parent.clientId !== targetClientId) {
          return res.status(400).json({ message: "Parent project must belong to the same client" });
        }
        if (parent.parentProjectId) {
          return res.status(400).json({ message: "Sub-projects cannot themselves have a parent (single-level only)" });
        }
        // If THIS project already has sub-projects of its own, it can't become a child.
        const ownChildren = await storage.getSubProjects(projectId);
        if (ownChildren.length > 0) {
          return res.status(400).json({ message: "This project has sub-projects of its own; remove them before nesting it under a parent" });
        }
      }

      // When the project flips to "completed", stamp completedAt so the
      // partner-tail clock has an explicit anchor distinct from a planned
      // endDate. Idempotent: only set on the transition into completed.
      const isCompleting =
        incoming.status === "completed" &&
        oldProject &&
        oldProject.status !== "completed" &&
        !oldProject.completedAt;
      if (isCompleting) {
        incoming.completedAt = new Date();
      }

      const updated = await storage.updateProject(projectId, incoming);
      if (!updated) {
        return res.status(404).json({ message: "Project not found" });
      }

      if (req.body.status === "hosting" && oldProject && oldProject.status !== "hosting") {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthStartStr = format(monthStart, "yyyy-MM-dd");
        await db.update(maintenanceLogs)
          .set({ logType: "hosting" })
          .where(
            and(
              eq(maintenanceLogs.projectId, projectId),
              eq(maintenanceLogs.logType, "development"),
              gte(maintenanceLogs.logDate, monthStartStr)
            )
          );
      }

      // Auto-generate commission entry on the transition to completed.
      if (isCompleting) {
        try {
          await generateCommissionForCompletedProject(updated);
        } catch (e) {
          console.error(`[commission] failed for project ${projectId}:`, e);
        }
      }

      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  // ─── Referral Partners ────────────────────────────────────────────────
  app.get("/api/admin/partners", requireAdmin, async (_req, res, next) => {
    try {
      res.json(await storage.getReferralPartners());
    } catch (e) { next(e); }
  });

  app.get("/api/admin/partners/:id", requireAdmin, async (req, res, next) => {
    try {
      const summary = await storage.getReferralPartnerSummary(parseInt(req.params.id));
      if (!summary) return res.status(404).json({ error: "Partner not found" });
      res.json(summary);
    } catch (e) { next(e); }
  });

  const partnerSchema = z.object({
    name: z.string().min(1),
    tradingName: z.string().optional().or(z.literal("")),
    contactEmail: z.string().email().optional().or(z.literal("")),
    contactPhone: z.string().optional().or(z.literal("")),
    defaultCommissionRate: z.union([z.string(), z.number()]).transform((v) => String(v)),
    defaultRecurringShareRate: z.union([z.string(), z.number()]).optional().nullable().transform((v) => v == null || v === "" ? null : String(v)),
    status: z.enum(["active", "paused", "terminated"]).default("active"),
    partnershipStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    defaultTailMonths: z.coerce.number().int().min(0).default(12),
    payoutCurrency: z.string().optional().or(z.literal("")),
    notes: z.string().optional().or(z.literal("")),
  });

  app.post("/api/admin/partners", requireAdmin, async (req, res, next) => {
    try {
      const data = partnerSchema.parse(req.body);
      const cleaned: any = {
        ...data,
        tradingName: data.tradingName || null,
        contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone || null,
        partnershipStartDate: data.partnershipStartDate || null,
        payoutCurrency: data.payoutCurrency || null,
        notes: data.notes || null,
      };
      res.status(201).json(await storage.createReferralPartner(cleaned));
    } catch (e) { next(e); }
  });

  app.patch("/api/admin/partners/:id", requireAdmin, async (req, res, next) => {
    try {
      const data = partnerSchema.partial().parse(req.body);
      const cleaned: any = { ...data };
      // Convert empty strings to null for nullable fields if they were provided.
      for (const k of ["tradingName", "contactEmail", "contactPhone", "partnershipStartDate", "payoutCurrency", "notes"]) {
        if (cleaned[k] === "") cleaned[k] = null;
      }
      const updated = await storage.updateReferralPartner(parseInt(req.params.id), cleaned);
      if (!updated) return res.status(404).json({ error: "Partner not found" });
      res.json(updated);
    } catch (e) { next(e); }
  });

  app.get("/api/admin/partners/:id/commissions", requireAdmin, async (req, res, next) => {
    try {
      const partnerId = parseInt(req.params.id);
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const entries = await storage.getCommissionEntries({ partnerId, status });
      res.json(entries);
    } catch (e) { next(e); }
  });

  app.get("/api/admin/partners/:id/clients", requireAdmin, async (req, res, next) => {
    try {
      const partnerId = parseInt(req.params.id);
      const partnerClients = await db.select().from(clients)
        .where(eq(clients.referredByPartnerId, partnerId))
        .orderBy(desc(clients.createdAt));
      res.json(partnerClients);
    } catch (e) { next(e); }
  });

  // ─── Project Costs (dev / external costs deducted before commission) ───
  app.get("/api/admin/projects/:projectId/costs", requireAdmin, async (req, res, next) => {
    try {
      res.json(await storage.getProjectCosts(parseInt(req.params.projectId)));
    } catch (e) { next(e); }
  });

  const projectCostSchema = z.object({
    description: z.string().min(1),
    amountCents: z.coerce.number().int().min(0),
    currency: z.string().default("USD"),
    incurredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    category: z.enum(["third_party_software", "contractor", "infrastructure", "stock_assets", "vat_passthrough", "other"]).optional(),
    notes: z.string().optional().or(z.literal("")),
  });

  app.post("/api/admin/projects/:projectId/costs", requireAdmin, async (req, res, next) => {
    try {
      const data = projectCostSchema.parse(req.body);
      const cost = await storage.createProjectCost({
        projectId: parseInt(req.params.projectId),
        description: data.description,
        amountCents: data.amountCents,
        currency: data.currency,
        incurredDate: data.incurredDate || null,
        category: data.category ?? null,
        notes: data.notes || null,
      } as any);
      res.status(201).json(cost);
    } catch (e) { next(e); }
  });

  app.patch("/api/admin/project-costs/:id", requireAdmin, async (req, res, next) => {
    try {
      const data = projectCostSchema.partial().parse(req.body);
      const cleaned: any = { ...data };
      for (const k of ["incurredDate", "notes"]) if (cleaned[k] === "") cleaned[k] = null;
      const updated = await storage.updateProjectCost(parseInt(req.params.id), cleaned);
      if (!updated) return res.status(404).json({ error: "Cost not found" });
      res.json(updated);
    } catch (e) { next(e); }
  });

  app.delete("/api/admin/project-costs/:id", requireAdmin, async (req, res, next) => {
    try {
      await storage.deleteProjectCost(parseInt(req.params.id));
      res.status(204).send();
    } catch (e) { next(e); }
  });

  // Manual recalc — recreates the commission entry for a completed project
  // using current paid-milestone total and current project_costs sum. Useful
  // after editing costs after completion.
  app.post("/api/admin/projects/:id/recalc-commission", requireAdmin, async (req, res, next) => {
    try {
      const project = await storage.getProject(parseInt(req.params.id));
      if (!project) return res.status(404).json({ error: "Project not found" });
      if (project.status !== "completed") {
        return res.status(400).json({ error: "Project is not completed" });
      }
      const entry = await generateCommissionForCompletedProject(project, { recalc: true });
      res.json({ entry });
    } catch (e) { next(e); }
  });

  // ─── Commission Entries (mark paid / update notes) ─────────────────────
  app.get("/api/admin/commissions", requireAdmin, async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const partnerId = req.query.partnerId ? parseInt(String(req.query.partnerId)) : undefined;
      res.json(await storage.getCommissionEntries({ status, partnerId }));
    } catch (e) { next(e); }
  });

  const commissionUpdateSchema = z.object({
    status: z.enum(["due", "paid", "waived", "cancelled"]).optional(),
    paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    commissionCents: z.coerce.number().int().min(0).optional(),
    rateApplied: z.union([z.string(), z.number()]).optional().transform((v) => v == null ? undefined : String(v)),
    netCents: z.coerce.number().int().min(0).optional(),
    grossCents: z.coerce.number().int().min(0).optional(),
    costsCents: z.coerce.number().int().min(0).optional(),
    notes: z.string().optional().or(z.literal("")),
  });

  app.patch("/api/admin/commissions/:id", requireAdmin, async (req, res, next) => {
    try {
      const data = commissionUpdateSchema.parse(req.body);
      const cleaned: any = { ...data };
      if (cleaned.notes === "") cleaned.notes = null;
      if (cleaned.paymentDate === "") cleaned.paymentDate = null;
      // When status flips to "paid", record paidAt automatically if absent.
      if (cleaned.status === "paid") {
        cleaned.paidAt = new Date();
        if (!cleaned.paymentDate) cleaned.paymentDate = new Date().toISOString().split("T")[0];
      }
      const updated = await storage.updateCommissionEntry(parseInt(req.params.id), cleaned);
      if (!updated) return res.status(404).json({ error: "Commission entry not found" });
      res.json(updated);
    } catch (e) { next(e); }
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

  app.patch("/api/admin/projects/:projectId/process-steps/reorder", requireAdmin, async (req, res, next) => {
    try {
      const { updates } = req.body;
      if (!Array.isArray(updates)) {
        return res.status(400).json({ error: "updates must be an array of { id, stepOrder }" });
      }
      const projectId = parseInt(req.params.projectId);
      const existingSteps = await storage.getProcessStepsByProject(projectId);
      const validIds = new Set(existingSteps.map(s => s.id));
      const scoped = updates.filter((u: any) => validIds.has(u.id));
      await storage.reorderProcessSteps(scoped);
      const steps = await storage.getProcessStepsByProject(projectId);
      res.json(steps);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/projects/:projectId/process-steps/generate", requireAdmin, async (req, res, next) => {
    try {
      const { prdText } = req.body;
      if (!prdText || typeof prdText !== "string") {
        return res.status(400).json({ error: "prdText is required" });
      }
      const { generateTasksFromPRD } = await import("./services/ai-tasks");
      let generatedTasks;
      try {
        generatedTasks = await generateTasksFromPRD(prdText);
      } catch (aiError: any) {
        console.error("[PRD generate] AI error:", aiError?.message || aiError);
        return res.status(422).json({ error: aiError?.message || "AI failed to parse the PRD — please try again" });
      }
      if (!generatedTasks || generatedTasks.length === 0) {
        return res.status(422).json({ error: "No tasks could be extracted — try providing more detail in your PRD" });
      }
      const projectId = parseInt(req.params.projectId);
      const existing = await storage.getProcessStepsByProject(projectId);
      const maxOrder = existing.length > 0 ? Math.max(...existing.map(s => s.stepOrder)) : 0;
      const created = [];
      for (const task of generatedTasks) {
        const step = await storage.createProcessStep({
          projectId,
          title: task.title,
          description: task.description,
          stepOrder: maxOrder + task.stepOrder,
          status: "planned",
          priority: task.priority,
          isMilestone: false,
          amountCents: 0,
        });
        created.push(step);
      }
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/projects/:projectId/process-steps/auto-detect", requireAdmin, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const steps = await storage.getProcessStepsByProject(projectId);
      const activeTasks = steps.filter(s => s.status !== "done");
      if (activeTasks.length === 0) {
        return res.json({ updated: 0, results: [] });
      }
      const logs = await storage.getMaintenanceLogs(projectId);
      const recentLogs = logs.slice(0, 50);
      const historyEvents = await storage.getHistoryEventsByProject(projectId);
      const recentHistory = historyEvents.slice(0, 50);
      const { detectTaskCompletion } = await import("./services/ai-tasks");
      const taskInputs = activeTasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        completionPercentage: t.completionPercentage,
      }));
      const logInputs = recentLogs.map(l => ({
        summary: l.description || "",
        details: null,
        occurredAt: l.logDate,
      }));
      const historyInputs = recentHistory.map(h => ({
        summary: h.summary,
        details: h.details,
        occurredAt: h.occurredAt,
      }));
      const results = await detectTaskCompletion(taskInputs, logInputs, historyInputs);
      const validTaskIds = new Set(activeTasks.map(t => t.id));
      let updated = 0;
      for (const result of results) {
        if (!validTaskIds.has(result.taskId)) continue;
        await storage.updateProcessStep(result.taskId, {
          status: result.status as any,
          completionPercentage: result.completionPercentage,
          autoDetectedStatus: result.reasoning,
          lastAutoChecked: new Date(),
        } as any);
        updated++;
      }
      res.json({ updated, results });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/task-digest/preview", requireAdmin, async (req, res, next) => {
    try {
      const tasks = await storage.getActiveTasksAcrossProjects();
      const allSteps = await Promise.all(
        [...new Set(tasks.map(t => t.projectId))].map(async pid => {
          const steps = await storage.getProcessStepsByProject(pid);
          return steps.filter(s => s.status === "done" && s.lastAutoChecked && 
            new Date(s.lastAutoChecked).getTime() > Date.now() - 24 * 60 * 60 * 1000);
        })
      );
      const recentlyDone = allSteps.flat();
      res.json({ activeTasks: tasks, recentlyCompleted: recentlyDone });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/task-digest", requireAdmin, async (req, res, next) => {
    try {
      const { generateAndSendDigest } = await import("./services/task-digest");
      const adminEmail = process.env.ADMIN_EMAIL || (req.user as any)?.email || "admin@jdcoredev.com";
      const result = await generateAndSendDigest(adminEmail);
      if (!result.success) {
        return res.status(500).json({ error: result.error || "Failed to send digest" });
      }
      res.json({ message: "Digest email sent" });
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

  // Receive uploads streamed against the signed URL minted by /api/uploads/request-url.
  app.put("/api/uploads/put/:token", uploadLimiter, async (req, res, next) => {
    try {
      const objectId = verifyUploadToken(req.params.token);
      if (!objectId) {
        return res.status(403).json({ error: "Invalid or expired upload token" });
      }
      const contentType = (req.headers["content-type"] || "").toString().split(";")[0].trim() || undefined;

      // If a body parser already consumed the request (e.g. JSON content-type),
      // the verify hook on express.json saved the raw bytes onto req.rawBody.
      // Otherwise we stream the live request directly to disk.
      let result;
      if ((req as any).rawBody && Buffer.isBuffer((req as any).rawBody)) {
        const { Readable } = await import("stream");
        const buf: Buffer = (req as any).rawBody;
        const stream = Readable.from(buf);
        result = await objectStorageService.writeUploadedObject(objectId, stream, contentType);
      } else {
        result = await objectStorageService.writeUploadedObject(objectId, req, contentType);
      }
      return res.json(result);
    } catch (error) {
      console.error("Error receiving upload:", error);
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
      
      // Automatically create or update recurring payment when hosting terms are saved
      // Only create/update when all required fields are present
      if (project.status === "hosting" && 
          terms.monthlyFeeCents && terms.monthlyFeeCents > 0 &&
          terms.startDate && terms.invoiceDueDays) {
        
        const paymentDay = terms.invoiceDueDays;
        const startDate = terms.startDate;
        
        // Check if recurring payment already exists for this project
        const existingPayment = await storage.getRecurringPaymentByProject(projectId);
        
        if (existingPayment) {
          // Update existing recurring payment using proper calculation
          const nextPaymentDate = calculateNextPaymentDate(
            paymentDay, 
            startDate, 
            existingPayment.endDate, 
            existingPayment.lastProcessedDate, 
            existingPayment.isActive
          );
          
          await storage.updateRecurringPayment(existingPayment.id, {
            paymentDay,
            amountCents: terms.monthlyFeeCents,
            startDate,
            nextPaymentDate,
            notes: terms.includedServices || undefined,
          });
        } else {
          // Create new recurring payment using proper calculation
          const nextPaymentDate = calculateNextPaymentDate(paymentDay, startDate, null, null, true);
          
          if (nextPaymentDate) {
            await storage.createRecurringPayment({
              projectId,
              paymentDay,
              amountCents: terms.monthlyFeeCents,
              currency: "USD",
              isActive: true,
              startDate,
              nextPaymentDate,
              notes: terms.includedServices || undefined,
            });
          }
        }
      }
      
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

  // ============ Maintenance Logs Routes ============

  // Get maintenance logs for a project
  app.get("/api/admin/projects/:projectId/maintenance-logs", requireAdmin, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const logType = req.query.logType as string | undefined;
      const logs = await storage.getMaintenanceLogs(projectId, logType);
      res.json(logs);
    } catch (error) {
      next(error);
    }
  });

  // Get maintenance logs for a specific month
  app.get("/api/admin/projects/:projectId/maintenance-logs/:year/:month", requireAdmin, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);
      const logType = req.query.logType as string | undefined;
      const logs = await storage.getMaintenanceLogsByMonth(projectId, year, month, logType);
      res.json(logs);
    } catch (error) {
      next(error);
    }
  });

  // Get maintenance summary for a month (total time/cost)
  app.get("/api/admin/projects/:projectId/maintenance-summary/:year/:month", requireAdmin, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);
      const logType = req.query.logType as string | undefined;
      
      const summary = await storage.getMaintenanceLogSummary(projectId, year, month, logType);
      const hostingTerms = await storage.getProjectHostingTerms(projectId);
      
      res.json({
        ...summary,
        budgetCents: hostingTerms?.maintenanceBudgetCents || null,
        budgetMinutes: hostingTerms?.maintenanceBudgetMinutes || null,
        totalHours: Math.round(summary.totalMinutes / 6) / 10, // Round to 1 decimal
      });
    } catch (error) {
      next(error);
    }
  });

  // Get all-time maintenance summary for a project
  app.get("/api/admin/projects/:projectId/maintenance-alltime-summary", requireAdmin, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const logType = req.query.logType as string | undefined;
      
      const summary = await storage.getMaintenanceLogAllTimeSummary(projectId, logType);
      
      res.json({
        ...summary,
        totalHours: Math.round(summary.totalMinutes / 6) / 10,
      });
    } catch (error) {
      next(error);
    }
  });

  // Get all-time dev cost/time summary for a client (across all their projects)
  app.get("/api/admin/clients/:clientId/dev-summary", requireAdmin, async (req, res, next) => {
    try {
      const clientId = parseInt(req.params.clientId);
      const cycleSince = req.query.cycleSince as string | undefined;
      const summary = await storage.getClientDevSummary(clientId, cycleSince);
      res.json({
        ...summary,
        totalHours:        Math.round(summary.totalMinutes / 6) / 10,
        cycleHours:        Math.round(summary.cycleMinutes / 6) / 10,
        totalBudgetHours:  summary.totalBudgetMinutes > 0 ? Math.round(summary.totalBudgetMinutes / 6) / 10 : 0,
        byProject: summary.byProject.map(p => ({
          ...p,
          totalHours:   Math.round(p.totalMinutes / 6) / 10,
          cycleHours:   Math.round(p.cycleMinutes / 6) / 10,
          budgetHours:  p.budgetMinutes > 0 ? Math.round(p.budgetMinutes / 6) / 10 : 0,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  // Get cycle-based maintenance summary
  app.get("/api/admin/projects/:projectId/maintenance-cycle-summary", requireAdmin, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const logType = req.query.logType as string | undefined;
      
      const hostingTerms = await storage.getProjectHostingTerms(projectId);
      
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      let cycleStartDate: string;
      if (hostingTerms?.currentCycleStartDate) {
        cycleStartDate = hostingTerms.currentCycleStartDate;
      } else {
        cycleStartDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      }
      
      const summary = await storage.getMaintenanceLogSummaryByDateRange(projectId, cycleStartDate, todayStr, logType);
      
      res.json({
        ...summary,
        budgetCents: hostingTerms?.maintenanceBudgetCents || null,
        budgetMinutes: hostingTerms?.maintenanceBudgetMinutes || null,
        totalHours: Math.round(summary.totalMinutes / 6) / 10,
        cycleStartDate,
        cycleEndDate: todayStr,
      });
    } catch (error) {
      next(error);
    }
  });

  // Advance to next billing cycle — also advances all sibling projects for the same client
  app.post("/api/admin/projects/:projectId/advance-cycle", requireAdmin, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      // Get the triggering project to find its client
      const [triggerProject] = await db.select({ id: projects.id, clientId: projects.clientId, name: projects.name })
        .from(projects)
        .where(eq(projects.id, projectId));
      if (!triggerProject) {
        return res.status(404).json({ message: "Project not found" });
      }

      const hostingTerms = await storage.getProjectHostingTerms(projectId);
      const previousCycleStart = hostingTerms?.currentCycleStartDate || null;

      // Find ALL projects for this client
      const clientProjects = await db.select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.clientId, triggerProject.clientId));

      // Upsert cycle start date for every project on this client
      const advancedProjects: string[] = [];
      for (const proj of clientProjects) {
        await storage.upsertProjectHostingTerms(proj.id, { currentCycleStartDate: todayStr });
        advancedProjects.push(proj.name);
      }

      res.json({ 
        message: `Cycle advanced for all ${advancedProjects.length} project(s) under this client`,
        previousCycleStart,
        newCycleStart: todayStr,
        advancedProjects,
      });
    } catch (error) {
      next(error);
    }
  });

  // Create a maintenance log
  app.post("/api/admin/projects/:projectId/maintenance-logs", requireAdmin, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const logData = {
        projectId,
        logDate: req.body.logDate,
        minutesSpent: req.body.minutesSpent,
        description: req.body.description,
        estimatedCostCents: req.body.estimatedCostCents,
        category: req.body.category,
        logType: req.body.logType || "hosting",
        createdByUserId: req.user!.id,
      };
      
      const log = await storage.createMaintenanceLog(logData);
      
      await storage.createActivityEvent({
        entityType: "project",
        entityId: projectId,
        eventType: "maintenance_logged",
        message: `Maintenance logged: ${req.body.minutesSpent} minutes - ${req.body.description}`,
        createdByUserId: req.user!.id,
      });
      
      res.status(201).json(log);
    } catch (error) {
      next(error);
    }
  });

  // Update a maintenance log
  app.patch("/api/admin/maintenance-logs/:id", requireAdmin, async (req, res, next) => {
    try {
      const logId = parseInt(req.params.id);
      const updateSchema = z.object({
        logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "logDate must be YYYY-MM-DD").optional(),
        minutesSpent: z.number().int().nonnegative().optional(),
        description: z.string().min(1).optional(),
        estimatedCostCents: z.number().int().nullable().optional(),
        category: z.string().nullable().optional(),
      });
      const data = updateSchema.parse(req.body);
      const updated = await storage.updateMaintenanceLog(logId, data);
      if (!updated) {
        return res.status(404).json({ error: "Maintenance log not found" });
      }
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  // Delete a maintenance log
  app.delete("/api/admin/maintenance-logs/:id", requireAdmin, async (req, res, next) => {
    try {
      const logId = parseInt(req.params.id);
      await storage.deleteMaintenanceLog(logId);
      res.json({ message: "Maintenance log deleted" });
    } catch (error) {
      next(error);
    }
  });

  // List Claude Code session logs across all projects (admin view).
  // These are the auto-generated entries written by the dev-logs ingest endpoint.
  app.get("/api/admin/dev-logs/claude-sessions", requireAdmin, async (req, res, next) => {
    try {
      const limit = Math.min(parseInt((req.query.limit as string) || "500"), 1000);
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : null;
      const rows = await db
        .select({
          id: maintenanceLogs.id,
          projectId: maintenanceLogs.projectId,
          projectName: projects.name,
          clientId: projects.clientId,
          clientName: clients.name,
          logDate: maintenanceLogs.logDate,
          minutesSpent: maintenanceLogs.minutesSpent,
          estimatedCostCents: maintenanceLogs.estimatedCostCents,
          logType: maintenanceLogs.logType,
          description: maintenanceLogs.description,
          createdAt: maintenanceLogs.createdAt,
        })
        .from(maintenanceLogs)
        .innerJoin(projects, eq(maintenanceLogs.projectId, projects.id))
        .leftJoin(clients, eq(projects.clientId, clients.id))
        .where(
          projectId
            ? and(
                eq(maintenanceLogs.category, "claude-code-session"),
                eq(maintenanceLogs.projectId, projectId)
              )
            : eq(maintenanceLogs.category, "claude-code-session")
        )
        .orderBy(desc(maintenanceLogs.createdAt))
        .limit(limit);
      res.json(rows);
    } catch (error) {
      next(error);
    }
  });

  // Summary across all clients: budget vs cycle usage, broken down per project.
  // Drives the grouped layout on /admin/dev-logs. Iterates through clients
  // (small N), reusing getClientDevSummary for each. Adds an "Internal" bucket
  // (clientId=null) for projects with no client (e.g. JDCoreDev itself).
  app.get("/api/admin/dev-logs/clients-summary", requireAdmin, async (_req, res, next) => {
    try {
      const allClients = await storage.getClients();
      const summaries: Array<{
        clientId: number | null;
        clientName: string;
        totalMinutes: number;
        cycleMinutes: number;
        totalBudgetMinutes: number;
        cycleSince: string | null;
        byProject: Array<{
          projectId: number;
          projectName: string;
          totalMinutes: number;
          cycleMinutes: number;
          budgetMinutes: number;
          cycleStart: string | null;
        }>;
      }> = [];

      for (const c of allClients) {
        const s = await storage.getClientDevSummary(c.id);
        const projectsWithSignal = s.byProject.filter(
          p => p.totalMinutes > 0 || p.budgetMinutes > 0
        );
        if (projectsWithSignal.length === 0) continue;
        summaries.push({
          clientId: c.id,
          clientName: c.name,
          totalMinutes: s.totalMinutes,
          cycleMinutes: s.cycleMinutes,
          totalBudgetMinutes: s.totalBudgetMinutes,
          cycleSince: s.cycleSince,
          byProject: projectsWithSignal.map(p => ({
            projectId: p.projectId,
            projectName: p.projectName,
            totalMinutes: p.totalMinutes,
            cycleMinutes: p.cycleMinutes,
            budgetMinutes: p.budgetMinutes,
            cycleStart: (p as any).cycleStart || null,
          })),
        });
      }

      // Internal bucket — projects with no clientId that nonetheless have logs
      // (e.g. JDCoreDev's own dev work). Aggregate from maintenance_logs +
      // hosting_terms directly so we don't synthesise a fake client row.
      const allProjs = await db.select({
        id: projects.id, name: projects.name, clientId: projects.clientId,
      }).from(projects);
      const noClientIds = allProjs.filter(p => p.clientId == null).map(p => p.id);

      if (noClientIds.length > 0) {
        const internalLogs = await db.select({
          projectId: maintenanceLogs.projectId,
          minutesSpent: maintenanceLogs.minutesSpent,
          logDate: maintenanceLogs.logDate,
        }).from(maintenanceLogs);
        const internalTerms = await db.select({
          projectId: projectHostingTerms.projectId,
          maintenanceBudgetMinutes: projectHostingTerms.maintenanceBudgetMinutes,
          currentCycleStartDate: projectHostingTerms.currentCycleStartDate,
        }).from(projectHostingTerms);
        const termsByProj = new Map(internalTerms.map(t => [t.projectId, t]));

        const projAgg = new Map<number, {
          projectId: number; projectName: string;
          totalMinutes: number; cycleMinutes: number;
          budgetMinutes: number; cycleStart: string | null;
        }>();
        const noClientSet = new Set(noClientIds);
        const projNameById = new Map(allProjs.map(p => [p.id, p.name]));
        for (const pid of noClientIds) {
          const t = termsByProj.get(pid);
          projAgg.set(pid, {
            projectId: pid,
            projectName: projNameById.get(pid) || `Project ${pid}`,
            totalMinutes: 0, cycleMinutes: 0,
            budgetMinutes: t?.maintenanceBudgetMinutes || 0,
            cycleStart: t?.currentCycleStartDate || null,
          });
        }
        for (const log of internalLogs) {
          if (!noClientSet.has(log.projectId)) continue;
          const entry = projAgg.get(log.projectId)!;
          entry.totalMinutes += log.minutesSpent;
          if (entry.cycleStart && log.logDate && log.logDate >= entry.cycleStart) {
            entry.cycleMinutes += log.minutesSpent;
          }
        }

        const intProjects = Array.from(projAgg.values()).filter(
          p => p.totalMinutes > 0 || p.budgetMinutes > 0
        );
        if (intProjects.length > 0) {
          const totalMinutes = intProjects.reduce((s, p) => s + p.totalMinutes, 0);
          const cycleMinutes = intProjects.reduce((s, p) => s + p.cycleMinutes, 0);
          const totalBudgetMinutes = intProjects.reduce((s, p) => s + p.budgetMinutes, 0);
          summaries.push({
            clientId: null,
            clientName: "Internal / no client",
            totalMinutes, cycleMinutes, totalBudgetMinutes,
            cycleSince: null,
            byProject: intProjects,
          });
        }
      }

      res.json(summaries);
    } catch (error) {
      next(error);
    }
  });

  // ============ Maintenance Log Costs Routes ============

  // Get costs for a maintenance log
  app.get("/api/admin/maintenance-logs/:logId/costs", requireAdmin, validateIdParam("logId"), async (req, res, next) => {
    try {
      const logId = parseInt(req.params.logId);
      const costs = await storage.getMaintenanceLogCosts(logId);
      res.json(costs);
    } catch (error) {
      next(error);
    }
  });

  // Add a cost to a maintenance log
  app.post("/api/admin/maintenance-logs/:logId/costs", requireAdmin, validateIdParam("logId"), async (req, res, next) => {
    try {
      const logId = parseInt(req.params.logId);
      const validated = insertMaintenanceLogCostSchema.parse({
        maintenanceLogId: logId,
        costCents: req.body.costCents,
        description: req.body.description || null,
      });
      const cost = await storage.createMaintenanceLogCost(validated);
      res.status(201).json(cost);
    } catch (error) {
      next(error);
    }
  });

  // Delete a cost entry
  app.delete("/api/admin/maintenance-log-costs/:id", requireAdmin, validateIdParam("id"), async (req, res, next) => {
    try {
      const costId = parseInt(req.params.id);
      await storage.deleteMaintenanceLogCost(costId);
      res.json({ message: "Cost deleted" });
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

  // ============ Recurring Payments Routes ============

  // Get all recurring payments with project details
  app.get("/api/admin/recurring-payments", requireAdmin, async (req, res, next) => {
    try {
      const payments = await storage.getRecurringPayments();
      res.json(payments);
    } catch (error) {
      next(error);
    }
  });

  // Get a single recurring payment
  app.get("/api/admin/recurring-payments/:id", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const payment = await storage.getRecurringPayment(id);
      if (!payment) {
        return res.status(404).json({ error: "Recurring payment not found" });
      }
      res.json(payment);
    } catch (error) {
      next(error);
    }
  });

  // Create a new recurring payment
  app.post("/api/admin/recurring-payments", requireAdmin, async (req, res, next) => {
    try {
      const { projectId, paymentDay, amountCents, currency, startDate, endDate, notes } = req.body;

      // Validate project exists and is in hosting status
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      if (project.status !== "hosting") {
        return res.status(400).json({ error: "Project must be in 'hosting' status to create recurring payments" });
      }

      // Check if project already has an active recurring payment
      const existingPayment = await storage.getRecurringPaymentByProject(projectId);
      if (existingPayment) {
        return res.status(400).json({ error: "Project already has an active recurring payment" });
      }

      // Validate payment day
      if (paymentDay < 1 || paymentDay > 31) {
        return res.status(400).json({ error: "Payment day must be between 1 and 31" });
      }

      // Validate amount
      if (!amountCents || amountCents <= 0) {
        return res.status(400).json({ error: "Amount must be greater than 0" });
      }

      // Calculate next payment date
      const nextPaymentDate = calculateNextPaymentDate(paymentDay, startDate, endDate, null, true);
      if (!nextPaymentDate) {
        return res.status(400).json({ error: "Cannot create recurring payment - end date is before the first possible payment date" });
      }

      const payment = await storage.createRecurringPayment({
        projectId,
        paymentDay,
        amountCents,
        currency: currency || "USD",
        startDate,
        endDate: endDate || null,
        nextPaymentDate,
        notes: notes || null,
        isActive: true,
        lastProcessedDate: null,
      });

      // Log activity
      await storage.createActivityEvent({
        entityType: "project",
        entityId: projectId,
        eventType: "recurring_payment_created",
        message: `Recurring payment created: $${(amountCents / 100).toFixed(2)} on day ${paymentDay} of each month`,
        createdByUserId: req.user!.id,
      });

      res.status(201).json(payment);
    } catch (error) {
      next(error);
    }
  });

  // Update a recurring payment
  app.patch("/api/admin/recurring-payments/:id", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const { paymentDay, amountCents, isActive, endDate, notes } = req.body;

      const existing = await storage.getRecurringPayment(id);
      if (!existing) {
        return res.status(404).json({ error: "Recurring payment not found" });
      }

      // Validate payment day if provided
      if (paymentDay !== undefined && (paymentDay < 1 || paymentDay > 31)) {
        return res.status(400).json({ error: "Payment day must be between 1 and 31" });
      }

      // Validate amount if provided
      if (amountCents !== undefined && amountCents <= 0) {
        return res.status(400).json({ error: "Amount must be greater than 0" });
      }

      // Construct explicit update payload with only known fields
      const newPaymentDay = paymentDay ?? existing.paymentDay;
      const newIsActive = isActive ?? existing.isActive;
      const newEndDate = endDate !== undefined ? endDate : existing.endDate;

      // Recalculate next payment date if payment day, isActive, or endDate changes
      const shouldRecalculate = 
        (paymentDay !== undefined && paymentDay !== existing.paymentDay) ||
        (isActive !== undefined && isActive !== existing.isActive) ||
        (endDate !== undefined && endDate !== existing.endDate);

      let nextPaymentDate: string | null = existing.nextPaymentDate;
      if (shouldRecalculate) {
        nextPaymentDate = calculateNextPaymentDate(
          newPaymentDay, 
          existing.startDate, 
          newEndDate, 
          existing.lastProcessedDate, 
          newIsActive
        );
      }

      const updatePayload = {
        paymentDay: newPaymentDay,
        amountCents: amountCents ?? existing.amountCents,
        isActive: newIsActive,
        endDate: newEndDate,
        notes: notes !== undefined ? notes : existing.notes,
        nextPaymentDate,
      };

      const updated = await storage.updateRecurringPayment(id, updatePayload);

      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  // Delete a recurring payment
  app.delete("/api/admin/recurring-payments/:id", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const payment = await storage.getRecurringPayment(id);
      if (!payment) {
        return res.status(404).json({ error: "Recurring payment not found" });
      }

      await storage.deleteRecurringPayment(id);

      // Log activity
      await storage.createActivityEvent({
        entityType: "project",
        entityId: payment.projectId,
        eventType: "recurring_payment_deleted",
        message: "Recurring payment schedule deleted",
        createdByUserId: req.user!.id,
      });

      res.json({ message: "Recurring payment deleted" });
    } catch (error) {
      next(error);
    }
  });

  // Generate invoice from recurring payment - creates a milestone and returns data for invoice generation
  const generateInvoiceSchema = z.object({
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Period start must be in YYYY-MM-DD format"),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Period end must be in YYYY-MM-DD format"),
  });

  app.post("/api/admin/recurring-payments/:id/generate-invoice", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid recurring payment ID" });
      }

      // Validate request body
      const parseResult = generateInvoiceSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0].message });
      }
      const { periodStart, periodEnd } = parseResult.data;

      const payment = await storage.getRecurringPayment(id);
      if (!payment) {
        return res.status(404).json({ error: "Recurring payment not found" });
      }

      // Get project with client info
      const project = await storage.getProject(payment.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const client = await storage.getClient(project.clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      // Create milestone name with period
      const milestoneName = `Hosting: ${periodStart} - ${periodEnd}`;

      // Check for duplicate milestone - look for any hosting milestone that overlaps this period
      const existingMilestones = await storage.getMilestones(payment.projectId);
      const duplicate = existingMilestones.find(m => {
        // Exact name match
        if (m.name === milestoneName) return true;
        
        // Check for overlapping hosting periods by parsing milestone names
        const hostingMatch = m.name.match(/^Hosting:\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})$/);
        if (hostingMatch) {
          const existingStart = hostingMatch[1];
          const existingEnd = hostingMatch[2];
          // Check for any overlap: NOT (newEnd < existingStart OR newStart > existingEnd)
          const hasOverlap = !(periodEnd < existingStart || periodStart > existingEnd);
          return hasOverlap;
        }
        return false;
      });
      
      if (duplicate) {
        return res.status(409).json({ 
          error: "An invoice already exists for this period or an overlapping period",
          existingMilestone: duplicate 
        });
      }

      const milestone = await storage.createMilestone({
        projectId: payment.projectId,
        name: milestoneName,
        amountCents: payment.amountCents,
        dueDate: format(new Date(), "yyyy-MM-dd"),
        status: "invoiced",
      });

      // Log activity
      await storage.createActivityEvent({
        entityType: "project",
        entityId: payment.projectId,
        eventType: "milestone_created",
        message: `Hosting invoice milestone created: ${milestoneName}`,
        createdByUserId: req.user!.id,
      });

      res.json({
        milestone,
        project: { ...project, client },
        payment,
      });
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

  app.get("/api/admin/maintenance-analytics", requireAdmin, async (req, res, next) => {
    try {
      const now = new Date();
      const year = parseInt(req.query.year as string) || now.getFullYear();
      const month = parseInt(req.query.month as string) || (now.getMonth() + 1);
      const summary = await storage.getAllMaintenanceLogsSummary(year, month);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  // ============ Replit Charges ============

  app.get("/api/admin/replit-charges/all", requireAdmin, async (req, res, next) => {
    try {
      const charges = await storage.getAllReplitCharges();
      res.json(charges);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/dev-logs-summary/all", requireAdmin, async (req, res, next) => {
    try {
      const summary = await storage.getAllDevLogsSummary();
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/replit-charges", requireAdmin, async (req, res, next) => {
    try {
      const now = new Date();
      const year = parseInt(req.query.year as string) || now.getFullYear();
      const month = parseInt(req.query.month as string) || (now.getMonth() + 1);
      const charges = await storage.getReplitCharges(year, month);
      res.json(charges);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/replit-charges", requireAdmin, async (req, res, next) => {
    try {
      const parsed = insertReplitChargeSchema.parse(req.body);
      if (parsed.amountCents <= 0) {
        return res.status(400).json({ error: "Amount must be positive" });
      }
      if (parsed.billingMonth < 1 || parsed.billingMonth > 12) {
        return res.status(400).json({ error: "Invalid billing month" });
      }
      const charge = await storage.createReplitCharge(parsed);
      res.json(charge);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/replit-charges/:id", requireAdmin, validateIdParam("id"), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteReplitCharge(id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/replit-charges/summary", requireAdmin, async (req, res, next) => {
    try {
      const now = new Date();
      const year = parseInt(req.query.year as string) || now.getFullYear();
      const month = parseInt(req.query.month as string) || (now.getMonth() + 1);
      const summary = await storage.getReplitChargesSummary(year, month);
      res.json(summary);
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

  // ============ Hosting Invoice Routes ============

  // Get hosting projects with their terms (for invoice generation)
  app.get("/api/admin/projects/hosting/:clientId?", requireAdmin, async (req, res, next) => {
    try {
      const clientId = req.params.clientId ? parseInt(req.params.clientId) : undefined;
      const projectsWithTerms = await storage.getHostingProjectsWithTerms(clientId);
      res.json(projectsWithTerms);
    } catch (error) {
      next(error);
    }
  });

  // Get maintenance log data for invoice generation
  app.post("/api/admin/invoice-maintenance-data", requireAdmin, async (req, res, next) => {
    try {
      const schema = z.object({
        projectIds: z.array(z.number().int().positive()).min(1),
        year: z.number().int().min(2000).max(2100).optional(),
        month: z.number().int().min(1).max(12).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        clientId: z.number().int().positive().optional(),
        useCycleStart: z.boolean().optional(),
      });
      const { projectIds, year, month, startDate, endDate, clientId, useCycleStart } = schema.parse(req.body);

      let resolvedStartDate = startDate;
      let resolvedEndDate = endDate;

      if (!resolvedStartDate || !resolvedEndDate) {
        if (year && month) {
          resolvedStartDate = `${year}-${String(month).padStart(2, '0')}-01`;
          const lastDay = new Date(year, month, 0).getDate();
          resolvedEndDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        } else {
          const now = new Date();
          const y = now.getFullYear();
          const m = now.getMonth() + 1;
          resolvedStartDate = `${y}-${String(m).padStart(2, '0')}-01`;
          const lastDay = new Date(y, m, 0).getDate();
          resolvedEndDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        }
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(resolvedStartDate!) || !/^\d{4}-\d{2}-\d{2}$/.test(resolvedEndDate!)) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
      }
      if (resolvedStartDate! > resolvedEndDate!) {
        return res.status(400).json({ error: "startDate must be before or equal to endDate." });
      }

      let allClientProjectIds = projectIds;
      if (clientId) {
        const clientProjects = await storage.getProjectsByClient(clientId);
        allClientProjectIds = clientProjects
          .filter(p => p.status === "hosting" || p.status === "completed")
          .map(p => p.id);
      }

      const perProject: Record<number, {
        projectName: string;
        logs: Array<{
          id: number;
          logDate: string;
          minutesSpent: number;
          description: string;
          totalCostCents: number;
          category: string | null;
          logType: string;
        }>;
        totalMinutes: number;
        totalCostCents: number;
        budgetCents: number | null;
        budgetMinutes: number | null;
        overageCents: number;
      }> = {};

      let aggTotalMinutes = 0;
      let aggTotalCostCents = 0;
      let aggExternalCostCents = 0;
      let aggBudgetCents = 0;
      let aggBudgetMinutes = 0;
      let hasCostBudget = false;
      let hasTimeBudget = false;
      const OVERAGE_RATE_CENTS_PER_HOUR = 3000; // $30/hr

      console.log(`[Maintenance Data] Fetching for projectIds=${JSON.stringify(allClientProjectIds)}, range=${resolvedStartDate} to ${resolvedEndDate}, clientId=${clientId || 'none'}`);

      for (const projectId of allClientProjectIds) {
        const project = await storage.getProject(projectId);
        if (!project) continue;

        const terms = await storage.getProjectHostingTerms(projectId);
        // When useCycleStart is set, mirror the hosting-invoice creation
        // behavior: pull logs from the project's currentCycleStartDate so the
        // PDF preview matches what will actually be billed. Falls back to the
        // supplied range when the cycle date is missing.
        const projectStartDate = useCycleStart && terms?.currentCycleStartDate
          ? terms.currentCycleStartDate
          : resolvedStartDate!;
        const logs = await storage.getMaintenanceLogsByDateRange(projectId, projectStartDate, resolvedEndDate!);
        console.log(`[Maintenance Data] Project ${projectId} (${project.name}): ${logs.length} logs found (range ${projectStartDate} to ${resolvedEndDate})`);

        const logsWithCosts = [];
        let totalMinutes = 0;
        let totalCostCents = 0;
        let externalCostCents = 0;

        for (const log of logs) {
          const subCosts = await storage.getMaintenanceLogCosts(log.id);
          const subCostTotal = subCosts.reduce((sum, c) => sum + c.costCents, 0);
          const logTotalCost = (log.estimatedCostCents || 0) + subCostTotal;

          totalMinutes += log.minutesSpent;
          totalCostCents += logTotalCost;
          externalCostCents += subCostTotal;

          logsWithCosts.push({
            id: log.id,
            logDate: log.logDate,
            minutesSpent: log.minutesSpent,
            description: log.description,
            totalCostCents: logTotalCost,
            category: log.category,
            logType: log.logType,
          });
        }

        const budgetCents = terms?.maintenanceBudgetCents ?? null;
        const budgetMins = terms?.maintenanceBudgetMinutes ?? null;

        if (budgetCents !== null) {
          hasCostBudget = true;
          aggBudgetCents += budgetCents;
        }
        if (budgetMins !== null) {
          hasTimeBudget = true;
          aggBudgetMinutes += budgetMins;
        }

        aggTotalMinutes += totalMinutes;
        aggTotalCostCents += totalCostCents;
        aggExternalCostCents += externalCostCents;

        // Time-based overage at the agreed hourly rate. External pass-through
        // dev costs are billed to the client separately and do not offset
        // this — the overage represents JD's own time over budget.
        const overtimeMins = budgetMins !== null && totalMinutes > budgetMins
          ? totalMinutes - budgetMins
          : 0;
        const overageCents = Math.round((overtimeMins * OVERAGE_RATE_CENTS_PER_HOUR) / 60);

        perProject[projectId] = {
          projectName: project.name,
          logs: logsWithCosts,
          totalMinutes,
          totalCostCents,
          externalCostCents,
          budgetCents,
          budgetMinutes: budgetMins,
          overageCents,
        };
      }

      const aggOvertimeMinutes = hasTimeBudget && aggTotalMinutes > aggBudgetMinutes
        ? aggTotalMinutes - aggBudgetMinutes
        : 0;
      const timeOverageCents = Math.round(
        (aggOvertimeMinutes * OVERAGE_RATE_CENTS_PER_HOUR) / 60,
      );
      const finalOverageCents = timeOverageCents;
      const costOverageCents = hasCostBudget && aggTotalCostCents > aggBudgetCents
        ? aggTotalCostCents - aggBudgetCents
        : 0;

      res.json({
        projects: perProject,
        aggregated: {
          totalMinutes: aggTotalMinutes,
          totalCostCents: aggTotalCostCents,
          externalCostCents: aggExternalCostCents,
          totalBudgetCents: hasCostBudget ? aggBudgetCents : null,
          totalBudgetMinutes: hasTimeBudget ? aggBudgetMinutes : null,
          costOverageCents,
          overtimeMinutes: aggOvertimeMinutes,
          timeOverageCents,
          finalOverageCents,
          overtimeRatePerHour: OVERAGE_RATE_CENTS_PER_HOUR / 100,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // Create hosting invoice
  app.post("/api/admin/invoices/hosting", requireAdmin, async (req, res, next) => {
    try {
      // Validate request body with Zod
      const hostingInvoiceRequestSchema = z.object({
        clientId: z.number().int().positive("Client ID is required"),
        projectIds: z.array(z.number().int().positive()).min(1, "At least one project is required"),
        invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invoice date must be YYYY-MM-DD format"),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD format"),
        billingPeriod: z.string().min(1, "Billing period is required"),
        notes: z.string().optional(),
        billingYear: z.number().int().min(2000).max(2100).optional(),
        billingMonth: z.number().int().min(1).max(12).optional(),
      });

      const validatedData = hostingInvoiceRequestSchema.parse(req.body);
      const { clientId, projectIds, invoiceDate, dueDate, billingPeriod, notes, billingYear, billingMonth } = validatedData;

      // Validate that all projects belong to the client and are hosting projects
      const projectsWithTerms = await storage.getHostingProjectsWithTerms(clientId);
      const validProjectIds = projectsWithTerms.map(p => p.id);
      const invalidProjects = projectIds.filter((id: number) => !validProjectIds.includes(id));
      
      if (invalidProjects.length > 0) {
        return res.status(400).json({ error: "Some projects are invalid or don't belong to this client" });
      }

      // Get client
      const client = await storage.getClient(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      // Calculate total from selected projects' hosting terms (server-side calculation)
      const selectedProjects = projectsWithTerms.filter(p => projectIds.includes(p.id));
      let hostingFeesTotal = selectedProjects.reduce((sum, p) => 
        sum + (p.hostingTerms?.monthlyFeeCents || 0), 0
      );

      if (hostingFeesTotal === 0) {
        return res.status(400).json({ error: "Selected projects have no hosting fees configured" });
      }

      // Combined-budget maintenance overage. Each client's projects share a
      // collective time allowance — under-utilised projects subsidise
      // over-utilised ones. We sum every selected project's logged minutes and
      // budgets across the cycle window, then compute ONE overage on the
      // combined difference. (Earlier per-project sum was a bug — it billed
      // overage on Project A even when Project B had unused budget.)
      const HOSTING_OVERAGE_RATE_CENTS_PER_HOUR = 3000; // $30/hr
      const cycleEnd = invoiceDate || new Date().toISOString().split("T")[0];
      let combinedActualMinutes = 0;
      let combinedBudgetMinutes = 0;
      let earliestCycleStart: string | null = null;
      const perProjectMinutes: Record<number, number> = {};
      for (const project of selectedProjects) {
        const terms = await storage.getProjectHostingTerms(project.id);
        const budgetMinutes = terms?.maintenanceBudgetMinutes ?? null;
        const cycleStart =
          terms?.currentCycleStartDate ||
          (billingYear && billingMonth
            ? `${billingYear}-${String(billingMonth).padStart(2, "0")}-01`
            : cycleEnd);
        if (!earliestCycleStart || cycleStart < earliestCycleStart) {
          earliestCycleStart = cycleStart;
        }
        const logs = await storage.getMaintenanceLogsByDateRange(project.id, cycleStart, cycleEnd);
        const minutes = logs.reduce((sum, log) => sum + log.minutesSpent, 0);
        perProjectMinutes[project.id] = minutes;
        combinedActualMinutes += minutes;
        if (budgetMinutes !== null) combinedBudgetMinutes += budgetMinutes;
      }
      const combinedOvertimeMinutes = Math.max(0, combinedActualMinutes - combinedBudgetMinutes);
      const totalOverageCents = Math.round(
        (combinedOvertimeMinutes * HOSTING_OVERAGE_RATE_CENTS_PER_HOUR) / 60,
      );

      const totalAmountCents = hostingFeesTotal + totalOverageCents;

      // Generate invoice number
      const invoiceNumber = await storage.getNextHostingInvoiceNumber(clientId);

      // All invoice amounts are stored in USD; client.invoiceCurrency is
      // the *secondary display* currency for the conversion line on the
      // generated PDF (e.g. "≈ £X.XX" for GBP), not a re-denomination.
      // cycleStartDate freezes the original window so future recalculates
      // see the same logs even if currentCycleStartDate has been reset.
      const invoice = await storage.createHostingInvoice({
        invoiceNumber,
        clientId,
        invoiceDate,
        dueDate,
        totalAmountCents,
        currency: "USD",
        status: "pending",
        billingPeriod,
        notes,
        cycleStartDate: earliestCycleStart || cycleEnd,
        cycleEndDate: cycleEnd,
        createdByUserId: req.user!.id,
      } as any);

      // One hosting line item per project; ONE combined overage line item
      // attached to the first project (overage is now client-level, not
      // per-project — a sub-row is just where it lives in the table).
      for (const project of selectedProjects) {
        await storage.createHostingInvoiceLineItem({
          invoiceId: invoice.id,
          projectId: project.id,
          projectName: project.name,
          amountCents: project.hostingTerms?.monthlyFeeCents || 0,
          description: "Monthly Hosting & Support",
        });
      }
      if (totalOverageCents > 0) {
        const overageHours = (combinedOvertimeMinutes / 60).toFixed(2);
        const budgetHours  = (combinedBudgetMinutes / 60).toFixed(1);
        const cycleStartLabel = earliestCycleStart || cycleEnd;
        await storage.createHostingInvoiceLineItem({
          invoiceId: invoice.id,
          projectId: selectedProjects[0].id,
          projectName: "All projects (combined)",
          amountCents: totalOverageCents,
          description: `Maintenance Overage — ${overageHours}h over combined ${budgetHours}h budget @ $30/hr (cycle since ${cycleStartLabel})`,
        });
      }

      // Create activity event
      await storage.createActivityEvent({
        entityType: "client",
        entityId: clientId,
        eventType: "hosting_invoice_created",
        message: `Hosting invoice ${invoiceNumber} created for ${selectedProjects.length} project(s) - $${(totalAmountCents / 100).toLocaleString()}${totalOverageCents > 0 ? ` (includes $${(totalOverageCents / 100).toLocaleString()} maintenance overage)` : ''}`,
        createdByUserId: req.user!.id,
      });

      res.status(201).json({ 
        invoiceNumber, 
        invoiceId: invoice.id,
        totalAmount: totalAmountCents,
        overageAmount: totalOverageCents,
      });
    } catch (error) {
      next(error);
    }
  });

  // Create development invoice (milestone-based)
  app.post("/api/admin/invoices/development", requireAdmin, async (req, res, next) => {
    try {
      // Validate request body with Zod
      const developmentInvoiceRequestSchema = z.object({
        clientId: z.number().int().positive("Client ID is required"),
        projectId: z.number().int().positive("Project ID is required"),
        milestoneId: z.number().int().positive("Milestone ID is required"),
        invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invoice date must be YYYY-MM-DD format"),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD format"),
        notes: z.string().optional(),
      });

      const validatedData = developmentInvoiceRequestSchema.parse(req.body);
      const { clientId, projectId, milestoneId, invoiceDate, dueDate, notes } = validatedData;

      // Validate client exists
      const client = await storage.getClient(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      // Validate project exists and belongs to client
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      if (project.clientId !== clientId) {
        return res.status(400).json({ error: "Project does not belong to this client" });
      }

      // Validate milestone exists and belongs to project
      const milestone = await storage.getMilestone(milestoneId);
      if (!milestone) {
        return res.status(404).json({ error: "Milestone not found" });
      }
      if (milestone.projectId !== projectId) {
        return res.status(400).json({ error: "Milestone does not belong to this project" });
      }

      // Prevent re-invoicing already invoiced or paid milestones
      if (milestone.status === "invoiced" || milestone.status === "paid") {
        return res.status(400).json({ 
          error: `Milestone has already been ${milestone.status}. Cannot create another invoice.`,
          invoiceRef: milestone.invoiceRef 
        });
      }

      // Generate invoice number: PROJECT_CODE-SEQUENTIAL-M{milestoneNum}
      // Use first 4 letters of project name (uppercase) as code
      const projectCode = project.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase() || 'PROJ';
      
      // Get sequential number for this project's invoices (based on max existing invoice number)
      const existingMilestones = await storage.getMilestonesByProject(projectId);
      const existingInvoiceNumbers = existingMilestones
        .filter(m => m.invoiceRef)
        .map(m => {
          const match = m.invoiceRef?.match(/-(\d{3})-M/);
          return match ? parseInt(match[1], 10) : 0;
        });
      const maxInvoiceSeq = existingInvoiceNumbers.length > 0 ? Math.max(...existingInvoiceNumbers) : 0;
      const invoicedCount = maxInvoiceSeq + 1;
      const milestoneIndex = existingMilestones.findIndex(m => m.id === milestoneId) + 1;
      
      const invoiceNumber = `${projectCode}-${String(invoicedCount).padStart(3, '0')}-M${milestoneIndex}`;

      // Update milestone status to invoiced and set invoice ref
      await storage.updateMilestone(milestoneId, {
        status: "invoiced",
        invoiceRef: invoiceNumber,
        dueDate: dueDate,
      });

      // Create activity event
      await storage.createActivityEvent({
        entityType: "project",
        entityId: projectId,
        eventType: "development_invoice_created",
        message: `Development invoice ${invoiceNumber} created for milestone "${milestone.name}" - $${(milestone.amountCents / 100).toLocaleString()}`,
        createdByUserId: req.user!.id,
      });

      res.status(201).json({ 
        invoiceNumber,
        milestoneId,
        totalAmount: milestone.amountCents
      });
    } catch (error) {
      next(error);
    }
  });

  // Get all hosting invoices with details
  app.get("/api/admin/hosting-invoices", requireAdmin, async (req, res, next) => {
    try {
      const invoices = await storage.getAllHostingInvoicesWithDetails();
      res.json(invoices);
    } catch (error) {
      next(error);
    }
  });

  // Update hosting invoice status (marking as paid cancels remaining reminders)
  app.patch("/api/admin/hosting-invoices/:id", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid invoice ID" });
      }

      const { status } = req.body;
      if (!status || !["pending", "paid", "overdue", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const updated = await storage.updateHostingInvoice(id, { status });
      if (!updated) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  // Recalculate an existing hosting invoice in place using the current
  // combined-budget logic + present cycle window. Used to repair invoices
  // that were generated before the per-project → combined-budget fix.
  // Replaces line items and updates totalAmountCents; preserves invoice
  // metadata (invoiceNumber, dueDate, status, reminderCount).
  app.post("/api/admin/hosting-invoices/:id/recalculate", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid invoice ID" });

      const existing = await storage.getHostingInvoice(id);
      if (!existing) return res.status(404).json({ message: "Invoice not found" });

      // Pull existing line items to recover the project list this invoice
      // was issued against. Use distinct projectIds across all rows.
      const existingLineItems = await db.select().from(hostingInvoiceLineItems)
        .where(eq(hostingInvoiceLineItems.invoiceId, id));
      const projectIds = Array.from(new Set(existingLineItems.map(li => li.projectId)));
      if (projectIds.length === 0) {
        return res.status(400).json({ message: "Invoice has no line items — nothing to recalculate from" });
      }

      const projectsWithTerms = await storage.getHostingProjectsWithTerms(existing.clientId);
      const selectedProjects = projectsWithTerms.filter(p => projectIds.includes(p.id));
      if (selectedProjects.length === 0) {
        return res.status(400).json({ message: "No matching hosting projects found for this invoice's client" });
      }

      const hostingFeesTotal = selectedProjects.reduce((sum, p) =>
        sum + (p.hostingTerms?.monthlyFeeCents || 0), 0
      );

      const HOSTING_OVERAGE_RATE_CENTS_PER_HOUR = 3000;
      // Cycle window: requires the frozen cycleStartDate/cycleEndDate stored
      // on the invoice. If those aren't set (legacy invoices), the recalc
      // returns 400 with a clear message — user must set the window via
      // PATCH /:id/cycle before recalculating. No silent date-guessing.
      const cycleStart = (existing as any).cycleStartDate;
      const cycleEnd = (existing as any).cycleEndDate || existing.invoiceDate;
      if (!cycleStart) {
        return res.status(400).json({
          message:
            "This invoice has no cycle window stored. Set cycleStartDate + cycleEndDate first " +
            "(via PATCH /api/admin/hosting-invoices/:id/cycle or the invoice detail dialog) " +
            "so the maintenance overage is computed against the correct log range.",
        });
      }
      let combinedActualMinutes = 0;
      let combinedBudgetMinutes = 0;
      const earliestCycleStart: string = cycleStart;
      // Track logs per project so we can write them as informational
      // line items below the hosting fees.
      const logsByProject: Record<number, any[]> = {};
      for (const project of selectedProjects) {
        const terms = await storage.getProjectHostingTerms(project.id);
        const budgetMinutes = terms?.maintenanceBudgetMinutes ?? null;
        const logs = await storage.getMaintenanceLogsByDateRange(project.id, cycleStart, cycleEnd);
        logsByProject[project.id] = logs;
        const minutes = logs.reduce((sum, l) => sum + l.minutesSpent, 0);
        combinedActualMinutes += minutes;
        if (budgetMinutes !== null) combinedBudgetMinutes += budgetMinutes;
      }
      const combinedOvertimeMinutes = Math.max(0, combinedActualMinutes - combinedBudgetMinutes);
      const totalOverageCents = Math.round(
        (combinedOvertimeMinutes * HOSTING_OVERAGE_RATE_CENTS_PER_HOUR) / 60,
      );
      const newTotalCents = hostingFeesTotal + totalOverageCents;

      // Wipe + recreate line items + update total. No transaction wrapper —
      // the surrounding admin handler is single-writer.
      await db.delete(hostingInvoiceLineItems).where(eq(hostingInvoiceLineItems.invoiceId, id));
      for (const project of selectedProjects) {
        await storage.createHostingInvoiceLineItem({
          invoiceId: id,
          projectId: project.id,
          projectName: project.name,
          amountCents: project.hostingTerms?.monthlyFeeCents || 0,
          description: "Monthly Hosting & Support",
        });
        // Informational maintenance-log entries (amountCents=0). Don't
        // affect the total; the combined overage line below handles
        // billing. These give the invoice page a transparent breakdown
        // of what was logged in the cycle window.
        const projectLogs = logsByProject[project.id] || [];
        for (const log of projectLogs) {
          const minutes = log.minutesSpent || 0;
          const hrs = Math.floor(minutes / 60);
          const mins = minutes % 60;
          const dur = hrs > 0 ? `${hrs}h${mins > 0 ? ` ${mins}m` : ""}` : `${mins}m`;
          const desc = (log.description || "").toString().replace(/\s+/g, " ").trim().slice(0, 200);
          await storage.createHostingInvoiceLineItem({
            invoiceId: id,
            projectId: project.id,
            projectName: project.name,
            amountCents: 0,
            description: `${log.logDate} · ${dur} · ${desc || "(no description)"}`,
          });
        }
      }
      if (totalOverageCents > 0) {
        const overageHours = (combinedOvertimeMinutes / 60).toFixed(2);
        const budgetHours  = (combinedBudgetMinutes / 60).toFixed(1);
        const actualHours  = (combinedActualMinutes / 60).toFixed(2);
        await storage.createHostingInvoiceLineItem({
          invoiceId: id,
          projectId: selectedProjects[0].id,
          projectName: "All projects (combined)",
          amountCents: totalOverageCents,
          description: `Maintenance Overage — ${actualHours}h logged vs ${budgetHours}h budget = ${overageHours}h over @ $30/hr (cycle ${cycleStart} → ${cycleEnd})`,
        });
      }

      const updated = await storage.updateHostingInvoice(id, { totalAmountCents: newTotalCents });

      res.json({
        invoiceId: id,
        invoiceNumber: existing.invoiceNumber,
        previousTotalCents: existing.totalAmountCents,
        newTotalCents,
        delta: newTotalCents - existing.totalAmountCents,
        breakdown: {
          hostingFeesTotal,
          combinedActualMinutes,
          combinedBudgetMinutes,
          combinedOvertimeMinutes,
          totalOverageCents,
        },
        invoice: updated,
      });
    } catch (error) {
      next(error);
    }
  });

  // Idempotent column add — ensures the new cycle window columns exist
  // even when drizzle-kit push hasn't been run on the deploy target.
  // Runs once at first request via the requireAdmin path.
  let _cycleColumnsReady = false;
  async function ensureCycleColumns() {
    if (_cycleColumnsReady) return;
    await pool.query(`ALTER TABLE hosting_invoices ADD COLUMN IF NOT EXISTS cycle_start_date DATE`);
    await pool.query(`ALTER TABLE hosting_invoices ADD COLUMN IF NOT EXISTS cycle_end_date   DATE`);
    _cycleColumnsReady = true;
  }
  ensureCycleColumns().catch(e => console.error("[hosting-invoices] cycle columns:", e.message));

  // Set the cycle window on an existing hosting invoice. Required for
  // legacy invoices that were issued before cycleStartDate/cycleEndDate
  // existed on the schema. Once set, recalculate() can re-derive overage
  // from the correct log range.
  app.patch("/api/admin/hosting-invoices/:id/cycle", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid invoice ID" });
      const { cycleStartDate, cycleEndDate } = req.body || {};
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRe.test(String(cycleStartDate || ""))) {
        return res.status(400).json({ message: "cycleStartDate must be YYYY-MM-DD" });
      }
      if (cycleEndDate && !dateRe.test(String(cycleEndDate))) {
        return res.status(400).json({ message: "cycleEndDate must be YYYY-MM-DD" });
      }
      if (cycleEndDate && String(cycleEndDate) < String(cycleStartDate)) {
        return res.status(400).json({ message: "cycleEndDate must be on or after cycleStartDate" });
      }
      const updated = await storage.updateHostingInvoice(id, {
        cycleStartDate,
        cycleEndDate: cycleEndDate || null,
      } as any);
      if (!updated) return res.status(404).json({ message: "Invoice not found" });
      res.json({ id, cycleStartDate, cycleEndDate: cycleEndDate || null });
    } catch (error) {
      next(error);
    }
  });

  // Recalculate ALL hosting invoices (sweep). Skips paid + cancelled —
  // re-running on a paid invoice would invalidate the receipt. Returns a
  // per-invoice diff array so the UI can summarise.
  app.post("/api/admin/hosting-invoices/recalculate-all", requireAdmin, async (req, res, next) => {
    try {
      const allInvoices = await storage.getAllHostingInvoicesWithDetails();
      const eligible = allInvoices.filter(inv => inv.status !== "paid" && inv.status !== "cancelled");
      const results: any[] = [];
      let okCount = 0, errCount = 0;
      for (const inv of eligible) {
        try {
          const fakeReq: any = { params: { id: String(inv.id) } };
          // Inline the recalc logic instead of recursing into the route
          // handler (no internal HTTP call).
          const projectIds = Array.from(new Set(inv.lineItems.map((li: any) => li.projectId)));
          if (projectIds.length === 0) continue;
          const projectsWithTerms = await storage.getHostingProjectsWithTerms(inv.clientId);
          const selectedProjects = projectsWithTerms.filter(p => projectIds.includes(p.id));
          if (selectedProjects.length === 0) continue;
          const hostingFeesTotal = selectedProjects.reduce((s, p) => s + (p.hostingTerms?.monthlyFeeCents || 0), 0);
          // Skip if cycle window not set — the bulk handler doesn't guess.
          // Caller fixes per-invoice via PATCH /:id/cycle, then re-runs bulk.
          const cycleStart = (inv as any).cycleStartDate;
          const cycleEnd = (inv as any).cycleEndDate || inv.invoiceDate;
          if (!cycleStart) {
            results.push({
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              skipped: true,
              reason: "no cycle window — set cycleStartDate via the invoice detail dialog",
            });
            continue;
          }
          let combinedActualMinutes = 0;
          let combinedBudgetMinutes = 0;
          const logsByProjectBulk: Record<number, any[]> = {};
          for (const project of selectedProjects) {
            const terms = await storage.getProjectHostingTerms(project.id);
            const budgetMinutes = terms?.maintenanceBudgetMinutes ?? null;
            const logs = await storage.getMaintenanceLogsByDateRange(project.id, cycleStart, cycleEnd);
            logsByProjectBulk[project.id] = logs;
            combinedActualMinutes += logs.reduce((s, l) => s + l.minutesSpent, 0);
            if (budgetMinutes !== null) combinedBudgetMinutes += budgetMinutes;
          }
          const combinedOvertimeMinutes = Math.max(0, combinedActualMinutes - combinedBudgetMinutes);
          const totalOverageCents = Math.round((combinedOvertimeMinutes * 3000) / 60);
          const newTotalCents = hostingFeesTotal + totalOverageCents;

          await db.delete(hostingInvoiceLineItems).where(eq(hostingInvoiceLineItems.invoiceId, inv.id));
          for (const project of selectedProjects) {
            await storage.createHostingInvoiceLineItem({
              invoiceId: inv.id,
              projectId: project.id,
              projectName: project.name,
              amountCents: project.hostingTerms?.monthlyFeeCents || 0,
              description: "Monthly Hosting & Support",
            });
            const projectLogs = logsByProjectBulk[project.id] || [];
            for (const log of projectLogs) {
              const minutes = log.minutesSpent || 0;
              const hrs = Math.floor(minutes / 60);
              const mins = minutes % 60;
              const dur = hrs > 0 ? `${hrs}h${mins > 0 ? ` ${mins}m` : ""}` : `${mins}m`;
              const desc = (log.description || "").toString().replace(/\s+/g, " ").trim().slice(0, 200);
              await storage.createHostingInvoiceLineItem({
                invoiceId: inv.id,
                projectId: project.id,
                projectName: project.name,
                amountCents: 0,
                description: `${log.logDate} · ${dur} · ${desc || "(no description)"}`,
              });
            }
          }
          if (totalOverageCents > 0) {
            const overageHours = (combinedOvertimeMinutes / 60).toFixed(2);
            const budgetHours = (combinedBudgetMinutes / 60).toFixed(1);
            const actualHours = (combinedActualMinutes / 60).toFixed(2);
            await storage.createHostingInvoiceLineItem({
              invoiceId: inv.id,
              projectId: selectedProjects[0].id,
              projectName: "All projects (combined)",
              amountCents: totalOverageCents,
              description: `Maintenance Overage — ${actualHours}h logged vs ${budgetHours}h budget = ${overageHours}h over @ $30/hr (cycle ${cycleStart} → ${cycleEnd})`,
            });
          }
          await storage.updateHostingInvoice(inv.id, { totalAmountCents: newTotalCents });
          okCount++;
          results.push({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            previousTotalCents: inv.totalAmountCents,
            newTotalCents,
            delta: newTotalCents - inv.totalAmountCents,
          });
        } catch (e: any) {
          errCount++;
          results.push({ id: inv.id, invoiceNumber: inv.invoiceNumber, error: e.message });
        }
      }
      res.json({
        eligible: eligible.length,
        ok: okCount,
        errors: errCount,
        results,
      });
    } catch (error) {
      next(error);
    }
  });

  // Delete hosting invoice
  app.delete("/api/admin/hosting-invoices/:id", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid invoice ID" });
      }

      const invoice = await storage.getHostingInvoice(id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      await storage.deleteHostingInvoice(id);
      res.json({ success: true, message: "Invoice deleted successfully" });
    } catch (error) {
      next(error);
    }
  });

  // Get invoiced milestones for reminder tracking
  app.get("/api/admin/invoiced-milestones", requireAdmin, async (req, res, next) => {
    try {
      const milestones = await storage.getInvoicedMilestonesWithDetails();
      res.json(milestones);
    } catch (error) {
      next(error);
    }
  });

  // Get all milestones with client details for invoices page
  app.get("/api/admin/milestones-with-clients", requireAdmin, async (req, res, next) => {
    try {
      const milestones = await storage.getAllMilestonesWithClients();
      res.json(milestones);
    } catch (error) {
      next(error);
    }
  });

  // Update milestone (for status changes affecting reminders)
  app.patch("/api/admin/milestones/:id/reminder-status", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid milestone ID" });
      }

      const { status } = req.body;
      if (!status || !["planned", "invoiced", "paid", "overdue"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const updated = await storage.updateMilestone(id, { status });
      if (!updated) {
        return res.status(404).json({ message: "Milestone not found" });
      }

      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  // Get email preview for an invoice or milestone
  app.get("/api/admin/email-preview/:type/:id", requireAdmin, async (req, res, next) => {
    try {
      const { type, id: idStr } = req.params;
      const id = parseInt(idStr);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      if (type === "hosting-invoice") {
        const invoice = await storage.getHostingInvoice(id);
        if (!invoice) {
          return res.status(404).json({ message: "Invoice not found" });
        }
        const [client] = await db.select().from(clients).where(eq(clients.id, invoice.clientId));
        
        const recipientEmail = client?.accountsDeptEmail || client?.email || "";
        const recipientName = client?.accountsDeptName || client?.name || "Client";
        const formattedAmount = `$${(invoice.totalAmountCents / 100).toFixed(2)}`;
        const dueDateObj = new Date(invoice.dueDate);
        const dueDate = dueDateObj.toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric'
        });
        const now = new Date();
        const isOverdue = now > dueDateObj;
        const daysOverdue = isOverdue ? Math.floor((now.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24)) : 0;
        
        res.json({
          subject: isOverdue 
            ? `Payment Overdue: Invoice ${invoice.invoiceNumber} - Action Required`
            : `Payment Reminder: Invoice ${invoice.invoiceNumber}`,
          clientName: recipientName,
          recipientEmail,
          invoiceNumber: invoice.invoiceNumber,
          amount: formattedAmount,
          dueDate,
          isOverdue,
          daysOverdue,
          reminderCount: invoice.reminderCount
        });
      } else if (type === "milestone") {
        const milestone = await storage.getMilestone(id);
        if (!milestone) {
          return res.status(404).json({ message: "Milestone not found" });
        }
        const [project] = await db.select().from(projects).where(eq(projects.id, milestone.projectId));
        const [client] = project ? await db.select().from(clients).where(eq(clients.id, project.clientId)) : [null];
        
        const recipientEmail = client?.accountsDeptEmail || client?.email || "";
        const recipientName = client?.accountsDeptName || client?.name || "Client";
        const formattedAmount = `$${(milestone.amountCents / 100).toFixed(2)}`;
        const dueDateObj = milestone.dueDate ? new Date(milestone.dueDate) : null;
        const dueDate = dueDateObj
          ? dueDateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
          : "Not specified";
        const now = new Date();
        const isOverdue = dueDateObj ? now > dueDateObj : false;
        const daysOverdue = isOverdue && dueDateObj ? Math.floor((now.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24)) : 0;
        
        res.json({
          subject: isOverdue 
            ? `Payment Overdue: ${milestone.name} - Action Required`
            : `Payment Reminder: ${milestone.name}`,
          clientName: recipientName,
          recipientEmail,
          projectName: project?.name || "Project",
          milestoneName: milestone.name,
          amount: formattedAmount,
          dueDate,
          isOverdue,
          daysOverdue,
          reminderCount: milestone.reminderCount
        });
      } else {
        return res.status(400).json({ message: "Invalid type" });
      }
    } catch (error) {
      next(error);
    }
  });

  // Cancel individual reminder for hosting invoice
  const cancelReminderSchema = z.object({
    reminderNum: z.number().int().min(1).max(5)
  });
  
  app.post("/api/admin/hosting-invoices/:id/cancel-reminder", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid invoice ID" });
      }
      
      const validation = cancelReminderSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid reminder number", errors: validation.error.errors });
      }
      const { reminderNum } = validation.data;
      
      const invoice = await storage.getHostingInvoice(id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const currentCancelled = invoice.cancelledReminders || [];
      if (!currentCancelled.includes(reminderNum)) {
        currentCancelled.push(reminderNum);
        await storage.updateHostingInvoice(id, { cancelledReminders: currentCancelled });
      }
      
      res.json({ success: true, cancelledReminders: currentCancelled });
    } catch (error) {
      next(error);
    }
  });

  // Cancel individual reminder for milestone
  app.post("/api/admin/milestones/:id/cancel-reminder", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid milestone ID" });
      }
      
      const validation = cancelReminderSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid reminder number", errors: validation.error.errors });
      }
      const { reminderNum } = validation.data;
      
      const milestone = await storage.getMilestone(id);
      if (!milestone) {
        return res.status(404).json({ message: "Milestone not found" });
      }
      
      const currentCancelled = milestone.cancelledReminders || [];
      if (!currentCancelled.includes(reminderNum)) {
        currentCancelled.push(reminderNum);
        await storage.updateMilestone(id, { cancelledReminders: currentCancelled });
      }
      
      res.json({ success: true, cancelledReminders: currentCancelled });
    } catch (error) {
      next(error);
    }
  });

  // Uncancel individual reminder for hosting invoice
  app.post("/api/admin/hosting-invoices/:id/uncancel-reminder", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid invoice ID" });
      }
      
      const validation = cancelReminderSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid reminder number", errors: validation.error.errors });
      }
      const { reminderNum } = validation.data;
      
      const invoice = await storage.getHostingInvoice(id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const currentCancelled = invoice.cancelledReminders || [];
      const updatedCancelled = currentCancelled.filter(n => n !== reminderNum);
      await storage.updateHostingInvoice(id, { cancelledReminders: updatedCancelled });
      
      res.json({ success: true, cancelledReminders: updatedCancelled });
    } catch (error) {
      next(error);
    }
  });

  // Uncancel individual reminder for milestone
  app.post("/api/admin/milestones/:id/uncancel-reminder", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid milestone ID" });
      }
      
      const validation = cancelReminderSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid reminder number", errors: validation.error.errors });
      }
      const { reminderNum } = validation.data;
      
      const milestone = await storage.getMilestone(id);
      if (!milestone) {
        return res.status(404).json({ message: "Milestone not found" });
      }
      
      const currentCancelled = milestone.cancelledReminders || [];
      const updatedCancelled = currentCancelled.filter(n => n !== reminderNum);
      await storage.updateMilestone(id, { cancelledReminders: updatedCancelled });
      
      res.json({ success: true, cancelledReminders: updatedCancelled });
    } catch (error) {
      next(error);
    }
  });

  // Send test email for hosting invoice
  app.post("/api/admin/hosting-invoices/:id/test-email", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const adminEmail = process.env.ADMIN_EMAIL || (req.user as User).email;
      
      if (!adminEmail) {
        return res.status(400).json({ message: "No admin email configured" });
      }
      
      const invoice = await storage.getHostingInvoice(id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const [client] = await db.select().from(clients).where(eq(clients.id, invoice.clientId));
      const isOverdue = new Date() > new Date(invoice.dueDate);
      
      const { sendInvoiceReminderEmail } = await import("./email");
      const result = await sendInvoiceReminderEmail(
        adminEmail,
        client?.name || "Test Client",
        invoice.invoiceNumber,
        invoice.totalAmountCents,
        invoice.dueDate,
        isOverdue,
        invoice.reminderCount + 1
      );
      
      if (result.success) {
        res.json({ success: true, message: `Test email sent to ${adminEmail}` });
      } else {
        res.status(500).json({ success: false, message: "Failed to send test email", error: result.error });
      }
    } catch (error) {
      next(error);
    }
  });

  // Send actual reminder to client for hosting invoice (Send Now)
  app.post("/api/admin/hosting-invoices/:id/send-now", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid invoice ID" });
      }
      
      const invoice = await storage.getHostingInvoice(id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const [client] = await db.select().from(clients).where(eq(clients.id, invoice.clientId));
      const recipientEmail = client?.accountsDeptEmail || client?.email;
      const recipientName = client?.accountsDeptName || client?.name;
      if (!recipientEmail) {
        return res.status(400).json({ message: "Client has no email address" });
      }
      
      const isOverdue = new Date() > new Date(invoice.dueDate);
      const nextReminderNum = (invoice.reminderCount || 0) + 1;
      
      const { sendInvoiceReminderEmail } = await import("./email");
      const result = await sendInvoiceReminderEmail(
        recipientEmail,
        recipientName || "Client",
        invoice.invoiceNumber,
        invoice.totalAmountCents,
        invoice.dueDate,
        isOverdue,
        nextReminderNum
      );
      
      if (result.success) {
        await storage.updateHostingInvoice(invoice.id, {
          reminderCount: nextReminderNum,
          lastReminderSent: new Date(),
        });
        res.json({ success: true, message: `Reminder sent to ${recipientEmail}` });
      } else {
        res.status(500).json({ success: false, message: "Failed to send reminder", error: result.error });
      }
    } catch (error) {
      next(error);
    }
  });

  // Send actual reminder to client for milestone (Send Now)
  app.post("/api/admin/milestones/:id/send-now", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid milestone ID" });
      }
      
      const milestone = await storage.getMilestone(id);
      if (!milestone) {
        return res.status(404).json({ message: "Milestone not found" });
      }
      
      const [project] = await db.select().from(projects).where(eq(projects.id, milestone.projectId));
      const [client] = project ? await db.select().from(clients).where(eq(clients.id, project.clientId)) : [null];
      
      const recipientEmail = client?.accountsDeptEmail || client?.email;
      const recipientName = client?.accountsDeptName || client?.name;
      if (!recipientEmail) {
        return res.status(400).json({ message: "Client has no email address" });
      }
      
      const isOverdue = milestone.dueDate ? new Date() > new Date(milestone.dueDate) : false;
      const nextReminderNum = (milestone.reminderCount || 0) + 1;
      
      const { sendMilestoneReminderEmail } = await import("./email");
      const result = await sendMilestoneReminderEmail(
        recipientEmail,
        recipientName || "Client",
        milestone.name,
        project?.name || "Project",
        milestone.amountCents,
        milestone.dueDate || new Date().toISOString().split('T')[0],
        isOverdue,
        nextReminderNum
      );
      
      if (result.success) {
        await storage.updateMilestone(milestone.id, {
          reminderCount: nextReminderNum,
          lastReminderSent: new Date(),
        });
        res.json({ success: true, message: `Reminder sent to ${recipientEmail}` });
      } else {
        res.status(500).json({ success: false, message: "Failed to send reminder", error: result.error });
      }
    } catch (error) {
      next(error);
    }
  });

  // Send test email for milestone
  app.post("/api/admin/milestones/:id/test-email", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const adminEmail = process.env.ADMIN_EMAIL || (req.user as User).email;
      
      if (!adminEmail) {
        return res.status(400).json({ message: "No admin email configured" });
      }
      
      const milestone = await storage.getMilestone(id);
      if (!milestone) {
        return res.status(404).json({ message: "Milestone not found" });
      }
      
      const [project] = await db.select().from(projects).where(eq(projects.id, milestone.projectId));
      const [client] = project ? await db.select().from(clients).where(eq(clients.id, project.clientId)) : [null];
      const isOverdue = milestone.dueDate ? new Date() > new Date(milestone.dueDate) : false;
      
      const { sendMilestoneReminderEmail } = await import("./email");
      const result = await sendMilestoneReminderEmail(
        adminEmail,
        client?.name || "Test Client",
        milestone.name,
        project?.name || "Test Project",
        milestone.amountCents,
        milestone.dueDate || new Date().toISOString().split('T')[0],
        isOverdue,
        milestone.reminderCount + 1
      );
      
      if (result.success) {
        res.json({ success: true, message: `Test email sent to ${adminEmail}` });
      } else {
        res.status(500).json({ success: false, message: "Failed to send test email", error: result.error });
      }
    } catch (error) {
      next(error);
    }
  });

  // Payment Settings endpoints
  app.get("/api/admin/payment-settings", requireAdmin, async (req, res, next) => {
    try {
      let settings = await storage.getPaymentSettings();
      if (!settings) {
        settings = await storage.upsertPaymentSettings({ defaultCurrency: "USD" });
      }
      res.json(settings);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/payment-settings", requireAdmin, async (req, res, next) => {
    try {
      const updated = await storage.upsertPaymentSettings(req.body);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  // Manually trigger an FX refresh from Frankfurter (free, ECB-backed).
  // The result is also written automatically once a day on a server-side
  // schedule; this endpoint is the "Refresh now" button.
  app.post("/api/admin/payment-settings/refresh-fx", requireAdmin, async (_req, res, next) => {
    try {
      const { refreshFxRatesNow } = await import("./services/fx-refresh");
      const result = await refreshFxRatesNow();
      res.status(result.ok ? 200 : 502).json(result);
    } catch (error) {
      next(error);
    }
  });

  // ============================================
  // Crypto Tracker API Endpoints
  // ============================================

  // Search coins (CoinGecko + Solana/Jupiter)
  app.get("/api/admin/crypto/search", requireAdmin, async (req, res, next) => {
    try {
      const query = req.query.q as string;
      const source = req.query.source as string || "all";
      if (!query || query.length < 2) {
        return res.json([]);
      }
      
      if (source === "solana") {
        const solanaResults = await searchJupiterTokens(query);
        const formatted = solanaResults.map(t => ({
          id: t.address,
          symbol: t.symbol,
          name: t.name,
          thumb: t.logoURI || "",
          large: t.logoURI || "",
          blockchain: "solana",
        }));
        return res.json(formatted);
      }
      
      const results = await searchCoins(query);
      const formatted = results.map(r => ({
        ...r,
        blockchain: "coingecko",
      }));
      res.json(formatted);
    } catch (error) {
      next(error);
    }
  });

  // Get all tracked coins
  app.get("/api/admin/crypto/coins", requireAdmin, async (req, res, next) => {
    try {
      const coins = await db.select().from(trackedCoins).orderBy(desc(trackedCoins.addedAt));
      res.json(coins);
    } catch (error) {
      next(error);
    }
  });

  // Get tracked coins with live prices
  app.get("/api/admin/crypto/coins/prices", requireAdmin, async (req, res, next) => {
    try {
      const coins = await db.select().from(trackedCoins).where(eq(trackedCoins.isActive, true));
      if (coins.length === 0) {
        return res.json([]);
      }
      
      const coingeckoCoins = coins.filter(c => c.blockchain === "coingecko" || !c.blockchain);
      const solanaCoins = coins.filter(c => c.blockchain === "solana");
      
      const coingeckoIds = coingeckoCoins.map(c => c.coinId);
      const solanaAddresses = solanaCoins.map(c => c.coinId);
      
      const [coingeckoPrices, solanaPrices] = await Promise.all([
        coingeckoIds.length > 0 ? getCoinPrices(coingeckoIds) : Promise.resolve([]),
        solanaAddresses.length > 0 ? getJupiterTokenPrices(solanaAddresses) : Promise.resolve(new Map()),
      ]);
      
      const HKD_USD_RATE = 7.8;
      
      const result = coins.map(coin => {
        if (coin.blockchain === "solana") {
          const priceUsd = solanaPrices.get(coin.coinId);
          return {
            ...coin,
            currentPrice: priceUsd !== undefined ? {
              priceUsd,
              priceHkd: priceUsd * HKD_USD_RATE,
              marketCap: 0,
              volume24h: 0,
              percentChange1h: 0,
              percentChange24h: 0,
              percentChange7d: 0,
            } : null,
          };
        } else {
          const priceData = coingeckoPrices.find(p => p.coinId === coin.coinId);
          return {
            ...coin,
            currentPrice: priceData || null,
          };
        }
      });
      
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Add coin to track
  app.post("/api/admin/crypto/coins", requireAdmin, async (req, res, next) => {
    try {
      const { coinId, blockchain, symbol, name, iconUrl } = req.body;
      
      if (!coinId) {
        return res.status(400).json({ message: "Coin ID is required" });
      }
      
      const existing = await db.select().from(trackedCoins).where(eq(trackedCoins.coinId, coinId)).limit(1);
      if (existing.length > 0) {
        return res.status(400).json({ message: "Coin is already being tracked" });
      }
      
      let coinData: { symbol: string; name: string; iconUrl: string | null };
      
      if (blockchain === "solana") {
        const tokenInfo = await getJupiterTokenInfo(coinId);
        if (tokenInfo) {
          coinData = {
            symbol: tokenInfo.symbol,
            name: tokenInfo.name,
            iconUrl: tokenInfo.logoURI || null,
          };
        } else if (symbol && name) {
          coinData = { symbol, name, iconUrl: iconUrl || null };
        } else {
          return res.status(400).json({ message: "Solana token not found. Please provide symbol and name." });
        }
      } else {
        const details = await getCoinDetails(coinId);
        coinData = {
          symbol: details.symbol,
          name: details.name,
          iconUrl: details.iconUrl,
        };
      }
      
      const [coin] = await db.insert(trackedCoins).values({
        coinId,
        symbol: coinData.symbol,
        name: coinData.name,
        iconUrl: coinData.iconUrl,
        blockchain: blockchain || "coingecko",
        isActive: true,
      }).returning();
      
      res.json(coin);
    } catch (error) {
      next(error);
    }
  });

  // Update tracked coin
  app.patch("/api/admin/crypto/coins/:coinId", requireAdmin, async (req, res, next) => {
    try {
      const { coinId } = req.params;
      const { isActive, checkIntervalMinutes } = req.body;
      
      const [updated] = await db.update(trackedCoins)
        .set({ 
          isActive, 
          checkIntervalMinutes,
          updatedAt: new Date(),
        })
        .where(eq(trackedCoins.coinId, coinId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ message: "Coin not found" });
      }
      
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  // Delete tracked coin
  app.delete("/api/admin/crypto/coins/:coinId", requireAdmin, async (req, res, next) => {
    try {
      const { coinId } = req.params;
      
      await db.delete(trackedCoins).where(eq(trackedCoins.coinId, coinId));
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Get price history for a coin
  app.get("/api/admin/crypto/coins/:coinId/history", requireAdmin, async (req, res, next) => {
    try {
      const { coinId } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      
      const history = await db.select()
        .from(priceHistory)
        .where(eq(priceHistory.coinId, coinId))
        .orderBy(desc(priceHistory.recordedAt))
        .limit(limit);
      
      res.json(history);
    } catch (error) {
      next(error);
    }
  });

  // Get market chart from CoinGecko
  app.get("/api/admin/crypto/coins/:coinId/chart", requireAdmin, async (req, res, next) => {
    try {
      const { coinId } = req.params;
      const days = parseInt(req.query.days as string) || 7;
      
      const chartData = await getCoinMarketChart(coinId, days);
      res.json(chartData);
    } catch (error) {
      next(error);
    }
  });

  // Get news for a coin
  app.get("/api/admin/crypto/coins/:coinId/news", requireAdmin, async (req, res, next) => {
    try {
      const { coinId } = req.params;
      
      const coin = await db.select().from(trackedCoins).where(eq(trackedCoins.coinId, coinId)).limit(1);
      if (coin.length === 0) {
        return res.status(404).json({ message: "Coin not found" });
      }
      
      const news = await fetchCoinNews(coin[0].symbol, coin[0].name);
      res.json(news);
    } catch (error) {
      next(error);
    }
  });

  // Get all price alerts
  app.get("/api/admin/crypto/alerts", requireAdmin, async (req, res, next) => {
    try {
      const alerts = await db.select().from(priceAlerts).orderBy(desc(priceAlerts.createdAt));
      res.json(alerts);
    } catch (error) {
      next(error);
    }
  });

  // Create price alert
  app.post("/api/admin/crypto/alerts", requireAdmin, async (req, res, next) => {
    try {
      const data = insertPriceAlertSchema.parse(req.body);
      
      const [alert] = await db.insert(priceAlerts).values({
        ...data,
        status: 'active',
      }).returning();
      
      res.json(alert);
    } catch (error) {
      next(error);
    }
  });

  // Update price alert
  app.patch("/api/admin/crypto/alerts/:id", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      const [updated] = await db.update(priceAlerts)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(priceAlerts.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ message: "Alert not found" });
      }
      
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  // Delete price alert
  app.delete("/api/admin/crypto/alerts/:id", requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      
      await db.delete(priceAlerts).where(eq(priceAlerts.id, id));
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Get notification settings
  app.get("/api/admin/crypto/settings", requireAdmin, async (req, res, next) => {
    try {
      let settings = await db.select().from(cryptoNotificationSettings).limit(1);
      
      if (settings.length === 0) {
        const [newSettings] = await db.insert(cryptoNotificationSettings).values({
          enableSms: true,
          enableWhatsapp: true,
        }).returning();
        return res.json(newSettings);
      }
      
      res.json(settings[0]);
    } catch (error) {
      next(error);
    }
  });

  // Update notification settings
  app.patch("/api/admin/crypto/settings", requireAdmin, async (req, res, next) => {
    try {
      const data = insertCryptoNotificationSettingsSchema.partial().parse(req.body);
      
      let settings = await db.select().from(cryptoNotificationSettings).limit(1);
      
      if (settings.length === 0) {
        const [newSettings] = await db.insert(cryptoNotificationSettings).values({
          ...data,
        }).returning();
        return res.json(newSettings);
      }
      
      const [updated] = await db.update(cryptoNotificationSettings)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(cryptoNotificationSettings.id, settings[0].id))
        .returning();
      
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  // Manually trigger price check
  app.post("/api/admin/crypto/check-prices", requireAdmin, async (req, res, next) => {
    try {
      await manualPriceCheck();
      res.json({ success: true, message: "Price check completed" });
    } catch (error) {
      next(error);
    }
  });

  // Start price monitoring on server startup
  startPriceMonitoring();

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
