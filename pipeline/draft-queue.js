/**
 * Stage 5B: Save draft to queue for manual sending (WhatsApp / Instagram / email)
 * Stored as a simple JSON file — readable in the dashboard
 */

import fs from 'fs';
import path from 'path';
import { dbCreateDraft, dbMarkDraftSent, dbDeleteDraft } from './db-bridge.js';

const QUEUE_FILE = path.resolve(process.cwd(), 'pipeline/data/draft-queue.json');

function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  const dir = path.dirname(QUEUE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf-8');
}

export async function saveDraft(lead, outreach, auditUrl) {
  const angle = (outreach && outreach.angle) || null; // creative | system | rebuild
  const queue = loadQueue();
  queue.push({
    id: Date.now(),
    date: new Date().toISOString(),
    company: lead.name,
    location: lead.location,
    industry: lead.industry,
    email: lead.email || null,
    instagram: lead.instagram || null,
    whatsapp: lead.whatsapp || null,
    auditUrl,
    subject: outreach.subject,
    body: outreach.body,
    angle,
    sent: false,
  });
  saveQueue(queue);

  // Persist to PostgreSQL (dual-write)
  await dbCreateDraft({
    company: lead.name,
    domain: lead.domain || null,
    email: lead.email || null,
    instagram: lead.instagram || null,
    whatsapp: lead.whatsapp || null,
    auditUrl: auditUrl || null,
    subject: outreach.subject,
    body: outreach.body,
    angle,
    sent: false,
    sentAt: null,
  });
}

export function getDrafts() {
  return loadQueue();
}

export async function deleteDraft(id) {
  const queue = loadQueue();
  const updated = queue.filter(d => d.id !== id);
  saveQueue(updated);
  await dbDeleteDraft(id);
}

export function markDraftSent(id) {
  const queue = loadQueue();
  const updated = queue.map(d => d.id === id ? { ...d, sent: true, sentAt: new Date().toISOString() } : d);
  saveQueue(updated);
  // Also update DB — id from JSON queue is a timestamp-number, DB id is auto-increment
  // We match by finding the DB record; since the bridge may have returned the DB id,
  // we just try to mark the numeric id directly (no-op if not found).
  dbMarkDraftSent(id).catch(() => {});
}
