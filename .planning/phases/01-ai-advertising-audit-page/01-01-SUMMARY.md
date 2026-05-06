---
phase: 01-ai-advertising-audit-page
plan: 01
subsystem: marketing-aaa-page
tags: [marketing, react, wouter, seo, json-ld, phase-1]
requires: []
provides:
  - "Standalone marketing page at /services/ai-advertising-audit"
  - "Wouter route registration for the AAA page"
  - "Per-page SEO useEffect head-injection (8 meta + canonical + Service JSON-LD) with data-page cleanup contract"
affects:
  - "client/src/pages/ai-advertising-audit.tsx"
  - "client/src/App.tsx"
tech-stack:
  added: []
  patterns:
    - "Per-page SEO via useEffect head-injection tagged data-page=\"<page-id>\" with on-unmount cleanup that restores prior document.title"
    - "Service JSON-LD references the site-wide @graph #org via provider.@id (no Organization redeclaration)"
    - "Marketing page composes services.tsx primitives verbatim — NavBar tubelight + sticky logo nav + AnimatedContainer + bordered grid + footer"
key-files:
  created:
    - "client/src/pages/ai-advertising-audit.tsx"
  modified:
    - "client/src/App.tsx"
decisions:
  - "Page is fully standalone — no shared <ServicePage> component yet (deferred to v2 once Phase 2 SEO page lands and a real shared shape emerges)"
  - "JSON-LD provider references #org via @id only — keeps the @graph as the single source of truth for the Organization node"
  - "FAQ container uses max-w-3xl mx-auto px-8 (UI-SPEC §7 typo deviation noted in plan; plan-author-approved)"
  - "Pricing tiers use placeholder \"From HK$X,XXX\" until Josh finalises numbers — UI-SPEC explicitly permits placeholders"
metrics:
  duration: "~25 minutes (Tasks 1-2 prior session, Task 3 this session)"
  completed: "2026-05-06"
requirements-completed:
  - "MKTG-AAA-01"
  - "MKTG-AAA-02"
  - "MKTG-AAA-03"
  - "MKTG-AAA-04"
  - "MKTG-AAA-05"
  - "MKTG-AAA-06"
  - "MKTG-AAA-07"
  - "MKTG-AAA-08"
  - "MKTG-AAA-09"
---

# Phase 1 Plan 01: AI Advertising Audit Page Summary

One-liner: Standalone marketing page at `/services/ai-advertising-audit` shipped end-to-end — page component, wouter route registration, and per-page SEO useEffect (8 meta + canonical + Service JSON-LD) with on-unmount cleanup that restores prior title and removes all `data-page="ai-advertising-audit"` nodes.

## What was built

A single new React page composed verbatim from `client/src/pages/services.tsx` primitives, plus one new wouter Route line and one import in `client/src/App.tsx`. The page renders six sections inside the canonical site shell:

1. **Hero** — eyebrow `// AI Advertising Audit`, H1 `Make your ad spend actually pay back`, subhead, hero CTA → `/contact`.
2. **Benefit blocks** — 4 numbered cards in a 2-col bordered grid: `Spot the wasted spend`, `Sharper creative & messaging`, `Tracking that actually works`, `Landing pages that convert`.
3. **Pricing** — 2 tiers (`The Audit`, `Audit + Improvements`) each with 2 priced rows, plus an `Or run it for you, monthly` ongoing-management strip with its own CTA → `/contact`.
4. **Social proof** — 3-cell placeholder testimonial grid (`[Testimonial · placeholder]` cells) under H2 `Quietly making ads work harder`.
5. **FAQ** — Accordion (radix-backed) with 7 entries: included scope, timeline, account access, prerequisites, post-contact flow, report format, who runs it.
6. **Final CTA** — H2 `Let's see where your spend's leaking`, body, primary CTA → `/contact`.

Plus the per-page SEO useEffect injects 8 meta tags (description, og:type/title/description/url, twitter:card/title/description), 1 canonical link, and 1 Service JSON-LD. All injected nodes carry `data-page="ai-advertising-audit"` so the cleanup return function can find them with `document.head.querySelectorAll('[data-page="ai-advertising-audit"]')` and remove them on unmount, then restore the prior `document.title`.

