/**
 * JD CoreDev Lead Engine — Deduplication
 *
 * Three-layer protection so no company is ever contacted twice:
 *
 *   Layer 1 — Exact domain match       e.g. tarmacco.hk
 *   Layer 2 — Normalised domain match  e.g. www.tarmacco.hk == tarmacco.hk
 *   Layer 3 — Fuzzy name match         e.g. "Tarmac & Co" == "Tarmac and Co HK"
 *
 * All contacts logged to pipeline/data/contacted.json
 * Human-readable log appended to pipeline/data/contact-log.txt
 */

import fs from 'fs';
import path from 'path';
import { dbUpsertAudit, dbUpdateAuditStatus, dbDeleteAudit, dbGetAllAudits } from './db-bridge.js';

const DB_FILE  = path.resolve(process.cwd(), 'pipeline/data/contacted.json');
const LOG_FILE = path.resolve(process.cwd(), 'pipeline/data/contact-log.txt');

// ── File helpers ──────────────────────────────────────────────────────────────

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function load() {
  if (!fs.existsSync(DB_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); }
  catch { return {}; }
}

function save(data) {
  ensureDir(DB_FILE);
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function appendLog(line) {
  ensureDir(LOG_FILE);
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8');
}

// ── Normalisation helpers ─────────────────────────────────────────────────────

/**
 * Normalise a domain for comparison.
 * "https://WWW.Tarmacco.hk/" → "tarmacco.hk"
 */
function normaliseDomain(raw) {
  return (raw || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim();
}

/**
 * Normalise a company name for fuzzy matching.
 * "Tarmac & Co. HK Ltd." → "tarmac co hk"
 */
function normaliseName(raw) {
  return (raw || '')
    .toLowerCase()
    .replace(/[&+]/g, ' and ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(ltd|limited|llc|inc|co|corp|hk|hong kong|sg|singapore|my|malaysia)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Token-overlap similarity (Jaccard index).
 * Returns 0–1. Threshold 0.6 catches "Tarmac Co" vs "Tarmac & Co HK".
 */
function nameSimilarity(a, b) {
  const setA = new Set(normaliseName(a).split(' ').filter(Boolean));
  const setB = new Set(normaliseName(b).split(' ').filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = [...setA].filter(t => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

const SIMILARITY_THRESHOLD = 0.6;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Full deduplication check — returns detail on why a match was found.
 * Used internally and by the route's /status endpoint.
 */
export function checkAlreadyContacted(domain, name) {
  const db = load();
  const normDomain = normaliseDomain(domain);

  for (const [storedDomain, entry] of Object.entries(db)) {
    // Layers 1 & 2: exact or normalised domain match
    if (normaliseDomain(storedDomain) === normDomain) {
      return {
        contacted: true,
        reason: `Domain match: "${storedDomain}" (contacted ${entry.contactedAt?.slice(0, 10)})`,
        matchedEntry: entry,
      };
    }

    // Layer 3: fuzzy company name match
    const similarity = nameSimilarity(name, entry.name);
    if (similarity >= SIMILARITY_THRESHOLD) {
      return {
        contacted: true,
        reason: `Name similarity ${(similarity * 100).toFixed(0)}% with "${entry.name}" (contacted ${entry.contactedAt?.slice(0, 10)})`,
        matchedEntry: entry,
      };
    }
  }

  return { contacted: false, reason: null, matchedEntry: null };
}

/**
 * Async drop-in — used in pipeline/index.js
 * Checks both the local JSON file AND the PostgreSQL DB so dedup survives
 * redeployments (which wipe the JSON file from disk).
 */
export async function alreadyContacted(domain, name = '') {
  // Layer A: check local JSON file (fast, in-process)
  const result = checkAlreadyContacted(domain, name);
  if (result.contacted) {
    console.log(`[Dedup] BLOCKED (JSON): ${name} (${domain}) — ${result.reason}`);
    return true;
  }

  // Layer B: check PostgreSQL DB (survives redeploys — authoritative source)
  const normDomain = normaliseDomain(domain);
  try {
    const allAudits = await dbGetAllAudits();
    for (const audit of allAudits) {
      // Domain match
      if (normaliseDomain(audit.domain) === normDomain) {
        console.log(`[Dedup] BLOCKED (DB): ${name} (${domain}) — domain match with "${audit.name}"`);
        return true;
      }
      // Fuzzy name match
      const similarity = nameSimilarity(name, audit.name);
      if (similarity >= SIMILARITY_THRESHOLD) {
        console.log(`[Dedup] BLOCKED (DB): ${name} (${domain}) — name similarity ${(similarity * 100).toFixed(0)}% with "${audit.name}"`);
        return true;
      }
    }
  } catch (err) {
    console.error(`[Dedup] DB check error (non-fatal): ${err.message}`);
  }

  return false;
}

/**
 * Mark a company as contacted. Call this AFTER email is sent or draft is saved.
 */
export async function markContacted(domain, name, auditUrl, channel = 'email', extra = {}) {
  const db = load();
  const normDomain = normaliseDomain(domain);

  const entry = {
    name,
    domain: normDomain,
    auditUrl,
    channel,
    contactedAt: new Date().toISOString(),
  };

  db[normDomain] = entry;
  save(db);

  const logLine = `[${entry.contactedAt}] CONTACTED | ${name} | ${normDomain} | ${channel} | ${auditUrl}`;
  appendLog(logLine);
  console.log(`[Dedup] ${logLine}`);

  // Persist to PostgreSQL (dual-write)
  await dbUpsertAudit({
    name,
    domain: normDomain,
    location: extra.location || null,
    industry: extra.industry || null,
    auditUrl: auditUrl || null,
    channel,
    status: 'draft',
  });
}

/**
 * All contacted companies, sorted newest first.
 */
export function getAllContacted() {
  return Object.values(load()).sort(
    (a, b) => new Date(b.contactedAt) - new Date(a.contactedAt)
  );
}

export function getContactedCount() {
  return Object.keys(load()).length;
}

export async function deleteContacted(domain) {
  const db = load();
  const normDomain = normaliseDomain(domain);
  delete db[normDomain];
  save(db);
  await dbDeleteAudit(normDomain);
}

/**
 * Companies contacted in the last N days — used by dashboard.
 */
export function getRecentContacts(days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return getAllContacted().filter(e => new Date(e.contactedAt) > cutoff);
}
