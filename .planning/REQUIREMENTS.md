# Requirements — JDCoreDev W2 + W3

Source: implementation brief v3 (narrow W2 scope). All requirements below are v1 hypotheses until shipped and validated.

## v1 Requirements

### Marketing — Service Pages (W2)

**Page: AI Advertising Audit + Improvement (`/services/ai-advertising-audit`)**

- [x] **MKTG-AAA-01**: Page route registered in `client/src/App.tsx` and renders at `/services/ai-advertising-audit` without console errors
- [x] **MKTG-AAA-02**: Hero section with primary CTA → `/contact` matching existing `<Link href="/contact"><Button>Get in touch</Button></Link>` pattern
- [x] **MKTG-AAA-03**: 3-5 outcome-focused benefit blocks (plain language, jargon-free; covers Google Ads + Meta Ads, creative, targeting, spend efficiency, conversion tracking, landing-page alignment)
- [x] **MKTG-AAA-04**: 2-tier pricing card (Audit-only / Audit + Improvements) with optional ongoing-management tier as stretch; placeholders OK if numbers TBD; not enterprise-feel
- [x] **MKTG-AAA-05**: Social-proof slot rendered (placeholder content acceptable)
- [x] **MKTG-AAA-06**: 5-8 FAQ entries — what's included, timeline, ad-account access, what happens after they get in touch
- [x] **MKTG-AAA-07**: Final CTA strip → `/contact`
- [x] **MKTG-AAA-08**: Per-page SEO via `useEffect`: sets `document.title`, OG tags via meta tag append/cleanup, schema.org `Service` JSON-LD via `<script type="application/ld+json">` append on mount and remove on unmount
- [x] **MKTG-AAA-09**: Visual style — NavBar tubelight + sticky logo nav + AnimatedContainer + bordered grid pattern, identical to `client/src/pages/services.tsx`

**Page: SEO Audit + Improvement (`/services/seo-audit-and-improvement`)**

- [ ] **MKTG-SEO-01**: Page route registered in `client/src/App.tsx` and renders at `/services/seo-audit-and-improvement` without console errors
- [ ] **MKTG-SEO-02**: Hero section with primary CTA → `/contact` (same Link/Button pattern)
- [ ] **MKTG-SEO-03**: 3-5 outcome-focused benefit blocks (plain language; covers meta tags, schema markup, broken links, content gaps, technical issues, page-speed quick wins, on-page optimisation, structured data)
- [ ] **MKTG-SEO-04**: 2-tier pricing card (Audit-only / Audit + Improvements) with optional ongoing-care tier as stretch
- [ ] **MKTG-SEO-05**: Social-proof slot rendered (placeholder OK)
- [ ] **MKTG-SEO-06**: 5-8 FAQ entries
- [ ] **MKTG-SEO-07**: Final CTA strip → `/contact`
- [ ] **MKTG-SEO-08**: Per-page SEO via `useEffect` (same pattern as MKTG-AAA-08, distinct Service JSON-LD)
- [ ] **MKTG-SEO-09**: Visual style matches `services.tsx`

**Site-wide W2 changes**

- [ ] **MKTG-NAV-01**: Both new pages linked from `client/src/components/PublicNavbar.tsx` under Services (decide: dropdown vs. flat — TBD on inspection)
- [ ] **MKTG-HOME-01**: Both new services have homepage cards on `client/src/pages/home.tsx` linking to their routes
- [ ] **MKTG-MAP-01**: `staticUrls` array in `server/routes.ts` (~line 435) updated to include both new service URLs with appropriate `priority` and `changefreq`
- [ ] **MKTG-CACHE-01**: After each W2 deploy, surface a Cloudflare cache-purge follow-up (do not auto-purge); applies to `/sitemap.xml` and `/services`

### Trading Routine Extensions (W3)

**Discovery (must precede TRADE-01/02/03)**

- [ ] **TRADE-DISC-01**: `docs/trading-routine-architecture.md` exists, mapping: existing trading-routine skills/prompts/configs/helper scripts; how Alpaca is integrated (skill direct API, MCP wrapper, other); where trade/decision/position data persists; any dashboard surface and its data source
- [ ] **TRADE-DISC-02**: Discovery doc states the install-pattern decision (Claude Code skill vs. small MCP server) for new tooling, with rationale, so subsequent phases match it

**Camoufox stealth scraping**

- [ ] **TRADE-CAM-01**: Camoufox primitive installed using the pattern documented in TRADE-DISC-02
- [ ] **TRADE-CAM-02**: Routines can fetch at least one source the previous web_search-only path could not (e.g. Cloudflare-protected financial news page)
- [ ] **TRADE-CAM-03**: Extraction at the boundary — never surfaces raw HTML payloads into routine context
- [ ] **TRADE-CAM-04**: Proxy config via env vars; no hardcoded credentials anywhere
- [ ] **TRADE-CAM-05**: Install location and invocation method documented (skill name + path, or MCP server entry)

