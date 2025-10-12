import { nanoid } from "nanoid";
import { readKey, writeKey } from "./kvdb.js";

export const MARKETING_STATE_KEY = "marketing_state_v1";

const SEGMENT_DEFAULT = "b2c";
const DEFAULT_TEMPLATES = [
  {
    id: "tpl-welcome-series",
    title: "Client Welcome Series",
    description:
      "Day 0-7 onboarding with timeline prompts, dispute checklist, and trust-building NEPQ questions.",
    segment: SEGMENT_DEFAULT,
    badge: "EN/ES",
    html: "<h1>Bienvenido</h1><p>Start with trust. Share your dispute roadmap and book a consult.</p>",
    createdAt: new Date(2023, 6, 1).toISOString(),
  },
  {
    id: "tpl-score-update",
    title: "Score Update Alert",
    description:
      "Automated transactional email with {{credit_score}} merge field and CTA to review the secure portal.",
    segment: SEGMENT_DEFAULT,
    badge: "Dynamic",
    html: "<h1>Score Update</h1><p>Your latest credit score: {{credit_score}}. Log in to review the audit.</p>",
    createdAt: new Date(2023, 11, 15).toISOString(),
  },
  {
    id: "tpl-broker-touch",
    title: "Broker Referral Touch",
    description:
      "Quarterly update for trucking partners highlighting compliance wins and shared marketing assets.",
    segment: "b2b",
    badge: "B2B",
    html: "<h1>Broker Referral Touch</h1><p>Showcase compliance wins and referral incentives.</p>",
    createdAt: new Date(2024, 2, 10).toISOString(),
  },
];

const DEFAULT_SMS_TEMPLATES = [
  {
    id: "sms-intro-drip",
    title: "SMS Intro Touch",
    body: "Hi {{first_name}}, welcome aboard. Reply with any questions about your dispute roadmap.",
    segment: SEGMENT_DEFAULT,
    badge: "SMS",
    createdAt: new Date(2024, 0, 5).toISOString(),
  },
];

const DEFAULT_EMAIL_SEQUENCES = [
  {
    id: "seq-onboarding",
    title: "7-Day Onboarding",
    description: "Kickoff sequence guiding clients through audits, Metro-2 checks, and booking consults.",
    segment: SEGMENT_DEFAULT,
    frequency: "daily",
    steps: [
      { subject: "Day 1 • Your dispute audit checklist", delayDays: 0 },
      { subject: "Day 3 • How to prep Metro-2 evidence", delayDays: 2 },
    ],
    createdAt: new Date(2024, 0, 6).toISOString(),
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
    notes: "Warm up the sender domain and keep templates aligned with your compliance voice guide.",
    lastConfiguredAt: null,
  },
];

const DEFAULT_STATE = {
  templates: DEFAULT_TEMPLATES,
  smsTemplates: DEFAULT_SMS_TEMPLATES,
  emailSequences: DEFAULT_EMAIL_SEQUENCES,
  testQueue: [],
  emailDispatchQueue: [],
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
  const html = typeof raw.html === "string" ? raw.html.trim() : "";
  const createdAt = raw.createdAt || new Date().toISOString();
  const updatedAt = raw.updatedAt || createdAt;
  return {
    id: raw.id || nanoid(8),
    title,
    description,
    segment,
    badge,
    html,
    createdAt,
    updatedAt,
    createdBy: raw.createdBy || "system",
    gradient: raw.gradient || segmentGradient(segment),
  };
}

function normalizeSmsTemplate(raw = {}) {
  const title = String(raw.title || "SMS Template").trim();
  const segment = String(raw.segment || SEGMENT_DEFAULT).toLowerCase();
  const badge = String(raw.badge || "SMS").trim() || "SMS";
  const body = String(raw.body || "").trim();
  return {
    id: raw.id || nanoid(8),
    title,
    body: body.slice(0, 600),
    segment,
    badge,
    createdAt: raw.createdAt || new Date().toISOString(),
    createdBy: raw.createdBy || "system",
    gradient: raw.gradient || segmentGradient(segment),
  };
}

const ALLOWED_SEQUENCE_FREQUENCIES = new Set(["immediate", "daily", "weekly", "monthly", "custom"]);

function normalizeSequenceFrequency(value) {
  const safe = String(value || "daily").toLowerCase();
  if (ALLOWED_SEQUENCE_FREQUENCIES.has(safe)) return safe;
  return "custom";
}

function normalizeSequenceSteps(rawSteps) {
  const steps = Array.isArray(rawSteps) ? rawSteps.slice(0, 20) : [];
  if (!steps.length) {
    return [
      {
        subject: "Touchpoint",
        delayDays: 0,
        templateId: null,
      },
    ];
  }
  return steps.map((step, index) => {
    const subject = String(step?.subject || `Step ${index + 1}`).slice(0, 160);
    const delayDays = Number.isFinite(Number(step?.delayDays))
      ? Math.max(0, Math.min(Number(step.delayDays), 365))
      : 0;
    const templateId = step?.templateId ? String(step.templateId) : null;
    return {
      subject,
      delayDays,
      templateId,
    };
  });
}

function normalizeEmailSequence(raw = {}) {
  const title = String(raw.title || "Email Sequence").trim();
  const description = String(raw.description || "Outline the journey and CTA.").trim();
  const segment = String(raw.segment || SEGMENT_DEFAULT).toLowerCase();
  const frequency = normalizeSequenceFrequency(raw.frequency);
  return {
    id: raw.id || nanoid(8),
    title,
    description,
    segment,
    frequency,
    steps: normalizeSequenceSteps(raw.steps),
    createdAt: raw.createdAt || new Date().toISOString(),
    createdBy: raw.createdBy || "system",
    gradient: raw.gradient || segmentGradient(segment),
  };
}

