/**
 * Social trader signal ingestion
 * ──────────────────────────────────────────────────────────────────────────
 * Tracks Instagram (and future Twitter / Telegram) traders the user wants
 * to follow, and parses their posts into structured trade signals.
 *
 * Right now: manual paste-in flow only. User opens a tracked-trader's
 * latest post on Instagram, pastes the URL/caption text, Claude extracts
 * a structured signal (ticker, direction, market type, size hint, edge),
 * and it lands in a review queue. User can then click through to place
 * the bet on Kalshi/Polymarket/the broker.
 *
 * Auto-scraping is deferred — Instagram blocks scrapers aggressively, so
 * adding it requires an external service (Apify, Phantombuster, scrapingbee)
 * which is a separate budget/architecture decision.
 *
 * Mounted at /api/social-signals (admin-only via routes.ts gating).
 */

import { Router, type Request, type Response } from "express";
import { pool } from "./db";
import Anthropic from "@anthropic-ai/sdk";

export const socialSignalsRouter = Router();

// ── Schema ──────────────────────────────────────────────────────────────
let schemaReady: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tracked_traders (
        id          SERIAL PRIMARY KEY,
        platform    TEXT NOT NULL DEFAULT 'instagram',
        handle      TEXT NOT NULL,
        display_name TEXT,
        focus       TEXT,
        notes       TEXT,
        is_active   BOOLEAN NOT NULL DEFAULT TRUE,
        added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (platform, handle)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS social_signals (
        id              SERIAL PRIMARY KEY,
        trader_id       INTEGER REFERENCES tracked_traders(id) ON DELETE SET NULL,
        platform        TEXT NOT NULL DEFAULT 'instagram',
        post_url        TEXT,
        raw_text        TEXT NOT NULL,
        ticker          TEXT,
        market_type     TEXT,        -- 'stock' | 'crypto' | 'kalshi' | 'polymarket' | 'options' | 'unknown'
        direction       TEXT,        -- 'long' | 'short' | 'yes' | 'no' | 'unclear'
        entry_hint      TEXT,
        size_hint       TEXT,
        time_horizon    TEXT,
        ai_confidence   REAL,
        ai_rationale    TEXT,
        status          TEXT NOT NULL DEFAULT 'pending',
                                       -- 'pending' | 'placed' | 'dismissed' | 'expired'
        action_notes    TEXT,
        logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        decided_at      TIMESTAMPTZ
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_social_signals_status ON social_signals (status, logged_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_social_signals_trader ON social_signals (trader_id)`);
  })();
  return schemaReady;
}
ensureSchema().catch(e => console.error("[social-signals] schema init:", e.message));

// ── Tracked traders CRUD ────────────────────────────────────────────────
socialSignalsRouter.get("/traders", async (_req, res) => {
  try {
    await ensureSchema();
    const r = await pool.query(`SELECT * FROM tracked_traders ORDER BY is_active DESC, added_at DESC`);
    res.json({ traders: r.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

socialSignalsRouter.post("/traders", async (req, res) => {
  try {
    await ensureSchema();
    const platform = (req.body?.platform || "instagram").toString().toLowerCase().slice(0, 20);
    const handle = (req.body?.handle || "").toString().trim().replace(/^@/, "");
    if (!handle) return res.status(400).json({ error: "handle required" });
    const r = await pool.query(
      `INSERT INTO tracked_traders (platform, handle, display_name, focus, notes)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (platform, handle) DO UPDATE SET
         display_name = COALESCE(EXCLUDED.display_name, tracked_traders.display_name),
         focus        = COALESCE(EXCLUDED.focus, tracked_traders.focus),
         notes        = COALESCE(EXCLUDED.notes, tracked_traders.notes),
         is_active    = TRUE
       RETURNING *`,
      [platform, handle, req.body?.displayName || null, req.body?.focus || null, req.body?.notes || null]
    );
    res.status(201).json({ trader: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

socialSignalsRouter.patch("/traders/:id", async (req, res) => {
  try {
    await ensureSchema();
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
    const fields: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const k of ["display_name", "focus", "notes", "is_active"] as const) {
      const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const v = req.body?.[camel];
      if (v !== undefined) {
        fields.push(`${k} = $${i++}`);
        vals.push(v);
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: "no fields to update" });
    vals.push(id);
    const r = await pool.query(
      `UPDATE tracked_traders SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
      vals
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "not found" });
    res.json({ trader: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

socialSignalsRouter.delete("/traders/:id", async (req, res) => {
  try {
    await ensureSchema();
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
    await pool.query(`DELETE FROM tracked_traders WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Signal extraction (Claude) ──────────────────────────────────────────
// User pastes an Instagram post (URL + caption text or just text). Claude
// returns a structured trade signal — never auto-acted on; goes to queue.
socialSignalsRouter.post("/extract", async (req, res) => {
  try {
    await ensureSchema();
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
    }
    const rawText = (req.body?.text || "").toString().trim();
    const postUrl = (req.body?.postUrl || "").toString().trim() || null;
    const traderId = req.body?.traderId ? parseInt(req.body.traderId) : null;
    if (!rawText && !postUrl) return res.status(400).json({ error: "text or postUrl required" });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const prompt = `Extract a structured trade signal from this social-media post by a trader. The post may reference a stock ticker, crypto, Kalshi/Polymarket prediction market, or options play. If multiple trades are mentioned, pick the highest-conviction one. If the post is generic commentary with no actionable trade, return ticker: null and direction: "unclear".

POST URL: ${postUrl || "(none provided)"}
POST CONTENT:
"""
${rawText || "(URL only — content not provided, infer from URL if possible but mark confidence low)"}
"""

Return ONLY a JSON object, no markdown:
{
  "ticker": "stock symbol / crypto pair / market ticker — null if unclear",
  "market_type": "stock" | "crypto" | "kalshi" | "polymarket" | "options" | "unknown",
  "direction": "long" | "short" | "yes" | "no" | "unclear",
  "entry_hint": "specific entry price/level/condition mentioned, or null",
  "size_hint": "any sizing or conviction language (e.g. 'small position', 'all in'), or null",
  "time_horizon": "swing / day / weeks / months / null",
  "confidence": 0.0-1.0  (how clear is the signal? null/unclear posts → low),
  "rationale": "1-2 sentence summary of what the trader is calling and why, in your words"
}`;

    const result = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    const responseText = result.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
    const m = responseText.match(/\{[\s\S]*\}/);
    if (!m) {
      return res.status(502).json({ error: "Claude returned no JSON object", raw: responseText.slice(0, 500) });
    }
    const parsed = JSON.parse(m[0]);

    res.json({
      traderId,
      postUrl,
      extracted: {
        ticker:        parsed.ticker || null,
        marketType:    parsed.market_type || "unknown",
        direction:     parsed.direction || "unclear",
        entryHint:     parsed.entry_hint || null,
        sizeHint:      parsed.size_hint || null,
        timeHorizon:   parsed.time_horizon || null,
        aiConfidence:  Number(parsed.confidence) || 0,
        aiRationale:   parsed.rationale || null,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Save an extracted signal (or a manual one) to the review queue.
socialSignalsRouter.post("/", async (req, res) => {
  try {
    await ensureSchema();
    const b = req.body || {};
    const r = await pool.query(
      `INSERT INTO social_signals
       (trader_id, platform, post_url, raw_text, ticker, market_type, direction,
        entry_hint, size_hint, time_horizon, ai_confidence, ai_rationale)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        b.traderId || null,
        (b.platform || "instagram").toString().slice(0, 20),
        b.postUrl || null,
        (b.rawText || "").toString().slice(0, 4000),
        b.ticker || null,
        b.marketType || "unknown",
        b.direction || "unclear",
        b.entryHint || null,
        b.sizeHint || null,
        b.timeHorizon || null,
        Number(b.aiConfidence) || 0,
        b.aiRationale || null,
      ]
    );
    res.status(201).json({ signal: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// List signals — pending by default, can filter by status.
socialSignalsRouter.get("/", async (req, res) => {
  try {
    await ensureSchema();
    const status = (req.query.status as string) || "pending";
    const r = await pool.query(
      `SELECT s.*, t.handle, t.display_name, t.platform AS trader_platform
         FROM social_signals s
         LEFT JOIN tracked_traders t ON t.id = s.trader_id
        WHERE s.status = $1
        ORDER BY s.logged_at DESC
        LIMIT 200`,
      [status]
    );
    res.json({ signals: r.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Mark placed / dismissed / expired with optional notes.
socialSignalsRouter.patch("/:id", async (req, res) => {
  try {
    await ensureSchema();
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
    const status = (req.body?.status || "").toString();
    if (!["pending", "placed", "dismissed", "expired"].includes(status)) {
      return res.status(400).json({ error: "status must be pending/placed/dismissed/expired" });
    }
    const r = await pool.query(
      `UPDATE social_signals
          SET status = $1,
              action_notes = COALESCE($2, action_notes),
              decided_at = CASE WHEN $1 != 'pending' THEN NOW() ELSE NULL END
        WHERE id = $3
        RETURNING *`,
      [status, req.body?.actionNotes || null, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "not found" });
    res.json({ signal: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
