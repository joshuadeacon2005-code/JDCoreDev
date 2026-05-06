---
phase: 01-ai-advertising-audit-page
plan: 03
subsystem: marketing-home
tags: [homepage, marketing, aaa, ui-only]
requires: [01-01]
provides: [homepage-aaa-card, targeted-services-section]
affects: [client/src/pages/home.tsx]
tech_stack_added: []
tech_stack_patterns: [react-section, lucide-icon-import, md-grid-cols-2-placeholder]
key_files_created: []
key_files_modified:
  - client/src/pages/home.tsx
decisions:
  - "Inserted new 'Targeted services' section between the 'Stuff we've actually built' section and the footer per UI-SPEC §10b"
  - "Used md:grid-cols-2 with a `Phase 2 will add the SEO Audit sibling card here` comment to lock the insertion point for the Phase 2 SEO sibling"
  - "Smallest-diff Target icon import: appended `Target,` after `ChevronRight` and added trailing comma to ChevronRight for cleaner future inserts"
metrics:
  tasks_completed: 2
  duration_minutes: ~5
  completed_date: 2026-05-06
---

# Phase 01 Plan 03: Homepage AAA Card Summary

Added a "Targeted services" homepage section to `client/src/pages/home.tsx` with one AI Advertising Audit card linking to `/services/ai-advertising-audit`, slotted between the existing "Stuff we've actually built" section and the footer CTA. Phase 2 placeholder comment locks the SEO-sibling insertion point.

## What Was Built

### Task 1 — `Target` lucide-react import
- Added `Target,` on its own line at the end of the existing `lucide-react` multi-line import block.
- Added a trailing comma after the previous final entry (`ChevronRight`) so future inserts produce minimal diffs.
- No other imports were touched. `Link` (from `wouter`) and `ArrowRight` (lucide) were already imported and were reused by Task 2 unchanged.
- Commit: `19283e9`

Diff (excerpt):
```diff
   GraduationCap,
-  ChevronRight
+  ChevronRight,
+  Target,
 } from "lucide-react";
```

### Task 2 — "Targeted services" section
- Inserted the verbatim UI-SPEC §10b block between the closing `</section>` of "Stuff we've actually built" (line 826) and the opening `<footer className="bg-card border-t pt-20">` (now line 859). New section spans lines 828–857.
- Section structure: eyebrow `// Targeted services` → `Specific audits & rebuilds` headline → supporting paragraph → `md:grid-cols-2` grid → single AAA card with `Target` icon, locked description, and `See the audit →` CTA.
- The grid intentionally has only one card during Phase 1; the `{/* Phase 2 will add the SEO Audit sibling card here */}` placeholder comment marks the insertion point for Phase 2's SEO sibling so the half-empty grid is intentional.
- Indentation matches sibling sections (6-space leading indent on `<section>`).
- Commit: `e640d6f`

## Verification

| Gate | Result |
| --- | --- |
| `grep -E "^  Target,?$" home.tsx` | 1 match (Task 1) |
| `grep -cF 'from "lucide-react"' home.tsx` | 1 (unchanged, Task 1) |
| `grep -cF "// Targeted services" home.tsx` | 1 |
| `grep -cF 'Specific <span ...>audits & rebuilds</span>' home.tsx` | 1 |
| `grep -cF 'Link href="/services/ai-advertising-audit"' home.tsx` | 1 |
| `grep -cF 'data-testid="card-home-aaa"' home.tsx` | 1 |
| `grep -cF "Phase 2 will add the SEO Audit sibling card here" home.tsx` | 1 |
| `grep -cF "See the audit" home.tsx` | 1 |
| Section ordering (awk: stuff-built < targeted < footer) | exit 0 (805 < 831 < 859) |
| `cd client && npx tsc --noEmit` for home.tsx | clean (no `home.tsx` errors) |

## Success Criteria

- [x] Homepage has a new section between "Stuff we've actually built" and the footer
- [x] Section contains exactly one AAA card linking to `/services/ai-advertising-audit`
- [x] Card uses `Target` icon, "AI Advertising Audit" title, locked description, "See the audit →" CTA
- [x] Grid is `md:grid-cols-2` with a placeholder comment for Phase 2's SEO card
- [x] TypeScript check passes with no `home.tsx` errors
- [ ] `npm run build` — see Deferred Issues; environmental, not blocked by these changes

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Issues

**`npm run build` environmental failure (pre-existing, not introduced by this plan).**

Running `npm run build` (which calls `tsx script/build.ts`) fails on this machine because:
1. `tsx` has no `.bin` shim in `node_modules/.bin` on this Windows install.
2. Invoking `node node_modules/tsx/dist/cli.mjs script/build.ts` directly returns `UNKNOWN: unknown error, read` from `node:fs.readSync` — a classic iCloud-tethered-file error (the working directory is `C:\Users\joshu\iCloudDrive\JDCoreDev Code\JDCoreDev`).

These failures are environmental and reproduce on the unrelated `git diff` baseline before any of this plan's edits. The authoritative TypeScript gate (`cd client && npx tsc --noEmit`) is clean for `home.tsx`. Recording here so the verifier or a future deploy run on Railway (where iCloud-on-demand is not in play) can confirm the production build.

## Auth Gates

None.

## Threat Flags

None — pure UI-only addition; no new endpoints, auth surface, file IO, or schema changes.

## Self-Check: PASSED

- `client/src/pages/home.tsx` — FOUND (modified)
- Commit `19283e9` — FOUND in `git log --all`
- Commit `e640d6f` — FOUND in `git log --all`
