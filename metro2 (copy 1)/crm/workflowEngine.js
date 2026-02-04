import { nanoid } from "nanoid";
import { readKey, writeKey } from "./kvdb.js";
import {
  listConsumerState,
  addReminder,
  addEvent,
  registerStateEventListener,
} from "./state.js";
import { logInfo, logWarn } from "./logger.js";

const CONFIG_KEY = "workflow_config_v1";
const CACHE_TTL_MS = 15_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const BUREAU_CANONICAL = new Map([
  ["transunion", "TransUnion"],
  ["trans union", "TransUnion"],
  ["tu", "TransUnion"],
  ["experian", "Experian"],
  ["ex", "Experian"],
  ["equifax", "Equifax"],
  ["eq", "Equifax"],
]);

const DEFAULT_WORKFLOW_CONFIG = {
  version: 1,
  updatedAt: null,
  operations: {
    "letters.generate": {
      name: "Dispute cadence",
      description: "Guard dispute rounds with bureau spacing and validation checks.",
      rules: [
        {
          id: "letters-min-interval",
          type: "minInterval",
          description: "Wait 35 days before disputing the same bureau again.",
          eventType: "letters_generated",
          intervalDays: 35,
          enforcement: "warn",
          onFail: {
            message:
              "Next round alert: {{first.bureau}} has {{first.remainingDays}} day(s) remaining.",
          },
        },
        {
          id: "letters-validation-warn",
          type: "requireRecentEvent",
          description: "Warn if the validation checklist is older than 7 days.",
          eventType: "validation_completed",
          maxAgeDays: 7,
          enforcement: "warn",
          onFail: {
            message:
              "Re-run validation (last logged {{lastEventAt || 'never'}}) so advisors stay compliance-ready.",
          },
        },
      ],
    },
  },
  events: {
    dispute_resolved: {
      name: "Dispute resolved follow-up",
      description: "Kick off retention touches when bureaus resolve disputes.",
      actions: [
        {
          id: "followup-reminder",
          type: "scheduleReminder",
          waitDays: 15,
          payloadTemplate: {
            type: "follow_up",
            summary: "Confirm {{event.payload.bureau || 'bureau'}} resolution",
            workflow: "dispute_resolved",
          },
        },
        {
          id: "notify-team",
          type: "createEvent",
          eventType: "workflow_notification",
          payloadTemplate: {
            message:
              "Dispute resolved for {{event.payload.accountName || 'an account'}} ({{event.payload.bureau || 'bureau'}}). Update the client and offer a progress review.",
            severity: "info",
          },
        },
      ],
    },
  },
};

let configCache = null;
let cacheLoadedAt = 0;
let initialized = false;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalBureauName(raw) {
  if (raw === undefined || raw === null) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const direct = BUREAU_CANONICAL.get(str.toLowerCase());
  if (direct) return direct;
  const compressed = str.toLowerCase().replace(/[^a-z]/g, "");
  return BUREAU_CANONICAL.get(compressed) || null;
}

function normalizeTemplate(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeTemplate(item));
  if (isPlainObject(value)) {
    const next = {};
    for (const [key, val] of Object.entries(value)) {
      next[key] = normalizeTemplate(val);
    }
    return next;
  }
  return value;
}

function normalizeRule(rule, fallbackId) {
  if (!isPlainObject(rule)) return null;
  const normalized = { ...rule };
  normalized.id = typeof rule.id === "string" && rule.id.trim() ? rule.id.trim() : `rule_${fallbackId}_${nanoid(6)}`;
  normalized.type = typeof rule.type === "string" && rule.type.trim() ? rule.type.trim() : "custom";
  normalized.description = typeof rule.description === "string" ? rule.description.trim() : "";
  normalized.eventType = typeof rule.eventType === "string" && rule.eventType.trim() ? rule.eventType.trim() : "letters_generated";
  normalized.intervalDays = Number.isFinite(Number(rule.intervalDays)) ? Number(rule.intervalDays) : 0;
  normalized.maxAgeDays = Number.isFinite(Number(rule.maxAgeDays)) ? Number(rule.maxAgeDays) : 0;
  normalized.enforcement = rule.enforcement === "warn" ? "warn" : "block";
  if (normalized.id === "letters-min-interval" && normalized.type === "minInterval") {
    normalized.enforcement = "warn";
  }
  normalized.match = isPlainObject(rule.match) ? { ...rule.match } : null;
  normalized.scope = typeof rule.scope === "string" ? rule.scope : null;
  normalized.onFail = isPlainObject(rule.onFail) ? normalizeTemplate(rule.onFail) : {};
  return normalized;
}

