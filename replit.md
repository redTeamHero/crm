# Evolve.Ai

## Overview
Evolve.Ai is a dual-access credit transformation platform with two distinct user journeys:
- **CRM (Pro Mode)**: Full multi-tenant system for credit repair professionals with client management, bulk automation, and team tools
- **DIY Mode**: Simplified self-service for individual consumers to fix their own credit

Both share the same backend, Metro-2 audit engine, letter generation, and rule engine.

## Architecture
### Entry Points
- `/` - Neutral welcome page with CRM/DIY selection
- `/crm` - CRM login for professionals
- `/diy` - DIY login for consumers

### Auth Model
- **CRM users**: role='crm_admin|crm_agent|member', belong to a tenant_id
- **DIY users**: role='diy_user', tenant_id=NULL (isolated sandbox), plan='free|basic|pro'

### Data Isolation
- CRM data: `users`, `consumers`, `clients`, `letters` (multi-tenant)
- DIY data: `diy_users`, `diy_reports`, `diy_letters` (single-user sandbox)

## Project Structure
- `metro2 (copy 1)/crm/` - Express CRM backend with API routes (port 3000)
  - `public/` - CRM static files (dashboard, clients, etc.)
  - `public/diy/` - DIY static files (login, signup, dashboard)
- `packages/metro2-core/` - Core Metro 2 parsing and validation logic
- `packages/metro2-cheerio/` - Cheerio adapter for Node.js parsing
- `packages/metro2-browser/` - Browser-compatible parser
- `shared/` - Shared knowledge graph and violations data
- `ai_agent/` - Python AI agent for automated workflows
- `python-tests/` - Python test suite

## Running the Project
The backend can be started separately if needed:
```bash
cd "metro2 (copy 1)/crm"
npm install
npm run dev
```

## Configuration
### Backend Environment Variables (see README.md for full list)
- `PORT` - Backend HTTP port (default: 3000)
- `DATABASE_URL` - Database connection string
- `JWT_SECRET` - Session token signing secret
- Various API keys for integrations (Stripe, OpenAI, etc.)

