# ROADMAP — JDCoreDev W2+W3

**Project:** JDCoreDev — Implementation Brief Workstreams 2 & 3
**Project code:** JDCD-W23
**Granularity:** coarse
**Workflow:** parallel, balanced models, plan_check + verifier on
**Coverage:** 38/38 active v1 requirements mapped to a single phase

## Phases

- [ ] **Phase 1: AI Advertising Audit page** — Ship `/services/ai-advertising-audit` end-to-end (route, page, nav, homepage card, sitemap)
- [ ] **Phase 2: SEO Audit page** — Ship `/services/seo-audit-and-improvement` end-to-end (route, page, nav, homepage card, sitemap)
- [ ] **Phase 3: Trading-routine architecture discovery** — Produce `docs/trading-routine-architecture.md` with the install-pattern decision
- [ ] **Phase 4: Camoufox stealth scraping primitive** — Install Camoufox per Phase 3 pattern; routines can fetch a previously-blocked source
- [x] **Phase 5: External financial data layer (Yahoo + AlphaVantage + FRED)** — Free-stack external data per Phase 3 pattern; routines see source-attributed fundamentals/news/macro (rescoped from EODHD on 2026-05-07)
- [ ] **Phase 6: AutoHedge agent patterns as Claude Code skills** — Director / Quant / Risk / Execution roles with schema-validated outputs

## Phase Details

### Phase 1: AI Advertising Audit page
**Goal**: A real visitor on jdcoredev.com can navigate to the AI Advertising Audit + Improvement service via nav or homepage, read the page, and click through to `/contact`.
**Depends on**: Nothing (independent of Phase 2; user will ship this first)
**Requirements**:
- Page-specific: MKTG-AAA-01, MKTG-AAA-02, MKTG-AAA-03, MKTG-AAA-04, MKTG-AAA-05, MKTG-AAA-06, MKTG-AAA-07, MKTG-AAA-08, MKTG-AAA-09
- AAA portion of site-wide: MKTG-NAV-01 (AAA entry only), MKTG-HOME-01 (AAA card only), MKTG-MAP-01 (AAA URL only), MKTG-CACHE-01 (AAA-deploy purge note)
**Success Criteria** (what must be TRUE on production after this phase ships):
  1. Hitting `https://jdcoredev.com/services/ai-advertising-audit` directly returns the new page with hero, 3-5 benefit blocks, 2-tier pricing, social-proof slot, 5-8 FAQ entries, and final CTA strip — no console errors.
  2. The PublicNavbar Services entry exposes the AI Advertising Audit page; clicking it navigates to the new route.
  3. The homepage shows a card for the AI Advertising Audit service that links to the new route.
  4. `https://jdcoredev.com/sitemap.xml` includes `/services/ai-advertising-audit` with a sensible `priority` and `changefreq`.
  5. Every CTA on the page (`Get in touch`, hero CTA, final strip) routes to `/contact` via the existing wouter `<Link href="/contact">` pattern.
**Plans**: TBD
**UI hint**: yes

### Phase 2: SEO Audit page
**Goal**: A real visitor on jdcoredev.com can navigate to the SEO Audit + Improvement service via nav or homepage, read the page, and click through to `/contact`.
**Depends on**: Nothing (independent of Phase 1; user will ship this after Phase 1 lands)
**Requirements**:
- Page-specific: MKTG-SEO-01, MKTG-SEO-02, MKTG-SEO-03, MKTG-SEO-04, MKTG-SEO-05, MKTG-SEO-06, MKTG-SEO-07, MKTG-SEO-08, MKTG-SEO-09
- SEO portion of site-wide: MKTG-NAV-01 (SEO entry only), MKTG-HOME-01 (SEO card only), MKTG-MAP-01 (SEO URL only), MKTG-CACHE-01 (SEO-deploy purge note)
**Success Criteria** (what must be TRUE on production after this phase ships):
  1. Hitting `https://jdcoredev.com/services/seo-audit-and-improvement` directly returns the new page with hero, 3-5 benefit blocks, 2-tier pricing, social-proof slot, 5-8 FAQ entries, and final CTA strip — no console errors.
  2. The PublicNavbar Services entry exposes the SEO Audit page (alongside the AAA entry shipped in Phase 1); clicking it navigates to the new route.
  3. The homepage shows a card for the SEO Audit service that links to the new route, alongside the AAA card.
  4. `https://jdcoredev.com/sitemap.xml` includes `/services/seo-audit-and-improvement` with sensible `priority` and `changefreq`, alongside the AAA entry.
  5. Every CTA on the page routes to `/contact` via the existing `<Link href="/contact">` pattern.
**Plans**: TBD
**UI hint**: yes