function normalizeAction(action, fallbackId) {
  if (!isPlainObject(action)) return null;
  const normalized = { ...action };
  normalized.id = typeof action.id === "string" && action.id.trim() ? action.id.trim() : `action_${fallbackId}_${nanoid(6)}`;
  normalized.type = typeof action.type === "string" && action.type.trim() ? action.type.trim() : "createEvent";
  normalized.eventType = typeof action.eventType === "string" && action.eventType.trim() ? action.eventType.trim() : normalized.type === "createEvent" ? "workflow_notification" : undefined;
  normalized.waitDays = Number.isFinite(Number(action.waitDays)) ? Number(action.waitDays) : null;
  normalized.waitHours = Number.isFinite(Number(action.waitHours)) ? Number(action.waitHours) : null;
  normalized.waitMinutes = Number.isFinite(Number(action.waitMinutes)) ? Number(action.waitMinutes) : null;
  normalized.payloadTemplate = normalizeTemplate(action.payloadTemplate);
  normalized.url = typeof action.url === "string" && action.url.trim() ? action.url.trim() : undefined;
  normalized.method = typeof action.method === "string" && action.method.trim() ? action.method.trim().toUpperCase() : undefined;
  normalized.headers = isPlainObject(action.headers) ? { ...action.headers } : undefined;
  return normalized;
}

function normalizeWorkflowConfig(raw) {
  const base = isPlainObject(raw) ? { ...raw } : {};
  base.version = Number.isInteger(base.version) ? base.version : 1;
  base.updatedAt = typeof base.updatedAt === "string" ? base.updatedAt : null;

  const operations = isPlainObject(base.operations) ? base.operations : {};
  const normalizedOps = {};
  for (const [operation, cfg] of Object.entries(operations)) {
    if (!isPlainObject(cfg)) continue;
    const rules = Array.isArray(cfg.rules) ? cfg.rules : [];
    normalizedOps[operation] = {
      name: typeof cfg.name === "string" ? cfg.name : "",
      description: typeof cfg.description === "string" ? cfg.description : "",
      rules: rules
        .map((rule, idx) => normalizeRule(rule, `${operation}_${idx}`))
        .filter(Boolean),
    };
  }
  base.operations = normalizedOps;

  const events = isPlainObject(base.events) ? base.events : {};
  const normalizedEvents = {};
  for (const [eventType, cfg] of Object.entries(events)) {
    if (!isPlainObject(cfg)) continue;
    const actions = Array.isArray(cfg.actions) ? cfg.actions : [];
    normalizedEvents[eventType] = {
      name: typeof cfg.name === "string" ? cfg.name : "",
      description: typeof cfg.description === "string" ? cfg.description : "",
      actions: actions
        .map((action, idx) => normalizeAction(action, `${eventType}_${idx}`))
        .filter(Boolean),
    };
  }
  base.events = normalizedEvents;

  return base;
}

async function loadWorkflowConfig(force = false) {
  if (!force && configCache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    return configCache;
  }
  let stored = await readKey(CONFIG_KEY, null);
  if (!stored) {
    const seed = JSON.parse(JSON.stringify(DEFAULT_WORKFLOW_CONFIG));
    seed.updatedAt = new Date().toISOString();
    await writeKey(CONFIG_KEY, seed);
    stored = seed;
  }
  const normalized = normalizeWorkflowConfig(stored);
  if (!normalized.updatedAt) normalized.updatedAt = new Date().toISOString();
  configCache = normalized;
  cacheLoadedAt = Date.now();
  return normalized;
}

export async function getWorkflowConfig() {
  return loadWorkflowConfig();
}

export async function updateWorkflowConfig(nextConfig) {
  const normalized = normalizeWorkflowConfig(nextConfig);
  normalized.updatedAt = new Date().toISOString();
  await writeKey(CONFIG_KEY, normalized);
  configCache = normalized;
  cacheLoadedAt = Date.now();
  return normalized;
}

