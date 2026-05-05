/**
 * Stage 3: Generate the HTML audit page and write it to the static folder.
 * Because jdcoredev.com runs on Replit with Express, we just write to disk
 * and the file is instantly live — no deploy step needed.
 *
 * Handles three website states:
 *   NORMAL    — hasWebsite: true  → standard 5-row audit table
 *   NO_SITE   — hasWebsite: false → full-width "No website detected" callout
 *   PARTIAL   — hasWebsite: true but scores all 0 → table shows N/A rows
 */

import fs from 'fs';
import path from 'path';
import { dbUpdateAuditHtml, dbUpsertAudit } from './db-bridge.js';

const TEMPLATE_PATH = path.join(process.cwd(), 'templates', 'audit.html');
// Audit pages live in pipeline/data/audits/<slug>/index.html
// The Express route at /audits/:slug reads from this exact location.
const AUDITS_DIR = path.join(process.cwd(), 'pipeline', 'data', 'audits');

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(name) {
  return (name || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function scoreToColor(score, outOf = 10) {
  const pct = (score / outOf) * 100;
  if (pct >= 70) return 'var(--green)';
  if (pct >= 40) return 'var(--amber)';
  return 'var(--red)';
}

function scoreToClass(score, outOf = 10) {
  const pct = (score / outOf) * 100;
  if (pct >= 70) return 'score-high';
  if (pct >= 40) return 'score-mid';
  return 'score-low';
}

function scoreOffset(score, outOf = 100) {
  const circumference = 502.65; // SVG circle r=80
  return circumference * (1 - score / outOf);
}

// ── Website section builder ───────────────────────────────────────────────────

/**
 * Returns the HTML block for Section 01 — Website Audit.
 * If the company has no website, returns a prominent callout instead of the table.
 */
function buildWebsiteSection(audit) {
  const w = audit.website;

  // ── No website: full-width callout ──────────────────────────────────────────
  if (!audit.hasWebsite) {
    const note = w.noWebsiteNote || 'No website found during research. Business appears to operate without any web presence.';
    return `
  <div class="no-website-callout">
    <div class="no-website-icon">⚠</div>
    <div class="no-website-content">
      <div class="no-website-title">No Website Detected</div>
      <div class="no-website-note">${note}</div>
      <div class="no-website-impact">
        Without a website, this business is invisible to anyone searching Google, Bing, or Maps.
        Every competitor with a site is winning customers that should be theirs.
        This is the single highest-impact fix available.
      </div>
    </div>
    <div class="no-website-score">
      <div class="no-website-score-label">Website Score</div>
      <div class="no-website-score-num">0<span>/10</span></div>
    </div>
  </div>`;
  }

  // ── Has website: standard audit table ──────────────────────────────────────
  return `
  <table class="audit-table">
    <thead>
      <tr><th>Criterion</th><th>Score</th><th>Finding</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>Design &amp; Visual Quality</td>
        <td><span class="score-badge ${scoreToClass(w.design.score)}">${w.design.score}</span></td>
        <td>${w.design.note}</td>
      </tr>
      <tr>
        <td>Mobile Responsiveness</td>
        <td><span class="score-badge ${scoreToClass(w.mobile.score)}">${w.mobile.score}</span></td>
        <td>${w.mobile.note}</td>
      </tr>
      <tr>
        <td>Page Speed (estimated)</td>
        <td><span class="score-badge ${scoreToClass(w.speed.score)}">${w.speed.score}</span></td>
        <td>${w.speed.note}</td>
      </tr>
      <tr>
        <td>CTA Clarity</td>
        <td><span class="score-badge ${scoreToClass(w.cta.score)}">${w.cta.score}</span></td>
        <td>${w.cta.note}</td>
      </tr>
      <tr>
        <td>SEO &amp; Discoverability</td>
        <td><span class="score-badge ${scoreToClass(w.seo.score)}">${w.seo.score}</span></td>
        <td>${w.seo.note}</td>
      </tr>
    </tbody>
  </table>`;
}

// ── Main populate function ────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildMetaDescription(lead, audit) {
  // Use auditSummary if present and decent; else synthesise from top recommendation.
  const raw = (audit && audit.auditSummary)
    || (audit && audit.recommendations && audit.recommendations[0]
        ? `${audit.recommendations[0].title}: ${audit.recommendations[0].description}`
        : '')
    || `Digital audit for ${lead.name}${lead.location ? ' in ' + lead.location : ''} — website, social, infrastructure, and growth scoring by JD CoreDev.`;
  // Strip newlines, truncate to ~155 chars (Google standard).
  const flat = raw.replace(/\s+/g, ' ').trim();
  return escapeHtml(flat.length > 155 ? flat.slice(0, 152).trimEnd() + '...' : flat);
}

function buildJsonLd(lead, audit, slug) {
  const url = `https://www.jdcoredev.com/audits/${slug}`;
  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": `${lead.name} — Digital Audit`,
    "description": (audit && audit.auditSummary ? String(audit.auditSummary).slice(0, 250) : `Digital audit for ${lead.name}.`),
    "author":  { "@type": "Organization", "name": "JD CoreDev", "url": "https://www.jdcoredev.com" },
    "publisher": {
      "@type": "Organization",
      "name": "JD CoreDev",
      "url":  "https://www.jdcoredev.com",
      "logo": { "@type": "ImageObject", "url": "https://www.jdcoredev.com/favicon.png" },
    },
    "datePublished": new Date().toISOString().slice(0, 10),
    "dateModified":  new Date().toISOString().slice(0, 10),
    "mainEntityOfPage": { "@type": "WebPage", "@id": url },
    "about": {
      "@type": "LocalBusiness",
      "name": lead.name,
      ...(lead.location ? { "address": { "@type": "PostalAddress", "addressLocality": lead.location, "addressCountry": "HK" } } : {}),
      ...(audit && typeof audit.overallScore === 'number'
        ? { "aggregateRating": { "@type": "AggregateRating", "ratingValue": Math.round(audit.overallScore / 10), "bestRating": 10, "ratingCount": 1 } }
        : {}),
    },
  };
  // JSON.stringify handles escaping for the JSON content; we then make it safe to embed in <script>.
  return JSON.stringify(ld, null, 2).replace(/<\/script/gi, '<\\/script');
}

