# CRM Metro-2

Minimal CRM for generating Metro-2 dispute letters that feel premium, bilingual, and revenue-ready from day one.

## Goal & Why (business impact)
- Spin up an internal ops hub that keeps Metro-2 compliance tight while unlocking upsells like certified mail automation and bilingual client portals.
- Ship faster playbooks for onboarding advisors so you can convert more leads without waiting on engineering.
- Provide predictable audit + dispute generation so you can scale toward the 7–8 figure revenue target with confidence.

## Architecture (text diagram + decisions)
```

The CRM now targets PostgreSQL or MySQL for production data. Development falls back to a local SQLite file unless you provide `DATABASE_URL` + `DATABASE_CLIENT`.

On first run, the server seeds an admin user with username `ducky` and password `duck`.

Members created through `/api/register` now receive default permissions for consumers, contacts, tasks, and reports so freshly onboarded teammates can work leads without waiting on an admin to toggle access.

## Environment
- `PORT` (optional, defaults to 3000)
- `DATABASE_URL` (PostgreSQL/MySQL connection string; required in production)
- `DATABASE_CLIENT` (`pg`, `mysql2`, or `sqlite3` for local development)
- `DB_TENANT_STRATEGY` (`partitioned` for shared table with hash partitions, `schema` to isolate tenants in dedicated PostgreSQL schemas)
- `DB_PARTITIONS` (optional; number of hash partitions for shared tables, defaults to 8)
- `DB_TENANT_SCHEMA_PREFIX` (optional; prefix for dynamically created PostgreSQL schemas when using schema isolation)
- `METRO2_VIOLATIONS_PATH` (optional; path to `metro2Violations.json`. If unset, the app searches the repo.)
- `METRO2_KNOWLEDGE_GRAPH_PATH` (optional; path to `metro2_knowledge_graph.json`. Defaults to the shared data file.)
- `PORTAL_PAYMENT_BASE` (optional; fallback base URL for invoice pay links rendered in the client portal.)
- `STRIPE_SECRET_KEY` (optional; enables Stripe Checkout sessions for invoice payments.)
- `STRIPE_SUCCESS_URL` (optional; override the success redirect. Supports `{CHECKOUT_SESSION_ID}`, `{INVOICE_ID}`, `{CONSUMER_ID}` tokens.)
- `STRIPE_CANCEL_URL` (optional; override the cancel redirect with the same tokens.)
- `MARKETING_API_BASE_URL` (optional; workers can reuse this base URL when mirroring `/api/marketing` queues.)
- `MARKETING_API_KEY` (optional; shared secret for third-party marketing workers.)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` (required for the bundled SMS worker; set `TWILIO_FROM_NUMBER` if you prefer direct from numbers.)
- `CRM_URL`, `CRM_TOKEN` (optional; worker-auth fallback when you do not expose a marketing API key.)
- `MARKETING_TENANT_ID`, `MARKETING_POLL_INTERVAL_MS`, `MARKETING_TEST_FETCH_LIMIT`, `TWILIO_STATUS_CALLBACK_URL` (optional; tune the SMS worker runtime.)
- `SCM_API_KEY` (optional; SimpleCertifiedMail key for USPS certified mail automation.)
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` (optional; Gmail API OAuth credentials for transactional sends.)

Copy `.env.sample` to `.env` and adjust values as needed.

## Tenant quotas & throttling

- Every `/api` request is scoped to a tenant. The server resolves the tenant from the authenticated user or the `X-Tenant-Id` header (falling back to `default`).
- Baseline limits (per tenant):
  - `requests:minute` → 240 requests/minute (`TENANT_REQUESTS_PER_MINUTE`, `TENANT_REQUEST_WINDOW_MS`).
  - `letters:generate` → 60 jobs/hour (`TENANT_LETTER_JOBS_PER_HOUR`, `TENANT_LETTER_JOBS_WINDOW_MS`).
  - `letters:pdf` → 200 PDFs/hour (`TENANT_LETTER_PDFS_PER_HOUR`, `TENANT_LETTER_PDFS_WINDOW_MS`).
  - `letters:zip` → 40 archives/hour (`TENANT_LETTER_ZIPS_PER_HOUR`, `TENANT_LETTER_ZIPS_WINDOW_MS`).
  - `reports:audit` → 40 audits/hour (`TENANT_AUDITS_PER_HOUR`, `TENANT_AUDITS_WINDOW_MS`).
  - `breach:lookup` → 50 HIBP lookups/hour (`TENANT_BREACH_LOOKUPS_PER_HOUR`, `TENANT_BREACH_LOOKUPS_WINDOW_MS`).
- Provide a JSON blob via `TENANT_LIMITS` or `TENANT_LIMIT_OVERRIDES` to override specific tenants/operations, e.g. `{ "acme": { "requests:minute": { "limit": 600 } } }`.
- Setting a limit to `0` blocks the operation for that tenant; negative values disable the quota for that operation.

## Run
```bash
npm run migrate   # applies versioned schema migrations
npm start
```
- **Node 18 Express** API serves REST routes, portal assets, and marketing queues.
- **SQLite** keeps tenant data local; migrations handled during boot.
- **Python helpers** (in `python-tests` & CLI scripts) reuse the audit engine for HTML → JSON/PDF conversions.
- **Workers** (Twilio, marketing sync) reuse the same `.env` secrets for consistent rate limiting and branding.

## Table of contents
1. [Prerequisites](#prerequisites)
2. [Project scaffold](#project-scaffold)
3. [Environment variables](#environment-variables)
4. [Install & bootstrap](#install--bootstrap)
5. [Usage walkthrough](#usage-walkthrough)
6. [Testing & QA](#testing--qa)
7. [Debugging tips](#debugging-tips)
8. [Marketing + comms add-ons](#marketing--comms-add-ons)
9. [Deploy notes](#deploy-notes)
10. [GitHub auto-pull webhook](#github-auto-pull-webhook)

### Database & multi-tenant notes

- `npm run migrate` runs Knex migrations that create a tenant-aware key/value store with JSON storage, composite indexes, and hash partitions. PostgreSQL deployments can opt into per-tenant schemas by setting `DB_TENANT_STRATEGY=schema`.
- Every HTTP request runs inside a tenant context resolved from the authenticated user or `X-Tenant-Id` header. Shared-table mode keeps data isolated by `tenant_id`; schema mode provisions `tenant_{id}` schemas on demand and writes tenant data there.
- Use `DB_PARTITIONS` to tune hash partitions for high-cardinality datasets, and monitor the `tenant_registry` table to audit onboarded tenants.

### Database & multi-tenant notes

- `npm run migrate` runs Knex migrations that create a tenant-aware key/value store with JSON storage, composite indexes, and hash partitions. PostgreSQL deployments can opt into per-tenant schemas by setting `DB_TENANT_STRATEGY=schema`.
- Every HTTP request runs inside a tenant context resolved from the authenticated user or `X-Tenant-Id` header. Shared-table mode keeps data isolated by `tenant_id`; schema mode provisions `tenant_{id}` schemas on demand and writes tenant data there.
- Use `DB_PARTITIONS` to tune hash partitions for high-cardinality datasets, and monitor the `tenant_registry` table to audit onboarded tenants.

## Marketing SMS worker

Wire Twilio to the marketing test queue after setting the env vars above (or saving the Marketing API Key in **Settings → Integrations**):

```bash
cd "metro2 (copy 1)/crm"
npm run marketing:twilio-worker
```

Queue a bilingual smoke test (replace the phone number with your verified destination):

## Project scaffold
```
metro2 (copy 1)/crm/
├── public/                 # Portal + marketing assets (English/Spanish)
├── server/                 # Express routes, middleware, workers
├── shared/metro2-data/     # Violations + knowledge graph JSON
├── scripts/                # Node + Python helper scripts
├── tests/                  # Integration specs (Jest)
├── python-tests/           # pytest-style regression harness
├── creditAuditTool.js      # HTML → JSON converter
├── htmlToDisputePdf.js     # Letter generator
├── metro2_audit_multi.py   # Python CLI for remote audits
└── crm.sqlite              # Auto-created on first boot
```

## Environment variables
Copy `.env.sample` to `.env` and tweak for your tenant:

| Key | Purpose |
| --- | --- |
| `PORT` | Dev server port (default **3000**). |
| `METRO2_VIOLATIONS_PATH`, `METRO2_KNOWLEDGE_GRAPH_PATH` | Override shared JSON assets if you maintain forks per brand. |
| `PORTAL_PAYMENT_BASE` | Custom domain for hosted pay links. |
| `STRIPE_SECRET_KEY`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL` | Enables bilingual Stripe Checkout sessions and redirects. |
| `MARKETING_API_BASE_URL`, `MARKETING_API_KEY`, `CRM_URL`, `CRM_TOKEN` | Lets remote workers mirror `/api/marketing` queues with tenant auth. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_FROM_NUMBER`, `TWILIO_STATUS_CALLBACK_URL` | Required for SMS worker smoke tests. |
| `MARKETING_TENANT_ID`, `MARKETING_POLL_INTERVAL_MS`, `MARKETING_TEST_FETCH_LIMIT` | Rate tuning knobs for the marketing worker. |
| `SCM_API_KEY` | SimpleCertifiedMail integration for certified mail upsells. |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Google OAuth for transactional email syncs. |

### Tenant quotas & throttling
- Requests scoped per tenant (auth token or `X-Tenant-Id`, default `default`).
- Baseline limits (override via `TENANT_LIMITS` JSON):
  - `requests:minute` → 240/minute
  - `letters:generate` → 60/hour
  - `letters:pdf` → 200/hour
  - `letters:zip` → 40/hour
  - `reports:audit` → 40/hour
  - `breach:lookup` → 50/hour
- Set limit `0` to block. Negative disables the quota for that operation.

## Install & bootstrap
```bash
cd "metro2 (copy 1)/crm"
npm install
```

- First boot seeds an admin: **username** `ducky`, **password** `duck`.
- Data persists in `crm.sqlite`; delete the file to reset.
- Members created through `/api/register` inherit consumer/contact/task/report permissions immediately so new advisors can work leads.

### Start the stack
```bash
npm start
```
- Keeps Express + worker scheduler running with Metro-2 JSON hot reloads.
- Visit `http://localhost:3000` for the portal (English/Spanish toggle in footer).

