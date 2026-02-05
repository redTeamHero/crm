# Metro2 CRM

## Overview
This repository contains a multi-tenant CRM backend for credit-report auditing and dispute-letter generation, a legacy HTML client portal served by the backend, and shared Metro 2 parsing/audit libraries. The backend parses Metro 2 HTML/PDF reports, maps violations using a knowledge graph, generates dispute letters as PDFs/HTML, and exposes APIs that power both the CRM UI and the static client portal experience at `/portal/:consumerId`.

## How It Works
1. **Backend boot and settings**: The Express server (`metro2 (copy 1)/crm/server.js`) loads tenant-scoped settings from the key-value store, applies integration keys into process environment variables, and initializes workflow automation. Settings are stored in the database via the tenant-aware kv store and are hydrated on startup.
2. **Report ingestion**: Report uploads go through `multer` and then dispatch to the Python analyzer (`metro2_audit_multi.py`) or the LLM-based parser. The Python analyzer parses HTML/PDF reports and returns normalized account history, inquiry details, and personal information.
3. **Parsing and violations**: The JS parser (`metro2 (copy 1)/crm/parser.js`) delegates to `packages/metro2-core`, which extracts tradelines, histories, inquiries, and personal info from Metro 2 report markup. Metro 2 violations are loaded from JSON rulebooks and validated using the knowledge-graph/ontology mapping logic in `packages/metro2-core`.
4. **Letter generation**: The letter engine renders dispute letters as HTML and converts them to PDF with Puppeteer; it can fall back to a PDFKit renderer when Chromium is unavailable.
5. **Client portal**: The Express backend renders the legacy HTML portal template, injecting portal data and settings so clients can view snapshots, timeline entries, invoices, and documents at `/portal/:consumerId`.

## Project Structure
- `metro2 (copy 1)/crm/` — Primary Node.js/Express CRM backend, API routes, static assets, and integrations.
  - `server.js` — Backend entry point and API router.
  - `db/` — Knex database connection and migrations.
  - `metro2_audit_multi.py` — Python CLI for parsing/auditing HTML/PDF Metro 2 reports.
  - `parser.js` — JS parser bridging to `metro2-core`.
  - `letterEngine.js`, `pdfUtils.js`, `htmlToDisputePdf.js` — Letter rendering/PDF conversion utilities.
  - `workflowEngine.js` — Workflow rules and automation.
  - `marketingRoutes.js`, `marketingStore.js` — Marketing automation endpoints.
- `packages/metro2-core/` — Metro 2 parsing, validation, and knowledge-graph-backed rule evaluation.
- `packages/metro2-cheerio/` — Cheerio adapter for Metro 2 parsing in Node.
- `packages/metro2-browser/` — Browser-compatible Metro 2 parser entry.
- `metro2/` — Python parser and audit utilities; includes a Node bridge for JS-based parsing.
- `shared/` — Shared knowledge graph + violations data and formatting helpers used by both backend and parsers.
- `python-tests/` — Python test suite targeting Metro 2 parsers and audit rules.

## Installation
> The repo is a multi-project layout. Install dependencies in the directories you plan to run.

### Backend (Express CRM)
```bash
cd "metro2 (copy 1)/crm"
npm install
```

If you plan to run the Python analyzers:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Configuration
### Backend environment variables
**Core server**
- `PORT` — HTTP port for the Express server (default: 3000).
- `NODE_ENV` — Controls production/test behaviors.
- `START_SERVER_IN_TEST` — Allows server startup during tests.
- `JWT_SECRET` — Signing secret for session tokens.

**Database & tenancy**
- `DATABASE_CLIENT` — Database client (`sqlite3`, `pg`, `mysql2`, etc.).
- `DATABASE_URL` — Connection URL (required for Postgres/MySQL; optional for SQLite).
- `DATABASE_POOL_MIN`, `DATABASE_POOL_MAX` — Knex pool sizing.
- `DB_TENANT_STRATEGY` — `partitioned`, `schema`, or `shared`.
- `DB_TENANT_SCHEMA_PREFIX` — Prefix when using schema-per-tenant.
- `DB_PARTITIONS` — Partition count used by migrations.

**Tenant quota controls**
- `TENANT_REQUESTS_PER_MINUTE`, `TENANT_REQUEST_WINDOW_MS`
- `TENANT_LETTER_JOBS_PER_HOUR`, `TENANT_LETTER_JOBS_WINDOW_MS`
- `TENANT_LETTER_PDFS_PER_HOUR`, `TENANT_LETTER_PDFS_WINDOW_MS`
- `TENANT_LETTER_ZIPS_PER_HOUR`, `TENANT_LETTER_ZIPS_WINDOW_MS`
- `TENANT_AUDITS_PER_HOUR`, `TENANT_AUDITS_WINDOW_MS`
- `TENANT_BREACH_LOOKUPS_PER_HOUR`, `TENANT_BREACH_LOOKUPS_WINDOW_MS`
- `TENANT_LIMITS` / `TENANT_LIMIT_OVERRIDES` — JSON map of per-tenant overrides.

**Queues / Redis (optional)**
- `REDIS_URL` / `REDIS_TLS_URL`
- `REDIS_HOST` / `REDIS_HOSTNAME`
- `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS`
- `JOB_WORKER_CONCURRENCY`

