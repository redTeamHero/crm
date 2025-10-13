# Layered Architecture Playbook

## Goal & Why (business impact)
- Give every squad a shared mental model so we can ship faster without cross-team collisions.
- Support premium-grade reliability (Apple-level polish) while scaling to 7–8 figure revenue.
- Keep Metro-2, FCRA, and dispute workflows auditable so compliance reviews never block releases.

## Architecture
```
[ UI / Frontend (Next.js portal, public assets) ]
                  ↓ REST / Webhooks / Auth
[ API / Gateway / Edge — server.js, marketingRoutes.js ]
                  ↓ Service Orchestration
[ Application Services — reportPipeline.js, tradelineBuckets.js,
  marketingStore.js, playbook.js, state transitions ]
                  ↓ Domain Rules & Entities
[ Domain / Model Layer — negativeItems.js, letterEngine.js,
  tenantLimits.js, shared/metro2 schemas ]
                  ↓ Persistence & External Providers
[ Infrastructure / Integration — kvdb.js, pdfUtils.js,
  googleCalendar.js, simpleCertifiedMail.js, fetchUtil.js,
  python metro2 workers, sqlite ]
```

### Layer boundaries & contracts
| Layer | Responsibilities | Key Modules / Folders | Hand-offs |
| --- | --- | --- | --- |
| **API / Gateway / Edge** | Request routing, auth (JWT + client tokens), tenant resolution, validation, response shaping, rate limiting. | `server.js`, `marketingRoutes.js`, `public/api` handlers, `middleware` sections. | Accepts HTTP/WS requests, hands validated commands/events to Application layer. Returns DTOs only (no raw DB rows). |
| **Application Services** | Business workflows: onboarding consumers, running Metro-2 audits, generating invoices, orchestrating calendar + marketing jobs. Applies use-case rules and coordinates domain entities. | `reportPipeline.js`, `marketingStore.js`, `playbook.js`, `state.js` (workflow orchestration), service utilities in `packages/metro2-browser` when orchestrating browser automation. | Consumes domain models, calls infrastructure through explicit adapters. Emits events (`logInfo`, job queues) back to edge. |
| **Domain / Model** | Core concepts (Consumer, Tradeline, Dispute Letter, Tenant Quota) and business invariants (Metro-2 validations, quota math). Pure logic with no side effects. | `negativeItems.js`, `letterEngine.js`, `letterTemplates.js`, `tenantLimits.js`, `shared/data/**`, `shared/violations.js`, `packages/metro2-core/src/**`. | Exposed as pure functions/classes consumed by Application layer. Accepts POJOs/value objects; returns domain DTOs, errors. |
| **Infrastructure / Integration** | Persistence adapters (SQLite via `kvdb.js`), file storage, PDF rendering (Puppeteer), calendar, certified mail, marketing APIs, Python workers. Handles retries, circuit breakers, secrets. | `kvdb.js`, `pdfUtils.js`, `googleCalendar.js`, `simpleCertifiedMail.js`, `fetchUtil.js`, `scripts/`, `python-tests/`, `metro2_audit_multi.py`, `packages/metro2-cheerio/src/**`. | Provide async adapters returning promises/observables. Never expose Express `req/res`. |
| **UI / Frontend** | Client portals, admin console, marketing microsites. Should stay framework-agnostic via REST + event APIs. | `public/`, static dashboards, and documented flows in `docs/marketing-integration.md`. Future Next.js surfaces live under `/apps` when we split them out. | Talks only to API layer via HTTPS/WebSocket; no direct DB access. |

## Mapping existing flows
- **Client onboarding**: `/api/consumers` (API) → `state.js` orchestrates file + reminder updates (App) → `tenantLimits.js` (Domain) ensures quota → `kvdb.js` + `data/` writes (Infra) → UI surfaces status in `public/dashboard.html`.
- **Metro-2 audit**: `upload` endpoint (API) → `reportPipeline.ingest` (App) → `negativeItems` & `letterEngine` (Domain) → Python CLI via `metro2_audit_multi.py` + Puppeteer PDF (Infra) → results stored and rendered to UI.
- **Billing**: `/api/invoices` (API) → `marketingStore`/`playbook` orchestrate Stripe session (App) → Domain ensures amounts + language compliance → `simpleCertifiedMail`, Stripe SDK (Infra) → Portal pay link (UI).

## Working agreements
- API layer stays "dumb": transform `req` → command object → call service. Never reach into `kvdb` or letter templates directly.
- Application services import domain helpers but never mutate process.env. All external dependencies injected (pass adapters as params) to keep tests deterministic.
- Domain functions remain pure. If a rule needs to know "today", pass it in as an argument.
- Infrastructure modules own retries, logging, secrets, and normalization. When adding a provider, expose a `createXAdapter(config)` factory that returns safe methods.
- UI contracts live in `/docs/api` (coming soon). Until then, keep response shapes versioned under `shared/contracts`.

## Extension guide (checklist)
- [ ] Define the domain change (new entity, rule update) in `docs/` and update relevant schemas in `shared/`.
- [ ] Add/adjust domain logic (`shared/domain/**` or `negativeItems.js`). Keep functions pure.
- [ ] Create/extend an application service that coordinates the workflow. Inject adapters instead of importing infra modules directly.
- [ ] Expose an endpoint/controller in `server.js` (or a dedicated router) that binds request → service.
- [ ] Wire infrastructure adapters (DB tables, external API clients) in `kvdb.js` or a new adapter file.
- [ ] Update UI surfaces or docs to consume the new endpoint.
- [ ] Cover with integration test (`tests/*.test.js`) hitting the API boundary.

## Compliance guardrails baked into layers
- Domain layer owns Metro-2 sanity checks: DOFD required on charge-offs, status vs balance consistency, date ordering.
- Application services enforce bilingual copy + rate limiting before calling infrastructure.
- Edge layer redacts PII in logs (`logInfo` strips SSNs) and enforces tenant quotas before handing off.

## What "good" looks like
- ✅ Adding a new dispute automation touches Domain (rule), App Service (workflow), API route, optional UI update, and one integration test.
- ✅ Infrastructure adapters can be swapped (e.g., change PDF renderer) without touching Domain logic.
- 🚫 No direct `import { writeKey } from "./kvdb.js"` inside React components or domain files.

## Next steps
1. Carve out `/packages/application` and `/packages/domain` folders as we extract logic from `server.js`.
2. Introduce TypeScript DTOs in `shared/contracts` to lock response shapes.
3. Add architecture decision records (`docs/adr/`) for major integration choices (e.g., certified mail provider switch).
4. Stand up automated layer tests (lint rule + unit tests) to prevent cross-layer imports.
