# CRM Metro-2

## Overview
CRM Metro-2 is a credit-dispute CRM and audit toolkit that combines a Node.js API, Metro-2 rule data, and a client portal for guided dispute workflows. The repository is aimed at teams who need a repeatable process for identifying Metro-2 reporting issues, generating dispute letters, and managing client-facing portals. It ships with a Node/Express server that powers audits, PDFs, workflow rules, and integrations, along with a separate Next.js portal UI. A Python test suite validates Metro-2 audit behavior against known scenarios, and shared Metro-2 data files keep the audit engine and letter generator consistent. The codebase is organized as a multi-part system: the backend lives in a dedicated CRM folder, the portal is a separate app, and reusable Metro-2 libraries are maintained under packages. By default, the backend uses SQLite for local development and can be pointed at PostgreSQL/MySQL via environment configuration. It targets teams building a compliance-forward credit dispute experience with audit transparency, letter generation, and automation hooks.

**Key capabilities**
- Run Metro-2 audits and generate dispute letters from shared violation metadata.
- Serve a CRM API with authentication, workflows, and job processing.
- Offer a Next.js client portal that consumes `/api/portal/:id` data.
- Extend the system with reusable Metro-2 packages and Python regression tests.

## Repository Status
- **Fork status:** Unclear. There is no upstream/remote metadata or explicit fork statement in the repository itself, so provenance cannot be confirmed from the checked-in files.
- **Evidence missing:** Git remote URLs or a README note identifying an upstream repository.

## Features
- Metro-2 violation metadata stored in `metro2 (copy 1)/crm/data/metro2Violations.json` is shared between audit and letter-generation logic. 
- Express-based API server with scripts for audits, migrations, and background workers.
- PDF/letter generation workflows alongside report parsing utilities.
- Portal UI built with Next.js and TypeScript.
- Python regression tests covering audit rules and report parsing.

## Tech Stack
- **Languages:** JavaScript (Node.js), TypeScript (Next.js), Python.
- **Backend:** Express, Knex, BullMQ, Stripe, Twilio, Puppeteer.
- **Frontend:** Next.js, React, Tailwind CSS.
- **Database:** SQLite (default), PostgreSQL/MySQL via Knex.
- **Testing:** Node’s test runner, Jest/Supertest dependencies, Python unittest.
- **Package managers:** npm, pip (requirements.txt in CRM backend).

## Project Structure
```
.
├── apps/client-portal/         # Next.js portal UI
├── metro2/                     # Metro-2 Python rule data and parsers
├── metro2 (copy 1)/crm/         # Primary Node/Express CRM backend
│   ├── server.js               # API entry point
│   ├── migrations/             # Knex migrations
│   ├── scripts/                # CLI utilities + workers
│   ├── tests/                  # Node test suite
│   ├── requirements.txt        # Python deps for CRM backend utilities
│   └── .env.sample             # Environment variable template
├── packages/                   # Reusable Metro-2 libraries
└── python-tests/               # Python audit/regression tests
```

## Getting Started
### Prerequisites
- **Node.js + npm** (required for the CRM backend and client portal).
- **Python 3** (required for Python tests and audit utilities).
- **Database**: SQLite for local development, or PostgreSQL/MySQL for production.
- **Optional**: Redis for BullMQ-backed job processing.
- **Optional**: System dependencies for Puppeteer PDF rendering (see `install-chrome-deps.sh`).

### Installation
**Backend (CRM API)**
```bash
cd "metro2 (copy 1)/crm"
cp .env.sample .env
npm install
npm run migrate
npm start
```

**Client portal**
```bash
cd apps/client-portal
npm install
npm run dev
```

### Configuration
- Start from `metro2 (copy 1)/crm/.env.sample` and define any required secrets or API credentials.
- Database configuration is controlled by `DATABASE_CLIENT` and `DATABASE_URL`. If omitted, the backend uses SQLite in `metro2 (copy 1)/crm/data/dev.sqlite`.
- Multi-tenant behavior is controlled by `DB_TENANT_STRATEGY` and `DB_TENANT_SCHEMA_PREFIX` (see backend database configuration).

