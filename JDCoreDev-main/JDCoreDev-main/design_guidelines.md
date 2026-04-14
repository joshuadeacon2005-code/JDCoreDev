# JD Core Design Guidelines

## Design Approach

**Selected System**: Linear + Vercel Hybrid Aesthetic  
**Rationale**: Clean, developer-focused UI with strong information hierarchy, perfect for productivity tools requiring both data density and visual clarity. The marketing site will draw inspiration from modern SaaS landing pages (Vercel, Railway, Supabase) while admin/portal areas follow Linear's dashboard patterns.

## Typography System

**Font Families**:
- Primary: Inter (headings, UI elements, navigation)
- Secondary: JetBrains Mono (data tables, status codes, document names)

**Scale & Hierarchy**:
- H1: text-4xl font-semibold (marketing heroes only)
- H2: text-2xl font-semibold (section headers)
- H3: text-xl font-medium (card headers, modal titles)
- H4: text-lg font-medium (subsection headers)
- Body: text-base (primary content)
- Small: text-sm (metadata, captions, helper text)
- Micro: text-xs font-medium uppercase tracking-wide (labels, badges)

## Layout System

**Spacing Primitives**: Use Tailwind units of 1, 2, 3, 4, 6, 8, 12, 16 for consistency
- Component padding: p-4 to p-6
- Section spacing: py-12 to py-16
- Card gaps: gap-4 to gap-6
- Between sections: mb-8 to mb-12

**Grid Structure**:
- Marketing: max-w-6xl centered containers
- Admin/Portal: Full-width with sidebar layout (w-64 fixed sidebar, main content flex-1)
- Content areas: max-w-7xl with px-4 to px-8

## Component Architecture

### Navigation

**Public Site Header**:
- Fixed top position with backdrop-blur
- Logo left, navigation center, CTA right
- Height: h-16
- Padding: px-6

**Admin/Portal Sidebar**:
- Fixed left sidebar, w-64
- Logo at top (py-6)
- Navigation groups with dividers
- Active state: border-l-2 accent with subtle background
- Icons: 20px with text-sm labels

### Dashboard Components

**Stat Cards**:
- Grid layout: grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4
- Card structure: rounded-lg border p-6
- Label: text-sm font-medium
- Value: text-3xl font-semibold
- Trend indicator: text-xs with icon

**Data Tables**:
- Sticky header with border-b-2
- Row height: min-h-[56px] with py-3 px-4
- Alternating subtle row backgrounds
- Actions column: right-aligned with icon buttons
- Font: JetBrains Mono for data columns, Inter for text

**Status Badges**:
- Rounded-full px-3 py-1 text-xs font-medium
- Distinct treatments per status (border + subtle background)
- Use consistent badge sizing across all contexts

**Calendar Grid**:
- 7-column grid for days
- Each cell: aspect-square with rounded border
- Available dates: hover state with cursor-pointer
- Unavailable: opacity-50 with cursor-not-allowed
- Selected: border-2 with filled background
- Header row: text-xs font-semibold uppercase

### Forms

**Input Fields**:
- Full-width with rounded-md border
- Height: h-10 for text inputs, h-24 for textareas
- Padding: px-3 py-2
- Focus: ring-2 offset treatment
- Labels: text-sm font-medium mb-2
- Helper text: text-xs mt-1

**Buttons**:
- Primary: px-4 py-2 rounded-md font-medium
- Secondary: Same with border variant
- Icon buttons: p-2 rounded-md
- Sizes: text-sm for default, text-xs for small

### Cards & Panels

**Project Cards**:
- Rounded-lg border with hover:shadow-md transition
- Header: p-4 with title and status badge
- Body: p-4 with project details in grid
- Footer: px-4 py-3 with border-t for actions

**Modal Overlays**:
- Backdrop: backdrop-blur-sm with semi-transparent overlay
- Modal: max-w-2xl rounded-lg shadow-2xl
- Header: px-6 py-4 border-b
- Body: p-6
- Footer: px-6 py-4 border-t with right-aligned actions

### Document Management

**Document List**:
- Table layout with icon, filename, type, date, size, actions
- File icon: 16px based on mime type
- Filename: JetBrains Mono truncate
- Version badge: text-xs rounded-full

**Upload Zone**:
- Dashed border-2 rounded-lg
- Min-height: min-h-[200px]
- Center-aligned icon and text
- Drag-active state: border-solid with background shift

### Activity Timeline

**Timeline Structure**:
- Left border line (border-l-2) connecting events
- Event dots: absolute positioned circles (w-3 h-3 rounded-full)
- Content cards offset from line with ml-6
- Timestamp: text-xs above each event
- Spacing: gap-6 between events

## Marketing Site Structure

**Hero Section**:
- Full viewport height (min-h-screen) with gradient background
- Two-column layout: lg:grid-cols-2
- Left: Headline (text-5xl font-bold) + subheadline + CTA buttons
- Right: Dashboard preview image (screenshot or illustration)
- Padding: py-20 px-6

**Features Section**:
- Grid: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8
- Each feature: Icon (32px) + title + description
- Padding: py-16

**Social Proof Section**:
- Centered testimonial cards
- Grid: grid-cols-1 md:grid-cols-2 gap-6
- Each card: Quote + attribution with avatar placeholder

**Contact Form**:
- Two-column: form on left, contact info on right
- Form fields: full-width with gap-4
- Submit button: w-full on mobile, w-auto on desktop

**Footer**:
- Three-column grid with company info, links, social
- Border-t with py-12 px-6

## Images

**Hero Image**: Large dashboard preview/mockup showing the admin interface with sample data, projects, and calendar view. Position on right side of hero, takes up 50% width on desktop. Should show the product in action to build credibility.

**Feature Icons**: Use Heroicons outline style, 32px for feature cards, 20px for sidebar navigation, 16px for inline elements.

**Document Type Icons**: File type icons (PDF, DOC, etc.) at 16px for document lists.

**Avatar Placeholders**: 40px circles for user profiles in navigation, 32px in activity timeline.

## Responsive Behavior

- Mobile (<768px): Sidebar collapses to hamburger menu, single-column layouts, full-width cards
- Tablet (768px-1024px): Two-column grids, condensed sidebar
- Desktop (>1024px): Full multi-column layouts, expanded sidebar, optimal data density

## Interaction Patterns

**Hover States**: Subtle shadow elevation and border intensity changes
**Loading States**: Skeleton screens with pulsing backgrounds for data-heavy views
**Empty States**: Centered icon + message + action button
**Confirmation Dialogs**: Modal overlay with clear action/cancel buttons

This design system prioritizes clarity, scanability, and professional polish suitable for a developer-focused management tool while maintaining visual appeal in public-facing areas.