# CRM Metro-2

Premium credit dispute CRM engineered for Metro-2 accuracy, bilingual client journeys, and revenue automation from day one.

## Use Case
- Launch a branded credit dispute hub that unifies Metro-2 validations, bilingual portals, and certified mail workflows for B2C and B2B clients (truckers, small businesses, attorneys).
- Replace spreadsheet-driven case management with permissioned workspaces, automated dispute generation, and Stripe-powered upsells.
- Give advisors NEPQ-style conversation flows, audit reports, and ready-to-send letters that preserve compliance guardrails.

## Value
- **Faster conversions:** Guided intake → Metro-2 audit → Stripe paywall in minutes so leads experience value before purchasing.
- **Premium trust:** Built-in bilingual portal, audit transparency, and documented FCRA/METRO-2 safeguards for peace of mind.
- **Scalable ops:** Multi-tenant database modes, throttled workers, and automation hooks (Twilio, SimpleCertifiedMail, Gmail) keep recurring revenue predictable as you grow toward 7–8 figures.

## Getting Started Demo
- **Video (7 min):** [docs/getting-started-demo.md](docs/getting-started-demo.md) outlines the storyline, voiceover script, and shot list for a high-conversion Loom/YouTube walkthrough. Record once, then embed the exported MP4/GIF in `docs/media/` and update this link with the hosted URL.
- **Demo storyline:** Prospect uploads a credit report, reviews Metro-2 violations, preview letters, then checks out via Stripe test mode. Emphasize value moments and KPIs (Lead → Consult%, Consult → Purchase%).

## How to Install
```bash
cp .env.sample .env
npm install
npm run migrate
npm start
```
- First boot seeds an admin account: **username** `ducky`, **password** `duck`.
- SQLite (`crm.sqlite`) is used locally. Set `DATABASE_URL` + `DATABASE_CLIENT` (`pg`, `mysql2`, `sqlite3`) for production.
- Keep `.env` secrets scoped per tenant; never commit real PII.

## Client Portal Frontend (Next.js)
1. `cd apps/client-portal`
2. `npm install`
3. `PORTAL_API_BASE_URL=http://localhost:3000 npm run dev`
- Visit `http://localhost:3000/api/portal/{consumerId}` to confirm data, then open `http://localhost:3001/portal/{consumerId}` to see the bilingual UI (Next.js will choose the next available port).
- `npm run lint` and `npm run typecheck` keep the portal production ready; track CTA clicks for conversion experiments.

## How to Scale
1. **Choose tenant strategy:**
   - `DB_TENANT_STRATEGY=partitioned` (default) – shared tables keyed by `tenant_id` with hash partitions tuned by `DB_PARTITIONS` (default 8).
   - `DB_TENANT_STRATEGY=schema` – PostgreSQL schema-per-tenant with prefix `DB_TENANT_SCHEMA_PREFIX` (default `tenant_`).
2. **Automate revenue ops:** enable `STRIPE_SECRET_KEY`, `SCM_API_KEY`, Twilio, and Gmail credentials to productize certified mail, SMS nudges, and onboarding drip sequences.
3. **Extend workers:** marketing/Twilio workers respect `TENANT_LIMITS` JSON to throttle bulk sends without cross-tenant bleed.
4. **Observe KPIs:** instrument events (`lead_created`, `audit_completed`, `checkout_succeeded`, `letter_downloaded`) into your analytics stack to monitor Lead→Consult% and AOV.

## Pricing & Plan Concepts (roadmap)
| Plan | Target | Pricing Concept | Included Value | Upsell Hooks |
| --- | --- | --- | --- | --- |
| **Launch** | DIY consumers | $97 setup + $49/mo | Metro-2 audit, 3 dispute letters/mo, bilingual portal | Upgrade to Certified Mail or advisor review |
| **Operator** | Trucking & small biz | $297 setup + $149/mo | Team seats, task automation, CRM webhook, Stripe billing | Add-on: automated certified mail batches |
| **Partner** | Law firms & agencies | Custom (rev-share) | Multi-tenant schemas, priority support, white-label portal | Enterprise support, analytics workspace |
| **Services Add-on** | Any tier | Usage-based | Done-for-you disputes, NEPQ coaching calls | Retainer increases, audit deep dives |

## Customer Proof & Use Cases
- **Maria (Consumer):** "The bilingual portal let me track every Metro-2 dispute without guessing what's next. I paid for certified mail because the timeline was crystal clear."
- **Interstate Logistics (Trucking firm):** "We onboarded 6 drivers in a weekend. The Metro-2 audit flagged repos with missing DOFD, and Stripe subscriptions made billing painless."
- **Lopez & Ortiz PLLC (Attorneys):** "Schema isolation keeps client data segregated, and the audit exports drop straight into our litigation workflows."

## Change Log & Roadmap
- **v1.5.0 (current):** Multi-tenant throttling, Stripe Checkout tokens, Twilio marketing worker, bilingual portal polish.
- **v1.6.0 (next 30 days):** Certified mail batch dashboard, dispute letter A/B library, analytics event stream.
- **v2.0 (roadmap):** OCR-resistant upload triage, Metro-2 AI rule suggestions, in-app NEPQ coaching prompts, Render/AWS blue-green deploy guides.

