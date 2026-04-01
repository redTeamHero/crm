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
  updateSmsTemplate,
  deleteSmsTemplate,
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

let _loadDB = async () => ({ consumers: [] });
let _loadSettings = async () => ({});

export function setMarketingDeps({ loadDB, loadSettings }) {
  if (typeof loadDB === "function") _loadDB = loadDB;
  if (typeof loadSettings === "function") _loadSettings = loadSettings;
}

const router = express.Router();

function sanitizeString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function sanitizeHtml(value) {
  if (typeof value !== "string") return "";
  return value.slice(0, 20000);
}

function parseLimit(value, defaultValue = 10, max = 200) {
  const num = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(num)) return defaultValue;
  return Math.max(1, Math.min(num, max));
}

const ALLOWED_CAMPAIGN_STATUSES = new Set(["draft", "scheduled", "running", "paused", "completed", "sent"]);

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
    channel = "email",
    status = "draft",
    segment = "b2c",
    nextTouchAt = null,
    kpiTarget = "",
    summary = "",
    description = "",
    frequency = "immediate",
    steps = [],
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

  const safeStatus = sanitizeCampaignStatus(status);
  const safeGroupId = sanitizeString(groupId).slice(0, 80) || null;
  const requiresGroup = safeStatus === "running" || safeStatus === "scheduled" || safeStatus === "sent";
  if (requiresGroup && !safeGroupId) {
    return res.status(400).json({ ok: false, error: "A group must be selected before sending or scheduling a campaign" });
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

  const safeSteps = Array.isArray(steps)
    ? steps.slice(0, 20).map((s) => ({
        subject: sanitizeString(String(s?.subject || "")).slice(0, 200),
        delayDays: Math.max(1, Math.min(Number.isFinite(Number(s?.delayDays)) ? Math.round(Number(s.delayDays)) : 1, 365)),
        body: sanitizeString(String(s?.body || "")).slice(0, 20000),
      }))
    : [];
  const ALLOWED_FREQ = new Set(["immediate", "daily", "weekly", "monthly", "custom"]);
  const safeFrequency = ALLOWED_FREQ.has(String(frequency).toLowerCase()) ? String(frequency).toLowerCase() : "immediate";

  const safeChannel = ["email", "sms"].includes(String(channel || "email").toLowerCase()) ? String(channel).toLowerCase() : "email";

  try {
    const campaign = await createCampaign({
      name: safeName,
      channel: safeChannel,
      status: safeStatus,
      segment: sanitizeSegmentValue(segment),
      nextTouchAt: safeNextTouch,
      kpiTarget: sanitizeString(kpiTarget).slice(0, 160),
      summary: sanitizeString(summary).slice(0, 400),
      description: sanitizeString(description).slice(0, 400),
      frequency: safeFrequency,
      steps: safeSteps,
      progress: safeProgress,
      subject: sanitizeString(subject).slice(0, 200),
      body: sanitizeString(body).slice(0, 20000),
      groupId: safeGroupId || undefined,
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
  const { name, status, segment, nextTouchAt, kpiTarget, summary, description, frequency, steps, progress, subject, body, groupId, scheduledAt } = req.body || {};

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
    const activeSendStatus = safeStatus === "running" || safeStatus === "scheduled" || safeStatus === "sent";
    if (activeSendStatus) {
      const patchGroupId = req.body?.groupId !== undefined
        ? (sanitizeString(req.body.groupId).slice(0, 80) || null)
        : undefined;
      const clearingGroup = patchGroupId === null;
      const providingGroup = patchGroupId && patchGroupId.length > 0;
      if (!providingGroup) {
        const allCampaigns = await listCampaigns();
        const existing = allCampaigns.find((c) => c.id === id);
        const resolvedGroupId = clearingGroup ? null : (existing?.groupId || null);
        if (!resolvedGroupId) {
          return res.status(400).json({ ok: false, error: "A group must be selected before sending or scheduling a campaign" });
        }
      }
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

  if (description !== undefined) {
    patch.description = sanitizeString(description).slice(0, 400);
  }

  if (frequency !== undefined) {
    const ALLOWED_FREQ = new Set(["immediate", "daily", "weekly", "monthly", "custom"]);
    const safeFreq = String(frequency).toLowerCase();
    patch.frequency = ALLOWED_FREQ.has(safeFreq) ? safeFreq : "immediate";
  }

  if (steps !== undefined) {
    patch.steps = Array.isArray(steps)
      ? steps.slice(0, 20).map((s) => ({
          subject: sanitizeString(String(s?.subject || "")).slice(0, 200),
          delayDays: Math.max(1, Math.min(Number.isFinite(Number(s?.delayDays)) ? Math.round(Number(s.delayDays)) : 1, 365)),
          body: sanitizeString(String(s?.body || "")).slice(0, 20000),
        }))
      : [];
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

  if (req.body?.channel !== undefined) {
    const ch = String(req.body.channel || "email").toLowerCase();
    patch.channel = ["email", "sms"].includes(ch) ? ch : "email";
  }
  if (subject !== undefined) patch.subject = sanitizeString(subject).slice(0, 200);
  if (body !== undefined) patch.body = sanitizeString(body).slice(0, 20000);
  if (groupId !== undefined) patch.groupId = sanitizeString(groupId).slice(0, 80) || null;
  if (scheduledAt !== undefined) {
    try { patch.scheduledAt = scheduledAt ? new Date(scheduledAt).toISOString() : null; } catch { patch.scheduledAt = null; }
  }
  if (req.body?.sentAt !== undefined) {
    try { patch.sentAt = req.body.sentAt ? new Date(req.body.sentAt).toISOString() : null; } catch { patch.sentAt = null; }
  }
  if (req.body?.recipientCount !== undefined) {
    const rc = Number(req.body.recipientCount);
    patch.recipientCount = Number.isFinite(rc) ? rc : null;
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
  const { title, description = "", segment = "b2c", badge = "Custom", html = "", subject = "" } = req.body || {};
  const safeTitle = sanitizeString(title);
  const safeDescription = sanitizeString(description);
  const safeSegment = sanitizeString(segment || "b2c").toLowerCase().slice(0, 24) || "b2c";
  const safeBadge = sanitizeString(badge || safeSegment.toUpperCase()).slice(0, 24);
  const safeHtml = sanitizeHtml(html);
  const safeSubject = sanitizeString(subject).slice(0, 200);
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
      subject: safeSubject,
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
  const reqSubject = req.body?.subject;
  if (reqSubject !== undefined) {
    patch.subject = sanitizeString(reqSubject).slice(0, 200);
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

router.patch("/sms-templates/:id", async (req, res) => {
  const { id } = req.params;
  const { title, body, segment, badge } = req.body || {};
  const patch = {};
  if (title !== undefined) patch.title = sanitizeString(title).slice(0, 120);
  if (body !== undefined) patch.body = sanitizeString(body).slice(0, 600);
  if (segment !== undefined) patch.segment = sanitizeString(segment).toLowerCase().slice(0, 24) || "b2c";
  if (badge !== undefined) patch.badge = sanitizeString(badge).slice(0, 24) || "SMS";
  try {
    const template = await updateSmsTemplate(id, patch);
    res.json({ ok: true, template });
  } catch (error) {
    const status = error.message === "SMS template not found" ? 404 : 500;
    res.status(status).json({ ok: false, error: error.message || "Failed to update SMS template" });
  }
});

router.delete("/sms-templates/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await deleteSmsTemplate(id);
    res.json({ ok: true });
  } catch (error) {
    const status = error.message === "SMS template not found" ? 404 : 500;
    res.status(status).json({ ok: false, error: error.message || "Failed to delete SMS template" });
  }
});

router.get("/email/sequences", async (_req, res) => {
  const sequences = await listEmailSequences();
  res.json({ ok: true, sequences });
});

router.post("/email/sequences", async (req, res) => {
  const { title, description = "", segment = "b2c", frequency = "daily", steps = [], groupId } = req.body || {};
  const safeTitle = sanitizeString(title);
  const safeDescription = sanitizeString(description);
  const safeSegment = sanitizeString(segment || "b2c").toLowerCase().slice(0, 24) || "b2c";
  const safeFrequency = sanitizeString(frequency || "daily").toLowerCase().slice(0, 24);
  const safeGroupId = groupId ? sanitizeString(groupId).slice(0, 80) : null;
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
      groupId: safeGroupId,
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
    await addEmailHistory({
      type: safeTargetType === "sequence" ? "sequence" : "campaign",
      subject: sanitizeString(req.body?.subject || `Dispatch: ${safeTargetId}`).slice(0, 200),
      recipientType: safeSegment,
      groupId: req.body?.groupId ? sanitizeString(req.body.groupId) : null,
      status: safeScheduledFor ? "scheduled" : "queued",
      recipientCount: safeAudienceCount || null,
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
  const { title, description, segment, frequency, steps, status, groupId } = req.body || {};
  const patch = {};
  if (title !== undefined) patch.title = sanitizeString(title).slice(0, 120);
  if (description !== undefined) patch.description = sanitizeString(description).slice(0, 400);
  if (segment !== undefined) patch.segment = sanitizeString(segment || "b2c").toLowerCase().slice(0, 24) || "b2c";
  if (groupId !== undefined) patch.groupId = groupId ? sanitizeString(groupId).slice(0, 80) : null;
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
  const channel = req.query.channel ? sanitizeString(req.query.channel).toLowerCase() : null;
  let history = await listEmailHistory(limit);
  if (channel === "sms") history = history.filter((h) => h.type === "sms");
  else if (channel === "email") history = history.filter((h) => h.type !== "sms");
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

const ALLOWED_RECIPIENT_TYPES = new Set(["client", "group", "multiple", "phone"]);

const E164_RE = /^\+?[1-9]\d{7,14}$/;

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, "");
  if (E164_RE.test(digits)) return digits.startsWith("+") ? digits : "+" + digits;
  return null;
}

router.post("/sms/send", async (req, res) => {
  const { to, body, groupId, recipientType = "phone" } = req.body || {};
  const safeBody = sanitizeString(body || "").slice(0, 600);
  if (!safeBody) return res.status(400).json({ ok: false, error: "Message body is required" });
  const safeRecipientType = String(recipientType || "phone").trim().toLowerCase();
  if (!["phone", "group", "multiple"].includes(safeRecipientType)) {
    return res.status(400).json({ ok: false, error: "Invalid recipientType" });
  }
  if (safeRecipientType === "group" && !groupId) {
    return res.status(400).json({ ok: false, error: "groupId is required for group sends" });
  }
  if (safeRecipientType !== "group" && !to) {
    return res.status(400).json({ ok: false, error: "Phone number is required" });
  }

  const safeGroupId = groupId ? sanitizeString(groupId).slice(0, 80) : null;

  await _loadSettings(req).catch(() => {});

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const twilioConfigured = !!(accountSid && authToken && (messagingServiceSid || fromNumber));

  if (!twilioConfigured) {
    return res.status(422).json({
      ok: false,
      error: "SMS provider not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID (or TWILIO_FROM_NUMBER) in Settings \u2192 APIs to send live messages.",
    });
  }

  let db = { consumers: [] };
  try { db = await _loadDB(req); } catch { db = { consumers: [] }; }
  const consumers = db.consumers || [];

  let toNums = [];
  if (safeRecipientType === "group" && safeGroupId) {
    try {
      const members = await listGroupMembers(safeGroupId);
      for (const m of members) {
        const consumer = consumers.find((c) => c.id === m.clientId);
        const phone = normalizePhone(consumer?.phone);
        if (phone) toNums.push(phone);
      }
    } catch { toNums = []; }
  } else {
    const rawNums = String(to || "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const raw of rawNums) {
      const phone = normalizePhone(raw);
      if (phone) toNums.push(phone);
    }
  }

  const recipientCount = toNums.length || null;

  if (toNums.length === 0) {
    return res.status(422).json({
      ok: false,
      error: safeRecipientType === "group"
        ? "No valid phone numbers found for group members. Ensure client records have a phone number."
        : "No valid E.164 phone numbers provided (e.g. +15125550199).",
    });
  }

  let twilioErrors = [];
  let twilioSuccesses = 0;

  try {
    const twilio = (await import("twilio")).default;
    const client = twilio(accountSid, authToken);
    for (const num of toNums.slice(0, 100)) {
      try {
        const msgOpts = { body: safeBody, to: num };
        if (messagingServiceSid) msgOpts.messagingServiceSid = messagingServiceSid;
        else msgOpts.from = fromNumber;
        await client.messages.create(msgOpts);
        twilioSuccesses++;
      } catch (e) {
        twilioErrors.push(`${num}: ${String(e.message || e)}`);
      }
    }
  } catch (initErr) {
    return res.status(500).json({ ok: false, error: `Twilio initialization failed: ${initErr.message || initErr}` });
  }

  try {
    const entryStatus = twilioSuccesses > 0 ? "sent" : "failed";
    const errorSummary = twilioErrors.length ? twilioErrors.slice(0, 3).join("; ") : null;
    const entry = await addEmailHistory({
      type: "sms",
      subject: safeBody.slice(0, 80),
      recipientType: safeRecipientType,
      recipientId: toNums[0] || null,
      groupId: safeGroupId,
      recipientCount,
      status: entryStatus,
      errorMessage: errorSummary,
      createdBy: req.user?.username || "system",
    });
    let message;
    if (twilioSuccesses > 0 && twilioErrors.length === 0) {
      message = `SMS sent to ${twilioSuccesses} recipient${twilioSuccesses === 1 ? "" : "s"} via Twilio.`;
    } else if (twilioSuccesses > 0) {
      message = `SMS sent to ${twilioSuccesses} recipient${twilioSuccesses === 1 ? "" : "s"}; ${twilioErrors.length} failed.`;
    } else {
      message = `Send failed: ${errorSummary || "Unknown Twilio error"}`;
    }
    res.status(201).json({ ok: true, entry, message, sent: twilioSuccesses, failed: twilioErrors.length });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Failed to log SMS history" });
  }
});

router.post("/email/send", async (req, res) => {
  const { subject, body, recipientType = "client", recipientId, groupId, templateId } = req.body || {};
  const safeSubject = sanitizeString(subject || "").slice(0, 200);
  if (!safeSubject) return res.status(400).json({ ok: false, error: "Subject is required" });
  const safeRecipientType = String(recipientType || "client").trim().toLowerCase();
  if (!ALLOWED_RECIPIENT_TYPES.has(safeRecipientType)) return res.status(400).json({ ok: false, error: "Invalid recipientType. Must be client, group, or multiple" });
  if (safeRecipientType === "group" && !groupId) return res.status(400).json({ ok: false, error: "groupId is required for group sends" });
  if ((safeRecipientType === "client" || safeRecipientType === "multiple") && !recipientId) return res.status(400).json({ ok: false, error: "recipientId is required for client sends" });

  const recipientIds = recipientId
    ? String(recipientId).split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const recipientCount = (safeRecipientType === "client" || safeRecipientType === "multiple") ? recipientIds.length : null;

  try {
    const entries = [];
    if ((safeRecipientType === "client" || safeRecipientType === "multiple") && recipientIds.length > 1) {
      for (const rid of recipientIds) {
        const entry = await addEmailHistory({
          type: "one-time",
          subject: safeSubject,
          recipientType: safeRecipientType,
          recipientId: rid,
          groupId: null,
          recipientCount: 1,
          status: "queued",
          createdBy: req.user?.username || "system",
        });
        entries.push(entry);
      }
    } else {
      const entry = await addEmailHistory({
        type: "one-time",
        subject: safeSubject,
        recipientType: safeRecipientType,
        recipientId: recipientIds[0] || null,
        groupId: groupId ? sanitizeString(groupId) : null,
        recipientCount,
        status: "queued",
        createdBy: req.user?.username || "system",
      });
      entries.push(entry);
    }
    res.status(201).json({ ok: true, entry: entries[0], entries, message: "Email queued. Connect a delivery provider in Settings > Integrations to send live emails." });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Failed to queue email" });
  }
});

export default router;