**Fincept financial data layer**

- [ ] **TRADE-FIN-01**: Fincept layer installed using the same pattern from TRADE-DISC-02
- [ ] **TRADE-FIN-02**: Typed accessors exposed for fundamentals (income statement, balance sheet, cash flow), macro indicators (FRED, IMF), news with sentiment, and any technical indicators not already covered
- [ ] **TRADE-FIN-03**: Responses pre-filtered/structured before entering routine context; each block tagged with source for auditability
- [ ] **TRADE-FIN-04**: Config toggle (env var, skill config, or routine flag) so Fincept can be switched on/off per run; default ON for Paper, opt-in for Live
- [ ] **TRADE-FIN-05**: A test routine run on a known ticker shows Fincept-sourced fundamentals or macro context in research output with source attribution intact
- [ ] **TRADE-FIN-06**: Integration documented in `docs/fincept-integration.md`

**AutoHedge agent patterns**

- [ ] **TRADE-AH-01**: Director role ported as Claude Code skill with thesis-generation prompt structure and JSON-schema-validated output
- [ ] **TRADE-AH-02**: Quant role ported as skill with analysis prompt and schema-validated output
- [ ] **TRADE-AH-03**: Risk role ported as skill with explicit account-equity-aware position-sizing math, grounded in the active risk profile, schema-validated output
- [ ] **TRADE-AH-04**: Execution role ported as skill with schema-validated output
- [ ] **TRADE-AH-05**: AutoHedge is NOT added as a runtime dependency or imported as a Python framework — patterns only
- [ ] **TRADE-AH-06**: Orchestrating routine composes Director → Quant → Risk → Execution in sequence and validates each step's output before passing it forward
- [ ] **TRADE-AH-07**: A trade-routine run produces an explicit Risk step with concrete position-sizing numbers (not qualitative prose); all step outputs validate against schema

**W3 standing constraints**

- [ ] **TRADE-MODE-01**: Every new code path defaults to Paper mode
- [ ] **TRADE-MODE-02**: No path touches Live without an explicit confirmation gate visible in the routine prompt

## v2 Requirements (deferred)

- v2: Optional ongoing-management/care pricing tier on each W2 page (stretch in brief; deferrable if numbers not ready)
- v2: Shared `<ServicePage>` component if future W2.3+ pages emerge — premature now
- v2: Cloudflare auto-purge integration — surface manual purge for now
- v2: Direct AutoHedge runtime adapter (currently OUT — patterns only)

## Out of Scope

- New form UIs / new contact mechanism — `/contact` is the canonical CTA target — brief was specifically rewritten to remove form scope
- DB schema changes for the W2 work — not needed; pages are pure marketing
- Internal `/admin/audits` page extension — out of scope per latest brief
- `react-helmet` or other SEO library — `useEffect` head-injection is the chosen pattern
- Putting new pages back into `/services` as anchored sections — discrete URLs are the spec
- Running AutoHedge as a runtime — port patterns only
- Scheduling the trading routines on cron — they're Claude-Code-invoked, not deployed
- W1 (`context-mode` global install) — already shipped

---

## Traceability

Coverage: 38/38 active v1 requirements mapped to exactly one phase. No orphans, no duplicates.

Site-wide W2 requirements (MKTG-NAV-01, MKTG-HOME-01, MKTG-MAP-01, MKTG-CACHE-01) are partial-applied across Phases 1 and 2 — each phase touches only its own service's nav entry, homepage card, sitemap URL, and post-deploy cache-purge note. The requirement is fully satisfied only after both phases ship.

