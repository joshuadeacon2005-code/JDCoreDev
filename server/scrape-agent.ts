/**
 * Scrape Agent — stealth-fetch primitive for trading routines.
 *
 * Mounted at /api/trader/scrape, gated by x-jdcd-agent-key (same shared secret
 * the trader-agent and predictor-agent routers use). Phase 4 of W3 cleanup —
 * see docs/trading-routine-architecture.md for the install pattern decision.
 *
 * Contract: POST { url, mode? } -> { source, content, content_chars, backend, fetched_at }
 *
 * Backends (selected via SCRAPE_BACKEND env var, default "plain"):
 *   plain        — built-in fetch with realistic headers. Works for non-aggressive
 *                  Cloudflare and most public sites. Default.
 *   playwright   — NOT YET IMPLEMENTED (v2). Real browser with stealth plugin.
 *   scrapingbee  — NOT YET IMPLEMENTED (v2). Paid proxy service.
 *
 * SSRF: requests to internal/private IPs and non-http(s) schemes are blocked.
 */
import { Router, Request, Response, NextFunction } from "express";

export const scrapeAgentRouter = Router();

const SCRAPE_TIMEOUT_MS = 20_000;
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;   // 5MB raw HTML cap
const MAX_OUTPUT_CHARS  = 60_000;            // 60k chars extracted text cap

const REALISTIC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function requireAgentKey(req: Request, res: Response, next: NextFunction) {
  const provided = req.headers["x-jdcd-agent-key"];
  const expected = process.env.JDCD_AGENT_KEY;
  if (!expected) return res.status(503).json({ error: "JDCD_AGENT_KEY not set" });
  if (provided !== expected) return res.status(401).json({ error: "unauthorized" });
  next();
}

function isInternalIp(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "metadata" || h === "metadata.google.internal") return true;
  if (h === "169.254.169.254" || h === "169.254.170.2") return true; // AWS / GCP / Azure metadata
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h))  return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true;
  if (/^0\./.test(h)) return true;
  if (h === "::1" || /^fc/.test(h) || /^fd/.test(h) || /^fe80:/.test(h)) return true;
  return false;
}

function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "");
  s = s.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "");
  s = s.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "");
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  s = s.replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

scrapeAgentRouter.post("/", requireAgentKey, async (req: Request, res: Response) => {
  const { url } = (req.body || {}) as { url?: string; mode?: string };
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "url required" });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: "invalid url" });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return res.status(400).json({ error: "only http and https schemes allowed" });
  }
  if (isInternalIp(parsed.hostname)) {
    return res.status(400).json({ error: "internal or private targets blocked" });
  }

  const backend = process.env.SCRAPE_BACKEND || "plain";
  if (backend !== "plain") {
    return res.status(501).json({
      error: "backend not implemented in v1",
      backend,
      hint:
        "v1 only supports SCRAPE_BACKEND=plain. " +
        "v2 will add playwright (real browser + stealth) and scrapingbee (paid proxy).",
    });
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), SCRAPE_TIMEOUT_MS);
  try {
    const r = await fetch(parsed.toString(), {
      method: "GET",
      headers: {
        "User-Agent":                 REALISTIC_UA,
        Accept:                       "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":            "en-US,en;q=0.9",
        "Accept-Encoding":            "gzip, deflate, br",
        DNT:                          "1",
        "Sec-Fetch-Dest":             "document",
        "Sec-Fetch-Mode":             "navigate",
        "Sec-Fetch-Site":             "none",
        "Sec-Fetch-User":             "?1",
        "Upgrade-Insecure-Requests":  "1",
      },
      signal:    ctrl.signal,
      redirect:  "follow",
    });

    if (!r.ok) {
      return res.status(502).json({
        error:           "upstream non-2xx",
        backend,
        upstream_status: r.status,
        source:          parsed.toString(),
        fetched_at:      new Date().toISOString(),
      });
    }

    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX_CONTENT_BYTES) {
      return res.status(413).json({
        error:  "response too large",
        bytes:  buf.byteLength,
        limit:  MAX_CONTENT_BYTES,
      });
    }

    const html = new TextDecoder("utf-8").decode(buf);
    const text = htmlToText(html).slice(0, MAX_OUTPUT_CHARS);

    return res.json({
      source:        parsed.toString(),
      content:       text,
      content_chars: text.length,
      backend,
      fetched_at:    new Date().toISOString(),
    });
  } catch (e: any) {
    return res.status(500).json({
      error:    e?.name === "AbortError" ? "timeout" : (e?.message || "fetch failed"),
      backend,
      source:   parsed.toString(),
    });
  } finally {
    clearTimeout(timeout);
  }
});

scrapeAgentRouter.get("/ping", requireAgentKey, (_req, res) => {
  res.json({ ok: true, backend: process.env.SCRAPE_BACKEND || "plain" });
});
