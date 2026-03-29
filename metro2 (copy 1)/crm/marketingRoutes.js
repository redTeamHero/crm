import express from "express";
import {
  enqueueTestSend,
  updateTestQueueItem,
  listTestQueue,
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listSmsTemplates,
  createSmsTemplate,
  listEmailSequences,
  createEmailSequence,
  updateEmailSequence,
  deleteEmailSequence,
  listEmailDispatches,
  scheduleEmailDispatch,
  listProviders,
  updateProvider,
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  listGroupMembers,
  addGroupMember,
  removeGroupMember,
  listEmailHistory,
  addEmailHistory,
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

const ALLOWED_CAMPAIGN_STATUSES = new Set(["draft", "scheduled", "running", "paused", "completed"]);

function sanitizeCampaignStatus(value, fallback = "draft") {
  if (typeof value !== "string") return fallback;
  const status = value.trim().toLowerCase();
  if (!status) return fallback;
  return ALLOWED_CAMPAIGN_STATUSES.has(status) ? status : fallback;
}

function sanitizeSegmentValue(value, fallback = "b2c") {
  const safe = sanitizeString(value || "").toLowerCase().slice(0, 24);
  return safe || fallback;
}

function parseCampaignProgress(value, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error("Progress must be a number");
  }
  return Math.max(0, Math.min(Math.round(num), 100));
}

function parseCampaignDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }
  return date.toISOString();
}

router.get("/campaigns", async (_req, res) => {
  const campaigns = await listCampaigns();
  res.json({ ok: true, campaigns });
});

router.post("/campaigns", async (req, res) => {
  const {
    name,
    status = "draft",
    segment = "b2c",
    nextTouchAt = null,
    kpiTarget = "",
    summary = "",
    progress = 0,
    subject = "",
    body = "",
    groupId = "",
    scheduledAt = null,
  } = req.body || {};

  const safeName = sanitizeString(name).slice(0, 160);
  if (!safeName) {
    return res.status(400).json({ ok: false, error: "Campaign name is required" });
  }

  let safeProgress;
  let safeNextTouch = null;
  let safeScheduledAt = null;
  try {
    safeProgress = parseCampaignProgress(progress, 0);
    safeNextTouch = nextTouchAt ? parseCampaignDate(nextTouchAt) : null;
    safeScheduledAt = scheduledAt ? new Date(scheduledAt).toISOString() : null;
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || "Invalid campaign data" });
  }

  try {
    const campaign = await createCampaign({
      name: safeName,
      status: sanitizeCampaignStatus(status),
      segment: sanitizeSegmentValue(segment),
      nextTouchAt: safeNextTouch,
      kpiTarget: sanitizeString(kpiTarget).slice(0, 160),
      summary: sanitizeString(summary).slice(0, 400),
      progress: safeProgress,
      subject: sanitizeString(subject).slice(0, 200),
      body: sanitizeString(body).slice(0, 20000),
      groupId: sanitizeString(groupId).slice(0, 80) || undefined,
      scheduledAt: safeScheduledAt,
      createdBy: req.user?.username || "system",
    });
    res.status(201).json({ ok: true, campaign });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Failed to create campaign" });
  }
});