### Phase 3: Trading-routine architecture discovery
**Goal**: Anyone (Josh or future Claude) opening the discovery doc can answer "where does Alpaca plug in, where does state persist, and should new tooling be a Claude Code skill or an MCP server?" without re-reading the codebase.
**Depends on**: Nothing (must complete before Phases 4, 5, 6)
**Requirements**: TRADE-DISC-01, TRADE-DISC-02
**Success Criteria** (what must be TRUE when this phase completes):
  1. `docs/trading-routine-architecture.md` exists at the repo root and is committed.
  2. The doc enumerates every existing trading-routine skill / prompt / config / helper script with its file path.
  3. The doc states explicitly how Alpaca is integrated today (skill direct API call vs. MCP wrapper vs. other) and where trade/decision/position data persists.
  4. The doc names any dashboard surface for the trading routines and identifies its data source.
  5. The doc states an unambiguous install-pattern decision (Claude Code skill OR small MCP server) for new tooling, with a one-paragraph rationale, so Phases 4/5/6 cannot drift into a parallel pattern.
**Plans**: TBD

### Phase 4: Camoufox stealth scraping primitive
**Goal**: A trading routine run can pull content from a source the previous `web_search`-only path could not reach (e.g. a Cloudflare-protected financial news page) via Camoufox.
**Depends on**: Phase 3 (TRADE-DISC-02 install-pattern decision)
**Requirements**: TRADE-CAM-01, TRADE-CAM-02, TRADE-CAM-03, TRADE-CAM-04, TRADE-CAM-05; TRADE-MODE-01 (Camoufox is read-only research, but any new code path defaults to Paper); TRADE-MODE-02 (no Live without explicit gate)
**Success Criteria** (what must be TRUE when this phase completes):
  1. Camoufox is installed using the exact install pattern documented in `docs/trading-routine-architecture.md` (skill OR MCP server) — no parallel pattern introduced.
  2. A real Claude Code routine invocation pulls a previously-blocked source and uses extracted structured content (not raw HTML) inside the routine.
  3. Routine context contains extracted/structured data only — raw HTML never surfaces into the conversation.
  4. Proxy and any auth config flow from environment variables; no credentials hardcoded in skill files, prompts, or scripts.
  5. The skill name + path (or the MCP server entry) is documented so a future Claude session can locate and invoke the primitive without re-discovery.
**Plans**: TBD

### Phase 5: External financial data layer (Yahoo + AlphaVantage + FRED)
**Goal**: A trading routine run on a known ticker shows Yahoo-sourced fundamentals, AlphaVantage-sourced news with sentiment, or FRED-sourced macro context in its research output with provider+dataset attribution intact.
**Depends on**: Phase 3 (TRADE-DISC-02 install-pattern decision)
**Requirements**: TRADE-FIN-01, TRADE-FIN-02, TRADE-FIN-03, TRADE-FIN-04, TRADE-FIN-05, TRADE-FIN-06; TRADE-MODE-01 (default Paper); TRADE-MODE-02 (no Live without gate)
**Success Criteria** (what must be TRUE when this phase completes):
  1. The external financial data layer is installed using the same pattern documented in `docs/trading-routine-architecture.md` as Camoufox — single pattern across W3. All three providers (Yahoo, AlphaVantage, FRED) ride the same project-level skill + thin Express endpoint shape.
  2. Typed accessors exist for: Yahoo-sourced fundamentals (income statement, balance sheet, cash flow, financial data, key statistics), AlphaVantage-sourced news with sentiment, Yahoo-sourced end-of-day prices (fallback price source), FRED macro time-series, and FRED series search for unknown indicator codes.
  3. A test run on a known ticker produces research output where each externally-sourced block is tagged with `provider` (`yahoo`, `alphavantage`, or `fred`) and `dataset` so a reader can audit where each number came from.
  4. A config toggle (env var, skill config, or routine flag) switches the external data layer on/off per run via `EXTERNAL_DATA_ENABLED` (single toggle gates all providers); the default is ON for Paper and opt-in for Live.
  5. `docs/financial-data-integration.md` exists and documents the install pattern, the Yahoo + AlphaVantage + FRED accessor surface, the toggle, and at least one example invocation per provider.
**Plans**: 4 plans
- [x] 05-01-PLAN.md — Backend: `server/financial-data-agent.ts` Express router at `/api/trader/data/:dataset/:ticker_or_series` (and `/api/trader/data/macro/:series_id` for FRED) behind `x-jdcd-agent-key`, Yahoo + AlphaVantage + FRED dataset registry, source-attribution envelope, toggle layers
- [x] 05-02-PLAN.md — Skill: `.claude/skills/financial-data/SKILL.md` + `.claude/skills/README.md` index update
- [x] 05-03-PLAN.md — Docs: `docs/financial-data-integration.md` with install pattern, accessor reference, toggle, Yahoo + AlphaVantage + FRED example invocations, user-action followup
- [x] 05-04-PLAN.md — Routine-prompt wire-up (`docs/ROUTINE_PROMPT_TRADER.md`) + Phase 5 status flip in STATE.md / ROADMAP.md / REQUIREMENTS.md