function normalizeEmailDispatch(raw = {}) {
  const targetType = raw.targetType === "sequence" ? "sequence" : "template";
  const targetId = String(raw.targetId || "").trim();
  const frequency = normalizeSequenceFrequency(raw.frequency);
  const segment = String(raw.segment || SEGMENT_DEFAULT).toLowerCase();
  const status = raw.status === "completed" ? "completed" : "scheduled";
  const scheduledForDate = raw.scheduledFor ? new Date(raw.scheduledFor) : null;
  const scheduledFor =
    scheduledForDate && !Number.isNaN(scheduledForDate.getTime())
      ? scheduledForDate.toISOString()
      : new Date().toISOString();
  const createdAt = raw.createdAt || new Date().toISOString();
  const createdBy = raw.createdBy || "system";
  const audienceCount = Number.isFinite(Number(raw.audienceCount))
    ? Math.max(0, Number(raw.audienceCount))
    : null;
  const notes = raw.notes ? String(raw.notes).slice(0, 500) : "";

  return {
    id: raw.id || nanoid(10),
    targetType,
    targetId,
    frequency,
    segment,
    status,
    scheduledFor,
    createdAt,
    createdBy,
    audienceCount,
    notes,
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
    smsTemplates: ensureArray(base.smsTemplates),
    emailSequences: ensureArray(base.emailSequences),
    testQueue: ensureArray(base.testQueue),
    emailDispatchQueue: ensureArray(base.emailDispatchQueue),
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

  const smsTemplateMap = new Map();
  for (const tpl of [...DEFAULT_STATE.smsTemplates, ...normalized.smsTemplates]) {
    const normalizedTemplate = normalizeSmsTemplate(tpl);
    smsTemplateMap.set(normalizedTemplate.id, normalizedTemplate);
  }
  normalized.smsTemplates = Array.from(smsTemplateMap.values()).sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const sequenceMap = new Map();
  for (const sequence of [...DEFAULT_STATE.emailSequences, ...normalized.emailSequences]) {
    const normalizedSequence = normalizeEmailSequence(sequence);
    sequenceMap.set(normalizedSequence.id, normalizedSequence);
  }
  normalized.emailSequences = Array.from(sequenceMap.values()).sort((a, b) =>
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

  normalized.emailDispatchQueue = normalized.emailDispatchQueue
    .map((item) => normalizeEmailDispatch(item))
    .slice(0, 100);

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
  const now = new Date().toISOString();
  const next = normalizeTemplate({ ...template, createdAt: now, updatedAt: now });
  state.templates = [next, ...state.templates.filter((tpl) => tpl.id !== next.id)].slice(0, 50);
  await saveMarketingState(state);
  return next;
}

export async function updateTemplate(id, updates = {}) {
  if (!id) throw new Error("Template id is required");
  const state = await loadMarketingState();
  const index = state.templates.findIndex((tpl) => tpl.id === id);
  if (index === -1) {
    throw new Error("Template not found");
  }
  const now = new Date().toISOString();
  const current = state.templates[index];
  const next = normalizeTemplate({
    ...current,
    ...updates,
    id: current.id,
    createdAt: current.createdAt || now,
    updatedAt: now,
  });
  state.templates[index] = next;
  state.templates = [
    state.templates[index],
    ...state.templates.filter((tpl, tplIndex) => tplIndex !== index),
  ].slice(0, 50);
  await saveMarketingState(state);
  return state.templates[0];
}

export async function listSmsTemplates() {
  const state = await loadMarketingState();
  return state.smsTemplates;
}

export async function createSmsTemplate(template) {
  const state = await loadMarketingState();
  const next = normalizeSmsTemplate({ ...template, createdAt: new Date().toISOString() });
  state.smsTemplates = [next, ...state.smsTemplates.filter((tpl) => tpl.id !== next.id)].slice(0, 100);
  await saveMarketingState(state);
  return next;
}

export async function listEmailSequences() {
  const state = await loadMarketingState();
  return state.emailSequences;
}

export async function createEmailSequence(sequence) {
  const state = await loadMarketingState();
  const next = normalizeEmailSequence({ ...sequence, createdAt: new Date().toISOString() });
  state.emailSequences = [
    next,
    ...state.emailSequences.filter((seq) => seq.id !== next.id),
  ].slice(0, 100);
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

export async function listEmailDispatches(limit = 20) {
  const state = await loadMarketingState();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  return state.emailDispatchQueue.slice(0, safeLimit);
}

export async function scheduleEmailDispatch(dispatch) {
  const state = await loadMarketingState();
  const normalized = normalizeEmailDispatch({
    ...dispatch,
    createdAt: new Date().toISOString(),
    createdBy: dispatch.createdBy || "system",
  });

  if (!normalized.targetId) {
    throw new Error("Target id is required");
  }

  const templateExists =
    normalized.targetType === "template" && state.templates.some((tpl) => tpl.id === normalized.targetId);

  const sequenceExists =
    normalized.targetType === "sequence" &&
    state.emailSequences.some((seq) => seq.id === normalized.targetId);

  if (!templateExists && !sequenceExists) {
    throw new Error("Target template or sequence not found");
  }

  state.emailDispatchQueue = [
    normalized,
    ...state.emailDispatchQueue.filter((item) => item.id !== normalized.id),
  ].slice(0, 100);
  await saveMarketingState(state);
  return normalized;
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