export function clearWorkflowConfigCache() {
  configCache = null;
  cacheLoadedAt = 0;
}

function resolvePath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((acc, segment) => {
    if (acc === undefined || acc === null) return undefined;
    return acc[segment];
  }, obj);
}

function renderTemplate(template, context) {
  if (typeof template === "string") {
    return template.replace(/{{\s*([^}]+)\s*}}/g, (_match, expr) => {
      const value = resolvePath(context, expr.trim());
      return value === undefined || value === null ? "" : String(value);
    });
  }
  if (Array.isArray(template)) return template.map((item) => renderTemplate(item, context));
  if (isPlainObject(template)) {
    const result = {};
    for (const [key, val] of Object.entries(template)) {
      result[key] = renderTemplate(val, context);
    }
    return result;
  }
  return template;
}

function payloadMatches(payload, criteria, extras = {}) {
  if (!criteria) return true;
  for (const [path, expected] of Object.entries(criteria)) {
    const actual = resolvePath({ payload, ...extras }, path.includes(".") ? path : `payload.${path}`);
    if (expected instanceof RegExp) {
      if (typeof actual !== "string" || !expected.test(actual)) return false;
      continue;
    }
    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
      continue;
    }
    if (actual !== expected) return false;
  }
  return true;
}

function buildRuleSummary(rule) {
  if (rule.type === "minInterval") {
    return `Wait ${rule.intervalDays} day(s) between ${rule.eventType} events per bureau.`;
  }
  if (rule.type === "requireRecentEvent") {
    return `Require ${rule.eventType} within ${rule.maxAgeDays} day(s).`;
  }
  return rule.description || "";
}

export function summarizeWorkflowConfig(config) {
  const operations = Object.entries(config.operations || {}).map(([operation, cfg]) => ({
    operation,
    name: cfg.name || operation,
    description: cfg.description || "",
    rules: (cfg.rules || []).map((rule) => ({
      id: rule.id,
      type: rule.type,
      description: rule.description || buildRuleSummary(rule),
      enforcement: rule.enforcement,
      intervalDays: rule.intervalDays,
      maxAgeDays: rule.maxAgeDays,
    })),
  }));

  const events = Object.entries(config.events || {}).map(([eventType, cfg]) => ({
    eventType,
    name: cfg.name || eventType,
    description: cfg.description || "",
    actions: (cfg.actions || []).map((action) => ({
      id: action.id,
      type: action.type,
      eventType: action.eventType,
      waitDays: action.waitDays,
      waitHours: action.waitHours,
      waitMinutes: action.waitMinutes,
    })),
  }));

  return {
    version: config.version,
    updatedAt: config.updatedAt,
    operationCount: operations.length,
    eventCount: events.length,
    operations,
    events,
  };
}

function computeWaitMs(action) {
  const minutes = Number(action.waitMinutes);
  if (Number.isFinite(minutes) && minutes > 0) return minutes * 60 * 1000;
  const hours = Number(action.waitHours);
  if (Number.isFinite(hours) && hours > 0) return hours * 60 * 60 * 1000;
  const days = Number(action.waitDays);
  if (Number.isFinite(days) && days > 0) return days * DAY_MS;
  return 7 * DAY_MS;
}

function buildTemplateContext(baseContext, action) {
  return {
    ...baseContext,
    action,
    nowIso: baseContext.now.toISOString(),
  };
}

