# Marketing Integration Playbook

## Goal & Why (business impact)
- Centralize SMS/email payloads in the CRM so ops can audit every outreach before it fires.
- Give engineering a clean queue + provider registry so Twilio/SendGrid hooks are plug-and-play.
- Protect compliance (FCRA/FCC) by logging who queued what, capturing merge fields, and enforcing opt-out copy.

## Architecture (text diagram + decisions)
```
[CRM UI]
  └─ marketing.html / marketing.js
        │  submits Send Test / template CRUD
        ▼
[Express API]
  └─ /api/marketing (marketingRoutes.js)
        ├─ POST /tests      → enqueueTestSend()
        ├─ GET  /tests      → listTestQueue()
        ├─ PATCH/tests/:id  → updateTestQueueItem()
        ├─ POST /templates  → createTemplate()
        ├─ GET  /templates  → listTemplates()
        └─ PATCH/providers  → updateProvider()
                ▼
[marketingStore.js]
  └─ kvdb (SQLite-backed) key marketing_state_v1
        ├─ templates (defaults + user-created)
        ├─ testQueue (50-item FIFO for workers)
        └─ providers (Twilio, SendGrid, etc.)
                ▼
[scripts/marketingTwilioWorker.js]
  └─ Polls /tests, PATCHes status, and relays SMS via Twilio
```
**Decisions**
- Use kvdb/SQLite instead of ad-hoc localStorage so queue + templates survive restarts.
- REST-first endpoints with Bearer auth (same token as rest of CRM) so workers/bots can reuse credentials.
- Provider registry tracks env vars + docs to make onboarding Ops faster and enforce compliance guardrails.
- Surfacing Marketing, SimpleCertifiedMail, and Gmail API credentials inside **Settings → API Integrations** lets ops rotate keys without touching the filesystem.

## Scaffold / Files (tree)
```
public/
  marketing.html      # Adds integration checklist + queue/provider widgets
  marketing.js        # Calls /api/marketing, renders queue/providers, persists templates
marketingRoutes.js    # Express router guarding /api/marketing endpoints
marketingStore.js     # kvdb helpers: templates, test queue, providers, reset hook
server.js             # Mounts /api/marketing with authenticate + forbidMember middleware
tests/marketing.test.js  # API integration sanity for queueing & listing
```

## Code (complete, runnable)
### Express router (excerpt)
```js
// marketingRoutes.js
router.post("/tests", async (req, res) => {
  const { channel, recipient, notes = "", smsPreview = "", metadata = {} } = req.body || {};
  if (!new Set(["sms", "email"]).has(channel)) {
    return res.status(400).json({ ok: false, error: "Channel must be sms or email" });
  }
  if (!recipient?.trim()) {
    return res.status(400).json({ ok: false, error: "Recipient is required" });
  }
  const item = await enqueueTestSend({
    channel,
    recipient: recipient.trim(),
    notes,
    smsPreview,
    metadata,
    emailPreviewId: req.body.emailPreviewId || null,
    source: "marketing-ui",
    createdBy: req.user?.username || "system",
  });
  res.status(201).json({ ok: true, item });
});

router.patch("/tests/:id", async (req, res) => {
  try {
    const item = await updateTestQueueItem(req.params.id, req.body || {});
    res.json({ ok: true, item });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    res.status(status).json({ ok: false, error: error.message || "Failed to update test" });
  }
});
```
### Frontend queue call
```js
// marketing.js
const res = await api("/api/marketing/tests", {
  method: "POST",
  body: JSON.stringify({
    channel,
    recipient,
    notes,
    smsPreview,
    emailPreviewId: "template-draft",
    metadata: { campaignName, segment, mergeFields },
    source: "marketing-ui",
  }),
});
```
### Worker (Twilio handoff)
```bash
# hydrate environment (MARKETING_API_KEY, TWILIO_* vars, etc.)
cd "metro2 (copy 1)/crm"
npm run marketing:twilio-worker
```
The worker:
- Polls `/api/marketing/tests?limit=5` with either the Marketing API key (`X-Marketing-Key`) or a CRM bearer token.
- Immediately `PATCH /api/marketing/tests/:id` to mark the item `sending`, preventing double-delivery.
- Sends the SMS via Twilio Messaging Services (or a fallback `TWILIO_FROM_NUMBER`).
- `PATCH`es the queue item to `sent` or `failed`, storing the Twilio SID + error context.
- Flips the `sms_twilio` provider status to `ready`/`error` so the UI reflects live health.

## How to Run (commands)
```bash
# install deps
cd "metro2 (copy 1)/crm"
npm install

# start dev server
npm start

# run the Twilio worker (in a second terminal)
npm run marketing:twilio-worker

# queue a test via curl
TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"ducky","password":"duck"}' | jq -r .token)

curl -X POST http://localhost:3000/api/marketing/tests \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"channel":"sms","recipient":"+15125550199","smsPreview":"Hey {{first_name}}, your audit is ready."}'
```

## Metrics / AB Ideas
- Track SMS reply %, Email open→consult %, Average Consult Value — surface in dashboard once Twilio/SendGrid webhooks flow in.
- A/B ideas:
1. CTA copy “Book Strategy Call” vs “Start your audit” inside SMS templates.
  2. Email hero variant: testimonial card vs. dispute checklist bullet list.
  3. Queue confirmation UX: inline toast vs. Slack webhook for Ops.

## Next Revenue Wins
- Add /api/marketing/dispatch worker endpoint to mark sends as completed + push to billing for per-message charges.
- Gate advanced templates behind Stripe Checkout (Credits or Marketing Add-on) to lift AOV.
- Pipe queue events into NEPQ follow-up tasks so closers see SMS/Email touches inside the CRM timeline.

