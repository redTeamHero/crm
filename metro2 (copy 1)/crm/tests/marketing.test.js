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
