# Metro2 CRM

## Metro-2 Violation Cheat Sheet

Use `metro2Violations.json` as a quick reference for common Metro-2 and FCRA conflicts. The file drives both the audit engine that flags report issues and the letter generator that cites the correct statutes.

**Note:** `metro2Violations.json` in this directory is the canonical source for violation metadata. Both the Python audit engine and the Node letter engine load from this shared file—avoid copying it elsewhere to prevent divergence.

The knowledge graph that powers per-bureau sanity checks now lives in `shared/data/metro2_knowledge_graph.json`. The Python analyzer and the lightweight Node validators hydrate an ontology from this file at runtime, so define new relationships there to keep every engine in sync.

### Sample entry

```json
{
  "code": "STATUS_PAST_DUE",
  "title": "Past-due balance reported as current",
  "detail": "Account shows 'Pays as agreed' but Past Due > $0",
  "severity": "high",
  "fcra": "15 U.S.C. §1681s-2(a)(1)(A)"
}
```

### Usage example

```js
import { loadMetro2Violations } from './utils.js';

const violations = await loadMetro2Violations();
console.log(violations.MISSING_DOFD.severity); // 5
```

### Extending the dataset

1. Append new objects to `metro2Violations.json` with `code`, `title`, `detail`, `severity`, and `fcra` fields.
2. Keep descriptions factual and align each rule with FCRA accuracy requirements—avoid implying guaranteed deletions or timeframes.
3. Run `npm test` to validate changes and maintain compliance.

## Architecture overview

For a guided, revenue-focused breakdown of how the CRM splits into API, application services, domain logic, integrations, and UI, read [`docs/layered_architecture.md`](docs/layered_architecture.md). Use that playbook when adding features so we keep Metro-2 rules pure, infrastructure swappable, and the client experience premium.

## Chromium dependencies

Puppeteer needs system libraries (`libnss3`, `libnspr4`) to render PDFs. On Debian/Ubuntu run:

```bash
npm run setup:chrome
```

Without them, letter generation will fail with errors like `libnspr4.so: cannot open shared object file`.

## Quick Start

1. **Run audit** – parse `data/report.json` and create a shareable report.

   ```bash
   npm run audit
   ```

2. **View high-severity violations** – open the generated PDF under `public/reports/` and focus on entries tagged `"severity": "high"`.

3. **Generate letters referencing FCRA sections** – start the server and use the dashboard's **Generate Letters** action.

   ```bash
   npm start
   ```

   The server seeds a default admin account (`ducky` / `duck`) for first-time access.

4. **Full pipeline demo** – create tradeline cards and a sample dispute letter from the bundled sample report.

   ```bash
   node reportPipeline.js
   ```

   Outputs:
   - `data/tradelineCards.json` – normalized accounts with issues for the client portal
   - `letter.html` – demo letter for the first tradeline and violation

## Background jobs & idempotency

- Heavy tasks such as dispute batch generation, batch PDF rendering, and report audits now run through BullMQ queues. When Redis
  connection details (`REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`) are not provided the app falls back to the in-process scheduler
  used in tests and local demos.
- Every asynchronous endpoint expects an `x-idempotency-key` header. Use a unique value per request (for example, `letters-<uuid>`)
  so retries return the same job record instead of duplicating work against tenant quotas.
- Track progress by polling `/api/jobs/:id`. A completed job response includes `result` metadata plus, where applicable, a
  downloadable artifact (`/api/jobs/:id/artifact` for batch PDFs).
- Existing synchronous endpoints continue to work; front-end flows now poll the job status endpoint before fetching final assets
  to keep UX responsive while heavy jobs finish off the request thread.

## Metrics & Experiments

- `npm run migrate` now also provisions analytics tables: `tenant_migration_events`, `checkout_conversion_events`, and `ab_test_assignments`. Query them to monitor onboarding health and invoice conversion, for example:

  ```sql
  select tenant_id,
         sum(case when success then 1 else 0 end) as successful_runs,
         sum(case when success then 0 else 1 end) as failed_runs,
         avg(duration_ms) as avg_duration_ms
  from tenant_migration_events
  group by tenant_id
  order by avg_duration_ms desc;
  ```

- Set `PORTAL_DATA_REGION_WEIGHT` (and optional `PORTAL_DATA_REGION_CONTROL_WEIGHT`) to bias the bilingual “Dedicated secured data region” banner experiment. Portal clicks are recorded via `ab_test_assignments.converted_at` for revenue-focused reporting.
- Analyze invoice funnel drop-off with a simple checkout stage report:

  ```sql
  select stage,
         count(*) as events,
         sum(case when success then 1 else 0 end) as successes,
         sum(case when success then 0 else 1 end) as failures
    from checkout_conversion_events
   where tenant_id = 'your-tenant'
group by stage
order by stage;
  ```

- Monitor A/B engagement lift for the portal banner:

  ```sql
  select variant,
         count(*) as assignments,
         sum(case when converted then 1 else 0 end) as conversions,
         round(avg(case when converted then 1.0 else 0.0 end), 4) as conversion_rate
    from ab_test_assignments
   where tenant_id = 'your-tenant'
group by variant
order by conversion_rate desc;
  ```

## Tradeline storefront flow

- Navigate to `/tradelines` to walk prospects through a conversion-ready funnel:
  1. Select a price bucket (`0–150`, `151–300`, `301–500`, `501+`).
  2. Choose a bank with live inventory counts.
  3. Review curated cards with price, limit, reporting cadence, and a Stripe Checkout CTA.
- All copy now renders in English so every advisor shares the same messaging.
- API endpoints:
  - `GET /api/tradelines` → returns price bucket summary for hero metrics.
  - `GET /api/tradelines?range=151-300&bank=Alpha%20Bank` → filtered inventory, pagination metadata, and bank counts for CRM automations.
- Track funnel KPIs with the embedded note (`range_selected`, `bank_selected`, `tradeline_checkout`) or wire into your analytics stack.

## Tests

Install dependencies and run the test suite:

```bash
npm install
npm test
```

### Unauthorized access check

The test suite includes assertions that a non-admin token receives `403 Forbidden` when accessing admin-only routes like `/api/users` and `/api/team-members`.


## Workflow engine

Keep disputes compliant without hard-coded logic. The workflow engine persists its configuration in SQLite and enforces rules whenever you generate letters or record dispute lifecycle events.

- **Cadence guardrail** — default `letters.generate` rules block new disputes for the same bureau within 35 days.
- **Validation freshness** — warns advisors if the latest `validation_completed` event is older than seven days.
- **Automatic follow-up** — when a `dispute_resolved` event lands, the engine schedules a bilingual reminder and logs a notification so you can upsell progress reviews without promising deletions or timelines.

Manage the configuration through the new API endpoints (requires a bearer token with `consumers` permission):

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"ducky","password":"duck"}' | jq -r .token)

# Review the current workflow rules
curl -s http://localhost:3000/api/workflows/config \
  -H "Authorization: Bearer $TOKEN" | jq

# Loosen the cadence rule to 30 days and apply immediately
curl -X PUT http://localhost:3000/api/workflows/config \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"operations":{"letters.generate":{"rules":[{"id":"letters-min-interval","type":"minInterval","intervalDays":30}]}}}'

# Dry-run a custom context to verify a workflow will pass before generating letters
curl -X POST http://localhost:3000/api/workflows/validate \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"operation":"letters.generate","context":{"consumerId":"CONSUMER123","bureaus":["TransUnion"]}}'
```

Settings updates return both the stored configuration and a summarized snapshot so front-end dashboards can highlight active rules and automation triggers.


