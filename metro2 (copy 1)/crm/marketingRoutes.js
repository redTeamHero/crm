import express from "express";
import {
  enqueueTestSend,
  updateTestQueueItem,
  listTestQueue,
  listTemplates,
  createTemplate,
  updateTemplate,
  listSmsTemplates,
  createSmsTemplate,
  listEmailSequences,
  createEmailSequence,
  listEmailDispatches,
  scheduleEmailDispatch,
  listProviders,
  updateProvider,
} from "./marketingStore.js";

const router = express.Router();

function sanitizeString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function sanitizeHtml(value) {
  if (typeof value !== "string") return "";
  return value.slice(0, 20000);
}

function parseLimit(value, defaultValue = 10) {
  const num = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(num)) return defaultValue;
  return Math.max(1, Math.min(num, 50));
}

router.get("/templates", async (_req, res) => {
  const templates = await listTemplates();
  res.json({ ok: true, templates });
});

router.post("/templates", async (req, res) => {
  const { title, description = "", segment = "b2c", badge = "Custom", html = "" } = req.body || {};
  const safeTitle = sanitizeString(title);
  const safeDescription = sanitizeString(description);
  const safeSegment = sanitizeString(segment || "b2c").toLowerCase().slice(0, 24) || "b2c";
  const safeBadge = sanitizeString(badge || safeSegment.toUpperCase()).slice(0, 24);
  const safeHtml = sanitizeHtml(html);
  if (!safeTitle) {
    return res.status(400).json({ ok: false, error: "Template title is required" });
  }
  try {
    const template = await createTemplate({
      title: safeTitle.slice(0, 120),
      description: safeDescription.slice(0, 400),
      segment: safeSegment,
      badge: safeBadge || safeSegment.toUpperCase(),
      html: safeHtml,
      createdBy: req.user?.username || "system",
    });
    res.status(201).json({ ok: true, template });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Failed to save template" });
  }
});

router.patch("/templates/:id", async (req, res) => {
  const { id } = req.params;
  const { title, description, segment, badge, html } = req.body || {};
  const patch = {};
  if (title !== undefined) {
    const safeTitle = sanitizeString(title).slice(0, 120);
    if (!safeTitle) {
      return res.status(400).json({ ok: false, error: "Template title is required" });
    }
    patch.title = safeTitle;
  }
  if (description !== undefined) {
    patch.description = sanitizeString(description).slice(0, 400);
  }
  if (segment !== undefined) {
    patch.segment = sanitizeString(segment || "b2c").toLowerCase().slice(0, 24) || "b2c";
  }
  if (badge !== undefined) {
    const safeBadge = sanitizeString(badge).slice(0, 24);
    patch.badge = safeBadge || (patch.segment ? patch.segment.toUpperCase() : undefined);
  }
  if (html !== undefined) {
    patch.html = sanitizeHtml(html);
  }

  try {
    const template = await updateTemplate(id, patch);
    res.json({ ok: true, template });
  } catch (error) {
    if (error.message === "Template not found") {
      return res.status(404).json({ ok: false, error: "Template not found" });
    }
    res.status(500).json({ ok: false, error: error.message || "Failed to update template" });
  }
});

router.get("/sms-templates", async (_req, res) => {
  const templates = await listSmsTemplates();
  res.json({ ok: true, templates });
});

router.post("/sms-templates", async (req, res) => {
  const { title, body = "", segment = "b2c", badge = "SMS" } = req.body || {};
  const safeTitle = sanitizeString(title);
  const safeBody = sanitizeString(body);
  const safeSegment = sanitizeString(segment || "b2c").toLowerCase().slice(0, 24) || "b2c";
  const safeBadge = sanitizeString(badge || "SMS").slice(0, 24) || "SMS";

  if (!safeTitle) {
    return res.status(400).json({ ok: false, error: "Template title is required" });
  }
  if (!safeBody) {
    return res.status(400).json({ ok: false, error: "Template body is required" });
  }

  try {
    const template = await createSmsTemplate({
      title: safeTitle.slice(0, 120),
      body: safeBody.slice(0, 600),
      segment: safeSegment,
      badge: safeBadge,
      createdBy: req.user?.username || "system",
    });
    res.status(201).json({ ok: true, template });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Failed to save SMS template" });
  }
});

router.get("/email/sequences", async (_req, res) => {
  const sequences = await listEmailSequences();
  res.json({ ok: true, sequences });
});

