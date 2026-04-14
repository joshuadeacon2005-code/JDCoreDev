# JD CoreDev

## Overview

JD CoreDev is a consulting business platform with three components:
1. **Public Marketing Website** - Sells consulting/development services to potential clients (Home, Services, Work, Contact pages)
2. **Admin Dashboard** - Internal tool for the consultant to manage clients, projects, availability, milestones, documents, and office day approvals
3. **Client Portal** - Allows clients to view their projects, request office days, and access their documents

The system uses role-based access control with PostgreSQL database and session-based authentication.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, bundled with Vite
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state and caching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom CSS variables for theming (light/dark mode support)
- **Design System**: Linear + Vercel hybrid aesthetic with Inter font for UI and JetBrains Mono for data/code elements

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Authentication**: Passport.js with local strategy (email/password), session-based auth with cookies
- **Session Storage**: PostgreSQL via connect-pg-simple with 7-day expiration
- **API Structure**: RESTful endpoints under `/api/*` prefix
- **Role-Based Access Control**: Three roles - admin (full access), client (own data only), public (marketing pages only)

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Database**: PostgreSQL (requires DATABASE_URL environment variable)
- **Schema Location**: `shared/schema.ts` - contains all table definitions with Drizzle-Zod integration for validation
- **Migrations**: Drizzle Kit with migrations output to `./migrations` directory

### Key Data Models
- **Users**: Authentication with role-based access (admin/client)
- **Clients**: Business entities with status tracking (lead/active/past)
- **Projects**: Client projects with status, billing model, and risk tracking
- **Availability**: Rules and blocks for scheduling office days
- **Office Day Requests**: Request workflow with approval states
- **Milestones**: Payment tracking with status (planned/invoiced/paid/overdue)
- **Documents**: File metadata with type classification
- **Activity Events**: Audit trail for all system actions

### File Upload Architecture
- **Integration**: Google Cloud Storage via Replit's object storage sidecar service
- **Upload Flow**: Two-step presigned URL pattern:
  1. Client requests presigned URL from `/api/uploads/request-url` with file metadata
  2. Client uploads file directly to GCS via the presigned URL
  3. Client saves document metadata with the objectPath to the database
- **Download Flow**: Files served via `/objects/:objectPath(*)` route with authentication
- **Client Library**: Uppy v5 for file upload UI with AWS S3 plugin (GCS-compatible)
- **Storage Paths**: Documents stored in private object directory with normalized `/objects/...` paths
- **Delete Flow**: Admin delete removes both database record and object from cloud storage

### Build System
- **Development**: Vite dev server with HMR, proxied through Express
- **Production**: Vite builds client to `dist/public`, esbuild bundles server to `dist/index.cjs`
- **TypeScript**: Strict mode enabled, path aliases configured (`@/*` for client, `@shared/*` for shared code)

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management

### Authentication & Security
- **Passport.js**: Authentication middleware with local strategy
- **bcrypt**: Password hashing (cost factor 10)
- **express-session**: Session management with HTTP-only, secure cookies
- **connect-pg-simple**: PostgreSQL session store with 7-day TTL and automatic session pruning
- **Helmet**: Security headers including CSP, HSTS (1 year), XSS protection, referrer policy
- **express-rate-limit**: Rate limiting per endpoint:
  - Login: 5 attempts per minute
  - Registration: 3 attempts per hour
  - General API: 100 requests per minute
  - File uploads: 10 per hour
- **Input Validation**: Zod schemas for all auth endpoints with sanitization
- **Request Size Limits**: 1MB maximum for JSON and URL-encoded bodies
- **Security Event Logging**: Failed logins, rate limit hits, and registrations logged with timestamps and IP addresses
- **Environment Validation**: Required secrets (DATABASE_URL, SESSION_SECRET) verified at startup

### Cloud Storage
- **Google Cloud Storage**: File storage via Replit's sidecar integration
- **Presigned URLs**: Direct client-to-storage uploads for efficiency

### UI Framework
- **Radix UI**: Accessible, unstyled component primitives
- **shadcn/ui**: Pre-styled component library built on Radix
- **Tailwind CSS**: Utility-first CSS framework

### Form & Validation
- **React Hook Form**: Form state management
- **Zod**: Schema validation (integrated with Drizzle via drizzle-zod)
- **@hookform/resolvers**: Zod resolver for React Hook Form

### Data Fetching
- **TanStack React Query**: Server state management with caching and invalidation

### Date Handling
- **date-fns**: Date manipulation and formatting utilities