// Build the headline-finding hero block. The audit prompt now returns a
// `headline` string — a one-sentence company-specific finding. If it's
// missing or generic, we synthesise from recommendations[0] / no-website
// state so the page never falls back to a bland hero.
function buildHeadlineFindingBlock(audit) {
  const escapeHtml = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  let text = (audit.headline || '').trim();
  // Discard model-generated fillers that defeat the purpose.
  if (/^(your\s+digital\s+presence|several\s+improvements|mixed\s+results|room\s+to\s+grow)/i.test(text)) {
    text = '';
  }
  if (!text) {
    if (!audit.hasWebsite) {
      text = `No website detected — invisible to anyone searching for ${audit && audit.industry ? audit.industry : 'this'} in the area.`;
    } else if (audit.recommendations && audit.recommendations[0]) {
      const r = audit.recommendations[0];
      text = (r.title || '') + (r.description ? ` — ${r.description.split(/[.!?]\s/)[0]}` : '');
    }
  }
  if (!text) return ''; // No usable headline → render nothing rather than empty styled block.

  return `<div class="headline-finding fade-up delay-1">
    <span class="headline-finding-label">The headline finding</span>
    <p class="headline-finding-text">${escapeHtml(text)}</p>
  </div>`;
}

function populate(template, lead, audit, slug) {
  const date = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const replacements = {
    '{{COMPANY_NAME}}':           lead.name,
    '{{HEADLINE_FINDING_BLOCK}}': buildHeadlineFindingBlock({ ...audit, industry: lead.industry }),
    '{{INDUSTRY}}':            lead.industry,
    '{{LOCATION}}':            lead.location,
    '{{WEBSITE}}':             audit.websiteUrl || lead.domain || 'No website found',
    '{{AUDIT_DATE}}':          date,
    '{{META_DESCRIPTION}}':    buildMetaDescription(lead, audit),
    '{{CANONICAL_URL}}':       `https://www.jdcoredev.com/audits/${slug}`,
    '{{JSON_LD}}':             buildJsonLd(lead, audit, slug),

    // Overall score ring
    '{{OVERALL_SCORE}}':       audit.overallScore,
    '{{SCORE_OFFSET}}':        scoreOffset(audit.overallScore),

    // Sub-score pills
    '{{WEBSITE_SCORE}}':       audit.website.score,
    '{{WEBSITE_SCORE_PCT}}':   audit.website.score * 10,
    '{{WEBSITE_SCORE_COLOR}}': scoreToColor(audit.website.score),

    '{{SOCIAL_SCORE}}':        audit.social.score,
    '{{SOCIAL_SCORE_PCT}}':    audit.social.score * 10,
    '{{SOCIAL_SCORE_COLOR}}':  scoreToColor(audit.social.score),

    '{{INFRA_SCORE}}':         audit.infrastructure.score,
    '{{INFRA_SCORE_PCT}}':     audit.infrastructure.score * 10,
    '{{INFRA_SCORE_COLOR}}':   scoreToColor(audit.infrastructure.score),

    '{{GROWTH_SCORE}}':        audit.growthScore,
    '{{GROWTH_SCORE_PCT}}':    audit.growthScore * 10,
    '{{GROWTH_SCORE_COLOR}}':  scoreToColor(audit.growthScore),

    // Website section — swapped out for no-website callout if needed
    '{{WEBSITE_SECTION}}':     buildWebsiteSection(audit),

    // Social cards
    '{{IG_STATUS}}':  audit.social.instagram.status,
    '{{IG_DOT}}':     audit.social.instagram.dot,
    '{{IG_NOTE}}':    audit.social.instagram.note,

    '{{FB_STATUS}}':  audit.social.facebook.status,
    '{{FB_DOT}}':     audit.social.facebook.dot,
    '{{FB_NOTE}}':    audit.social.facebook.note,

    '{{LI_STATUS}}':  audit.social.linkedin.status,
    '{{LI_DOT}}':     audit.social.linkedin.dot,
    '{{LI_NOTE}}':    audit.social.linkedin.note,

    '{{GB_STATUS}}':  audit.social.googleBusiness.status,
    '{{GB_DOT}}':     audit.social.googleBusiness.dot,
    '{{GB_NOTE}}':    audit.social.googleBusiness.note,

    // Infrastructure
    '{{BOOKING_STATUS}}': audit.infrastructure.booking.status,
    '{{BOOKING_CLASS}}':  audit.infrastructure.booking.class,
    '{{BOOKING_NOTE}}':   audit.infrastructure.booking.note,

    '{{CRM_STATUS}}':     audit.infrastructure.crm.status,
    '{{CRM_CLASS}}':      audit.infrastructure.crm.class,
    '{{CRM_NOTE}}':       audit.infrastructure.crm.note,

    '{{AUTO_STATUS}}':    audit.infrastructure.automation.status,
    '{{AUTO_CLASS}}':     audit.infrastructure.automation.class,
    '{{AUTO_NOTE}}':      audit.infrastructure.automation.note,

    '{{ECOM_STATUS}}':    audit.infrastructure.ecommerce.status,
    '{{ECOM_CLASS}}':     audit.infrastructure.ecommerce.class,
    '{{ECOM_NOTE}}':      audit.infrastructure.ecommerce.note,

    // Recommendations
    '{{REC1_TITLE}}':  audit.recommendations[0]?.title       || '',
    '{{REC1_DESC}}':   audit.recommendations[0]?.description || '',
    '{{REC1_IMPACT}}': audit.recommendations[0]?.impact      || '',

    '{{REC2_TITLE}}':  audit.recommendations[1]?.title       || '',
    '{{REC2_DESC}}':   audit.recommendations[1]?.description || '',
    '{{REC2_IMPACT}}': audit.recommendations[1]?.impact      || '',

    '{{REC3_TITLE}}':  audit.recommendations[2]?.title       || '',
    '{{REC3_DESC}}':   audit.recommendations[2]?.description || '',
    '{{REC3_IMPACT}}': audit.recommendations[2]?.impact      || '',
  };

  let html = template;
  for (const [token, value] of Object.entries(replacements)) {
    html = html.replaceAll(token, String(value));
  }
  return html;
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function generateAuditPage(lead, audit) {
  const slug = slugify(lead.name);
  const auditDir = path.join(AUDITS_DIR, slug);

  fs.mkdirSync(auditDir, { recursive: true });

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  const html = populate(template, lead, audit, slug);

  fs.writeFileSync(path.join(auditDir, 'index.html'), html, 'utf-8');

  const auditUrl = `https://jdcoredev.com/audits/${slug}`;

  // Persist to DB — upsert the audit row first so it exists, then write HTML.
  // Without the upsert, dbUpdateAuditHtml silently no-ops for brand-new audits
  // because the row hasn't been inserted yet.
  // Always use the normalised domain (no www., no protocol) to avoid duplicate rows.
  if (lead.domain) {
    const normDomain = lead.domain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .trim();
    await dbUpsertAudit({
      name:     lead.name || normDomain,
      domain:   normDomain,
      auditUrl,
      location: lead.location || null,
      industry: lead.industry || null,
      channel:  'draft',
      status:   'draft',
    });
    await dbUpdateAuditHtml(normDomain, html);
  }

  return auditUrl;
}