## Tasks executed

| Task | Name                                                                                                        | Commit  | Files                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------ |
| 1    | Create page skeleton — imports, AnimatedContainer, NavBar, sticky logo nav, 6 section shells, footer        | b217648 | `client/src/pages/ai-advertising-audit.tsx`                        |
| 2    | Fill section bodies — hero copy, 4 benefit cards, 2 pricing tiers + ongoing strip, 3 social cells, 7 FAQ, final CTA | 65c80ec | `client/src/pages/ai-advertising-audit.tsx`                        |
| 3    | Add SEO useEffect head-injection block + register the route in App.tsx                                       | ee36125 | `client/src/pages/ai-advertising-audit.tsx`, `client/src/App.tsx`  |

## Acceptance criteria status

All Task 1 / Task 2 / Task 3 grep gates pass:

**Task 1**
- `export default function AiAdvertisingAuditPage` → 1 ✓
- `import { NavBar } from "@/components/ui/tubelight-navbar"` → 1 ✓
- Accordion imported (multi-line `import { ... Accordion, ... }`) → confirmed ✓
- `{/* SECTION 1 — ... */}` ... `{/* SECTION 6 — ... */}` → 6 ✓

**Task 2** (every locked phrase from UI-SPEC §6)
- `Make your ad spend` → 1 ✓
- `Spot the wasted spend` → 1 ✓
- `Sharper creative` → 1 ✓
- `Tracking that actually works` → 1 ✓
- `Landing pages that convert` → 1 ✓
- `From HK$X,XXX` → 3 ✓ (single-channel, both-channels, audit+execution)
- `Or run it for you, monthly` → 1 ✓
- `Quietly making ads` → 1 ✓
- `What's actually included in the audit?` → 1 ✓
- `How long does the audit take?` → 1 ✓
- `Let's see where your` → 1 ✓
- `Link href="/contact"` → 3 ✓ (hero, ongoing strip, final CTA — Sign In on sticky nav goes to `/auth` and is excluded)
- `TODO Task 2` → 0 ✓ (all placeholders replaced)

**Task 3**
- `import AiAdvertisingAuditPage from "@/pages/ai-advertising-audit"` (App.tsx) → 1 ✓
- `<Route path="/services/ai-advertising-audit" component={AiAdvertisingAuditPage} />` (App.tsx) → 1 ✓
- `useEffect(() =>` → 1 ✓
- `PAGE_TAG = "ai-advertising-audit"` → 1 ✓
- `https://www.jdcoredev.com/#org` → 1 ✓ (Service.provider reference; no Organization redeclaration)
- `"@type":       "Service"` → 1 ✓
- `summary_large_image` → 1 ✓
- `"rel",  "canonical"` → 1 ✓

**TypeScript** — `cd client && npx tsc --noEmit` exits 0; no errors referencing `ai-advertising-audit.tsx` or `App.tsx`.

## Decisions Made

- **No shared `<ServicePage>` component yet.** UI-SPEC + STATE.md Decisions both specify "no shared component for v1; copy the services.tsx primitives verbatim". Phase 2 (SEO page) will repeat this pattern; v2 may extract once the shape is proven across both.
- **Service JSON-LD references the site-wide `@graph` `#org`.** `client/index.html` already declares the Organization node at `#org`; the Service node here uses `"provider": { "@id": "https://www.jdcoredev.com/#org" }` so we never duplicate that node.
- **Pricing prices remain placeholders.** `From HK$X,XXX` is locked from UI-SPEC §6; PROJECT.md's "Pricing numbers may not be ready; placeholders are acceptable per the brief" applies.
- **FAQ container width corrected to `max-w-3xl mx-auto px-8`.** UI-SPEC §7 had a typo combining two width tokens on one div; the plan called this out and the file uses the readable narrower width as intended. No deviation — this matches the plan's explicit instruction.
- **Three CTAs route to `/contact` via wouter `<Link>`.** Hero, ongoing-management strip, final CTA. Sign In on sticky logo nav goes to `/auth` and does not count toward the "3 contact CTAs" requirement, per the plan.

## Deviations from Plan

