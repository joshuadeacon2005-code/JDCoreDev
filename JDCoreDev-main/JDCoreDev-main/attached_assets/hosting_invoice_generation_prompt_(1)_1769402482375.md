# AI-Optimized Prompt: Multi-Project Hosting Invoice Generation System

## Context
I have a web application for managing client projects with both development and hosting services. I need to implement a flexible hosting invoice generation system that allows me to:
1. Generate invoices for multiple hosting projects belonging to the same client
2. Access invoice generation from two different pages (Projects Hosting page and Client Detail page)
3. Filter and select which projects to include in each invoice
4. Automatically calculate combined totals for multi-project invoices

## Current Tech Stack
- **Frontend**: React with TypeScript
- **UI Components**: shadcn/ui (Button, Card, Dialog, Tabs, Select, Checkbox, etc.)
- **State Management**: TanStack Query (React Query)
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Document Generation**: python-docx (for .docx invoices)
- **Date Handling**: date-fns

## Current Project Structure
```
client/pages/admin/projects.tsx - Projects overview with tabs (builds/hosting)
client/pages/admin/client-detail.tsx - Individual client profile with projects tab
shared/schema.ts - Database schema with Drizzle ORM
server/routes.ts - API route handlers
```

## Current Database Schema
Projects table includes:
- `id` - Primary key
- `clientId` - Foreign key to clients table
- `name` - Project name
- `status` - Enum: "lead", "active", "paused", "completed", "hosting"
- Other project fields...

Clients table includes:
- `id` - Primary key
- `name` - Client name
- `email`, `phone`, `address`, etc.

Recurring payments table (if exists) or hosting terms:
- `projectId` - Foreign key to projects
- `monthlyFeeCents` - Monthly hosting fee in cents
- `billingDay` - Day of month for billing
- `isActive` - Boolean

## Requirements

### 1. Client Detail Page Enhancement
**Location**: `client/pages/admin/client-detail.tsx`

**Current State**: Has a "Projects" tab showing all client projects

**Required Changes**:
Add a sub-tab system within the Projects tab:
- **Tab 1: "Development"** - Shows projects with status: "lead", "active", "paused", "completed"
- **Tab 2: "Hosting"** - Shows projects with status: "hosting"

**Hosting Tab Features**:
- Display all hosting projects for this client
- Show each project's:
  - Project name
  - Monthly hosting fee
  - Billing day
  - Last invoice date (if tracked)
  - Status (active/inactive)
- Add "Generate Hosting Invoice" button at the top
- Button opens dialog to:
  - Display checkboxes for each hosting project
  - All projects pre-selected by default
  - Show monthly fee for each project
  - Calculate and display total combined amount
  - Generate invoice button (calls API to create .docx invoice)

### 2. Projects Hosting Page Enhancement
**Location**: `client/pages/admin/projects.tsx`

**Current State**: Has tabs for "builds" and "hosting"

**Required Changes to Hosting Tab**:
Add "Generate Hosting Invoice" button at the top of the hosting projects view

**Invoice Generation Flow**:
1. Click "Generate Hosting Invoice" button
2. Open dialog with:
   - **Client Selector**: Dropdown to select which client to invoice
   - **Auto-populate Projects**: Once client is selected, automatically load all hosting projects for that client
   - **Project Selection**: Show checkboxes for each hosting project with:
     - Project name
     - Monthly hosting fee
     - Checkbox (all selected by default)
   - **Total Calculation**: Display combined monthly total
   - **Generate Button**: Create invoice with selected projects

### 3. Invoice Generation Backend

**New API Endpoint**: `POST /api/admin/invoices/hosting`

**Request Body**:
```typescript
{
  clientId: number;
  projectIds: number[];  // Array of project IDs to include
  invoiceDate: string;   // ISO date string
  dueDate: string;       // ISO date string
}
```

**Response**:
```typescript
{
  invoiceUrl: string;    // Download URL for generated .docx
  invoiceNumber: string; // Generated invoice number
  totalAmount: number;   // Total in cents
}
```

**Backend Logic**:
1. Validate that all projectIds belong to the specified clientId
2. Fetch project details and hosting fees for each project
3. Fetch client details (name, email, address, etc.)
4. Generate invoice number (format: `HOST-{clientId}-{YYYYMM}-{sequential}`)
   - Example: `HOST-5-202601-001`
5. Create .docx invoice using python-docx with:
   - JDCOREDEV branding (same style as development invoices)
   - Client information
   - Line items: One row per hosting project
   - Each line item shows:
     - Project name
     - Service: "Monthly Hosting & Support"
     - Monthly fee
   - Subtotal, tax (if applicable), and total
   - Payment terms and methods
   - Invoice footer with contact info
