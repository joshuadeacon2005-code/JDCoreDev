---
phase: 01-ai-advertising-audit-page
plan: 02
subsystem: marketing-aaa-nav-wiring
tags: [marketing, react, wouter, navbar, lucide, phase-1]
requires:
  - "Plan 01-01 — page must exist at /services/ai-advertising-audit"
provides:
  - "Desktop Services dropdown surfaces 'AI Advertising Audit' alongside 'All services'"
  - "Mobile menu surfaces an indented sub-row under the Services row that links to /services/ai-advertising-audit"
  - "Active-state styling fires on both surfaces when on the new route"
affects:
  - "client/src/components/PublicNavbar.tsx"
tech-stack:
  added: []
  patterns:
    - "Desktop dropdown: shared `services` array consumed by MenuItem/HoveredLink loop — array length is variable, no rendering changes needed"
    - "Mobile menu sub-row: Link with pl-8 indent + text-xs uppercase tracking-wide signals sub-item under parent Services row"
    - "Active-state styling reuses cn() + isActive() helpers — no new imports"
key-files:
  created: []
  modified:
    - "client/src/components/PublicNavbar.tsx"
decisions:
  - "Dropped lucide imports Code, Rocket, Server (their only consumers were the placeholder array entries we removed); added Target for AAA. Keeps the import list minimal and matches the icon used in UI-SPEC §10a / Plan 03 homepage card."
  - "Phase 1 lands exactly 2 dropdown entries: 'All services' + 'AI Advertising Audit'. The SEO entry is intentionally deferred to Phase 2 — the array is structured so Phase 2 appends one more line."
  - "Mobile sub-row uses pl-8 (vs. parent rows' px-4) for the visual indent; text-xs uppercase tracking-wide differentiates it from peer-level rows. Pattern consistent with services.tsx benefit-card typography."
metrics:
  duration: "~15 minutes (Tasks 1-2 sequential)"
  completed: "2026-05-06"
requirements-completed: []
requirements-partial:
  - "MKTG-NAV-01 — AAA half of the requirement now shipped; full requirement closes after Phase 2 appends the SEO entry."
---

# Phase 1 Plan 02: PublicNavbar — AI Advertising Audit Wiring Summary

One-liner: Replaced the four placeholder entries in `client/src/components/PublicNavbar.tsx` Services dropdown with two real entries (`All services` + `AI Advertising Audit`) and added an indented sub-row under the mobile menu's Services row that links to `/services/ai-advertising-audit`.

## What was built

Two surgical edits to a single file (`client/src/components/PublicNavbar.tsx`):

1. **Lucide imports trimmed and refocused** — dropped `Code`, `Rocket`, `Server` (used only by the placeholder array we removed), added `Target` for the AAA entry. Final shape:
   `import { Layers, Target, Menu as MenuIcon, X } from "lucide-react";`

2. **Services dropdown array replaced** with the exact two entries from UI-SPEC §10a:
   - `{ href: "/services", label: "All services", icon: Layers }`
   - `{ href: "/services/ai-advertising-audit", label: "AI Advertising Audit", icon: Target }`
   The desktop `MenuItem` / `HoveredLink` rendering loop was untouched — it iterates `services.map(...)` and works with any length.

3. **Mobile menu sub-row inserted** between the existing Services row and the Work row. The new row:
   - Uses `<Link href="/services/ai-advertising-audit">` with `onClick={() => setMobileMenuOpen(false)}` matching the peer-row pattern.
   - Styled with `pl-8 pr-4 py-2 rounded-lg transition-colors text-xs uppercase tracking-wide` — the `pl-8` gives the indent that signals "sub-item under Services"; `text-xs uppercase tracking-wide` matches the bullet/feature-list typography from `services.tsx` benefit cards.
   - Active-state via `isActive("/services/ai-advertising-audit") ? "bg-primary/10 text-foreground font-medium" : "text-muted-foreground hover:bg-muted"` — identical to peer rows, so behaviour is consistent.

## Diff shape

