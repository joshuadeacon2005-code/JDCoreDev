/**
 * JD CoreDev Lead Engine — Express Route + Cron Scheduler
 *
 * Mount in server.js:
 *   import { leadEngineRouter } from './pipeline/route.js';
 *   app.use('/api/lead-engine', leadEngineRouter);
 *
 * Also serve the dashboard page:
 *   app.get('/lead-engine', (req, res) =>
 *     res.sendFile(path.join(__dirname, 'pipeline/lead-engine-dashboard.html')));
 *
 * Automatic schedule (HKT):
 *   01:00 — Expiry check (audit pages > 30 days taken offline, marked no_reply)
 *   08:00 — Daily digest email to joshuad@jdcoredev.com
 *   23:00 — Lead engine auto-run (if not already run today)
 */

import { Router } from "express";
import cron from "node-cron";
import { runLeadEngine } from "./index.js";
import { sendDailyDigest } from "./digest.js";
import { runExpiryCheck, markReplied, getExpiredAudits } from "./expiry.js";
import { auditCompany } from "./audit.js";
import { generateAuditPage } from "./generate-page.js";
import { writeOutreachDraft, rewriteWithTone } from "./outreach.js";
import { sendEmail } from "./send-email.js";
import { saveDraft } from "./draft-queue.js";
import {
  alreadyContacted,
  markContacted,
  getAllContacted,
  deleteContacted,
} from "./db.js";
import { getDrafts, markDraftSent, deleteDraft } from "./draft-queue.js";
import { log } from "./logger.js";
import {
  initDbBridge,
  dbGetAllAudits,
  dbGetAllDrafts,
  dbMarkDraftSent,
  dbDeleteAudit,
  dbDeleteDraft,
  dbUpdateAuditStatus,
  dbUpdateDraft,
  dbUpsertAudit,
  dbGetSettings,
  dbSaveSettings,
} from "./db-bridge.js";
import fs from "fs";
import path from "path";

export const leadEngineRouter = Router();
export { initDbBridge };

// ── Per-audit regeneration progress tracker ───────────────────────────────────
// domain → { auditId, name, domain, stage, percent, error, startedAt }
const regenProgress = new Map();

function setRegenProgress(domain, update) {
  const existing = regenProgress.get(domain) || { domain };
  regenProgress.set(domain, { ...existing, ...update });
}

// Runs a single lead through the full regen pipeline, updating progress as it goes.
// This includes: audit → page generation → outreach draft update → DB save.
// Status is always reset to 'draft' on completion (recovers taken_down / no_reply leads).
async function runRegenPipeline(record) {
  const domain = record.domain;
  setRegenProgress(domain, {
    auditId: record.id,
    name: record.name,
    domain,
    stage: "researching",
    percent: 15,
    startedAt: Date.now(),
  });
  try {
    const lead = {
      name: record.name,
      domain,
      website: domain.startsWith("ig_") ? null : `https://${domain}`,
      instagram: record.instagram || null,
      email: record.email || null,
      location: record.location || "Hong Kong",
      industry: record.industry || "Unknown — to be determined by research",
    };

    // Stage 1: AI audit
    const audit = await auditCompany(lead);
    setRegenProgress(domain, { stage: "generating", percent: 62 });

    // Stage 2: Generate (or overwrite) the audit page on disk + DB
    const auditUrl = await generateAuditPage(lead, audit);
    setRegenProgress(domain, { stage: "outreach", percent: 82 });

    // Stage 3: Regenerate outreach draft — update existing unsent draft or create a new one
    try {
      const outreach = await writeOutreachDraft(lead, audit, auditUrl);
      const allDrafts = await dbGetAllDrafts();
      const existingDraft = allDrafts.find(
        (d) => d.domain === domain && !d.sent,
      );
      if (existingDraft) {
        await dbUpdateDraft(existingDraft.id, {
          domain,
          subject: outreach.subject,
          body: outreach.body,
          auditUrl,
        });
        log(
          `[Regenerate] Updated draft #${existingDraft.id} for ${record.name}`,
        );
      } else {
        await saveDraft(lead, outreach, auditUrl);
        log(`[Regenerate] Created new draft for ${record.name}`);
      }
    } catch (outreachErr) {
      // Non-fatal — audit page is already live; log and continue
      log(
        `[Regenerate] Outreach step failed for ${record.name}: ${outreachErr.message} — continuing`,
      );
    }

    setRegenProgress(domain, { stage: "saving", percent: 95 });

    // Stage 4: Reset status to 'draft' so the lead is visible/active again
    await dbUpsertAudit({
      name: record.name,
      domain,
      auditUrl,
      channel: record.channel || "draft",
      status: "draft",
    });

    setRegenProgress(domain, { stage: "done", percent: 100 });
    log(`[Regenerate] Done — ${record.name} → ${auditUrl}`);

    setTimeout(() => regenProgress.delete(domain), 6000);
  } catch (err) {
    setRegenProgress(domain, {
      stage: "failed",
      percent: 0,
      error: err.message,
    });
    log(`[Regenerate] Failed for ${record.name}: ${err.message}`);
    setTimeout(() => regenProgress.delete(domain), 12000);
  }
}

