/**
 * Stage 2: Audit a single company using Claude + web search
 *
 * Handles all presence states:
 *   - Full website + socials (normal case)
 *   - No website but has social/Google presence
 *   - Minimal presence (WhatsApp only, word of mouth, etc.)
 *   - Partial presence (some platforms missing)
 *
 * Uses Claude + web_search for reliable local business lookup.
 */

import { callAnthropic } from './anthropic-client.js';

function extractJson(response) {
  let text = response.replace(/```json|```/g, '').trim();
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`No JSON object in response: ${text.slice(0, 120)}`);
  return JSON.parse(text.slice(start, end + 1));
}

function buildAuditPrompt(lead) {
  return `You are a digital consultant auditing a business for JD CoreDev — a software consultancy in Hong Kong that builds custom systems for businesses with AI built right in. Think automations, internal tools, booking systems that manage themselves, CRMs that draft follow-ups, chatbots trained on the business — the kind of thing most owners didn't know was affordable for a company their size.

JD CoreDev's core pitch: instead of renting 3–5 separate software tools that don't talk to each other, we build one system the business actually owns — tailored to exactly how they already operate, with everything integrated. No monthly rent, no data lock-in, no platform limits.

Audit this company thoroughly. You MUST use web search multiple times — do not rely on your training data.

Company to audit:
- Name: ${lead.name}
- Domain hint: ${lead.domain || 'unknown'}
- Website hint: ${lead.website || 'unknown — you MUST search for this'}
- Instagram hint: ${lead.instagram || 'unknown — search for it'}
- Industry: ${lead.industry}
- Location: ${lead.location}

STEP 1 — MANDATORY WEBSITE VERIFICATION (do this first, before anything else):
Run these web searches in order and report what you actually find:
1. Search: "${lead.name} Hong Kong" — look for their official website in results
2. Search: "${lead.domain || lead.name}" — check if the domain is live
3. Search: "${lead.name} website Hong Kong" — find any web presence
4. Visit any URL you find and confirm it is live and belongs to this company
If you find a live website, set hasWebsite: true and record the URL.
If every search returns nothing or a parked/dead domain, set hasWebsite: false.
NEVER assume hasWebsite is true without confirming the URL loads.
NEVER assume hasWebsite is false without running at least 3 searches.

STEP 2 — MANDATORY GOOGLE BUSINESS PROFILE SEARCH (do this second):
Run ALL of these searches — do not skip any:
1. Search: "${lead.name} Google Business Profile Hong Kong"
2. Search: "${lead.name} ${lead.industry} Hong Kong Google Maps"
3. Search: "${lead.name} Hong Kong reviews"
4. Search: site:google.com/maps "${lead.name}"
5. Search: "${lead.name} g.page" or "${lead.name} maps.app.goo.gl"
Also search: "${lead.industry} ${(lead.location || 'Hong Kong').replace('Hong Kong', '').trim() || 'Hong Kong'} site:google.com/maps" and check if this company appears

From these searches determine:
- Is there a Google Business Profile? (Claimed / Unclaimed / None found)
- Star rating and review count (if visible in search results)
- Whether photos/hours/posts are present
- Whether the profile looks active or neglected

STEP 3 — SOCIAL MEDIA:
Search for their presence on Instagram, Facebook, and LinkedIn.

STEP 4 — SUBSCRIPTION SOFTWARE AUDIT (critical — this is the core of our pitch):
This company is almost certainly paying monthly rent to several different software platforms they don't own, can't customise, and can't easily leave. Your job is to find every single one.

Search aggressively for what third-party software tools this company uses across these categories:

BOOKING / SCHEDULING:
Search: "${lead.name} book now" OR "${lead.name} reserve" OR "${lead.name} schedule"
Check their website and Instagram bio for tools like:
Fresha, Vagaro, Booksy, Mindbody, Acuity Scheduling, Calendly, SimplyBook.me,
Square Appointments, Setmore, Treatwell, TableCheck, OpenTable, Chope, Eatigo,
FareHarbor, Rezdy, Eventbrite, ClassPass, FitSense, HubSpot Meetings

CRM / CLIENT MANAGEMENT:
Search: "${lead.name} CRM" OR look at their website footer/stack signals for:
Salesforce, HubSpot, Zoho CRM, Pipedrive, Monday.com, Notion, Airtable, Freshsales

EMAIL MARKETING / AUTOMATION:
Look for unsubscribe footers, email tool watermarks, or stack signals for:
Mailchimp, Klaviyo, ActiveCampaign, Constant Contact, Brevo (Sendinblue), ConvertKit, Drip

E-COMMERCE / POINT OF SALE:
Look for platform footers, checkout pages, or store signals for:
Shopify, WooCommerce, Square POS, Lightspeed, Toast POS, Revel, Vend

LOYALTY / MEMBERSHIP:
Search: "${lead.name} loyalty" OR "${lead.name} membership" for tools like:
Stamped, Smile.io, LoyaltyLion, Glofox, Mindbody memberships, Momence

ACCOUNTING / PAYMENTS:
Look for mentions of: Xero, QuickBooks, FreshBooks, Wave, Stripe, PayPal, HitPay

OTHER (HR, project management, etc.):
Slack, Asana, ClickUp, Trello, Jira, Gusto, BambooHR

For each tool you identify:
1. Search: "[tool name] pricing [current year]" to find the plan they would realistically be on
2. Convert to HKD (1 USD ≈ 7.8 HKD) if needed
3. Note whether it's flat monthly, per-seat, or revenue percentage
4. Consider the data lock-in and customisation limits specific to that platform

STEP 5 — INFRASTRUCTURE SUMMARY:
After identifying all subscription software, assess:
- Do their tools talk to each other, or is data siloed across platforms?
- Is there any automation or are staff manually bridging systems?
- What's the estimated total monthly software spend?

IMPORTANT RULES:
1. Only report what you actually FIND via web search. Never hallucinate or assume.
2. If you cannot find a website, set hasWebsite: false and explain what you found instead.
3. If a social platform is not found, use status: "None found", dot: "dot-none".
4. A company with NO website is actually a GREAT lead — frame their website section as a missed opportunity, not a potential failure.
5. Score the website 0/10 if none exists (this is accurate and creates urgency in the audit).
6. growthScore should be HIGH (8–10) when a company has no website or weak infrastructure — they have the most to gain.
7. For Google Business: if your searches show NO evidence of a Google Business Profile, set status to "None found".
8. Recommendations should always hint at consolidation — the idea that a single owned system could replace the patchwork of rented tools they're currently using.

Return ONLY a valid JSON object, no markdown, no explanation:

{
  "hasWebsite": true,
  "websiteUrl": "https://example.com or null if none found",

  "overallScore": 42,

  "website": {
    "score": 5,
    "noWebsiteNote": "Only populate this field if hasWebsite is false. Write a 1–2 sentence explanation of what was found instead. Leave as null if hasWebsite is true.",
    "design":  { "score": 4, "note": "Generic Wix template, no brand personality." },
    "mobile":  { "score": 7, "note": "Responsive but slow on mobile." },
    "speed":   { "score": 4, "note": "Multiple unoptimised images." },
    "cta":     { "score": 3, "note": "No clear CTA on homepage." },
    "seo":     { "score": 2, "note": "No meta tags, no sitemap." }
  },

  "social": {
    "score": 6,
    "instagram":     { "status": "Active",    "dot": "dot-active", "note": "Posts 3x/week, 2.1k followers" },
    "facebook":      { "status": "Inactive",  "dot": "dot-weak",   "note": "Last post 8 months ago" },
    "linkedin":      { "status": "None",      "dot": "dot-none",   "note": "No company page found" },
    "googleBusiness":{ "status": "Claimed",   "dot": "dot-active", "note": "4.3 stars, 28 reviews, 14 photos, last response 2 weeks ago" }
  },

  "infrastructure": {
    "score": 2,
    "booking":    { "status": "Third-party (Fresha)", "class": "infra-basic", "note": "Uses Fresha — estimated HK$390/mo in transaction fees. Customer data belongs to Fresha, not the business." },
    "crm":        { "status": "HubSpot (Free)",       "class": "infra-basic", "note": "Free HubSpot tier detected — limited to 1,000 contacts and basic pipeline only." },
    "automation": { "status": "Mailchimp",            "class": "infra-basic", "note": "Mailchimp detected — Standard plan ~HK$390/mo. Not integrated with booking or CRM." },
    "ecommerce":  { "status": "Shopify",              "class": "infra-basic", "note": "Shopify Basic — HK$242/mo plus 2% transaction fee on all sales." }
  },

  "subscriptionSoftware": [
    {
      "category": "Booking",
      "name": "Fresha",
      "url": "https://fresha.com",
      "estimatedMonthlyHKD": 390,
      "pricingNote": "Fresha charges a 2.19% transaction fee on all online bookings plus card processing fees. For a salon processing HK$100k/month this is roughly HK$2,200+/month.",
      "ownershipProblem": "The customer database belongs to Fresha. Leaving the platform means losing booking history and client contact records. Cannot customise the booking flow, send branded communications, or connect to other tools.",
      "lockInRisk": "High"
    },
    {
      "category": "Email Marketing",
      "name": "Mailchimp",
      "url": "https://mailchimp.com",
      "estimatedMonthlyHKD": 390,
      "pricingNote": "Standard plan for up to 500 contacts starts at ~US$20/mo (HK$156). Scales steeply — 5k contacts is US$75/mo.",
      "ownershipProblem": "Email list and templates are locked in Mailchimp. No native connection to their booking system — staff must manually export/import data. Every subscriber tier jump raises the monthly bill.",
      "lockInRisk": "Medium"
    }
  ],

  "subscriptionSummary": {
    "totalMonthlyHKD": 1500,
    "toolCount": 4,
    "integrationGaps": "Booking, email, and CRM are three separate tools with no data sync. Staff manually move information between systems.",
    "consolidationOpportunity": "A single owned system could handle bookings, client records, automated follow-ups, and payments — built around how this business actually operates, with no monthly rent and no data lock-in."
  },

  "growthScore": 8,

  "recommendations": [
    {
      "title": "Short specific title",
      "description": "2–3 sentences specific to this company. If they use multiple subscription tools, point out the fragmentation and hint that a unified owned system would eliminate both the cost and the manual work of bridging them.",
      "impact": "High"
    },
    {
      "title": "Short specific title",
      "description": "2–3 sentences specific to this company.",
      "impact": "High"
    },
    {
      "title": "Short specific title",
      "description": "2–3 sentences specific to this company.",
      "impact": "Medium"
    }
  ],

  "auditSummary": "1–2 sentences summarising the biggest opportunity for JD CoreDev with this specific company. If they use multiple subscription tools, mention the total monthly spend and the consolidation opportunity.",

  "headline": "ONE punchy sentence (max 18 words) stating the SPECIFIC, named problem at THIS company. Must reference a real tool, number, or detail you found — never generic. This becomes the hero callout on the audit page. Examples of GOOD headlines (don't copy these — they belong to other businesses): 'Fresha takes 2.19% of every booking and owns your entire client list.' / 'No website at all — every \"florist Causeway Bay\" search goes to a competitor.' / 'Three subscription tools costing HK$1,500/mo, none of them connected.' Examples of BAD headlines: 'Your digital presence has room to grow.' / 'Several improvements possible.' / 'Mixed results across our audit.'"
}

NOTES ON subscriptionSoftware:
- Only include tools you actually detected via search — do not fabricate entries
- If no subscription software is found at all, return an empty array []
- Each entry must have a real researched pricing note — not a guess
- lockInRisk: "High" = data lock-in or high switching cost, "Medium" = portable but annoying, "Low" = easy to replace
- The consolidationOpportunity in subscriptionSummary should be specific to this company's situation — what their custom system would actually do for them, not generic JD CoreDev marketing

NOTES ON infrastructure fields:
- booking/crm/automation/ecommerce notes should reference the specific tool detected if any
- class values: "infra-active" (custom/owned), "infra-basic" (third-party tool), "infra-none" (nothing detected)

SCORING GUIDE FOR NO-WEBSITE COMPANIES:
- Set hasWebsite: false, websiteUrl: null
- Set noWebsiteNote to what you found instead
- All website sub-scores: 0, website.score: 0
- overallScore: 20–35
- growthScore: 9 or 10
- Recommendation 1 should ALWAYS be "Build a professional website"
- Audit summary should be optimistic: untapped potential, not a failure`;
}

