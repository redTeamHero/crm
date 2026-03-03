# Evolve.Ai

## Overview
Evolve.Ai is a dual-access credit transformation platform designed to empower both credit repair professionals and individual consumers. It offers a comprehensive CRM "Pro Mode" for multi-tenant client management, automation, and team tools, alongside a "DIY Mode" for individuals to self-manage their credit repair journey. Both modes leverage a shared backend, a sophisticated Metro-2 audit engine, advanced letter generation capabilities, and a robust rule engine. The platform aims to revolutionize credit repair by providing accessible, efficient, and intelligent tools for financial improvement.

## User Preferences
No specific user preferences were provided in the original document.

## System Architecture
Evolve.Ai is built with a dual-access architecture featuring distinct entry points for CRM (`/crm`) and DIY (`/diy`) users, and a neutral welcome page at `/`. Authentication models separate CRM users by role and tenant, while DIY users are isolated in their own sandboxes with plan-based feature access. Data isolation is strictly maintained, with multi-tenant data for CRM users and single-user sandboxed data for DIY users.

The project structure includes an Express CRM backend, core Metro 2 parsing logic (`packages/metro2-core`), browser and Cheerio adapters for parsing, shared knowledge graphs, and a Python AI agent for automated workflows.

UI/UX for the CRM features a premium dark theme with gold accents, inspired by Apple minimalism, Nike energy, and Yeezy aesthetics. This includes a collapsible icon-based sidebar, a Spotlight-style command palette, redesigned login pages, and dark-themed CRM pages with micro-animations. The welcome page features a cinematic animated hero showcasing the project's vision. PDF letter generation has been refined for accurate rendering of HTML structures, including tables, formatting, and automatic page breaks.

Key technical implementations include:
- Server-side plan gating for DIY users based on subscription tiers.
- Cross-bureau violation detection to identify discrepancies across credit bureaus.
- Tradeline deduplication runs in two places: server-side in `buildClientPortalPayload` (server.js) for the client portal, and client-side in `dedupeTradelines` (index.js) for the CRM client detail page. Both normalize account numbers to handle bureau-specific formatting differences (e.g., TransUnion `A0000000001785****` vs Experian `CBA0000000001785****` → `1785`). The server-side dedup keys by normalized account number only; the client-side keys by `creditorName|normalizedAccounts`.
- Performance optimizations for PDF parsing and audit processing, including regex pre-compilation and parallel bureau processing.
- A client portal invitation system with unique, time-limited tokens and a lead capture form with source tracking.
- A data breach card integrated into the client detail view.
- A comprehensive education system with 21 lessons across three tiers (Beginner, Intermediate, Expert), featuring timed quizzes, bonus XP, and downloadable personalized certificates. The education layout is shared between the client portal and DIY dashboard, using the same `education-player.js`, `education-lessons.js`, `education-intermediate.js`, and `education-expert.js` scripts. Both render the Credit Academy with tier tabs, zigzag lesson paths, XP tracking, and final exams.
- A call booking system for clients, including availability management, time slot selection, and conflict detection. Quick slots on the schedule page have edit buttons (pencil icon) that open the curated slots editor and highlight the target row.
- A "Primaries" section in the client portal (sidebar nav tab below Tradelines, hash `#primaries`) displaying curated primary tradelines and credit-building resources in 4 categories: Credit-Builder Loans, Secured Credit Cards, Credit-Building Apps, and Rent-Reporting Services. Static content rendered from HTML in `client-portal-template.html` with `.primaries-*` CSS classes in `style.css`.
- A report change detection system (`shared/lib/format/reportDiff.js`) that automatically compares newly uploaded credit reports against previous ones, detecting deletions, new items, and field-level changes per bureau. Diffs are computed during upload and stored on each report as `report.diff`. The CRM client detail page shows a collapsible "Report Changes" panel with color-coded sections (green deletions, red new items, yellow changes). An on-demand diff API endpoint (`GET /api/consumers/:id/report/:rid/diff`) computes diffs retroactively for legacy reports. Cumulative deletion counts are surfaced in the client portal via `reportProgress`.
- Client portal uses a light theme (`portal-layout` class on body, `background: #f8f9ff`). Text defaults to dark via `body { color: var(--text-primary) }`. Section headings that need white text use explicit `text-white` Tailwind classes. The `--fg` CSS variable (`#0f172a`) is defined in `:root` for elements like `.doc-card-name`, `.mail-card-name`, `.imsg-header-name`, and `.upload-card-title`. Negative item creditor names and invoice descriptions use explicit `text-slate-800` for defensive visibility.

## Security Hardening
- All frontend `esc()` / `escapeHtml()` helpers escape all 5 HTML-significant characters (`&`, `<`, `>`, `"`, `'`). The canonical implementation lives in `public/common.js` and is exposed globally as `window.escapeHtml`.
- All `innerHTML` assignments across 22 frontend JS files have been audited and wrapped with `esc()` / `escapeHtml()` for any dynamic or API-derived data.
- Server-side `renderInvoiceHtml` escapes `company.name`, `consumer.name`, `inv.desc`, and `inv.due` via a server-side `escapeHtml()` helper before HTML rendering.
- `letterEngine.js` `safe()` function includes HTML escaping via `escapeHtml()`, protecting all consumer PII and credit bureau data injected into dispute letter HTML templates.
- `helmet` middleware is enabled globally (CSP and COEP disabled for compatibility) providing X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, and other security headers.
- `JWT_SECRET` and `DIY_JWT_SECRET` environment variables are **required** at startup — the server throws if either is missing. No hardcoded fallback secrets.
- All file upload handlers sanitize `req.file.originalname` via `path.basename()` to prevent path traversal attacks.
- API authentication enforced: Leads, Invoices, Billing Plans, Messages (GET), and Calendar CRUD endpoints all require `authenticate` middleware. Write/delete operations additionally use `forbidMember`.
- `POST /api/settings` requires `authenticate` + `requireRole("admin")`. `GET /api/settings` masks secret values (API keys, tokens, client secrets) using `maskSecrets()` — only the last 4 characters are exposed.
- Registration endpoint (`/api/register`) returns a generic error to prevent account enumeration (no distinct "username taken" vs "email registered" messages).
- Server-side prototype pollution is mitigated by a global `stripDangerousKeys` middleware that removes `__proto__`, `constructor`, and `prototype` from all incoming `req.body` payloads.
- `PUT /api/booking/availability` validates and whitelists input properties.
- SQL queries in `scripts/html_ingest/ingest.py` use parameterized `IN` clauses via the `_in_clause()` helper.
- Subprocess calls in `scripts/unused_code_audit.py` and `scripts/webhook/server.py` validate executable paths against whitelists.
- npm dependency overrides for `minimatch`, `tar`, `tar-fs`, `jws`, and `js-yaml` are set in root `package.json` to resolve known CVEs.
- `nodemailer` upgraded to v7.x as a direct dependency.

## External Dependencies
- **Node.js**: Runtime environment for the backend.
- **Python**: Used for the AI agent and Metro 2 parsers.
- **PostgreSQL**: Utilized for Stripe data synchronization via `stripe-replit-sync`.
- **Stripe**: For subscription payments, product management, checkout, and customer portal. Integrated using the Replit connector for credentials and webhooks for data synchronization.
- **OpenAI**: Integrated for various AI functionalities.
- **Google Calendar**: For syncing booked calls.