// ── Taken-down page ───────────────────────────────────────────────────────────
function buildTakenDownPage(companyName) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Audit Removed | JD CoreDev</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400&family=DM+Sans:wght@300;400&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { min-height: 100vh; background: #0a0a0a; color: #f5f3ef; font-family: 'DM Sans', sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 24px; text-align: center; }
  .top-bar { position: fixed; top: 0; left: 0; right: 0; background: #f6f8f7; padding: 14px 48px;
    display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e8eae9; }
  .top-bar a { text-decoration: none; }
  .top-bar-brand { font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 800; color: #111; letter-spacing: -0.02em; }
  .icon { width: 80px; height: 80px; border-radius: 20px; background: rgba(150,150,150,0.1);
    border: 1px solid rgba(150,150,150,0.2); display: flex; align-items: center; justify-content: center;
    font-size: 36px; margin: 0 auto 32px; }
  h1 { font-family: 'Syne', sans-serif; font-size: clamp(28px, 5vw, 48px); font-weight: 800; letter-spacing: -0.03em; margin-bottom: 16px; }
  .sub { font-size: 16px; color: #888; max-width: 420px; line-height: 1.7; margin-bottom: 48px; }
  .cta { display: inline-flex; align-items: center; gap: 8px; background: #2d7a6b; color: #fff;
    font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 700;
    padding: 14px 28px; border-radius: 8px; text-decoration: none; transition: opacity 0.2s; }
  .cta:hover { opacity: 0.85; }
</style>
</head>
<body>
  <div class="top-bar"><a href="https://jdcoredev.com"><span class="top-bar-brand">JD CoreDev</span></a></div>
  <div class="icon">🔒</div>
  <h1>This page is no longer available</h1>
  <p class="sub">The audit prepared for <strong>${companyName}</strong> has been taken offline.</p>
  <a href="https://jdcoredev.com/contact" class="cta">Get in touch →</a>
</body>
</html>`;
}

const AUDITS_DIR = path.join(process.cwd(), "pipeline", "data", "audits");

// ── Helper: take down the audit file on disk ──────────────────────────────────
function takeAuditOfflineOnDisk(auditUrl, name) {
  if (!auditUrl) return;
  const slug = auditUrl.split("/audits/")[1]?.replace(/\/$/, "");
  if (!slug) return;
  try {
    const auditDir = path.join(AUDITS_DIR, slug);
    const indexFile = path.join(auditDir, "index.html");
    if (fs.existsSync(indexFile)) {
      const archivePath = path.join(auditDir, "audit-archived.html");
      if (!fs.existsSync(archivePath)) fs.copyFileSync(indexFile, archivePath);
      fs.writeFileSync(indexFile, buildTakenDownPage(name || slug), "utf-8");
    }
  } catch (err) {
    log(`[Offline] Failed to take down disk file for ${slug}: ${err.message}`);
  }
}

// ── Helper: fully delete the audit directory on disk ─────────────────────────
function deleteAuditFromDisk(auditUrl) {
  if (!auditUrl) return;
  const slug = auditUrl.split("/audits/")[1]?.replace(/\/$/, "");
  if (!slug) return;
  try {
    const auditDir = path.join(AUDITS_DIR, slug);
    if (fs.existsSync(auditDir))
      fs.rmSync(auditDir, { recursive: true, force: true });
  } catch (err) {
    log(`[Delete] Failed to remove disk files for ${slug}: ${err.message}`);
  }
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireSecret(req, res, next) {
  const secret = req.headers["x-engine-secret"];
  if (!secret || secret !== process.env.ENGINE_SECRET) {
    return res.status(401).json({ error: "Unauthorised" });
  }
  next();
}

// ── Cron: 01:00 HKT — Expiry check ───────────────────────────────────────────
cron.schedule(
  "0 1 * * *",
  async () => {
    log("[Cron] 01:00 HKT — Running expiry check...");
    try {
      const { expiredCount } = await runExpiryCheck();
      log(`[Cron] Expiry check done — ${expiredCount} page(s) expired`);
    } catch (err) {
      log(`[Cron] Expiry check failed: ${err.message}`);
    }
  },
  { timezone: "Asia/Hong_Kong" },
);

// ── Cron: 08:00 HKT — Daily digest ───────────────────────────────────────────
cron.schedule(
  "0 8 * * *",
  async () => {
    log("[Cron] 08:00 HKT — Sending daily digest...");
    try {
      await sendDailyDigest();
      log("[Cron] Digest sent ✓");
    } catch (err) {
      log(`[Cron] Digest failed: ${err.message}`);
    }
  },
  { timezone: "Asia/Hong_Kong" },
);

// ── Lead engine scheduled auto-run — DISABLED ─────────────────────────────────
// Auto-run at 23:00 HKT has been turned off. Run manually from the Lead Engine dashboard.
let ranToday = false;
let lastRunDate = "";
let engineRunning = false;
let engineStartedAt = 0;

// ── POST /api/lead-engine/run ─────────────────────────────────────────────────
leadEngineRouter.post("/run", requireSecret, async (req, res) => {
  const jobId = Date.now();
  res.json({ started: true, jobId });
  ranToday = true;
  lastRunDate = new Date().toDateString();
  engineRunning = true;
  engineStartedAt = Date.now();
  globalThis._stopLeadEngine = false;
  runLeadEngine()
    .catch((err) =>
      log(`[LeadEngine] Fatal error job ${jobId}: ${err.message}`),
    )
    .finally(() => {
      engineRunning = false;
    });
});

// ── POST /api/lead-engine/stop ────────────────────────────────────────────────
leadEngineRouter.post("/stop", requireSecret, async (req, res) => {
  globalThis._stopLeadEngine = true;
  engineRunning = false;
  log("[LeadEngine] Stop requested by user");
  res.json({ stopped: true });
});

// ── GET /api/lead-engine/progress ─────────────────────────────────────────────
leadEngineRouter.get("/progress", requireSecret, (req, res) => {
  const logFile = path.resolve(process.cwd(), "pipeline/data/run.log");
  if (!engineRunning && !fs.existsSync(logFile)) {
    return res.json({ running: false, percent: 0, stage: "", lines: [] });
  }

  const lines = fs.existsSync(logFile)
    ? fs.readFileSync(logFile, "utf-8").split("\n").filter(Boolean)
    : [];

  const last100 = lines.slice(-100);

  // Determine which run's lines (since last "Lead Engine started")
  let runStart = 0;
  for (let i = last100.length - 1; i >= 0; i--) {
    if (last100[i].includes("Lead Engine started")) {
      runStart = i;
      break;
    }
  }
  const runLines = last100.slice(runStart);

  const totalMatch = runLines.find(
    (l) => l.includes("Found") && l.includes("leads"),
  );
  const totalLeads = totalMatch
    ? parseInt(totalMatch.match(/Found (\d+)/)?.[1] || "5")
    : 5;
  const processedCount = runLines.filter((l) =>
    l.includes("── Processing:"),
  ).length;
  const done = runLines.some((l) => l.includes("Lead Engine complete"));

  let stageLabel = "Discovering leads…";
  let percent = 5;

  if (done) {
    stageLabel = "Complete";
    percent = 100;
  } else if (processedCount > 0) {
    const lastStageLine = [...runLines]
      .reverse()
      .find((l) => /Stage \d+:/.test(l));
    const stageNum = lastStageLine
      ? parseInt(lastStageLine.match(/Stage (\d+)/)?.[1] || "1")
      : 1;
    const stageNames = [
      "Research",
      "Audit",
      "Generate Page",
      "Outreach",
      "Save",
    ];
    stageLabel = `Lead ${processedCount}/${totalLeads} · Stage ${stageNum}: ${stageNames[stageNum - 1] || ""}`;
    const leadProgress = (processedCount - 1) / totalLeads;
    const stageProgress = stageNum / 5 / totalLeads;
    percent = Math.min(
      95,
      Math.round((leadProgress + stageProgress) * 90) + 10,
    );
  } else if (totalMatch) {
    stageLabel = `Found ${totalLeads} leads, starting audits…`;
    percent = 10;
  }

  res.json({
    running: engineRunning,
    percent,
    stage: stageLabel,
    lines: runLines.slice(-20),
    done,
  });
});

// ── GET /api/lead-engine/settings ─────────────────────────────────────────────
leadEngineRouter.get("/settings", requireSecret, async (req, res) => {
  const saved = await dbGetSettings();
  res.json({ ...defaultSettings(), ...(saved || {}) });
});

// ── POST /api/lead-engine/settings ────────────────────────────────────────────
leadEngineRouter.post("/settings", requireSecret, async (req, res) => {
  const merged = { ...defaultSettings(), ...req.body };
  // Strip locations — always Hong Kong
  delete merged.locations;
  await dbSaveSettings({
    industries: merged.industries || defaultSettings().industries,
    signals: merged.signals || defaultSettings().signals,
    exclusions: merged.exclusions || defaultSettings().exclusions,
    count: merged.count || defaultSettings().count,
    fromEmail: merged.fromEmail || defaultSettings().fromEmail,
    replyTo: merged.replyTo || defaultSettings().replyTo,
  });
  res.json({ success: true, settings: merged });
});

function defaultSettings() {
  return {
    locations: ["Hong Kong"],
    industries: ["Automotive", "Retail", "Fashion", "Lifestyle", "Hospitality"],
    count: 5,
    fromEmail: "joshuad@jdcoredev.com",
    replyTo: "joshuad@jdcoredev.com",
    signals: [
      "Active Instagram but no booking system or CRM",
      "Website on generic Shopify/Wix template",
      "Physical business with no digital loyalty tools",
    ],
    exclusions: ["Enterprise companies", "Businesses with no web presence"],
  };
}

// ── POST /api/lead-engine/manual-audit ───────────────────────────────────────
// Accepts a URL and/or Instagram handle — runs a single-company audit.
// At least one of `url` or `instagram` must be provided.
leadEngineRouter.post("/manual-audit", requireSecret, async (req, res) => {
  const { url, instagram, sendEmailOpt = true, saveDraftOpt = true } = req.body;

  if (!url && !instagram)
    return res.status(400).json({ error: "url or instagram required" });

  // Normalise Instagram handle
  const igHandle = instagram ? "@" + instagram.trim().replace(/^@/, "") : null;

  // Parse domain from URL (optional — may be Instagram-only)
  let domain, cleanUrl;
  if (url && url.trim()) {
    try {
      const parsed = new URL(
        url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`,
      );
      domain = parsed.hostname.replace(/^www\./, "");
      cleanUrl = parsed.href;
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }
  } else {
    // No website: use a pseudo-domain derived from the Instagram handle for dedup
    domain = `ig_${igHandle.replace("@", "").toLowerCase()}`;
    cleanUrl = null;
  }

  // Quick dedup check
  if (await alreadyContacted(domain)) {
    return res
      .status(409)
      .json({ error: `Already audited: ${instagram || domain}` });
  }

  // Return immediately — run async
  res.json({ started: true, domain });

  try {
    log(
      `[Manual] Starting audit for ${domain}${igHandle ? ` (${igHandle})` : ""}`,
    );

    const rawName = cleanUrl
      ? domain
          .replace(/\.(com|hk|sg|my|co|net|org).*$/, "")
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : igHandle
          .replace("@", "")
          .replace(/[._-]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());

    const lead = {
      name: rawName,
      domain,
      website: cleanUrl,
      instagram: igHandle,
      email: null,
      location: "Hong Kong",
      industry: "Unknown — to be determined by research",
    };

    const audit = await auditCompany(lead);
    const auditUrl = await generateAuditPage(lead, audit);
    const outreach = await writeOutreachDraft(lead, audit, auditUrl);

    let emailed = false;
    if (lead.email && sendEmailOpt) {
      await sendEmail(lead.email, outreach.subject, outreach.body);
      emailed = true;
    } else if (saveDraftOpt) {
      await saveDraft(lead, outreach, auditUrl);
    }

    await markContacted(
      domain,
      lead.name,
      auditUrl,
      emailed ? "email" : "manual",
    );
    log(`[Manual] Done — ${auditUrl}`);
  } catch (err) {
    log(`[Manual] Failed for ${domain}: ${err.message}`);
  }
});

