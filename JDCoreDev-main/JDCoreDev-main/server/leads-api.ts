import { Router, Request, Response, NextFunction } from "express";
import { pool } from "./db";

export const leadsRouter = Router();

// ── Rate limiter (in-memory, resets hourly) ──
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimitImport(req: Request, res: Response, next: NextFunction) {
  const key = (req.body?.auth_key || req.query.auth_key || req.headers["x-auth-key"]) as string || "anon";
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 3600_000 };
    rateBuckets.set(key, bucket);
  }
  bucket.count++;
  if (bucket.count > 100) {
    return res.status(429).json({ error: "rate_limited", message: "Max 100 imports per hour" });
  }
  next();
}

// ── Auth middleware ──
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const key = req.body?.auth_key || req.query.auth_key || req.headers["x-auth-key"];
  if (!key || key !== process.env.LEAD_IMPORT_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

// ── DB init ──
export async function initLeads() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS imported_leads (
      id SERIAL PRIMARY KEY,
      business_name TEXT NOT NULL,
      industry TEXT,
      location TEXT,
      priority TEXT DEFAULT 'MEDIUM',
      owner_name TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      instagram TEXT,
      facebook TEXT,
      google_rating REAL,
      google_review_count INTEGER,
      overall_score REAL,
      scores_json JSONB,
      missing_features JSONB,
      ai_opportunities JSONB,
      competitor_intel TEXT,
      draft_email_subject TEXT,
      draft_email_body TEXT,
      draft_dm TEXT,
      notes TEXT,
      audit_html TEXT,
      status TEXT DEFAULT 'new',
      contacted_at TIMESTAMPTZ,
      response TEXT,
      archived BOOLEAN DEFAULT false,
      imported_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log("[leads] Table initialized");
}

// ── Helpers ──
const VALID_STATUSES = ["new", "contacted", "responded", "meeting_booked", "won", "lost", "no_response"];
const VALID_PRIORITIES = ["HIGH", "MEDIUM", "LOW"];
const SORT_FIELDS: Record<string, string> = {
  imported_at: "imported_at",
  overall_score: "overall_score",
  priority: "priority",
  google_rating: "google_rating",
};

interface LeadInput {
  business_name?: string;
  industry?: string;
  location?: string;
  priority?: string;
  owner_name?: string;
  phone?: string;
  email?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  google_rating?: number;
  google_review_count?: number;
  overall_score?: number;
  scores?: { mobile: number; speed: number; design: number; content: number; seo: number };
  missing_features?: string[];
  ai_opportunities?: { feature: string; description: string }[];
  competitor_intel?: string;
  draft_email_subject?: string;
  draft_email_body?: string;
  draft_dm?: string;
  notes?: string;
}

function validateLead(lead: LeadInput): string[] {
  const errors: string[] = [];
  if (!lead.business_name) errors.push("missing required field: business_name");
  if (!lead.location) errors.push("missing required field: location");
  if (lead.overall_score == null) errors.push("missing required field: overall_score");
  if (!lead.scores) errors.push("missing required field: scores");
  if (!lead.missing_features) errors.push("missing required field: missing_features");
  if (!lead.ai_opportunities) errors.push("missing required field: ai_opportunities");
  if (!lead.draft_email_subject) errors.push("missing required field: draft_email_subject");
  if (!lead.draft_email_body) errors.push("missing required field: draft_email_body");
  if (lead.overall_score != null && (lead.overall_score < 1 || lead.overall_score > 10)) {
    errors.push("overall_score must be between 1 and 10");
  }
  if (lead.priority && !VALID_PRIORITIES.includes(lead.priority)) {
    errors.push("priority must be HIGH, MEDIUM, or LOW");
  }
  return errors;
}

async function insertLead(lead: LeadInput): Promise<{ status: string; id?: number; existing_id?: number; message?: string }> {
  const errors = validateLead(lead);
  if (errors.length > 0) return { status: "error", message: errors[0] };

  // Duplicate check
  const dup = await pool.query(
    `SELECT id FROM imported_leads WHERE LOWER(business_name)=LOWER($1) AND LOWER(location)=LOWER($2) AND archived=false`,
    [lead.business_name, lead.location]
  );
  if (dup.rows.length > 0) return { status: "duplicate", existing_id: dup.rows[0].id };

  const r = await pool.query(
    `INSERT INTO imported_leads
      (business_name, industry, location, priority, owner_name, phone, email, website,
       instagram, facebook, google_rating, google_review_count, overall_score,
       scores_json, missing_features, ai_opportunities, competitor_intel,
       draft_email_subject, draft_email_body, draft_dm, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING id`,
    [
      lead.business_name, lead.industry || null, lead.location,
      lead.priority || "MEDIUM", lead.owner_name || null, lead.phone || null,
      lead.email || null, lead.website || null, lead.instagram || null,
      lead.facebook || null, lead.google_rating ?? null, lead.google_review_count ?? null,
      lead.overall_score, JSON.stringify(lead.scores), JSON.stringify(lead.missing_features),
      JSON.stringify(lead.ai_opportunities), lead.competitor_intel || null,
      lead.draft_email_subject, lead.draft_email_body, lead.draft_dm || null, lead.notes || null,
    ]
  );
  return { status: "imported", id: r.rows[0].id };
}

// ── Routes ──

// Stats (before /:id to avoid route conflict)
leadsRouter.get("/stats", authMiddleware, async (_req, res) => {
  try {
    const [totals, thisWeek, thisMonth, priorities, avgScore, topIndustries, topLocations, weeklyTrend, recentLeads, recentWins] = await Promise.all([
      pool.query(`SELECT status, COUNT(*)::int as count FROM imported_leads WHERE archived=false GROUP BY status`),
      pool.query(`SELECT COUNT(*)::int as count FROM imported_leads WHERE imported_at >= NOW() - INTERVAL '7 days' AND archived=false`),
      pool.query(`SELECT COUNT(*)::int as count FROM imported_leads WHERE imported_at >= NOW() - INTERVAL '30 days' AND archived=false`),
      pool.query(`SELECT priority, COUNT(*)::int as count FROM imported_leads WHERE archived=false GROUP BY priority`),
      pool.query(`SELECT AVG(overall_score)::real as avg FROM imported_leads WHERE archived=false`),
      pool.query(`SELECT industry, COUNT(*)::int as count FROM imported_leads WHERE archived=false AND industry IS NOT NULL GROUP BY industry ORDER BY count DESC LIMIT 5`),
      pool.query(`SELECT location, COUNT(*)::int as count FROM imported_leads WHERE archived=false AND location IS NOT NULL GROUP BY location ORDER BY count DESC LIMIT 5`),
      pool.query(`SELECT TO_CHAR(DATE_TRUNC('week', imported_at), 'IYYY-"W"IW') as week, COUNT(*)::int as count FROM imported_leads WHERE imported_at >= NOW() - INTERVAL '12 weeks' AND archived=false GROUP BY week ORDER BY week`),
      pool.query(`SELECT id, business_name, industry, location, overall_score, status, imported_at FROM imported_leads WHERE archived=false ORDER BY imported_at DESC LIMIT 5`),
      pool.query(`SELECT id, business_name, industry, location, overall_score, status, imported_at FROM imported_leads WHERE status='won' AND archived=false ORDER BY imported_at DESC LIMIT 5`),
    ]);

    const statusMap: Record<string, number> = {};
    let total = 0;
    for (const r of totals.rows) { statusMap[r.status] = r.count; total += r.count; }

    const contacted = (statusMap["contacted"] || 0) + (statusMap["responded"] || 0) + (statusMap["meeting_booked"] || 0) + (statusMap["won"] || 0) + (statusMap["lost"] || 0) + (statusMap["no_response"] || 0);
    const responded = (statusMap["responded"] || 0) + (statusMap["meeting_booked"] || 0) + (statusMap["won"] || 0);
    const responseRate = contacted > 0 ? +((responded / contacted) * 100).toFixed(1) : 0;
    const conversionRate = total > 0 ? +(((statusMap["won"] || 0) / total) * 100).toFixed(1) : 0;

    const prioMap: Record<string, number> = {};
    for (const r of priorities.rows) prioMap[r.priority] = r.count;

    res.json({
      total,
      new: statusMap["new"] || 0,
      contacted: statusMap["contacted"] || 0,
      responded: statusMap["responded"] || 0,
      meeting_booked: statusMap["meeting_booked"] || 0,
      won: statusMap["won"] || 0,
      lost: statusMap["lost"] || 0,
      no_response: statusMap["no_response"] || 0,
      this_week: thisWeek.rows[0].count,
      this_month: thisMonth.rows[0].count,
      high_priority: prioMap["HIGH"] || 0,
      medium_priority: prioMap["MEDIUM"] || 0,
      low_priority: prioMap["LOW"] || 0,
      avg_score: avgScore.rows[0].avg ? +avgScore.rows[0].avg.toFixed(1) : 0,
      response_rate: responseRate,
      conversion_rate: conversionRate,
      top_industries: topIndustries.rows,
      top_locations: topLocations.rows,
      weekly_trend: weeklyTrend.rows,
      recent_leads: recentLeads.rows,
      recent_wins: recentWins.rows,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Export CSV
leadsRouter.get("/export", authMiddleware, async (req, res) => {
  try {
    const { where, params } = buildWhereClause(req.query);
    const r = await pool.query(`SELECT * FROM imported_leads ${where} ORDER BY imported_at DESC`, params);
    const rows = r.rows;
    if (rows.length === 0) return res.status(200).send("No data");

    const cols = Object.keys(rows[0]).filter(k => k !== "audit_html");
    const escape = (v: any) => {
      if (v == null) return "";
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    let csv = cols.join(",") + "\n";
    for (const row of rows) csv += cols.map(c => escape(row[c])).join(",") + "\n";

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=leads-export-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Import single lead
leadsRouter.post("/import", authMiddleware, rateLimitImport, async (req, res) => {
  try {
    const { lead } = req.body;
    if (!lead) return res.status(400).json({ error: "missing lead object" });
    const result = await insertLead(lead);
    if (result.status === "error") return res.status(400).json({ error: result.message });
    if (result.status === "duplicate") return res.status(409).json({ error: "duplicate", message: "Lead already exists", existing_id: result.existing_id });
    res.json({ ok: true, id: result.id, message: "Lead imported successfully" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Import batch
leadsRouter.post("/import/batch", authMiddleware, rateLimitImport, async (req, res) => {
  try {
    const { leads } = req.body;
    if (!Array.isArray(leads) || leads.length === 0) return res.status(400).json({ error: "leads array required" });

    const results: any[] = [];
    let imported = 0, duplicates = 0, errors = 0;

    for (const lead of leads) {
      const r = await insertLead(lead);
      if (r.status === "imported") {
        imported++;
        results.push({ id: r.id, business_name: lead.business_name, status: "imported" });
      } else if (r.status === "duplicate") {
        duplicates++;
        results.push({ business_name: lead.business_name, status: "duplicate", existing_id: r.existing_id });
      } else {
        errors++;
        results.push({ business_name: lead.business_name || "unknown", status: "error", message: r.message });
      }
    }

    res.json({ ok: true, imported, duplicates, errors, results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// List leads
function buildWhereClause(query: any): { where: string; params: any[] } {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  const archived = query.archived === "true";
  if (!archived) { conditions.push(`archived=false`); }

  if (query.status) { conditions.push(`status=$${idx++}`); params.push(query.status); }
  if (query.priority) { conditions.push(`priority=$${idx++}`); params.push(query.priority); }
  if (query.industry) { conditions.push(`industry ILIKE $${idx++}`); params.push(`%${query.industry}%`); }
  if (query.location) { conditions.push(`location ILIKE $${idx++}`); params.push(`%${query.location}%`); }
  if (query.min_score) { conditions.push(`overall_score >= $${idx++}`); params.push(+query.min_score); }
  if (query.max_score) { conditions.push(`overall_score <= $${idx++}`); params.push(+query.max_score); }
  if (query.search) {
    conditions.push(`(business_name ILIKE $${idx} OR owner_name ILIKE $${idx} OR industry ILIKE $${idx} OR location ILIKE $${idx})`);
    params.push(`%${query.search}%`);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

leadsRouter.get("/", authMiddleware, async (req, res) => {
  try {
    const { where, params } = buildWhereClause(req.query);
    const sortField = SORT_FIELDS[req.query.sort as string] || "imported_at";
    const order = req.query.order === "asc" ? "ASC" : "DESC";
    const limit = Math.min(+(req.query.limit || 50), 200);
    const offset = +(req.query.offset || 0);

    const countIdx = params.length + 1;
    const limitIdx = params.length + 2;
    const [countR, dataR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int as total FROM imported_leads ${where}`, params),
      pool.query(
        `SELECT * FROM imported_leads ${where} ORDER BY ${sortField} ${order} LIMIT $${countIdx} OFFSET $${limitIdx}`,
        [...params, limit, offset]
      ),
    ]);

    res.json({ total: countR.rows[0].total, leads: dataR.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get single lead
leadsRouter.get("/:id", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM imported_leads WHERE id=$1", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "not found" });
    res.json(r.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Update lead
leadsRouter.patch("/:id", authMiddleware, async (req, res) => {
  try {
    const allowed = ["status", "notes", "response", "contacted_at", "priority"];
    const updates: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        if (field === "status" && !VALID_STATUSES.includes(req.body[field])) {
          return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
        }
        if (field === "priority" && !VALID_PRIORITIES.includes(req.body[field])) {
          return res.status(400).json({ error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(", ")}` });
        }
        updates.push(`${field}=$${idx++}`);
        vals.push(req.body[field]);
      }
    }

    // Auto-set contacted_at when status changes to contacted
    if (req.body.status === "contacted" && !req.body.contacted_at) {
      updates.push(`contacted_at=$${idx++}`);
      vals.push(new Date().toISOString());
    }

    if (updates.length === 0) return res.status(400).json({ error: "no valid fields to update" });

    vals.push(req.params.id);
    const r = await pool.query(`UPDATE imported_leads SET ${updates.join(",")} WHERE id=$${idx} RETURNING *`, vals);
    if (r.rows.length === 0) return res.status(404).json({ error: "not found" });
    res.json({ ok: true, lead: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Archive (soft delete)
leadsRouter.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query("UPDATE imported_leads SET archived=true WHERE id=$1 RETURNING id", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "not found" });
    res.json({ ok: true, message: "Lead archived" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Unarchive
leadsRouter.post("/:id/unarchive", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query("UPDATE imported_leads SET archived=false WHERE id=$1 RETURNING id", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "not found" });
    res.json({ ok: true, message: "Lead restored" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Trigger deep audit
leadsRouter.post("/:id/audit", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT website FROM imported_leads WHERE id=$1", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "not found" });
    if (!r.rows[0].website) return res.status(400).json({ error: "Lead has no website" });

    // Try to run through pipeline audit if available
    try {
      const auditMod = await import("../pipeline/audit.js" as any);
      const html = await auditMod.default(r.rows[0].website);
      await pool.query("UPDATE imported_leads SET audit_html=$1 WHERE id=$2", [html, req.params.id]);
      res.json({ ok: true, message: "Audit complete" });
    } catch {
      res.status(501).json({ error: "Audit pipeline not available" });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Send outreach email
leadsRouter.post("/:id/send-email", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT email, draft_email_subject, draft_email_body FROM imported_leads WHERE id=$1", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "not found" });
    const lead = r.rows[0];
    if (!lead.email) return res.status(400).json({ error: "Lead has no email address" });

    try {
      const { sendEmail } = await import("./email");
      await sendEmail({
        to: lead.email,
        subject: lead.draft_email_subject,
        text: lead.draft_email_body,
        html: lead.draft_email_body,
      });
      await pool.query("UPDATE imported_leads SET status='contacted', contacted_at=NOW() WHERE id=$1", [req.params.id]);
      res.json({ ok: true, message: "Email sent" });
    } catch (emailErr: any) {
      res.status(500).json({ error: `Email send failed: ${emailErr.message}` });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
