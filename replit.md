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
- A call booking system for clients, including availability management, time slot selection, and conflict detection.
- Client portal uses a light theme (`portal-layout` class on body, `background: #f8f9ff`). Text defaults to dark via `body { color: var(--text-primary) }`. Section headings that need white text use explicit `text-white` Tailwind classes. The `--fg` CSS variable (`#0f172a`) is defined in `:root` for elements like `.doc-card-name`, `.mail-card-name`, `.imsg-header-name`, and `.upload-card-title`. Negative item creditor names and invoice descriptions use explicit `text-slate-800` for defensive visibility.

## External Dependencies
- **Node.js**: Runtime environment for the backend.
- **Python**: Used for the AI agent and Metro 2 parsers.
- **PostgreSQL**: Utilized for Stripe data synchronization via `stripe-replit-sync`.
- **Stripe**: For subscription payments, product management, checkout, and customer portal. Integrated using the Replit connector for credentials and webhooks for data synchronization.
- **OpenAI**: Integrated for various AI functionalities.
- **Google Calendar**: For syncing booked calls.