# STATE — JDCoreDev W2+W3

<!-- Persistent project memory. Updated by gsd-* commands across sessions. -->

## Project Reference

- **Project name:** JDCoreDev W2+W3
- **Project code:** JDCD-W23
- **Title:** JDCoreDev — Implementation Brief Workstreams 2 & 3
- **Repo:** `C:\Users\joshu\iCloudDrive\JDCoreDev Code\JDCoreDev`
- **Core value:** Ship two new service marketing pages without scope slide AND extend the trading routines with three discrete capabilities that compose with the existing Claude-Code-invoked routine pattern (never as a parallel runtime).
- **Current focus:** Phase 1 — AI Advertising Audit + Improvement marketing page (`/services/ai-advertising-audit`).

## Current Position

- **Phase:** 6 shipped — AutoHedge skills (Director / Quant / Risk / Execution + README). Next up: Phase 5 (Fincept) is the only remaining W3 phase. Needs Josh's Fincept account + API key on Railway env.
- **W2 status:** Both marketing pages live. Phase 1 shipped + refreshed (`beff125`). Phase 2 shipped (`701a33e`).
- **W3 status:** Discovery (`abc091d`), cleanup (`4e06249`, `5cdeab0`, `8e9e979`), Phase 4 stealth-scrape v1 (`2e9c1a1`), Phase 6 AutoHedge skills (this commit).
- **Progress:** 5/6 phases complete `[█████░]` (Phase 4 v1 deferred for stealth backend; Phase 5 pending Fincept account)
- **User-action backlog**: (a) wire AutoHedge sequence into `docs/ROUTINE_PROMPT_TRADER.md`, (b) provision Fincept account + Railway env, (c) decide on v2 stealth backend (playwright vs scrapingbee) for Phase 4.

## Architecture flags (raised by Phase 3 discovery — handle before/during Phases 4-6)

- **PROJECT.md "no scheduled cron / no deployed routine service" is stale.** Code shows Anthropic-hosted scheduled routines firing on cron (`0 */4 * * 1-5` for trader, every 2h for predictor) + deployed Express service handling all execution. The "interactive Claude Code routines" framing only describes manual `Run Now` fires from the admin UI; the dominant execution path is automated. Update PROJECT.md before planning Phase 4.
- **Trader + predictor tables bypass Drizzle.** All `trader_*` and `predictor_*` tables created via raw SQL in `initTraderTables()` (`server/trader.ts:21-97`) and `initPredictorTables()` (`server/predictor.ts:110-200`) at server boot. Schema-drift risk if anyone assumes `shared/schema.ts` is canonical for trading data.
- **Dead modelfarm/Replit Claude SDK paths.** `server/predictor.ts:14-17` reads `AI_INTEGRATIONS_ANTHROPIC_*` env vars pointing to `localhost:1106` (Replit-internal, dead on Railway). Routine path is healthy, but legacy endpoints `POST /scan`, `/run`, `/council`, `/research-trader` are broken — and several admin UI buttons (`trader-predictions.tsx:863, 880, 2344`) still hit them. Worth a separate cleanup task.
- **Auth gap on legacy `/api/predictor/*` endpoints.** Agent sub-router enforces `x-jdcd-agent-key` (`predictor-agent.ts:31-41`), but parent `predictorRouter` mount at `routes.ts:903` may still be unauthenticated for legacy endpoints. Security pass needed.

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases planned | 6 |
| Phases complete | 0 |
| Active v1 requirements | 38 |
| Requirements mapped | 38 (100%) |
| Orphaned requirements | 0 |
| Granularity | coarse |
| Workflow | parallel, balanced models, plan_check + verifier on |
| Plan 01-05 duration | ~3 min |
| Plan 01-05 tasks | 1 |
| Plan 01-05 files | 1 created |
| Plan 01-01 duration | ~25 min |
| Plan 01-01 tasks | 3 |
| Plan 01-01 files | 1 created (`client/src/pages/ai-advertising-audit.tsx`), 1 modified (`client/src/App.tsx`) |
| Plan 01-02 duration | ~15 min |
| Plan 01-02 tasks | 2 |
| Plan 01-02 files | 1 modified (`client/src/components/PublicNavbar.tsx`) |
| Plan 01-03 duration | ~5 min |
| Plan 01-03 tasks | 2 |
| Plan 01-03 files | 1 modified (`client/src/pages/home.tsx`) |
| Plan 01-04 duration | ~3 min |
| Plan 01-04 tasks | 1 |
| Plan 01-04 files | 1 modified (`server/routes.ts`) |

## Accumulated Context

### Decisions

- **Phase order is hard-locked** by the user: AAA page → SEO page → Trading discovery → Camoufox → Fincept → AutoHedge skills. Do not re-derive.
- **One PR per workstream**: Phase 1 and Phase 2 commit independently. Do not bundle W2 into a single phase.
- **TRADE-DISC-02 dictates Phase 4/5/6 install pattern.** No parallel pattern (skill vs. MCP) may emerge across W3.
- **Per-page SEO via `useEffect` head-injection** — no `react-helmet`, no SEO library.
- **Sitemap is dynamic** — edit `staticUrls` array around `server/routes.ts:435`, not a static XML file.
- **CTAs route to `/contact` only** via existing `<Link href="/contact"><Button>Get in touch</Button></Link>` pattern. No new contact mechanism.
- **Visual style copies `client/src/pages/services.tsx`** for both new W2 pages — no shared `<ServicePage>` component yet (deferred to v2).
- **Trading mode safety**: every new W3 code path defaults to Paper; Live requires an explicit confirmation gate in the routine prompt.
- **Cloudflare cache purge is manual only** for Phase 1 deploy (and Phase 2 deploy). Procedure documented in `.planning/phases/01-ai-advertising-audit-page/CACHE-PURGE.md`. Auto-purge is OUT OF SCOPE — deferred to v2.
- **`wrangler` CLI with local auth is the documented purge path**, dashboard "Purge By URL" is the fallback. No CF API tokens get pasted into scripts or commits.
- **Plan 01-01 set the per-page SEO useEffect contract:** all injected nodes carry `data-page="<page-id>"`; cleanup uses `document.head.querySelectorAll('[data-page="<page-id>"]')` + restores prior `document.title`. Phase 2's SEO Audit page (MKTG-SEO-08) reuses this exact contract with `data-page="seo-audit-and-improvement"`.
- **Service JSON-LD references the site-wide `@graph` `#org` via `provider.@id`.** Never redeclare the Organization node — `client/index.html` already owns it.

