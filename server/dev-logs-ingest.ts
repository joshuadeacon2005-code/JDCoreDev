/**
 * Dev-logs ingest router
 *
 * Receives POSTs from Claude Code hook scripts running on developer machines.
 * Writes the entry into maintenance_logs so it counts toward
 * project_hosting_terms budgets exactly like a manually-entered log.
 *
 * Auth: x-jdcd-key header matched against env JDCD_DEV_LOG_KEY.
 * Mounted at /api/dev-logs.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { storage } from "./storage";
import { db } from "./db";
import { projects } from "@shared/schema";
import { eq } from "drizzle-orm";

export const devLogsIngestRouter = Router();

function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const provided = req.headers["x-jdcd-key"];
  const expected = process.env.JDCD_DEV_LOG_KEY;
  if (!expected) {
    return res.status(503).json({ error: "JDCD_DEV_LOG_KEY not configured on server" });
  }
  if (typeof provided !== "string" || provided !== expected) {
    return res.status(401).json({ error: "Invalid or missing x-jdcd-key" });
  }
  next();
}

const ingestSchema = z.object({
  projectId: z.number().int().positive(),
  logType: z.enum(["hosting", "development"]).optional(),
  sessionId: z.string().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  minutesSpent: z.number().int().min(0),
  estimatedCostCents: z.number().int().min(0),
  description: z.string().min(1),
  category: z.string().optional(),
});

devLogsIngestRouter.post("/ingest", requireApiKey, async (req, res, next) => {
  try {
    const parsed = ingestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    }
    const data = parsed.data;

    const [project] = await db
      .select({ id: projects.id, status: projects.status })
      .from(projects)
      .where(eq(projects.id, data.projectId));
    if (!project) {
      return res.status(404).json({ error: `Project ${data.projectId} not found` });
    }

    // If logType not specified, mirror the auto-conversion logic used elsewhere:
    // hosting-status projects → "hosting", everything else → "development".
    const logType =
      data.logType ?? (project.status === "hosting" ? "hosting" : "development");

    // log_date is a DATE (no time) — use the date the session ended, in UTC.
    const logDate = data.endedAt.slice(0, 10);

    const created = await storage.createMaintenanceLog({
      projectId: data.projectId,
      logDate,
      minutesSpent: data.minutesSpent,
      description: data.description,
      estimatedCostCents: data.estimatedCostCents,
      category: data.category ?? "claude-code-session",
      logType,
      // No createdByUserId — this is a system entry from the hook.
      createdByUserId: null as any,
    });

    res.status(201).json({ id: created.id, logType, logDate });
  } catch (err) {
    next(err);
  }
});

// Lightweight health check the hook can probe to verify connectivity + auth.
devLogsIngestRouter.get("/ping", requireApiKey, (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});
