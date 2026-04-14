/**
 * JD CoreDev Lead Engine — Audit Expiry Manager
 *
 * After 30 days with no reply, audit pages are taken offline:
 *   - The HTML file is replaced with a "this audit has expired" page
 *   - The contact log entry is marked: status: 'no_reply', expiredAt: timestamp
 *   - The audit content (scores, notes, recommendations) is preserved in the log
 *   - A record is written to pipeline/data/expired.json for reporting
 *
 * Runs daily at 01:00 HKT via cron in route.js
 */

import fs   from 'fs';
import path from 'path';
import { findStaticFolder } from './find-static.js';

const DB_FILE      = path.resolve(process.cwd(), 'pipeline/data/contacted.json');
const EXPIRED_FILE = path.resolve(process.cwd(), 'pipeline/data/expired.json');
const EXPIRY_DAYS  = 30;

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadDb() {
  if (!fs.existsSync(DB_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); } catch { return {}; }
}

function saveDb(data) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function loadExpired() {
  if (!fs.existsSync(EXPIRED_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(EXPIRED_FILE, 'utf-8')); } catch { return []; }
}

function saveExpired(data) {
  fs.mkdirSync(path.dirname(EXPIRED_FILE), { recursive: true });
  fs.writeFileSync(EXPIRED_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function daysSince(isoString) {
  return (Date.now() - new Date(isoString).getTime()) / (1000 * 60 * 60 * 24);
}

function slugFromUrl(auditUrl) {
  // "https://jdcoredev.com/audits/tarmac-co" → "tarmac-co"
  return auditUrl?.split('/audits/')?.[1]?.replace(/\/$/, '') || null;
}

// ── Expired page HTML ─────────────────────────────────────────────────────────

function buildExpiredPage(companyName, expiredAt) {
  const date = new Date(expiredAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Audit Expired | JD CoreDev</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400&family=DM+Sans:wght@300;400&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100vh;
    background: #0a0a0a;
    color: #f5f3ef;
    font-family: 'DM Sans', sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 24px;
    text-align: center;
  }
  .top-bar {
    position: fixed; top: 0; left: 0; right: 0;
    background: #f6f8f7;
    padding: 14px 48px;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid #e8eae9;
  }
  .top-bar a { text-decoration: none; }
  .top-bar-brand {
    font-family: 'Syne', sans-serif;
    font-size: 16px; font-weight: 800;
    color: #111; letter-spacing: -0.02em;
  }
  .icon {
    width: 80px; height: 80px;
    border-radius: 20px;
    background: rgba(255,59,48,0.1);
    border: 1px solid rgba(255,59,48,0.2);
    display: flex; align-items: center; justify-content: center;
    font-size: 36px;
    margin: 0 auto 32px;
  }
  h1 {
    font-family: 'Syne', sans-serif;
    font-size: clamp(28px, 5vw, 48px);
    font-weight: 800;
    letter-spacing: -0.03em;
    margin-bottom: 16px;
  }
  .sub {
    font-size: 16px; color: #888;
    max-width: 420px; line-height: 1.7;
    margin-bottom: 8px;
  }
  .date {
    font-family: 'DM Mono', monospace;
    font-size: 11px; color: #555;
    letter-spacing: 0.1em; text-transform: uppercase;
    margin-bottom: 48px;
  }
  .cta {
    display: inline-flex; align-items: center; gap: 8px;
    background: #2d7a6b; color: #fff;
    font-family: 'Syne', sans-serif;
    font-size: 15px; font-weight: 700;
    padding: 14px 28px; border-radius: 8px;
    text-decoration: none;
    transition: opacity 0.2s;
  }
  .cta:hover { opacity: 0.85; }
</style>
</head>
<body>
  <div class="top-bar">
    <a href="https://jdcoredev.com">
      <span class="top-bar-brand">JD CoreDev</span>
    </a>
  </div>

  <div class="icon">⏱</div>
  <h1>This audit has expired</h1>
  <p class="sub">The audit prepared for <strong>${companyName}</strong> was available for 30 days after it was sent.</p>
  <p class="date">Expired ${date}</p>
  <a href="https://jdcoredev.com/contact" class="cta">Get in touch anyway →</a>
</body>
</html>`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runExpiryCheck() {
  const db = loadDb();
  const expired = loadExpired();
  const staticFolder = await findStaticFolder();

  let expiredCount = 0;
  const now = new Date().toISOString();

  for (const [domain, entry] of Object.entries(db)) {
    // Skip already expired, or manually marked as replied
    if (entry.status === 'no_reply' || entry.status === 'replied') continue;

    const age = daysSince(entry.contactedAt);
    if (age < EXPIRY_DAYS) continue;

    // ── 1. Replace audit page with expired placeholder ──────────────────────
    const slug = slugFromUrl(entry.auditUrl);
    if (slug) {
      const auditDir  = path.join(staticFolder, 'audits', slug);
      const indexFile = path.join(auditDir, 'index.html');

      if (fs.existsSync(indexFile)) {
        // Archive the original content before overwriting
        const archivePath = path.join(auditDir, 'audit-archived.html');
        if (!fs.existsSync(archivePath)) {
          fs.copyFileSync(indexFile, archivePath);
        }
        fs.writeFileSync(indexFile, buildExpiredPage(entry.name, now), 'utf-8');
        console.log(`[Expiry] Replaced audit page for ${entry.name} (${domain})`);
      }
    }

    // ── 2. Mark entry as no_reply in DB ─────────────────────────────────────
    db[domain] = {
      ...entry,
      status:    'no_reply',
      expiredAt: now,
    };

    // ── 3. Add to expired log ────────────────────────────────────────────────
    expired.push({
      domain,
      name:        entry.name,
      auditUrl:    entry.auditUrl,
      channel:     entry.channel,
      contactedAt: entry.contactedAt,
      expiredAt:   now,
      daysElapsed: Math.floor(age),
    });

    expiredCount++;
  }

  if (expiredCount > 0) {
    saveDb(db);
    saveExpired(expired);
    console.log(`[Expiry] ${expiredCount} audit(s) expired and taken offline`);
  } else {
    console.log('[Expiry] No audits due for expiry today');
  }

  return { expiredCount };
}

// ── Mark a company as replied (stops expiry clock) ───────────────────────────
export function markReplied(domain) {
  const db = loadDb();
  const norm = (domain || '').toLowerCase().replace(/^www\./, '').replace(/^https?:\/\//, '');
  if (db[norm]) {
    db[norm] = { ...db[norm], status: 'replied', repliedAt: new Date().toISOString() };
    saveDb(db);
    return true;
  }
  return false;
}

export function getExpiredAudits() {
  return loadExpired();
}