// ── POST /api/lead-engine/re-audit-draft ─────────────────────────────────────
// Re-runs the full audit pipeline for an existing draft.
// `url` is optional — if omitted the draft's existing domain is used.
// Always replaces (upserts) the existing audit record — no duplicates.
leadEngineRouter.post("/re-audit-draft", requireSecret, async (req, res) => {
  const { draftId, url } = req.body;
  if (!draftId) return res.status(400).json({ error: "draftId required" });

  // Find the draft first so we can fall back to its existing domain
  const allDrafts = await dbGetAllDrafts();
  const draft = allDrafts.find((d) => d.id === Number(draftId));
  if (!draft) return res.status(404).json({ error: "Draft not found" });

  let domain, cleanUrl;

  if (url && url.trim()) {
    // Caller supplied a new URL — parse it
    try {
      const parsed = new URL(
        url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`,
      );
      domain = parsed.hostname.replace(/^www\./, "");
      cleanUrl = parsed.href;
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }
  } else if (draft.domain && !draft.domain.startsWith("ig_")) {
    // No new URL provided — re-use the existing domain
    domain = draft.domain;
    cleanUrl = `https://${draft.domain}`;
  } else {
    return res
      .status(400)
      .json({
        error:
          "No website domain available for this draft. Please enter a URL.",
      });
  }

  // Return immediately — run async (progress tracked via regenProgress map)
  res.json({ started: true, draftId, domain });

  setRegenProgress(domain, {
    name: draft.company,
    domain,
    stage: "researching",
    percent: 15,
    startedAt: Date.now(),
  });

  try {
    log(
      `[ReAudit] Starting re-audit for draft #${draftId} (${draft.company}) → ${domain}`,
    );

    const lead = {
      name: draft.company,
      domain,
      website: cleanUrl,
      instagram: draft.instagram || null,
      email: draft.email || null,
      location: "Hong Kong",
      industry: "Unknown — to be determined by research",
    };

    // Stage 1: AI audit
    const audit = await auditCompany(lead);
    setRegenProgress(domain, { stage: "generating", percent: 62 });

    // Stage 2: Generate audit page
    const auditUrl = await generateAuditPage(lead, audit);
    setRegenProgress(domain, { stage: "outreach", percent: 82 });

    // Stage 3: Write outreach and update the draft in-place
    const outreach = await writeOutreachDraft(lead, audit, auditUrl);
    await dbUpdateDraft(Number(draftId), {
      domain,
      subject: outreach.subject,
      body: outreach.body,
      auditUrl,
    });

    setRegenProgress(domain, { stage: "saving", percent: 95 });

    // Stage 4: Upsert the audit record by domain — replaces any existing entry, no duplicate
    await dbUpsertAudit({
      name: draft.company,
      domain,
      auditUrl,
      channel: "draft",
      status: "draft",
      contactedAt: new Date(),
    });

    setRegenProgress(domain, { stage: "done", percent: 100 });
    log(`[ReAudit] Done — draft #${draftId} updated, auditUrl: ${auditUrl}`);
    setTimeout(() => regenProgress.delete(domain), 6000);
  } catch (err) {
    setRegenProgress(domain, {
      stage: "failed",
      percent: 0,
      error: err.message,
    });
    log(`[ReAudit] Failed for draft #${draftId}: ${err.message}`);
    setTimeout(() => regenProgress.delete(domain), 12000);
  }
});

// ── POST /api/lead-engine/rewrite-message ────────────────────────────────────
// Rewrites a draft's subject + body in a different tone using the existing text.
leadEngineRouter.post("/rewrite-message", requireSecret, async (req, res) => {
  const { id, tone = "casual" } = req.body;
  if (!id) return res.status(400).json({ error: "id required" });

  const validTones = ["casual", "formal", "direct", "friendly", "urgent"];
  if (!validTones.includes(tone))
    return res.status(400).json({ error: "Invalid tone" });

  try {
    const allDrafts = await dbGetAllDrafts();
    const draft = allDrafts.find((d) => d.id === id);
    if (!draft) return res.status(404).json({ error: "Draft not found" });

    log(
      `[RewriteMsg] Rewriting draft #${id} for ${draft.company} in tone: ${tone}`,
    );
    const result = await rewriteWithTone(draft, tone);

    await dbUpdateDraft(id, { subject: result.subject, body: result.body });

    log(`[RewriteMsg] Done — draft #${id} rewritten`);
    res.json({
      subject: result.subject,
      body: result.body,
      shortMessage: result.shortMessage,
    });
  } catch (err) {
    log(`[RewriteMsg] Failed for draft #${id}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/lead-engine/regen-progress ──────────────────────────────────────
// Returns the current regeneration progress for all in-flight audits.
leadEngineRouter.get("/regen-progress", requireSecret, (req, res) => {
  res.json([...regenProgress.values()]);
});

// ── POST /api/lead-engine/regenerate-audit ────────────────────────────────────
// Re-runs the full audit + page generation for a specific lead_audit record.
leadEngineRouter.post("/regenerate-audit", requireSecret, async (req, res) => {
  const { auditId } = req.body;
  if (!auditId) return res.status(400).json({ error: "auditId required" });

  const allAudits = await dbGetAllAudits();
  const record = allAudits.find((a) => a.id === Number(auditId));
  if (!record) return res.status(404).json({ error: "Audit not found" });

  res.json({
    started: true,
    auditId,
    name: record.name,
    domain: record.domain,
  });
  runRegenPipeline(record);
});

// ── GET /api/lead-engine/status ────────────────────── =�────────────────────────
leadEngineRouter.get("/status", requireSecret, async (req, res) => {
  const logFile = path.resolve(process.cwd(), "pipeline/data/run.log");
  const lastLog = fs.existsSync(logFile)
    ? fs.readFileSync(logFile, "utf-8").split("\n").slice(-50).join("\n")
    : "No log yet";

  // Prefer DB data — fall back to JSON files if DB is empty (first run / migration)
  let contacted = await dbGetAllAudits();
  if (!contacted.length) contacted = getAllContacted();

  let drafts = await dbGetAllDrafts();
  if (!drafts.length) {
    // normalise JSON drafts to DB shape
    drafts = getDrafts().map((d) => ({
      id: d.id,
      company: d.company,
      domain: d.domain || null,
      email: d.email || null,
      instagram: d.instagram || null,
      whatsapp: d.whatsapp || null,
      auditUrl: d.auditUrl || null,
      subject: d.subject,
      body: d.body,
      sent: !!d.sent,
      sentAt: d.sentAt || null,
      date: d.date || new Date().toISOString(),
    }));
  } else {
    // normalise DB records: add `date` alias for createdAt so frontend stays consistent
    drafts = drafts.map((d) => ({ ...d, date: d.createdAt }));
  }

  // Expose whether each audit has persisted HTML (so frontend can show "Regen needed")
  const contactedWithMeta = contacted.map((a) => ({
    ...a,
    hasHtml: !!a.htmlContent,
  }));

  res.json({
    ranToday,
    contacted: contactedWithMeta,
    drafts,
    expired: getExpiredAudits(),
    lastLog,
  });
});

// ── POST /api/lead-engine/regenerate-all-missing ──────────────────────────────
// Queues re-audit for every lead_audit record that has no html_content stored.
leadEngineRouter.post(
  "/regenerate-all-missing",
  requireSecret,
  async (req, res) => {
    const allAudits = await dbGetAllAudits();
    const missing = allAudits.filter((a) => !a.htmlContent && a.domain);
    // Queue all as "queued" immediately so the frontend can start polling
    for (const record of missing) {
      setRegenProgress(record.domain, {
        auditId: record.id,
        name: record.name,
        domain: record.domain,
        stage: "queued",
        percent: 0,
        startedAt: Date.now(),
      });
    }
    res.json({
      queued: missing.length,
      names: missing.map((a) => a.name),
      domains: missing.map((a) => a.domain),
    });

    // Run sequentially so we don't hammer the AI API
    for (const record of missing) {
      await runRegenPipeline(record);
    }
    log("[RegenAll] Batch regeneration complete");
  },
);

// ── POST /api/lead-engine/dedup-cleanup ──────────────────────────────────────
// Finds duplicate audit rows caused by www. prefix inconsistency and removes
// the weaker copy, keeping the one with the best data (has html, latest date).
leadEngineRouter.post("/dedup-cleanup", requireSecret, async (req, res) => {
  function normDomain(d) {
    return (d || "")
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .trim();
  }

  const allAudits = await dbGetAllAudits();

  // Group by normalised domain
  const groups = {};
  for (const audit of allAudits) {
    const key = normDomain(audit.domain);
    if (!groups[key]) groups[key] = [];
    groups[key].push(audit);
  }

  let removed = 0;
  const removedNames = [];

  for (const [key, group] of Object.entries(groups)) {
    if (group.length < 2) continue;

    // Sort: prefer record with html_content, then by most recent contactedAt
    group.sort((a, b) => {
      if (!!a.htmlContent !== !!b.htmlContent) return b.htmlContent ? 1 : -1;
      return new Date(b.contactedAt) - new Date(a.contactedAt);
    });

    // Keep the first (best) record; delete the rest
    const [keep, ...dupes] = group;
    for (const dupe of dupes) {
      log(
        `[Dedup] Removing duplicate "${dupe.domain}" (keeping "${keep.domain}")`,
      );
      removedNames.push(`${dupe.name} (${dupe.domain})`);
      await dbDeleteAudit(dupe.domain);
      deleteContacted(dupe.domain);
      removed++;
    }
  }

  log(`[Dedup] Cleanup complete — removed ${removed} duplicate(s)`);
  res.json({ removed, removedNames });
});

// ── POST /api/lead-engine/mark-replied ───────────────────────────────────────
leadEngineRouter.post("/mark-replied", requireSecret, async (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: "domain required" });
  const ok = markReplied(domain);
  await dbUpdateAuditStatus(domain, "replied").catch(() => {});
  res.json({ success: ok });
});

// ── POST /api/lead-engine/send-draft ─────────────────────────────────────────
leadEngineRouter.post("/send-draft", requireSecret, async (req, res) => {
  const { id, to } = req.body;
  if (!id) return res.status(400).json({ error: "id required" });

  // Prefer DB (source of truth) — fall back to JSON file
  let draft = getDrafts().find((d) => d.id === Number(id));
  if (!draft) {
    const dbDrafts = await dbGetAllDrafts();
    draft = dbDrafts.find((d) => d.id === Number(id));
  }
  if (!draft) return res.status(404).json({ error: "Draft not found" });
  if (draft.sent) return res.status(400).json({ error: "Already sent" });

  const recipient = to || draft.email;
  if (!recipient)
    return res
      .status(400)
      .json({
        error: 'No email address — provide one in the request body as "to"',
      });

  try {
    await sendEmail(recipient, draft.subject, draft.body);
    markDraftSent(Number(id));
    await dbMarkDraftSent(Number(id));
    // Update the linked audit status to 'emailed' so the Audits tab reflects it
    const domain = draft.domain || draft.email?.split("@")[1];
    if (domain && !domain.startsWith("ig_")) {
      await dbUpdateAuditStatus(domain, "emailed").catch(() => {});
    }
    log(`[Send] Draft ${id} sent to ${recipient}`);
    res.json({ success: true, to: recipient });
  } catch (err) {
    log(`[Send] Failed to send draft ${id}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/lead-engine/mark-sent ──────────────────────────────────────────
leadEngineRouter.post("/mark-sent", requireSecret, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "id required" });
  markDraftSent(Number(id));
  await dbMarkDraftSent(Number(id));
  // Also update the linked audit record status to 'emailed'
  const allDrafts = await dbGetAllDrafts();
  const draft = allDrafts.find((d) => d.id === Number(id));
  if (draft?.domain && !draft.domain.startsWith("ig_")) {
    await dbUpdateAuditStatus(draft.domain, "emailed").catch(() => {});
  }
  res.json({ success: true });
});

// ── POST /api/lead-engine/take-offline ───────────────────────────────────────
// Replace the live audit page with a "no longer available" page without deleting the record
leadEngineRouter.post("/take-offline", requireSecret, async (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: "domain required" });
  const audits = await dbGetAllAudits();
  const audit = audits.find((a) => a.domain === domain);
  await takeAuditOfflineOnDisk(audit?.auditUrl, audit?.name);
  await dbUpdateAuditStatus(domain, "taken_down");
  deleteContacted(domain); // also update JSON cache
  log(`[Offline] Audit taken offline for ${domain}`);
  res.json({ success: true });
});

// ── DELETE /api/lead-engine/audit ─────────────────────────────────────────────
leadEngineRouter.delete("/audit", requireSecret, async (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: "domain required" });
  const audits = await dbGetAllAudits();
  const audit = audits.find((a) => a.domain === domain);
  await deleteAuditFromDisk(audit?.auditUrl);
  await dbDeleteAudit(domain);
  deleteContacted(domain);
  log(`[Delete] Audit removed for ${domain}`);
  res.json({ success: true });
});