router.post("/email/sequences", async (req, res) => {
  const { title, description = "", segment = "b2c", frequency = "daily", steps = [] } = req.body || {};
  const safeTitle = sanitizeString(title);
  const safeDescription = sanitizeString(description);
  const safeSegment = sanitizeString(segment || "b2c").toLowerCase().slice(0, 24) || "b2c";
  const safeFrequency = sanitizeString(frequency || "daily").toLowerCase().slice(0, 24);
  const rawSteps = Array.isArray(steps) ? steps : [];
  const sanitizedSteps = rawSteps.slice(0, 20).map((step) => ({
    subject: sanitizeString(step?.subject ?? ""),
    delayDays: Number(step?.delayDays),
    templateId: step?.templateId ? sanitizeString(step.templateId).slice(0, 120) : undefined,
  }));

  if (!safeTitle) {
    return res.status(400).json({ ok: false, error: "Sequence title is required" });
  }

  try {
    const sequence = await createEmailSequence({
      title: safeTitle.slice(0, 120),
      description: safeDescription.slice(0, 400),
      segment: safeSegment,
      frequency: safeFrequency,
      steps: sanitizedSteps,
      createdBy: req.user?.username || "system",
    });
    res.status(201).json({ ok: true, sequence });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Failed to save email sequence" });
  }
});

router.get("/tests", async (req, res) => {
  const limit = parseLimit(req.query.limit, 10);
  const items = await listTestQueue(limit);
  res.json({ ok: true, items });
});

router.post("/tests", async (req, res) => {
  const {
    channel,
    recipient,
    notes = "",
    smsPreview = "",
    emailPreviewId = null,
    metadata = {},
    source = "marketing-ui",
  } = req.body || {};

  const allowedChannels = new Set(["sms", "email"]);
  if (!allowedChannels.has(channel)) {
    return res.status(400).json({ ok: false, error: "Channel must be sms or email" });
  }
  const safeRecipient = sanitizeString(recipient);
  if (!safeRecipient) {
    return res.status(400).json({ ok: false, error: "Recipient is required" });
  }

  try {
    const item = await enqueueTestSend({
      channel,
      recipient: safeRecipient,
      notes: sanitizeString(notes).slice(0, 500),
      smsPreview: String(smsPreview || "").slice(0, 600),
      emailPreviewId: emailPreviewId ? String(emailPreviewId) : null,
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      source,
      createdBy: req.user?.username || "system",
    });
    res.status(201).json({ ok: true, item });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Failed to queue test send" });
  }
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

router.get("/email/dispatches", async (req, res) => {
  const limit = parseLimit(req.query.limit, 10);
  const items = await listEmailDispatches(limit);
  res.json({ ok: true, items });
});

router.post("/email/dispatches", async (req, res) => {
  const {
    targetType = "template",
    targetId,
    frequency = "immediate",
    segment = "b2c",
    scheduledFor,
    audienceCount,
    notes = "",
  } = req.body || {};

  const safeTargetType = sanitizeString(targetType).toLowerCase();
  const safeTargetId = sanitizeString(targetId);
  const safeFrequency = sanitizeString(frequency || "immediate").toLowerCase().slice(0, 24);
  const safeSegment = sanitizeString(segment || "b2c").toLowerCase().slice(0, 24) || "b2c";
  const safeScheduledFor = scheduledFor && !Number.isNaN(Date.parse(scheduledFor)) ? scheduledFor : undefined;
  const safeAudienceCount = Number.isFinite(Number(audienceCount)) ? Number(audienceCount) : undefined;

  if (!safeTargetId) {
    return res.status(400).json({ ok: false, error: "targetId is required" });
  }

  try {
    const item = await scheduleEmailDispatch({
      targetType: safeTargetType === "sequence" ? "sequence" : "template",
      targetId: safeTargetId,
      frequency: safeFrequency,
      segment: safeSegment,
      scheduledFor: safeScheduledFor,
      audienceCount: safeAudienceCount,
      notes: sanitizeString(notes).slice(0, 500),
      createdBy: req.user?.username || "system",
    });
    res.status(201).json({ ok: true, item });
  } catch (error) {
    const status = /not found|required/i.test(error.message) ? 400 : 500;
    res.status(status).json({ ok: false, error: error.message || "Failed to schedule email" });
  }
});

router.get("/providers", async (_req, res) => {
  const providers = await listProviders();
  res.json({ ok: true, providers });
});

router.patch("/providers/:id", async (req, res) => {
  try {
    const provider = await updateProvider(req.params.id, req.body || {});
    res.json({ ok: true, provider });
  } catch (error) {
    const status = error.message === "Provider not found" ? 404 : 400;
    res.status(status).json({ ok: false, error: error.message || "Failed to update provider" });
  }
});

export default router;

