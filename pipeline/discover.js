/**
 * Stage 1: Discover leads using Claude + web search
 * Settings are passed in from the caller (loaded from DB in index.js).
 */

import { callAnthropic } from './anthropic-client.js';

function buildPrompt(settings, existingCompanies = []) {
  const industryList  = settings.industries.join(', ');
  const signalList    = settings.signals.map(s => `- ${s}`).join('\n');
  const exclusionList = settings.exclusions.map(s => `- ${s}`).join('\n');
  const count         = settings.count || 5;

  const alreadyAuditedSection = existingCompanies.length > 0
    ? `\n⛔ COMPANIES ALREADY AUDITED — DO NOT SUGGEST THESE (any of them, or anything similar):\n${existingCompanies.map(c => `- ${c.name}${c.domain ? ` (${c.domain})` : ''}`).join('\n')}\nThis list is exhaustive. Any result that matches a company above by name or domain will be rejected.\n`
    : '';

  return `You are a business development researcher for JD CoreDev, a boutique software consultancy based in Hong Kong that builds custom CRM systems, booking platforms, and digital infrastructure.

Your task: Find ${count} NEW real businesses that are strong candidates for JD CoreDev's services.${alreadyAuditedSection}

⚠️ STRICT GEOGRAPHIC RULE — THIS IS MANDATORY:
Every single business MUST be physically located and operating in HONG KONG (SAR, China).
Do NOT include businesses from Singapore, Malaysia, Macau, mainland China, or any other country.
If you cannot find enough qualifying businesses in Hong Kong, return fewer results — do NOT fill the quota with businesses from other locations.
Any result outside Hong Kong will be rejected and is considered a failure.

TARGET LOCATION: Hong Kong (SAR) ONLY

TARGET INDUSTRIES:
${industryList}

ADDITIONAL TARGET CRITERIA:
- Western-facing brands operating in Hong Kong
- SMBs with weak digital infrastructure: no CRM, manual booking, generic website
- Companies with active social media but poor website/backend

SIGNALS OF A GOOD LEAD:
${signalList}

EXCLUSIONS:
${exclusionList}

CRITICAL: Before including any business, use web search to verify it is CURRENTLY OPERATING:
- Confirm the website is live and not expired/parked
- Check for recent social media activity (posts within the last 3 months)
- Look for recent Google reviews or mentions indicating they are open
- If there is any sign the business has closed, moved, or gone silent — skip it

Use web search to find ${count} real, specific businesses physically located in Hong Kong. For each, search HARD for every contact method:
- Their actual website URL
- A contact email visible on their website, Facebook, Instagram bio, or Google Business profile
- Their Instagram handle (search by business name + Hong Kong if not obvious)
- A WhatsApp number (check their website footer, Instagram bio, Facebook page, Google Business)
- Their physical Hong Kong address / district (e.g. Central, Wan Chai, Causeway Bay, etc.)

Return ONLY a valid JSON array, no markdown, no explanation:
[
  {
    "name": "Company Name",
    "domain": "example.com.hk",
    "website": "https://example.com.hk",
    "instagram": "@handle or null",
    "whatsapp": "+85291234567 or null",
    "email": "contact@example.com or null",
    "location": "Hong Kong",
    "industry": "Automotive Detailing",
    "whyGoodLead": "One sentence explaining why they're a good fit"
  }
]`;
}

export async function discoverLeads(settings = {}, existingCompanies = []) {
  const merged = {
    industries: ['Automotive', 'Retail', 'Fashion', 'Lifestyle', 'Hospitality'],
    count: 5,
    signals: [
      'Active Instagram but no booking system or CRM',
      'Website on generic Shopify/Wix template',
      'Physical business with no digital loyalty tools',
    ],
    exclusions: [
      'Enterprise companies',
      'Businesses with no web presence',
      'Closed or defunct businesses',
      'Businesses with expired or broken websites',
    ],
    ...settings,
  };

  const prompt   = buildPrompt(merged, existingCompanies);
  const response = await callAnthropic(prompt, true); // true = use web search (web_search_20250305)

  // Strip markdown fences first
  let cleaned = response.replace(/```json|```/g, '').trim();

  // If there's preamble text before the array, extract just the JSON array
  const arrayStart = cleaned.indexOf('[');
  const arrayEnd   = cleaned.lastIndexOf(']');
  if (arrayStart === -1 || arrayEnd === -1) {
    throw new Error(`No JSON array found in response. Got: ${cleaned.slice(0, 120)}`);
  }
  cleaned = cleaned.slice(arrayStart, arrayEnd + 1);

  const leads = JSON.parse(cleaned);

  if (!Array.isArray(leads) || leads.length === 0) {
    throw new Error('Lead discovery returned no results');
  }

  // Drop any leads with missing required fields
  let valid = leads.filter(l => l && l.name && l.domain);

  // Hard filter: only keep Hong Kong companies
  // Accept entries where location explicitly mentions HK, or has an HK domain, or location is absent (assume HK)
  const hkKeywords = /hong kong|hk|hongkong/i;
  valid = valid.filter(l => {
    if (!l.location) return true; // no location set, allow through
    return hkKeywords.test(l.location);
  });

  if (valid.length === 0) throw new Error('All discovered leads were outside Hong Kong or missing required fields');

  // Normalise domain at source: strip protocol, www., trailing paths, lowercase.
  // Claude sometimes returns "www.example.com.hk" despite the prompt showing without www.
  // Normalising here ensures consistent dedup and no duplicate DB rows.
  valid = valid.map(l => ({
    ...l,
    domain: (l.domain || '')
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .trim() || l.domain,
  }));

  return valid.slice(0, merged.count);
}
