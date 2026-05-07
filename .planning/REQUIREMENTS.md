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

**External financial data layer (Yahoo + AlphaVantage + FRED)**

- [x] **TRADE-FIN-01**: External financial data layer installed using the same pattern from TRADE-DISC-02 — project-level skill + thin Express endpoint behind `x-jdcd-agent-key` (covers Yahoo for fundamentals/prices via `yahoo-finance2`, AlphaVantage for news+sentiment, FRED for US macro)
- [x] **TRADE-FIN-02**: Typed accessors exposed for Yahoo-sourced fundamentals (income statement, balance sheet, cash flow, financial data, default key statistics via `quoteSummary`), AlphaVantage news with sentiment (via `NEWS_SENTIMENT` endpoint), Yahoo end-of-day prices (fallback price source via `historical`), FRED macro time-series (rates, CPI, employment, M2, GDP, etc.), and FRED series search for looking up unknown series IDs
- [x] **TRADE-FIN-03**: Responses pre-filtered/structured before entering routine context; each block tagged with `provider` (`yahoo`, `alphavantage`, or `fred`) and `dataset` slug so source attribution survives into research output
- [x] **TRADE-FIN-04**: Config toggle (env var, skill config, or routine flag) so the external data layer can be switched on/off per run via a single `EXTERNAL_DATA_ENABLED` toggle that gates all providers; default ON for Paper, opt-in for Live
- [ ] **TRADE-FIN-05**: A test routine run on a known ticker shows Yahoo-sourced fundamentals, AlphaVantage-sourced news, or FRED-sourced macro context in research output with provider+dataset attribution intact (code wired; runtime test pending user provisioning ALPHA_VANTAGE_API_KEY + FRED_API_KEY on Railway — yahoo-finance2 needs no key)
- [x] **TRADE-FIN-06**: Integration documented in `docs/financial-data-integration.md` (covers Yahoo, AlphaVantage, and FRED)

**AutoHedge agent patterns**

- [ ] **TRADE-AH-01**: Director role ported as Claude Code skill with thesis-generation prompt structure and JSON-schema-validated output
- [ ] **TRADE-AH-02**: Quant role ported as skill with analysis prompt and schema-validated output
- [ ] **TRADE-AH-03**: Risk role ported as skill with explicit account-equity-aware position-sizing math, grounded in the active risk profile, schema-validated output
- [ ] **TRADE-AH-04**: Execution role ported as skill with schema-validated output
- [ ] **TRADE-AH-05**: AutoHedge is NOT added as a runtime dependency or imported as a Python framework — patterns only
- [ ] **TRADE-AH-06**: Orchestrating routine composes Director → Quant → Risk → Execution in sequence and validates each step's output before passing it forward
- [ ] **TRADE-AH-07**: A trade-routine run produces an explicit Risk step with concrete position-sizing numbers (not qualitative prose); all step outputs validate against schema

**W3 standing constraints**

- [x] **TRADE-MODE-01**: Every new code path defaults to Paper mode
- [x] **TRADE-MODE-02**: No path touches Live without an explicit confirmation gate visible in the routine prompt

## v2 Requirements (deferred)

