/**
 * JD CoreDev — Lead Engine
 * Main entry point. Called by the Express route or cron.
 */

import { discoverLeads } from './discover.js';
import { auditCompany } from './audit.js';
import { generateAuditPage } from './generate-page.js';
import { writeOutreachDraft } from './outreach.js';
import { saveDraft } from './draft-queue.js';
import { alreadyContacted, markContacted } from './db.js';
import { log } from './logger.js';
import { dbGetSettings, dbGetAllAudits } from './db-bridge.js';

export async function runLeadEngine() {
  log('🚀 Lead Engine started');

  // ── Load settings from DB ──────────────────────────────────────────────────
  const savedSettings = await dbGetSettings();
  const engineSettings = savedSettings || {};

  // ── Stage 0: Load existing audits for deduplication ──────────────────────
  log('Stage 0: Loading existing audits for deduplication...');
  let existingAudits = [];
  try {
    existingAudits = await dbGetAllAudits();
    log(`✅ Found ${existingAudits.length} existing audit(s) — these will be excluded from discovery`);
    if (existingAudits.length > 0) {
      log(`   Known: ${existingAudits.map(a => a.name).slice(0, 8).join(', ')}${existingAudits.length > 8 ? ` …+${existingAudits.length - 8} more` : ''}`);
    }
  } catch (err) {
    log(`⚠️  Could not load existing audits for dedup (non-fatal): ${err.message}`);
  }
  const existingCompanies = existingAudits.map(a => ({ name: a.name, domain: a.domain })).filter(a => a.name);

  // ── Stage 1: Discover leads ────────────────────────────────────────────────
  log('Stage 1: Discovering leads (AI + web search)...');
  let leads;
  try {
    leads = await discoverLeads(engineSettings, existingCompanies);
  } catch (err) {
    log(`❌ Lead discovery failed: ${err.message}`);
    return { success: false, error: err.message };
  }
  log(`✅ Found ${leads.length} candidate lead(s)`);

  const results = [];

  for (const lead of leads) {
    if (globalThis._stopLeadEngine) {
      log('🛑 Lead Engine stopped by user request');
      break;
    }
    log(`\n── Processing: ${lead.name} (${lead.domain}) ──`);

    // ── Deduplication check (JSON + DB) ──────────────────────────────────────
    log(`   Checking ${lead.name} against existing audits…`);
    if (await alreadyContacted(lead.domain, lead.name)) {
      log(`⏭  DUPLICATE — skipping ${lead.name} (${lead.domain}), already audited`);
      results.push({ lead: lead.name, skipped: true, reason: 'already audited' });
      continue;
    }

    try {
      // ── Stage 2: Audit ───────────────────────────────────────────────────
      log(`Stage 2: Auditing ${lead.name}...`);
      const audit = await auditCompany(lead);
      log(`✅ Audit complete — overall score: ${audit.overallScore}/100`);

      // ── Stage 3: Generate page ───────────────────────────────────────────
      log(`Stage 3: Generating audit page...`);
      const auditUrl = await generateAuditPage(lead, audit);
      log(`✅ Live at: ${auditUrl}`);

      // ── Stage 4: Write outreach ──────────────────────────────────────────
      log(`Stage 4: Writing personalised outreach...`);
      const outreach = await writeOutreachDraft(lead, audit, auditUrl);

      // ── Stage 5: Save to draft queue (Gmail not yet configured) ─────────────
      log(`Stage 5: Saving to draft queue for manual review...`);
      await saveDraft(lead, outreach, auditUrl);
      await markContacted(lead.domain, lead.name, auditUrl, 'draft');

      results.push({
        lead: lead.name,
        domain: lead.domain,
        auditUrl,
        score: audit.overallScore,
        emailed: !!lead.email,
      });

    } catch (err) {
      log(`❌ Failed processing ${lead.name}: ${err.message}`);
      results.push({ lead: lead.name, error: err.message });
    }
  }

  const processed = results.filter(r => !r.skipped && !r.error).length;
  const skipped   = results.filter(r => r.skipped).length;
  const errors    = results.filter(r => r.error).length;
  log(`\n🏁 Lead Engine complete.`);
  log(`   ✅ Processed:          ${processed}`);
  log(`   ⏭  Duplicates skipped: ${skipped}`);
  log(`   ❌ Errors:             ${errors}`);

  return { success: true, results };
}