**External integrations**
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_API_KEY`, `STRIPE_PRIVATE_KEY`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`
- Email (SMTP): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Send Certified Mail: `SCM_API_KEY`
- Gmail OAuth: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`
- Marketing API: `MARKETING_API_BASE_URL`, `MARKETING_API_KEY`
- Client portal URLs: `CLIENT_PORTAL_BASE_URL`, `PORTAL_BASE_URL`, `PORTAL_PAYMENT_BASE`, `PUBLIC_BASE_URL`
- HIBP (breach lookups): `HIBP_API_KEY`

**OpenAI (optional report parsing/auditing)**
- `OPENAI_API_KEY`
- `OPENAI_API_URL`
- `OPENAI_MODEL`, `OPENAI_PARSE_MODEL`, `OPENAI_AUDIT_MODEL`
- `OPENAI_REPORT_CHUNK_CHARS`

**PDF rendering**
- `PUPPETEER_EXECUTABLE_PATH` — Custom Chromium path.
- `FORCE_PDF_FALLBACK` — Force PDFKit fallback renderer.

**Python runtime selection**
- `CRM_PYTHON_BIN`, `PYTHON_BIN`, `VIRTUAL_ENV`

**Background monitoring**
- `MAX_RSS_MB`, `RESOURCE_CHECK_MS`

### Backend settings stored in the database
The CRM stores a `settings` record in the tenant kv store. This includes:
- `hibpApiKey`
- `rssFeedUrl`
- `googleCalendarToken`, `googleCalendarId`
- `stripeApiKey`
- `marketingApiBaseUrl`, `marketingApiKey`
- `sendCertifiedMailApiKey`
- `gmailClientId`, `gmailClientSecret`, `gmailRefreshToken`
- `envOverrides`
- `clientPortal` theme/modules configuration
- `hotkeys`

Settings are normalized on read/write and can be used to override certain environment keys for integrations.

### Metro 2 data sources
- `METRO2_VIOLATIONS_PATH` — JSON rulebook path for violations.
- `METRO2_KNOWLEDGE_GRAPH_PATH` — Knowledge graph used by `metro2-core`.
- `METRO2_RULEBOOK_PATH` — Python audit rulebook path override.

### Marketing/Twilio worker environment variables
The `scripts/marketingTwilioWorker.js` worker supports:
- `.env` loading via `MARKETING_ENV_FILE` or `ENV_FILE`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_FROM_NUMBER`, `TWILIO_STATUS_CALLBACK_URL`
- Marketing API: `MARKETING_API_BASE_URL`, `MARKETING_API_KEY`, `MARKETING_TENANT_ID`
- CRM auth fallback: `CRM_URL`, `CRM_TOKEN`
- Worker tuning: `MARKETING_SMS_PROVIDER_ID`, `MARKETING_POLL_INTERVAL_MS`, `MARKETING_TEST_FETCH_LIMIT`

## Usage
### Start the CRM backend
```bash
cd "metro2 (copy 1)/crm"
npm run migrate
npm run dev
```

### Run the Metro 2 audit CLI
```bash
cd "metro2 (copy 1)/crm"
python metro2_audit_multi.py -i ./data/report.html -o ./data/report.json --json-only
```

### Generate a standalone audit PDF
```bash
cd "metro2 (copy 1)/crm"
node creditAuditTool.js ./data/report.html
```

### Run the marketing/Twilio worker
```bash
cd "metro2 (copy 1)/crm"
node scripts/marketingTwilioWorker.js
```

## Debugging & Development
- **Logs**: The Node server logs structured JSON to stdout/stderr. The Python audit CLI writes rotating logs to `/var/log/metro2_debug.log` and mirrors logs to stdout when `--debug` is set.
- **Enable debug**:
  - Set `KNEX_DEBUG=1` for SQL debug logging.
  - Pass `--debug` to `metro2_audit_multi.py` for verbose Python logs.
- **Common failure points**:
  - Missing `metro2Violations.json` or knowledge-graph data causes parser initialization errors.
  - Missing Python interpreter or dependencies will prevent report analysis.
  - Missing Chromium or sandbox dependencies causes PDF rendering to fall back (or fail if fallback is disabled).
  - LLM parsing/auditing requires `OPENAI_API_KEY`.
  - Redis is optional; without it, jobs run in-process and aren’t persisted across restarts.
- **Extending the system**:
  - Add new parsing rules in `packages/metro2-core` and update the shared knowledge graph.
  - Add workflow rules in `workflowEngine.js` and store configuration via the settings API.
  - Update portal modules or copy in `metro2 (copy 1)/crm/public/client-portal.js` and `metro2 (copy 1)/crm/public/client-portal-template.html`.

## Known Limitations
- The Metro 2 HTML parser expects specific report table structures; unsupported vendor layouts may return partial or empty results.
- The Python audit logger writes to `/var/log/metro2_debug.log`, which may require elevated filesystem permissions.
- PDF generation relies on Chromium; environments without compatible binaries may need `PUPPETEER_EXECUTABLE_PATH` or the fallback renderer.
- Redis-backed queues are optional; if Redis is not configured, job execution is in-process only.

## Assumptions
- The backend (`metro2 (copy 1)/crm`) is the primary runtime service and serves the legacy client portal routes alongside `/api/portal/:consumerId`.
- Developers run Node.js and Python in the same environment when using the Python analyzers or LLM PDF extraction.