## Usage walkthrough
1. **Authenticate**
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
     -H 'Content-Type: application/json' \
     -d '{"username":"ducky","password":"duck"}' | jq -r .token)
   ```
2. **Verify dashboard KPIs**
   ```bash
   curl -s http://localhost:3000/api/dashboard/summary \
     -H "Authorization: Bearer $TOKEN" | jq
   ```
   - Expect lead counts, invoice totals, bilingual CTA copy, and “next revenue move” guidance.
3. **Generate Metro-2 audits**
   ```bash
   node creditAuditTool.js path/to/report.html
   ```
   - Produces `report.json` that highlights Metro-2 violations with DOFD/date sanity checks.
4. **Create dispute PDFs**
   ```bash
   node htmlToDisputePdf.js path/to/report.html output/dir
   ```
   - Generates OCR-resistant PDF packets ready for certified mail.
5. **Stripe checkout smoke** (replace IDs with real ones)
   ```bash
   curl -X POST http://localhost:3000/api/invoices/INV123/checkout \
     -H 'Content-Type: application/json' \
     -d '{"consumerId":"CONSUMER123"}'
   ```
6. **Marketing SMS worker**
   ```bash
   npm run marketing:twilio-worker
   ```
   - Queue a bilingual preview:
     ```bash
     curl -X POST http://localhost:3000/api/marketing/tests \
       -H "Authorization: Bearer $TOKEN" \
       -H 'Content-Type: application/json' \
       -d '{"channel":"sms","recipient":"+15125550199","smsPreview":"Hola {{first_name}} — your dispute roadmap is ready / Tu plan de disputa está listo."}'
     ```

### Calendar & availability
- `/schedule` integrates with Google Calendar free/busy APIs.
- Steps:
  1. Create Google Cloud project, enable Calendar API.
  2. Generate OAuth token or service account.
  3. Grab calendar ID (Settings → Integrate calendar).
  4. Store in portal **Settings** → Google Calendar fields.
- Cache: `events` memoized 60s, `freebusy` 120s; updating credentials flushes caches automatically.

### Python Metro-2 audit CLI (remote workflows)
```bash
python3 metro2_audit_multi.py \
  --input https://secured-bucket/report.html \
  --input-header "Authorization=Bearer <token>" \
  --output report.json \
  --share-link-base "https://app.yourdomain.com/audit" \
  --share-link-field informe