If you need additional environment variables beyond the sample file, search the backend for `process.env` usage to identify required values.

## Usage
### Run Locally
**Backend API**
```bash
cd "metro2 (copy 1)/crm"
npm start
```
- The server starts on `http://localhost:3000` by default (configurable with `PORT`).
- A default admin account is seeded for first-time access (`ducky` / `duck`).

**Client portal**
```bash
cd apps/client-portal
PORTAL_API_BASE_URL=http://localhost:3000 npm run dev
```
- Visit `http://localhost:3000/api/portal/{consumerId}` to verify API data.
- Visit `http://localhost:3001/portal/{consumerId}` for the portal UI (Next.js picks the next available port).

### Build / Packaging
**Client portal**
```bash
cd apps/client-portal
npm run build
npm run start
```

### Tests
**Backend tests**
```bash
cd "metro2 (copy 1)/crm"
npm test
```

**Python regression tests**
```bash
bash python-tests/run.sh
```

**Portal lint + type checks**
```bash
cd apps/client-portal
npm run lint
npm run typecheck
```

## Development Guide
### How to Edit / Customize
- **API behavior:** update `metro2 (copy 1)/crm/server.js` and supporting modules in that folder.
- **Metro-2 rules and metadata:** edit `metro2 (copy 1)/crm/data/metro2Violations.json` and the Python modules in `metro2/`.
- **Letter templates:** update `metro2 (copy 1)/crm/letterTemplates.js` or the PDF utilities in `metro2 (copy 1)/crm/pdfUtils.js`.
- **Portal UI:** modify pages and components inside `apps/client-portal/`.
- **Reusable data parsing:** update shared packages under `packages/`.

### Troubleshooting
1. **Server starts but database errors appear:** confirm `DATABASE_CLIENT` and `DATABASE_URL` are set correctly for PostgreSQL/MySQL.
2. **PDF generation fails with missing shared libraries:** run `npm run setup:chrome` to install Puppeteer system deps.
3. **Python tests fail to import modules:** ensure `python-tests/run.sh` is used so `PYTHONPATH` includes the CRM backend.
4. **Background jobs stall:** configure Redis (`REDIS_URL` or host/port) or accept the in-process scheduler fallback.
5. **Portal shows empty data:** verify `PORTAL_API_BASE_URL` points to the backend and `/api/portal/:id` returns data.
6. **Stripe/Twilio/Gmail errors:** ensure the relevant API keys are populated in `.env`.

## Roadmap
_Suggested improvements based on the current codebase:_
1. Add a top-level `README` section for the packages in `packages/` with versioning and release notes.
2. Introduce Docker Compose files for the backend, Redis, and Postgres to simplify local setup.
3. Provide a `.env.example` at the repo root that links the backend and portal configuration.
4. Add CI workflows to run `npm test` and Python regression tests on pull requests.
5. Expand portal documentation with a component inventory and design tokens.
6. Document a production deployment guide (PM2/systemd, or Render/Fargate).
7. Add lint/format scripts for the backend (ESLint/Prettier) for consistent style.
8. Expose a health check endpoint list in the docs for operational monitoring.

## Contributing
- Open issues with clear reproduction steps and expected behavior.
- Fork the repository, create a feature branch, and open a pull request describing the change.
- Keep changes scoped to the relevant app (`metro2 (copy 1)/crm`, `apps/client-portal`, or `packages/`).
- Run tests before submitting: backend `npm test`, portal `npm run lint` + `npm run typecheck`, and Python `bash python-tests/run.sh`.

## License
No license file detected.

## Acknowledgements / Credits
- Express, Knex, BullMQ, Stripe, Twilio, and Puppeteer for backend capabilities.
- Next.js, React, Tailwind CSS, and TypeScript for the client portal.
- Python unittest and BeautifulSoup for audit regression coverage.

## Donate / Support
If this project helps your team deliver more reliable dispute workflows, consider supporting ongoing maintenance, documentation, and QA coverage.

- GitHub Sponsors: <link>
- Buy Me a Coffee: <link>
- PayPal: <link>
- Crypto (optional): <address>

Thank you for supporting the project!
