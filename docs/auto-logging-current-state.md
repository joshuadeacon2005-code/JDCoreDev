# Auto Logging Page — Current State

> Discovery doc for the WS2 refactor. Do not edit; re-run discovery if the code changes.

## 1. Page location

- **Component:** `client/src/pages/admin/dev-logs.tsx` (293 lines)
- **Route:** `/admin/dev-logs`
- **Layout:** wrapped in `AdminLayout`

## 2. Log schema

**Primary table:** `maintenance_logs` (`shared/schema.ts`)

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `projectId` | integer FK | → `projects.id` (cascade delete) |
| `logDate` | date | Session end date (no time component) |
| `minutesSpent` | integer | Work duration |
| `description` | text | Full session description (markdown, token stats) |
| `estimatedCostCents` | integer nullable | Cost in cents |
| `category` | text nullable | e.g. `"claude-code-session"` |
| `logType` | text | `"hosting"` or `"development"` |
| `createdByUserId` | integer nullable | FK → `users.id` |
| `createdAt` | timestamp | Auto-generated |

**Secondary table:** `maintenance_log_costs` — itemised additional costs per log entry.

## 3. Billing period

Each project has its own independent cycle start date stored in `projectHostingTerms.currentCycleStartDate`. The fallback (if unset) is the first day of the current calendar month.

Cycle logic in `server/storage.ts:1379`:
```typescript
const inCycle = log.logDate && log.logDate >= entry.cycleStart
```

There is **no global billing period** — each project tracks its own.

## 4. Overage calculation

- Unit: **minutes** (not entries or cost).
- Threshold: `projectHostingTerms.maintenanceBudgetMinutes` per project.
- Visualised as a coloured progress bar (teal → amber at 80% → red at 100%).
- **No automatic penalty calculation.** The bar turns red but no charge is auto-added.
- `cycleMinutes` in the API response is correctly scoped to `logDate >= cycleStart` — the cycle scoping already works in the backend.
- **Visual confusion:** the expanded log list shows ALL-TIME logs even though the budget bar uses cycle-only minutes. This is the "double-count" perception issue — logs from prior periods are visible alongside the current-cycle budget bar with no clear separation.

## 5. Page visual structure

- **Design system:** ShadCN UI (`Card`, `CardHeader`, `CardTitle`, `CardContent`, `Badge`) + Lucide icons + Tailwind.
- **Layout:** page header → 2-column stats (sessions, total time) → client cards.
- **Client cards:** expandable per-project rows inside each client card.
- **Log entries:** shown as always-expanded `<pre>` blocks when project is toggled open. Full description visible immediately — no summary-first pattern.
- **Sort order:** logs are rendered in API return order (not explicitly sorted newest-first in the component).
- **Billing label:** "Cycle from YYYY-MM-DD" shown in tiny `text-[10px]` — easy to miss.

## 6. API endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/admin/dev-logs/claude-sessions` | `requireAdmin` | Returns up to 500 log entries (all-time, all projects) |
| `GET /api/admin/dev-logs/clients-summary` | `requireAdmin` | Returns per-client/project budget + cycle minutes |
| `POST /api/dev-logs/ingest` | `x-jdcd-key` header | Claude Code hook writes log entries here |

## Changes required (WS2)

1. **Recent logs box** — top-10 cross-project, summary-only, newest-first.
2. **Summary-first display** — extract first paragraph of `description` for collapsed view; click to expand full content.
3. **Newest-first sort** — sort log entries within each project by `createdAt` descending.
4. **Billing period label** — show "Current billing period: from {cycleStart}" prominently at project level.