## Recent Changes
- 2026-01-30: Implemented dual-access CRM/DIY architecture
  - Created neutral welcome page at "/" with CRM/DIY routing
  - Added DIY user management with separate data isolation (diy_users, diy_reports, diy_letters)
  - Built DIY auth flow (login, signup) with plan selection (free/basic/pro)
  - Created DIY dashboard with report upload, audit, violations display, and letter generation
  - Implemented server-side plan gating (free can view, basic/pro can audit and generate letters)
  - Added DIY API routes: /api/diy/signup, /api/diy/login, /api/diy/me, /api/diy/reports/*, /api/diy/letters/*
  - DIY users are fully isolated from CRM multi-tenant data
- 2026-01-30: Removed coach button from dashboard
  - Removed coach toggle button, moneybag toggle, and coach panel from dashboard.html
- 2026-01-30: Fixed bank name extraction in tradeline scraper
  - Added isLikelyCurrency() function to detect currency-formatted strings
  - Updated all fallback paths in extractBankAndStatement and parseDataAttributeRows
  - Added safety check in buildRecord to clear currency-like bank values
  - Prevents credit limit values from appearing in bank filter dropdown
- 2026-01-30: Added cross-bureau violation detection
  - Added dedicated cross-bureau audit pass that detects discrepancies between bureaus
  - Detects: date mismatches, balance differences, status inconsistencies, missing accounts
  - Cross-bureau analysis runs in parallel with per-bureau audits for speed
  - Added deduplication to prevent duplicate violations from both passes
  - Works in both parallel (large reports) and sequential (small reports) paths
- 2026-01-30: Performance optimizations for PDF parsing and audit processing
  - Pre-compiled 25+ regex patterns at module level in metro2-core parser
  - Added parallel bureau processing (TUC/EXP/EQF) for LLM audits with configurable concurrency
  - Implemented parallelProcess utility with concurrency limiting (default: 3)
  - Fixed splitReportByBureau to only include tradelines with explicit bureau data
  - Preserved full byBureau context in split reports for cross-bureau audit logic
  - Added proper error propagation in parallel audit workflow
- 2026-02-15: Implemented real Stripe subscription payments with feature gating
  - Created stripeClient.js using Replit connector for credential management
  - Created webhookHandlers.js for Stripe webhook processing via stripe-replit-sync
  - Added PostgreSQL database for Stripe schema sync (stripe.products, stripe.prices, stripe.subscriptions)
  - Webhook route registered BEFORE express.json() for raw body handling
  - Stripe initialization on startup: schema migrations, managed webhook, data backfill
  - Created 5 subscription products via seed-products.js:
    - CRM: Starter ($97/mo), Growth ($297/mo), Enterprise ($597/mo)
    - DIY: Basic ($29/mo), Pro ($79/mo)
  - API endpoints: /api/stripe/products, /api/stripe/checkout, /api/stripe/portal, /api/stripe/subscription-status, /api/stripe/feature-access
  - CRM billing page updated with pricing grid and subscription management UI
  - DIY upgrade flow uses Stripe checkout with fallback to direct plan upgrade
  - Feature gating: CRM tiers control client limits, bulk automation, AI letters, white-labeling, API access
  - Feature gating: DIY tiers control audit access and letter generation limits

### Stripe Integration Architecture
- Credentials: Replit Stripe connector (no hardcoded keys)
- Database: PostgreSQL `stripe` schema managed by stripe-replit-sync (auto-synced via webhooks)
- App data: SQLite/kvdb for users, consumers, letters (unchanged)
- Products: Created via Stripe API, synced to PostgreSQL, queried for frontend display
- Checkout: Stripe Checkout Sessions for subscription creation
- Portal: Stripe Customer Portal for subscription management
- Feature gating: Query stripe.subscriptions → stripe.prices → stripe.products metadata for tier

- 2026-02-15: Added call booking system to client portal
  - "Book a Call" button opens a multi-step scheduling modal
  - Step 1: Calendar date picker + available time slot selection (30-min increments)
  - Step 2: Contact details form (name, email, phone, notes)
  - Step 3: Confirmation screen
  - Default availability: Mon-Fri 9am-5pm Eastern
  - Backend: /api/booking/availability, /api/booking/slots, /api/booking/book, /api/booking/bookings
  - Availability stored in kvdb (call_availability key), bookings in kvdb (call_bookings key)
  - Conflict detection prevents double-booking same time slot
  - Auto-syncs to Google Calendar when configured
  - Admin can update availability via PUT /api/booking/availability
- 2026-02-15: Fixed PDF letter generation formatting
  - Fixed "undefined, undefined undefined" in consumer address (letterEngine.js) — uses filter(Boolean).join()
  - Rewrote PDFKit fallback renderer (pdfUtils.js) to properly parse HTML structure
  - Tables now render with cell borders, shaded label columns, and proper column alignment
  - Bold text, headings, and inline formatting preserved correctly
  - Numbered lists render with proper indentation
  - Automatic page breaks for long content
  - generateOcrPdf() accepts pdfOptions; portal endpoint passes allowBrowserLaunch:false when Chrome unavailable
- 2026-02-15: Added portal-specific mail endpoint
  - POST /api/portal/:consumerId/mail for unauthenticated portal mail (validates consumer + letter ownership)
  - Portal Mail button no longer hits admin-only endpoint
- 2026-02-15: Added cinematic animated hero to welcome page
  - 5-scene Canvas 2D animation: fragmented scores → DNA helix assembly → butterfly morph → rising graph (780+) → EVOLV logo reveal
  - Pro/cinematic version: dark matte background, gold (#d4a853) animation strokes
  - Cross-fade transitions between scenes, ambient gold particles throughout
  - IntersectionObserver pauses animation when offscreen for performance
  - Final frame: EVOLV logo, "Your Financial Evolution Starts Here" tagline, CTA buttons for CRM/DIY paths
  - Responsive canvas with DPR scaling, mobile-friendly text sizing

- 2026-02-17: Premium CRM UI redesign - dark theme with gold accents
  - Design system: Apple minimalism + Nike bold energy + Yeezy futuristic aesthetic
  - Created evolv-dark.css (1830+ lines): near-black backgrounds (#0a0a0a), gold accents (#d4a853), glassmorphism cards
  - Built sidebar.js: collapsible icon-based sidebar (72px → 260px), gold hover states, active page detection, keyboard shortcut ([), localStorage persistence
  - Built command-palette.js: Spotlight-style Cmd+K/Ctrl+K overlay, fuzzy search, 16 commands for navigation and actions
  - Redesigned login page: dark glass card, gold buttons, gold role selector, dark inputs
  - Dark-themed all 15 CRM pages: dashboard, clients, leads, billing, tradelines, letters, library, settings, client-portal-settings, my-company, schedule, marketing, workflows, quiz
  - Dashboard: gold hero section, dark metric cards, dark growth navigator, dark map section, dark modals
  - Added micro-animations: page fade-in, card hover lift, counter animations, shimmer loading, button press effects, staggered grid entrance, gold glow pulse, custom scrollbars
  - Excluded from dark theme: client-portal-template.html, DIY pages, welcome.html (these keep their own styles)

- 2026-02-17: Added client portal invite link and lead capture link features
  - Client Portal Invite: /api/consumers/:id/portal-invite generates a unique token link (7-day TTL, single-use)
  - Client Setup Page: /client-setup?token=... prompts first-time password creation, then redirects to login
  - Token security: tenant-scoped, TTL-enforced, consumed on use
  - Portal Invite button appears in Files & Activity panel when a consumer is selected on /clients
  - Lead Capture Form: public /lead-capture page captures name, phone, email, credit score, goal, notes
  - Lead Capture Link: /leads page has "Generate Link" button with source tracking (Facebook, Instagram, etc.)
  - Rate limiting on lead capture (10s per IP), honeypot field for bot protection, server-side validation
  - Captured leads auto-added to pipeline as "new" status with source attribution

- 2026-02-17: Added Data Breach Card to /clients detail view
  - Breach card appears below Files & Activity panel when a consumer is selected
  - Shows breach count, individual breach names with red warning styling
  - Displays "selected for dispute" count when breaches are chosen
  - "Check Breaches" button triggers existing breach lookup flow
  - Card updates dynamically after breach lookup completes

- 2026-02-17: Separated billing into two distinct pages
  - /billing: CRM subscription only — pricing grid, subscription management, saved payment method
  - /client-invoicing: Standalone page — hero, metrics (outstanding, next due, collected YTD), autopay, invoice history, plan builder, quick add invoice, revenue accelerator
  - Added Invoicing to sidebar navigation
  - Each page has its own JS module and guided tour

- 2026-02-17: Fixed guided tour positioning and colors
  - Replaced fixed 400ms scroll timeout with scroll-settle detection using rAF loop (max 120 frames safety)
  - Added viewport boundary clamping so popover never goes off-screen
  - Added 'left' placement option in calculatePlacement
  - Improved element finding with getBoundingClientRect fallback
  - CSS overrides ensure .text-slate-600 and similar dark Tailwind classes render as readable #999 on dark backgrounds
  - .font-semibold in tour body renders as #e5e5e5 for contrast

- 2026-02-17: Fixed Files & Activity panel visibility on /clients
  - #clientsNegativePanel now programmatically shows when a consumer is selected
  - Portal Invite and Client Portal buttons visible when consumer is active

- 2026-02-20: Deployment and registration improvements
  - Configured autoscale deployment (port 3000, node server.js)
  - Added Stripe email validation: regex check before passing customer_email to checkout sessions (payment + subscription)
  - Built Create Account modal on login page: full name, email, phone, company name, username, password, confirm password
  - Server-side /api/register validation: required fields (name, email, username, password), email format, password length, username uniqueness, email uniqueness
  - Modal uses dark glass theme consistent with existing design system

- 2026-02-20: Production database and error handling fixes
  - Fixed db/connection.js: added SSL support for production PostgreSQL (rejectUnauthorized: false)
  - Added connection pool timeouts (acquireTimeoutMillis, createTimeoutMillis, idleTimeoutMillis)
  - Added testConnection() function for startup health check
  - Server now logs database host and connection status on startup
  - Improved DIY signup.js and login.js error handling: separate network vs parse vs server error messages
  - Added client-side email format validation on DIY signup page
  - Users see friendly error messages instead of raw database errors

## Dependencies
- Node.js 20
- Python 3.12 (for AI agent and Metro 2 parsers)
- PostgreSQL (for Stripe data sync via stripe-replit-sync)
