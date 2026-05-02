/**
 * Lead Engine agent-routine endpoints
 * ──────────────────────────────────────────────────────────────────────────
 * These endpoints back an Anthropic-hosted Claude routine that drives the
 * Lead Engine on subscription quota instead of metered Anthropic API spend.
 *
 * Flow per fire:
 *   GET  /api/lead-engine/agent/state      → pending leads + audit schema
 *   (routine does research / scoring / copywriting in its own context)
 *   POST /api/lead-engine/agent/decisions  → server persists, calls
 *        generateAuditPage() so the audit HTML is written + the lead_audits
 *        row is upserted + the audit is live at jdcoredev.com/audits/<slug>.
 *
 * The legacy server-side pipeline (pipeline/index.js → runLeadEngine) stays
 * intact for manual /run, /manual-audit, /re-audit-draft etc — those still
 * cost metered API. The routine is the new default subscription-quota path.
 *
 * Auth: x-jdcd-agent-key header matched against env JDCD_AGENT_KEY (shared
 * with the trader + predictor agents).
 * Mounted at /api/lead-engine/agent.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { pool } from "./db";
import { generateAuditPage } from "../pipeline/generate-page.js";
import { saveDraft } from "../pipeline/draft-queue.js";
import { alreadyContacted, markContacted } from "../pipeline/db.js";
import { dbGetSettings, dbGetAllAudits } from "../pipeline/db-bridge.js";

export const leadEngineAgentRouter = Router();

// ── Auth ──────────────────────────────────────────────────────────────────
function requireAgentKey(req: Request, res: Response, next: NextFunction) {
  const provided = req.headers["x-jdcd-agent-key"];
  const expected = process.env.JDCD_AGENT_KEY;
  if (!expected) {
    return res.status(503).json({ error: "JDCD_AGENT_KEY not configured on server" });
  }
  if (typeof provided !== "string" || provided !== expected) {
    return res.status(401).json({ error: "Invalid or missing x-jdcd-agent-key" });
  }
  next();
}

// Hard cap — even if /state surfaces more, the routine can't process more
// than this in one fire (subscription quota cost + run time). The trader has
// 3, predictor has 5, lead engine work is heavier so 3 is the right cap.
const MAX_DECISIONS_PER_RUN = 3;

// ── Helpers ───────────────────────────────────────────────────────────────
function normaliseDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim() || null;
}

// ── GET /api/lead-engine/agent/state ──────────────────────────────────────
// One call returns everything the routine needs: pending leads it should
// audit + the full audit schema it must produce + tone settings + the dedup
// blacklist.
leadEngineAgentRouter.get("/state", requireAgentKey, async (_req, res) => {
  try {
    // Settings drive tone / region / industry hints.
    const settings = await dbGetSettings().catch(() => null);

    // Existing audits — used by the routine to skip duplicates client-side
    // (the server also dedups on submission via alreadyContacted()).
    const existingAudits = await dbGetAllAudits().catch(() => [] as any[]);
    const existingDomains: string[] = (existingAudits || [])
      .map((a: any) => normaliseDomain(a?.domain))
      .filter((d: string | null): d is string => !!d);

    // Pending leads: rows in the leads table that haven't yet been audited.
    // Match on normalised website domain against existing audit domains.
    const leadsRes = await pool.query(`
      SELECT
        id,
        business_name,
        industry,
        location,
        owner_name,
        email,
        phone,
        website,
        instagram,
        facebook,
        linkedin,
        google_rating,
        google_review_count,
        overall_score,
        primary_pain_point,
        recommendations_json,
        scores_json,
        channel,
        created_at
      FROM leads
      ORDER BY created_at DESC
      LIMIT 30
    `);

    const pendingLeads = leadsRes.rows
      .map((r: any) => {
        const websiteDomain = normaliseDomain(r.website) || normaliseDomain(r.business_name);
        return {
          id:                r.id,
          name:              r.business_name,
          industry:          r.industry,
          location:          r.location,
          ownerName:         r.owner_name,
          email:             r.email,
          phone:             r.phone,
          website:           r.website,
          domain:            websiteDomain,
          instagram:         r.instagram,
          facebook:          r.facebook,
          linkedin:          r.linkedin,
          googleRating:      r.google_rating,
          googleReviewCount: r.google_review_count,
          overallScorePrior: r.overall_score,
          primaryPainPoint:  r.primary_pain_point,
          recommendations:   r.recommendations_json ? safeJSON(r.recommendations_json) : null,
          scores:            r.scores_json ? safeJSON(r.scores_json) : null,
          channel:           r.channel,
          createdAt:         r.created_at,
          alreadyAudited:    websiteDomain ? existingDomains.includes(websiteDomain) : false,
        };
      })
      .filter((l: any) => !l.alreadyAudited)
      .slice(0, MAX_DECISIONS_PER_RUN);

    res.json({
      service: "lead-engine",
      generatedAt: new Date().toISOString(),
      maxDecisionsPerRun: MAX_DECISIONS_PER_RUN,
      pendingLeads,
      pendingCount: pendingLeads.length,
      totalLeadsInDb: leadsRes.rows.length,
      existingAuditCount: existingAudits.length,
      settings: settings || {},
      auditSchema: AUDIT_SCHEMA_DESCRIPTION,
      outreachSchema: OUTREACH_SCHEMA_DESCRIPTION,
      hint:
        "For each lead in pendingLeads, do your own research via WebSearch + " +
        "WebFetch (this is the work that used to happen in pipeline/audit.js + " +
        "pipeline/outreach.js). Produce one decision per lead matching the " +
        "auditSchema and outreachSchema, then POST to /api/lead-engine/agent/decisions. " +
        "Server will call generateAuditPage so the audit lands at " +
        "jdcoredev.com/audits/<slug>, save to the draft queue, and mark the " +
        "lead contacted.",
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

function safeJSON(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

// Description of the audit object shape the routine must produce. Mirrors
// pipeline/audit.js auditCompany() return shape, with safety defaults — every
// field is optional but populated fields drive the rendered audit page.
const AUDIT_SCHEMA_DESCRIPTION = {
  hasWebsite: "boolean",
  websiteUrl: "string | null",
  website: {
    score: "0–10",
    noWebsiteNote: "string | null (only if hasWebsite is false)",
    design:  { score: "0–10", note: "1 sentence" },
    mobile:  { score: "0–10", note: "1 sentence" },
    speed:   { score: "0–10", note: "1 sentence" },
    cta:     { score: "0–10", note: "1 sentence" },
    seo:     { score: "0–10", note: "1 sentence" },
  },
  social: {
    score: "0–10",
    instagram:      { status: "Active|Inactive|None found", dot: "dot-active|dot-inactive|dot-none", note: "1 sentence" },
    facebook:       { status: "...",                          dot: "...",                              note: "..." },
    linkedin:       { status: "...",                          dot: "...",                              note: "..." },
    googleBusiness: { status: "...",                          dot: "...",                              note: "..." },
  },
  infrastructure: {
    score: "0–10",
    booking:    { status: "string", class: "infra-active|infra-partial|infra-none", note: "..." },
    crm:        { status: "string", class: "...",                                    note: "..." },
    automation: { status: "string", class: "...",                                    note: "..." },
    ecommerce:  { status: "string", class: "...",                                    note: "..." },
  },
  subscriptionSoftware: [
    { name: "Tool name", monthlyHKD: "number", category: "string" },
  ],
  subscriptionSummary: {
    totalMonthlyHKD: "number",
    toolCount: "number",
    integrationGaps: "string | null",
    consolidationOpportunity: "string | null",
  },
  growthScore: "0–10",
  overallScore: "0–100",
  recommendations: [
    { title: "Short headline", description: "1–2 sentences", impact: "low|medium|high" },
  ],
  auditSummary: "1 paragraph executive summary",
};

const OUTREACH_SCHEMA_DESCRIPTION = {
  subject: "Email subject line — specific, curiosity-driven, never generic",
  body:    "Email body — 4 sentences max, opens by naming ONE specific real problem you found",
  dm:      "Short WhatsApp/Instagram DM — 2 sentences, even punchier than the email",
};

// ── POST /api/lead-engine/agent/decisions ─────────────────────────────────
// Routine submits per-lead {audit, outreach}. Server validates, calls
// generateAuditPage so HTML lands in pipeline/data/audits/<slug>/index.html
// AND lead_audits row is upserted (so https://jdcoredev.com/audits/<slug>
// goes live). Then saveDraft + markContacted.
leadEngineAgentRouter.post("/decisions", requireAgentKey, async (req, res) => {
  try {
    const body = req.body || {};
    const thesis = (body.thesis || "").toString().slice(0, 4000);
    const decisions: any[] = Array.isArray(body.decisions) ? body.decisions : [];

    if (!thesis || decisions.length === 0) {
      return res.status(400).json({ error: "thesis and non-empty decisions array required" });
    }
    if (decisions.length > MAX_DECISIONS_PER_RUN) {
      return res.status(400).json({
        error: `Too many decisions (${decisions.length}); max per run is ${MAX_DECISIONS_PER_RUN}.`,
      });
    }

    const results: any[] = [];
    let executedCount = 0;
    let rejectedCount = 0;

    for (const d of decisions) {
      const leadId = (d.lead_id || "").toString();
      const submittedLead = d.lead || {};
      const audit         = d.audit || null;
      const outreach      = d.outreach || null;

      const reasons: string[] = [];
      if (!leadId) reasons.push("lead_id required");
      if (!audit)  reasons.push("audit object required");
      if (!outreach || !outreach.subject || !outreach.body) {
        reasons.push("outreach.subject and outreach.body required");
      }

      if (reasons.length > 0) {
        rejectedCount++;
        results.push({ leadId, status: "rejected", reasons });
        continue;
      }

      // Pull canonical lead from DB so we can't be tricked by a malformed
      // submitted.lead. Also gives us the real domain + name for dedup.
      const dbRow = await pool.query("SELECT * FROM leads WHERE id = $1", [leadId]);
      if (dbRow.rows.length === 0) {
        rejectedCount++;
        results.push({ leadId, status: "rejected", reasons: ["lead_id not found in leads table"] });
        continue;
      }
      const dbLead = dbRow.rows[0];
      const normDomain = normaliseDomain(dbLead.website) || normaliseDomain(submittedLead.domain);

      // Dedup gate — skip if already audited (race against another fire / cron).
      if (await alreadyContacted(normDomain || "", dbLead.business_name)) {
        rejectedCount++;
        results.push({ leadId, status: "rejected", reasons: ["already audited"] });
        continue;
      }

      // Build the lead object generateAuditPage expects.
      const leadForPipeline = {
        name:     dbLead.business_name,
        domain:   normDomain,
        website:  dbLead.website,
        industry: dbLead.industry,
        location: dbLead.location,
        email:    dbLead.email,
        phone:    dbLead.phone,
        instagram: dbLead.instagram,
        facebook:  dbLead.facebook,
        linkedin:  dbLead.linkedin,
        ownerName: dbLead.owner_name,
      };

      // Apply safety defaults to audit (mirrors auditCompany() defensive
      // defaults so generateAuditPage's template doesn't blow up on missing
      // sub-objects).
      const safeAudit = applyAuditDefaults(audit);

      try {
        const auditUrl = await generateAuditPage(leadForPipeline, safeAudit);
        await saveDraft(leadForPipeline, outreach, auditUrl);
        await markContacted(normDomain || "", dbLead.business_name, auditUrl, "draft");

        // Sync overall_score + recommendations back into the leads table so
        // the /admin/lead-engine UI shows the routine's work.
        await pool.query(
          `UPDATE leads
           SET overall_score = $1,
               recommendations_json = $2,
               draft_email_subject = $3,
               draft_email_body = $4,
               draft_dm = $5
           WHERE id = $6`,
          [
            safeAudit.overallScore ?? null,
            safeAudit.recommendations ? JSON.stringify(safeAudit.recommendations) : null,
            outreach.subject,
            outreach.body,
            outreach.dm || null,
            leadId,
          ]
        ).catch(() => {});

        executedCount++;
        results.push({
          leadId,
          status: "executed",
          auditUrl,
          overallScore: safeAudit.overallScore,
          name: dbLead.business_name,
        });
      } catch (e: any) {
        rejectedCount++;
        results.push({ leadId, status: "error", reasons: [e.message] });
      }
    }

    const runStatus =
      rejectedCount === 0 && executedCount > 0 ? "executed"
      : executedCount > 0                       ? "partial"
      : "rejected";

    // Run log into the same lead-engine log stream the existing pipeline uses
    // (pipeline/logger.js writes to the DB engine_logs table — but importing
    // it here would widen the import surface; a simple console line + the
    // results JSON returned to the routine is enough for now).
    console.log(
      `[lead-engine-agent] ${executedCount} executed / ${rejectedCount} rejected. ` +
      `Thesis: ${thesis.slice(0, 120)}`
    );

    res.status(201).json({
      status: runStatus,
      executed: executedCount,
      rejected: rejectedCount,
      results,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Apply auditCompany()-style defaults so the page template doesn't crash.
function applyAuditDefaults(audit: any): any {
  const a = { ...audit };
  a.hasWebsite = a.hasWebsite ?? true;
  a.websiteUrl = a.websiteUrl ?? null;

  a.website = a.website ?? {};
  a.website.score = a.website.score ?? 0;
  a.website.noWebsiteNote = a.website.noWebsiteNote ?? null;
  for (const key of ["design", "mobile", "speed", "cta", "seo"] as const) {
    a.website[key] = a.website[key] ?? { score: 0, note: "Not assessed" };
  }

  const noSocial = { status: "None found", dot: "dot-none", note: "Not found during research" };
  a.social = a.social ?? {};
  a.social.score = a.social.score ?? 0;
  for (const key of ["instagram", "facebook", "linkedin", "googleBusiness"] as const) {
    a.social[key] = a.social[key] ?? noSocial;
  }

  const noInfra = { status: "None detected", class: "infra-none", note: "Not detected" };
  a.infrastructure = a.infrastructure ?? {};
  a.infrastructure.score = a.infrastructure.score ?? 0;
  for (const key of ["booking", "crm", "automation", "ecommerce"] as const) {
    a.infrastructure[key] = a.infrastructure[key] ?? noInfra;
  }

  a.subscriptionSoftware = a.subscriptionSoftware ?? [];
  a.subscriptionSummary  = a.subscriptionSummary  ?? {
    totalMonthlyHKD: 0,
    toolCount: 0,
    integrationGaps: null,
    consolidationOpportunity: null,
  };

  a.growthScore     = a.growthScore     ?? 5;
  a.overallScore    = a.overallScore    ?? 30;
  a.recommendations = a.recommendations ?? [];
  a.auditSummary    = a.auditSummary    ?? "";

  return a;
}

// ── POST /api/lead-engine/agent/run ───────────────────────────────────────
// Fires the Anthropic-hosted lead-engine routine on demand.
//
// One-time setup:
//   1. Open the routine at https://claude.ai/code/routines/{ROUTINE_ID}
//   2. Add another trigger → API → Generate token (shown once)
//   3. Set Railway env CLAUDE_ROUTINE_LEAD_ENGINE_TOKEN + _ID
const ROUTINE_FIRE_BETA = "experimental-cc-routine-2026-04-01";

leadEngineAgentRouter.post("/run", async (req, res) => {
  const token     = process.env.CLAUDE_ROUTINE_LEAD_ENGINE_TOKEN;
  const routineId = process.env.CLAUDE_ROUTINE_LEAD_ENGINE_ID;

  if (!token || !routineId) {
    return res.status(503).json({
      error: "Lead Engine routine not configured",
      hint:  "Set both CLAUDE_ROUTINE_LEAD_ENGINE_TOKEN and CLAUDE_ROUTINE_LEAD_ENGINE_ID " +
             "in Railway. Create the routine at https://claude.ai/code/routines, then " +
             "Add another trigger → API → Generate token.",
    });
  }

  const note = (req.body?.note || "").toString().slice(0, 200);
  const text = note
    ? `Manual fire from JDCoreDev admin UI — ${note}`
    : `Manual fire from JDCoreDev admin UI at ${new Date().toISOString()}`;

  try {
    const upstream = await fetch(
      `https://api.anthropic.com/v1/claude_code/routines/${routineId}/fire`,
      {
        method: "POST",
        headers: {
          "Authorization":     `Bearer ${token}`,
          "anthropic-beta":    ROUTINE_FIRE_BETA,
          "anthropic-version": "2023-06-01",
          "Content-Type":      "application/json",
        },
        body: JSON.stringify({ text }),
      }
    );
    const bodyText = await upstream.text();
    let bodyJson: any = null;
    try { bodyJson = JSON.parse(bodyText); } catch {}

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error:    "Anthropic routine-fire rejected the request",
        status:   upstream.status,
        upstream: bodyJson ?? bodyText,
      });
    }

    res.status(202).json({
      status:       "dispatched",
      routineId,
      dispatchedAt: new Date().toISOString(),
      note:         "Routine queued — audit pages land at jdcoredev.com/audits/<slug> when it completes.",
      upstream:     bodyJson ?? bodyText,
    });
  } catch (e: any) {
    res.status(502).json({ error: `Failed to reach Anthropic API: ${e.message}` });
  }
});

// ── GET /api/lead-engine/agent/ping ───────────────────────────────────────
leadEngineAgentRouter.get("/ping", requireAgentKey, (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});
