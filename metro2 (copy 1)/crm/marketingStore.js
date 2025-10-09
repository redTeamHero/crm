import { nanoid } from "nanoid";
import { readKey, writeKey } from "./kvdb.js";

export const MARKETING_STATE_KEY = "marketing_state_v1";

const SEGMENT_DEFAULT = "b2c";
const DEFAULT_TEMPLATES = [
  {
    id: "tpl-welcome-series",
    title: "Client Welcome Series",
    description:
      "Day 0-7 onboarding with bilingual timeline, dispute checklist, and trust-building NEPQ questions.",
    segment: SEGMENT_DEFAULT,
    badge: "EN/ES",
    createdAt: new Date(2023, 6, 1).toISOString(),
  },
  {
    id: "tpl-score-update",
    title: "Score Update Alert",
    description:
      "Automated transactional email with {{credit_score}} merge field and CTA to review the secure portal.",
    segment: SEGMENT_DEFAULT,
    badge: "Dynamic",
    createdAt: new Date(2023, 11, 15).toISOString(),
  },
  {
    id: "tpl-broker-touch",
    title: "Broker Referral Touch",
    description:
      "Quarterly update for trucking partners highlighting compliance wins and shared marketing assets.",
    segment: "b2b",
    badge: "B2B",
    createdAt: new Date(2024, 2, 10).toISOString(),
  },
];

const DEFAULT_PROVIDERS = [
  {
    id: "sms_twilio",
    label: "SMS • Twilio Messaging",
    channel: "sms",
    status: "pending",
    env: [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_MESSAGING_SERVICE_SID",
    ],
    docs: "https://www.twilio.com/docs/messaging",
    notes: "Add your Messaging Service SID so outbound SMS respect opt-outs automatically.",
    lastConfiguredAt: null,
  },
  {
    id: "email_sendgrid",
    label: "Email • SendGrid",
    channel: "email",
    status: "pending",
    env: ["SENDGRID_API_KEY", "SENDGRID_FROM_EMAIL", "SENDGRID_FROM_NAME"],
    docs: "https://docs.sendgrid.com/ui/account-and-settings/api-keys",
    notes: "Warm up the sender domain and enforce Spanish/English content toggles in templates.",
    lastConfiguredAt: null,
  },
];