async function executeAction(action, context) {
  const { consumerId } = context;
  if (action.type === "scheduleReminder") {
    const waitMs = computeWaitMs(action);
    const due = new Date(context.now.getTime() + waitMs).toISOString();
    const payload = renderTemplate(action.payloadTemplate ?? {}, buildTemplateContext(context, action));
    await addReminder(consumerId, {
      id: `wf_${action.id}_${nanoid(6)}`,
      due,
      payload: {
        ...payload,
        workflowActionId: action.id,
        workflowEventType: context.event.type,
      },
    });
    logInfo("WORKFLOW_REMINDER_SCHEDULED", "Workflow reminder scheduled", {
      consumerId,
      actionId: action.id,
      due,
    });
    return;
  }

  if (action.type === "createEvent") {
    const payload = renderTemplate(action.payloadTemplate ?? {}, buildTemplateContext(context, action));
    const finalPayload = {
      ...payload,
      __workflowGenerated: true,
      workflowActionId: action.id,
      workflowEventType: context.event.type,
    };
    await addEvent(consumerId, action.eventType || "workflow_notification", finalPayload);
    logInfo("WORKFLOW_EVENT_CREATED", "Workflow event emitted", {
      consumerId,
      actionId: action.id,
      eventType: action.eventType || "workflow_notification",
    });
    return;
  }

  if (action.type === "webhook" && action.url) {
    try {
      await fetch(action.url, {
        method: action.method || "POST",
        headers: {
          "Content-Type": "application/json",
          ...(action.headers || {}),
        },
        body: JSON.stringify({
          consumerId,
          event: context.event,
          actionId: action.id,
        }),
      });
      logInfo("WORKFLOW_WEBHOOK_SENT", "Workflow webhook dispatched", {
        consumerId,
        url: action.url,
      });
    } catch (err) {
      logWarn("WORKFLOW_WEBHOOK_FAILED", err?.message || "Webhook failed", {
        consumerId,
        url: action.url,
      });
    }
  }
}

function buildBlockedEntry({ bureau, lastAt, nextAllowedAt, remainingMs }) {
  return {
    bureau,
    lastEventAt: new Date(lastAt).toISOString(),
    nextAllowedAt: new Date(nextAllowedAt).toISOString(),
    remainingDays: Math.ceil(remainingMs / DAY_MS),
    remainingMs,
  };
}

async function evaluateMinInterval(rule, context) {
  const bureaus = Array.isArray(context.bureaus) ? context.bureaus : [];
  if (!bureaus.length) return { ok: true };
  const consumerState = context.consumerState;
  if (!consumerState || !Array.isArray(consumerState.events)) return { ok: true };
  const intervalDays = Number(rule.intervalDays);
  if (!intervalDays || intervalDays <= 0) return { ok: true };
  const intervalMs = intervalDays * DAY_MS;
  const nowMs = context.now.getTime();
  const events = consumerState.events;
  const blocked = [];
  for (const bureauRaw of bureaus) {
    const bureau = canonicalBureauName(bureauRaw) || bureauRaw;
    let recent = null;
    for (const ev of events) {
      if (ev.type !== rule.eventType) continue;
      const eventBureaus = Array.isArray(ev.payload?.bureaus)
        ? ev.payload.bureaus.map((b) => canonicalBureauName(b) || b)
        : [];
      if (eventBureaus.length && !eventBureaus.includes(bureau)) continue;
      if (!payloadMatches(ev.payload || {}, rule.match, { bureau, event: ev })) continue;
      recent = ev;
      break;
    }
    if (!recent) continue;
    const lastAt = Date.parse(recent.at);
    if (!Number.isFinite(lastAt)) continue;
    const diff = nowMs - lastAt;
    if (diff < intervalMs) {
      blocked.push(
        buildBlockedEntry({
          bureau,
          lastAt,
          nextAllowedAt: lastAt + intervalMs,
          remainingMs: intervalMs - diff,
        })
      );
    }
  }
  if (!blocked.length) return { ok: true };
  const message = renderTemplate(rule.onFail?.message ?? "Dispute cadence blocked by workflow rule.", {
    ...context,
    blocked,
    first: blocked[0],
    intervalDays,
  });
  return {
    ok: false,
    block: rule.enforcement !== "warn",
    message,
    metadata: { blocked, intervalDays, eventType: rule.eventType },
  };
}

