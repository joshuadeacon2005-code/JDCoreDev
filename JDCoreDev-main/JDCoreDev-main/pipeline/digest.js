/**
 * JD CoreDev Lead Engine — Daily Digest
 *
 * Sends Josh a morning briefing email at 08:00 HKT containing:
 *   - Every audit generated in the last 24h with clickable links
 *   - Emails auto-sent (with subject lines)
 *   - Draft queue items needing manual send (with copy-ready messages)
 *   - Running total of companies contacted to date
 *
 * Triggered by the cron in route.js — no manual action needed.
 */

import { sendEmail } from './send-email.js';
import { getAllContacted, getRecentContacts } from './db.js';
import { getDrafts } from './draft-queue.js';
import fs from 'fs';
import path from 'path';

const JOSH_EMAIL = process.env.DIGEST_EMAIL || process.env.FROM_EMAIL || 'joshuad@jdcoredev.com';

// ── Date helpers ──────────────────────────────────────────────────────────────

function isToday(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
         d.getMonth()    === now.getMonth()    &&
         d.getDate()     === now.getDate();
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Hong_Kong',
  });
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    timeZone: 'Asia/Hong_Kong',
  });
}

function todayLabel() {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Asia/Hong_Kong',
  });
}

// ── Read last run log ─────────────────────────────────────────────────────────

function getLastRunSummary() {
  const logFile = path.resolve(process.cwd(), 'pipeline/data/run.log');
  if (!fs.existsSync(logFile)) return 'No run log found.';
  const lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean);
  // Return the last 20 lines
  return lines.slice(-20).join('\n');
}

// ── HTML email builder ────────────────────────────────────────────────────────