const DEFAULT_STATE = {
  templates: DEFAULT_TEMPLATES,
  testQueue: [],
  providers: DEFAULT_PROVIDERS,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureArray(value, fallback = []) {
  return Array.isArray(value) ? value.slice() : fallback.slice();
}

function segmentGradient(segment = SEGMENT_DEFAULT) {
  switch (segment) {
    case "b2b":
      return "from-sky-100/70 to-white";
    case "attorneys":
      return "from-amber-100/70 to-white";
    case "inactive":
      return "from-rose-100/70 to-white";
    default:
      return "from-violet-100/80 to-white";
  }
}

function normalizeTemplate(raw = {}) {
  const title = String(raw.title || "Untitled template").trim();
  const description = String(raw.description || "Outline your nurture touchpoints and CTA.").trim();
  const segment = String(raw.segment || SEGMENT_DEFAULT).toLowerCase();
  const badge = String(raw.badge || segment.toUpperCase()).trim() || segment.toUpperCase();
  return {
    id: raw.id || nanoid(8),
    title,
    description,
    segment,
    badge,
    createdAt: raw.createdAt || new Date().toISOString(),
    createdBy: raw.createdBy || "system",
    gradient: raw.gradient || segmentGradient(segment),
  };
}

function normalizeProvider(raw = {}) {
  const allowedStatus = new Set(["pending", "ready", "error"]);
  const status = allowedStatus.has(raw.status) ? raw.status : "pending";
  return {
    id: raw.id || nanoid(8),
    label: raw.label || "Provider",
    channel: raw.channel || "sms",
    status,
    env: ensureArray(raw.env),
    docs: raw.docs || "",
    notes: raw.notes || "",
    lastConfiguredAt: raw.lastConfiguredAt || null,
    webhookUrl: raw.webhookUrl || null,
  };
}

function normalizeState(raw) {
  const base = raw && typeof raw === "object" ? clone(raw) : {};
  const normalized = {
    templates: ensureArray(base.templates),
    testQueue: ensureArray(base.testQueue),
    providers: ensureArray(base.providers),
  };

  const templateMap = new Map();
  for (const tpl of [...DEFAULT_STATE.templates, ...normalized.templates]) {
    const normalizedTemplate = normalizeTemplate(tpl);
    templateMap.set(normalizedTemplate.id, normalizedTemplate);
  }
  normalized.templates = Array.from(templateMap.values()).sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const providerMap = new Map();
  for (const provider of [...DEFAULT_STATE.providers, ...normalized.providers]) {
    const normalizedProvider = normalizeProvider(provider);
    providerMap.set(normalizedProvider.id, normalizedProvider);
  }
  normalized.providers = Array.from(providerMap.values());

  normalized.testQueue = normalized.testQueue
    .map((item) => ({
      id: item.id || nanoid(10),
      channel: item.channel || "sms",
      recipient: String(item.recipient || "").slice(0, 140),
      notes: item.notes || "",
      smsPreview: item.smsPreview || "",
      emailPreviewId: item.emailPreviewId || null,
      metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {},
      source: item.source || "marketing-ui",
      createdAt: item.createdAt || new Date().toISOString(),
      createdBy: item.createdBy || "system",
      status: item.status || "queued",
      messageLength: typeof item.messageLength === "number"
        ? item.messageLength
        : (item.smsPreview || "").length,
    }))
    .slice(0, 50);

  return normalized;
}

async function loadMarketingState() {
  const raw = await readKey(MARKETING_STATE_KEY, null);
  return normalizeState(raw);
}

async function saveMarketingState(state) {
  await writeKey(MARKETING_STATE_KEY, state);
}

export async function listTemplates() {
  const state = await loadMarketingState();
  return state.templates;
}

export async function createTemplate(template) {
  const state = await loadMarketingState();
  const next = normalizeTemplate({ ...template, createdAt: new Date().toISOString() });
  state.templates = [next, ...state.templates.filter((tpl) => tpl.id !== next.id)].slice(0, 50);
  await saveMarketingState(state);
  return next;
}

export async function listTestQueue(limit = 10) {
  const state = await loadMarketingState();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
  return state.testQueue.slice(0, safeLimit);
}

export async function enqueueTestSend(data) {
  const state = await loadMarketingState();
  const item = {
    id: nanoid(12),
    channel: data.channel || "sms",
    recipient: String(data.recipient || "").trim().slice(0, 140),
    notes: data.notes ? String(data.notes).slice(0, 500) : "",
    smsPreview: data.smsPreview || "",
    emailPreviewId: data.emailPreviewId || null,
    metadata: data.metadata && typeof data.metadata === "object" ? data.metadata : {},
    source: data.source || "marketing-ui",
    createdAt: new Date().toISOString(),
    createdBy: data.createdBy || "system",
    status: "queued",
    messageLength: (data.smsPreview || "").length,
  };
  state.testQueue = [item, ...state.testQueue].slice(0, 50);
  await saveMarketingState(state);
  return item;
}

export async function listProviders() {
  const state = await loadMarketingState();
  return state.providers;
}

export async function updateProvider(id, patch = {}) {
  if (!id) throw new Error("Missing provider id");
  const state = await loadMarketingState();
  const index = state.providers.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new Error("Provider not found");
  }
  const allowedStatus = new Set(["pending", "ready", "error"]);
  const current = state.providers[index];
  const next = { ...current };
  if (patch.label) next.label = String(patch.label);
  if (patch.channel) next.channel = String(patch.channel);
  if (patch.notes !== undefined) next.notes = String(patch.notes || "");
  if (patch.docs) next.docs = String(patch.docs);
  if (patch.env && Array.isArray(patch.env)) {
    next.env = patch.env.map((envVar) => String(envVar));
  }
  if (patch.webhookUrl !== undefined) {
    next.webhookUrl = patch.webhookUrl ? String(patch.webhookUrl) : null;
  }
  if (patch.status && allowedStatus.has(patch.status)) {
    next.status = patch.status;
    next.lastConfiguredAt = new Date().toISOString();
  }
  state.providers[index] = normalizeProvider(next);
  await saveMarketingState(state);
  return state.providers[index];
}

export async function resetMarketingState(value = null) {
  if (value === null) {
    await writeKey(MARKETING_STATE_KEY, null);
    return;
  }
  await writeKey(MARKETING_STATE_KEY, normalizeState(value));
}

export function describeProvidersForDocs(providers) {
  return providers.map((provider) => ({
    id: provider.id,
    label: provider.label,
    env: provider.env,
    docs: provider.docs,
    status: provider.status,
  }));
}

export function getDefaultTemplates() {
  return clone(DEFAULT_TEMPLATES);
}

export function getDefaultProviders() {
  return clone(DEFAULT_PROVIDERS);
}

