# CRM Metro-2

Minimal CRM for generating Metro-2 dispute letters.

## Prerequisites
- Node.js 18+
- Python 3 (for postinstall)

## Setup
```bash
cd "metro2 (copy 1)/crm"
npm install
```

Data is stored in a local SQLite file `crm.sqlite` in the CRM directory, replacing the old JSON-based storage.

On first run, the server seeds an admin user with username `ducky` and password `duck`.

Members created through `/api/register` now receive default permissions for consumers, contacts, tasks, and reports so freshly onboarded teammates can work leads without waiting on an admin to toggle access.

## Environment
- `PORT` (optional, defaults to 3000)
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
npm start
```

Keep the terminal open while iterating—the API, portal, and workers all hot-reload their Metro-2 JSON lookups on every boot so you can edit the shared data files without restarting.

## Smoke test

1. Boot the API as above.
2. Log in with the seeded admin to capture a bearer token:
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
     -H 'Content-Type: application/json' \
     -d '{"username":"ducky","password":"duck"}' | jq -r .token)
   ```
3. Confirm the tenant wiring, permission defaults, and Stripe webhooks by hitting the dashboard snapshot:
   ```bash
   curl -s http://localhost:3000/api/dashboard/summary \
     -H "Authorization: Bearer $TOKEN" | jq
   ```
4. Expected result: a JSON payload with lead counts, invoice totals, bilingual CTA copy, and the next revenue move, proving the CRM can hydrate KPIs before you invite a teammate.

## Marketing SMS worker

Wire Twilio to the marketing test queue after setting the env vars above (or saving the Marketing API Key in **Settings → Integrations**):

```bash
cd "metro2 (copy 1)/crm"
npm run marketing:twilio-worker
```

Queue a bilingual smoke test (replace the phone number with your verified destination):

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"ducky","password":"duck"}' | jq -r .token)

curl -X POST http://localhost:3000/api/marketing/tests \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"channel":"sms","recipient":"+15125550199","smsPreview":"Hola {{first_name}} — your dispute roadmap is ready / Tu plan de disputa está listo."}'
```

The worker will mark the Twilio provider **ready**, log the SID, and update the queue with `Sent • Enviado` or `Failed • Falló` status for fast QA loops.

## Dashboard summary API

Fetch a consolidated dashboard snapshot (leads, revenue, reminders, and KPIs) with your admin token:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"ducky","password":"duck"}' | jq -r .token)

curl -s http://localhost:3000/api/dashboard/summary \
  -H "Authorization: Bearer $TOKEN" | jq
```

The payload reports conversion rates, outstanding invoices, monthly recurring progress toward the $84k/mo goal, top reminders, and the next bilingual revenue move for your team.

## Stripe invoice checkout

- Set `STRIPE_SECRET_KEY` (and optional redirect env vars) to let the CRM create Stripe Checkout sessions for invoices.
- When you add a new invoice without a manual pay link, the server now auto-generates a Stripe session and stores the checkout URL for the client portal.
- Clients clicking **Pay now / Pagar ahora** inside the portal will request a fresh Stripe Checkout session so expired links are never shown.
- Every invoice also exposes a hosted pay link at `/pay/{invoiceId}` on your CRM domain. Share that URL (English or Spanish copy) and we will spin up a new Stripe Checkout page on demand—mirroring the tradeline purchase flow.

Smoke-test a checkout session for a specific invoice (replace `INV123` and `CONSUMER123` with real IDs):

```bash
curl -X POST http://localhost:3000/api/invoices/INV123/checkout \
  -H 'Content-Type: application/json' \
  -d '{"consumerId":"CONSUMER123"}'
```

The response includes `url` (Stripe-hosted payment page) and `sessionId` you can use for post-payment reconciliation webhooks.

## Schedule

The `/schedule` page hooks into Google Calendar. Click any date to add a booking, meeting, phone call, or availability note. The page checks Google Calendar's free/busy API to prevent double‑booking.

### Google Calendar setup

1. Visit the [Google Cloud Console](https://console.cloud.google.com/) and create a project.
2. Enable the **Google Calendar API** for the project and generate an OAuth access token or service account.
3. In Google Calendar, open **Settings → Integrate calendar** to copy the calendar's **Calendar ID**.
4. Paste the token and Calendar ID into the Settings page under **Google Calendar Token** and **Google Calendar ID**, then save.

The API gateway now memoizes `/api/calendar/events` responses for 60 seconds and `/api/calendar/freebusy` windows for two minutes. This keeps the dashboard snappy even when Google throttles or the network blips. Updating the calendar token or ID automatically purges the cache so new credentials sync immediately.

Generate a shareable audit (converts a credit report HTML to JSON and renders it):
```bash
cd "metro2 (copy 1)/crm"
# From an HTML report
node creditAuditTool.js path/to/report.html
# Or from an existing JSON report
node creditAuditTool.js data/report.json
```

### Python Metro-2 audit CLI

Use the Python engine directly when you need remote pulls or one-click share links for advisors.

```bash
cd "metro2 (copy 1)/crm"
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
- Backend endpoints live under `/api/marketing`; see [`docs/marketing-integration.md`](metro2%20(copy%201)/crm/docs/marketing-integration.md) for wiring Twilio/SendGrid workers.
- Env hints: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME`.

Run the smoke curl to verify auth works before pointing workers at the queue.

````bash
cd "metro2 (copy 1)/crm"
TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"ducky","password":"duck"}' | jq -r .token)

curl -X GET http://localhost:3000/api/marketing/tests \
  -H "Authorization: Bearer $TOKEN"
````

## Deploy
Container-friendly; run `npm start` in production environment.