None. Plan executed exactly as written. The page file matches the skeleton + content + SEO blocks specified in Tasks 1-3 verbatim, and App.tsx insertions are at the exact lines specified (import after `ServicesPage` import, route after `<Route path="/services" ...>`).

## Build verification note

`npm run build` (which is `tsx script/build.ts`) cannot run from this iCloud-synced working directory due to a Windows + iCloud sync issue: `node_modules/.bin/tsx` and `node_modules/.bin/vite` resolve to placeholder/offline files and `node` `readFileSync` returns `EUNKNOWN -4094`. This is a local-environment artefact only. The TypeScript check (`npx tsc --noEmit`) does pass cleanly — every type referenced in the new code resolves correctly — and the source compiles structurally. The build itself will run normally in CI / on a non-iCloud checkout.

If a build run on a clean checkout is desired before merging the PR, run `npm run build` from a non-iCloud-synced clone of this repo (e.g. `~/dev/JDCoreDev`).

## Verification (post-deploy smoke test, for the human)

When this lands on production, confirm:

1. `https://www.jdcoredev.com/services/ai-advertising-audit` returns the page — hero, 4 benefit cards, 2 pricing tiers + ongoing strip, 3 placeholder testimonial cells, 7 FAQ entries, final CTA, footer.
2. DevTools → Elements → search `data-page="ai-advertising-audit"` returns 10 nodes (8 meta + 1 link[rel=canonical] + 1 script[type=application/ld+json]).
3. Navigating away (e.g. to `/services`) and back: those nodes are removed on unmount and re-injected on remount; `document.title` swaps cleanly.
4. Hero "Get in touch", ongoing-strip "Talk to us about ongoing management", and final-CTA "Get in touch" all route to `/contact`.
5. View-source confirms the Service JSON-LD's `provider.@id` is `https://www.jdcoredev.com/#org` and matches the `@id` of the Organization in the static `@graph` from `client/index.html`.

## Requirements

All 9 page-specific requirements close with this plan:

- **MKTG-AAA-01** — Route registered in `client/src/App.tsx` and renders at `/services/ai-advertising-audit` ✓
- **MKTG-AAA-02** — Hero with primary CTA → `/contact` (matches the existing `<Link href="/contact"><Button>Get in touch</Button></Link>` pattern) ✓
- **MKTG-AAA-03** — 4 outcome-focused benefit blocks (covers Google + Meta, creative, tracking, landing-page alignment) ✓
- **MKTG-AAA-04** — 2-tier pricing card (Audit / Audit + Improvements) plus ongoing-management strip; placeholders OK ✓
- **MKTG-AAA-05** — Social-proof slot rendered (3-cell placeholder grid) ✓
- **MKTG-AAA-06** — 7 FAQ entries (within the 5-8 range) covering scope / timeline / access / prerequisites / process / format / authorship ✓
- **MKTG-AAA-07** — Final CTA strip → `/contact` ✓
- **MKTG-AAA-08** — Per-page SEO via `useEffect` (document.title, OG tags via meta append/cleanup, Service JSON-LD append on mount + remove on unmount, all tagged `data-page="ai-advertising-audit"`) ✓
- **MKTG-AAA-09** — Visual style identical to `client/src/pages/services.tsx` (NavBar tubelight + sticky logo nav + AnimatedContainer + bordered grid + footer) ✓

The Phase 1 site-wide AAA-portion requirements (`MKTG-NAV-01` AAA entry, `MKTG-HOME-01` AAA card, `MKTG-MAP-01` AAA URL in sitemap) close in sibling plans 02-04.

## Self-Check: PASSED

- File `client/src/pages/ai-advertising-audit.tsx` exists (FOUND).
- File `client/src/App.tsx` modified (FOUND — diff confirmed `+import AiAdvertisingAuditPage` and `+<Route path="/services/ai-advertising-audit" component={AiAdvertisingAuditPage} />`).
- Commit `b217648` (Task 1 skeleton) confirmed in `git log` (FOUND).
- Commit `65c80ec` (Task 2 content) confirmed in `git log` (FOUND).
- Commit `ee36125` (Task 3 SEO + route) confirmed in `git log` (FOUND).
- All grep gates from Tasks 1, 2, 3 acceptance criteria pass (counts above).
- TypeScript check (`npx tsc --noEmit`) exits 0.
