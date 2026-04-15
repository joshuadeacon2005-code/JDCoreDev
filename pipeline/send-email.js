/**
 * Email sender via Resend
 * Sends outreach emails from the address configured in pipeline/data/settings.json
 */

import fs from 'fs';
import path from 'path';

function getResendApiKey() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('Resend not connected — add RESEND_API_KEY to your secrets');
  return key;
}

function getSettings() {
  try {
    const file = path.resolve(process.cwd(), 'pipeline/data/settings.json');
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {}
  return {};
}

export async function sendEmail(to, subject, body) {
  const apiKey = await getResendApiKey();
  const s = getSettings();
  const fromEmail = s.fromEmail || 'joshuad@jdcoredev.com';
  const replyTo  = s.replyTo  || null;

  const payload = {
    from: `Joshua @ JD CoreDev <${fromEmail}>`,
    to,
    subject,
    text: body,
  };
  if (replyTo) payload.reply_to = replyTo;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Resend error ${resp.status}: ${err}`);
  }
  return await resp.json();
}
