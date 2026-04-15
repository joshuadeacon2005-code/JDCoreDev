/**
 * Stage 4: Generate personalised outreach email + WhatsApp/Instagram message
 *
 * Style: short, direct, problem-first. Name one real issue, hint at the fix,
 * ask for a call. No intro about JD CoreDev. No fluff.
 *
 * Core angle: if they're using multiple subscription tools, imply that a single
 * owned system could replace all of them — built around how they already work.
 */

import { callAnthropic } from './anthropic-client.js';

function extractJson(response) {
  let text = response.replace(/```json|```/g, '').trim();
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`No JSON object in response: ${text.slice(0, 120)}`);
  return JSON.parse(text.slice(start, end + 1));
}

function buildAuditContext(lead, audit) {
  const lines = [];

  lines.push(`Company: ${lead.name}`);
  lines.push(`Industry: ${lead.industry}`);
  if (lead.website)   lines.push(`Website: ${lead.website}`);
  if (lead.instagram) lines.push(`Instagram: ${lead.instagram}`);
  lines.push(`Overall digital score: ${audit.overallScore}/100`);
  lines.push('');

  if (!audit.hasWebsite) {
    lines.push(`WEBSITE: NONE DETECTED`);
    if (audit.website.noWebsiteNote) lines.push(`  Note: ${audit.website.noWebsiteNote}`);
  } else {
    lines.push(`WEBSITE (score ${audit.website.score}/10):`);
    lines.push(`  Design: ${audit.website.design.score}/10 — ${audit.website.design.note}`);
    lines.push(`  Mobile: ${audit.website.mobile.score}/10 — ${audit.website.mobile.note}`);
    lines.push(`  Speed:  ${audit.website.speed.score}/10 — ${audit.website.speed.note}`);
    lines.push(`  CTA:    ${audit.website.cta.score}/10 — ${audit.website.cta.note}`);
    lines.push(`  SEO:    ${audit.website.seo.score}/10 — ${audit.website.seo.note}`);
  }

  lines.push('');
  lines.push(`SOCIAL (score ${audit.social.score}/10):`);
  lines.push(`  Instagram:       ${audit.social.instagram.status} — ${audit.social.instagram.note}`);
  lines.push(`  Google Business: ${audit.social.googleBusiness.status} — ${audit.social.googleBusiness.note}`);

  lines.push('');
  lines.push(`INFRASTRUCTURE (score ${audit.infrastructure.score}/10):`);
  lines.push(`  Booking:    ${audit.infrastructure.booking.status} — ${audit.infrastructure.booking.note}`);
  lines.push(`  CRM:        ${audit.infrastructure.crm.status} — ${audit.infrastructure.crm.note}`);
  lines.push(`  Automation: ${audit.infrastructure.automation.status} — ${audit.infrastructure.automation.note}`);
  lines.push(`  Ecommerce:  ${audit.infrastructure.ecommerce.status} — ${audit.infrastructure.ecommerce.note}`);

  // Subscription software breakdown
  const subs = audit.subscriptionSoftware ?? [];
  if (subs.length > 0) {
    lines.push('');
    lines.push(`SUBSCRIPTION SOFTWARE DETECTED (${subs.length} tool${subs.length > 1 ? 's' : ''}):`);
    subs.forEach(s => {
      lines.push(`  [${s.category}] ${s.name} — est. HK$${(s.estimatedMonthlyHKD ?? 0).toLocaleString()}/mo`);
      if (s.pricingNote)       lines.push(`    Cost detail: ${s.pricingNote}`);
      if (s.ownershipProblem)  lines.push(`    Lock-in: ${s.ownershipProblem}`);
    });

    const summary = audit.subscriptionSummary;
    if (summary?.totalMonthlyHKD) {
      lines.push('');
      lines.push(`  TOTAL ESTIMATED MONTHLY SPEND: HK$${summary.totalMonthlyHKD.toLocaleString()}`);
    }
    if (summary?.integrationGaps) {
      lines.push(`  INTEGRATION GAPS: ${summary.integrationGaps}`);
    }
    if (summary?.consolidationOpportunity) {
      lines.push(`  CONSOLIDATION OPPORTUNITY: ${summary.consolidationOpportunity}`);
    }
  }

  lines.push('');
  lines.push(`TOP ISSUES (from audit recommendations):`);
  (audit.recommendations || []).slice(0, 3).forEach((r, i) => {
    lines.push(`  ${i + 1}. [${r.impact} impact] ${r.title} — ${r.description}`);
  });

  lines.push('');
  lines.push(`AUDIT SUMMARY: ${audit.auditSummary}`);

  return lines.join('\n');
}

const TONE_INSTRUCTIONS = {
  casual:   "Tone: conversational, like a message from someone who genuinely looked at their business. Natural and direct — not corporate.",
  formal:   "Tone: professional and polished. Business-appropriate language. Still short and to the point.",
  direct:   "Tone: ultra-direct. No pleasantries, straight to the problem. Confident and punchy.",
  friendly: "Tone: warm but still direct. Genuinely interested in their situation. Not salesy.",
  urgent:   "Tone: creates a sense of missed opportunity without being aggressive. The problem is costing them right now.",
};