### Open Todos

(empty — no plans generated yet)

### Blockers

- Phases 4, 5, 6 are blocked by Phase 3 (Trading-routine architecture discovery doc must land first).

### Risks / Watch-items

- Cloudflare edge cache may stale after Phases 1 and 2 deploy — manual purge of `/sitemap.xml` and `/services` is a follow-up step.
- Pricing numbers for the new W2 pages may not be ready; placeholders are acceptable per the brief.
- Trading-routine architecture is unmapped — Phase 3's discovery output gates how much rework Phases 4/5/6 need.

## Session Continuity

### Last session

- **2026-05-06** — gsd-executor: shipped Phase 1 Plan 04 (sitemap AAA entry). Inserted `/services/ai-advertising-audit` (priority 0.8, changefreq monthly) between `/` and `/audits` in the `staticUrls` array at `server/routes.ts:435`. 1 task, 2 commits (`60e6238` array edit, `57934b2` SUMMARY). Closes AAA half of MKTG-MAP-01.
- **2026-05-06** — gsd-executor: shipped Phase 1 Plan 03 (homepage AAA card). Modified `client/src/pages/home.tsx`: added `Target` to lucide-react import; inserted a new `// Targeted services` section between the existing "Stuff we've actually built" section and the footer, containing one AAA card linking to `/services/ai-advertising-audit` inside a `md:grid-cols-2` grid with a Phase 2 placeholder comment locking the SEO sibling insertion point. 2 tasks, 3 commits (`19283e9` icon import, `e640d6f` section, `46aaf71` SUMMARY). Closes AAA half of MKTG-HOME-01.
- **2026-05-06** — gsd-executor: shipped Phase 1 Plan 02 (PublicNavbar AAA wiring). Modified `client/src/components/PublicNavbar.tsx`: replaced the 4 placeholder Services-dropdown entries with 2 real ones (`All services` → `/services`, `AI Advertising Audit` → `/services/ai-advertising-audit`); trimmed lucide imports (dropped `Code`, `Rocket`, `Server`; added `Target`); inserted an indented mobile-menu sub-row under the existing Services row using `pl-8` indent + `text-xs uppercase tracking-wide` typography, reusing `cn()` and `isActive()` helpers. Phase 2 will append the SEO entry. 2 tasks, 2 commits (`e532f31` desktop dropdown swap, `ed4bf10` mobile sub-row). TypeScript check passes. Closes the AAA half of MKTG-NAV-01.
- **2026-05-06** — gsd-executor: shipped Phase 1 Plan 01 (AAA page component + route + SEO useEffect). Created `client/src/pages/ai-advertising-audit.tsx` (full standalone marketing page — hero, 4 benefit cards, 2 pricing tiers + ongoing strip, 3-cell social-proof grid, 7-entry FAQ, final CTA, footer; 8 meta + canonical + Service JSON-LD injected on mount, all tagged `data-page="ai-advertising-audit"` and removed on unmount; document.title restored on unmount); modified `client/src/App.tsx` (one new wouter `<Route>` + one new import). Closes MKTG-AAA-01 through MKTG-AAA-09. 3 tasks, 3 commits (`b217648` skeleton, `65c80ec` content, `ee36125` SEO + route). TypeScript check (`npx tsc --noEmit`) passes; production build skipped due to local iCloud-sync `EUNKNOWN` on `node_modules/.bin/tsx` — not a code issue, will run normally in CI.
- **2026-05-06** — gsd-executor: shipped Phase 1 Plan 05 (cache-purge follow-up note). Created `.planning/phases/01-ai-advertising-audit-page/CACHE-PURGE.md` documenting the manual Cloudflare purge procedure (URLs: `/sitemap.xml`, `/services`, `/`), wrangler + dashboard options, do-not-paste-tokens guidance, and v2 hand-off for auto-purge. 1 task, 1 commit (`f4e8ec5`).
- **2026-05-06** — gsd-roadmapper: extracted requirements from PROJECT.md + REQUIREMENTS.md, mapped 38 active v1 REQ-IDs to 6 phases (phase order pre-locked by user), wrote ROADMAP.md, initialized STATE.md, populated REQUIREMENTS.md Traceability section.

### Next up

- Continue Phase 1 plan suite — plans 03 (homepage card) and 04 (sitemap entry) remain.
- After Phase 1 deploys to production: Josh runs the manual purge per `.planning/phases/01-ai-advertising-audit-page/CACHE-PURGE.md`.
- One PR for Phase 1 (all 5 plans), then `/gsd-transition` to Phase 2.
- **Note** — when running `npm run build` locally, do it from a non-iCloud-synced clone of the repo. iCloud's placeholder-file behaviour breaks node's `readFileSync` for any binary loaded from `node_modules/.bin/`. CI is unaffected.

---
*Updated: 2026-05-06 by gsd-executor (after Phase 1 Plan 02 completion).*