| Requirement | Phase | Notes | Status |
|-------------|-------|-------|--------|
| MKTG-AAA-01 | Phase 1 | Plan 01-01 (commit `ee36125`: route in `client/src/App.tsx`) | Complete |
| MKTG-AAA-02 | Phase 1 | Plan 01-01 (commit `65c80ec`: hero CTA → `/contact`) | Complete |
| MKTG-AAA-03 | Phase 1 | Plan 01-01 (commit `65c80ec`: 4 benefit cards) | Complete |
| MKTG-AAA-04 | Phase 1 | Plan 01-01 (commit `65c80ec`: 2 pricing tiers + ongoing strip) | Complete |
| MKTG-AAA-05 | Phase 1 | Plan 01-01 (commit `65c80ec`: 3-cell placeholder grid) | Complete |
| MKTG-AAA-06 | Phase 1 | Plan 01-01 (commit `65c80ec`: 7 FAQ entries via Accordion) | Complete |
| MKTG-AAA-07 | Phase 1 | Plan 01-01 (commit `65c80ec`: final CTA → `/contact`) | Complete |
| MKTG-AAA-08 | Phase 1 | Plan 01-01 (commit `ee36125`: useEffect head-injection w/ data-page cleanup) | Complete |
| MKTG-AAA-09 | Phase 1 | Plan 01-01 (commit `b217648`: services.tsx primitives composed verbatim) | Complete |
| MKTG-SEO-01 | Phase 2 | Phase 2 commit `701a33e`: route registered in App.tsx | Complete |
| MKTG-SEO-02 | Phase 2 | Phase 2 commit `701a33e`: hero CTA → /contact via wouter Link | Complete |
| MKTG-SEO-03 | Phase 2 | Phase 2 commit `701a33e`: 4 benefit blocks (Show up, Fix the plumbing, Page speed, Words customers search) cover meta tags / schema / broken links / page speed / on-page / structured data | Complete |
| MKTG-SEO-04 | Phase 2 | Phase 2 commit `701a33e`: 2-tier pricing (The Audit / Audit + Improvements) + ongoing-monthly strip | Complete |
| MKTG-SEO-05 | Phase 2 | Phase 2 commit `701a33e`: 3-cell social-proof grid with stat/quote/attribution placeholder structure | Complete |
| MKTG-SEO-06 | Phase 2 | Phase 2 commit `701a33e`: 7-entry FAQ accordion with Q-01..Q-07 prefix | Complete |
| MKTG-SEO-07 | Phase 2 | Phase 2 commit `701a33e`: final CTA "Let's see where you're invisible to search" → /contact | Complete |
| MKTG-SEO-08 | Phase 2 | Phase 2 commit `701a33e`: useEffect head-injection mirroring AAA contract (data-page="seo-audit-and-improvement", Service JSON-LD, provider→#org) | Complete |
| MKTG-SEO-09 | Phase 2 | Phase 2 commit `701a33e`: visual style mirrors refreshed AAA — NavBar tubelight + sticky logo nav + AnimatedContainer + bordered grid + breadcrumb + numerical hierarchy | Complete |
| MKTG-NAV-01 | Phase 1 + Phase 2 | Plan 01-02 (AAA) + Phase 2 commit `701a33e` (SEO entry in services array + mobile sub-row, Search icon import) | Complete |
| MKTG-HOME-01 | Phase 1 + Phase 2 | Plan 01-03 (AAA card) + Phase 2 commit `701a33e` (SEO sibling card replacing Phase 2 placeholder comment) | Complete |
| MKTG-MAP-01 | Phase 1 + Phase 2 | Plan 01-04 (AAA URL) + Phase 2 commit `701a33e` (SEO URL inserted between AAA and /audits in staticUrls) | Complete |
| MKTG-CACHE-01 | Phase 1 + Phase 2 | Plan 01-05 CACHE-PURGE.md applies to both Phase 1 and Phase 2 deploys (manual purge of /sitemap.xml, /services, /) | Complete |
| TRADE-DISC-01 | Phase 3 | `docs/trading-routine-architecture.md` enumerates routine prompts (`docs/ROUTINE_PROMPT_*.md`), server modules (`server/trader.ts`, `predictor.ts`), Alpaca direct-REST integration (`server/trader.ts:222`), persistence (raw-SQL `trader_*` + `predictor_*` Postgres tables, NOT Drizzle), and dashboard surface (9 admin pages, 7 endpoints). | Complete |
| TRADE-DISC-02 | Phase 3 | Install-pattern decision: project-level Claude Code skill (`.claude/skills/<name>/SKILL.md` in repo) + thin Express endpoint behind `x-jdcd-agent-key` for server-side state/secrets. Mirrors existing Alpaca/Kalshi split. Phases 4, 5, 6 must follow. | Complete |
| TRADE-CAM-01 | Phase 4 | | Pending |
| TRADE-CAM-02 | Phase 4 | | Pending |
| TRADE-CAM-03 | Phase 4 | | Pending |
| TRADE-CAM-04 | Phase 4 | | Pending |
| TRADE-CAM-05 | Phase 4 | | Pending |
| TRADE-FIN-01 | Phase 5 | | Pending |
| TRADE-FIN-02 | Phase 5 | | Pending |
| TRADE-FIN-03 | Phase 5 | | Pending |
| TRADE-FIN-04 | Phase 5 | | Pending |
| TRADE-FIN-05 | Phase 5 | | Pending |
| TRADE-FIN-06 | Phase 5 | | Pending |
| TRADE-AH-01 | Phase 6 | | Pending |
| TRADE-AH-02 | Phase 6 | | Pending |
| TRADE-AH-03 | Phase 6 | | Pending |
| TRADE-AH-04 | Phase 6 | | Pending |
| TRADE-AH-05 | Phase 6 | | Pending |
| TRADE-AH-06 | Phase 6 | | Pending |
| TRADE-AH-07 | Phase 6 | | Pending |
| TRADE-MODE-01 | Phase 4 + Phase 5 + Phase 6 | Standing constraint; every new W3 code path defaults to Paper | Pending |
| TRADE-MODE-02 | Phase 4 + Phase 5 + Phase 6 | Standing constraint; Live only via explicit confirmation gate | Pending |