6. Save invoice file to storage
7. Optionally: Save invoice record to database for history
8. Return download URL

### 4. Invoice Document Template

**JDCOREDEV Branding** (from previous invoices):
- Logo: "JD" (dark gray) + "CoreDev" (blue #3B82F6)
- Tagline: "Custom Software Development & Consulting"
- Color scheme:
  - Dark text: RGB(26, 27, 31)
  - Accent blue: RGB(59, 130, 246)
  - Gray text: RGB(107, 114, 128)
- Professional, clean layout

**Invoice Structure**:

**Header Section**:
- JDCOREDEV logo and branding
- "HOSTING INVOICE" title
- Invoice number
- Invoice date
- Due date (default: 7 days from invoice date)

**Bill To / From Section**:
- Bill To: Client name, company, address
- From: JD CoreDev details

**Project Details Section**:
- Title: "MONTHLY HOSTING SERVICES"
- Subtitle: For period [Month Year]

**Line Items Table**:
| Project | Service | Monthly Fee |
|---------|---------|-------------|
| Project 1 Name | Monthly Hosting & Support<br>• Infrastructure & Database<br>• Security & Updates<br>• Technical Support | $XXX.00 |
| Project 2 Name | Monthly Hosting & Support<br>• Infrastructure & Database<br>• Security & Updates<br>• Technical Support | $XXX.00 |

**Totals Section**:
- Subtotal
- Tax (if applicable)
- **TOTAL DUE** (bold, blue accent)

**What's Included Section**:
For each project, monthly hosting includes:
- ✓ Hosting infrastructure (Replit/AWS/etc.)
- ✓ PostgreSQL database with backups
- ✓ File storage & CDN
- ✓ Security patches & platform updates
- ✓ Technical support
- ✓ Performance monitoring

**Payment Information**:
- Payment methods accepted
- Payment due date
- Invoice reference number

**Footer**:
- Thank you message
- Contact information
- Company tagline

### 5. UI/UX Flow Examples

**Example 1: From Client Detail Page**
```
1. Admin navigates to Client → "ABC Corporation"
2. Clicks on "Projects" tab
3. Sees two sub-tabs: "Development" and "Hosting"
4. Clicks "Hosting" sub-tab
5. Sees list of 3 hosting projects:
   - E-commerce Platform ($250/month)
   - Mobile App Backend ($150/month)
   - Analytics Dashboard ($100/month)
6. Clicks "Generate Hosting Invoice" button
7. Dialog opens with all 3 projects checked
8. Total shown: $500.00/month
9. Admin unchecks "Analytics Dashboard"
10. Total updates to: $400.00/month
11. Clicks "Generate Invoice"
12. API creates invoice for 2 projects
13. Success toast: "Invoice generated successfully"
14. Download link provided
```

**Example 2: From Projects Hosting Page**
```
1. Admin navigates to Projects → "Hosting" tab
2. Sees all hosting projects across all clients
3. Clicks "Generate Hosting Invoice" button
4. Dialog opens with client selector
5. Selects "ABC Corporation" from dropdown
6. System auto-loads ABC's 3 hosting projects (all checked)
7. Shows total: $500.00/month
8. Admin can adjust selections
9. Clicks "Generate Invoice"
10. Same flow as Example 1
```

### 6. Database Schema Additions (Optional)

**New Table: `hosting_invoices`** (for tracking history)
```sql
CREATE TABLE hosting_invoices (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  total_amount_cents INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending, paid, overdue, cancelled
  file_path TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE hosting_invoice_line_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER REFERENCES hosting_invoices(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  project_name VARCHAR(255) NOT NULL,
  amount_cents INTEGER NOT NULL,
  description TEXT
);
```

**Benefits of tracking**:
- Invoice history per client
- Payment status tracking
- Analytics and reporting
- Prevents duplicate invoices

### 7. Frontend Component Structure

**New Component**: `HostingInvoiceGeneratorDialog.tsx`
```typescript
interface HostingInvoiceGeneratorDialogProps {
  clientId?: number;  // Pre-selected client (from client detail page)
  trigger: React.ReactNode;
  onSuccess?: (invoiceUrl: string) => void;
}
```

**Component Features**:
- If `clientId` provided, skip client selection step
- If no `clientId`, show client dropdown first
- Load hosting projects for selected client
- Checkbox list with project details
- Real-time total calculation
- Generate button with loading state
- Success state with download link
- Error handling with toast notifications

**State Management**:
```typescript
const [selectedClientId, setSelectedClientId] = useState<number | null>(clientId || null);
const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
const [projects, setProjects] = useState<HostingProject[]>([]);
const [totalAmount, setTotalAmount] = useState(0);
```

### 8. Validation & Edge Cases

**Validations**:
- At least one project must be selected
- All selected projects must have hosting fees configured
- Selected projects must all belong to the selected client
- Client must have valid billing information

**Edge Cases**:
- Client with no hosting projects: Show "No hosting projects found" message
- Project without hosting fee: Show warning, disable checkbox
- Multiple invoices in same month: Add sequential number or show warning
- Client without email: Allow invoice generation but show warning

**Error Messages**:
- "Please select at least one project"
- "Client has no hosting projects"
- "Unable to generate invoice. Please try again"
- "This project is missing hosting fee configuration"

### 9. Code Style & Patterns

Follow existing patterns from:
- `client/pages/admin/projects.tsx` for tab structure
- `client/pages/admin/client-detail.tsx` for client data handling
- Existing dialog components for modal UX
- Use TanStack Query for data fetching with proper cache invalidation
- Add data-testid attributes for testing
- Use proper TypeScript types exported from schema.ts
- Implement loading states with Skeleton components
- Error handling with toast notifications
- Follow React hooks best practices

### 10. Python Invoice Generation

**Script Location**: `server/invoices/generate_hosting_invoice.py`

**Function Signature**:
```python
def generate_hosting_invoice(
    invoice_number: str,
    client: dict,
    projects: list[dict],
    invoice_date: str,
    due_date: str,
    output_path: str
) -> str:
    """
    Generate a hosting invoice .docx file
    
    Args:
        invoice_number: Unique invoice identifier
        client: Dict with client details (name, email, address, etc.)
        projects: List of dicts with project details (name, monthlyFee)
        invoice_date: Invoice date string
        due_date: Payment due date string
        output_path: Where to save the .docx file
    
    Returns:
        Path to generated invoice file
    """
```

**Branding Requirements**:
- Use exact colors from JDCOREDEV brand:
  - Dark: RGB(26, 27, 31)
  - Accent Blue: RGB(59, 130, 246)
  - Gray: RGB(107, 114, 128)
- Font: Arial (universally compatible)
- Professional spacing and alignment
- Blue horizontal divider lines
- Bold totals section
- Clear visual hierarchy

## Expected Deliverables

1. **Frontend Components**:
   - Updated `client/pages/admin/client-detail.tsx` with Development/Hosting sub-tabs
   - Updated `client/pages/admin/projects.tsx` with invoice generation button
   - New `HostingInvoiceGeneratorDialog.tsx` component
   - Any necessary utility functions

2. **Backend**:
   - New API endpoint: `POST /api/admin/invoices/hosting`
   - Invoice number generation logic
   - Data validation and error handling
   - Integration with Python invoice generator

3. **Python Script**:
   - `server/invoices/generate_hosting_invoice.py`
   - Function to create branded .docx invoices
   - Support for multiple line items
   - JDCOREDEV branding implementation

4. **Database** (optional but recommended):
   - Migration for `hosting_invoices` table
   - Migration for `hosting_invoice_line_items` table
   - Updated schema.ts with new types

5. **Types**:
   - Updated TypeScript types in `shared/schema.ts`
   - Invoice-related interfaces

## Testing Scenarios

1. **Single Project Invoice**:
   - Generate invoice for one hosting project
   - Verify correct formatting and calculations

2. **Multi-Project Invoice**:
   - Generate invoice for 3+ projects
   - Verify line items display correctly
   - Verify total calculation accuracy

3. **Client Selection**:
   - From projects page, select different clients
   - Verify correct projects load for each client

4. **Partial Selection**:
   - Deselect some projects
   - Verify total recalculates
   - Verify invoice only includes selected projects

5. **Edge Cases**:
   - Client with no hosting projects
   - Project without hosting fee
   - Invalid client ID
   - Network errors

## Success Criteria

- ✅ Can generate invoices from both client detail page and projects hosting page
- ✅ Can select multiple projects for a single invoice
- ✅ Invoice totals calculate correctly
- ✅ Generated invoices follow JDCOREDEV branding
- ✅ All line items display with project details
- ✅ Invoice downloads as .docx file
- ✅ UI provides clear feedback (loading states, errors, success)
- ✅ Code follows existing patterns and conventions

## Nice-to-Have Enhancements (Future)

- Email invoice directly to client
- Invoice history view with status tracking
- Automatic invoice generation on billing day
- PDF export option
- Invoice templates customization
- Batch invoice generation for all clients
- Payment tracking integration

---

**Please implement this feature following the existing code patterns and architecture. Ensure type safety, proper error handling, and a clean user interface that matches the existing admin design system.**
