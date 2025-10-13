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
        ├─ POST /templates  → createTemplate()
        ├─ GET  /templates  → listTemplates()
        └─ PATCH/providers  → updateProvider()
                ▼
[marketingStore.js]
  └─ kvdb (SQLite-backed) key marketing_state_v1
        ├─ templates (defaults + user-created)
        ├─ testQueue (50-item FIFO for workers)
        └─ providers (Twilio, SendGrid, etc.)
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
### Worker stub (drop-in)
```js
// pseudo-code for a worker consuming marketing queue
import fetch from "node-fetch";
import twilio from "twilio";

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function pollQueue() {
  const res = await fetch(`${process.env.CRM_URL}/api/marketing/tests?limit=1`, {
    headers: { Authorization: `Bearer ${process.env.CRM_TOKEN}` },
  });
  const { items } = await res.json();
  if (!items?.length) return;
  const [item] = items;
  if (item.channel === "sms") {
    await twilioClient.messages.create({
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
      to: item.recipient,
      body: item.smsPreview,
    });
  }
  // TODO: POST back status via PATCH /api/marketing/providers/:id or future /tests/:id
}
setInterval(pollQueue, 15_000);
```

## How to Run (commands)
```bash
# install deps
cd "metro2 (copy 1)/crm"
npm install

# start dev server
npm start

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