```

- `--input` accepts either a local path or an HTTPS URL. Headers supplied via `--input-header NAME=VALUE` help with authenticated bureaus.
- `--share-link-base` + `--share-link-field` generate a URL-safe query string containing the JSON payload so sales can hand off the findings instantly. The CLI prints and stores the link in the output file.
- Outputs still land in `report.json`, ready for the Node renderer above.

Convert a raw credit report HTML directly into dispute-ready PDF letters:
```bash
cd "metro2 (copy 1)/crm"
node htmlToDisputePdf.js path/to/report.html output/dir
```


## Test

- **Node test runner:**
  ```bash
  npm test
  ```
  This executes the API integration suite in `tests/*.test.js`, covering auth, Metro-2 violation lookups, and dispute letter generation paths.
- **CLI audit regression:**
  ```bash
  npm run audit -- tests/fixtures/sample-report.html
  ```
  Useful for making sure the HTML → JSON pipeline still tags Metro-2 issues after editing the parsers or knowledge graph.

### Node tests
```bash
cd "metro2 (copy 1)/crm"
npm test
```

### Python tests
```bash
./python-tests/run.sh
```


## Marketing Integration

- Frontend queue + template UI: `public/marketing.html` + `public/marketing.js`.
- Backend endpoints live under `/api/marketing`; see [`docs/marketing-integration.md`](metro2%20(copy%201)/crm/docs/marketing-integration.md).
- Suggested smoke before going live:
  ```bash
  curl -X GET http://localhost:3000/api/marketing/tests \
    -H "Authorization: Bearer $TOKEN"
  ```
- KPIs to watch: SMS opt-in rate, appointment conversion, and invoice collection velocity from Stripe webhooks.

## Deploy notes
- Container-friendly: `npm start` inside your orchestrator.
- Mount a persistent volume for `crm.sqlite` + `/shared` JSON to keep tenant data and Metro-2 rules in sync.
- Configure environment variables via your platform (Render, AWS, etc.) and rotate secrets quarterly.
- Set up health checks against `/api/health` (responds once the DB + Stripe webhooks are ready).
## GitHub auto-pull webhook

Lock in zero-touch deployments so every push to GitHub refreshes your production workspace instantly. This webhook keeps the repo in sync and logs successful pulls for quick audits.

### Goal & Why
- Keep the credit-repair portal current without engineers SSH-ing in after every release.
- Reduce "stale build" risks that could impact dispute workflows or upsell funnels.

### Architecture
```
GitHub (push) → Webhook (Flask) → Bash pull script → Updated repo + log entry
```

### Scaffold / Files
```
scripts/webhook/
├── gitpull.sh       # Hard reset to origin/main + log
└── server.py        # Flask webhook listener with HMAC verification
```

### Code
- `scripts/webhook/gitpull.sh` keeps the repo aligned with `origin/main` and appends a timestamped success line to `/var/log/gitpull.log`.
- `scripts/webhook/server.py` exposes `/github-webhook`, verifies the `X-Hub-Signature-256` header (when `GITHUB_WEBHOOK_SECRET` is set), and executes the Bash script.

### How to Run
```bash
# 1) Copy scripts into /home/admin/webhook on the server
sudo install -d /home/admin/webhook
sudo cp scripts/webhook/gitpull.sh /home/admin/webhook/gitpull.sh
sudo cp scripts/webhook/server.py /home/admin/webhook/server.py
sudo chmod +x /home/admin/webhook/gitpull.sh

# 1b) Point the pull script at your deployed repo (adjust path as needed)
export CRM_REPO_DIR="/home/admin/crm"

# 2) Install Flask runtime (Ubuntu/Debian)
sudo apt update && sudo apt install -y python3-flask

# 3) Export secrets and launch the webhook listener
export GITHUB_WEBHOOK_SECRET="your_webhook_secret"
export GIT_PULL_SCRIPT="/home/admin/webhook/gitpull.sh"
export CRM_REPO_DIR="/home/admin/crm"
export WEBHOOK_PORT=5005
python3 /home/admin/webhook/server.py

# Optional: run under systemd (sample unit)
sudo tee /etc/systemd/system/github-webhook.service <<'EOF'
[Unit]
Description=GitHub Auto Pull Webhook
After=network.target

[Service]
Type=simple
User=admin
Environment="GITHUB_WEBHOOK_SECRET=your_webhook_secret"
Environment="GIT_PULL_SCRIPT=/home/admin/webhook/gitpull.sh"
Environment="CRM_REPO_DIR=/home/admin/crm"
Environment="WEBHOOK_PORT=5005"
ExecStart=/usr/bin/python3 /home/admin/webhook/server.py
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now github-webhook.service

# 4) Add GitHub webhook (repo → Settings → Webhooks)
#    Payload URL: http://your-server-ip:5005/github-webhook
#    Content type: application/json
#    Secret: your_webhook_secret
#    Events: Just the push event
```

### Metrics / AB ideas
- Track `gitpull.success` vs `gitpull.failure` counts (use the log as the source of truth) and alert if failures exceed 1/hour.
- Measure deploy latency: push timestamp vs log timestamp to ensure <60s updates.

### Next Revenue Wins
- Layer Stripe deploy-webhook notifications in Slack so growth + ops see when upsell flows ship.
- Add an audit dashboard that surfaces the last pull time beside CRM KPIs to reassure enterprise clients.