// ── DELETE /api/lead-engine/draft ─────────────────────────────────────────────
// Also cascades: takes down & deletes the matching audit if domain is known
leadEngineRouter.delete("/draft", requireSecret, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "id required" });
  const allDrafts = await dbGetAllDrafts();
  const draft = allDrafts.find((d) => d.id === Number(id));
  // delete the draft
  deleteDraft(Number(id));
  await dbDeleteDraft(Number(id));
  log(`[Delete] Draft ${id} removed`);
  // cascade: take down and delete the audit
  if (draft?.domain) {
    const audits = await dbGetAllAudits();
    const audit = audits.find((a) => a.domain === draft.domain);
    await deleteAuditFromDisk(audit?.auditUrl);
    await dbDeleteAudit(draft.domain);
    deleteContacted(draft.domain);
    log(`[Delete] Cascaded audit removal for ${draft.domain}`);
  }
  res.json({ success: true });
});

// ── POST /api/lead-engine/digest ─────────────────────────────────────────────
leadEngineRouter.post("/digest", requireSecret, async (req, res) => {
  res.json({ started: true });
  sendDailyDigest().catch((err) => log(`[Digest] Failed: ${err.message}`));
});

// ── POST /api/lead-engine/expire-now — manual expiry trigger ─────────────────
leadEngineRouter.post("/expire-now", requireSecret, async (req, res) => {
  const result = await runExpiryCheck();
  res.json(result);
});
// — POST /api/lead-engine/import — Bulk import from Cowork lead engine ——————
// Accepts pre-audited lead data, generates audit page, saves to DB
leadEngineRouter.post("/import", requireSecret, async (req, res) => {
  try {
    const { lead, audit } = req.body;
    if (!lead || !audit) {
      return res
        .status(400)
        .json({ error: "Missing lead or audit in request body" });
    }
    if (!lead.name || !lead.domain) {
      return res
        .status(400)
        .json({ error: "lead.name and lead.domain are required" });
    }

    const domain = lead.domain;
    log(`[Import] Importing lead: ${lead.name} (${domain})`);

    // Stage 1: Generate (or overwrite) the audit page on disk + DB
    const auditUrl = await generateAuditPage(lead, audit);
    log(`[Import] Audit page generated: ${auditUrl}`);

    // Stage 2: Upsert the lead audit record in DB
    await dbUpsertAudit({
      name: lead.name,
      domain,
      auditUrl,
      location: lead.location || "Hong Kong",
      industry: lead.industry || "Unknown",
      channel: lead.channel || "cowork-engine",
      status: "draft",
    });
    log(`[Import] DB record upserted for ${domain}`);

    // Stage 3: Generate outreach draft if not skipped
    if (!req.body.skipDraft) {
      try {
        const outreach = await writeOutreachDraft(lead, audit, auditUrl);
        await saveDraft(lead, outreach, auditUrl);
        log(`[Import] Draft created for ${lead.name}`);
      } catch (draftErr) {
        log(
          `[Import] Draft generation failed for ${lead.name}: ${draftErr.message} — continuing`,
        );
      }
    }

    res.json({
      ok: true,
      name: lead.name,
      domain,
      auditUrl,
      message: `Lead imported and audit live at ${auditUrl}`,
    });
  } catch (err) {
    log(`[Import] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});
// ── POST /api/lead-engine/test-email ─────────────────────────────────────────
// Sends a realistic sample outreach email to a given address so you can
// preview exactly what leads will receive.
leadEngineRouter.post("/test-email", requireSecret, async (req, res) => {
  const { to } = req.body;
  if (!to)
    return res.status(400).json({ error: '"to" email address required' });

  const subject = `Quick question about Acme Trading Co's online presence`;
  const body = `Hi Sarah,

I came across Acme Trading Co while researching businesses in Hong Kong's import/export space and ran a quick audit of your digital presence.

A few things stood out — your website loads slowly on mobile (scoring around 4/10 on responsiveness), and you don't appear to have a Google Business profile set up, which means you're missing out on local search visibility.

I've put together a short audit report with specifics here:
https://jdcoredev.com/audits/acme-trading-co

I specialise in helping businesses like yours fix exactly these kinds of issues — typically within 2–4 weeks. No fluff, just practical work.

Worth a quick chat? I'm happy to walk you through the findings at no cost.

Best,
Joshua
JD CoreDev
https://jdcoredev.com`;

  try {
    await sendEmail(to, subject, body);
    log(`[Test] Sample outreach sent to ${to}`);
    res.json({ success: true, to, subject });
  } catch (err) {
    log(`[Test] Failed to send test email: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/lead-engine/ping ─────────────────────────────────────────────────
leadEngineRouter.get("/ping", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), ranToday });
});
