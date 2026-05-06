# JDCoreDev — Implementation Brief Workstreams 2 & 3

## What This Is

JDCoreDev (`jdcoredev.com`) is a small-business AI consultancy site plus an interactive Claude Code trading-routine workspace. The marketing site sells AI-integrated systems to local businesses, sole traders, startups, tradespeople, and small e-commerce. The trading workspace is a set of Claude Code routines Josh runs interactively from the Claude app's Claude Code section — there is no scheduled cron, no deployed routine service.

This GSD project covers two of three implementation-brief workstreams: **W2** (two new service marketing pages) and **W3** (three new capabilities for the trading routines). W1 (global `context-mode` install) is already shipped — out of scope here.

## Core Value

Ship the two new service offerings as production marketing pages without sliding scope (no forms, no DB, no audit tooling), and extend the trading routines with three discrete capabilities that compose with the existing Claude Code routine pattern — never as a parallel runtime.

## Requirements

### Validated

<!-- Existing JDCoreDev capabilities, already shipped. -->

- ✓ Public marketing site at jdcoredev.com — existing
- ✓ `/services` page listing current services with NavBar tubelight + AnimatedContainer style — existing
- ✓ `/contact` route serving as the canonical CTA target — existing
- ✓ Site-wide schema.org JSON-LD `@graph` in `client/index.html` — existing
- ✓ Dynamic sitemap served from `server/routes.ts` (not a static XML file) — existing
- ✓ Admin tooling: `/admin/dev-logs`, `/admin/invoice-reminders`, hosting-budget tracking — existing
- ✓ Trading routines callable from Claude Code (Predictor, Trader) with Alpaca integration — existing
- ✓ `context-mode` skill installed at user scope (W1 of brief) — shipped

### Active

<!-- v1 scope for this GSD project. -->

**W2 — Service marketing pages**

- [ ] MKTG-01: New service page at `/services/ai-advertising-audit` (AI Advertising Audit + Improvement)
- [ ] MKTG-02: New service page at `/services/seo-audit-and-improvement` (SEO Audit + Improvement)
- [ ] MKTG-03: Each new page has hero, 3-5 outcome-focused benefit blocks, 2-tier pricing (Audit / Audit + Improvements; optional ongoing tier as stretch), 5-8 FAQ entries, social-proof slot (placeholder OK), final CTA strip
- [ ] MKTG-04: All CTAs route to `/contact` via `<Link href="/contact"><Button>Get in touch</Button></Link>` — no new contact mechanism
- [ ] MKTG-05: Per-page SEO meta — `useEffect`-driven `document.title` set + scoped `<script type="application/ld+json">` Service block append/cleanup; no SEO library
- [ ] MKTG-06: Both new routes registered in `client/src/App.tsx`
- [ ] MKTG-07: Both new pages linked from main nav (`client/src/components/PublicNavbar.tsx`) under Services
- [ ] MKTG-08: Both new pages linked from homepage as cards (`client/src/pages/home.tsx`)
- [ ] MKTG-09: `staticUrls` in `server/routes.ts` (~line 435) updated to include both new service URLs
- [ ] MKTG-10: Visual style matches `client/src/pages/services.tsx` — NavBar tubelight, sticky logo nav, AnimatedContainer, bordered grid

**W3 — Trading routine extensions**

- [ ] TRADE-00: Discovery doc `docs/trading-routine-architecture.md` mapping existing trading-routine skills, Alpaca integration shape, persistence surface, dashboard reads — REQUIRED before TRADE-01/02/03
- [ ] TRADE-01: Camoufox stealth scraping primitive available to trading routines (skill OR MCP server — match pattern from TRADE-00)
- [ ] TRADE-02: Fincept financial data layer accessible to trading routines (same pattern decision as TRADE-01)
- [ ] TRADE-03: AutoHedge agent patterns ported as Claude Code skills — Director, Quant, Risk, Execution roles with schema-validated outputs

### Out of Scope

- Forms / DB tables / audit tooling for the new service pages — brief was explicitly rewritten to remove this scope; CTAs go through existing `/contact` only
- Internal `/admin/audits` page extension — out of scope per latest brief
- `react-helmet` or any SEO library — `useEffect` head-injection is the chosen pattern
- Putting the new pages back into the existing `/services` page as sections — they are standalone routes per the URL spec
- Running AutoHedge as a runtime / adding it as a Python dependency — patterns only, ported into Claude Code skills
- Touching Live trading mode without an explicit confirmation gate — Paper mode default for any new code path
- Scheduling the trading routines on cron — they are Claude-Code-invoked interactive routines, not a deployed service
- Re-doing W1 (`context-mode` global install) — already shipped

## Context

- **Hosting:** Railway (autodeploys from `main`) with Cloudflare in front. Edge cache may need purging after deploys touching `/sitemap.xml` or `/services`.
- **Stack:** Vite + React + wouter + TailwindCSS + shadcn-style components on the frontend; Express + Drizzle ORM against Postgres on Railway on the backend; build via `npm run build`.
- **Voice/tone:** Approachable, jargon-free. AI is "built into the systems," not "AI-enhanced web development." Existing pages thread this consistently — match it.
- **Trading workspace specifics are unknown until TRADE-00 produces the discovery doc.** Where Alpaca is wired, where positions persist, whether tools are skills or MCP servers — all to be mapped, not assumed.
- **Auto-log accuracy work** (recent prior session) is committed at `85d695f` — not part of this project.

## Constraints

- **Tech stack:** Vite + React + wouter + Tailwind on the frontend; Express + Drizzle + Postgres on the backend — already chosen, do not introduce alternatives without explicit discussion.
- **Visual:** New W2 pages must match `client/src/pages/services.tsx` style — NavBar tubelight + AnimatedContainer + sticky logo nav + bordered grid. Same footer.
- **Routing:** wouter `<Route path="...">`. CTAs use `<Link href="/contact">`. No hashtag links.
- **SEO:** Per-page meta via `useEffect` head-injection; no `react-helmet` or other library.
- **Sitemap:** Dynamic — edit `staticUrls` array around `server/routes.ts:435`. Not a static file.
- **Trading-routine pattern:** Camoufox and Fincept must MATCH the pattern documented in TRADE-00 (skill vs. MCP) — never introduce a parallel pattern.
- **Mode safety:** Trading defaults to Paper for any new code path. Live requires an explicit confirmation gate baked into the routine.
- **Workflow:** One PR per phase, no mega-PRs.
- **Cloudflare cache:** Surface manual purge as a follow-up after each W2 deploy — do not auto-purge.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Two new top-level routes (`/services/<slug>`) instead of section anchors on `/services` | Brief specifies discrete URLs for SEO and direct linkability | — Pending |
| `useEffect` head-injection for per-page SEO over `react-helmet` | Avoids new dep; scoped to mount/unmount; matches lightweight pattern | — Pending |
| Visual style copies `services.tsx` instead of extracting a shared `<ServicePage>` component | Two pages, narrow scope. Premature abstraction risk if extracted now. Revisit if W2.3+ ever happens. | — Pending |
| TRADE-00 (discovery doc) blocks TRADE-01/02/03 | Prevents introducing parallel patterns into the trading-routine surface | — Pending |
| GSD config: coarse granularity, parallel, balanced models, research:false (skipped per user), plan_check:true, verifier:true | Brief is comprehensive — domain research adds no value; plan_check + verifier give safety on multi-file changes | — Pending |
| Skip GSD codebase mapping | Stack already known; targeted file paths in brief; mapping would add ceremony without yield | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-06 after initialization*