router.patch("/campaigns/:id", async (req, res) => {
  const { id } = req.params;
  const { name, status, segment, nextTouchAt, kpiTarget, summary, progress, subject, body, groupId, scheduledAt } = req.body || {};

  const patch = {};

  if (name !== undefined) {
    const safeName = sanitizeString(name).slice(0, 160);
    if (!safeName) {
      return res.status(400).json({ ok: false, error: "Campaign name is required" });
    }
    patch.name = safeName;
  }

  if (status !== undefined) {
    const trimmed = sanitizeString(status);
    if (!trimmed) {
      return res.status(400).json({ ok: false, error: "Campaign status is required" });
    }
    const safeStatus = sanitizeCampaignStatus(trimmed, null);
    if (!safeStatus) {
      return res.status(400).json({ ok: false, error: "Invalid campaign status" });
    }
    patch.status = safeStatus;
  }

  if (segment !== undefined) {
    patch.segment = sanitizeSegmentValue(segment);
  }

  if (kpiTarget !== undefined) {
    patch.kpiTarget = sanitizeString(kpiTarget).slice(0, 160);
  }

  if (summary !== undefined) {
    patch.summary = sanitizeString(summary).slice(0, 400);
  }

  if (progress !== undefined) {
    try {
      patch.progress = parseCampaignProgress(progress, null);
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message || "Invalid progress" });
    }
  }

  if (nextTouchAt !== undefined) {
    try {
      patch.nextTouchAt = nextTouchAt ? parseCampaignDate(nextTouchAt) : null;
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message || "Invalid next touch date" });
    }
  }

  if (subject !== undefined) patch.subject = sanitizeString(subject).slice(0, 200);
  if (body !== undefined) patch.body = sanitizeString(body).slice(0, 20000);
  if (groupId !== undefined) patch.groupId = sanitizeString(groupId).slice(0, 80) || null;
  if (scheduledAt !== undefined) {
    try { patch.scheduledAt = scheduledAt ? new Date(scheduledAt).toISOString() : null; } catch { patch.scheduledAt = null; }
  }

  patch.updatedBy = req.user?.username || "system";

  try {
    const campaign = await updateCampaign(id, patch);
    res.json({ ok: true, campaign });
  } catch (error) {
    if (error.message === "Campaign not found") {
      return res.status(404).json({ ok: false, error: "Campaign not found" });
    }
    res.status(500).json({ ok: false, error: error.message || "Failed to update campaign" });
  }
});

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
    delayDays: Number(step?.delayDays) || 0,
    body: sanitizeString(step?.body ?? "").slice(0, 10000),
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

