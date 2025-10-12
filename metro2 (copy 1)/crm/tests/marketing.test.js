import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import { readKey, writeKey } from "../kvdb.js";
import { MARKETING_STATE_KEY } from "../marketingStore.js";

test("marketing API queues tests, templates, and providers", async () => {
  process.env.NODE_ENV = "test";
  const original = await readKey(MARKETING_STATE_KEY, null);
  await writeKey(MARKETING_STATE_KEY, null);

  try {
    const { default: app } = await import("../server.js");

    const login = await request(app).post("/api/login").send({ username: "ducky", password: "duck" });
    assert.equal(login.status, 200);
    const token = login.body.token;
    assert.ok(token);

    const queueRes = await request(app)
      .post("/api/marketing/tests")
      .set("Authorization", "Bearer " + token)
      .send({
        channel: "sms",
        recipient: "+15125550199",
        notes: "QA run",
        smsPreview: "Hola Alex, tu auditoría está lista.",
        metadata: { campaignName: "QA Drip", segment: "leads" },
      });
    assert.equal(queueRes.status, 201);
    assert.equal(queueRes.body.ok, true);
    assert.equal(queueRes.body.item.channel, "sms");
    assert.equal(queueRes.body.item.metadata.segment, "leads");

    const listRes = await request(app)
      .get("/api/marketing/tests?limit=1")
      .set("Authorization", "Bearer " + token);
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.items.length, 1);
    assert.equal(listRes.body.items[0].recipient, "+15125550199");

    const templateRes = await request(app)
      .post("/api/marketing/templates")
      .set("Authorization", "Bearer " + token)
      .send({
        title: "Follow-up Touch",
        description: "Bilingual consult reminder.",
        segment: "inactive",
      });
    assert.equal(templateRes.status, 201);
    assert.equal(templateRes.body.ok, true);
    assert.equal(templateRes.body.template.segment, "inactive");

    const templatesRes = await request(app)
      .get("/api/marketing/templates")
      .set("Authorization", "Bearer " + token);
    assert.equal(templatesRes.status, 200);
    assert.ok(templatesRes.body.templates.some((tpl) => tpl.title === "Follow-up Touch"));

    const smsTemplateRes = await request(app)
      .post("/api/marketing/sms-templates")
      .set("Authorization", "Bearer " + token)
      .send({
        title: "SMS Reminder",
        body: "Hola {{first_name}}, confirma tu próxima auditoría.",
        segment: "leads",
      });
    assert.equal(smsTemplateRes.status, 201);
    assert.equal(smsTemplateRes.body.template.segment, "leads");

    const smsTemplatesRes = await request(app)
      .get("/api/marketing/sms-templates")
      .set("Authorization", "Bearer " + token);
    assert.equal(smsTemplatesRes.status, 200);
    assert.ok(smsTemplatesRes.body.templates.some((tpl) => tpl.title === "SMS Reminder"));

    const sequenceRes = await request(app)
      .post("/api/marketing/email/sequences")
      .set("Authorization", "Bearer " + token)
      .send({
        title: "Reactivation Sequence",
        description: "Win-back emails with compliance tips.",
        segment: "inactive",
        frequency: "weekly",
        steps: [
          { subject: "Day 0 • Reactivate", delayDays: 0 },
          { subject: "Day 3 • Schedule consult", delayDays: 3 },
        ],
      });
    assert.equal(sequenceRes.status, 201);
    assert.equal(sequenceRes.body.sequence.frequency, "weekly");

    const sequencesRes = await request(app)
      .get("/api/marketing/email/sequences")
      .set("Authorization", "Bearer " + token);
    assert.equal(sequencesRes.status, 200);
    assert.ok(sequencesRes.body.sequences.some((seq) => seq.title === "Reactivation Sequence"));

    const dispatchRes = await request(app)
      .post("/api/marketing/email/dispatches")
      .set("Authorization", "Bearer " + token)
      .send({
        targetType: "sequence",
        targetId: sequenceRes.body.sequence.id,
        frequency: "weekly",
        segment: "inactive",
        scheduledFor: new Date().toISOString(),
        audienceCount: 250,
        notes: "Weekly win-back push",
      });
    assert.equal(dispatchRes.status, 201);
    assert.equal(dispatchRes.body.item.targetType, "sequence");
    assert.equal(dispatchRes.body.item.frequency, "weekly");

    const dispatchList = await request(app)
      .get("/api/marketing/email/dispatches?limit=1")
      .set("Authorization", "Bearer " + token);
    assert.equal(dispatchList.status, 200);
    assert.equal(dispatchList.body.items.length, 1);
    assert.equal(dispatchList.body.items[0].targetId, sequenceRes.body.sequence.id);

    const providerRes = await request(app)
      .patch("/api/marketing/providers/sms_twilio")
      .set("Authorization", "Bearer " + token)
      .send({ status: "ready", notes: "Connected in test" });
    assert.equal(providerRes.status, 200);
    assert.equal(providerRes.body.provider.status, "ready");
    assert.equal(providerRes.body.provider.notes, "Connected in test");
  } finally {
    if (original === null || typeof original === "undefined") {
      await writeKey(MARKETING_STATE_KEY, null);
    } else {
      await writeKey(MARKETING_STATE_KEY, original);
    }
  }
});