### Phase 6: AutoHedge agent patterns as Claude Code skills
**Goal**: A trade-routine run produces a Director → Quant → Risk → Execution sequence where the Risk step shows concrete position-sizing numbers (not qualitative prose), and every step's output validates against its schema before being passed forward.
**Depends on**: Phase 3 (TRADE-DISC-02 install-pattern decision)
**Requirements**: TRADE-AH-01, TRADE-AH-02, TRADE-AH-03, TRADE-AH-04, TRADE-AH-05, TRADE-AH-06, TRADE-AH-07; TRADE-MODE-01 (default Paper); TRADE-MODE-02 (no Live without gate)
**Success Criteria** (what must be TRUE when this phase completes):
  1. Four Claude Code skills exist — Director (thesis), Quant (analysis), Risk (account-equity-aware position sizing grounded in the active risk profile), Execution — each with a schema-validated output contract.
  2. AutoHedge is NOT a Python runtime dependency, NOT imported as a framework, and NOT scheduled — patterns are ported into Claude Code skills only.
  3. An orchestrating routine composes Director → Quant → Risk → Execution in sequence and validates each step's JSON output before passing it forward; a malformed step output halts the chain.
  4. A real trade-routine run produces a Risk step containing concrete numbers — account equity, max risk %, position size in shares/contracts, stop-loss level — not prose.
  5. The full chain runs in Paper by default; Live can only be reached via an explicit confirmation gate visible in the routine prompt.
**Plans**: TBD

## Dependencies

```
Phase 1 (AAA page) ────────┐
                           │  (independent)
Phase 2 (SEO page) ────────┘

Phase 3 (Discovery) ──┬──> Phase 4 (Camoufox)
                      ├──> Phase 5 (Yahoo + AlphaVantage + FRED)
                      └──> Phase 6 (AutoHedge skills)
```

- Phase 1 and Phase 2 are independent of each other and of Phases 3-6. User intent: ship Phase 1 first, then Phase 2.
- Phase 3 hard-blocks Phases 4, 5, 6 (TRADE-DISC-02 dictates the install pattern).
- Phases 4, 5, 6 are independent of each other once Phase 3 lands and may run in any order.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. AI Advertising Audit page | 5/5 | Complete (refreshed aesthetic in commit `beff125`) | 2026-05-06 |
| 2. SEO Audit page | 1/1 | Complete (single shipping commit `701a33e`) | 2026-05-06 |
| 3. Trading-routine architecture discovery | 1/1 | Complete (`docs/trading-routine-architecture.md`) | 2026-05-06 |
| 4. Camoufox stealth scraping primitive | 1/1 | v1 shipped (commit `2e9c1a1`) — plain backend live; v2 stealth backend deferred | 2026-05-06 |
| 5. External financial data layer (Yahoo + AlphaVantage + FRED) | 4/4 | Code-side complete; rescoped 2026-05-07 from EODHD to free stack (yahoo-finance2 lib + AlphaVantage free tier + FRED). Runtime activation pending ALPHA_VANTAGE_API_KEY + FRED_API_KEY on Railway (yahoo needs no key). | 2026-05-07 |
| 6. AutoHedge agent patterns | 1/1 | 4 SKILL.md files shipped (Director / Quant / Risk / Execution) — wiring into routine prompts is user-action | 2026-05-06 |

## Notes

- One PR per phase. Phases 1 and 2 are deliberately split per user instruction ("one PR per workstream"); do not collapse into a single W2 phase.
- Cloudflare cache purge for `/sitemap.xml` and `/services` is a manual follow-up after each W2 deploy (Phases 1 and 2). Auto-purge is a v2 item.
- Phase 3 produces a doc only — no code, no install. Its output is the contract Phases 4/5/6 must obey.
- All W3 phases (4, 5, 6) inherit the standing TRADE-MODE-01/02 constraints: Paper by default, Live only via explicit confirmation gate.
- **Phase 5 rescope (2026-05-07):** swapped EODHD All-in-One ($19.99/mo) for a free stack — `yahoo-finance2` (no key, fundamentals + EOD prices) + AlphaVantage free tier (news with sentiment, 500/day) + FRED (unchanged). Runtime, envelope, toggle layers, route shapes preserved; only upstream call code + provider envelope values changed.

---
*Generated by gsd-roadmapper. Edit at phase transitions via `/gsd-transition`.*