## Architecture Overview
```
Browser (Bilingual Portal + Admin)
    ↓ REST / Webhooks
Express API (server/) ──┬── Metro-2 audit engine (shared/metro2-data/)
                        ├── Stripe + Twilio + Gmail integrations
                        ├── Certified mail worker (SimpleCertifiedMail)
                        └── Queue throttler (tenant-aware)
Data Layer (Knex + SQLite/PostgreSQL/MySQL)
    └── Tenant isolation (shared partitions or per-schema)
Python Utilities (python-tests/, scripts/) → HTML → PDF letters, regression audits
```
- **Why:** Express keeps REST-first simplicity, Python scripts preserve existing Metro-2 validators, and Knex migrations handle tenant migrations without manual SQL.

## Deployment
1. Provision PostgreSQL (Render, Supabase, RDS) and set `DATABASE_URL`, `DATABASE_CLIENT=pg`.
2. Set production secrets (`STRIPE_*`, `SCM_API_KEY`, Twilio, Gmail) in your hosting dashboard.
3. `npm run migrate` on deploy to align schemas; ensure the process has permission to create schemas if using `schema` strategy.
4. Run `npm start` (or `node server/index.js`) behind a process manager (Render service, PM2, or systemd). Enforce HTTPS and WAF rules to guard intake forms.
5. Attach monitoring: health endpoint `/api/health`, logs filtered for PII (only last4 of SSN, redacted tokens).

## Scaling & Multi-Tenant Strategy
- **Tenant Resolution:** `X-Tenant-Id` header or authenticated user context chooses the tenant (defaults to `default`).
- **Quotas:** baseline per-tenant rate limits (requests/minute 240, letters/hour 60, PDF/hour 200, etc.). Override via `TENANT_LIMITS` or `TENANT_LIMIT_OVERRIDES` JSON blobs.
- **Schema Mode:** automatically provisions `tenant_{id}` schemas and applies migrations per schema; schedule nightly vacuum/analyze on PostgreSQL.
- **Partition Mode:** tune `DB_PARTITIONS` for write-heavy tenants; monitor `tenant_registry` to audit onboarding cadence.

## Environment Variables (essentials)
| Key | Purpose |
| --- | --- |
| `PORT` | Dev server port (default **3000**). |
| `DATABASE_URL`, `DATABASE_CLIENT` | Production database connection + driver (`pg`, `mysql2`, `sqlite3`). |
| `DB_TENANT_STRATEGY`, `DB_PARTITIONS`, `DB_TENANT_SCHEMA_PREFIX` | Multi-tenant tuning. |
| `METRO2_VIOLATIONS_PATH`, `METRO2_KNOWLEDGE_GRAPH_PATH` | Override Metro-2 JSON assets per brand. |
| `PORTAL_PAYMENT_BASE`, `STRIPE_SECRET_KEY`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL` | Stripe Checkout & portal pay links. |
| `MARKETING_API_BASE_URL`, `MARKETING_API_KEY`, `CRM_URL`, `CRM_TOKEN` | Marketing worker auth + mirroring. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_FROM_NUMBER`, `TWILIO_STATUS_CALLBACK_URL` | SMS worker configuration. |
| `MARKETING_TENANT_ID`, `MARKETING_POLL_INTERVAL_MS`, `MARKETING_TEST_FETCH_LIMIT` | Marketing worker tuning. |
| `SCM_API_KEY` | SimpleCertifiedMail integration for certified mail upsells. |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Gmail API OAuth for transactional sends. |

## Testing & QA
- **Integration (Jest):** `npm test`
- **Python regression:** `pytest python-tests`
- **Smoke (curl):**
  ```bash
  curl -X POST http://localhost:3000/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"ducky","password":"duck"}'
  ```
- **Portal payload:**
  ```bash
  curl http://localhost:3000/api/portal/{consumerId}
  ```
  - **Analytics idea:** capture `audit_completed` and `checkout_succeeded` events to monitor Lead→Consult% and Consult→Purchase%.

## Debugging Tips
- Delete `crm.sqlite` to reset local data quickly.
- Use `npm run marketing:twilio-worker` to replay Twilio queue events with verbose logging.
- Set `DEBUG=crm:*` for verbose Express + Knex logs (make sure tokens/PII stay redacted).

## Marketing & Conversion Ideas
- Launch a bilingual landing funnel (Hero → Trust badges → Outcomes → Social proof → Pricing) pointing to `/portal`.
- Offer a downloadable "Metro-2 Compliance Checklist" as a lead magnet synced to your marketing automation worker.
- Run A/B tests: (1) CTA copy "Start Your Audit" vs "See Your Metro-2 Score", (2) Pricing anchor with certified mail bonus, (3) Social proof placement vs NEPQ video testimonial.

## Deploy Notes
- Render deployment: add `render.yaml` (see `/scripts` for starter) with separate web service + background worker.
- AWS Fargate: containerize via `Dockerfile`, attach Secrets Manager for env vars, and enable load balancer stickiness per tenant.
- Backups: schedule nightly dumps of Postgres plus S3 upload of `shared/metro2-data` overrides.

## GitHub Auto-Pull Webhook
- Optional script under `scripts/` listens for GitHub webhook and pulls latest main branch for staging tenants. Protect production by requiring manual promotion.

---
Focus on compliance: no guaranteed deletions, respect Metro-2 rules (status vs. past-due amounts, DOFD for charge-offs/collections, consistent reporting dates), and redact SSN except last4 in logs.