- v2: Optional ongoing-management/care pricing tier on each W2 page (stretch in brief; deferrable if numbers not ready)
- v2: Shared `<ServicePage>` component if future W2.3+ pages emerge — premature now
- v2: Cloudflare auto-purge integration — surface manual purge for now
- v2: Direct AutoHedge runtime adapter (currently OUT — patterns only)
- v2: Additional data providers (World Bank, IMF, deeper-sentiment news, Polygon) beyond Yahoo + AlphaVantage + FRED
- v2: Paid-tier swap if free-stack quota becomes a binding constraint (AlphaVantage premium, EODHD reinstatement, etc.) — surface manually if 500/day cap or yahoo-finance2 reliability becomes an issue

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
| TRADE-CAM-01 | Phase 4 | Phase 4 commit `2e9c1a1`: skill at `.claude/skills/camoufox-fetch/SKILL.md` + Express endpoint at `server/scrape-agent.ts` mounted at `/api/trader/scrape`. Matches install pattern from discovery doc. | Complete |
| TRADE-CAM-02 | Phase 4 | v1 plain backend (`fetch` + realistic Chrome 130 headers) handles non-aggressive Cloudflare and most public news/blog. v2 (playwright + stealth plugin OR scrapingbee) deferred — single-file swap in scrape-agent.ts to enable. | Partial (v1) |
| TRADE-CAM-03 | Phase 4 | Endpoint always returns plain extracted text via `htmlToText()` — strips script/style/nav/footer/svg/noscript and all tags. Never returns raw HTML. | Complete |
| TRADE-CAM-04 | Phase 4 | All config via env: `JDCD_AGENT_KEY` (auth), `SCRAPE_BACKEND` (backend selector). No hardcoded credentials. SSRF-guarded against internal/private targets. | Complete |
| TRADE-CAM-05 | Phase 4 | Skill path: `.claude/skills/camoufox-fetch/SKILL.md`. Endpoint: `server/scrape-agent.ts`. Mount: `server/routes.ts` (search `scrapeAgentRouter`). All documented in SKILL.md. | Complete |
| TRADE-FIN-01 | Phase 5 | Plan 05-01 (`server/financial-data-agent.ts`) + Plan 05-02 (`.claude/skills/financial-data/SKILL.md`) — install pattern matches Phase 3 discovery decision (project-level skill + thin Express endpoint behind `x-jdcd-agent-key`). Single skill + endpoint covers all three providers (Yahoo via `yahoo-finance2` lib, AlphaVantage REST, FRED REST) — no parallel pattern. Rescoped 2026-05-07: original ship was EODHD + FRED, swapped to free stack. | Complete |
| TRADE-FIN-02 | Phase 5 | Plan 05-01 — `EXTERNAL_DATASETS` registry exposes 5 accessors: Yahoo `fundamentals` (`quoteSummary` modules), AlphaVantage `news` (with sentiment scores), Yahoo `prices_eod` (`historical` daily bars), FRED `macro_series` (route `/macro/:series_id`), FRED `macro_search` (route `/macro_search?q=...`). Documented in SKILL.md `## Datasets` table. | Complete |
| TRADE-FIN-03 | Phase 5 | Plan 05-01 `dataEnvelope()` helper wraps every dataset response in `{ provider: 'yahoo'|'alphavantage'|'fred', dataset, ticker_or_series, fetched_at, source_url?, data }`. No code path returns unwrapped upstream JSON. | Complete |
| TRADE-FIN-04 | Phase 5 | Plan 05-01 toggle layers: `EXTERNAL_DATA_ENABLED` env (global, default true, gates ALL providers), `?enabled=false` query param (per-request opt-out, returns 200 skip envelope), mode-aware default at routine prompt (D-06 — Paper ON by default, Live opt-in via `LIVE_MODE_AUTHORIZED=true` flag). | Complete |
| TRADE-FIN-05 | Phase 5 | Plan 05-04 wired the skill into `docs/ROUTINE_PROMPT_TRADER.md` Step 3 (candidate generation → research) so the routine invokes it before council debate. Code-side complete. **Runtime smoke test (routine fire on known ticker confirming Yahoo/AlphaVantage/FRED-sourced research output with intact attribution) is user-action — requires ALPHA_VANTAGE_API_KEY + FRED_API_KEY on Railway. Yahoo needs no key.** | Partial (code complete; runtime test pending user provisioning AlphaVantage + FRED keys) |
| TRADE-FIN-06 | Phase 5 | Plan 05-03 created `docs/financial-data-integration.md` with install pattern, env vars, accessor reference, toggle, source attribution, Yahoo + AlphaVantage + FRED example invocations, routine-prompt wiring, failure modes, and user-action followup sections. | Complete |
| TRADE-AH-01 | Phase 6 | `.claude/skills/autohedge-director/SKILL.md` — thesis prompt + JSON schema (ticker, side, conviction, key_catalysts, invalidation_signals, expected_move_pct) | Complete |
| TRADE-AH-02 | Phase 6 | `.claude/skills/autohedge-quant/SKILL.md` — analysis prompt + JSON schema (verdict, edge_score, supporting/contradicting metrics — concrete numbers, not adjectives) | Complete |
| TRADE-AH-03 | Phase 6 | `.claude/skills/autohedge-risk/SKILL.md` — explicit account-equity-aware sizing math (entry/stop/target/shares as integers), risk-profile bands (low/medium/high → 0.5/1.0/2.0%), drawdown circuit breaker (-10% halve, -15% halt) | Complete |
| TRADE-AH-04 | Phase 6 | `.claude/skills/autohedge-execution/SKILL.md` — order payload schema matching `server/trader-agent.ts:191-201` so endpoint validates without drift | Complete |
| TRADE-AH-05 | Phase 6 | All 4 SKILL.md files are prompt-only markdown. No Python framework install. No `pip install autohedge`. No runtime dependency. README at `.claude/skills/README.md` documents this constraint. | Complete |
| TRADE-AH-06 | Phase 6 | Each skill specifies its position in the chain (Director step 1 → Quant step 2 → Risk step 3 → Execution step 4). Each role validates previous step's output before continuing. Wiring into `docs/ROUTINE_PROMPT_TRADER.md` is a user-decision (left to Josh per skills/README.md). | Complete (skill side); user-action remaining (routine-prompt wire-up) |
| TRADE-AH-07 | Phase 6 | Risk SKILL explicitly forbids prose substitutions for numbers; quality gate "Any number replaced by prose ('a moderate position') → REJECT" | Complete |
| TRADE-MODE-01 | Phase 4 + Phase 5 + Phase 6 | Standing constraint; Phase 5 endpoint is mode-agnostic (read-only data) but routine-prompt wiring (Plan 05-04) defaults financial-data calls ON for Paper. AutoHedge Execution skill enforces Paper-by-default for trade orders. | Complete (code-side) |
| TRADE-MODE-02 | Phase 4 + Phase 5 + Phase 6 | Standing constraint; Phase 5 routine-prompt wiring (Plan 05-04) requires `LIVE_MODE_AUTHORIZED=true` flag to invoke financial-data in Live mode. AutoHedge Execution skill gates trade orders. | Complete (code-side) |