function buildDigestHtml({ todayContacts, pendingDrafts, allContactedCount, runLog }) {
  const hasActivity = todayContacts.length > 0 || pendingDrafts.length > 0;

  const auditRows = todayContacts.length > 0
    ? todayContacts.map(c => `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;font-weight:600;color:#111;font-size:14px">${c.name}</td>
        <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;color:#555;font-size:13px">${c.domain}</td>
        <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;font-size:13px">
          <span style="background:${c.channel === 'email' ? '#e8f5e9' : '#fff3e0'};color:${c.channel === 'email' ? '#2e7d32' : '#e65100'};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">
            ${c.channel === 'email' ? '✉ Emailed' : '📋 Draft'}
          </span>
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;font-size:13px">
          <a href="${c.auditUrl}" style="color:#2d7a6b;text-decoration:none;font-weight:600">
            View Audit →
          </a>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="4" style="padding:24px 16px;text-align:center;color:#999;font-size:13px">No audits generated today.</td></tr>`;

  const draftSection = pendingDrafts.length > 0 ? `
    <div style="margin-top:32px">
      <h2 style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:#111;margin:0 0 6px">
        📋 Manual Send Queue
        <span style="font-family:monospace;font-size:12px;font-weight:400;color:#999;margin-left:8px">${pendingDrafts.length} pending</span>
      </h2>
      <p style="font-size:13px;color:#777;margin:0 0 20px">These companies had no email found — send via WhatsApp or Instagram.</p>

      ${pendingDrafts.map((d, i) => `
      <div style="background:#fafafa;border:1px solid #e8e8e8;border-radius:12px;padding:24px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:4px">${d.company}</div>
            <div style="font-size:12px;color:#999;font-family:monospace">${d.industry} · ${d.location} · ${formatDate(d.date)}</div>
          </div>
          <a href="${d.auditUrl}" style="background:#2d7a6b;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;white-space:nowrap">
            View Audit →
          </a>
        </div>

        ${d.instagram ? `<div style="font-size:12px;color:#2d7a6b;margin-bottom:12px">📸 Instagram: <strong>${d.instagram}</strong></div>` : ''}

        <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:16px">
          <div style="font-size:11px;font-family:monospace;color:#999;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">Message Draft</div>
          <div style="font-size:13px;color:#333;line-height:1.7;white-space:pre-wrap">${d.body}</div>
        </div>
      </div>`).join('')}
    </div>` : '';

  const noActivityMsg = !hasActivity ? `
    <div style="text-align:center;padding:48px 24px;color:#999">
      <div style="font-size:40px;margin-bottom:16px">😴</div>
      <div style="font-size:16px;font-weight:600;color:#555;margin-bottom:8px">No activity yesterday</div>
      <div style="font-size:13px">The lead engine didn't run, or no new companies were found.</div>
    </div>` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">

  <div style="max-width:680px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08)">

    <!-- Header -->
    <div style="background:#f6f8f7;padding:28px 36px;border-bottom:1px solid #e8eae9;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:11px;font-family:monospace;color:#999;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px">JD CoreDev · Lead Engine</div>
        <div style="font-size:22px;font-weight:800;color:#111;letter-spacing:-0.03em">Daily Digest</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:13px;color:#555">${todayLabel()}</div>
        <div style="font-size:11px;font-family:monospace;color:#2d7a6b;margin-top:4px">${allContactedCount} total companies reached</div>
      </div>
    </div>

    <!-- Body -->
    <div style="padding:32px 36px">

      <!-- Stats row -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:32px">
        <div style="background:#f6f8f7;border-radius:10px;padding:16px 20px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#2d7a6b;line-height:1">${todayContacts.length}</div>
          <div style="font-size:11px;font-family:monospace;color:#999;text-transform:uppercase;letter-spacing:0.1em;margin-top:4px">Audits Today</div>
        </div>
        <div style="background:#f6f8f7;border-radius:10px;padding:16px 20px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#2d7a6b;line-height:1">${todayContacts.filter(c => c.channel === 'email').length}</div>
          <div style="font-size:11px;font-family:monospace;color:#999;text-transform:uppercase;letter-spacing:0.1em;margin-top:4px">Emails Sent</div>
        </div>
        <div style="background:#f6f8f7;border-radius:10px;padding:16px 20px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:${pendingDrafts.length > 0 ? '#e65100' : '#2d7a6b'};line-height:1">${pendingDrafts.length}</div>
          <div style="font-size:11px;font-family:monospace;color:#999;text-transform:uppercase;letter-spacing:0.1em;margin-top:4px">Drafts Pending</div>
        </div>
      </div>

      ${noActivityMsg}

      ${hasActivity ? `
      <!-- Audits table -->
      <h2 style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:#111;margin:0 0 16px">
        Today's Audits
      </h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #f0f0f0;border-radius:10px;overflow:hidden;margin-bottom:8px">
        <thead>
          <tr style="background:#fafafa">
            <th style="padding:10px 16px;text-align:left;font-size:10px;font-family:monospace;text-transform:uppercase;letter-spacing:0.12em;color:#999;border-bottom:1px solid #f0f0f0">Company</th>
            <th style="padding:10px 16px;text-align:left;font-size:10px;font-family:monospace;text-transform:uppercase;letter-spacing:0.12em;color:#999;border-bottom:1px solid #f0f0f0">Domain</th>
            <th style="padding:10px 16px;text-align:left;font-size:10px;font-family:monospace;text-transform:uppercase;letter-spacing:0.12em;color:#999;border-bottom:1px solid #f0f0f0">Status</th>
            <th style="padding:10px 16px;text-align:left;font-size:10px;font-family:monospace;text-transform:uppercase;letter-spacing:0.12em;color:#999;border-bottom:1px solid #f0f0f0">Audit</th>
          </tr>
        </thead>
        <tbody>${auditRows}</tbody>
      </table>

      ${draftSection}
      ` : ''}

      <!-- Log -->
      <details style="margin-top:32px">
        <summary style="font-size:12px;font-family:monospace;color:#999;cursor:pointer;letter-spacing:0.05em">▸ Pipeline log (last 20 lines)</summary>
        <pre style="font-size:11px;font-family:monospace;color:#666;background:#fafafa;border:1px solid #eee;border-radius:8px;padding:16px;margin-top:12px;overflow-x:auto;white-space:pre-wrap;line-height:1.6">${runLog}</pre>
      </details>
    </div>

    <!-- Footer -->
    <div style="background:#f6f8f7;padding:20px 36px;border-top:1px solid #e8eae9;display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:12px;color:#999">JD CoreDev Lead Engine · Auto-generated</div>
      <a href="https://jdcoredev.com/audits" style="font-size:12px;color:#2d7a6b;text-decoration:none;font-weight:600">View all audits →</a>
    </div>

  </div>
</body>
</html>`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function sendDailyDigest() {
  const allContacted   = getAllContacted();
  const todayContacts  = allContacted.filter(c => isToday(c.contactedAt));
  const allDrafts      = getDrafts();
  const pendingDrafts  = allDrafts.filter(d => !d.sent);
  const runLog         = getLastRunSummary();

  const subject = todayContacts.length > 0
    ? `☑ Lead Engine: ${todayContacts.length} audit${todayContacts.length > 1 ? 's' : ''} sent today · ${pendingDrafts.length} drafts pending`
    : `Lead Engine: No activity today · ${pendingDrafts.length} drafts pending`;

  const html = buildDigestHtml({
    todayContacts,
    pendingDrafts,
    allContactedCount: allContacted.length,
    runLog,
  });

  await sendEmail(JOSH_EMAIL, subject, null, html); // null plain text — HTML only
  console.log(`[Digest] Sent to ${JOSH_EMAIL} — ${todayContacts.length} audits, ${pendingDrafts.length} drafts`);
}
