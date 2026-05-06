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

- **Phase:** 1 — AI Advertising Audit page
- **Plan:** 01-05 complete (CACHE-PURGE.md note landed); next plan TBD per phase-1 plan suite
- **Status:** In progress — Phase 1 plan 05 (cache-purge follow-up note) shipped
- **Progress:** 0/6 phases complete `[░░░░░░]`

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

- **2026-05-06** — gsd-executor: shipped Phase 1 Plan 05 (cache-purge follow-up note). Created `.planning/phases/01-ai-advertising-audit-page/CACHE-PURGE.md` documenting the manual Cloudflare purge procedure (URLs: `/sitemap.xml`, `/services`, `/`), wrangler + dashboard options, do-not-paste-tokens guidance, and v2 hand-off for auto-purge. 1 task, 1 commit (`f4e8ec5`).
- **2026-05-06** — gsd-roadmapper: extracted requirements from PROJECT.md + REQUIREMENTS.md, mapped 38 active v1 REQ-IDs to 6 phases (phase order pre-locked by user), wrote ROADMAP.md, initialized STATE.md, populated REQUIREMENTS.md Traceability section.

### Next up

- Continue Phase 1 plan suite (plans 01-04 — AAA page route, hero+benefits, pricing+FAQ+social-proof, nav+homepage+sitemap wiring).
- After Phase 1 deploys to production: Josh runs the manual purge per `.planning/phases/01-ai-advertising-audit-page/CACHE-PURGE.md`.
- One PR for Phase 1, then `/gsd-transition` to Phase 2.

---
*Updated: 2026-05-06 by gsd-executor.*