export async function auditCompany(lead) {
  const response = await callAnthropic(buildAuditPrompt(lead), true); // true = use web_search
  const audit = extractJson(response);

  // Safety defaults — ensure all required fields exist
  audit.hasWebsite = audit.hasWebsite ?? true;
  audit.websiteUrl = audit.websiteUrl ?? lead.website ?? null;

  audit.website = audit.website ?? {};
  audit.website.score = audit.website.score ?? 0;
  audit.website.noWebsiteNote = audit.website.noWebsiteNote ?? null;
  audit.website.design    = audit.website.design    ?? { score: 0, note: 'Not assessed' };
  audit.website.mobile    = audit.website.mobile    ?? { score: 0, note: 'Not assessed' };
  audit.website.speed     = audit.website.speed     ?? { score: 0, note: 'Not assessed' };
  audit.website.cta       = audit.website.cta       ?? { score: 0, note: 'Not assessed' };
  audit.website.seo       = audit.website.seo       ?? { score: 0, note: 'Not assessed' };

  audit.social = audit.social ?? {};
  audit.social.score = audit.social.score ?? 0;
  const noSocial = { status: 'None found', dot: 'dot-none', note: 'Not found during research' };
  audit.social.instagram     = audit.social.instagram     ?? noSocial;
  audit.social.facebook      = audit.social.facebook      ?? noSocial;
  audit.social.linkedin      = audit.social.linkedin      ?? noSocial;
  audit.social.googleBusiness= audit.social.googleBusiness?? noSocial;

  audit.infrastructure = audit.infrastructure ?? {};
  audit.infrastructure.score = audit.infrastructure.score ?? 0;
  const noInfra = { status: 'None detected', class: 'infra-none', note: 'Not detected' };
  audit.infrastructure.booking    = audit.infrastructure.booking    ?? noInfra;
  audit.infrastructure.crm        = audit.infrastructure.crm        ?? noInfra;
  audit.infrastructure.automation = audit.infrastructure.automation ?? noInfra;
  audit.infrastructure.ecommerce  = audit.infrastructure.ecommerce  ?? noInfra;

  // Subscription software defaults
  audit.subscriptionSoftware = audit.subscriptionSoftware ?? [];
  audit.subscriptionSummary  = audit.subscriptionSummary  ?? {
    totalMonthlyHKD: 0,
    toolCount: 0,
    integrationGaps: null,
    consolidationOpportunity: null,
  };

  audit.growthScore    = audit.growthScore    ?? 5;
  audit.overallScore   = audit.overallScore   ?? 30;
  audit.recommendations= audit.recommendations?? [];
  audit.auditSummary   = audit.auditSummary   ?? '';
  audit.headline       = audit.headline       ?? null;

  return audit;
}
