# AI-Optimized Prompt: Recurring Monthly Payment Scheduler for Hosting Page

## Context
I have a web application for managing client projects with an admin hosting terms page. I need to add a recurring monthly payment scheduling system that will allow me to:
1. Configure recurring payments for projects in "hosting" status
2. Select the payment date (day of month)
3. Set the payment amount
4. View and manage all scheduled recurring payments

## Current Tech Stack
- **Frontend**: React with TypeScript
- **UI Components**: shadcn/ui (Button, Card, Dialog, Input, Label, etc.)
- **State Management**: TanStack Query (React Query)
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Date Handling**: date-fns

## Current Project Structure
```
client/pages/admin/hosting-terms.tsx - Internal hosting reference page (currently exists)
shared/schema.ts - Database schema with Drizzle ORM
server/routes.ts - API route handlers
```

## Requirements

### Database Schema
Create a new table called `recurring_payments` with the following fields:
- `id` - Primary key (auto-increment)
- `project_id` - Foreign key to projects table (with cascade delete)
- `payment_day` - Integer (1-31) representing day of month
- `amount` - Decimal/numeric field for payment amount
- `currency` - Text field (default: "USD")
- `is_active` - Boolean (default: true)
- `start_date` - Date when recurring payments begin
- `end_date` - Optional date when recurring payments should stop
- `last_processed_date` - Nullable date of last successful processing
- `next_payment_date` - Calculated date for next payment
- `notes` - Optional text field for additional information
- `created_at` - Timestamp (default: now)
- `updated_at` - Timestamp (auto-update)

Include proper Drizzle ORM schema definition with:
- Appropriate column types
- Foreign key constraints
- Default values
- Relations to the projects table

### Backend API Endpoints
Create RESTful API endpoints in `server/routes.ts`:

**GET /api/admin/recurring-payments**
- Fetch all recurring payments with project details
- Include JOIN with projects table to get project name and client info
- Sort by next_payment_date ascending

**GET /api/admin/recurring-payments/:id**
- Fetch single recurring payment by ID

**POST /api/admin/recurring-payments**
- Create new recurring payment
- Validate:
  - project_id exists and project status is "hosting"
  - payment_day is between 1-31
  - amount is positive number
  - start_date is not in the past
- Calculate initial next_payment_date based on payment_day and start_date

**PATCH /api/admin/recurring-payments/:id**
- Update existing recurring payment
- Allow updating: amount, payment_day, is_active, end_date, notes
- Recalculate next_payment_date if payment_day changes

**DELETE /api/admin/recurring-payments/:id**
- Delete recurring payment (soft delete by setting is_active to false, or hard delete)

### Frontend Component - New Page
Create a new page: `client/pages/admin/recurring-payments.tsx`

**UI Requirements:**
1. **Header Section:**
   - Page title: "Recurring Payments"
   - Subtitle: "Manage monthly recurring payments for hosted projects"
   - "Add Payment Schedule" button (opens dialog)

2. **Payment Cards Display:**
   - Show each recurring payment as a card
   - Display:
     - Project name (linked to project detail page if applicable)
     - Payment amount with currency symbol
     - Payment day of month (e.g., "Charged on day 15 of each month")
     - Active/Inactive status badge
     - Next payment date (formatted nicely)
     - Start date
     - End date (if set)
     - Notes (if provided)
   - Action buttons: Edit, Deactivate/Activate, Delete (with confirmation)

3. **Create/Edit Dialog:**
   - Project selector dropdown (only show projects with status="hosting")
   - Amount input (number, with currency prefix)
   - Payment day selector (1-31, with dropdown or number input)
   - Start date picker (date input)
   - End date picker (optional, date input)
   - Notes textarea (optional)
   - Submit button with loading state
   - Validation error messages

4. **Empty State:**
   - When no recurring payments exist
   - Show helpful message with icon
   - "Create First Payment Schedule" button

5. **Additional Features:**
   - Show total monthly recurring revenue at the top
   - Filter by active/inactive status
   - Sort by next payment date, amount, or project name
   - Search/filter by project name

### Business Logic
**Next Payment Date Calculation:**
- If payment_day is 31 and current month has fewer days, use last day of month
- If today is before payment_day this month, next payment is this month on payment_day
- If today is on or after payment_day this month, next payment is next month on payment_day
- Handle end_date: if next_payment_date > end_date, mark as completed/inactive

**Validation Rules:**
- Only projects with status="hosting" can have recurring payments
- Payment day must be 1-31
- Amount must be > 0
- Cannot set end_date before start_date
- Cannot have multiple active recurring payments for same project (add this constraint)

### Code Style & Patterns
- Follow existing patterns from `hosting-terms.tsx`
- Use TanStack Query with proper cache invalidation
- Use shadcn/ui components consistently
- Implement proper TypeScript types (export from schema.ts)
- Add data-testid attributes for testing
- Use proper error handling with toast notifications
- Follow React hooks best practices

### Integration
- Add route to admin navigation/sidebar (if applicable)
- Ensure proper authentication/authorization (admin-only access)
- Add to existing route configuration in App.tsx

## Expected Deliverables
1. Updated `shared/schema.ts` with new table definition and types
2. New API endpoints in `server/routes.ts`
3. New page component `client/pages/admin/recurring-payments.tsx`
4. Any necessary utility functions for date calculations
5. Route configuration updates

## Additional Considerations
- Consider adding email notification system for upcoming payments (future enhancement)
- Consider adding payment processing integration (Stripe, etc.) later
- For now, this is a scheduling/tracking system, not actual payment processing
- Ensure responsive design for mobile devices
- Add loading states and skeleton loaders for better UX

## Example Usage Flow
1. Admin completes project development
2. Project status changed to "hosting"
3. Admin navigates to "Recurring Payments" page
4. Clicks "Add Payment Schedule"
5. Selects project, sets amount ($99), payment day (15th), start date (next month)
6. System calculates next payment date automatically
7. Admin can view, edit, or deactivate the recurring payment anytime

## Questions to Address
- Should the system automatically mark payments as processed? (For now, just track next_payment_date)
- Should there be payment history tracking? (Future enhancement)
- Should clients see their recurring payments? (Future enhancement - client portal)
- How should failed payments be handled? (Future enhancement)

---

Please implement this feature following the existing code patterns and architecture. Ensure type safety, proper error handling, and a clean user interface that matches the existing admin design system.
