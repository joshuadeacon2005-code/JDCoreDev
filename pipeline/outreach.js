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

  const prompt = `Rewrite this outreach to ${draft.company} in a different tone.

CURRENT SUBJECT: ${draft.subject}

CURRENT BODY:
${draft.body}

CURRENT DM:
${draft.shortMessage || "(none)"}

KEEP:
- Every specific observation about ${draft.company} (tool names, numbers, the actual problem)
- The audit URL
- The same call-to-action

${toneInstruction}

CONSTRAINTS — non-negotiable:
- Email body: 3 sentences max. No greeting beyond "Hi [name]," — no closing beyond "— Josh".
- Do NOT introduce JD CoreDev, do NOT explain what we do, do NOT mention "custom software".
- Banned phrases regardless of tone: "I came across", "I noticed", "your online presence", "your digital presence", "JD CoreDev specialises", "Ran a quick audit on", any reference to follower counts.
- If the original opens with "Hi [Name], I [verb]…" pattern, change the opener — don't just swap adjectives.

Return ONLY a valid JSON object, no markdown:
{
  "subject": "...",
  "body": "Email body with line breaks as \\n",
  "shortMessage": "DM with line breaks as \\n"
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

  const prompt = `You've audited ${lead.name}. Here's the data:

${auditContext}

Audit report URL: ${auditUrl}

Write a cold outreach email + a short WhatsApp/Instagram DM. The recipient runs ${lead.name}.

THE FORMULA — NOTHING OUTSIDE THIS:
1. ONE sentence stating the specific problem you found at THEIR business. Not a category, not a generic observation — the actual finding. Use a concrete detail (a tool name, a number, a missing piece) so they know you looked.
2. ONE sentence hinting that it's fixable. No pitch, no explanation of what you do, no mention of "custom software" or "building a system".
3. ONE sentence with the audit link + a low-friction ask (15-min call, no obligation).

THAT'S IT. THREE SENTENCES TOTAL FOR THE EMAIL BODY. No greeting beyond a one-word "Hi [first name]," — no closing beyond "— Josh".

HARD BANS — IF ANY OF THESE APPEAR, REWRITE:
- "I came across" / "I noticed" / "I was researching" / "I hope this finds you" — banned openers
- "Your online presence" / "your digital presence" — generic, banned
- Anything about Instagram follower counts or "X followers but Y" — that pattern is dead
- "Your Instagram is doing the heavy lifting" — banned, used too many times
- "JD CoreDev" / "our team" / "we specialise" / "we help businesses" — no introducing the company
- "Ran a quick audit on" as opener — overused, banned
- ANY sentence that could apply to another business in the same industry — must be ${lead.name}-specific
- More than 3 sentences in the email body — hard cap

${noWebsite ? `THE PROBLEM TO LEAD WITH: They have no website at all. Don't soften it — that's the lead.` : ''}
${biggestIssue ? `THE PROBLEM TO LEAD WITH: ${biggestIssue.title} — ${biggestIssue.description}. Make this concrete, not abstract.` : ''}
${subHook}

SUBJECT LINE: 5-7 words, references something specific to ${lead.name} (a tool they use, a section of their business, the actual problem). Never "Quick question about…" — banned.

WHATSAPP/DM: 2 sentences max. Same problem-first formula. No greeting, no signoff. Ends with the link.

Return ONLY a valid JSON object, no markdown:
{
  "subject": "...",
  "body": "Email body with line breaks as \\n",
  "shortMessage": "DM with line breaks as \\n"
}`;

  const response = await callAnthropic(prompt);
  return extractJson(response);
}
