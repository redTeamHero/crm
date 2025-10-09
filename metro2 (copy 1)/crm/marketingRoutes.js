import express from "express";
import {
  enqueueTestSend,
  listTestQueue,
  listTemplates,
  createTemplate,
  listProviders,
  updateProvider,
} from "./marketingStore.js";

const router = express.Router();

function sanitizeString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
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
  const { title, description = "", segment = "b2c", badge = "Custom" } = req.body || {};
  const safeTitle = sanitizeString(title);
  const safeDescription = sanitizeString(description);
  const safeSegment = sanitizeString(segment || "b2c").toLowerCase().slice(0, 24) || "b2c";
  const safeBadge = sanitizeString(badge || safeSegment.toUpperCase()).slice(0, 24);
  if (!safeTitle) {
    return res.status(400).json({ ok: false, error: "Template title is required" });
  }
  try {
    const template = await createTemplate({
      title: safeTitle.slice(0, 120),
      description: safeDescription.slice(0, 400),
      segment: safeSegment,
      badge: safeBadge || safeSegment.toUpperCase(),
      createdBy: req.user?.username || "system",
    });
    res.status(201).json({ ok: true, template });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Failed to save template" });
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