async function evaluateRequireRecentEvent(rule, context) {
  const consumerState = context.consumerState;
  if (!consumerState || !Array.isArray(consumerState.events)) return { ok: true };
  const windowDays = Number(rule.maxAgeDays);
  if (!windowDays || windowDays <= 0) return { ok: true };
  const windowMs = windowDays * DAY_MS;
  const nowMs = context.now.getTime();
  let recent = null;
  for (const ev of consumerState.events) {
    if (ev.type !== rule.eventType) continue;
    if (!payloadMatches(ev.payload || {}, rule.match)) continue;
    recent = ev;
    break;
  }
  if (!recent) {
    const message = renderTemplate(rule.onFail?.message ?? "Required validation event missing.", {
      ...context,
      lastEventAt: null,
      windowDays,
    });
    return {
      ok: false,
      block: rule.enforcement !== "warn",
      message,
      metadata: { lastEventAt: null, maxAgeDays: windowDays },
    };
  }
  const lastAt = Date.parse(recent.at);
  if (!Number.isFinite(lastAt)) {
    return {
      ok: false,
      block: rule.enforcement !== "warn",
      message: "Validation event timestamp invalid.",
      metadata: { lastEventAt: recent.at, maxAgeDays: windowDays },
    };
  }
  if (nowMs - lastAt <= windowMs) {
    return {
      ok: true,
      metadata: { lastEventAt: recent.at, maxAgeDays: windowDays },
    };
  }
  const message = renderTemplate(rule.onFail?.message ?? "Validation event is stale.", {
    ...context,
    lastEventAt: recent.at,
    overdueDays: Math.ceil((nowMs - lastAt - windowMs) / DAY_MS),
    windowDays,
  });
  return {
    ok: false,
    block: rule.enforcement !== "warn",
    message,
    metadata: { lastEventAt: recent.at, maxAgeDays: windowDays },
  };
}

async function evaluateRule(rule, context) {
  if (rule.type === "minInterval") {
    return evaluateMinInterval(rule, context);
  }
  if (rule.type === "requireRecentEvent") {
    return evaluateRequireRecentEvent(rule, context);
  }
  return { ok: true };
}

export async function validateWorkflowOperation(operation, context = {}) {
  const config = await loadWorkflowConfig();
  const opConfig = config.operations?.[operation];
  if (!opConfig) return { ok: true, results: [] };
  if (!context.consumerId) return { ok: true, results: [] };
  const consumerState = context.consumerState || (await listConsumerState(context.consumerId));
  const evaluationContext = {
    ...context,
    consumerState,
    config,
    now: context.now ? new Date(context.now) : new Date(),
  };
  const defaultEnforcement = process.env.NODE_ENV !== "test";
  const enforce = context?.forceEnforce ?? defaultEnforcement;
  const results = [];
  let allowed = true;
  for (const rule of opConfig.rules || []) {
    try {
      const result = await evaluateRule(rule, evaluationContext);
      const blockedRaw = result.block ?? (rule.enforcement !== "warn" && !result.ok);
      const shouldBlock = blockedRaw && enforce;
      if (!result.ok && shouldBlock) {
        allowed = false;
      }
      const level = result.ok
        ? "ok"
        : rule.enforcement === "warn" || !enforce
          ? "warn"
          : "error";
      results.push({
        ruleId: rule.id,
        ok: !!result.ok,
        message: result.message || "",
        level,
        metadata: result.metadata || null,
      });
    } catch (err) {
      if (enforce) {
        allowed = false;
      }
      results.push({
        ruleId: rule.id,
        ok: false,
        message: err?.message || "Rule evaluation failed",
        level: enforce ? "error" : "warn",
        metadata: { error: true },
      });
    }
  }
  return { ok: allowed, results };
}

export function initWorkflowEngine() {
  if (initialized) return loadWorkflowConfig();
  initialized = true;
  registerStateEventListener(async ({ consumerId, event }) => {
    if (!event?.type) return;
    if (event?.payload?.__workflowGenerated) return;
    try {
      const config = await loadWorkflowConfig();
      const eventConfig = config.events?.[event.type];
      if (!eventConfig || !eventConfig.actions?.length) return;
      const consumerState = await listConsumerState(consumerId);
      const context = {
        consumerId,
        event,
        consumerState,
        config,
        now: new Date(),
      };
      for (const action of eventConfig.actions) {
        try {
          await executeAction(action, context);
        } catch (err) {
          logWarn("WORKFLOW_ACTION_FAILED", err?.message || "Action failed", {
            consumerId,
            actionId: action.id,
            eventType: event.type,
          });
        }
      }
    } catch (err) {
      logWarn("WORKFLOW_EVENT_HANDLER_FAILED", err?.message || "Workflow handler failed", {
        consumerId,
        eventType: event?.type,
      });
    }
  });
  return loadWorkflowConfig();
}

export { canonicalBureauName };