export async function rewriteWithTone(draft, tone) {
  const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.casual;

  const prompt = `You are Josh D, founder of JD CoreDev — a Hong Kong software consultancy.

You previously wrote this outreach to ${draft.company}:

SUBJECT: ${draft.subject}

BODY:
${draft.body}

SHORT MESSAGE:
${draft.shortMessage || "(none)"}

Rewrite this outreach with a different tone. Keep:
- Every specific detail and observation about ${draft.company}
- The audit URL
- The same core problem being called out
- The same call-to-action (book a call)
- Sender: Josh / JD CoreDev

${toneInstruction}

Keep it SHORT — 4 sentences max for the email body. No fluff, no lengthy explanations of what JD CoreDev does.

Return ONLY a valid JSON object, no markdown:
{
  "subject": "...",
  "body": "Full email body with line breaks as \\n",
  "shortMessage": "Short WhatsApp/Instagram DM version with line breaks as \\n"
}`;

  const response = await callAnthropic(prompt);
  return extractJson(response);
}

export async function writeOutreachDraft(lead, audit, auditUrl) {
  const auditContext = buildAuditContext(lead, audit);

  const noWebsite    = !audit.hasWebsite;
  const hasInsta     = audit.social.instagram.status?.toLowerCase().includes('active');
  const biggestIssue = audit.recommendations?.[0];
  const subs         = audit.subscriptionSoftware ?? [];
  const subSummary   = audit.subscriptionSummary  ?? {};
  const hasSubSoftware = subs.length > 0;

  // Build a subscription software hook if applicable
  let subHook = '';
  if (hasSubSoftware) {
    const names     = subs.map(s => s.name).join(', ');
    const totalCost = subSummary.totalMonthlyHKD
      ? `HK$${subSummary.totalMonthlyHKD.toLocaleString()}/month`
      : 'a combined monthly fee';
    subHook = `SUBSCRIPTION SOFTWARE HOOK: They are paying ${totalCost} across ${subs.length} separate tool${subs.length > 1 ? 's' : ''} (${names}) that they don't own and can't customise. The data in each tool is siloed. ${subSummary.integrationGaps ? subSummary.integrationGaps + ' ' : ''}This is a powerful angle — they are essentially renting an incomplete, fragmented version of a system they could own outright. If using this hook: don't list every tool — pick the most surprising or costly one and use it as the specific opening observation. The implication (not the pitch) is that a single system built around how they already work could replace all of it.`;
  }

  const prompt = `You are Josh D, founder of JD CoreDev, a software consultancy in Hong Kong.

You've just audited ${lead.name}'s digital presence. Here's what you found:

${auditContext}

The live audit report is at: ${auditUrl}

Write a cold outreach email and a short WhatsApp/Instagram DM.

YOUR STYLE — THIS IS NON-NEGOTIABLE:
- Open by naming ONE specific, real problem you found — make it feel like you actually looked at their business, not a template
- Do NOT introduce yourself or explain what JD CoreDev does upfront — that's for the call
- One sentence hinting at the fix is enough — do NOT elaborate or list everything you can do
- End with a single, low-friction ask: a quick call to walk through the report
- 4 sentences max for the email body. SHORT. Punchy. No padding.
- No "I hope this finds you well", no "I wanted to reach out", no "your online presence" — banned phrases
- Subject line: specific to this company, curiosity-driven, never generic

${noWebsite ? `KEY FINDING: This company has NO website at all. That's the lead problem — frame it as the single biggest thing holding them back right now.` : ''}
${biggestIssue ? `BIGGEST ISSUE TO LEAD WITH: ${biggestIssue.title} — ${biggestIssue.description}` : ''}
${hasInsta ? `HOOK OPTION: Their Instagram presence is active — you can use that as the opening observation before pivoting to the gap.` : ''}
${subHook}

THE OWNED SYSTEM ANGLE (use this when subscription software is detected):
The idea to imply — not pitch explicitly — is that they could have one system that does everything they need, built around how they already operate. No monthly rent to three different platforms. No staff manually moving data between tools. No limits on what they can customise. Just their business, working the way it should.
Do NOT say "custom software" or "we'll build you a system" — that's for the call. The email just makes them feel the gap between what they have and what's possible.

EXAMPLES OF THE STYLE WE WANT:
✓ "Your Instagram does the heavy lifting — but there's no booking system catching any of that attention."
✓ "Ran a quick audit on [Company] — Google can't find you, which means every search for [industry] in Hong Kong is going to a competitor."
✓ "You're paying Fresha a cut of every booking and your client data sits in their database, not yours."
✓ "Three separate tools, none of them talking to each other — your team is the integration layer right now."
✗ NEVER: "I came across your business and was impressed by your presence..."
✗ NEVER: "JD CoreDev specialises in building custom systems for businesses like yours..."
✗ NEVER: Multiple paragraphs explaining services

WHATSAPP/DM: 2 sentences only. Same energy — punchy, specific, ends with the audit link.

Return ONLY a valid JSON object, no markdown:
{
  "subject": "...",
  "body": "Full email body with line breaks as \\n",
  "shortMessage": "Short WhatsApp/Instagram DM with line breaks as \\n"
}`;

  const response = await callAnthropic(prompt);
  return extractJson(response);
}
