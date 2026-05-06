---
phase: 01-ai-advertising-audit-page
plan: 05
subsystem: marketing-deploy-followup
tags: [docs, cloudflare, cache, deploy-checklist, phase-1]
requires: []
provides:
  - "Post-deploy cache-purge checklist for Phase 1 (AAA)"
affects:
  - ".planning/phases/01-ai-advertising-audit-page/CACHE-PURGE.md"
tech-stack:
  added: []
  patterns:
    - "Manual deploy follow-up note co-located with phase artifacts"
key-files:
  created:
    - ".planning/phases/01-ai-advertising-audit-page/CACHE-PURGE.md"
  modified: []
decisions:
  - "Manual purge only — auto-purge explicitly deferred to v2"
  - "wrangler local CLI auth (no pasted tokens) is the documented procedure; dashboard is the fallback"
metrics:
  duration: "~3 minutes"
  completed: "2026-05-06"
requirements-completed-partial:
  - "MKTG-CACHE-01 (AAA portion only — full close after Phase 2 SEO follow-up note)"
---

# Phase 1 Plan 05: Cloudflare Cache-Purge Follow-up Note Summary

One-liner: Manual Cloudflare cache-purge checklist landed at `.planning/phases/01-ai-advertising-audit-page/CACHE-PURGE.md` listing the three URLs (`/sitemap.xml`, `/services`, `/`) Josh purges after the Phase 1 deploy via `wrangler` (local auth, no pasted tokens) or Cloudflare dashboard.

## What was built

A single docs-only deliverable: `.planning/phases/01-ai-advertising-audit-page/CACHE-PURGE.md`. The note documents:

1. **Why** each URL needs purging after Phase 1 ships.
2. **Which URLs** to purge (locked from UI-SPEC §10d):
   - `https://www.jdcoredev.com/sitemap.xml`
   - `https://www.jdcoredev.com/services`
   - `https://www.jdcoredev.com/`
3. **Two execution paths** (pick one):
   - Option A — `wrangler` CLI from a `wrangler whoami`-confirmed shell.
   - Option B — Cloudflare dashboard "Purge By URL".
4. **What NOT to do**: never paste a CF API token; never "Purge Everything"; never automate this in Phase 1 (auto-purge is v2).
5. **Verification commands** (`curl` against `/sitemap.xml` checking for the new AAA route + `cf-cache-status` header).
6. **Phase 2 hand-off** note — same URL set must be purged again after the SEO page ships.

## Manual step Josh runs after the Phase 1 deploy

After Phase 1 hits production:
1. Open the file at `.planning/phases/01-ai-advertising-audit-page/CACHE-PURGE.md`.
2. Confirm `wrangler whoami` succeeds, then run the documented `wrangler cache purge` command. If the CLI subcommand has shifted on the installed wrangler version, fall back to the Cloudflare dashboard's "Purge By URL" panel and paste the three URLs.
3. Verify with the documented `curl` snippets that `/sitemap.xml` now contains `/services/ai-advertising-audit` and that `cf-cache-status` shows `MISS` or `EXPIRED` on the first post-purge request.

## Tasks executed

| Task | Name                                                                | Commit  | Files                                                                |
| ---- | ------------------------------------------------------------------- | ------- | -------------------------------------------------------------------- |
| 1    | Write CACHE-PURGE.md with the exact URLs and the wrangler procedure | f4e8ec5 | `.planning/phases/01-ai-advertising-audit-page/CACHE-PURGE.md`        |

## Acceptance criteria status

All 8 acceptance criteria satisfied:

- File exists ✓
- `MKTG-CACHE-01-AAA` present (2 occurrences; required ≥1) ✓
- `https://www.jdcoredev.com/sitemap.xml` present (4 occurrences; required ≥2) ✓
- `https://www.jdcoredev.com/services` present (3 occurrences; required ≥1) ✓
- `MANUAL ONLY` present (1) ✓
- `Auto-purge is explicitly out of scope` present (1) ✓
- `wrangler cache purge` present (2; required 1) ✓
- `Do not paste a CF API token` present (1) ✓

## Decisions Made

- **Manual purge only** — auto-purge automation is explicitly OUT OF SCOPE for Phase 1 per PROJECT.md Constraints. A v2 ticket can revisit.
- **`wrangler` CLI is the preferred execution path** — uses local CLI auth, in line with the user-memory rule "never accept pasted tokens" (`Railway + CF access`).
- **Cloudflare dashboard is the documented fallback** — the `wrangler` subcommand surface has shifted between major versions, so the dashboard is the safe default if the CLI shape doesn't match.
- **Verification snippets included** — `curl` against `/sitemap.xml` for the new AAA path + `cf-cache-status` header check, so the human can confirm the purge actually landed.
- **Phase 2 hand-off documented in-file** — when the SEO Audit page ships in Phase 2, the same URL set must be purged again. A sibling `CACHE-PURGE.md` (or an append to this file) will track that.

## Deviations from Plan

None — plan executed exactly as written. The exact file content specified in the plan's `<action>` block was written verbatim and committed.

## Notes for Phase 1 deploy retro

When announcing Phase 1 ships, the deploy retro / commit message should surface this file's URL list (per the plan's `key_links.via` instruction). The file lives at `.planning/phases/01-ai-advertising-audit-page/CACHE-PURGE.md` and is grep-able for `MKTG-CACHE-01-AAA` for traceability.

## Requirements

- `MKTG-CACHE-01` is **partially closed** by this plan — only the AAA-deploy purge note is in place. The SEO-deploy purge note lands in Phase 2; STATE/REQUIREMENTS.md will close the requirement once both halves exist.

## Self-Check: PASSED

- File `.planning/phases/01-ai-advertising-audit-page/CACHE-PURGE.md` confirmed to exist (FOUND).
- Commit `f4e8ec5` confirmed in git log (FOUND).
- All 8 acceptance criteria grep checks passed (counts above).
