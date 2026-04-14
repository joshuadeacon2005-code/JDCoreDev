# JD CoreDev

## Overview

JD CoreDev is a consulting business platform designed to streamline operations for a consultant. It comprises three main components: a Public Marketing Website to attract clients, an Admin Dashboard for internal management of clients, projects, and resources, and a Client Portal for clients to monitor their projects and interact with the consultant. The platform enforces role-based access control and utilizes a PostgreSQL database with session-based authentication.

## User Preferences

Preferred communication style: Simple, everyday language.

### Front-End Design Guidelines

**Visual Style**
- Follow the Linear + Vercel hybrid aesthetic already established
- Use Inter font for UI elements, JetBrains Mono for data/code displays
- Maintain consistent spacing: use the established small/medium/large spacing scale
- Keep the UI clean and minimal - avoid clutter

**Component Usage**
- Always use existing shadcn/ui components from `@/components/ui/*`
- Use the established Button, Card, Badge, and other component variants
- Never create custom styled components when shadcn equivalents exist
- Use Lucide icons for actions, react-icons/si for brand logos

**Color & Theming**
- Use semantic color tokens (--primary, --muted, --destructive, etc.)
- Ensure all UI works in both light and dark mode
- Use the established teal brand color (#008080) for accents
- Maintain proper contrast ratios for accessibility

**Layout**
- Keep layouts responsive - test on mobile, tablet, and desktop
- Use consistent padding/margins throughout
- Sidebars should use the built-in Sidebar component
- Forms should be clear and well-organized

**Interactions**
- Use built-in hover/active states from components (hover-elevate, active-elevate-2)
- Keep animations subtle and purposeful
- Show loading states during async operations
- Provide clear feedback for user actions (toasts, status changes)

### Application Testing Guidelines

**When to Test**
- Always test new features after implementation
- Test bug fixes to confirm they're resolved
- Test UI changes, forms, and user flows
- Test any changes that affect user-facing functionality

**Testing Approach**
- Use end-to-end testing for user flows and interactions
- Test the happy path first, then edge cases
- Verify both frontend display and backend data persistence
- Check that error states are handled gracefully

**What to Verify**
- Forms submit correctly and validate input
- Navigation works as expected
- Data displays correctly after CRUD operations
- Authentication flows work (login, logout, protected routes)
- Toast notifications appear for success/error states

**Test Data**
- Use unique identifiers for test data to avoid conflicts
- Don't rely on existing data that may change
- Clean up test data when appropriate

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript and Vite
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI Components**: shadcn/ui built on Radix UI
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **Design System**: Linear + Vercel hybrid aesthetic, Inter font, JetBrains Mono font

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Authentication**: Passport.js local strategy, session-based with cookies
- **Session Storage**: PostgreSQL via connect-pg-simple
- **API Structure**: RESTful endpoints under `/api/*`
- **Role-Based Access Control**: Admin, Client, Public roles

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Database**: PostgreSQL
- **Schema**: `shared/schema.ts` with Drizzle-Zod integration
- **Migrations**: Drizzle Kit

### Key Data Models
- **Users**: Authentication and role-based access.
- **Clients**: Business entities with status tracking.
- **Projects**: Client projects with status, billing, and risk tracking.
- **Availability**: Scheduling rules.
- **Office Day Requests**: Workflow with approval states.
- **Milestones**: Payment tracking.
- **Documents**: File metadata with classification.
- **Activity Events**: Audit trail.
- **Recurring Payments**: Monthly payment schedules for hosting projects with automatic creation/updates.
- **Hosting Invoices**: Multi-project invoice generation including maintenance log breakdown, overage calculation (cost-based vs. time-based), and automated email reminders (via Resend) with tracking and cancellation options.
- **Development Invoices**: Milestone-based invoicing for development projects, generating PDFs with branding, currency conversion, and a second page for development logs.
- **Payment Settings**: Configurable payment methods for invoice display.
- **Accounts Department**: Client-level contacts for invoice communications.
- **Cryptocurrency Tracker**: Personal crypto portfolio monitoring including tracked coins, real-time prices, customizable price alerts (SMS/WhatsApp via Twilio), price history, and aggregated news.
- **Maintenance Logs**: Manual time/cost tracking for projects, categorized by type (hosting/development). Features unified hosting logs, cycle-based tracking with budget allocation, a "Stopwatch" feature for time tracking (with inline charge entry during active sessions), support for multiple costs per log entry, and all-time development cost totals displayed on project profiles.
- **Replit Charges**: Manual entry for reconciliation with logged development costs, displayed on a cumulative all-time dashboard card with dev log viewing and deletion.
- **Project Roadmap**: Personal task tracking per project (separate from payment milestones). Features: ordered task lists with priority/due dates, PRD import via AI (OpenAI gpt-4o) to auto-generate tasks, smart auto-detection that scans maintenance logs and project history to detect partial/full task completion, daily 7 AM digest email summarizing all tasks across projects (via Resend), and a full Roadmap tab UI with inline editing, reordering, and progress tracking.
- **Trader Agent Chat**: Conversational AI interface for the trading system. Users can ask why the agent made specific decisions, discuss investment ideas, and execute trades via Alpaca directly from the chat. Powered by OpenAI gpt-4o-mini with full context of pipeline runs, trade history, and current open positions. Stores conversation history in `trader_chat` table. Route: `/admin/trader/chat`. API: `GET/POST /api/trader/chat`, `POST /api/trader/chat/execute-task`. Supports mode filtering (day/swing/portfolio/crypto/general). Includes action detection — if the AI proposes a trade, a confirmation card appears with a one-click execute button.
- **Run Summaries**: Per-run breakdown of every cron cycle at `/admin/trader/runs`. Shows mode tabs (Day/Swing/Portfolio/Crypto), each run's score, thesis, positions built, orders placed, passed-over/declined stocks (scored ≥60 not selected), bull/bear reasoning per ticker, validation strengths/warnings, and realised P&L where available. Expandable cards with full screened ticker list. API: `GET /api/trader/run-summaries?mode=&limit=`. Full pipeline detail (screened_json, analysis_json, positions_json, validation_json) now stored in `trader_pipelines` table.
- **P&L Sync**: `POST /api/trader/sync-pnl` fetches Alpaca fill activities, uses FIFO buy→sell matching to calculate realised P&L per trade, updates `pnl` and `executed_at` columns on `trader_trades`. Also snapshots current account equity. Called automatically by the cron after each pipeline run. Manual "Sync P&L" button on Analytics and Performance pages.
- **Trader Agent Activity Widget**: Dashboard widget showing the last 6 pipeline runs (mode, score, thesis, pass/fail) and last 6 trades across all agents. Auto-refreshes every 60 seconds. Only visible when there is agent activity. Links to the Chat page. Endpoint: `GET /api/trader/agent-activity`.
- **Lead Engine**: Automated lead discovery, audit, and outreach pipeline. Stages: (1) discover 5 leads via Claude AI + web search, (2) audit each company's online presence, (3) generate branded HTML audit page at `/audits/<slug>`, (4) write personalised cold email, (5) save to draft queue for manual review. Dashboard at `/lead-engine`. API at `/api/lead-engine/*` (protected by ENGINE_SECRET header). Pipeline files in `pipeline/`, audit template in `templates/audit.html`, runtime data in `pipeline/data/`. Currently runs in draft-only mode (Gmail not yet configured). Auto-runs at 23:00 HKT via cron. **Persistence**: Audits stored in `lead_audits` table; drafts/sent emails in `lead_drafts` table (PostgreSQL). Pipeline dual-writes to both JSON files (local cache) and DB. A `db-bridge.js` module bridges the JS pipeline to the TypeScript storage layer. JSON files are migrated to DB on first startup.

### File Upload Architecture
- **Integration**: Google Cloud Storage via Replit's object storage sidecar.
- **Upload Flow**: Two-step presigned URL pattern using Uppy v5.
- **Download Flow**: Authenticated access via `/objects/:objectPath(*)`.
- **Storage**: Private object directory with normalized paths.
- **Delete Flow**: Removes both database record and object from cloud storage.

### Build System
- **Development**: Vite dev server with HMR.
- **Production**: Vite for client, esbuild for server.
- **TypeScript**: Strict mode with path aliases.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **Drizzle ORM**: Type-safe database queries.

### Authentication & Security
- **Passport.js**: Authentication middleware.
- **bcrypt**: Password hashing.
- **express-session**: Session management.
- **connect-pg-simple**: PostgreSQL session store.
- **Helmet**: Security headers.
- **express-rate-limit**: Rate limiting.
- **Zod**: Input validation.

### Cloud Storage
- **Google Cloud Storage**: File storage.

### UI Framework
- **Radix UI**: Accessible component primitives.
- **shadcn/ui**: Pre-styled component library.
- **Tailwind CSS**: Utility-first CSS framework.

### Form & Validation
- **React Hook Form**: Form state management.
- **Zod**: Schema validation.
- **@hookform/resolvers**: Zod resolver for React Hook Form.

### Data Fetching
- **TanStack React Query**: Server state management.

### Date Handling
- **date-fns**: Date manipulation utilities.

### AI
- **OpenAI**: GPT-4o via Replit AI Integrations for PRD parsing and task auto-detection.

### Communication
- **Resend**: Email reminders for hosting invoices.
- **Twilio**: SMS/WhatsApp notifications for crypto price alerts.