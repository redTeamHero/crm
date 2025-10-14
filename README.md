# CRM Metro-2

Minimal CRM for generating Metro-2 dispute letters that feel premium, bilingual, and revenue-ready from day one.

## Goal & Why (business impact)
- Spin up an internal ops hub that keeps Metro-2 compliance tight while unlocking upsells like certified mail automation and bilingual client portals.
- Ship faster playbooks for onboarding advisors so you can convert more leads without waiting on engineering.
- Provide predictable audit + dispute generation so you can scale toward the 7–8 figure revenue target with confidence.

## Architecture (text diagram + decisions)
```
[Next.js-style portal (public/)] ──> [Express API (server/)] ──> [SQLite (crm.sqlite)]
                                   │
                                   ├─> [Stripe Checkout] for bilingual pay links
                                   ├─> [Twilio SMS worker] via npm scripts
                                   └─> [Python Metro-2 audit CLI] for remote pulls
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

## Prerequisites
- Node.js **18+** (ships with native fetch & Intl for bilingual copy)
- npm **9+** (bundled with Node 18)
- Python **3.10+** (for audit CLI + optional regression runner)
- SQLite **3.35+** (bundled on macOS/Linux; Windows users can install via [sqlite.org](https://sqlite.org/download.html))
- `jq` CLI (optional but handy for curl smoke tests)

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
- `--input` accepts local paths or HTTPS URLs (repeat `--input-header` for auth headers).
- `--share-link-*` options emit a ready-to-share bilingual summary link for sales follow-up.

## Testing & QA
- **Node integration suite**
  ```bash
  npm test
  ```
  - Validates auth, Metro-2 violation lookups, dispute generation, and tenant throttles.
- **CLI audit regression**
  ```bash
  npm run audit -- tests/fixtures/sample-report.html
  ```
  - Protects the HTML → JSON pipeline after knowledge graph edits.
- **Python regression pack**
  ```bash
  ./python-tests/run.sh
  ```
  - Exercises Metro-2 edge cases and bilingual copy fallbacks.
- **Manual smoke loop**
  - Login, hit `/api/dashboard/summary`, trigger a Stripe checkout, queue an SMS, and generate a PDF in under 5 minutes to ensure the ops flow still converts.

## Debugging tips
- **Port already in use?** `lsof -i :3000` → kill rogue Node processes before restarting.
- **SQLite locked errors?** Stop other Node instances, then remove stale journal files (`rm -f crm.sqlite-journal`).
- **Metro-2 JSON edits not reflecting?** Restart the relevant worker or touch the JSON file—Express watchers hot-reload on boot but not mid-request.
- **Stripe 401 or missing Checkout URL?** Confirm `STRIPE_SECRET_KEY` exists and the invoice has a balance; re-run the curl checkout command to regenerate sessions.
- **Twilio SMS stuck in queued?** Verify the worker log output for status callbacks and ensure `TWILIO_STATUS_CALLBACK_URL` points to a reachable HTTPS endpoint.
- **Calendar sync failures?** Refresh OAuth tokens and confirm the calendar is shared with the service account; the server logs will show `googleCalendar` warnings with the underlying error code.
- **Python CLI SSL errors?** Add `pip install -r python-tests/requirements.txt` to ensure `requests` and TLS extras are present.

## Marketing + comms add-ons
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
