// Convert a cowork-engine /api/leads/import payload into the nested `audit`
// shape that pipeline/generate-page.js (`populate`) expects.
//
// Cowork sends:
//   scores: {
//     website:        { design: {score, note}, mobile, speed, cta, seo },
//     social:         { instagram: {score|null, note}, facebook, linkedin, google_business },
//     infrastructure: { booking, crm, automation, ecommerce }
//   }
//   recommendations: [{ title, description, impact }] × 3
//   overall_score, website (URL), business_name, industry, location, ai_opportunities
//
// Template needs sub-aggregates per category, social cards (status/dot/note),
// infrastructure cards (status/class/note), and a hasWebsite flag. We
// synthesise everything from the scores cowork already sends — no extra
// network calls, deterministic, idempotent.

function avgOfDefined(values) {
  const nums = values.filter(v => typeof v === "number");
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function socialDot(score) {
  if (score == null) return "gray";
  if (score >= 7) return "green";
  if (score >= 4) return "amber";
  return "red";
}

function socialStatus(score) {
  if (score == null) return "Not assessed";
  if (score >= 7) return "Active";
  if (score >= 4) return "Limited";
  return "Weak";
}

function infraClass(score) {
  if (score == null) return "score-na";
  if (score >= 7) return "score-high";
  if (score >= 4) return "score-mid";
  return "score-low";
}

function infraStatus(score) {
  if (score == null) return "Not assessed";
  if (score >= 7) return "Solid";
  if (score >= 4) return "Partial";
  return "Missing";
}

// Pull a `{score, note}` pair safely. Cowork sends `{score, note}` per axis,
// but if the payload is malformed/old we fall back to zeros so the template
// still renders.
function axis(obj, key) {
  const v = obj?.[key];
  if (v && typeof v === "object") {
    return { score: v.score ?? 0, note: v.note ?? "" };
  }
  if (typeof v === "number") {
    return { score: v, note: "" };
  }
  return { score: 0, note: "" };
}

function nullableAxis(obj, key) {
  const v = obj?.[key];
  if (v && typeof v === "object") {
    return { score: v.score ?? null, note: v.note ?? "" };
  }
  if (typeof v === "number") {
    return { score: v, note: "" };
  }
  return { score: null, note: "" };
}

export function synthesiseCoworkAudit(lead) {
  const s = lead.scores || {};
  const w = s.website || {};
  const so = s.social || {};
  const inf = s.infrastructure || {};

  const wDesign = axis(w, "design");
  const wMobile = axis(w, "mobile");
  const wSpeed  = axis(w, "speed");
  const wCta    = axis(w, "cta");
  const wSeo    = axis(w, "seo");

  const sIg = nullableAxis(so, "instagram");
  const sFb = nullableAxis(so, "facebook");
  const sLi = nullableAxis(so, "linkedin");
  const sGb = nullableAxis(so, "google_business");

  const iBook = nullableAxis(inf, "booking");
  const iCrm  = nullableAxis(inf, "crm");
  const iAuto = nullableAxis(inf, "automation");
  const iEcom = nullableAxis(inf, "ecommerce");

  const websiteRollup = avgOfDefined([wDesign.score, wMobile.score, wSpeed.score, wCta.score, wSeo.score]);
  const socialRollup  = avgOfDefined([sIg.score, sFb.score, sLi.score, sGb.score]);
  const infraRollup   = avgOfDefined([iBook.score, iCrm.score, iAuto.score, iEcom.score]);

  // Overall score: prefer cowork's value, otherwise average the three rollups.
  const overall = typeof lead.overall_score === "number"
    ? Math.round(lead.overall_score)
    : Math.round((websiteRollup + socialRollup + infraRollup) / 3);

  // Growth score: derive from how many AI opportunities cowork found.
  // 0 opps → 3, 1-2 opps → 5, 3 opps → 7. Better than guessing.
  const oppCount = Array.isArray(lead.ai_opportunities) ? lead.ai_opportunities.length : 0;
  const growth = oppCount >= 3 ? 7 : oppCount >= 1 ? 5 : 3;

  // Recommendations: prefer the new structured `recommendations` field. Fall
  // back to ai_opportunities (legacy shape: {feature, description}) so older
  // imports still render something.
  let recs = Array.isArray(lead.recommendations) ? lead.recommendations.slice(0, 3) : [];
  if (recs.length === 0 && Array.isArray(lead.ai_opportunities)) {
    recs = lead.ai_opportunities.slice(0, 3).map(o => ({
      title: o.feature || o.title || "",
      description: o.description || "",
      impact: o.impact || "",
    }));
  }
  while (recs.length < 3) recs.push({ title: "", description: "", impact: "" });

  return {
    hasWebsite: !!lead.website,
    websiteUrl: lead.website || "",
    overallScore: overall,
    growthScore: growth,
    website: {
      score: websiteRollup,
      design: wDesign,
      mobile: wMobile,
      speed:  wSpeed,
      cta:    wCta,
      seo:    wSeo,
    },
    social: {
      score: socialRollup,
      instagram:      { status: socialStatus(sIg.score), dot: socialDot(sIg.score), note: sIg.note },
      facebook:       { status: socialStatus(sFb.score), dot: socialDot(sFb.score), note: sFb.note },
      linkedin:       { status: socialStatus(sLi.score), dot: socialDot(sLi.score), note: sLi.note },
      googleBusiness: { status: socialStatus(sGb.score), dot: socialDot(sGb.score), note: sGb.note },
    },
    infrastructure: {
      score: infraRollup,
      booking:    { status: infraStatus(iBook.score), class: infraClass(iBook.score), note: iBook.note },
      crm:        { status: infraStatus(iCrm.score),  class: infraClass(iCrm.score),  note: iCrm.note },
      automation: { status: infraStatus(iAuto.score), class: infraClass(iAuto.score), note: iAuto.note },
      ecommerce:  { status: infraStatus(iEcom.score), class: infraClass(iEcom.score), note: iEcom.note },
    },
    recommendations: recs,
  };
}