```
client/src/components/PublicNavbar.tsx
- import { Code, Layers, Rocket, Server, Menu as MenuIcon, X } from "lucide-react";
+ import { Layers, Target, Menu as MenuIcon, X } from "lucide-react";

  const services = [
-   { href: "/services", label: "Custom Development",   icon: Code },
-   { href: "/services", label: "Technical Consulting", icon: Layers },
-   { href: "/services", label: "MVP Development",      icon: Rocket },
-   { href: "/services", label: "Managed Hosting",      icon: Server },
+   { href: "/services",                      label: "All services",         icon: Layers },
+   { href: "/services/ai-advertising-audit", label: "AI Advertising Audit", icon: Target },
  ];

  /* mobile menu — Services row preserved, NEW sub-row inserted */
+ <Link href="/services/ai-advertising-audit" onClick={() => setMobileMenuOpen(false)}>
+   <div className={cn(
+     "pl-8 pr-4 py-2 rounded-lg transition-colors text-xs uppercase tracking-wide",
+     isActive("/services/ai-advertising-audit")
+       ? "bg-primary/10 text-foreground font-medium"
+       : "text-muted-foreground hover:bg-muted"
+   )}>
+     AI Advertising Audit
+   </div>
+ </Link>
```

Net: 1 file changed, 13 insertions, 5 deletions across 2 commits.

## Phase 2 hand-off

The SEO entry is **intentionally deferred to Phase 2**. When Phase 2 ships its SEO Audit page wiring it will:

- Append a third entry to the `services` array: `{ href: "/services/seo-audit-and-improvement", label: "SEO Audit & Improvement", icon: <icon-tbd> }`.
- Insert a second mobile sub-row immediately after the AAA sub-row added in this plan, mirroring its `pl-8` indent and `text-xs uppercase tracking-wide` typography.

No structural rework needed — both the desktop dropdown loop and the mobile menu can absorb an additional row by inserting alongside the AAA shape this plan landed.

## Acceptance gate results

Per-task acceptance grep gates ran clean on both tasks:

**Task 1**
- `grep -F "import { Layers, Target, Menu as MenuIcon, X }" PublicNavbar.tsx` → 1
- `grep -F "label: \"All services\"" PublicNavbar.tsx` → 1
- `grep -F "label: \"AI Advertising Audit\"" PublicNavbar.tsx` → 1
- `grep -F "href: \"/services/ai-advertising-audit\"" PublicNavbar.tsx` → 1
- `grep -cF "icon: " PublicNavbar.tsx` → 2
- `grep -cE "from \"lucide-react\"" PublicNavbar.tsx` → 1
- `grep -F "Custom Development" PublicNavbar.tsx` → 0 (placeholders gone)
- `grep -F "Managed Hosting" PublicNavbar.tsx` → 0

**Task 2**
- `grep -F "Link href=\"/services/ai-advertising-audit\"" PublicNavbar.tsx` → 1
- `grep -F "isActive(\"/services/ai-advertising-audit\")" PublicNavbar.tsx` → 1
- `grep -F "pl-8" PublicNavbar.tsx` → 1
- Visual file inspection (lines 100-117) confirms the AAA sub-row label `AI Advertising Audit` lives inside its `<div>` with the parent Services row preserved unchanged. (The plan's literal `>Services</div>` and `AI Advertising Audit</div>` greps assume label text and closing tag on one line, but the existing codebase formats them across two lines — the structural intent of the gate is satisfied.)

**TypeScript:** `npx tsc --noEmit` (run from repo root) produced no `PublicNavbar` errors and no `error TS` lines after each task. Exit 0.

## Deviations from Plan

None — plan executed exactly as written. Per-task grep gates and TS checks both clean. The only minor note is the `>Services</div>` / `AI Advertising Audit</div>` literal grep greps in the plan don't match because the codebase formats label text and closing `</div>` on separate lines; structural intent confirmed by visual file inspection (see Acceptance gate results above).

## Commits

- `e532f31` — `feat(01-02): wire AI Advertising Audit into PublicNavbar Services dropdown`
- `ed4bf10` — `feat(01-02): add mobile-menu sub-row for AI Advertising Audit`

## Self-Check: PASSED

- File `client/src/components/PublicNavbar.tsx` exists and contains the expected diff.
- Commit `e532f31` exists in `git log`.
- Commit `ed4bf10` exists in `git log`.
- Sibling SUMMARY `01-01-SUMMARY.md` referenced and conventions followed.