router.delete("/campaigns/:id", async (req, res) => {
  try {
    await deleteCampaign(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 500;
    res.status(status).json({ ok: false, error: error.message || "Failed to delete campaign" });
  }
});

router.patch("/email/sequences/:id", async (req, res) => {
  const { title, description, segment, frequency, steps, status } = req.body || {};
  const patch = {};
  if (title !== undefined) patch.title = sanitizeString(title).slice(0, 120);
  if (description !== undefined) patch.description = sanitizeString(description).slice(0, 400);
  if (segment !== undefined) patch.segment = sanitizeString(segment || "b2c").toLowerCase().slice(0, 24) || "b2c";
  if (frequency !== undefined) patch.frequency = sanitizeString(frequency || "daily").toLowerCase().slice(0, 24);
  if (status !== undefined) patch.status = sanitizeString(status).toLowerCase().slice(0, 20);
  if (steps !== undefined && Array.isArray(steps)) {
    patch.steps = steps.slice(0, 20).map((step) => ({
      subject: sanitizeString(step?.subject ?? ""),
      delayDays: Number(step?.delayDays) || 0,
      body: sanitizeString(step?.body ?? "").slice(0, 10000),
      templateId: step?.templateId ? sanitizeString(step.templateId).slice(0, 120) : undefined,
    }));
  }
  try {
    const sequence = await updateEmailSequence(req.params.id, patch);
    res.json({ ok: true, sequence });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 500;
    res.status(status).json({ ok: false, error: error.message || "Failed to update sequence" });
  }
});

router.delete("/email/sequences/:id", async (req, res) => {
  try {
    await deleteEmailSequence(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 500;
    res.status(status).json({ ok: false, error: error.message || "Failed to delete sequence" });
  }
});

router.delete("/templates/:id", async (req, res) => {
  try {
    await deleteTemplate(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 500;
    res.status(status).json({ ok: false, error: error.message || "Failed to delete template" });
  }
});

router.get("/groups", async (_req, res) => {
  const groups = await listGroups();
  res.json({ ok: true, groups });
});

router.post("/groups", async (req, res) => {
  const { name, description = "" } = req.body || {};
  const safeName = sanitizeString(name).slice(0, 120);
  if (!safeName) return res.status(400).json({ ok: false, error: "Group name is required" });
  try {
    const group = await createGroup({ name: safeName, description: sanitizeString(description).slice(0, 400), createdBy: req.user?.username || "system" });
    res.status(201).json({ ok: true, group });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Failed to create group" });
  }
});

router.patch("/groups/:id", async (req, res) => {
  const { name, description, status } = req.body || {};
  const patch = {};
  if (name !== undefined) {
    const safeName = sanitizeString(name).slice(0, 120);
    if (!safeName) return res.status(400).json({ ok: false, error: "Group name is required" });
    patch.name = safeName;
  }
  if (description !== undefined) patch.description = sanitizeString(description).slice(0, 400);
  if (status !== undefined) patch.status = sanitizeString(status).toLowerCase().slice(0, 20);
  try {
    const group = await updateGroup(req.params.id, patch);
    res.json({ ok: true, group });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 500;
    res.status(status).json({ ok: false, error: error.message || "Failed to update group" });
  }
});

router.delete("/groups/:id", async (req, res) => {
  try {
    await deleteGroup(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 500;
    res.status(status).json({ ok: false, error: error.message || "Failed to delete group" });
  }
});

router.get("/groups/:id/members", async (req, res) => {
  try {
    const members = await listGroupMembers(req.params.id);
    res.json({ ok: true, members });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Failed to list members" });
  }
});

router.post("/groups/:id/members", async (req, res) => {
  const { clientId } = req.body || {};
  const safeClientId = sanitizeString(clientId);
  if (!safeClientId) return res.status(400).json({ ok: false, error: "clientId is required" });
  try {
    const membership = await addGroupMember(req.params.id, safeClientId, req.user?.username || "system");
    res.status(201).json({ ok: true, membership });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 500;
    res.status(status).json({ ok: false, error: error.message || "Failed to add member" });
  }
});

router.delete("/groups/:id/members/:clientId", async (req, res) => {
  try {
    await removeGroupMember(req.params.id, req.params.clientId);
    res.json({ ok: true });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 500;
    res.status(status).json({ ok: false, error: error.message || "Failed to remove member" });
  }
});

router.get("/history", async (req, res) => {
  const limit = parseLimit(req.query.limit, 50);
  const history = await listEmailHistory(limit);
  res.json({ ok: true, history });
});

router.post("/history", async (req, res) => {
  const { type = "one-time", subject, recipientType, recipientId, groupId, groupName, campaignId, sequenceId, status = "sent", recipientCount } = req.body || {};
  try {
    const entry = await addEmailHistory({
      type,
      subject: sanitizeString(subject || "").slice(0, 200),
      recipientType: sanitizeString(recipientType || "client"),
      recipientId: recipientId ? sanitizeString(recipientId) : null,
      groupId: groupId ? sanitizeString(groupId) : null,
      groupName: groupName ? sanitizeString(groupName).slice(0, 120) : null,
      campaignId: campaignId ? sanitizeString(campaignId) : null,
      sequenceId: sequenceId ? sanitizeString(sequenceId) : null,
      status,
      recipientCount: Number.isFinite(Number(recipientCount)) ? Number(recipientCount) : null,
      createdBy: req.user?.username || "system",
    });
    res.status(201).json({ ok: true, entry });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Failed to log history" });
  }
});

router.post("/email/send", async (req, res) => {
  const { subject, body, recipientType = "client", recipientId, groupId, templateId } = req.body || {};
  const safeSubject = sanitizeString(subject || "").slice(0, 200);
  if (!safeSubject) return res.status(400).json({ ok: false, error: "Subject is required" });
  if (recipientType === "group" && !groupId) return res.status(400).json({ ok: false, error: "groupId is required for group sends" });
  if (recipientType === "client" && !recipientId) return res.status(400).json({ ok: false, error: "recipientId is required for client sends" });
  try {
    const entry = await addEmailHistory({
      type: "one-time",
      subject: safeSubject,
      recipientType,
      recipientId: recipientId ? sanitizeString(recipientId) : null,
      groupId: groupId ? sanitizeString(groupId) : null,
      status: "queued",
      createdBy: req.user?.username || "system",
    });
    res.status(201).json({ ok: true, entry, message: "Email queued. Connect a delivery provider in Settings > Integrations to send live emails." });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Failed to queue email" });
  }
});

export default router;

