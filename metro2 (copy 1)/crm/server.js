// server.js
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import multer from "multer";
import { nanoid } from "nanoid";
import { htmlToPdfBuffer, launchBrowser } from "./pdfUtils.js";
import crypto from "crypto";
import os from "os";
import archiver from "archiver";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { PassThrough } from "stream";
import { JSDOM } from "jsdom";


import { logInfo, logError, logWarn } from "./logger.js";

import { readKey, writeKey } from "./kvdb.js";
import { sendCertifiedMail } from "./simpleCertifiedMail.js";
import { listEvents as listCalendarEvents, createEvent as createCalendarEvent, updateEvent as updateCalendarEvent, deleteEvent as deleteCalendarEvent, freeBusy as calendarFreeBusy, clearCalendarCache } from "./googleCalendar.js";

import { fetchFn } from "./fetchUtil.js";
import { scrapeTradelines } from "./tradelineScraper.js";
import {
  groupTradelinesByPrice,
  buildRangeSummary,
  listBanks,
  getBucketMeta,
  paginate,
} from "./tradelineBuckets.js";
import marketingRoutes from "./marketingRoutes.js";
import { prepareNegativeItems } from "../../shared/lib/format/negativeItems.js";
import { enforceTenantQuota, sanitizeTenantId, DEFAULT_TENANT_ID, resolveTenantId } from "./tenantLimits.js";
import {
  listTeamRoles,
  getTeamRolePreset,
  DEFAULT_TEAM_ROLE_ID,
} from "./teamRoles.js";
import { getDashboardConfig, updateDashboardConfig } from "./dashboardConfig.js";
import {
  initWorkflowEngine,
  validateWorkflowOperation,
  getWorkflowConfig,
  updateWorkflowConfig,
  summarizeWorkflowConfig,
  canonicalBureauName,
} from "./workflowEngine.js";
import { withTenantContext, getCurrentTenantId } from "./tenantContext.js";
import { spawnPythonProcess } from "./pythonEnv.js";
import { enqueueJob, registerJobProcessor, isQueueEnabled, checkRedisHealth } from "./jobQueue.js";
import { buildRuleDebugReport } from "./ruleDebugGenerator.js";
import {
  addTradelineKeysToCanonicalReport,
  auditCanonicalReport,
  collectTradelineKeys,
} from "./backend/services/llmAudit.js";
import { CANONICAL_REPORT_SCHEMA } from "./backend/services/llmSchemas.js";

const MAX_ENV_KEY_LENGTH = 64;
const DATA_REGION_EXPERIMENT_KEY = "portal-data-region";


const DEFAULT_MEMBER_PERMISSIONS = ["consumers", "contacts", "tasks", "reports"];

const CLIENT_PORTAL_MODULE_KEYS = Object.freeze([
  "creditScore",
  "negativeItems",
  "reportSnapshot",
  "milestones",
  "team",
  "news",
  "debtCalc",
  "messages",
  "education",
  "documents",
  "mail",
  "payments",
  "uploads",
]);

const DEFAULT_CLIENT_PORTAL_THEME = Object.freeze({
  backgroundColor: "",
  logoUrl: "",
  taglinePrimary: "Track disputes, uploads, and approvals in one place.",
  taglineSecondary: "Sigue tus disputas, cargas y aprobaciones en un solo lugar.",
});

const DEFAULT_CLIENT_PORTAL_MODULES = Object.freeze(
  CLIENT_PORTAL_MODULE_KEYS.reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {})
);

const DEFAULT_HOTKEYS = Object.freeze({
  help: "h",
  newConsumer: "n",
  newClient: "n",
  newLead: "l",
  upload: "u",
  editConsumer: "e",
  generate: "g",
  remove: "r",
  modeBreach: "d",
  modeAssault: "s",
  modeIdentity: "i",
});

const KNOWN_HOTKEY_KEYS = new Set(Object.keys(DEFAULT_HOTKEYS));

function cloneDefaultClientPortalSettings() {
  return {
    theme: { ...DEFAULT_CLIENT_PORTAL_THEME },
    modules: { ...DEFAULT_CLIENT_PORTAL_MODULES },
  };
}

const DEFAULT_SETTINGS = {
  hibpApiKey: "",
  rssFeedUrl: "https://hnrss.org/frontpage",
  googleCalendarToken: "",
  googleCalendarId: "",
  stripeApiKey: "",
  marketingApiBaseUrl: "",
  marketingApiKey: "",
  sendCertifiedMailApiKey: "",
  gmailClientId: "",
  gmailClientSecret: "",
  gmailRefreshToken: "",
  envOverrides: {},
  clientPortal: cloneDefaultClientPortalSettings(),
  hotkeys: {},
};

const STRING_SETTING_KEYS = [
  "hibpApiKey",
  "rssFeedUrl",
  "googleCalendarToken",
  "googleCalendarId",
  "stripeApiKey",
  "marketingApiBaseUrl",
  "marketingApiKey",
  "sendCertifiedMailApiKey",
  "gmailClientId",
  "gmailClientSecret",
  "gmailRefreshToken"
];

function resolveRequestTenant(req, fallback = DEFAULT_TENANT_ID) {
  if (!req) return fallback;
  return resolveTenantId(req, fallback);
}

function tenantScope(input, fallback = DEFAULT_TENANT_ID) {
  if (!input) return { tenantId: fallback };
  if (typeof input === "string") {
    return { tenantId: sanitizeTenantId(input, fallback) };
  }
  if (input?.tenantId) {
    return { tenantId: sanitizeTenantId(input.tenantId, fallback) };
  }
  return { tenantId: resolveRequestTenant(input, fallback) };
}

function resolveTenantContextInput(context) {
  if (context === undefined || context === null) {
    const current = getCurrentTenantId();
    if (current) return current;
    return DEFAULT_TENANT_ID;
  }
  return context;
}

function sanitizeSettingString(value = "") {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

initWorkflowEngine().catch((err) => {
  logWarn("WORKFLOW_INIT_FAILED", err?.message || "Workflow engine init failed");
});

const MAX_TRADLINE_PAGE_SIZE = 500;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

const JOB_TYPES = Object.freeze({
  LETTERS_GENERATE: "letters:generate",
  LETTERS_PDF: "letters:pdf",
  REPORTS_AUDIT: "reports:audit",
});

const ALL_BUREAUS = Object.freeze(["TransUnion", "Experian", "Equifax"]);

function collectRequestedBureaus({ selections = [], personalInfo = [], inquiries = [] }) {
  const set = new Set();
  for (const sel of selections) {
    if (!sel) continue;
    if (Array.isArray(sel.bureaus)) {
      for (const bureau of sel.bureaus) {
        const canonical = canonicalBureauName(bureau);
        if (canonical) set.add(canonical);
      }
    }
  }
  if (Array.isArray(personalInfo) && personalInfo.length) {
    for (const bureau of ALL_BUREAUS) {
      set.add(bureau);
    }
  }
  if (Array.isArray(inquiries)) {
    for (const inq of inquiries) {
      const canonical = canonicalBureauName(inq?.bureau);
      if (canonical) set.add(canonical);
    }
  }
  return Array.from(set);
}

const INTEGRATION_SETTING_TO_ENV = {
  hibpApiKey: "HIBP_API_KEY",
  marketingApiBaseUrl: "MARKETING_API_BASE_URL",
  marketingApiKey: "MARKETING_API_KEY",
  sendCertifiedMailApiKey: "SCM_API_KEY",
  gmailClientId: "GMAIL_CLIENT_ID",
  gmailClientSecret: "GMAIL_CLIENT_SECRET",
  gmailRefreshToken: "GMAIL_REFRESH_TOKEN",
  stripeApiKey: "STRIPE_API_KEY",
};

function normalizeEnvOverrides(raw){
  const result = {};
  if(!raw) return result;
  const entries = Array.isArray(raw)
    ? raw
    : Object.entries(raw).map(([key, value]) => ({ key, value }));
  for(const entry of entries){
    if(!entry) continue;
    let key = (entry.key ?? entry.name ?? "").toString().trim();
    if(!key) continue;
    key = key.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    if(key && !/^[A-Z_]/.test(key)){
      key = `VAR_${key}`;
    }
    key = key.replace(/^[^A-Z_]+/, "").slice(0, MAX_ENV_KEY_LENGTH);
    if(!key) continue;

    const value = (entry.value ?? entry.val ?? "").toString();
    result[key.toUpperCase()] = value;
  }
  return result;
}

function normalizeHotkeySettings(raw) {
  if (!raw || typeof raw !== "object") return {};
  const overrides = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key) continue;
    const normalizedKey = key.toString().trim();
    if (!normalizedKey) continue;
    const normalizedValue = sanitizeSettingString(value).toLowerCase().slice(0, 1);
    if (!normalizedValue) continue;
    if (KNOWN_HOTKEY_KEYS.has(normalizedKey) && DEFAULT_HOTKEYS[normalizedKey] === normalizedValue) {
      continue;
    }
    overrides[normalizedKey] = normalizedValue;
  }
  return overrides;
}

function sanitizePortalBackground(value = "") {
  const cleaned = sanitizeSettingString(value).toLowerCase();
  if (!cleaned) return "";
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(cleaned)) return cleaned;
  if (/^[a-z]{2,32}$/i.test(cleaned)) return cleaned;
  return "";
}

function sanitizePortalUrl(value = "") {
  const cleaned = sanitizeSettingString(value);
  if (!cleaned) return "";
  if (cleaned.startsWith("/")) return cleaned;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  return "";
}

function sanitizePortalTagline(value = "") {
  return sanitizeSettingString(value).slice(0, 160);
}

function normalizePortalModuleValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (["false", "0", "off", "no", "disabled", "legacy"].includes(normalized)) return false;
    if (["true", "1", "on", "yes", "enabled"].includes(normalized)) return true;
  }
  return Boolean(value);
}

function normalizeClientPortalSettings(raw = {}) {
  const defaults = cloneDefaultClientPortalSettings();
  const themeSource = raw && typeof raw.theme === "object" ? raw.theme : raw;
  defaults.theme.backgroundColor = sanitizePortalBackground(
    themeSource?.backgroundColor ?? themeSource?.bgColor ?? defaults.theme.backgroundColor
  );
  defaults.theme.logoUrl = sanitizePortalUrl(themeSource?.logoUrl ?? defaults.theme.logoUrl);
  defaults.theme.taglinePrimary = sanitizePortalTagline(
    themeSource?.taglinePrimary ?? themeSource?.tagline ?? defaults.theme.taglinePrimary
  );
  defaults.theme.taglineSecondary = sanitizePortalTagline(
    themeSource?.taglineSecondary ?? defaults.theme.taglineSecondary
  );

  const moduleSource = raw && typeof raw.modules === "object" ? raw.modules : raw;
  for (const key of CLIENT_PORTAL_MODULE_KEYS) {
    if (moduleSource && Object.prototype.hasOwnProperty.call(moduleSource, key)) {
      defaults.modules[key] = normalizePortalModuleValue(moduleSource[key]);
    }
  }

  return defaults;
}

function exportClientPortalSettings(settings = {}) {
  const normalized = normalizeClientPortalSettings(settings);
  return {
    theme: { ...normalized.theme },
    modules: { ...normalized.modules },
  };
}

function applyEnvOverrides(overrides = {}){
  for(const [key, value] of Object.entries(overrides)){
    process.env[key] = value;
  }
}

function applyEnvFallbacks(settings = {}){
  const result = { ...settings };
  for (const [settingKey, envKey] of Object.entries(INTEGRATION_SETTING_TO_ENV)) {
    const current = sanitizeSettingString(result[settingKey]);
    if (current) continue;
    const envValue = sanitizeSettingString(process.env[envKey]);
    if (envValue) {
      result[settingKey] = envValue;
    }
  }
  return result;
}

function normalizeSettings(raw){
  const base = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  base.envOverrides = normalizeEnvOverrides((raw && raw.envOverrides) ?? base.envOverrides);
  base.clientPortal = normalizeClientPortalSettings((raw && raw.clientPortal) ?? base.clientPortal ?? {});
  base.hotkeys = normalizeHotkeySettings((raw && raw.hotkeys) ?? base.hotkeys ?? {});
  for (const key of STRING_SETTING_KEYS) {
    base[key] = sanitizeSettingString(base[key]);
  }
  return base;
}

function applyIntegrationSettings(settings = {}) {
  for (const [settingKey, envKey] of Object.entries(INTEGRATION_SETTING_TO_ENV)) {
    if (!(settingKey in settings)) continue;
    const value = sanitizeSettingString(settings[settingKey]);
    if (!value) continue;
    process.env[envKey] = value;
  }
}

function getJwtSecret(){
  return process.env.JWT_SECRET || "dev-secret";
}

const TOKEN_EXPIRES_IN = "1h";

function generateToken(user){
  return jwt.sign({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId || DEFAULT_TENANT_ID,
    permissions: user.permissions || [],
  }, getJwtSecret(), { expiresIn: TOKEN_EXPIRES_IN });
}

function buildPortalSnapshot(items = []){
  if(!Array.isArray(items) || !items.length){
    return { totalIssues: 0, summary: [] };
  }
  const summary = items
    .map(item => ({
      creditor: item?.creditor || "Unknown Creditor",
      severity: Number.isFinite(item?.severity) ? item.severity : 0,
      bureaus: Array.isArray(item?.bureaus) ? item.bureaus : [],
      issues: Array.isArray(item?.violations) ? item.violations.length : 0,
    }))
    .sort((a,b)=>{
      const severityDelta = (b.severity || 0) - (a.severity || 0);
      if(severityDelta !== 0) return severityDelta;
      return (a.creditor || "").localeCompare(b.creditor || "");
    })
    .slice(0,5);
  const totalIssues = items.reduce((sum, item)=>{
    const count = Array.isArray(item?.violations) ? item.violations.length : 0;
    return sum + count;
  }, 0);
  return { totalIssues, summary };
}

function safeIsoString(value){
  if(!value) return null;
  const ts = Date.parse(value);
  if(!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

function sanitizePortalEvent(event){
  if(!event || typeof event !== "object") return null;
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  const textFields = [payload.title, payload.text, payload.message, payload.note, payload.description]
    .map(val => (typeof val === "string" ? val.trim() : ""))
    .filter(Boolean);
  const rawMessage = textFields[0] || null;
  const truncatedMessage = rawMessage ? rawMessage.slice(0, 280) : null;
  const actor = typeof payload.from === "string"
    ? payload.from
    : typeof payload.author === "string"
      ? payload.author
      : null;
  const stage = typeof payload.stage === "string" ? payload.stage : null;
  const link = typeof payload.url === "string"
    ? payload.url
    : typeof payload.file === "string"
      ? payload.file
      : null;
  return {
    id: (event.id || nanoid(8)).toString(),
    type: (event.type || "update").toString(),
    at: safeIsoString(event.at) || new Date().toISOString(),
    actor,
    title: typeof payload.title === "string" ? payload.title : null,
    message: truncatedMessage,
    stage,
    link,
  };
}

function sanitizePortalDocument(file, consumerId){
  if(!file || typeof file !== "object") return null;
  const id = (file.id || file.storedName || nanoid(8)).toString();
  const label = [file.originalName, file.name, file.filename]
    .map(value => (typeof value === "string" ? value.trim() : ""))
    .find(Boolean);
  const sizeValue = Number.parseInt(file.size, 10);
  const size = Number.isFinite(sizeValue) ? sizeValue : null;
  const storedName = typeof file.storedName === "string" ? file.storedName : null;
  const url = typeof file.url === "string"
    ? file.url
    : storedName
      ? `/api/consumers/${consumerId}/state/files/${storedName}`
      : null;
  return {
    id,
    name: label || `Document ${id.slice(-4)}`,
    uploadedAt: safeIsoString(file.uploadedAt),
    type: typeof file.type === "string" ? file.type : null,
    size,
    url,
  };
}

function sanitizePortalReminder(reminder){
  if(!reminder || typeof reminder !== "object") return null;
  const payload = reminder.payload && typeof reminder.payload === "object" ? reminder.payload : {};
  return {
    id: (reminder.id || nanoid(8)).toString(),
    due: safeIsoString(reminder.due),
    title: typeof reminder.title === "string"
      ? reminder.title
      : typeof payload.title === "string"
        ? payload.title
        : typeof payload.name === "string"
          ? payload.name
          : null,
    note: typeof payload.note === "string" ? payload.note : null,
  };
}

function sanitizePortalInvoice(invoice){
  if(!invoice || typeof invoice !== "object") return null;
  const amount = roundCurrency(coerceAmount(invoice.amount));
  const due = safeIsoString(invoice.due);
  const createdAt = safeIsoString(invoice.createdAt);
  const paidAt = safeIsoString(invoice.paidAt);
  const status = invoice.paid
    ? "paid"
    : due && Date.parse(due) < Date.now()
      ? "past_due"
      : "open";
  return {
    id: (invoice.id || nanoid(8)).toString(),
    description: (invoice.desc || invoice.description || "Invoice").toString(),
    amount,
    amountFormatted: formatUsd(amount),
    due,
    createdAt,
    paid: Boolean(invoice.paid),
    paidAt,
    status,
    payLink: typeof invoice.payLink === "string" ? invoice.payLink : null,
  };
}

function portalInvoiceTimestamp(invoice){
  if(!invoice || typeof invoice !== "object") return 0;
  const candidates = [invoice.updatedAt, invoice.createdAt, invoice.due];
  for (const candidate of candidates){
    const iso = safeIsoString(candidate);
    if(!iso) continue;
    const ts = Date.parse(iso);
    if(Number.isFinite(ts)) return ts;
  }
  return 0;
}

async function buildClientPortalPayload(consumer){
  if(!consumer) return null;
  const latestReport = consumer.reports?.[0];
  let negativeItems = [];
  if(latestReport?.data){
    if(Array.isArray(latestReport.data.negative_items)){
      negativeItems = latestReport.data.negative_items;
    } else if(Array.isArray(latestReport.data.tradelines)){
      try {
        const { items } = prepareNegativeItems(latestReport.data.tradelines, {
          inquiries: latestReport.data.inquiries,
          inquirySummary: latestReport.data.inquiry_summary,
          personalInfo:
            latestReport.data.personalInfo ||
            latestReport.data.personal_information ||
            latestReport.data.personal_info,
          personalInfoMismatches:
            latestReport.data.personalInfoMismatches ||
            latestReport.data.personal_info_mismatches,
        }, { includeLegacyRules: LEGACY_ANALYZERS_ENABLED });
        negativeItems = items;
      } catch (err) {
        logError('NEGATIVE_ITEM_ERROR', 'Failed to prepare portal negative items', err, { consumerId: consumer.id, reportId: latestReport.id });
      }
    }
  }

  const [settings, consumerState, tracker, invoicesDb] = await Promise.all([
    loadSettings(),
    listConsumerState(consumer.id).catch(() => ({ events: [], files: [], reminders: [], creditScore: null })),
    listTracker(consumer.id).catch(() => ({ steps: [], completed: {} })),
    loadInvoicesDB().catch(() => ({ invoices: [] })),
  ]);

  const portalSettings = exportClientPortalSettings(settings?.clientPortal);
  const events = Array.isArray(consumerState?.events)
    ? consumerState.events
        .slice(0, 50)
        .map(event => sanitizePortalEvent(event))
        .filter(Boolean)
    : [];
  const documents = Array.isArray(consumerState?.files)
    ? consumerState.files
        .slice(0, 40)
        .map(file => sanitizePortalDocument(file, consumer.id))
        .filter(Boolean)
    : [];
  const reminders = Array.isArray(consumerState?.reminders)
    ? consumerState.reminders
        .slice(0, 20)
        .map(reminder => sanitizePortalReminder(reminder))
        .filter(Boolean)
    : [];
  const invoices = Array.isArray(invoicesDb?.invoices)
    ? invoicesDb.invoices
        .filter(invoice => invoice?.consumerId === consumer.id)
        .sort((a, b) => portalInvoiceTimestamp(b) - portalInvoiceTimestamp(a))
        .slice(0, 20)
        .map(invoice => sanitizePortalInvoice(invoice))
        .filter(Boolean)
    : [];

  return {
    consumer: {
      id: consumer.id,
      name: consumer.name || 'Client',
      status: consumer.status || 'active',
      email: consumer.email || null,
      phone: consumer.phone || null,
      createdAt: safeIsoString(consumer.createdAt || consumer.enrolledAt),
    },
    creditScore:
      consumer.creditScore ||
      (consumerState && typeof consumerState === 'object' ? consumerState.creditScore : null) ||
      null,
    negativeItems,
    snapshot: buildPortalSnapshot(negativeItems),
    portalSettings,
    timeline: events,
    documents,
    reminders,
    tracker: {
      steps: Array.isArray(tracker?.steps)
        ? tracker.steps.map(step => (step == null ? null : step.toString())).filter(Boolean)
        : [],
      completed:
        tracker && typeof tracker.completed === 'object' && tracker.completed !== null
          ? tracker.completed
          : {},
    },
    invoices,
    messages: events
      .filter(event => event.type === 'message' && event.message)
      .map(event => ({ id: event.id, at: event.at, actor: event.actor, message: event.message })),
  };
}

function toInlineJson(data){
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}



import { generateLetters, generatePersonalInfoLetters, generateInquiryLetters, generateDebtCollectorLetters, modeCopy } from "./letterEngine.js";
import LETTER_TEMPLATES from "./letterTemplates.js";
import { loadPlaybooks } from "./playbook.js";
import { normalizeReport, renderHtml, savePdf } from "./creditAuditTool.js";
import {
  listConsumerState,
  addEvent,
  addFileMeta,
  consumerUploadsDir,
  addReminder,
  removeReminder,
  processAllReminders,
  listTracker,
  setTrackerSteps,
  markTrackerStep,
  getTrackerSteps,
  setCreditScore,
  listAllConsumerStates,

} from "./state.js";
function injectStyle(html, css){
  if(/<head[^>]*>/i.test(html)){
    return html.replace(/<\/head>/i, `<style>${css}</style></head>`);
  }
  return `<style>${css}</style>` + html;
}
async function generateOcrPdf(html){
  const noise = "iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAYAAAA7MK6iAAAAqElEQVR4nM1XSRKAMAjrO/n/Qzw5HpQlJNTm5EyRUBpDXeuBrRjZehteYpSwEm9o4u6uoffMeUaSjx1PFdsKiIjKRajVDhMr29UWW7b2q6ioYiQiYYm2wmsXYi6psajssFJIGDM+rRQem4mwXaTSRF45pp1J/sVQFwhW0SODItoRens5xqBcZCI58rpzQzaVFPFUwqjNmX9/5lXM4LGz7xRAER/xf0WRXElyH0vwJrWaAAAAAElFTkSuQmCC";
  const ocrCss = `
    .ocr{position:relative;}
    .ocr::before{
      content:"";
      position:absolute;
      inset:0;
      pointer-events:none;
      background-image:
        repeating-linear-gradient(0deg, rgba(100,100,100,0.15) 0, rgba(100,100,100,0.15) 1px, transparent 1px, transparent 32px),
        repeating-linear-gradient(90deg, rgba(100,100,100,0.15) 0, rgba(100,100,100,0.15) 1px, transparent 1px, transparent 32px),
        repeating-linear-gradient(45deg, rgba(120,120,120,0.35) 0, rgba(120,120,120,0.35) 4px, transparent 4px, transparent 200px),
        url('data:image/png;base64,${noise}');
      background-size:32px 32px,32px 32px,200px 200px,30px 30px;
    }`;
  const injected = injectStyle(html, ocrCss);
  return await htmlToPdfBuffer(injected);

}


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function buildDefaultSettings(){
  const withEnv = applyEnvFallbacks({ ...DEFAULT_SETTINGS });
  return normalizeSettings(withEnv);
}

async function loadSettings(context){
  const scope = tenantScope(resolveTenantContextInput(context));
  const raw = await readKey('settings', null, scope);
  if(raw){
    const settings = normalizeSettings(raw);
    applyIntegrationSettings(settings);
    applyEnvOverrides(settings.envOverrides);
    return settings;
  }
  const defaults = buildDefaultSettings();
  await writeKey('settings', defaults, scope);
  applyIntegrationSettings(defaults);
  applyEnvOverrides(defaults.envOverrides);
  return defaults;
}

async function saveSettings(data, context){
  const scope = tenantScope(resolveTenantContextInput(context));
  const current = await readKey('settings', null, scope);
  const merged = normalizeSettings({ ...(current || {}), ...(data || {}) });
  await writeKey('settings', merged, scope);
  applyIntegrationSettings(merged);
  applyEnvOverrides(merged.envOverrides);
  return merged;
}


try {
  await loadSettings(DEFAULT_TENANT_ID);
} catch (err) {
  logError('SETTINGS_INIT_FAILED', 'Failed to hydrate settings on startup', err);
}

const require = createRequire(import.meta.url);
const zipcodes = require("zipcodes");

function normalizeZip(value){
  if(value === undefined || value === null) return "";
  const digits = String(value).match(/\d/g);
  if(!digits || digits.length === 0) return "";
  return digits.join("").slice(0, 5);
}

function addressSignature(entity){
  if(!entity) return "";
  const parts = [entity.addr1, entity.addr2, entity.city, entity.state, entity.zip]
    .map(part => (part ?? "").toString().trim().toLowerCase())
    .filter(Boolean);
  return parts.join("|");
}

function resolveGeoFromZip(zip){
  if(!zip) return null;
  try {
    const record = zipcodes.lookup(zip);
    if(!record) return null;
    const lat = Number(record.latitude);
    const lon = Number(record.longitude);
    if(!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      lat,
      lon,
      city: record.city || "",
      state: record.state || "",
      precision: "zip",
      source: "us-zip-centroid",
    };
  } catch (err) {
    logWarn("ZIP_LOOKUP_FAILED", err?.message || String(err));
    return null;
  }
}

function resolveGeoFromCityState(city, state){
  const c = (city || "").toString().trim();
  const s = (state || "").toString().trim();
  if(!c || !s) return null;
  try {
    const matches = zipcodes.lookupByName(c, s) || [];
    const record = matches.find(entry => entry && entry.latitude !== undefined && entry.longitude !== undefined) || matches[0];
    if(!record) return null;
    const lat = Number(record.latitude);
    const lon = Number(record.longitude);
    if(!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      lat,
      lon,
      city: record.city || c,
      state: record.state || s,
      precision: "city",
      source: "us-city-centroid",
    };
  } catch (err) {
    logWarn("CITY_LOOKUP_FAILED", err?.message || String(err));
    return null;
  }
}

function calculateConsumerGeo(consumer){
  if(!consumer) return null;
  const zip = normalizeZip(consumer.zip);
  let result = resolveGeoFromZip(zip);
  if(result) return result;
  result = resolveGeoFromCityState(consumer.city, consumer.state);
  if(result) return result;
  return null;
}

function applyGeoToConsumer(consumer, { lat, lon, precision, source } = {}){
  if(!consumer) return false;
  if(Number.isFinite(lat) && Number.isFinite(lon)){
    consumer.geo_lat = Number(lat);
    consumer.geo_lon = Number(lon);
    consumer.geo_precision = precision || "zip";
    consumer.geo_source = source || "us-zip-centroid";
  } else {
    consumer.geo_lat = null;
    consumer.geo_lon = null;
    consumer.geo_precision = null;
    consumer.geo_source = null;
  }
  consumer.geo_country = consumer.geo_country || "US";
  consumer.geo_updated_at = new Date().toISOString();
  consumer.geo_signature = addressSignature(consumer);
  return Number.isFinite(consumer.geo_lat) && Number.isFinite(consumer.geo_lon);
}

function refreshConsumerGeo(consumer, { force = false } = {}){
  if(!consumer) return false;
  const signature = addressSignature(consumer);
  if(!signature){
    consumer.geo_signature = "";
    consumer.geo_lat = null;
    consumer.geo_lon = null;
    consumer.geo_precision = null;
    consumer.geo_source = null;
    consumer.geo_updated_at = new Date().toISOString();
    return false;
  }
  const hasCurrentGeo = Number.isFinite(Number(consumer.geo_lat)) && Number.isFinite(Number(consumer.geo_lon));
  if(!force && hasCurrentGeo && consumer.geo_signature === signature){
    return false;
  }
  const geo = calculateConsumerGeo(consumer);
  return applyGeoToConsumer(consumer, geo || {});
}
let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch (e) {
  console.warn("Nodemailer not installed");
}
let StripeLib = null;
try {
  StripeLib = require("stripe");
} catch (e) {
  console.warn("Stripe not installed");
}

let stripeClientCache = { key: null, tenantId: null, client: null };

async function getStripeClient(context){
  const tenantId = tenantScope(resolveTenantContextInput(context)).tenantId;
  if(!StripeLib) return null;
  let apiKey = (process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || process.env.STRIPE_PRIVATE_KEY || "").trim();
  if(!apiKey){
    try {
      const settings = await loadSettings(tenantId);
      apiKey = (settings?.stripeApiKey || "").trim();
    } catch (err) {
      logError("STRIPE_SETTINGS_LOAD_FAILED", "Unable to read settings for Stripe", err);
    }
  }
  if(!apiKey) return null;
  if(stripeClientCache.client && stripeClientCache.key === apiKey && stripeClientCache.tenantId === tenantId){
    return stripeClientCache.client;
  }
  try {
    const client = new StripeLib(apiKey, { apiVersion: "2023-10-16" });
    stripeClientCache = { key: apiKey, tenantId, client };
    return client;
  } catch (err) {
    logError("STRIPE_CLIENT_INIT_FAILED", "Failed to initialise Stripe client", err);
    stripeClientCache = { key: null, tenantId: null, client: null };
    return null;
  }
}

function resolvePortalBase(req){
  const configured = (process.env.CLIENT_PORTAL_BASE_URL || process.env.PORTAL_BASE_URL || process.env.PORTAL_PAYMENT_BASE || process.env.PUBLIC_BASE_URL || "").trim();
  if(configured) return configured.replace(/\/$/, "");
  try {
    const origin = req?.get?.("origin");
    if(origin) return origin.replace(/\/$/, "");
  } catch {}
  try {
    const host = req?.get?.("host");
    if(host){
      const protocol = req?.protocol || "https";
      return `${protocol}://${host}`.replace(/\/$/, "");
    }
  } catch {}
  return "https://pay.example.com";
}

function formatStripeUrl(template, invoice){
  if(!template) return template;
  return template
    .replace(/\{CHECKOUT_SESSION_ID\}/g, "{CHECKOUT_SESSION_ID}")
    .replace(/\{INVOICE_ID\}/g, encodeURIComponent(invoice?.id || ""))
    .replace(/\{CONSUMER_ID\}/g, encodeURIComponent(invoice?.consumerId || ""));
}

function resolveStripeRedirectUrls(invoice, req){
  const successTemplate = (process.env.STRIPE_SUCCESS_URL || "").trim();
  const cancelTemplate = (process.env.STRIPE_CANCEL_URL || "").trim();
  const base = resolvePortalBase(req);
  const successFallback = `${base}/portal/${encodeURIComponent(invoice.consumerId)}?paid=1&invoice=${encodeURIComponent(invoice.id)}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelFallback = `${base}/portal/${encodeURIComponent(invoice.consumerId)}?invoice=${encodeURIComponent(invoice.id)}&canceled=1`;
  return {
    success: formatStripeUrl(successTemplate || successFallback, invoice) || successFallback,
    cancel: formatStripeUrl(cancelTemplate || cancelFallback, invoice) || cancelFallback,
  };
}

function buildInvoicePayUrl(invoice, req){
  if(!invoice) return "";
  const base = resolvePortalBase(req);
  const safeId = encodeURIComponent(invoice.id || "");
  return `${base}/pay/${safeId}`;
}

async function createStripeCheckoutSession({ invoice, consumer = {}, company = {}, req, stripeClient = null } = {}){
  if(!invoice) return null;
  const stripe = stripeClient || await getStripeClient(req);
  if(!stripe) return null;
  const amount = Number(invoice.amount) || 0;
  const amountCents = Math.round(amount * 100);
  if(!stripe){
    await recordCheckoutStage({
      tenantId,
      invoiceId: invoice.id,
      stage: "client_missing",
      success: false,
      amountCents,
      metadata: { reason: "stripe_unconfigured" },
    });
    return null;
  }
  if(!Number.isFinite(amountCents) || amountCents <= 0) {
    await recordCheckoutStage({
      tenantId,
      invoiceId: invoice.id,
      stage: "non_billable",
      success: false,
      amountCents,
      metadata: { reason: "zero_amount" },
    });
    return null;
  }
  const { success, cancel } = resolveStripeRedirectUrls(invoice, req);
  const descriptor = (invoice.desc || `Invoice ${invoice.id || ""}`).toString().slice(0, 120) || "Invoice";
  const metadata = {
    invoiceId: invoice.id,
    consumerId: invoice.consumerId,
  };
  if(company?.name){
    metadata.companyName = company.name.toString().slice(0, 120);
  }
  const stripeMeta = stripeClientMeta.get(stripe) || { tenantId, cacheHit: !!stripeClient };
  await recordCheckoutStage({
    tenantId,
    invoiceId: invoice.id,
    stage: "session_requested",
    success: true,
    amountCents,
    metadata: {
      cacheHit: !!stripeMeta.cacheHit,
      reusedClient: !!stripeClient,
    },
  });
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      success_url: success,
      cancel_url: cancel,
      customer_email: consumer?.email || undefined,
      metadata,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: descriptor,
            },
          },
        },
      ],
    });
    await recordCheckoutStage({
      tenantId,
      invoiceId: invoice.id,
      stage: "session_created",
      success: true,
      sessionId: session.id,
      amountCents,
      metadata: {
        cacheHit: !!stripeMeta.cacheHit,
      },
    });
    return { url: session.url, sessionId: session.id };
  } catch (err) {
    logError("STRIPE_CHECKOUT_CREATE_FAILED", "Failed to create Stripe checkout session", err, { invoiceId: invoice.id });
    await recordCheckoutStage({
      tenantId,
      invoiceId: invoice.id,
      stage: "session_failed",
      success: false,
      amountCents,
      metadata: {
        cacheHit: !!stripeMeta.cacheHit,
        errorCode: err?.code || null,
      },
    });
    return null;
  }
}

const app = express();
app.use(express.json({ limit: "10mb" }));
let mailer = null;
if(nodemailer && process.env.SMTP_HOST){
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
}

// Basic request logging for debugging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} -> ${res.statusCode} ${ms}ms`);
  });
  next();
});

app.use((req, _res, next) => {
  const tenantId = resolveRequestTenant(req, DEFAULT_TENANT_ID);
  withTenantContext(tenantId, next);
});

app.get("/health/redis", async (_req, res) => {
  const result = await checkRedisHealth();
  if (result.ok) {
    return res.json({
      status: "ok",
      redis: "connected",
      latency_ms: result.latencyMs,
    });
  }
  return res.status(503).json({
    status: "error",
    redis: "unavailable",
    message: result.message || "Redis health check failed",
  });
});

const apiRequestLimiter = enforceTenantQuota("requests:minute", {
  limit: Number.isFinite(Number(process.env.TENANT_REQUESTS_PER_MINUTE)) ? Number(process.env.TENANT_REQUESTS_PER_MINUTE) : undefined,
  windowMs: Number.isFinite(Number(process.env.TENANT_REQUEST_WINDOW_MS)) ? Number(process.env.TENANT_REQUEST_WINDOW_MS) : undefined,
});

app.use("/api", async (req, res, next) => {
  try {
    if (!req.__authResolved) {
      const user = await getAuthUser(req);
      req.user = user || null;
      req.__authResolved = true;
      if (req.user?.tenantId) {
        const tenantId = sanitizeTenantId(req.user.tenantId, DEFAULT_TENANT_ID);
        return withTenantContext(tenantId, () => apiRequestLimiter(req, res, next));
      }
    }
    return apiRequestLimiter(req, res, next);
  } catch (err) {
    return next(err);
  }
});

process.on("unhandledRejection", err => {
  logError("UNHANDLED_REJECTION", "Unhandled promise rejection", err);
});
process.on("uncaughtException", err => {
  logError("UNCAUGHT_EXCEPTION", "Uncaught exception", err);
});
process.on("warning", warn => {
  logWarn("NODE_WARNING", warn.message, { stack: warn.stack });
});

async function getAuthUser(req){
  let auth = req.headers.authorization || "";
  if(!auth && req.query && req.query.token){
    auth = `Bearer ${req.query.token}`;
  }
  const db = await loadUsersDB();
  if(auth.startsWith("Bearer ")){
    try{
      const payload = jwt.verify(auth.slice(7), getJwtSecret());
      const found = db.users.find(u=>u.id===payload.id);
      if(!found) return null;
      return { ...found, permissions: found.permissions || [] };
    }catch{
      return null;
    }
  }
  if(auth.startsWith("Basic ")){
    const [user, pass] = Buffer.from(auth.slice(6), "base64").toString().split(":");
    const found = db.users.find(u=>u.username===user);
    if(!found) return null;
    if(!bcrypt.compareSync(pass, found.password)) return null;
    return { ...found, permissions: found.permissions || [] };
  }
  return null;
}

function marketingKeyAuth(req, _res, next) {
  if (req.__authResolved) {
    return next();
  }
  const configuredKey = sanitizeSettingString(process.env.MARKETING_API_KEY || "");
  if (!configuredKey) {
    return next();
  }
  const providedKey = sanitizeSettingString(
    req.headers["x-marketing-key"] || req.headers["x-api-key"] || ""
  );
  if (providedKey && providedKey === configuredKey) {
    const tenantHeader = sanitizeSettingString(req.headers["x-tenant-id"] || "");
    req.user = {
      id: "marketing-worker",
      username: "marketing-worker",
      name: "Marketing Worker",
      role: "admin",
      permissions: ["admin"],
      tenantId: sanitizeTenantId(tenantHeader || DEFAULT_TENANT_ID),
    };
    req.__authResolved = true;
    return withTenantContext(req.user.tenantId, next);
  }
  next();
}

async function authenticate(req, res, next){
  if (req.__authResolved) {
    if (req.user === undefined) req.user = null;
    return next();
  }
  const u = await getAuthUser(req);
  req.user = u || null;
  req.__authResolved = true;
  if (req.user?.tenantId) {
    return withTenantContext(sanitizeTenantId(req.user.tenantId, DEFAULT_TENANT_ID), next);
  }
  next();
}

async function optionalAuth(req,res,next){
  if (req.__authResolved) {
    return next();
  }
  const u = await getAuthUser(req);
  if(u) req.user = u;
  else if (req.user === undefined) req.user = null;
  req.__authResolved = true;
  if (req.user?.tenantId) {
    return withTenantContext(sanitizeTenantId(req.user.tenantId, DEFAULT_TENANT_ID), next);
  }
  next();
}

function requireRole(role){
  return (req, res, next) => {
    if (req.user && req.user.role === role) {
      return next();
    }
    res.status(403).json({ ok:false, error:'Forbidden' });
  };
}

function hasPermission(user, perm){
  if (perm === "letters") return !!user;
  return !!(user && (user.role === "admin" || (user.permissions || []).includes(perm)));
}

function requirePermission(perm, options = {}){
  const { allowGuest = false } = options;
  const required = Array.isArray(perm) ? perm : [perm];
  const normalized = required
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return (req, res, next) => {
    if (!req.user) {
      if (allowGuest) return next();
      return res.status(403).json({ ok:false, error:'Forbidden' });
    }
    if (!normalized.length) return next();
    if (normalized.some((permission) => hasPermission(req.user, permission))) return next();
    res.status(403).json({ ok:false, error:'Forbidden' });
  };
}

function forbidMember(req,res,next){
  if(req.user && req.user.role === "member") return res.status(403).json({ ok:false, error:'Forbidden' });
  next();
}

function deepMerge(a = {}, b = {}) {
  const res = { ...a };
  for (const [key, val] of Object.entries(b || {})) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      res[key] = deepMerge(res[key] && typeof res[key] === "object" ? res[key] : {}, val);
    } else {
      res[key] = val;
    }
  }
  return res;
}


// Basic resource monitoring to catch memory or CPU spikes
const MAX_RSS_MB = Number(process.env.MAX_RSS_MB || 512);
const RESOURCE_CHECK_MS = Number(process.env.RESOURCE_CHECK_MS || 60_000);

let lastCpu = process.cpuUsage();
if (process.env.NODE_ENV !== "test") {
  setInterval(() => {
    try {
      const { rss } = process.memoryUsage();
      if (rss > MAX_RSS_MB * 1024 * 1024) {
        logWarn("HIGH_MEMORY_USAGE", "Memory usage high", { rss });
      }
      const cpu = process.cpuUsage(lastCpu);
      lastCpu = process.cpuUsage();
      const cpuMs = (cpu.user + cpu.system) / 1000;
      if (cpuMs > 1000) {
        logWarn("HIGH_CPU_USAGE", "CPU usage high", { cpuMs });

      }
    } catch (e) {
      logWarn("RESOURCE_MONITOR_FAILED", e.message);
    }
  }, RESOURCE_CHECK_MS);
}



// periodically surface due letter reminders
processAllReminders().catch(e => console.error("Reminder check failed", e));
if (process.env.NODE_ENV !== "test") {
  setInterval(() => {
    processAllReminders().catch(e => console.error("Reminder check failed", e));
  }, 60 * 60 * 1000);
}

// ---------- Static UI ----------
const PUBLIC_DIR = path.join(__dirname, "public");
const STATIC_FILE_CACHE = new Map();

function resolvePublicFilePath(fileName) {
  const fullPath = path.join(PUBLIC_DIR, fileName);
  const cached = STATIC_FILE_CACHE.get(fullPath);
  if (cached?.exists) {
    return fullPath;
  }
  const exists = fs.existsSync(fullPath);
  if (!exists && (!cached || !cached.warned)) {
    logWarn("PUBLIC_FILE_MISSING", "Missing static asset", { fileName, fullPath });
  }
  STATIC_FILE_CACHE.set(fullPath, { exists, warned: !exists });
  return exists ? fullPath : null;
}

function registerStaticPage({ paths, file, middlewares = [], beforeSend }) {
  const routePaths = Array.isArray(paths) ? paths : [paths];
  for (const routePath of routePaths) {
    app.get(routePath, ...middlewares, async (req, res, next) => {
      try {
        if (beforeSend) {
          await beforeSend(req, res);
          if (res.headersSent) return;
        }
        const resolved = resolvePublicFilePath(file);
        if (!resolved) {
          return res.status(404).send("Not found");
        }
        res.sendFile(resolved);
      } catch (err) {
        next(err);
      }
    });
  }
}

const TEAM_TEMPLATE = (() => {
  try {
    return fs.readFileSync(path.join(PUBLIC_DIR, "team-member-template.html"), "utf-8");
  } catch {
    return "";
  }
})();

// Disable default index to avoid auto-serving the app without auth
app.use(express.static(PUBLIC_DIR, { index: false }));

// Serve neutral welcome page at root, CRM login at /crm
registerStaticPage({ paths: "/", file: "welcome.html" });
registerStaticPage({ paths: ["/crm", "/crm/login", "/login"], file: "login.html" });

// DIY routes
registerStaticPage({ paths: ["/diy", "/diy/login"], file: "diy/login.html" });
registerStaticPage({ paths: "/diy/signup", file: "diy/signup.html" });
registerStaticPage({ paths: "/diy/dashboard", file: "diy/dashboard.html" });
registerStaticPage({ paths: "/dashboard", file: "dashboard.html" });
registerStaticPage({ paths: "/clients", file: "index.html" });
registerStaticPage({ paths: "/leads", file: "leads.html" });
registerStaticPage({
  paths: "/schedule",
  file: "schedule.html",
  beforeSend: async (_req, res) => {
    try {
      const settings = await loadSettings();
      if (!settings.googleCalendarToken || !settings.googleCalendarId) {
        res.set("X-Calendar-Mode", "local");
      }
    } catch (err) {
      logWarn(
        "SCHEDULE_SETTINGS_LOAD_FAILED",
        err?.message || "Failed to load settings for schedule page"
      );
    }
  },
});
registerStaticPage({
  paths: "/my-company",
  file: "my-company.html",
  middlewares: [optionalAuth, forbidMember],
});
registerStaticPage({ paths: "/billing", file: "billing.html" });
registerStaticPage({
  paths: ["/letters", "/letters/:jobId"],
  file: "letters.html",
  middlewares: [optionalAuth, forbidMember],
});
registerStaticPage({
  paths: "/library",
  file: "library.html",
  middlewares: [optionalAuth, forbidMember],
});
registerStaticPage({
  paths: "/workflows",
  file: "workflows.html",
  middlewares: [optionalAuth, forbidMember],
});
registerStaticPage({
  paths: ["/marketing", "/marketing/sms", "/marketing/email"],
  file: "marketing.html",
  middlewares: [optionalAuth, forbidMember],
});
registerStaticPage({
  paths: "/tradelines",
  file: "tradelines.html",
  middlewares: [optionalAuth, forbidMember],
});
registerStaticPage({
  paths: "/quiz",
  file: "quiz.html",
  middlewares: [optionalAuth, forbidMember],
});
registerStaticPage({
  paths: "/settings/client-portal",
  file: "client-portal-settings.html",
  middlewares: [optionalAuth, forbidMember],
});
registerStaticPage({
  paths: "/settings",
  file: "settings.html",
  middlewares: [optionalAuth, forbidMember],
});
registerStaticPage({
  paths: ["/client-portal", "/client-portal.html"],
  file: "client-portal-template.html",
});
app.get("/team/:token", (req, res) => {
  const token = path.basename(req.params.token);
  const file = resolvePublicFilePath(`team-${token}.html`);
  if (!file) return res.status(404).send("Not found");
  res.sendFile(file);
});
app.get("/portal/:id", async (req, res) => {
  const db = await loadDB();
  const consumer = db.consumers.find((c) => c.id === req.params.id);
  if (!consumer) return res.status(404).send("Portal not found");
  const templatePath = resolvePublicFilePath("client-portal-template.html");
  if (!templatePath) {
    logError("PORTAL_TEMPLATE_MISSING", "Client portal template not found");
    return res.status(500).send("Portal unavailable");
  }
  let tmpl = "";
  try {
    tmpl = fs.readFileSync(templatePath, "utf-8");
  } catch (err) {
    logError("PORTAL_TEMPLATE_READ_FAILED", "Failed to read client portal template", err);
    return res.status(500).send("Portal unavailable");
  }
  let payload;
  try {
    payload = await buildClientPortalPayload(consumer);
  } catch (err) {
    logError("PORTAL_PAYLOAD_FAILED", "Failed to build portal payload", err, { consumerId: consumer.id });
    return res.status(500).send("Portal unavailable");
  }
  if (!payload) {
    return res.status(500).send("Portal unavailable");
  }
  let html = tmpl.replace(/{{name}}/g, consumer.name);
  const bootstrap = {
    creditScore: payload.creditScore,
    negativeItems: payload.negativeItems,
    snapshot: payload.snapshot,
    portalSettings: payload.portalSettings,
  };
  const serializedBootstrap = toInlineJson(bootstrap);
  const bootstrapScript = `\n<script>\n  try {\n    const data = ${serializedBootstrap};\n    window.__PORTAL_BOOTSTRAP__ = data;\n    window.__NEGATIVE_ITEMS__ = Array.isArray(data.negativeItems) ? data.negativeItems : [];\n    if (data.creditScore) {\n      localStorage.setItem('creditScore', JSON.stringify(data.creditScore));\n    } else {\n      localStorage.removeItem('creditScore');\n    }\n    localStorage.setItem('negativeItems', JSON.stringify(window.__NEGATIVE_ITEMS__));\n    localStorage.setItem('creditSnapshot', JSON.stringify(data.snapshot || {}));\n  } catch (err) {\n    console.warn('Failed to bootstrap portal data', err);\n  }\n</script>`;
  const enhancedPayload = toInlineJson({
    timeline: payload.timeline,
    documents: payload.documents,
    reminders: payload.reminders,
    tracker: payload.tracker,
    invoices: payload.invoices,
    messages: payload.messages,
  });
  const enhancedScript = `\n<script>\n  try {\n    window.__PORTAL_ENHANCED__ = ${enhancedPayload};\n  } catch (err) {\n    console.warn('Failed to hydrate enhanced portal data', err);\n  }\n</script>`;
  html = html.replace(
    '<script src="/client-portal.js"></script>',
    `${bootstrapScript}${enhancedScript}\n<script src="/client-portal.js"></script>`
  );
  res.send(html);
});

app.get("/api/portal/:id", async (req, res) => {
  try {
    const db = await loadDB();
    const consumer = db.consumers.find((c) => c.id === req.params.id);
    if (!consumer) {
      return res.status(404).json({ ok: false, error: "Portal not found" });
    }
    const payload = await buildClientPortalPayload(consumer);
    if (!payload) {
      return res.status(500).json({ ok: false, error: "Portal unavailable" });
    }
    res.json({ ok: true, portal: payload });
  } catch (err) {
    logError("PORTAL_API_ERROR", "Failed to build portal payload", err, { consumerId: req.params.id });
    res.status(500).json({ ok: false, error: "Portal unavailable" });
  }
});

app.get("/buy", async (req, res) => {
  const { bank = "", price = "" } = req.query || {};
  const settings = await loadSettings();
  if (!StripeLib || !settings.stripeApiKey) {
    return res.status(500).json({ ok:false, error:'Stripe not configured' });
  }
  const amt = Math.round(parseFloat(price) * 100);
  if (!amt) return res.status(400).send("Invalid price");
  try {
    const stripe = new StripeLib(settings.stripeApiKey);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `${bank} Tradeline` },
            unit_amount: amt,
          },
          quantity: 1,
        },
      ],
      success_url: `${req.protocol}://${req.get('host')}/?success=1`,
      cancel_url: `${req.protocol}://${req.get('host')}/?canceled=1`,
    });
    res.redirect(303, session.url);
  } catch (e) {
    console.error("Stripe checkout error", e);
    res.status(500).json({ ok:false, error:'Checkout failed' });
  }
});

app.get("/api/settings", optionalAuth, async (req, res) => {
  const settings = await loadSettings(req);
  res.json({ ok: true, settings });
});

app.get("/api/settings/hotkeys", optionalAuth, async (req, res) => {
  try {
    const settings = await loadSettings(req);
    res.json({ ok: true, hotkeys: settings.hotkeys || {} });
  } catch (err) {
    logWarn("HOTKEY_SETTINGS_LOAD_FAILED", err?.message || String(err));
    res.status(500).json({ ok: false, error: "Failed to load hotkeys" });
  }
});

app.get("/api/experiments/portal-data-region", optionalAuth, async (req, res) => {
  try {
    const tenantId = resolveRequestTenant(req, DEFAULT_TENANT_ID);
    const visitorId = (req.query?.visitorId || req.query?.consumerId || req.user?.id || "").toString().slice(0, 128);
    const controlWeight = Math.max(1, Number.parseInt(process.env.PORTAL_DATA_REGION_CONTROL_WEIGHT || "1", 10) || 1);
    const dedicatedWeight = Math.max(1, Number.parseInt(process.env.PORTAL_DATA_REGION_WEIGHT || "1", 10) || 1);
    const assignment = await assignExperimentVariant({
      tenantId,
      testKey: DATA_REGION_EXPERIMENT_KEY,
      visitorId,
      context: "portal",
      variants: [
        { name: "control", weight: controlWeight },
        { name: "dedicated", weight: dedicatedWeight },
      ],
      metadata: {
        userAgent: req.headers["user-agent"] ? String(req.headers["user-agent"]).slice(0, 255) : null,
      },
    });
    res.json({ ok: true, variant: assignment.variant });
  } catch (err) {
    logWarn("PORTAL_EXPERIMENT_ASSIGN_FAILED", err?.message || String(err));
    res.json({ ok: true, variant: "control" });
  }
});

app.post("/api/experiments/portal-data-region/convert", optionalAuth, async (req, res) => {
  try {
    const tenantId = resolveRequestTenant(req, DEFAULT_TENANT_ID);
    const visitorId = (req.body?.visitorId || req.body?.consumerId || req.user?.id || "").toString().slice(0, 128);
    await recordExperimentConversion({
      tenantId,
      testKey: DATA_REGION_EXPERIMENT_KEY,
      visitorId,
      context: "portal",
      metadata: {
        action: req.body?.action || "cta_click",
      },
    });
    res.json({ ok: true });
  } catch (err) {
    logWarn("PORTAL_EXPERIMENT_CONVERT_FAILED", err?.message || String(err));
    res.status(200).json({ ok: false });
  }
});

app.post("/api/settings", optionalAuth, async (req, res) => {
  const payload = req && req.body && typeof req.body === "object" ? req.body : {};
  const updates = {};

  for (const key of STRING_SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      updates[key] = payload[key];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "envOverrides")) {
    updates.envOverrides = payload.envOverrides;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "clientPortal")) {
    updates.clientPortal = payload.clientPortal;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "hotkeys")) {
    updates.hotkeys = payload.hotkeys;
  }

  const payloadKeys = Object.keys(payload || {});
  const hasNonHotkeyUpdate = payloadKeys.some((key) => key !== "hotkeys");
  if (!Object.prototype.hasOwnProperty.call(payload, "envOverrides") && hasNonHotkeyUpdate) {
    updates.envOverrides = {};
  }

  const previousSettings = await loadSettings(req);
  if (Object.keys(updates).length === 0) {
    return res.json({ ok: true, settings: previousSettings });
  }

  const settings = await saveSettings(updates, req);

  if (
    (Object.prototype.hasOwnProperty.call(updates, "googleCalendarToken") ||
      Object.prototype.hasOwnProperty.call(updates, "googleCalendarId")) &&
    (
      previousSettings.googleCalendarToken !== settings.googleCalendarToken ||
      previousSettings.googleCalendarId !== settings.googleCalendarId
    )
  ) {
    await clearCalendarCache();
  }

  res.json({ ok: true, settings });
});

app.use("/api/marketing", marketingKeyAuth, authenticate, forbidMember, marketingRoutes);

app.get("/api/calendar/events", async (_req, res) => {
  try {
    const { events, mode, notice } = await listCalendarEvents();
    res.json({ ok: true, events, mode, notice });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/calendar/events", async (req, res) => {
  try {
    const { event, mode, notice } = await createCalendarEvent(req.body);
    res.json({ ok: true, event, mode, notice });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put("/api/calendar/events/:id", async (req, res) => {
  try {
    const { event, mode, notice } = await updateCalendarEvent(req.params.id, req.body);
    res.json({ ok: true, event, mode, notice });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/calendar/events/:id", async (req, res) => {
  try {
    const { mode, notice } = await deleteCalendarEvent(req.params.id);
    res.json({ ok: true, mode, notice });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/tradelines", async (req, res) => {
  try {
    const scrapeImpl = req.app.get("scrapeTradelinesOverride") || scrapeTradelines;
    const tradelines = await scrapeImpl(fetchFn);
    const grouped = groupTradelinesByPrice(tradelines);
    const ranges = buildRangeSummary(grouped);

    const { range: rangeId = "", bank = "", page = "1", perPage = "20" } = req.query || {};
    const selectedRange = getBucketMeta(rangeId);

    if (!rangeId) {
      return res.json({ ok: true, ranges, tradelines: [], banks: [], range: null, page: 1, totalPages: 1 });
    }

    if (!selectedRange) {
      return res.status(400).json({ ok: false, error: "Invalid price range" });
    }

    let items = grouped[selectedRange.id] || [];
    const normalizedBank = bank.trim();
    if (normalizedBank) {
      items = items.filter((item) => item.bank === normalizedBank);
    }

    const banks = listBanks(grouped[selectedRange.id]);

    const pageNumber = Number.parseInt(page, 10);
    const perPageNumber = Number.parseInt(perPage, 10);
    const pagination = paginate(
      items,
      Number.isFinite(pageNumber) ? pageNumber : 1,
      Number.isFinite(perPageNumber) ? perPageNumber : 20,
      { maxPerPage: MAX_TRADLINE_PAGE_SIZE },
    );

    res.json({
      ok: true,
      range: selectedRange,
      ranges,
      banks,
      tradelines: pagination.items,
      page: pagination.page,
      perPage: pagination.perPage,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems,
      selectedBank: normalizedBank || null,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/calendar/freebusy", async (req, res) => {
  try {
    const { timeMin, timeMax } = req.body || {};
    const { fb, mode, notice } = await calendarFreeBusy(timeMin, timeMax);
    res.json({ ok: true, fb, mode, notice });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Simple JSON "DB" ----------

async function recordLettersJob(userId, consumerId, jobId, letters){
  console.log(`Recording letters job ${jobId} for consumer ${consumerId}`);
  const db = await loadLettersDB();
  db.jobs.push({
    userId,
    consumerId,
    jobId,
    createdAt: Date.now(),
    letters: letters.map(L=>({ filename:L.filename, bureau:L.bureau, creditor:L.creditor }))
  });
  await saveLettersDB(db);
}

async function getUserJobMeta(jobId, userId){
  const ldb = await loadLettersDB();
  return ldb.jobs.find(j=>j.jobId === jobId && j.userId === userId) || null;
}

async function loadJobForUser(jobId, userId){
  const meta = await getUserJobMeta(jobId, userId);
  if(!meta) return null;
  let job = getJobMem(jobId);
  if(!job){
    const disk = await loadJobFromDisk(jobId);
    if(disk){
      putJobMem(jobId, disk.letters.map(d => ({
        filename: path.basename(d.htmlPath),
        bureau: d.bureau,
        creditor: d.creditor,
        html: fs.existsSync(d.htmlPath) ? fs.readFileSync(d.htmlPath,"utf-8") : "<html><body>Missing file.</body></html>",
        useOcr: d.useOcr
      })));
      job = getJobMem(jobId);
    }
  }
  if(!job) return null;
  return { meta, job };
}
const DEFAULT_DB = { consumers: [{ id: "RoVO6y0EKM", name: "Test Consumer", reports: [] }] };
function reportHasTradelines(report) {
  if (!report || !report.data) return false;
  const tradelines = report.data.tradelines;
  return Array.isArray(tradelines) && tradelines.length > 0;
}

let cachedSampleReport = null;

async function loadSampleReportTemplate() {
  if (cachedSampleReport) return cachedSampleReport;
  try {
    const samplePath = path.join(__dirname, "data", "report.json");
    const raw = await fs.promises.readFile(samplePath, "utf-8");
    const parsed = JSON.parse(raw);
    cachedSampleReport = {
      raw,
      parsed,
      size: Buffer.byteLength(raw, "utf-8"),
    };
  } catch (err) {
    logWarn("SEED_REPORT_MISSING", "Failed to load sample report", { message: err?.message });
    cachedSampleReport = { raw: "{}", parsed: {}, size: 2 };
  }
  return cachedSampleReport;
}

async function buildSeedReport(existing) {
  const template = await loadSampleReportTemplate();
  const parsedClone = JSON.parse(JSON.stringify(template.parsed || {}));
  const summary = {
    tradelines: Array.isArray(parsedClone.tradelines) ? parsedClone.tradelines.length : 0,
    negative_items: Array.isArray(parsedClone.negative_items) ? parsedClone.negative_items.length : 0,
    personalInfoMismatches: parsedClone.personalInfoMismatches || {},
  };
  if (!summary.negative_items && summary.negative_items !== 0) {
    delete summary.negative_items;
  }
  return {
    id: existing?.id || template.parsed?.id || nanoid(10),
    uploadedAt: existing?.uploadedAt || new Date().toISOString(),
    filename: existing?.filename || "sample-report.json",
    size: existing?.size || template.size,
    summary,
    data: parsedClone,
  };
}

async function loadDB(context){
  const scope = tenantScope(resolveTenantContextInput(context));
  let db = await readKey('consumers', null, scope);
  let changed = false;
  if(!db){
    db = JSON.parse(JSON.stringify(DEFAULT_DB));
    changed = true;
  }
  db.consumers = Array.isArray(db.consumers) ? db.consumers : [];
  if(db.consumers.length === 0){
    db.consumers.push({ id: nanoid(10), name: "Sample Consumer", reports: [] });
    changed = true;
  }
  let seededSample = false;
  for(const c of db.consumers){
    c.reports = Array.isArray(c.reports) ? c.reports : [];
    if (!seededSample) {
      const firstReport = c.reports[0];
      if (!reportHasTradelines(firstReport)) {
        const seeded = await buildSeedReport(firstReport);
        if (firstReport) {
          c.reports[0] = { ...firstReport, ...seeded };
        } else {
          c.reports.push(seeded);
        }
        seededSample = reportHasTradelines(c.reports[0]);
        changed = true;
      } else {
        seededSample = true;
      }
    }
  }
  const hasReports = db.consumers.some(c => c.reports.length > 0);
  if(!hasReports && db.consumers.length){
    const seeded = await buildSeedReport();
    db.consumers[0].reports.push(seeded);
    changed = true;
  }
  if(changed){
    await writeKey('consumers', db, scope);
  }
  return db;
}
async function saveDB(db, context){
  await writeKey('consumers', db, tenantScope(resolveTenantContextInput(context)));
}
const LETTERS_DEFAULT = { jobs: [], templates: [], sequences: [], contracts: [], mainTemplates: defaultTemplates().map(t=>t.id) };
function normalizeLettersDB(db){
  if(!db || typeof db !== 'object'){
    return { db: { ...LETTERS_DEFAULT }, mutated: true };
  }
  const normalized = { ...db };
  let mutated = false;
  if(!Array.isArray(normalized.jobs)){
    normalized.jobs = [];
    mutated = true;
  }
  if(!Array.isArray(normalized.templates)){
    normalized.templates = [];
    mutated = true;
  }
  if(!Array.isArray(normalized.sequences)){
    normalized.sequences = [];
    mutated = true;
  }
  if(!Array.isArray(normalized.contracts)){
    normalized.contracts = [];
    mutated = true;
  }
  if(!Array.isArray(normalized.mainTemplates) || normalized.mainTemplates.length === 0){
    normalized.mainTemplates = defaultTemplates().map(t=>t.id);
    mutated = true;
  }
  return { db: normalized, mutated };
}

async function loadLettersDB(){
  const raw = await readKey('letters', null);
  if(!raw){
    console.warn("Letters DB missing, initializing with defaults");
    await writeKey('letters', LETTERS_DEFAULT);
    return { ...LETTERS_DEFAULT };
  }
  const { db, mutated } = normalizeLettersDB(raw);
  if(mutated){
    await writeKey('letters', db);
  }
  console.log(`Loaded letters DB with ${db.jobs?.length || 0} jobs`);
  return db;
}

async function saveLettersDB(db){
  const { db: normalized } = normalizeLettersDB(db);
  await writeKey('letters', normalized);
  console.log(`Saved letters DB with ${normalized.jobs.length} jobs`);
}

async function loadLeadsDB(){
  const db = await readKey('leads', null);
  if(db) return db;
  const def = { leads: [] };
  await writeKey('leads', def);
  return def;
}
async function saveLeadsDB(db){ await writeKey('leads', db); }

const VALID_LEAD_STATUSES = new Set([
  "new",
  "working",
  "qualified",
  "nurture",
  "won",
  "lost"
]);

function normalizeLeadStatus(value){
  const normalized = (value ?? "").toString().trim().toLowerCase();
  if(VALID_LEAD_STATUSES.has(normalized)) return normalized;
  if(normalized === "completed" || normalized === "converted") return "won";
  if(normalized === "dropped" || normalized === "abandoned" || normalized === "archived") return "lost";
  if(normalized === "active") return "working";
  if(normalized === "followup" || normalized === "follow-up") return "nurture";
  if(normalized === "prospect") return "qualified";
  return "new";
}

function normalizeConsumerStatus(value){
  const normalized = (value ?? "").toString().trim().toLowerCase();
  if(!normalized) return "active";
  if(["cancelled", "canceled", "lost", "inactive", "churned"].includes(normalized)) return "lost";
  if(["paused", "on hold", "hold", "snoozed"].includes(normalized)) return "paused";
  if(["complete", "completed", "finished", "success"].includes(normalized)) return "completed";
  if(["prospect", "lead"].includes(normalized)) return "prospect";
  return normalized;
}

function toPercent(part, total){
  if(!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return (part / total) * 100;
}

function roundNumber(value, decimals = 1){
  if(!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function coerceAmount(value){
  if(typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value){
  if(!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

const MAX_PLAN_REMINDER_LEAD_DAYS = 60;
const MAX_PLAN_INTERVAL_DAYS = 365;

function startOfDay(value){
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if(Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function parsePlanDate(value){
  if(!value) return null;
  if(value instanceof Date && !Number.isNaN(value.getTime())) return startOfDay(value);
  if(typeof value === "number" && Number.isFinite(value)) return startOfDay(new Date(value));
  if(typeof value === "string"){
    const trimmed = value.trim();
    if(!trimmed) return null;
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(isoMatch){
      const [year, month, day] = isoMatch.slice(1).map(Number);
      const dt = new Date(year, month - 1, day);
      if(!Number.isNaN(dt.getTime())) return startOfDay(dt);
    }
    const parsed = new Date(trimmed);
    if(!Number.isNaN(parsed.getTime())) return startOfDay(parsed);
  }
  return null;
}

function formatIsoDate(date){
  if(!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days){
  const base = new Date(date.getTime());
  base.setDate(base.getDate() + days);
  return base;
}

function subtractDays(date, days){
  return addDays(date, -Math.abs(days));
}

function normalizePlanFrequency(value){
  const normalized = (value ?? "monthly").toString().trim().toLowerCase();
  if(normalized === "weekly" || normalized === "biweekly" || normalized === "custom" || normalized === "monthly") return normalized;
  return "monthly";
}

function resolvePlanIntervalDays(frequency, intervalDays){
  if(frequency === "weekly") return 7;
  if(frequency === "biweekly") return 14;
  if(frequency === "custom"){
    const parsed = Number.parseInt(intervalDays, 10);
    const safe = Number.isFinite(parsed) ? parsed : 30;
    return Math.min(MAX_PLAN_INTERVAL_DAYS, Math.max(1, safe));
  }
  return null;
}

function advancePlanDate(date, plan){
  const base = startOfDay(date);
  if(!base) return null;
  const frequency = normalizePlanFrequency(plan?.frequency);
  if(frequency === "weekly") return addDays(base, 7);
  if(frequency === "biweekly") return addDays(base, 14);
  if(frequency === "custom"){
    const interval = resolvePlanIntervalDays("custom", plan?.intervalDays);
    return addDays(base, interval || 30);
  }
  const next = new Date(base.getTime());
  next.setMonth(next.getMonth() + 1);
  return next;
}

function ensureNextBillDate(plan, requestedNextDate = null){
  const today = startOfDay(new Date());
  const start = parsePlanDate(plan?.startDate) || today;
  let next = requestedNextDate || parsePlanDate(plan?.nextBillDate) || start;
  if(next < start) next = start;
  let guard = 0;
  while(next < today && guard < 120){
    const advanced = advancePlanDate(next, plan);
    if(!advanced || advanced.getTime() === next.getTime()) break;
    next = advanced;
    guard++;
  }
  return formatIsoDate(next);
}

function normalizePlanRecord(raw){
  if(!raw || typeof raw !== "object") return null;
  raw.id = raw.id || nanoid(10);
  raw.consumerId = raw.consumerId || "";
  raw.name = (raw.name || "Custom plan").toString().trim() || "Custom plan";
  raw.amount = roundCurrency(coerceAmount(raw.amount));
  raw.frequency = normalizePlanFrequency(raw.frequency);
  raw.intervalDays = resolvePlanIntervalDays(raw.frequency, raw.intervalDays);
  raw.reminderLeadDays = Math.max(0, Math.min(MAX_PLAN_REMINDER_LEAD_DAYS, Number.parseInt(raw.reminderLeadDays, 10) || 0));
  raw.notes = (raw.notes || "").toString().trim();
  raw.active = raw.active !== false;
  raw.createdAt = raw.createdAt || new Date().toISOString();
  raw.updatedAt = raw.updatedAt || raw.createdAt;
  raw.lastSentAt = raw.lastSentAt || null;
  raw.lastInvoiceId = raw.lastInvoiceId || null;
  raw.cyclesCompleted = Number.isFinite(Number(raw.cyclesCompleted)) ? Number(raw.cyclesCompleted) : 0;
  raw.reminderId = raw.reminderId || null;
  const start = parsePlanDate(raw.startDate) || parsePlanDate(raw.createdAt) || startOfDay(new Date());
  raw.startDate = formatIsoDate(start);
  raw.nextBillDate = ensureNextBillDate(raw, parsePlanDate(raw.nextBillDate));
  return raw;
}

function clonePlan(plan){
  if(!plan) return null;
  return JSON.parse(JSON.stringify(plan));
}

function safeDate(value){
  if(!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts) : null;
}

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatUsd(value){
  const amount = roundCurrency(coerceAmount(value));
  return USD_FORMATTER.format(amount);
}

async function loadInvoicesDB(){
  const db = await readKey('invoices', null);
  if(db) return db;
  const def = { invoices: [] };
  await writeKey('invoices', def);
  return def;
}
async function saveInvoicesDB(db){ await writeKey('invoices', db); }

async function loadBillingPlansDB(){
  const raw = await readKey('billing_plans', null);
  const base = raw && typeof raw === "object" ? raw : { plans: [] };
  const plans = Array.isArray(base.plans) ? base.plans.slice() : [];
  const normalized = [];
  for(const plan of plans){
    const result = normalizePlanRecord(plan);
    if(result) normalized.push(result);
  }
  return { plans: normalized };
}

async function saveBillingPlansDB(db){
  if(!db || typeof db !== "object"){
    await writeKey('billing_plans', { plans: [] });
    return;
  }
  const plans = Array.isArray(db.plans) ? db.plans : [];
  const normalized = [];
  for(const plan of plans){
    const result = normalizePlanRecord(plan);
    if(result) normalized.push(result);
  }
  db.plans = normalized;
  await writeKey('billing_plans', { plans: normalized });
}

async function loadContactsDB(){
  const db = await readKey('contacts', null);
  if(db) return db;
  const def = { contacts: [] };
  await writeKey('contacts', def);
  return def;
}
async function saveContactsDB(db){ await writeKey('contacts', db); }

function normalizeUser(user){
  if(!user) return user;
  user.tenantId = sanitizeTenantId(user.tenantId || DEFAULT_TENANT_ID);
  user.permissions = Array.isArray(user.permissions) ? user.permissions : [];
  if(user.role === "team"){
    const preset = getTeamRolePreset(user.teamRole);
    user.teamRole = preset.id;
    const merged = new Set([...(preset.permissions || []), ...user.permissions]);
    user.permissions = [...merged];
  }
  if(user.role === "member" && user.permissions.length === 0){
    user.permissions = [...DEFAULT_MEMBER_PERMISSIONS];
  }
  return user;
}

async function loadUsersDB(){
  let db = await readKey('users', null);
  if(!db) db = { users: [] };
  if(!db.users.some(u => u.username === 'ducky')){
    db.users.push({
      id: nanoid(10),
      username: 'ducky',
      name: 'ducky',
      password: bcrypt.hashSync('duck', 10),
      role: 'admin',
      tenantId: DEFAULT_TENANT_ID,
      permissions: []
    });
    await writeKey('users', db);
  }
  let changed = false;
  db.users = db.users.map(u => {
    const before = JSON.stringify({ role: u.role, permissions: u.permissions });
    const normalized = normalizeUser({ ...u });
    if(JSON.stringify({ role: normalized.role, permissions: normalized.permissions }) !== before){
      changed = true;
    }
    return normalized;
  });
  if(changed){
    await writeKey('users', db);
  }
  return db;
}

function buildTeamMemberResponse(user){
  if(!user) return null;
  const preset = getTeamRolePreset(user.teamRole);
  return {
    id: user.id,
    name: user.name || user.username || "",
    email: user.username || "",
    createdAt: user.createdAt || null,
    lastLoginAt: user.lastLoginAt || null,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    tenantId: user.tenantId || DEFAULT_TENANT_ID,
    tokenIssued: Boolean(user.token),
    teamRole: preset.id,
    roleLabel: preset.label,
    roleDescription: preset.description,
  };
}
async function saveUsersDB(db){ await writeKey('users', db); }

async function loadTasksDB(){
  const db = await readKey('tasks', null);
  if(db) return db;
  const def = { tasks: [] };
  await writeKey('tasks', def);
  return def;
}
async function saveTasksDB(db){ await writeKey('tasks', db); }

async function processTasks(){
  const db = await loadTasksDB();
  let changed = false;
  const now = Date.now();
  for(const t of db.tasks){
    if(!t.completed){
      const status = t.due && new Date(t.due).getTime() < now ? "overdue" : "pending";
      if(t.status !== status){ t.status = status; changed = true; }
    }
  }
  if(changed) await saveTasksDB(db);
}

// Process tasks immediately on startup so their status is accurate
processTasks();
if (process.env.NODE_ENV !== "test") {
  setInterval(processTasks, 60_000);
}


function renderInvoiceHtml(inv, company = {}, consumer = {}) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    body { font-family: sans-serif; margin:40px; }
    h1 { text-align:center; }
    table { width:100%; border-collapse:collapse; margin-top:20px; }
    th, td { padding:8px; border-bottom:1px solid #ddd; text-align:left; }
  </style>
  </head><body>
  <h1>${company.name || 'Invoice'}</h1>
  <p><strong>Bill To:</strong> ${consumer.name || ''}</p>
  <table>
    <thead><tr><th>Description</th><th>Amount</th><th>Due</th></tr></thead>
    <tbody><tr><td>${inv.desc}</td><td>$${Number(inv.amount).toFixed(2)}</td><td>${inv.due || ''}</td></tr></tbody>
  </table>
  </body></html>`;
}


async function createInvoice({
  consumerId,
  desc = "",
  amount = 0,
  due = null,
  paid = false,
  company = {},
  payLink = null,
  paymentProvider = null,
  stripeSessionId = null,
  message = null,
  planId = null,
  consumer = null,
  req,
} = {}){
  if(!consumerId){
    throw Object.assign(new Error("consumerId required"), { code: "INVOICE_CONSUMER_REQUIRED" });
  }
  const db = await loadInvoicesDB();
  const nowIso = new Date().toISOString();
  const inv = {
    id: nanoid(10),
    consumerId,
    desc: (desc || "").toString().trim(),
    amount: roundCurrency(coerceAmount(amount)),
    due: due || null,
    paid: !!paid,
    pdf: null,
    payLink: null,
    paymentProvider: null,
    stripeSessionId: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    planId: planId || null,
  };
  const companySafe = company && typeof company === "object" ? company : {};
  let resolvedConsumer = consumer;
  if(!resolvedConsumer){
    const mainDb = await loadDB();
    resolvedConsumer = mainDb.consumers.find(c => c.id === consumerId);
  }
  if(!resolvedConsumer){
    throw Object.assign(new Error("Consumer not found"), { code: "CONSUMER_NOT_FOUND" });
  }

  let pdfResult = null;
  try {
    const html = renderInvoiceHtml(inv, companySafe, resolvedConsumer);
    pdfResult = await savePdf(html);
    let ext = path.extname(pdfResult.path);
    if (pdfResult.warning || ext !== ".pdf") {
      console.error("Invoice PDF generation warning", pdfResult.warning);
      ext = ".html";
    }
    const mime = ext === ".pdf" ? "application/pdf" : "text/html";

    const uploadsDir = consumerUploadsDir(inv.consumerId);
    const fid = nanoid(10);
    const storedName = `${fid}${ext}`;
    const dest = path.join(uploadsDir, storedName);
    await fs.promises.copyFile(pdfResult.path, dest);
    const stat = await fs.promises.stat(dest);
    await addFileMeta(inv.consumerId, {
      id: fid,
      originalName: `invoice_${inv.id}${ext}`,
      storedName,
      type: "invoice",
      size: stat.size,
      mimetype: mime,
      uploadedAt: new Date().toISOString(),
    });
    inv.pdf = storedName;
  } catch (err) {
    console.error("Failed to generate invoice PDF", err);
  }

  const stripeClient = await getStripeClient(req);
  let payLinkValue = payLink || null;
  let paymentProviderValue = paymentProvider || null;
  let stripeSessionValue = stripeSessionId || null;
  const amountCents = Math.round((Number(inv.amount) || 0) * 100);
  if(!payLinkValue){
    if(stripeClient && amountCents > 0){
      const checkout = await createStripeCheckoutSession({ invoice: inv, consumer: resolvedConsumer, company: companySafe, req, stripeClient });
      if(checkout?.sessionId){
        paymentProviderValue = "stripe";
        stripeSessionValue = checkout.sessionId;
      }
      if(checkout?.sessionId || checkout?.url){
        payLinkValue = buildInvoicePayUrl(inv, req);
      }
    }
  }
  if(!payLinkValue){
    const fallbackBase = (process.env.PORTAL_PAYMENT_BASE || resolvePortalBase(req) || "https://pay.example.com").replace(/\/$/, "");
    payLinkValue = stripeClient ? buildInvoicePayUrl(inv, req) : `${fallbackBase}/${inv.id}`;
  }
  inv.payLink = payLinkValue;
  inv.paymentProvider = paymentProviderValue;
  inv.stripeSessionId = stripeSessionValue;

  const notificationMessage =
    message || `Payment due for ${inv.desc || "invoice"} (${formatUsd(inv.amount)}). Pay inside your client portal (Pay tab) or at ${payLinkValue}.`;
  await addEvent(inv.consumerId, "message", { from: "system", text: notificationMessage });

  db.invoices.push(inv);
  await saveInvoicesDB(db);
  return { invoice: inv, warning: pdfResult?.warning || null };
}

function buildPlanFromPayload(payload = {}){
  const nowIso = new Date().toISOString();
  const frequency = normalizePlanFrequency(payload.frequency);
  const plan = {
    id: nanoid(10),
    consumerId: payload.consumerId,
    name: (payload.name || "Custom plan").toString().trim() || "Custom plan",
    amount: roundCurrency(coerceAmount(payload.amount)),
    frequency,
    intervalDays: resolvePlanIntervalDays(frequency, payload.intervalDays),
    reminderLeadDays: Math.max(0, Math.min(MAX_PLAN_REMINDER_LEAD_DAYS, Number.parseInt(payload.reminderLeadDays, 10) || 0)),
    notes: (payload.notes || "").toString().trim(),
    active: payload.active !== false,
    createdAt: nowIso,
    updatedAt: nowIso,
    lastSentAt: null,
    lastInvoiceId: null,
    cyclesCompleted: 0,
    reminderId: null,
  };
  const start = parsePlanDate(payload.startDate) || startOfDay(new Date());
  plan.startDate = formatIsoDate(start);
  const requestedNext = parsePlanDate(payload.nextBillDate) || start;
  plan.nextBillDate = ensureNextBillDate(plan, requestedNext);
  return plan;
}

function applyPlanUpdates(plan, payload = {}){
  if(!plan) return plan;
  if(payload.name !== undefined){
    const trimmed = (payload.name || "").toString().trim();
    if(trimmed) plan.name = trimmed; else if(payload.name === "") plan.name = "Custom plan";
  }
  if(payload.amount !== undefined){
    plan.amount = roundCurrency(coerceAmount(payload.amount));
  }
  if(payload.frequency !== undefined){
    plan.frequency = normalizePlanFrequency(payload.frequency);
    plan.intervalDays = resolvePlanIntervalDays(plan.frequency, payload.intervalDays ?? plan.intervalDays);
  } else if(payload.intervalDays !== undefined && plan.frequency === "custom"){
    plan.intervalDays = resolvePlanIntervalDays("custom", payload.intervalDays);
  } else if(plan.frequency !== "custom"){
    plan.intervalDays = resolvePlanIntervalDays(plan.frequency, plan.intervalDays);
  }
  if(payload.reminderLeadDays !== undefined){
    const lead = Number.parseInt(payload.reminderLeadDays, 10);
    plan.reminderLeadDays = Math.max(0, Math.min(MAX_PLAN_REMINDER_LEAD_DAYS, Number.isFinite(lead) ? lead : 0));
  }
  if(payload.notes !== undefined){
    plan.notes = (payload.notes || "").toString().trim();
  }
  if(payload.active !== undefined){
    plan.active = !!payload.active;
  }
  if(payload.startDate !== undefined){
    const start = parsePlanDate(payload.startDate);
    if(start) plan.startDate = formatIsoDate(start);
  }
  let requestedNext = null;
  if(payload.nextBillDate !== undefined){
    const next = parsePlanDate(payload.nextBillDate);
    if(next) requestedNext = next;
  }
  plan.nextBillDate = ensureNextBillDate(plan, requestedNext);
  plan.updatedAt = new Date().toISOString();
  return plan;
}

async function refreshPlanReminder(plan){
  if(!plan) return plan;
  if(plan.reminderId){
    await removeReminder(plan.consumerId, plan.reminderId);
    plan.reminderId = null;
  }
  if(!plan.active) return plan;
  const nextDate = parsePlanDate(plan.nextBillDate);
  if(!nextDate) return plan;
  let reminderDate = subtractDays(nextDate, Math.max(0, Number(plan.reminderLeadDays) || 0));
  const today = startOfDay(new Date());
  if(!reminderDate) reminderDate = nextDate;
  if(today && reminderDate < today){
    reminderDate = today;
  }
  const reminderId = `plan_${plan.id}_${formatIsoDate(reminderDate)}`;
  await addReminder(plan.consumerId, {
    id: reminderId,
    due: reminderDate.toISOString(),
    payload: {
      type: "billing_plan_reminder",
      planId: plan.id,
      amount: plan.amount,
      name: plan.name,
      nextBillDate: plan.nextBillDate,
      frequency: plan.frequency,
    },
    notes: plan.notes || "",
  });
  plan.reminderId = reminderId;
  return plan;
}

async function sendPlanInvoice({ plan, plansDb, req, company = {}, consumer = null } = {}){
  if(!plan){
    throw Object.assign(new Error("Plan not found"), { code: "PLAN_NOT_FOUND" });
  }
  if(!plan.active){
    throw Object.assign(new Error("Plan is paused"), { code: "PLAN_INACTIVE" });
  }
  if(!plan.nextBillDate){
    throw Object.assign(new Error("Plan has no upcoming bill date"), { code: "PLAN_NO_SCHEDULE" });
  }
  await removeReminder(plan.consumerId, plan.reminderId);
  plan.reminderId = null;
  const companySafe = company && typeof company === "object" ? company : {};
  const dueIso = plan.nextBillDate;
  const dueDate = parsePlanDate(dueIso) || startOfDay(new Date());
  const { invoice, warning } = await createInvoice({
    consumerId: plan.consumerId,
    desc: `${plan.name} plan`,
    amount: plan.amount,
    due: dueIso,
    company: companySafe,
    planId: plan.id,
    consumer,
    req,
  });
  plan.lastInvoiceId = invoice?.id || null;
  plan.lastSentAt = new Date().toISOString();
  plan.cyclesCompleted = Number.isFinite(plan.cyclesCompleted) ? plan.cyclesCompleted + 1 : 1;
  const nextDate = advancePlanDate(dueDate, plan) || advancePlanDate(startOfDay(new Date()), plan) || dueDate;
  const nextIso = formatIsoDate(nextDate);
  if(nextIso) plan.nextBillDate = nextIso;
  plan.updatedAt = new Date().toISOString();
  await refreshPlanReminder(plan);
  await saveBillingPlansDB(plansDb);
  await addEvent(plan.consumerId, "billing_plan_cycle_processed", {
    planId: plan.id,
    invoiceId: invoice?.id || null,
    amount: plan.amount,
    previousDue: dueIso,
    nextDue: plan.nextBillDate,
  });
  return { plan, invoice, warning };
}


// ---------- Upload handling ----------
const upload = multer({ storage: multer.memoryStorage() });

// ---------- Python Analyzer Bridge ----------
async function runPythonAnalyzer({ buffer, filename }){
  const scriptPath = path.join(__dirname, "metro2_audit_multi.py");
  await fs.promises.access(scriptPath, fs.constants.R_OK)
    .catch(()=>{ throw new Error(`Analyzer not found or unreadable: ${scriptPath}`); });
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(),"metro2-"));
  const ext = (filename || "").toString().toLowerCase().endsWith(".pdf") ? ".pdf" : ".html";
  const htmlPath = path.join(tmpDir,`report${ext}`);
  const outPath  = path.join(tmpDir,"report.json");
  await fs.promises.writeFile(htmlPath, buffer);

  const { child: py } = await spawnPythonProcess(
    [scriptPath,"-i",htmlPath,"-o",outPath],
    { stdio:["ignore","pipe","pipe"] }
  );
  let stdout="", stderr="";
  py.stdout.on("data",d=>stdout+=d.toString());
  py.stderr.on("data",d=>stderr+=d.toString());

  return new Promise((resolve,reject)=>{
    py.once("error", async(err) => {
      try { await fs.promises.rm(tmpDir,{recursive:true,force:true}); }catch{}
      reject(err);
    });
    py.on("close", async(code)=>{
      try{
        if(code!==0) throw new Error(`Analyzer exit ${code}\n${stderr}\n${stdout}`);
        await fs.promises.access(outPath, fs.constants.R_OK);
        const raw = await fs.promises.readFile(outPath, "utf-8");
        const json = JSON.parse(raw);
        resolve({ data: json, stdout, stderr });
      }catch(e){ reject(e); }
      finally{ try{ await fs.promises.rm(tmpDir,{recursive:true,force:true}); }catch{} }
    });
  });
}

const OPENAI_API_URL = process.env.OPENAI_API_URL || "https://api.openai.com/v1/responses";
const OPENAI_PARSE_MODEL = process.env.OPENAI_PARSE_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_MAX_CHUNK_CHARS = Number.parseInt(process.env.OPENAI_REPORT_CHUNK_CHARS || "12000", 10);
const OPENAI_MAX_PARSE_RETRIES = 1;
const LEGACY_ANALYZERS_ENABLED = process.env.ENABLE_LEGACY_ANALYZERS === "true";


const PARSE_SYSTEM_PROMPT = [
  "You are a data extraction engine.",
  "Output must conform to the provided JSON schema exactly.",
  "Use null when a field is not present; never infer or guess.",
  "Do not add extra fields.",
].join(" ");

const PARSE_DEVELOPER_PROMPT = [
  "Bureau keys must be exactly: TUC, EXP, EQF.",
  "Missing markers to treat as null: -, —, empty, N/A.",
  "If a bureau section is blank, set present:false and all fields null for that bureau entry.",
  "accountNumberMasked should retain masking (e.g., ****1234) as shown.",
  "reportMeta.provider should be the report source if explicitly stated; otherwise use \"unknown\".",
  "reportMeta.reportDate only when explicitly present.",
  "Do not invent dates or amounts.",
].join(" ");


const NUMBER_FIELDS = ["balance", "pastDue", "creditLimit", "highCredit"];
const DATE_FIELDS = ["dateOpened", "dateClosed", "lastReported", "dateLastPayment"];
const STRING_FIELDS = ["accountNumberMasked", "accountStatus", "paymentStatus", "comments"];

function getOpenAiKey() {
  const key = process.env.OPENAI_API_KEY || "";
  if (!key.trim()) {
    throw new Error("OPENAI_API_KEY is required for LLM report parsing.");
  }
  return key.trim();
}

function redactSensitive(text = "") {
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_SSN]")
    .replace(/\b\d{9}\b/g, "[REDACTED_SSN]")
    .replace(/\b\d{5}(?:-\d{4})?\b/g, "[REDACTED_ZIP]");
}

function extractHtmlVisibleText(htmlText = "") {
  try {
    const dom = new JSDOM(htmlText);
    return (dom.window.document.body?.textContent || "").replace(/\s+\n/g, "\n").trim();
  } catch {
    return htmlText;
  }
}

async function extractReportText({ buffer, filename }) {
  const isPdf = (filename || "").toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    const htmlText = buffer.toString("utf-8");
    return { text: extractHtmlVisibleText(htmlText), source: "html" };
  }
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "metro2-llm-"));
  const pdfPath = path.join(tmpDir, "report.pdf");
  const outPath = path.join(tmpDir, "report-text.json");
  await fs.promises.writeFile(pdfPath, buffer);
  const scriptPath = path.join(__dirname, "backend/parsers/report_text_extractor.py");
  const { child: py } = await spawnPythonProcess(
    [scriptPath, pdfPath, outPath],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  let stdout = "";
  let stderr = "";
  py.stdout.on("data", data => { stdout += data.toString(); });
  py.stderr.on("data", data => { stderr += data.toString(); });
  return new Promise((resolve, reject) => {
    py.once("error", async err => {
      try { await fs.promises.rm(tmpDir, { recursive: true, force: true }); } catch {}
      reject(err);
    });
    py.on("close", async code => {
      try {
        if (code !== 0) {
          throw new Error(`PDF text extraction failed (${code}): ${stderr || stdout}`);
        }
        const raw = await fs.promises.readFile(outPath, "utf-8");
        const parsed = JSON.parse(raw);
        resolve({ text: String(parsed?.text || ""), source: "pdf" });
      } catch (err) {
        reject(err);
      } finally {
        try { await fs.promises.rm(tmpDir, { recursive: true, force: true }); } catch {}
      }
    });
  });
}

function coerceNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const num = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : null;
}

function normalizeCanonicalReport(report = {}) {
  const reportMeta = report.reportMeta && typeof report.reportMeta === "object" ? { ...report.reportMeta } : {};
  if (!reportMeta.provider || typeof reportMeta.provider !== "string" || !reportMeta.provider.trim()) {
    reportMeta.provider = "unknown";
  }
  reportMeta.reportDate = reportMeta.reportDate || null;
  const normalized = {
    reportMeta,
    identity: report.identity || { TUC: {}, EXP: {}, EQF: {} },
    tradelines: Array.isArray(report.tradelines) ? report.tradelines : [],
  };

  ["TUC", "EXP", "EQF"].forEach(key => {
    if (!normalized.identity[key] || typeof normalized.identity[key] !== "object") {
      normalized.identity[key] = {};
    }
    if (!Array.isArray(normalized.identity[key].addresses)) {
      normalized.identity[key].addresses = [];
    }
    normalized.identity[key].name ??= null;
    normalized.identity[key].dob ??= null;
  });

  normalized.tradelines = normalized.tradelines
    .filter(tl => tl && typeof tl === "object")
    .map(tl => {
      const byBureau = tl.byBureau || {};
      const normByBureau = {};
      ["TUC", "EXP", "EQF"].forEach(bureau => {
        const entry = byBureau[bureau] && typeof byBureau[bureau] === "object"
          ? { ...byBureau[bureau] }
          : { present: false };
        entry.present = Boolean(entry.present);
        NUMBER_FIELDS.forEach(field => {
          entry[field] = coerceNumber(entry[field]);
        });
        DATE_FIELDS.forEach(field => {
          if (entry[field] === undefined) entry[field] = null;
        });
        STRING_FIELDS.forEach(field => {
          if (entry[field] === undefined) entry[field] = null;
        });
        if (!entry.present) {
          Object.keys(entry).forEach(field => {
            if (field !== "present") entry[field] = null;
          });
        } else {
          [...NUMBER_FIELDS, ...DATE_FIELDS, ...STRING_FIELDS].forEach(field => {
            if (entry[field] === undefined) entry[field] = null;
          });
        }
        normByBureau[bureau] = entry;
      });
      return {
        furnisherName: tl.furnisherName || "Unknown",
        byBureau: normByBureau,
      };
    });

  return normalized;
}

function validateCanonicalReport(report = {}) {
  const errors = [];
  if (!report || typeof report !== "object") {
    return ["Report is not an object."];
  }
  if (!report.reportMeta || typeof report.reportMeta.provider !== "string") {
    errors.push("reportMeta.provider is required.");
  }
  if (!report.identity || typeof report.identity !== "object") {
    errors.push("identity is required.");
  } else {
    ["TUC", "EXP", "EQF"].forEach(key => {
      if (!report.identity[key] || typeof report.identity[key] !== "object") {
        errors.push(`identity.${key} is required.`);
      }
    });
  }
  if (!Array.isArray(report.tradelines)) {
    errors.push("tradelines must be an array.");
  } else {
    report.tradelines.forEach((tl, idx) => {
      if (!tl || typeof tl !== "object") {
        errors.push(`tradelines[${idx}] must be an object.`);
        return;
      }
      if (!tl.furnisherName) {
        errors.push(`tradelines[${idx}].furnisherName is required.`);
      }
      const byBureau = tl.byBureau || {};
      ["TUC", "EXP", "EQF"].forEach(bureau => {
        const entry = byBureau[bureau];
        if (!entry || typeof entry !== "object") {
          errors.push(`tradelines[${idx}].byBureau.${bureau} is required.`);
          return;
        }
        if (typeof entry.present !== "boolean") {
          errors.push(`tradelines[${idx}].byBureau.${bureau}.present must be boolean.`);
        }
        if (!entry.present) {
          Object.entries(entry).forEach(([field, value]) => {
            if (field !== "present" && value !== null) {
              errors.push(`tradelines[${idx}].byBureau.${bureau}.${field} must be null when present=false.`);
            }
          });
        } else {
          DATE_FIELDS.forEach(field => {
            if (entry[field] && !isValidDate(entry[field])) {
              errors.push(`tradelines[${idx}].byBureau.${bureau}.${field} must be a valid date string.`);
            }
          });
        }
      });
    });
  }
  return errors;
}

function isValidDate(value) {
  const parsed = Date.parse(String(value));
  return !Number.isNaN(parsed);
}


async function callOpenAiStructured({ schema, schemaName, system, developer, user, model }) {
  const apiKey = getOpenAiKey();
  const formatName = schemaName || "canonical_report_v1";
  const body = {
    model,
    input: [
      { role: "system", content: system },
      { role: "developer", content: developer },
      { role: "user", content: user },
    ],
    text: {
      format: {
        type: "json_schema",
        name: formatName,
        schema,
        strict: true,
      },
    },
    temperature: 0,
    store: false,
  };

  const response = await fetchFn(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI error ${response.status}: ${JSON.stringify(payload)}`);
  }
  const outputText = payload.output_text
    || payload.output?.map(item => item.content?.map(c => c.text || c.output_text).join("") || "").join("");
  if (outputText) {
    return JSON.parse(outputText);
  }
  const jsonContent = payload.output?.[0]?.content?.find(c => c.type === "output_json");
  if (jsonContent?.json) return jsonContent.json;
  throw new Error("OpenAI response missing structured output.");
}

function splitText(text = "", maxChunk = OPENAI_MAX_CHUNK_CHARS) {
  if (text.length <= maxChunk) return [text];
  const chunks = [];
  let offset = 0;
  while (offset < text.length) {
    chunks.push(text.slice(offset, offset + maxChunk));
    offset += maxChunk;
  }
  return chunks;
}

function mergeCanonicalReports(reports = []) {
  const primary = reports.find(r => r && r.reportMeta) || { reportMeta: { provider: "unknown", reportDate: null }, identity: { TUC: {}, EXP: {}, EQF: {} } };
  const merged = {
    reportMeta: primary.reportMeta,
    identity: primary.identity,
    tradelines: [],
  };
  const seen = new Set();
  reports.forEach(report => {
    (report.tradelines || []).forEach((tl, idx) => {
      const acct = tl.byBureau?.TUC?.accountNumberMasked
        || tl.byBureau?.EXP?.accountNumberMasked
        || tl.byBureau?.EQF?.accountNumberMasked
        || "";
      const suffix = acct ? acct.slice(-4) : `idx${idx}`;
      const key = `${normalizeCreditorName(tl.furnisherName)}|${suffix}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.tradelines.push(tl);
    });
  });
  return merged;
}

async function parseCanonicalReport(text, sourceLabel) {
  const sanitizedText = redactSensitive(text);
  const userPayload = [
    `Source: ${sourceLabel}`,
    "Extracted text follows:",
    sanitizedText,
  ].join("\n\n");

  let attempts = 0;
  let report;
  let errors = [];
  while (attempts <= OPENAI_MAX_PARSE_RETRIES) {
    attempts += 1;
    report = await callOpenAiStructured({
      schema: CANONICAL_REPORT_SCHEMA,
      schemaName: "CanonicalReport",
      system: PARSE_SYSTEM_PROMPT,
      developer: PARSE_DEVELOPER_PROMPT + (errors.length ? ` Previous validation errors: ${errors.join("; ")}` : ""),
      user: userPayload,
      model: OPENAI_PARSE_MODEL,
    });
    report = normalizeCanonicalReport(report);
    errors = validateCanonicalReport(report);
    if (!errors.length) break;
  }
  if (errors.length) {
    throw new Error(`CanonicalReport validation failed: ${errors.join("; ")}`);
  }
  return report;
}

async function parseCanonicalReportWithChunking(text, sourceLabel) {
  const chunks = splitText(text);
  if (chunks.length === 1) {
    return parseCanonicalReport(text, sourceLabel);
  }
  const reports = [];
  for (const chunk of chunks) {
    const report = await parseCanonicalReport(chunk, `${sourceLabel} chunk`);
    reports.push(report);
  }
  return mergeCanonicalReports(reports);
}


function mapCanonicalIdentityToPersonalInfo(identity = {}) {
  const mapBlock = block => {
    const addresses = Array.isArray(block?.addresses) ? block.addresses : [];
    const [addr1, addr2] = addresses;
    return {
      name: block?.name || null,
      dob: block?.dob || null,
      address: addresses.length
        ? {
            addr1: addr1 || null,
            addr2: addr2 || null,
          }
        : null,
    };
  };
  return {
    TransUnion: mapBlock(identity.TUC),
    Experian: mapBlock(identity.EXP),
    Equifax: mapBlock(identity.EQF),
  };
}

function canonicalToTradelines(report = {}) {
  const tradelines = [];
  (report.tradelines || []).forEach(group => {
    const per_bureau = {
      TransUnion: mapCanonicalBureau(group.byBureau?.TUC, "TransUnion"),
      Experian: mapCanonicalBureau(group.byBureau?.EXP, "Experian"),
      Equifax: mapCanonicalBureau(group.byBureau?.EQF, "Equifax"),
    };
    tradelines.push({
      meta: { creditor: group.furnisherName },
      per_bureau,
      source: "llm",
      violations: [],
      violations_grouped: {},
    });
  });
  return tradelines;
}

function mapCanonicalBureau(entry = {}, bureauLabel = "") {
  if (!entry || !entry.present) {
    return {
      bureau: bureauLabel,
      present: false,
      tradelineKey: entry?.tradelineKey || null,
    };
  }
  return {
    bureau: bureauLabel,
    present: true,
    tradelineKey: entry.tradelineKey || null,
    account_number: entry.accountNumberMasked || null,
    account_status: entry.accountStatus || null,
    payment_status: entry.paymentStatus || null,
    balance: entry.balance ?? null,
    past_due: entry.pastDue ?? null,
    credit_limit: entry.creditLimit ?? null,
    high_credit: entry.highCredit ?? null,
    date_opened: entry.dateOpened || null,
    date_closed: entry.dateClosed || null,
    last_reported: entry.lastReported || null,
    last_payment: entry.dateLastPayment || null,
    comments: entry.comments || null,
  };
}

function attachViolationsToTradelines(tradelines = [], violations = []) {
  const keyToIndex = new Map();
  tradelines.forEach((tl, idx) => {
    const perBureau = tl?.per_bureau || {};
    Object.values(perBureau || {}).forEach((entry) => {
      const key = entry?.tradelineKey;
      if (typeof key === "string" && key.trim()) {
        keyToIndex.set(key, idx);
      }
    });
  });

  let attachedCount = 0;
  let skippedCount = 0;
  const missingKeys = new Set();
  const missingSampleKeys = [];

  violations.forEach((violation) => {
    const key = violation?.tradelineKey;
    if (!key || !keyToIndex.has(key)) {
      skippedCount += 1;
      if (key && !missingKeys.has(key)) {
        missingKeys.add(key);
        if (missingSampleKeys.length < 5) {
          missingSampleKeys.push(key);
        }
      }
      return;
    }
    const targetIndex = keyToIndex.get(key);
    const tl = tradelines[targetIndex];
    if (!tl) return;
    tl.violations = tl.violations || [];
    tl.violations_grouped = tl.violations_grouped || {};
    const entry = {
      id: violation.ruleId,
      title: violation.explanation,
      source: "llm",
      category: violation.category || "LLM",
      bureau: violation.bureau,
      evidencePaths: violation.evidencePaths,
      disputeTargets: violation.disputeTargets || [],
      tradelineKey: violation.tradelineKey,
      instanceKey: violation.instanceKey || null,
    };
    tl.violations.push(entry);
    if (!tl.violations_grouped.LLM) tl.violations_grouped.LLM = [];
    tl.violations_grouped.LLM.push(entry);
    attachedCount += 1;
  });

  return {
    attachedCount,
    skippedCount,
    missingSampleKeys,
  };
}

const REQUIRED_FIELD_RULES_PATHS = [
  process.env.REQUIRED_FIELD_RULES_PATH,
  path.resolve(__dirname, "..", "..", "..", "rules", "required-field.rules.json"),
  path.resolve(process.cwd(), "rules", "required-field.rules.json"),
  path.resolve(process.cwd(), "..", "rules", "required-field.rules.json"),
  path.resolve(process.cwd(), "..", "..", "rules", "required-field.rules.json"),
].filter(Boolean);

function resolveRequiredFieldRulesPath() {
  return REQUIRED_FIELD_RULES_PATHS.find((candidate) => fs.existsSync(candidate)) || null;
}
let requiredFieldRulesCache = null;

function loadRequiredFieldRules() {
  if (requiredFieldRulesCache) return requiredFieldRulesCache;
  const resolvedPath = resolveRequiredFieldRulesPath();
  if (!resolvedPath) {
    console.warn("Required field rules file not found; skipping LLM required-field checks.");
    requiredFieldRulesCache = [];
    return requiredFieldRulesCache;
  }
  const raw = fs.readFileSync(resolvedPath, "utf-8");
  const parsed = JSON.parse(raw);
  requiredFieldRulesCache = Array.isArray(parsed?.rules) ? parsed.rules : [];
  return requiredFieldRulesCache;
}

function normalizeRuleValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.toLowerCase() : null;
  }
  return value;
}

function matchesRuleCondition(fieldValue, condition) {
  const normalizedValue = normalizeRuleValue(fieldValue);
  if (Array.isArray(condition)) {
    return condition.some((option) => {
      const normalizedOption = normalizeRuleValue(option);
      if (normalizedValue === normalizedOption) return true;
      if (typeof normalizedValue === "string" && typeof normalizedOption === "string") {
        return normalizedValue.includes(normalizedOption);
      }
      return false;
    });
  }
  if (condition === null) {
    return normalizedValue === null;
  }
  if (typeof condition === "string") {
    const normalizedOption = normalizeRuleValue(condition);
    if (normalizedValue === normalizedOption) return true;
    if (typeof normalizedValue === "string" && typeof normalizedOption === "string") {
      return normalizedValue.includes(normalizedOption);
    }
    return false;
  }
  return normalizedValue === condition;
}

function appliesRule(rule = {}, tradeline = {}) {
  const when = rule.applies_when || {};
  return Object.entries(when).every(([field, condition]) =>
    matchesRuleCondition(tradeline[field], condition)
  );
}

function failsRule(rule = {}, tradeline = {}) {
  const checks = rule.fails_when || {};
  return Object.entries(checks).every(([field, condition]) =>
    matchesRuleCondition(tradeline[field], condition)
  );
}

function mapRequiredFieldSeverity(value) {
  const key = String(value || "").trim().toLowerCase();
  const mapping = {
    deletion_eligible: 4,
    correction_or_deletion: 3,
    correction_required: 2,
  };
  return mapping[key] ?? 1;
}

function buildRequiredFieldPayload(entry = {}) {
  return {
    account_number: entry.account_number ?? null,
    account_status: entry.account_status ?? null,
    payment_status: entry.payment_status ?? null,
    balance: entry.balance ?? null,
    credit_limit: entry.credit_limit ?? null,
    high_credit: entry.high_credit ?? null,
    date_opened: entry.date_opened ?? null,
    date_last_payment: entry.last_payment ?? entry.date_last_payment ?? null,
    date_of_first_delinquency: entry.date_first_delinquency ?? entry.date_of_first_delinquency ?? null,
    last_reported: entry.last_reported ?? null,
    comments: entry.comments ?? null,
  };
}

function attachRequiredFieldViolations(tradelines = []) {
  const rules = loadRequiredFieldRules();
  const violations = [];
  const ruleViolations = Array.isArray(rules) ? rules : [];

  tradelines.forEach((tl) => {
    if (!tl || typeof tl !== "object") return;
    tl.violations = Array.isArray(tl.violations) ? tl.violations : [];
    tl.violations_grouped = tl.violations_grouped || {};
    const existingKeys = new Set(
      tl.violations
        .map((entry) => entry?.instanceKey || entry?.code || entry?.id)
        .filter(Boolean)
    );
    const perBureau = tl.per_bureau || {};
    for (const [bureau, data] of Object.entries(perBureau)) {
      if (!data || typeof data !== "object" || data.present === false) continue;
      const payload = buildRequiredFieldPayload(data);
      for (const rule of ruleViolations) {
        if (!appliesRule(rule, payload)) continue;
        if (!failsRule(rule, payload)) continue;
        const tradelineKey = data.tradelineKey || null;
        const instanceKey = [tradelineKey, rule.code].filter(Boolean).join("|");
        if (instanceKey && existingKeys.has(instanceKey)) continue;
        if (instanceKey) existingKeys.add(instanceKey);
        const entry = {
          id: rule.code,
          code: rule.code,
          title: rule.explanation,
          detail: rule.explanation,
          category: rule.category || "required_field_validation",
          severity: mapRequiredFieldSeverity(rule.severity),
          bureau,
          bureaus: [bureau],
          fcraSection: Array.isArray(rule.fcra) ? rule.fcra.join(", ") : "",
          tradelineKey,
          instanceKey,
          source: "required_field",
        };
        tl.violations.push(entry);
        if (!tl.violations_grouped.required_field) tl.violations_grouped.required_field = [];
        tl.violations_grouped.required_field.push(entry);
        violations.push(entry);
      }
    }
  });

  return violations;
}

async function runLLMAnalyzer({ buffer, filename }) {
  const { text, source } = await extractReportText({ buffer, filename });
  if (!text || !text.trim()) {
    throw new Error("Report text extraction returned empty text.");
  }
  const accountHint = /account\s*(?:number|#|no\.?)/i.test(text);
  let canonicalReport = await parseCanonicalReport(text, source);
  if (!canonicalReport.tradelines.length && accountHint) {
    canonicalReport = await parseCanonicalReportWithChunking(text, source);
  }
  canonicalReport = normalizeCanonicalReport(canonicalReport);
  canonicalReport = addTradelineKeysToCanonicalReport(canonicalReport);
  const auditResult = await auditCanonicalReport(canonicalReport);
  const violations = auditResult.violations || [];
  const tradelines = canonicalToTradelines(canonicalReport);
  const attachStats = attachViolationsToTradelines(tradelines, violations);
  const requiredFieldViolations = attachRequiredFieldViolations(tradelines);
  return {
    canonicalReport,
    violations,
    requiredFieldViolations,
    requiredFieldCount: requiredFieldViolations.length,
    auditRawCount: auditResult.rawCount ?? violations.length,
    tradelines,
    personalInfo: mapCanonicalIdentityToPersonalInfo(canonicalReport.identity),
    attachStats,
  };
}

function mapPythonPersonalInfo(raw){
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const bureaus = {};
    raw.forEach(entry => {
      if (!entry || typeof entry !== "object") return;
      Object.entries(entry).forEach(([field, values]) => {
        if (!values || typeof values !== "object") return;
        Object.entries(values).forEach(([bureau, value]) => {
          const name = (bureau || "").toString().trim();
          if (!name) return;
          if (!bureaus[name]) bureaus[name] = {};
          bureaus[name][field] = value;
        });
      });
    });
    return Object.keys(bureaus).length ? bureaus : null;
  }
  if (typeof raw === "object") {
    return raw;
  }
  return null;
}

function normalizeCreditorName(name = "") {
  return String(name || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeAccountNumber(value) {
  return String(value || "").replace(/[^0-9a-z]/gi, "").toLowerCase();
}

function collectAccountNumbers(tl = {}) {
  const numbers = new Set();
  const metaNums = tl?.meta?.account_numbers || {};
  Object.values(metaNums || {}).forEach(val => {
    if (val) numbers.add(String(val));
  });
  const perBureau = tl?.per_bureau || {};
  Object.values(perBureau || {}).forEach(entry => {
    if (!entry) return;
    [entry.account_number, entry.account_number_raw, entry.accountNumber]
      .forEach(val => {
        if (val) numbers.add(String(val));
      });
  });
  return Array.from(numbers);
}

function normalizeMoneyValue(value) {
  if (value === undefined || value === null || value === "") return "";
  const num = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(num)) return "";
  return num.toFixed(2);
}

function normalizeDateValue(value) {
  if (!value) return "";
  const str = String(value).trim();
  if (!str) return "";
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  return str.slice(0, 10);
}

function buildTradelineKeySet(tl = {}) {
  const keys = new Set();
  const creditorNorm = normalizeCreditorName(tl?.meta?.creditor || "") || "unknown";
  const accountNumbers = collectAccountNumbers(tl)
    .map(normalizeAccountNumber)
    .filter(Boolean);

  accountNumbers.forEach(acct => {
    keys.add(`${creditorNorm}|acct|${acct}`);
    if (acct.length >= 4) {
      keys.add(`${creditorNorm}|acct4|${acct.slice(-4)}`);
    }
  });

  const perBureau = tl?.per_bureau || {};
  Object.values(perBureau || {}).forEach(entry => {
    const summaryParts = [
      normalizeMoneyValue(entry?.balance ?? entry?.balance_raw),
      normalizeDateValue(entry?.date_opened ?? entry?.date_opened_raw),
      normalizeDateValue(entry?.last_reported ?? entry?.last_reported_raw),
    ].filter(Boolean);
    if (summaryParts.length) {
      keys.add(`${creditorNorm}|sig|${summaryParts.join("|")}`);
    }
  });

  keys.add(`${creditorNorm}|cred`);

  if (!keys.size) {
    keys.add(`unknown|${accountNumbers.join("|") || "na"}`);
  }

  return keys;
}

function buildTradelineMetadata(tl = {}, index = 0) {
  return {
    index,
    creditorRaw: tl?.meta?.creditor || "",
    creditorNorm: normalizeCreditorName(tl?.meta?.creditor || "") || "unknown",
    keys: Array.from(buildTradelineKeySet(tl)),
    accountNumbers: collectAccountNumbers(tl),
  };
}

function matchTradelines(jsTradelines = [], pythonTradelines = []) {
  const jsMeta = jsTradelines.map((tl, idx) => buildTradelineMetadata(tl, idx));
  const keyMap = new Map();
  jsMeta.forEach(meta => {
    meta.keys.forEach(key => {
      if (!keyMap.has(key)) keyMap.set(key, []);
      keyMap.get(key).push(meta);
    });
  });

  const usedJs = new Set();
  const matches = [];
  const unmatchedQueue = [];

  pythonTradelines.forEach((tl, pyIndex) => {
    const meta = buildTradelineMetadata(tl, pyIndex);
    let matched = null;
    for (const key of meta.keys) {
      const candidates = keyMap.get(key) || [];
      const available = candidates.find(c => !usedJs.has(c.index));
      if (available) {
        matched = { candidate: available, key };
        break;
      }
    }
    if (matched) {
      usedJs.add(matched.candidate.index);
      matches.push({
        jsIndex: matched.candidate.index,
        pyIndex,
        key: matched.key,
        strategy: "key",
        jsCreditor: matched.candidate.creditorRaw,
        pyCreditor: meta.creditorRaw,
      });
    } else {
      unmatchedQueue.push({ pyIndex, meta });
    }
  });

  const stillUnmatchedPy = [];
  unmatchedQueue.forEach(item => {
    const candidate = jsMeta.find(meta => !usedJs.has(meta.index));
    if (candidate) {
      usedJs.add(candidate.index);
      matches.push({
        jsIndex: candidate.index,
        pyIndex: item.pyIndex,
        key: "fallback:index",
        strategy: "fallback",
        jsCreditor: candidate.creditorRaw,
        pyCreditor: item.meta.creditorRaw,
      });
    } else {
      stillUnmatchedPy.push({
        index: item.pyIndex,
        creditor: item.meta.creditorRaw,
        accountNumbers: item.meta.accountNumbers,
        keys: item.meta.keys,
      });
    }
  });

  const unmatchedJs = jsMeta
    .filter(meta => !usedJs.has(meta.index))
    .map(meta => ({
      index: meta.index,
      creditor: meta.creditorRaw,
      accountNumbers: meta.accountNumbers,
      keys: meta.keys,
    }));

  return { matches, unmatchedJs, unmatchedPy: stillUnmatchedPy };
}

export function runBasicRuleAudit(report = {}) {
  const touched = new Set();
  (report.tradelines || []).forEach((tl, idx) => {
    if (!tl || typeof tl !== "object") return;

    const violations = Array.isArray(tl.violations) ? tl.violations : [];
    tl.violations = violations;

    const grouped = tl.violations_grouped && typeof tl.violations_grouped === "object"
      ? tl.violations_grouped
      : {};
    tl.violations_grouped = grouped;

    const ensureBasicGroup = () => {
      if (!Array.isArray(grouped.Basic)) {
        grouped.Basic = [];
      }
      return grouped.Basic;
    };

    const pushIntoBasic = entry => {
      const basicGroup = ensureBasicGroup();
      if (!basicGroup.some(v => v && v.id === entry.id)) {
        basicGroup.push(entry);
        touched.add(idx);
      }
    };

    const ensureViolation = (id, title) => {
      let entry = violations.find(v => v && v.id === id);
      if (!entry) {
        entry = { id, title, source: "basic_rule_audit", category: "Basic" };
        violations.push(entry);
        touched.add(idx);
      }
      return entry;
    };

    const add = (id, title) => {
      const entry = ensureViolation(id, title);
      pushIntoBasic(entry);
    };

    const perBureau = tl.per_bureau || {};
    const tu = perBureau.TransUnion || {};
    const past = String(tu.past_due ?? "").replace(/[^0-9]/g, "");
    if (/current/i.test(tu.account_status || "") && past && past !== "0") {
      add("PAST_DUE_CURRENT", "Account marked current but shows past due amount");
    }

    for (const data of Object.values(perBureau)) {
      if (/charge[- ]?off|collection/i.test(data.account_status || "") && !data.date_first_delinquency) {
        add("MISSING_DOFD", "Charge-off or collection missing date of first delinquency");
        break;
      }
    }

    const balances = Object.values(perBureau)
      .map(b => b.balance)
      .filter(v => v !== undefined && v !== null)
      .map(v => Number(String(v).replace(/[^0-9.-]/g, "")))
      .filter(n => !isNaN(n));
    if (balances.length > 1 && new Set(balances).size > 1) {
      add("BALANCE_MISMATCH", "Balances differ across bureaus");
    }
  });
  return touched;
}

// Attempt to pull credit scores from raw HTML uploads so the client portal
// can display them without requiring additional manual input. The format of
// consumer credit reports varies, but typically the bureau name appears near a
// three-digit score. This helper scans the HTML text for each bureau and
// returns any score it finds.
function extractCreditScores(html){
  const scores = {};
  const patterns = {
    transunion: /transunion[^0-9]{0,100}(\d{3})/i,
    experian: /experian[^0-9]{0,100}(\d{3})/i,
    equifax: /equifax[^0-9]{0,100}(\d{3})/i,
  };
  for(const [key, re] of Object.entries(patterns)){
    const m = html.match(re);
    if(m) scores[key] = Number(m[1]);
  }
  return scores;
}

function normalizeScoreValue(value){
  if(value === undefined || value === null) return null;
  if(typeof value === "number" && Number.isFinite(value)){
    return Math.round(value);
  }
  const match = String(value).match(/\d{2,3}/);
  if(!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function mergeCreditScores(existing, incoming){
  const normalized = {};
  for(const [key, value] of Object.entries(incoming || {})){
    const normalizedValue = normalizeScoreValue(value);
    if(normalizedValue) normalized[key] = normalizedValue;
  }
  if(!Object.keys(normalized).length){
    return existing || null;
  }
  const merged = { ...(existing || {}) };
  for(const [key, value] of Object.entries(normalized)){
    merged[key] = value;
  }
  const bureaus = [merged.transunion, merged.experian, merged.equifax]
    .map(v => Number(v))
    .filter(v => Number.isFinite(v) && v > 0);
  if(bureaus.length){
    merged.current = Math.round(bureaus.reduce((sum, val) => sum + val, 0) / bureaus.length);
  }
  merged.updatedAt = new Date().toISOString();
  merged.source = "report_upload";
  return merged;
}

// =================== Consumers ===================
app.get("/api/consumers", authenticate, requirePermission("consumers"), async (_req, res) => {
  res.json({ ok: true, consumers: (await loadDB()).consumers });
});

app.get("/api/analytics/client-locations", authenticate, requirePermission("consumers"), async (_req, res) => {
  const db = await loadDB();
  const locations = [];
  let changed = false;
  for (const consumer of db.consumers) {
    if (!consumer) continue;
    const lat = Number(consumer.geo_lat);
    const lon = Number(consumer.geo_lon);
    const signature = addressSignature(consumer);
    const geoStale = consumer.geo_signature !== signature;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || geoStale) {
      const updated = refreshConsumerGeo(consumer, { force: true });
      if (updated || geoStale) {
        changed = true;
      }
    }
    const resolvedLat = Number(consumer.geo_lat);
    const resolvedLon = Number(consumer.geo_lon);
    if (Number.isFinite(resolvedLat) && Number.isFinite(resolvedLon)) {
      locations.push({
        id: consumer.id,
        name: consumer.name || "Unnamed",
        city: consumer.city || "",
        state: consumer.state || "",
        status: consumer.status || "active",
        lat: resolvedLat,
        lon: resolvedLon,
        precision: consumer.geo_precision || "zip",
        source: consumer.geo_source || "us-zip-centroid",
      });
    }
  }
  if (changed) {
    await saveDB(db);
  }
  res.json({ ok: true, locations });
});

app.get("/api/dashboard/summary", authenticate, requirePermission("reports"), async (_req, res) => {
  try {
    const [db, leadsDb, invoicesDb, stateEntries, dashboardConfig] = await Promise.all([
      loadDB(),
      loadLeadsDB(),
      loadInvoicesDB(),
      listAllConsumerStates(),
      getDashboardConfig(),
    ]);

    const goalsConfig = dashboardConfig.goals || {};
    const ladderConfig = dashboardConfig.ladder || {};

    const consumers = Array.isArray(db.consumers) ? db.consumers : [];
    const consumerMap = new Map();
    const consumerStatusCounts = {};
    let reportsLast30d = 0;
    const creditScores = [];
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    for (const consumer of consumers) {
      if (!consumer) continue;
      consumerMap.set(consumer.id, consumer);
      const status = normalizeConsumerStatus(consumer.status);
      consumerStatusCounts[status] = (consumerStatusCounts[status] || 0) + 1;
      const reports = Array.isArray(consumer.reports) ? consumer.reports : [];
      for (const report of reports) {
        const uploaded = safeDate(report?.uploadedAt || report?.createdAt);
        if (uploaded && uploaded.getTime() >= thirtyDaysAgo) {
          reportsLast30d += 1;
        }
      }
    }

    for (const entry of stateEntries) {
      if (entry?.creditScore) {
        const scores = [
          entry.creditScore.current,
          entry.creditScore.transunion,
          entry.creditScore.experian,
          entry.creditScore.equifax,
        ]
          .map((value) => (Number.isFinite(value) ? value : Number.parseFloat(value)))
          .filter((value) => Number.isFinite(value));
        creditScores.push(...scores);
      }
    }

    const averageCreditScore = creditScores.length
      ? Math.round(creditScores.reduce((sum, value) => sum + value, 0) / creditScores.length)
      : null;

    const leads = Array.isArray(leadsDb.leads)
      ? leadsDb.leads.map((lead) => ({
          ...lead,
          status: normalizeLeadStatus(lead.status),
        }))
      : [];
    const leadStatusCounts = {};
    for (const lead of leads) {
      leadStatusCounts[lead.status] = (leadStatusCounts[lead.status] || 0) + 1;
    }
    const consultStatuses = new Set(["qualified", "won"]);
    const consultCount = leads.filter((lead) => consultStatuses.has(lead.status)).length;
    const closeCount = leads.filter((lead) => lead.status === "won").length;
    const leadToConsultRate = roundNumber(toPercent(consultCount, leads.length) ?? 0, 1);
    const leadToCloseRate = roundNumber(toPercent(closeCount, leads.length) ?? 0, 1);
    const leadsNewLast7d = leads.filter((lead) => {
      const created = safeDate(lead.createdAt);
      return created && created.getTime() >= sevenDaysAgo;
    }).length;
    const consultsLast7d = leads.filter((lead) => {
      if (!consultStatuses.has(lead.status)) return false;
      const stamp = safeDate(lead.updatedAt || lead.createdAt);
      return stamp && stamp.getTime() >= sevenDaysAgo;
    }).length;

    const invoices = Array.isArray(invoicesDb.invoices)
      ? invoicesDb.invoices.map((invoice) => ({
          ...invoice,
          amount: roundCurrency(coerceAmount(invoice.amount)),
        }))
      : [];
    const totalBilled = roundCurrency(invoices.reduce((sum, invoice) => sum + invoice.amount, 0));
    const totalCollected = roundCurrency(
      invoices.filter((invoice) => invoice.paid).reduce((sum, invoice) => sum + invoice.amount, 0),
    );
    const outstanding = Math.max(0, roundCurrency(totalBilled - totalCollected));
    const invoiceCount = invoices.length;
    const averageInvoice = invoiceCount ? roundCurrency(totalBilled / invoiceCount) : null;
    const invoicesLast30d = roundCurrency(
      invoices
        .filter((invoice) => {
          const created = safeDate(invoice.createdAt || invoice.updatedAt);
          return created && created.getTime() >= thirtyDaysAgo;
        })
        .reduce((sum, invoice) => sum + invoice.amount, 0),
    );

    const nowDate = new Date(now);
    const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
    const monthEnd = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 1).getTime();
    const monthlyRecurringRevenue = roundCurrency(
      invoices
        .filter((invoice) => {
          if (invoice.paid) return false;
          const due = safeDate(invoice.due);
          if (!due) return false;
          const dueTs = due.getTime();
          return dueTs >= monthStart && dueTs < monthEnd;
        })
        .reduce((sum, invoice) => sum + invoice.amount, 0),
    );

    const outstandingInvoices = invoices
      .filter((invoice) => !invoice.paid)
      .map((invoice) => ({
        id: invoice.id,
        consumerId: invoice.consumerId,
        amount: invoice.amount,
        due: invoice.due ? safeDate(invoice.due)?.toISOString() ?? null : null,
        consumerName: consumerMap.get(invoice.consumerId)?.name || "Client",
      }))
      .sort((a, b) => b.amount - a.amount);
    const topOutstanding = outstandingInvoices.length ? outstandingInvoices[0] : null;

    const reminders = [];
    let overdueCount = 0;
    for (const entry of stateEntries) {
      if (!entry) continue;
      const entryOverdue = Number(entry.overdueCount);
      if (Number.isFinite(entryOverdue) && entryOverdue > 0) {
        overdueCount += entryOverdue;
      }
      if (Array.isArray(entry.events)) {
        for (const event of entry.events) {
          if ((event?.type || '').toLowerCase() !== 'letter_reminder') continue;
          const dueRaw = event.payload?.due || event.payload?.dueDate || event.payload?.due_at;
          const due = safeDate(dueRaw);
          if (due && due.getTime() <= now) {
            overdueCount += 1;
          }
        }
      }
      for (const reminder of entry.reminders || []) {
        if (reminder.status === "overdue") {
          continue;
        }
        if (!Number.isFinite(reminder.dueTs)) continue;
        reminders.push({
          id: reminder.id,
          consumerId: entry.id,
          consumerName: consumerMap.get(entry.id)?.name || "Client",
          due: new Date(reminder.dueTs).toISOString(),
          title:
            reminder.payload?.title ||
            reminder.payload?.subject ||
            reminder.notes ||
            "Reminder",
          description:
            reminder.payload?.description ||
            reminder.payload?.notes ||
            reminder.payload?.text ||
            "",
        });
      }
    }
    reminders.sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
    const upcomingReminders = reminders.slice(0, 5);

    const recentEvents = [];
    for (const entry of stateEntries) {
      for (const event of entry.events || []) {
        const at = safeDate(event.at);
        recentEvents.push({
          id: event.id,
          consumerId: entry.id,
          consumerName: consumerMap.get(entry.id)?.name || "Client",
          type: event.type || "event",
          at: at ? at.toISOString() : null,
          summary:
            (event.payload?.text || event.payload?.title || event.payload?.subject || "").slice(0, 160) ||
            event.type ||
            "event",
        });
      }
    }
    recentEvents.sort((a, b) => {
      const aTs = a.at ? Date.parse(a.at) : 0;
      const bTs = b.at ? Date.parse(b.at) : 0;
      return bTs - aTs;
    });

    const collectionRate = roundNumber(toPercent(totalCollected, totalBilled) ?? 0, 1);
    const retentionDenominator =
      (consumerStatusCounts.active || 0) +
      (consumerStatusCounts.completed || 0) +
      (consumerStatusCounts.lost || 0);
    const retentionRate = roundNumber(
      toPercent(
        (consumerStatusCounts.active || 0) + (consumerStatusCounts.completed || 0),
        retentionDenominator,
      ) ?? 0,
      1,
    );

    let nextRevenueMove =
      "Bundle the automation and monitoring offer at $249/mo for warm leads.";
    if (topOutstanding) {
      const dueLabel = topOutstanding.due ? new Date(topOutstanding.due) : null;
      const dueText = dueLabel
        ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(dueLabel)
        : "soon";
      const amountText = formatUsd(topOutstanding.amount);
      nextRevenueMove = `Check in with ${topOutstanding.consumerName} about the ${amountText} balance due ${dueText}. Offer certified mail tracking as the premium add-on.`;
    } else if (outstanding > 0) {
      const amountText = formatUsd(outstanding);
      nextRevenueMove = `Close out the ${amountText} outstanding pipeline with a concierge call-to-action. Bundle certified mail credits.`;
    }

    res.json({
      ok: true,
      summary: {
        totals: {
          consumers: consumers.length,
          leads: leads.length,
        },
        consumers: {
          byStatus: consumerStatusCounts,
          reportsLast30d,
          averageCreditScore,
        },
        leads: {
          byStatus: leadStatusCounts,
          newLast7d: leadsNewLast7d,
          consultsLast7d,
        },
        revenue: {
          totalBilled,
          totalCollected,
          outstanding,
          averageInvoice,
          invoicesLast30d,
          monthlyRecurringRevenue,
          collectionRate,
          topOutstanding,
        },
        reminders: {
          upcoming: upcomingReminders,
          overdueCount,
        },
        activities: {
          recent: recentEvents.slice(0, 8),
        },
        kpis: {
          leadToConsultRate,
          leadToCloseRate,
          retentionRate,
          revenueCollectionRate: collectionRate,
        },
        goals: goalsConfig,
        ladder: ladderConfig,
        focus: {
          nextRevenueMove,
        },
      },
    });
  } catch (err) {
    logError("DASHBOARD_SUMMARY_FAIL", "Failed to build dashboard summary", { message: err?.message });
    res.status(500).json({ ok: false, error: "Failed to build dashboard summary" });
  }
});

app.get("/api/dashboard/config", authenticate, requirePermission("reports"), async (_req, res) => {
  try {
    const config = await getDashboardConfig();
    res.json({ ok: true, config });
  } catch (err) {
    logError("DASHBOARD_CONFIG_LOAD_FAILED", "Failed to load dashboard config", { message: err?.message });
    res.status(500).json({ ok: false, error: "Failed to load dashboard config" });
  }
});

app.put("/api/dashboard/config", authenticate, requirePermission(["admin", "reports"]), async (req, res) => {
  try {
    const patch = (req.body && typeof req.body === "object") ? req.body : {};
    const config = await updateDashboardConfig(patch);
    res.json({ ok: true, config });
  } catch (err) {
    logError("DASHBOARD_CONFIG_SAVE_FAILED", "Failed to update dashboard config", { message: err?.message });
    res.status(400).json({ ok: false, error: err?.message || "Unable to update dashboard config" });
  }
});
app.post("/api/consumers", authenticate, requirePermission("consumers", { allowGuest: true }), async (req, res) => {
  const db = await loadDB();

  const isTestClient = Boolean(req.body?.testClient);
  const requestedIdRaw = isTestClient && typeof req.body?.id === "string" ? req.body.id.trim() : "";
  const requestedId = requestedIdRaw && /^[a-z0-9_-]{3,}$/i.test(requestedIdRaw) ? requestedIdRaw : null;
  let id = nanoid(10);
  if (requestedId && !db.consumers.some((existing) => existing?.id === requestedId)) {
    id = requestedId;
  }

  const nowIso = new Date().toISOString();
  const consumer = {
    id,
    name: req.body.name || (isTestClient ? "Rule Debug Client" : "Unnamed"),
    email: req.body.email || "",
    phone: req.body.phone || "",
    addr1: req.body.addr1 || "",
    addr2: req.body.addr2 || "",
    city: req.body.city || "",
    state: req.body.state || "",
    zip: req.body.zip || "",
    ssn_last4: req.body.ssn_last4 || "",
    dob: req.body.dob || "",
    sale: Number(req.body.sale) || 0,
    paid: Number(req.body.paid) || 0,
    status: req.body.status || "active",
    createdAt: nowIso,
    updatedAt: nowIso,
    reports: [],
  };

  if (isTestClient) {
    const ruleReport = buildRuleDebugReport({ includeNegativeItems: true });
    const reportPayload = {
      tradelines: ruleReport.tradelines,
      negative_items: ruleReport.negativeItems,
      inquiries: [],
      inquiry_summary: {},
      personal_info: {},
      personal_info_mismatches: {},
      generated_at: nowIso,
      meta: { source: "rule-debug-auto" },
    };
    const reportId = `rule-debug-${nanoid(8)}`;
    const reportSize = Buffer.byteLength(JSON.stringify(reportPayload), "utf-8");
    consumer.reports.push({
      id: reportId,
      uploadedAt: nowIso,
      filename: "rule-debug-report.json",
      size: reportSize,
      summary: {
        tradelines: ruleReport.summary.tradelines,
        negative_items: ruleReport.summary.negative_items,
        personalInfoMismatches: {},
      },
      data: reportPayload,
    });
    consumer.testClient = true;
  }

  refreshConsumerGeo(consumer, { force: true });
  db.consumers.push(consumer);
  await saveDB(db);
  await addEvent(id, "consumer_created", { name: consumer.name });
  if (isTestClient) {
    await addEvent(id, "test_client_seeded", { ruleCount: consumer.reports[0]?.summary?.tradelines || 0 });
  }
  res.json({ ok: true, consumer });
});

app.put("/api/consumers/:id", authenticate, requirePermission("consumers"), async (req,res)=>{

  const db = await loadDB();

  const c = db.consumers.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({ ok:false, error:"Consumer not found" });
  const prevSignature = c.geo_signature || addressSignature(c);
  Object.assign(c, {
    name:req.body.name??c.name, email:req.body.email??c.email, phone:req.body.phone??c.phone,
    addr1:req.body.addr1??c.addr1, addr2:req.body.addr2??c.addr2, city:req.body.city??c.city,
    state:req.body.state??c.state, zip:req.body.zip??c.zip, ssn_last4:req.body.ssn_last4??c.ssn_last4,
    dob:req.body.dob??c.dob,
    sale: req.body.sale !== undefined ? Number(req.body.sale) : c.sale,
    paid: req.body.paid !== undefined ? Number(req.body.paid) : c.paid,
    status: req.body.status ?? c.status ?? "active"

  });
  const newSignature = addressSignature(c);
  const needsGeoRefresh = prevSignature !== newSignature || !Number.isFinite(Number(c.geo_lat)) || !Number.isFinite(Number(c.geo_lon));
  if(needsGeoRefresh){
    refreshConsumerGeo(c, { force: true });
  }
  c.updatedAt = new Date().toISOString();
  await saveDB(db);
  await addEvent(c.id, "consumer_updated", { fields: Object.keys(req.body||{}) });
  res.json({ ok:true, consumer:c });
});

app.delete("/api/consumers/:id", authenticate, requirePermission("consumers"), async (req,res)=>{

  const db=await loadDB();

  const i=db.consumers.findIndex(c=>c.id===req.params.id);
  if(i===-1) return res.status(404).json({ ok:false, error:"Consumer not found" });
  const removed = db.consumers[i];
  db.consumers.splice(i,1);
  await saveDB(db);
  await addEvent(removed.id, "consumer_deleted", {});
  res.json({ ok:true });
});

// =================== Leads ===================
app.get("/api/leads", async (_req,res)=> res.json({ ok:true, ...(await loadLeadsDB()) }));


app.post("/api/leads", async (req,res)=>{
  const db = await loadLeadsDB();
  const id = nanoid(10);
  const lead = {
    id,
    name: req.body.name || "",
    email: req.body.email || "",
    phone: req.body.phone || "",
    addr1: req.body.addr1 || "",
    addr2: req.body.addr2 || "",
    city: req.body.city || "",
    state: req.body.state || "",
    zip: req.body.zip || "",
    source: req.body.source || "",
    notes: req.body.notes || "",
    status: normalizeLeadStatus(req.body.status),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.leads.push(lead);
  await saveLeadsDB(db);
  res.json({ ok:true, lead });
});

app.put("/api/leads/:id", async (req,res)=>{
  const db = await loadLeadsDB();
  const lead = db.leads.find(l=>l.id===req.params.id);
  if(!lead) return res.status(404).json({ error:"Not found" });
  Object.assign(lead, {
    name: req.body.name ?? lead.name,
    email: req.body.email ?? lead.email,
    phone: req.body.phone ?? lead.phone,
    addr1: req.body.addr1 ?? lead.addr1,
    addr2: req.body.addr2 ?? lead.addr2,
    city: req.body.city ?? lead.city,
    state: req.body.state ?? lead.state,
    zip: req.body.zip ?? lead.zip,
    source: req.body.source ?? lead.source,
    notes: req.body.notes ?? lead.notes,
    status: req.body.status !== undefined ? normalizeLeadStatus(req.body.status) : lead.status
  });
  lead.updatedAt = new Date().toISOString();
  await saveLeadsDB(db);
  res.json({ ok:true, lead });
});

app.delete("/api/leads/:id", async (req,res)=>{
  const db = await loadLeadsDB();
  const idx = db.leads.findIndex(l=>l.id===req.params.id);
  if(idx === -1) return res.status(404).json({ error:"Not found" });
  db.leads.splice(idx,1);
  await saveLeadsDB(db);
  res.json({ ok:true });
});

// =================== Invoices ===================
app.get("/api/invoices/:consumerId", async (req,res)=>{
  const db = await loadInvoicesDB();
  const list = db.invoices.filter(inv => inv.consumerId === req.params.consumerId);
  res.json({ ok:true, invoices: list });
});

app.post("/api/invoices", async (req,res)=>{
  try {
    const consumerId = req.body?.consumerId;
    if(!consumerId){
      return res.status(400).json({ ok:false, error: "Missing consumerId" });
    }
    const mainDb = await loadDB();
    const consumer = mainDb.consumers.find(c => c.id === consumerId);
    if(!consumer){
      return res.status(404).json({ ok:false, error: "Consumer not found" });
    }
    const result = await createInvoice({
      consumerId,
      desc: req.body?.desc || "",
      amount: req.body?.amount,
      due: req.body?.due || null,
      paid: req.body?.paid,
      company: req.body?.company || {},
      payLink: req.body?.payLink || req.body?.payUrl || null,
      paymentProvider: req.body?.paymentProvider || null,
      stripeSessionId: req.body?.stripeSessionId || null,
      message: req.body?.message || null,
      planId: req.body?.planId || null,
      consumer,
      req,
    });
    res.json({ ok:true, invoice: result.invoice, warning: result.warning });
  } catch (err) {
    console.error("Failed to create invoice", err);
    if(err?.code === "CONSUMER_NOT_FOUND"){
      return res.status(404).json({ ok:false, error: "Consumer not found" });
    }
    res.status(500).json({ ok:false, error: "Failed to create invoice" });
  }
});

// =================== Billing Plans ===================
app.get("/api/billing/plans/:consumerId", async (req,res)=>{
  const plansDb = await loadBillingPlansDB();
  const plans = plansDb.plans.filter(plan => plan.consumerId === req.params.consumerId);
  res.json({ ok:true, plans: plans.map(clonePlan) });
});

app.post("/api/billing/plans", async (req,res)=>{
  try {
    const payload = req.body || {};
    if(!payload.consumerId){
      return res.status(400).json({ ok:false, error: "Missing consumerId" });
    }
    const mainDb = await loadDB();
    const consumer = mainDb.consumers.find(c => c.id === payload.consumerId);
    if(!consumer){
      return res.status(404).json({ ok:false, error: "Consumer not found" });
    }
    const plansDb = await loadBillingPlansDB();
    const plan = buildPlanFromPayload(payload);
    plansDb.plans.push(plan);
    await refreshPlanReminder(plan);
    await saveBillingPlansDB(plansDb);
    let savedPlan = plansDb.plans.find(p => p.id === plan.id) || plan;
    await addEvent(plan.consumerId, "billing_plan_created", {
      planId: plan.id,
      name: plan.name,
      amount: plan.amount,
      nextBillDate: plan.nextBillDate,
    });
    let invoice = null;
    let warning = null;
    if(payload.sendNow){
      try {
        const sendResult = await sendPlanInvoice({
          plan: savedPlan,
          plansDb,
          req,
          company: payload.company || {},
          consumer,
        });
        savedPlan = sendResult.plan;
        invoice = sendResult.invoice;
        warning = sendResult.warning || null;
      } catch (err) {
        console.error("Failed to send plan invoice", err);
        return res.status(500).json({ ok:false, error: "Plan saved but invoice failed" });
      }
    }
    res.json({ ok:true, plan: clonePlan(savedPlan), ...(invoice ? { invoice, warning } : {}) });
  } catch (err) {
    console.error("Failed to create billing plan", err);
    res.status(500).json({ ok:false, error: "Failed to create billing plan" });
  }
});

app.put("/api/billing/plans/:id", async (req,res)=>{
  try {
    const plansDb = await loadBillingPlansDB();
    const plan = plansDb.plans.find(p => p.id === req.params.id);
    if(!plan){
      return res.status(404).json({ ok:false, error: "Plan not found" });
    }
    applyPlanUpdates(plan, req.body || {});
    await refreshPlanReminder(plan);
    await saveBillingPlansDB(plansDb);
    await addEvent(plan.consumerId, "billing_plan_updated", {
      planId: plan.id,
      nextBillDate: plan.nextBillDate,
      active: plan.active,
    });
    res.json({ ok:true, plan: clonePlan(plan) });
  } catch (err) {
    console.error("Failed to update billing plan", err);
    res.status(500).json({ ok:false, error: "Failed to update billing plan" });
  }
});

app.post("/api/billing/plans/:id/send", async (req,res)=>{
  try {
    const plansDb = await loadBillingPlansDB();
    const plan = plansDb.plans.find(p => p.id === req.params.id);
    if(!plan){
      return res.status(404).json({ ok:false, error: "Plan not found" });
    }
    const mainDb = await loadDB();
    const consumer = mainDb.consumers.find(c => c.id === plan.consumerId);
    if(!consumer){
      return res.status(404).json({ ok:false, error: "Consumer not found" });
    }
    const sendResult = await sendPlanInvoice({
      plan,
      plansDb,
      req,
      company: req.body?.company || {},
      consumer,
    });
    res.json({ ok:true, plan: clonePlan(sendResult.plan), invoice: sendResult.invoice, warning: sendResult.warning || null });
  } catch (err) {
    console.error("Failed to send billing plan invoice", err);
    if(err?.code === "PLAN_INACTIVE"){
      return res.status(400).json({ ok:false, error: "Plan is paused" });
    }
    if(err?.code === "PLAN_NO_SCHEDULE"){
      return res.status(400).json({ ok:false, error: "Plan has no upcoming bill date" });
    }
    res.status(500).json({ ok:false, error: "Failed to send plan invoice" });
  }
});

app.post("/api/invoices/:id/checkout", async (req, res) => {
  const stripeClient = await getStripeClient(req);
  if(!stripeClient){
    return res.status(400).json({ ok:false, error: "Stripe is not configured" });
  }
  const db = await loadInvoicesDB();
  const inv = db.invoices.find(i => i.id === req.params.id);
  if(!inv) return res.status(404).json({ ok:false, error: "Not found" });
  if(req.body?.consumerId && req.body.consumerId !== inv.consumerId){
    return res.status(403).json({ ok:false, error: "Invoice mismatch" });
  }
  if(inv.paid){
    return res.status(400).json({ ok:false, error: "Invoice already marked paid" });
  }
  const amountCents = Math.round((Number(inv.amount) || 0) * 100);
  if(!Number.isFinite(amountCents) || amountCents <= 0){
    return res.status(400).json({ ok:false, error: "Invoice has no outstanding balance" });
  }
  const mainDb = await loadDB();
  const consumer = mainDb.consumers.find(c => c.id === inv.consumerId) || {};
  const company = req.body?.company || {};
  const checkout = await createStripeCheckoutSession({ invoice: inv, consumer, company, req, stripeClient });
  if(!checkout?.url){
    return res.status(502).json({ ok:false, error: "Unable to start checkout" });
  }
  inv.payLink = buildInvoicePayUrl(inv, req);
  inv.paymentProvider = "stripe";
  inv.stripeSessionId = checkout.sessionId;
  await saveInvoicesDB(db);
  res.json({ ok:true, url: checkout.url, sessionId: checkout.sessionId });
});

app.get("/pay/:id", async (req, res) => {
  const stripeClient = await getStripeClient(req);
  if(!stripeClient){
    return res.status(503).send("Stripe checkout is not configured. Please contact support.");
  }
  const db = await loadInvoicesDB();
  const inv = db.invoices.find(i => i.id === req.params.id);
  if(!inv) return res.status(404).send("Invoice not found.");
  if(inv.paid){
    return res.status(410).send("This invoice is already marked as paid.");
  }
  const mainDb = await loadDB();
  const consumer = mainDb.consumers.find(c => c.id === inv.consumerId) || {};
  const checkout = await createStripeCheckoutSession({ invoice: inv, consumer, req, stripeClient });
  if(!checkout?.url){
    return res.status(502).send("Unable to start Stripe checkout. Please contact support.");
  }
  inv.payLink = buildInvoicePayUrl(inv, req);
  inv.paymentProvider = "stripe";
  inv.stripeSessionId = checkout.sessionId;
  await saveInvoicesDB(db);
  res.redirect(303, checkout.url);
});

app.put("/api/invoices/:id", async (req,res)=>{
  const db = await loadInvoicesDB();
  const inv = db.invoices.find(i=>i.id===req.params.id);
  if(!inv) return res.status(404).json({ ok:false, error:"Not found" });
  const tenantInfo = tenantScope(req || DEFAULT_TENANT_ID);
  const wasPaid = !!inv.paid;
  if(req.body.desc !== undefined) inv.desc = req.body.desc;
  if(req.body.amount !== undefined) inv.amount = Number(req.body.amount) || 0;
  if(req.body.due !== undefined) inv.due = req.body.due;
  if(req.body.paid !== undefined) inv.paid = !!req.body.paid;
  if(req.body.payLink !== undefined || req.body.payUrl !== undefined){
    const stripeClient = await getStripeClient(req);
    const prefersStripe = (req.body.paymentProvider || inv.paymentProvider) === "stripe";
    const base = (process.env.PORTAL_PAYMENT_BASE || resolvePortalBase(req) || "https://pay.example.com").replace(/\/$/, "");
    const updatedLink = req.body.payLink || req.body.payUrl || (prefersStripe && stripeClient ? buildInvoicePayUrl(inv, req) : `${base}/${inv.id}`);
    inv.payLink = updatedLink;
  }
  if(req.body.paymentProvider !== undefined){
    inv.paymentProvider = req.body.paymentProvider ? String(req.body.paymentProvider) : null;
  }
  if(req.body.stripeSessionId !== undefined){
    inv.stripeSessionId = req.body.stripeSessionId ? String(req.body.stripeSessionId) : null;
  }
  inv.updatedAt = new Date().toISOString();
  await saveInvoicesDB(db);
  if(!wasPaid && inv.paid){
    const amountCents = Math.round((Number(inv.amount) || 0) * 100);
    await recordCheckoutStage({
      tenantId: tenantInfo.tenantId,
      invoiceId: inv.id,
      stage: "invoice_marked_paid",
      success: true,
      sessionId: inv.stripeSessionId || null,
      amountCents,
      metadata: {
        paymentProvider: inv.paymentProvider || null,
      },
    });
  }
  res.json({ ok:true, invoice: inv });
});

// =================== Users ===================
app.post("/api/register", async (req,res)=>{
  const db = await loadUsersDB();
  if(db.users.find(u=>u.username===req.body.username)) return res.status(400).json({ ok:false, error:"User exists" });
  const user = normalizeUser({
    id: nanoid(10),
    username: req.body.username || "",
    name: req.body.name || "",
    password: bcrypt.hashSync(req.body.password || "", 10),
    role: "member",
    tenantId: req.body.tenantId || DEFAULT_TENANT_ID,
    permissions: Array.isArray(req.body.permissions) ? req.body.permissions : []
  });
  db.users.push(user);
  await saveUsersDB(db);
  res.json({ ok:true, token: generateToken(user) });
});

app.post("/api/login", async (req,res)=>{
  logInfo("LOGIN_ATTEMPT", "Admin login attempt", { username: req.body.username });
  const db = await loadUsersDB();
  const user = db.users.find(u=>u.username===req.body.username);
  if(!user){
    logWarn("LOGIN_FAIL", "Admin login failed: user not found", { username: req.body.username });
    return res.status(401).json({ ok:false, error:"Invalid credentials" });
  }
  if(!bcrypt.compareSync(req.body.password || "", user.password)){
    logWarn("LOGIN_FAIL", "Admin login failed: wrong password", { username: req.body.username });
    return res.status(401).json({ ok:false, error:"Invalid credentials" });
  }
  logInfo("LOGIN_SUCCESS", "Admin login successful", { userId: user.id });
  res.json({ ok:true, token: generateToken(user) });
});

app.post("/api/client/login", async (req,res)=>{
  const db = await loadDB();
  let client = null;
  if(req.body.token){
    logInfo("CLIENT_LOGIN_ATTEMPT", "Client login with token", { tokenPrefix: req.body.token.slice(0,4) });
    client = db.consumers.find(c=>c.portalToken===req.body.token);
  } else if(req.body.email){
    logInfo("CLIENT_LOGIN_ATTEMPT", "Client login with email", { email: req.body.email });
    client = db.consumers.find(c=>c.email===req.body.email);
    if(!client || !client.password || !bcrypt.compareSync(req.body.password || "", client.password)){
      logWarn("CLIENT_LOGIN_FAIL", "Client login failed: invalid password", { email: req.body.email });
      return res.status(401).json({ ok:false, error:"Invalid credentials" });
    }
  } else {
    return res.status(400).json({ ok:false, error:"Missing credentials" });
  }
  if(!client){
    logWarn("CLIENT_LOGIN_FAIL", "Client login failed: not found", { email: req.body.email, tokenPrefix: req.body.token && req.body.token.slice(0,4) });
    return res.status(401).json({ ok:false, error:"Invalid credentials" });
  }
  const clientTenant = sanitizeTenantId(client?.tenantId || client?.ownerTenantId || DEFAULT_TENANT_ID);
  const u = { id: client.id, username: client.email || client.name || "client", role: "client", tenantId: clientTenant, permissions: [] };
  logInfo("CLIENT_LOGIN_SUCCESS", "Client login successful", { clientId: client.id });
  res.json({ ok:true, token: generateToken(u) });
});

app.post("/api/request-password-reset", async (req,res)=>{
  const db = await loadUsersDB();
  const user = db.users.find(u=>u.username===req.body.username);
  if(!user) return res.status(404).json({ ok:false, error:"Not found" });
  const token = nanoid(12);
  user.resetToken = token;
  await saveUsersDB(db);
  res.json({ ok:true, token });
});

app.post("/api/reset-password", async (req,res)=>{
  const db = await loadUsersDB();
  const user = db.users.find(u=>u.username===req.body.username && u.resetToken===req.body.token);
  if(!user) return res.status(400).json({ ok:false, error:"Invalid token" });
  user.password = bcrypt.hashSync(req.body.password || "", 10);
  delete user.resetToken;
  await saveUsersDB(db);
  res.json({ ok:true });
});

app.post("/api/users", optionalAuth, async (req,res)=>{
  const db = await loadUsersDB();
  if(db.users.length>0 && (!req.user || req.user.role !== "admin")) return res.status(403).json({ ok:false, error:"Forbidden" });
  const role = req.body.role || (db.users.length === 0 ? "admin" : "member");
  const user = normalizeUser({
    id: nanoid(10),
    username: req.body.username || "",
    name: req.body.name || "",
    password: bcrypt.hashSync(req.body.password || "", 10),
    role,
    tenantId: req.body.tenantId || (req.user?.tenantId || DEFAULT_TENANT_ID),
    permissions: Array.isArray(req.body.permissions) ? req.body.permissions : []
  });
  db.users.push(user);
  await saveUsersDB(db);
  res.json({ ok:true, user: { id: user.id, username: user.username, name: user.name, role: user.role, tenantId: user.tenantId, permissions: user.permissions } });

});

app.get("/api/users", authenticate, requireRole("admin"), async (_req,res)=>{
  const db = await loadUsersDB();
  res.json({ ok:true, users: db.users.map(u=>({ id:u.id, username:u.username, name:u.name, role:u.role, tenantId: u.tenantId || DEFAULT_TENANT_ID, permissions: u.permissions || [] })) });
});

app.put("/api/users/:id", authenticate, requireRole("admin"), async (req,res)=>{
  const db = await loadUsersDB();
  const user = db.users.find(u=>u.id === req.params.id);
  if(!user) return res.status(404).json({ ok:false, error:"Not found" });
  if(typeof req.body.name === "string") user.name = req.body.name;
  if(typeof req.body.username === "string") user.username = req.body.username;
  if(req.body.password) user.password = bcrypt.hashSync(req.body.password,10);
  if(req.body.tenantId !== undefined){
    user.tenantId = sanitizeTenantId(req.body.tenantId || DEFAULT_TENANT_ID);
  }
  if(Array.isArray(req.body.permissions)) user.permissions = req.body.permissions;
  await saveUsersDB(db);
  res.json({ ok:true, user: { id:user.id, username:user.username, name:user.name, role:user.role, tenantId: user.tenantId || DEFAULT_TENANT_ID, permissions:user.permissions || [] } });
});

app.get("/api/me", authenticate, (req,res)=>{
  if(!req.user){
    return res.status(401).json({ ok:false, error:"Unauthorized" });
  }
  res.json({ ok:true, user: { id: req.user.id, username: req.user.username, name: req.user.name, role: req.user.role, tenantId: req.user.tenantId || DEFAULT_TENANT_ID, permissions: req.user.permissions || [] } });
});

app.get("/api/team-members", authenticate, requireRole("admin"), async (_req,res)=>{
  const db = await loadUsersDB();
  const members = db.users
    .filter(u => u.role === "team")
    .map(buildTeamMemberResponse)
    .filter(Boolean);
  res.json({ ok:true, members });
});

app.post("/api/team-members", authenticate, requireRole("admin"), async (req,res)=>{
  const db = await loadUsersDB();
  const username = (req.body.username || "").trim();
  const name = (req.body.name || "").trim();
  if(!username){
    return res.status(400).json({ ok:false, error:"Username (email) is required" });
  }
  if(db.users.some(u => u.username === username)){
    return res.status(409).json({ ok:false, error:"Username already exists" });
  }
  const token = nanoid(12);
  const passwordPlain = req.body.password || nanoid(8);
  const password = bcrypt.hashSync(passwordPlain, 10);
  const now = new Date().toISOString();
  const preset = getTeamRolePreset(req.body.teamRole || DEFAULT_TEAM_ROLE_ID);
  const member = {
    id: nanoid(10),
    username,
    name,
    token,
    password,
    role: "team",
    mustReset: true,
    permissions: Array.from(new Set(preset.permissions || [])),
    teamRole: preset.id,
    createdAt: now,
    lastLoginAt: null,
    tenantId: sanitizeTenantId(req.body.tenantId || req.user?.tenantId || DEFAULT_TENANT_ID)
  };
  db.users.push(member);
  await saveUsersDB(db);
  if(TEAM_TEMPLATE){
    const html = TEAM_TEMPLATE.replace(/\{\{token\}\}/g, token).replace(/\{\{name\}\}/g, member.name || member.username || "Team Member");
    try{ fs.writeFileSync(path.join(PUBLIC_DIR, `team-${token}.html`), html); }catch{}
  }
  const response = buildTeamMemberResponse(member);
  res.json({ ok:true, member: { ...response, token, password: passwordPlain } });
});

app.delete("/api/team-members/:id", authenticate, requireRole("admin"), async (req,res)=>{
  const db = await loadUsersDB();
  const idx = db.users.findIndex(u => u.id === req.params.id && u.role === "team");
  if(idx === -1){
    return res.status(404).json({ ok:false, error:"Not found" });
  }
  const [member] = db.users.splice(idx, 1);
  await saveUsersDB(db);
  if(member?.token){
    try{ fs.unlinkSync(path.join(PUBLIC_DIR, `team-${member.token}.html`)); }catch{}
  }
  res.json({ ok:true });
});

app.patch("/api/team-members/:id", authenticate, requireRole("admin"), async (req,res)=>{
  const db = await loadUsersDB();
  const member = db.users.find(u => u.id === req.params.id && u.role === "team");
  if(!member){
    return res.status(404).json({ ok:false, error:"Not found" });
  }
  let dirty = false;
  if(typeof req.body.name === "string"){
    const trimmed = req.body.name.trim();
    if(trimmed && trimmed !== member.name){
      member.name = trimmed;
      dirty = true;
    }
  }
  if(typeof req.body.teamRole === "string"){
    const preset = getTeamRolePreset(req.body.teamRole);
    if(preset.id !== member.teamRole){
      member.teamRole = preset.id;
      member.permissions = Array.from(new Set(preset.permissions || []));
      dirty = true;
    }
  }
  if(Array.isArray(req.body.permissions)){
    const incoming = Array.from(new Set(req.body.permissions.map(String)));
    if(JSON.stringify(incoming) !== JSON.stringify(member.permissions || [])){
      member.permissions = incoming;
      dirty = true;
    }
  }
  if(dirty){
    await saveUsersDB(db);
  }
  const response = buildTeamMemberResponse(member);
  res.json({ ok:true, member: response });
});

app.get("/api/team-roles", authenticate, requireRole("admin"), (_req,res)=>{
  res.json({ ok:true, roles: listTeamRoles() });
});

app.post("/api/team/:token/login", async (req,res)=>{
  logInfo("TEAM_LOGIN_ATTEMPT", "Team member login attempt", { tokenPrefix: req.params.token.slice(0,4) });
  const db = await loadUsersDB();
  const member = db.users.find(u=>u.token===req.params.token);
  if(!member){
    logWarn("TEAM_LOGIN_FAIL", "Team member login failed: token not found", { tokenPrefix: req.params.token.slice(0,4) });
    return res.status(404).json({ ok:false, error:"Not found" });
  }
  if(!bcrypt.compareSync(req.body.password || "", member.password)){
    logWarn("TEAM_LOGIN_FAIL", "Team member login failed: wrong password", { memberId: member.id });
    return res.status(401).json({ ok:false, error:"Invalid password" });
  }
  member.lastLoginAt = new Date().toISOString();
  await saveUsersDB(db);
  logInfo("TEAM_LOGIN_SUCCESS", "Team member login successful", { memberId: member.id });
  res.json({ ok:true, token: generateToken(member), mustReset: member.mustReset });
});

app.post("/api/team/:token/reset", async (req,res)=>{
  const db = await loadUsersDB();
  const member = db.users.find(u=>u.token===req.params.token);
  if(!member) return res.status(404).json({ ok:false, error:"Not found" });
  member.password = bcrypt.hashSync(req.body.password || "", 10);
  member.mustReset = false;
  await saveUsersDB(db);
  res.json({ ok:true });
});

// =================== Contacts ===================
app.get("/api/contacts", authenticate, requirePermission("contacts"), async (req,res)=>{

  const db = await loadContactsDB();
  const contacts = db.contacts.filter(c=>c.userId===req.user.id);
  res.json({ ok:true, contacts });
});

app.post("/api/contacts", authenticate, requirePermission("contacts"), async (req,res)=>{

  const db = await loadContactsDB();
  const contact = { id: nanoid(10), userId: req.user.id, name: req.body.name || "", email: req.body.email || "", phone: req.body.phone || "", notes: req.body.notes || "" };
  db.contacts.push(contact);
  await saveContactsDB(db);
  res.json({ ok:true, contact });
});

app.put("/api/contacts/:id", authenticate, requirePermission("contacts"), async (req,res)=>{

  const db = await loadContactsDB();
  const contact = db.contacts.find(c=>c.id===req.params.id && c.userId===req.user.id);
  if(!contact) return res.status(404).json({ ok:false, error:"Not found" });
  Object.assign(contact, { name:req.body.name ?? contact.name, email:req.body.email ?? contact.email, phone:req.body.phone ?? contact.phone, notes:req.body.notes ?? contact.notes });
  await saveContactsDB(db);
  res.json({ ok:true, contact });
});

app.delete("/api/contacts/:id", authenticate, requirePermission("contacts"), async (req,res)=>{

  const db = await loadContactsDB();
  const idx = db.contacts.findIndex(c=>c.id===req.params.id && c.userId===req.user.id);
  if(idx===-1) return res.status(404).json({ ok:false, error:"Not found" });
  db.contacts.splice(idx,1);
  await saveContactsDB(db);
  res.json({ ok:true });
});

// =================== Tasks ===================
app.get("/api/tasks", authenticate, requirePermission("tasks"), async (req,res)=>{

  const db = await loadTasksDB();
  const tasks = db.tasks.filter(t=>t.userId===req.user.id);
  res.json({ ok:true, tasks });
});

app.post("/api/tasks", authenticate, requirePermission("tasks"), async (req,res)=>{

  const db = await loadTasksDB();
  const task = { id: nanoid(10), userId: req.user.id, desc: req.body.desc || "", due: req.body.due || null, completed: false, status: "pending" };
  db.tasks.push(task);
  await saveTasksDB(db);
  res.json({ ok:true, task });
});

app.put("/api/tasks/:id", authenticate, requirePermission("tasks"), async (req,res)=>{

  const db = await loadTasksDB();
  const task = db.tasks.find(t=>t.id===req.params.id && t.userId===req.user.id);
  if(!task) return res.status(404).json({ ok:false, error:"Not found" });
  Object.assign(task, { desc:req.body.desc ?? task.desc, due:req.body.due ?? task.due, completed:req.body.completed ?? task.completed });
  if(task.completed) task.status = "done";
  await saveTasksDB(db);
  res.json({ ok:true, task });
});

// =================== Reporting ===================
app.get("/api/reports/summary", authenticate, requirePermission("reports"), async (req,res)=>{

  const contacts = (await loadContactsDB()).contacts.filter(c=>c.userId===req.user.id).length;
  const tasks = (await loadTasksDB()).tasks.filter(t=>t.userId===req.user.id);
  const completedTasks = tasks.filter(t=>t.completed).length;
  res.json({ ok:true, summary:{ contacts, tasks:{ total: tasks.length, completed: completedTasks } } });

});

app.get("/api/reports/:id/debug", authenticate, requirePermission("admin"), async (req, res) => {
  const reportId = String(req.params.id || "").trim();
  if (!reportId) {
    return res.status(400).json({ ok: false, error: "reportId required" });
  }
  const db = await loadDB();
  const reportEntry = db.consumers
    .flatMap((consumer) => (Array.isArray(consumer.reports) ? consumer.reports : []))
    .find((report) => report?.id === reportId);
  if (!reportEntry) {
    return res.status(404).json({ ok: false, error: "Report not found" });
  }
  const data = reportEntry.data || {};
  const canonicalReport = data.canonical_report || data.canonicalReport || {};
  const violations = Array.isArray(data.llm_violations) ? data.llm_violations : [];
  const tradelineKeys = collectTradelineKeys(canonicalReport);
  const violationKeys = violations
    .map((v) => v?.instanceKey || (v?.tradelineKey && v?.ruleId ? `${v.tradelineKey}|${v.ruleId}` : null))
    .filter(Boolean);
  res.json({
    ok: true,
    reportId,
    tradelineKeys,
    violationKeys,
    counts: {
      tradelines: tradelineKeys.length,
      violations: violations.length,
      violationKeys: violationKeys.length,
    },
  });
});

// =================== Messages ===================
app.get("/api/messages", async (_req, res) => {
  const db = await loadDB();
  const all = [];
  for (const c of db.consumers || []) {
    const cstate = await listConsumerState(c.id);
    const msgs = (cstate.events || [])
      .filter(e => e.type === "message")
      .map(m => ({ ...m, consumer: { id: c.id, name: c.name || "" } }));
    all.push(...msgs);
  }
  all.sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({ ok: true, messages: all });
});

app.get("/api/messages/:consumerId", async (req,res)=>{
  const cstate = await listConsumerState(req.params.consumerId);
  const msgs = (cstate.events || []).filter(e=>e.type === "message");
  res.json({ ok:true, messages: msgs });
});

app.post("/api/messages/:consumerId", optionalAuth, async (req,res)=>{
  const text = req.body.text || "";
  let from = req.body.from || "host";
  const payload = { from, text };
  if (req.user) {
    from = req.user.username;
    payload.from = from;
    payload.userId = req.user.id;
  }
  await addEvent(req.params.consumerId, "message", payload);
  res.json({ ok:true });
});

app.post("/api/consumers/:consumerId/events", async (req,res)=>{
  const { type, payload } = req.body || {};
  if(!type){
    return res.status(400).json({ ok:false, error:'type required' });
  }
  await addEvent(req.params.consumerId, type, payload || {});
  res.json({ ok:true });
});

app.get("/api/workflows/config", authenticate, requirePermission("consumers"), async (_req, res) => {
  try {
    const config = await getWorkflowConfig();
    const summary = summarizeWorkflowConfig(config);
    res.json({ ok: true, config, summary });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "Failed to load workflow config" });
  }
});

app.put("/api/workflows/config", authenticate, requirePermission("consumers"), async (req, res) => {
  try {
    const input = req.body?.config ?? req.body ?? {};
    const config = await updateWorkflowConfig(input);
    const summary = summarizeWorkflowConfig(config);
    res.json({ ok: true, config, summary });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message || "Failed to update workflow config" });
  }
});

app.post("/api/workflows/validate", authenticate, requirePermission("consumers"), async (req, res) => {
  try {
    const { operation, context } = req.body || {};
    if (!operation) {
      return res.status(400).json({ ok: false, error: "operation required" });
    }
    const result = await validateWorkflowOperation(operation, context || {});
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "Workflow validation failed" });
  }
});

// =================== Templates / Sequences / Contracts ===================
function defaultTemplates(){
  return [
    { id: "identity", requestType:"delete", ...modeCopy("identity", "delete", true) },
    { id: "breach",   requestType:"delete", ...modeCopy("breach", "delete", true) },
    { id: "assault",  requestType:"delete", ...modeCopy("assault", "delete", true) },
    { id: "correct",  requestType:"correct", ...modeCopy(null, "correct", true) },
    { id: "delete",   requestType:"delete", ...modeCopy(null, "delete", true) }
  ];
}
app.get("/api/templates/defaults", async (_req,res)=>{
  const db = await loadLettersDB();
  const ids = db.mainTemplates && db.mainTemplates.length ? db.mainTemplates : defaultTemplates().map(t=>t.id);
  const all = [...defaultTemplates(), ...(db.templates || [])];
  const map = Object.fromEntries(all.map(t=>[t.id, t]));
  const templates = ids.map(id => map[id]).filter(Boolean);
  res.json({ ok:true, templates });
});

app.post("/api/templates/defaults", async (req,res)=>{
  const { slotId, templateId } = req.body || {};
  const db = await loadLettersDB();
  db.mainTemplates = db.mainTemplates && db.mainTemplates.length ? db.mainTemplates : defaultTemplates().map(t=>t.id);
  const idx = db.mainTemplates.findIndex(id => id === slotId);
  if(idx !== -1){
    db.mainTemplates[idx] = templateId;
  }
  await saveLettersDB(db);
  const all = [...defaultTemplates(), ...(db.templates || [])];
  const map = Object.fromEntries(all.map(t=>[t.id, t]));
  const templates = db.mainTemplates.map(id => map[id]).filter(Boolean);
  res.json({ ok:true, templates });
});
function normalizeContract(contract){
  if(!contract) return null;
  const english = typeof contract.english === "string" && contract.english.trim().length
    ? contract.english
    : contract.body || "";
  return {
    ...contract,
    english,
    body: contract.body ?? english
  };
}

app.get("/api/templates", async (_req,res)=>{
  const db = await loadLettersDB();
  let mutated = false;
  if(!db.templates || db.templates.length === 0){
    db.templates = defaultTemplates();
    mutated = true;
  } else {
    mutated = ensureTemplateDefaults(db);
  }
  if(mutated){
    await saveLettersDB(db);
  }
  const contracts = (db.contracts || []).map(normalizeContract).filter(Boolean);
  res.json({
    ok: true,
    templates: db.templates,
    sequences: db.sequences || [],
    contracts
  });
});

app.get("/api/sample-letters", (_req, res) => {
  res.json({ ok: true, templates: LETTER_TEMPLATES });
});

function ensureTemplateDefaults(db){
  if(!Array.isArray(db.templates)){ db.templates = []; }
  const existingIds = new Set(db.templates.map(t => t.id));
  let mutated = false;
  for(const tpl of defaultTemplates()){
    if(!existingIds.has(tpl.id)){
      db.templates.push({ ...tpl });
      mutated = true;
    }
  }
  return mutated;
}

app.post("/api/templates", async (req,res)=>{
  const db = await loadLettersDB();
  const seeded = ensureTemplateDefaults(db);
  const { id = nanoid(8), heading = "", intro = "", ask = "", afterIssues = "", evidence = "", requestType = "correct" } = req.body || {};
  const existing = db.templates.find(t => t.id === id);
  const tpl = { id, heading, intro, ask, afterIssues, evidence, requestType };
  if(existing){ Object.assign(existing, tpl); }
  else { db.templates.push(tpl); }
  await saveLettersDB(db);
  res.json({ ok:true, template: tpl, seededDefaults: seeded });
});

app.post("/api/sequences", async (req,res)=>{
  const db = await loadLettersDB();
  db.sequences = db.sequences || [];
  const { id = nanoid(8), name = "", templates = [] } = req.body || {};
  const existing = db.sequences.find(s => s.id === id);
  const seq = { id, name, templates };
  if(existing){ Object.assign(existing, seq); }
  else { db.sequences.push(seq); }
  await saveLettersDB(db);
  res.json({ ok:true, sequence: seq });
});

app.delete("/api/sequences/:id", async (req,res)=>{
  const id = (req.params?.id || "").trim();
  if(!id){
    return res.status(400).json({ ok:false, error:"id required" });
  }
  const db = await loadLettersDB();
  db.sequences = db.sequences || [];
  const before = db.sequences.length;
  db.sequences = db.sequences.filter(s => s.id !== id);
  if(db.sequences.length === before){
    return res.status(404).json({ ok:false, error:"sequence not found" });
  }
  await saveLettersDB(db);
  res.json({ ok:true });
});

app.post("/api/contracts", async (req,res)=>{
  const db = await loadLettersDB();
  const name = (req.body?.name || "").trim();
  const english = (req.body?.english || req.body?.body || "").trim();
  if(!name){
    return res.status(400).json({ ok:false, error:"name required" });
  }
  if(!english){
    return res.status(400).json({ ok:false, error:"english body required" });
  }
  const ct = normalizeContract({
    id: nanoid(8),
    name,
    english
  });
  db.contracts = db.contracts || [];
  db.contracts.push(ct);
  await saveLettersDB(db);
  res.json({ ok:true, contract: ct });
});


// Upload HTML/PDF -> analyze -> save under consumer
app.post("/api/consumers/:id/upload", upload.single("file"), async (req,res)=>{
  const db=await loadDB();
  const consumer = db.consumers.find(c=>c.id===req.params.id);
  if(!consumer) return res.status(404).json({ ok:false, error:"Consumer not found" });
  if(!req.file) return res.status(400).json({ ok:false, error:"No file uploaded" });

  const errors = [];
  const diagnostics = {
    llmTradelineCount: 0,
    llmViolationCount: 0,
    llmParseSource: null,
    llmError: null,
    llmAuditRawCount: 0,
    legacyAnalyzersEnabled: LEGACY_ANALYZERS_ENABLED,
  };
  try{
    const isPdf = req.file.mimetype === "application/pdf" || /\.pdf$/i.test(req.file.originalname || "");
    const htmlText = isPdf ? "" : req.file.buffer.toString("utf-8");
    let analyzed = { tradelines: [], status: "analyzing" };
    let llmResult = null;

    try {
      llmResult = await runLLMAnalyzer({
        buffer: req.file.buffer,
        filename: req.file.originalname,
      });
      diagnostics.llmTradelineCount = llmResult.tradelines.length;
      diagnostics.llmViolationCount = llmResult.violations.length;
      diagnostics.llmAuditRawCount = llmResult.auditRawCount ?? llmResult.violations.length;
      diagnostics.requiredFieldViolationCount = llmResult.requiredFieldCount ?? 0;
      diagnostics.llmParseSource = llmResult?.canonicalReport?.reportMeta?.provider || null;
      diagnostics.llmAttachment = llmResult.attachStats || null;
      analyzed.tradelines = llmResult.tradelines;
      analyzed.canonical_report = llmResult.canonicalReport;
      analyzed.llm_violations = llmResult.violations;
      analyzed.violations = llmResult.violations;
      analyzed.required_field_violations = llmResult.requiredFieldViolations;
      analyzed.personalInfo = llmResult.personalInfo;
      analyzed.status = "analyzed";

      const tradelineKeys = collectTradelineKeys(llmResult.canonicalReport);
      const violationKeys = llmResult.violations
        .map((v) => v?.instanceKey || (v?.tradelineKey && v?.ruleId ? `${v.tradelineKey}|${v.ruleId}` : null))
        .filter(Boolean);
      console.log("[LLM Audit Raw]", {
        consumerId: consumer.id,
        count: diagnostics.llmAuditRawCount,
      });
      console.log("[LLM Audit Saved]", {
        consumerId: consumer.id,
        count: diagnostics.llmViolationCount,
      });
      console.log("[LLM Audit Attach]", {
        consumerId: consumer.id,
        attached: llmResult.attachStats?.attachedCount ?? 0,
        skipped: llmResult.attachStats?.skippedCount ?? 0,
        sampleMissingKeys: llmResult.attachStats?.missingSampleKeys || [],
      });
      console.log("[LLM Audit Keys]", {
        tradelineKeys: tradelineKeys.slice(0, 5),
        violationKeys: violationKeys.slice(0, 5),
      });
    } catch (e) {
      logError("LLM_ANALYZER_ERROR", "LLM analyzer failed", e);
      diagnostics.llmError = e.message || String(e);
      analyzed.status = "analyzer_failed";
      errors.push({ step: "llm_audit", message: e.message, details: e.stack || String(e) });
    }

    if (!llmResult && LEGACY_ANALYZERS_ENABLED) {
      logWarn("LEGACY_ANALYZERS_SKIPPED", "LLM audit failed; legacy analyzers are disabled by default.");
    }

    if (!isPdf) {
      try{
        const extractedScores = extractCreditScores(htmlText);
        if (Object.keys(extractedScores).length) {
          consumer.creditScore = mergeCreditScores(consumer.creditScore, extractedScores);
          await setCreditScore(consumer.id, consumer.creditScore);
        }
      }catch(e){
        logError("SCORE_EXTRACT_FAILED", "Failed to extract credit scores", e);
        errors.push({ step: "score_extract", message: e.message, details: e.stack || String(e) });
      }
    }

    // compare bureau-reported personal info against consumer record
    const normalize = s => (s || "").toString().trim().toLowerCase();
    const mismatches = {};
    if (analyzed?.personalInfo && typeof analyzed.personalInfo === "object") {
      for (const [bureau, info] of Object.entries(analyzed.personalInfo)) {
        if (!info) continue;
        const diff = {};
        if (info.name && consumer.name && normalize(info.name) !== normalize(consumer.name)) {
          diff.name = info.name;
        }
        if (info.dob && consumer.dob && info.dob !== consumer.dob) {
          diff.dob = info.dob;
        }
        const addr = info.address || {};
        const addrFields = ["addr1", "addr2", "city", "state", "zip"];
        const addrMismatch = addrFields.some(f => addr[f] && consumer[f] && normalize(addr[f]) !== normalize(consumer[f]));
        if (addrMismatch) {
          diff.address = addr;
        }
        if (Object.keys(diff).length) {
          mismatches[bureau] = diff;
        }
      }
    }
    analyzed.personalInfoMismatches = mismatches;

    try {
      const { items } = prepareNegativeItems(analyzed.tradelines || [], {
        inquiries: analyzed.inquiries,
        inquirySummary: analyzed.inquiry_summary,
        personalInfo: analyzed.personalInfo || analyzed.personal_information || analyzed.personal_info,
        personalInfoMismatches: analyzed.personalInfoMismatches,
      }, { includeLegacyRules: LEGACY_ANALYZERS_ENABLED });
      analyzed.negative_items = items;
    } catch (e) {
      logError("NEGATIVE_ITEM_ERROR", "Failed to prepare negative items", e);
      errors.push({ step: "negative_items", message: e.message, details: e.stack || String(e) });
    }

    const rid = nanoid(8);
    // store original uploaded file so clients can access it from document center
    const uploadDir = consumerUploadsDir(consumer.id);
    const ext = (req.file.originalname.match(/\.[a-z0-9]+$/i)||[""])[0] || "";
    const storedName = `${rid}${ext}`;
    await fs.promises.writeFile(path.join(uploadDir, storedName), req.file.buffer);
    await addFileMeta(consumer.id, {
      id: rid,
      originalName: req.file.originalname,
      storedName,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
      personalInfoMismatches: mismatches,
    });
    consumer.reports.unshift({
      id: rid,
      status: analyzed.status || "analyzed",
      uploadedAt: new Date().toISOString(),
      filename: req.file.originalname,
      size: req.file.size,
      summary: {
        tradelines: analyzed?.tradelines?.length || 0,
        negative_items: analyzed?.negative_items?.length || analyzed?.tradelines?.length || 0,
        personalInfoMismatches: mismatches
      },
      data: analyzed
    });
    await saveDB(db);
    await addEvent(consumer.id, "report_uploaded", {
      reportId: rid,
      filename: req.file.originalname,
      size: req.file.size
    });
    const totalViolations = (analyzed.tradelines || []).reduce((sum, tl) => sum + ((tl?.violations || []).length), 0)
      + (analyzed.personal_mismatches?.length || 0)
      + (analyzed.inquiry_violations?.length || 0);
    const auditFailed = errors.length > 0;
    console.log(auditFailed ? "[Audit Failed]" : "[Audit Success]", {
      consumerId: consumer.id,
      reportId: rid,
      tradelines: analyzed.tradelines?.length || 0,
      totalViolations,
      errors: errors.length,
    });
    if (auditFailed) {
      res.status(500).json({ ok: false, reportId: rid, creditScore: consumer.creditScore, errors, diagnostics });
      return;
    }
    res.json({ ok:true, reportId: rid, creditScore: consumer.creditScore, errors, diagnostics });
  }catch(e){
    logError("UPLOAD_PROCESSING_FAILED", "Analyzer error", e);
    res.status(500).json({ ok:false, error: "Failed to process uploaded report", errors, diagnostics });
  }
});

app.get("/api/consumers/:id/reports", async (req,res)=>{
  const db=await loadDB();
  const c=db.consumers.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({ ok:false, error:"Consumer not found" });
  res.json({ ok:true, reports: c.reports.map(r=>({ id:r.id, uploadedAt:r.uploadedAt, filename:r.filename, summary:r.summary })) });
});

app.get("/api/consumers/:id/report/:rid", async (req,res)=>{
  const db=await loadDB();
  const c=db.consumers.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({ ok:false, error:"Consumer not found" });
  const r=c.reports.find(x=>x.id===req.params.rid);
  if(!r) return res.status(404).json({ ok:false, error:"Report not found" });
  if (!Array.isArray(r.data?.negative_items) && Array.isArray(r.data?.tradelines)) {
    try {
    const { items } = prepareNegativeItems(r.data.tradelines, {
      inquiries: r.data.inquiries,
      inquirySummary: r.data.inquiry_summary,
      personalInfo: r.data.personalInfo || r.data.personal_information || r.data.personal_info,
      personalInfoMismatches: r.data.personalInfoMismatches || r.data.personal_info_mismatches,
    }, { includeLegacyRules: LEGACY_ANALYZERS_ENABLED });
      r.data.negative_items = items;
    } catch (e) {
      logError("NEGATIVE_ITEM_ERROR", "Failed to backfill negative items on fetch", e, { consumerId: c.id, reportId: r.id });
    }
  }
  res.json({ ok:true, report:r.data, consumer:{
    id:c.id,name:c.name,email:c.email,phone:c.phone,addr1:c.addr1,addr2:c.addr2,city:c.city,state:c.state,zip:c.zip,ssn_last4:c.ssn_last4,dob:c.dob
  }});
});

app.delete("/api/consumers/:id/report/:rid", async (req,res)=>{
  const db=await loadDB();
  const c=db.consumers.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({ ok:false, error:"Consumer not found" });
  const i=c.reports.findIndex(x=>x.id===req.params.rid);
  if(i===-1) return res.status(404).json({ ok:false, error:"Report not found" });
  const removed = c.reports[i];
  c.reports.splice(i,1);
  await saveDB(db);
  await addEvent(c.id, "report_deleted", { reportId: removed?.id, filename: removed?.filename });
  res.json({ ok:true });
});

app.put("/api/consumers/:id/report/:rid/tradeline/:tidx", async (req,res)=>{
  const db=await loadDB();
  const c=db.consumers.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({ ok:false, error:"Consumer not found" });
  const r=c.reports.find(x=>x.id===req.params.rid);
  if(!r) return res.status(404).json({ ok:false, error:"Report not found" });
  const idx = Number(req.params.tidx);
  if(isNaN(idx) || !r.data.tradelines?.[idx]) return res.status(404).json({ ok:false, error:"Tradeline not found" });
  const tl = r.data.tradelines[idx];
  const { creditor, per_bureau, manual_reason } = req.body || {};

  if(creditor !== undefined){
    tl.meta = tl.meta || {};
    tl.meta.creditor = creditor;
  }
  if(manual_reason !== undefined){
    tl.meta = tl.meta || {};
    tl.meta.manual_reason = manual_reason;
  }

  if(per_bureau){
    tl.per_bureau = tl.per_bureau || {};
    ["TransUnion","Experian","Equifax"].forEach(b=>{
      if(per_bureau[b]){
        tl.per_bureau[b] = { ...(tl.per_bureau[b] || {}), ...per_bureau[b] };
      }
    });
  }
  if (LEGACY_ANALYZERS_ENABLED) {
    runBasicRuleAudit(r.data);
  }
  try {
    const { items } = prepareNegativeItems(r.data.tradelines || [], {
      inquiries: r.data.inquiries,
      inquirySummary: r.data.inquiry_summary,
      personalInfo: r.data.personalInfo || r.data.personal_information || r.data.personal_info,
      personalInfoMismatches: r.data.personalInfoMismatches || r.data.personal_info_mismatches,
    }, { includeLegacyRules: LEGACY_ANALYZERS_ENABLED });
    r.data.negative_items = items;
  } catch (e) {
    logError("NEGATIVE_ITEM_ERROR", "Failed to refresh negative items after edit", e, { consumerId: c.id, reportId: r.id });
  }
  await saveDB(db);
  res.json({ ok:true, tradeline: tl });
});

app.post(
  "/api/consumers/:id/report/:rid/audit",
  optionalAuth,
  enforceTenantQuota("reports:audit"),
  async (req, res) => {
    try {
      let idempotencyKey;
      try {
        idempotencyKey = sanitizeIdempotencyKey(req.get("x-idempotency-key"));
      } catch (err) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      if (!idempotencyKey) {
        return res.status(400).json({ ok: false, error: "x-idempotency-key header required" });
      }

      const tenantId = resolveRequestTenant(req);
      const consumerId = String(req.params.id || "").trim();
      const reportId = String(req.params.rid || "").trim();
      if (!consumerId || !reportId) {
        return res.status(400).json({ ok: false, error: "consumerId and reportId required" });
      }

      const compositeKey = `${consumerId}:${reportId}:${idempotencyKey}`;
      const existing = await readIdempotencyRecord(tenantId, JOB_TYPES.REPORTS_AUDIT, compositeKey);
      if (existing?.jobId) {
        const jobRecord = await getJobRecord(tenantId, existing.jobId);
        if (jobRecord) {
          return res.status(200).json({
            ok: true,
            jobId: jobRecord.id,
            status: jobRecord.status,
            type: jobRecord.type,
            job: sanitizeJobForResponse(jobRecord),
          });
        }
      }

      const preflight = await preflightAuditJob({ consumerId, reportId }, { tenantId });
      if (!preflight.ok) {
        return res.status(preflight.status || 400).json({ ok: false, error: preflight.error || "Unable to queue audit" });
      }

      const selections = Array.isArray(req.body?.selections) ? req.body.selections : null;
      if (selections?.length) {
        try {
          const db = await loadDB({ tenantId });
          const consumer = db.consumers.find((c) => c.id === consumerId);
          const report = consumer?.reports?.find((r) => r.id === reportId);
          if (report) {
            report.auditSelections = selections;
            report.auditSelectionUpdatedAt = new Date().toISOString();
            await saveDB(db, { tenantId });
          }
        } catch (err) {
          logWarn("AUDIT_SELECTION_SAVE_FAILED", err?.message || "Failed to persist audit selections", {
            consumerId,
            reportId,
          });
        }
      }

      const jobId = crypto.randomBytes(8).toString("hex");
      const metadata = { consumerId, reportId };
      await createJobRecord({
        tenantId,
        jobId,
        type: JOB_TYPES.REPORTS_AUDIT,
        userId: req.user?.id || null,
        metadata,
        idempotencyKey: compositeKey,
      });
      await writeIdempotencyRecord(tenantId, JOB_TYPES.REPORTS_AUDIT, compositeKey, { jobId });

      const payload = {
        consumerId,
        reportId,
        selections,
      };

      await enqueueJob(JOB_TYPES.REPORTS_AUDIT, {
        jobId,
        tenantId,
        userId: req.user?.id || null,
        payload,
      });

      const jobRecord = await getJobRecord(tenantId, jobId);
      res.status(202).json({
        ok: true,
        jobId,
        status: jobRecord?.status || "queued",
        type: JOB_TYPES.REPORTS_AUDIT,
        job: sanitizeJobForResponse(jobRecord),
      });
    } catch (err) {
      logError("AUDIT_JOB_QUEUE_ERROR", "Failed to queue audit job", err, { consumerId: req.params.id, reportId: req.params.rid });
      res.status(500).json({ ok: false, error: "Failed to queue audit job" });
    }
  },
);

// Check consumer email against Have I Been Pwned
// Use POST so email isn't logged in query string
async function hibpLookup(email) {
  const apiKey = (await loadSettings()).hibpApiKey || process.env.HIBP_API_KEY;
  if (!apiKey) return { ok: false, status: 500, error: "HIBP API key not configured" };
  try {
    const hibpRes = await fetchFn(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
      {
        headers: {
          "hibp-api-key": apiKey,
          "user-agent": "crm-app",
        },
      }
    );
    if (hibpRes.status === 404) {
      return { ok: true, breaches: [] };
    }
    if (!hibpRes.ok) {
      const text = await hibpRes.text().catch(() => "");
      return {
        ok: false,
        status: hibpRes.status,
        error: text || `HIBP request failed (status ${hibpRes.status})`,
      };
    }
    const data = await hibpRes.json();
    return { ok: true, breaches: data };
  } catch (e) {
    console.error("HIBP check failed", e);
    return { ok: false, status: 500, error: "HIBP request failed" };
  }
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function renderBreachAuditHtml(consumer) {
  const list = (consumer.breaches || []).map(b => `<li>${escapeHtml(b)}</li>`).join("") || "<li>No breaches found.</li>";
  const dateStr = new Date().toLocaleString();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{font-family:Arial, sans-serif;margin:20px;}h1{text-align:center;}ul{margin-top:10px;}</style></head><body><h1>${escapeHtml(consumer.name || "Consumer")}</h1><h2>Data Breach Audit</h2><p>Email: ${escapeHtml(consumer.email || "")}</p><ul>${list}</ul><footer><hr/><div style="font-size:0.8em;color:#555;margin-top:20px;">Generated ${escapeHtml(dateStr)}</div></footer></body></html>`;
}

async function handleDataBreach(email, consumerId, res) {
  const result = await hibpLookup(email);
  if (result.ok && consumerId) {
    try {
      const db = await loadDB();
      const c = db.consumers.find(x => x.id === consumerId);
      if (c) {
        c.breaches = (result.breaches || []).map(b => b.Name || b.name || "");
        await saveDB(db);
      }
    } catch (err) {
      console.error("Failed to store breach info", err);
    }
  }
  if (result.ok) return res.json(result);
  res.status(result.status || 500).json({ ok: false, error: result.error });
}

async function generateBreachAudit(consumer) {
  const html = renderBreachAuditHtml(consumer);
  const result = await savePdf(html);
  let ext = path.extname(result.path);
  if (result.warning || ext !== ".pdf") {
    ext = ".html";
  }
  const mime = ext === ".pdf" ? "application/pdf" : "text/html";
  try {
    const uploadsDir = consumerUploadsDir(consumer.id);
    const id = nanoid(10);
    const storedName = `${id}${ext}`;
    const safe = (consumer.name || "client").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const date = new Date().toISOString().slice(0, 10);
    const originalName = `${safe}_${date}_breach_audit${ext}`;
    const dest = path.join(uploadsDir, storedName);
    await fs.promises.copyFile(result.path, dest);
    const stat = await fs.promises.stat(dest);
    await addFileMeta(consumer.id, {
      id,
      originalName,
      storedName,
      type: "breach-audit",
      size: stat.size,
      mimetype: mime,
      uploadedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to store breach audit file", err);
  }
  await addEvent(consumer.id, "breach_audit_generated", { file: result.url });
  return { ok: true, url: result.url, warning: result.warning };
}

async function handleConsumerBreachAudit(req, res) {
  const db = await loadDB();
  const consumer = db.consumers.find(x => x.id === req.params.id);
  if (!consumer) return res.status(404).json({ ok: false, error: "Consumer not found" });
  try {
    const result = await generateBreachAudit(consumer);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}

app.post("/api/databreach", enforceTenantQuota("breach:lookup"), async (req, res) => {
  const email = String(req.body.email || "").trim();
  const consumerId = String(req.body.consumerId || "").trim();
  if (!email) return res.status(400).json({ ok: false, error: "Email required" });
  await handleDataBreach(email, consumerId, res);
});

app.get("/api/databreach", async (req, res) => {
  const email = String(req.query.email || "").trim();
  const consumerId = String(req.query.consumerId || "").trim();
  if (!email) return res.status(400).json({ ok: false, error: "Email required" });
  await handleDataBreach(email, consumerId, res);
});


app.post("/api/consumers/:id/databreach/audit", enforceTenantQuota("breach:lookup"), handleConsumerBreachAudit);




// =================== Letters & PDFs ===================
const LETTERS_DIR = path.join(__dirname, "letters");
fs.mkdirSync(LETTERS_DIR,{ recursive:true });

// in-memory jobs
const JOB_TTL_MS = 30*60*1000;
const jobs = new Map(); // jobId -> { letters, createdAt }
function putJobMem(jobId, letters){ jobs.set(jobId,{ letters, createdAt: Date.now() }); }
function getJobMem(jobId){
  const j = jobs.get(jobId);
  if(!j) return null;
  if(Date.now()-j.createdAt > JOB_TTL_MS){ jobs.delete(jobId); return null; }
  return j;
}
async function loadJobAny(jobId){
  let job = getJobMem(jobId);
  if(job) return job;
  const disk = await loadJobFromDisk(jobId);
  if(!disk) return null;
  const letters = disk.letters.map(item => ({
    ...item,
    html: fs.existsSync(item.htmlPath) ? fs.readFileSync(item.htmlPath, "utf-8") : "<html><body>Letter unavailable.</body></html>",
  }));
  putJobMem(jobId, letters);
  return getJobMem(jobId);
}
if (process.env.NODE_ENV !== "test") {
  setInterval(async ()=>{
    const now = Date.now();
    for(const [id,j] of jobs){
      if(now - j.createdAt > JOB_TTL_MS) jobs.delete(id);
    }
    const idx = await loadJobsIndex();
    let changed = false;
    for(const [id,meta] of Object.entries(idx.jobs || {})){
      if(now - (meta.createdAt || 0) > JOB_TTL_MS){
        const dir = path.join(LETTERS_DIR, meta.dir || id);
        try{ fs.rmSync(dir, { recursive:true, force:true }); }catch{}
        delete idx.jobs[id];
        changed = true;
      }
    }
    if(changed) await saveJobsIndex(idx);
  }, 5*60*1000);
}

// disk index helpers stored in SQLite
async function loadJobsIndex(){
  const idx = await readKey('letter_jobs_idx', null);
  return idx || { jobs:{} };
}
async function saveJobsIndex(idx){
  await writeKey('letter_jobs_idx', idx);
}

// Create job: memory + disk
async function persistJobToDisk(jobId, letters){
  console.log(`Persisting job ${jobId} with ${letters.length} letters to disk`);
  const idx = await loadJobsIndex();
  idx.jobs[jobId] = {
    createdAt: Date.now(),
    dir: jobId,
    letters: letters.map(L => ({
      filename: L.filename,
      bureau: L.bureau,
      creditor: L.creditor,
      useOcr: !!L.useOcr
    }))
  };
  await saveJobsIndex(idx);
  console.log(`Job ${jobId} saved to index`);
}

// Load job from disk (returns { letters: [{... , htmlPath}]})
async function loadJobFromDisk(jobId){
  console.log(`Loading job ${jobId} from disk`);
  const idx = await loadJobsIndex();
  const meta = idx.jobs?.[jobId];
  if(!meta){
    console.warn(`Job ${jobId} not found on disk`);
    return null;
  }
  const jobDir = meta.dir || jobId;
  const letters = (meta.letters || []).map(item => ({
    ...item,
    htmlPath: path.join(LETTERS_DIR, jobDir, item.filename),
  }));
  console.log(`Loaded job ${jobId} with ${letters.length} letters from disk`);
  return { letters, createdAt: meta.createdAt || Date.now(), dir: jobDir };
}

async function deleteJob(jobId){
  jobs.delete(jobId);
  const idx = await loadJobsIndex();
  const meta = idx.jobs?.[jobId];
  if(meta){
    const dir = path.join(LETTERS_DIR, meta.dir || jobId);
    try{ fs.rmSync(dir, { recursive:true, force:true }); }catch{}
    delete idx.jobs[jobId];
    await saveJobsIndex(idx);
  }
}

function makeJobStorageKey(jobId) {
  return `job:${jobId}`;
}

function makeIdempotencyStorageKey(operation, rawKey) {
  const hash = crypto.createHash("sha256").update(String(rawKey)).digest("hex");
  return `idempotency:${operation}:${hash}`;
}

function sanitizeIdempotencyKey(raw) {
  if (raw === undefined || raw === null) return null;
  const key = String(raw).trim();
  if (!key) return null;
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new Error(`x-idempotency-key must be <= ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`);
  }
  return key;
}

async function readIdempotencyRecord(tenantId, operation, key) {
  if (!key) return null;
  const storageKey = makeIdempotencyStorageKey(operation, key);
  return readKey(storageKey, null, tenantScope(tenantId));
}

async function writeIdempotencyRecord(tenantId, operation, key, value) {
  if (!key) return;
  const storageKey = makeIdempotencyStorageKey(operation, key);
  await writeKey(storageKey, value, tenantScope(tenantId));
}

async function createJobRecord({ tenantId, jobId, type, userId, metadata = {}, idempotencyKey = null }) {
  const now = new Date().toISOString();
  const record = {
    id: jobId,
    type,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    userId: userId || null,
    metadata,
    idempotencyKey,
    queueEnabled: isQueueEnabled(),
  };
  await writeKey(makeJobStorageKey(jobId), record, tenantScope(tenantId));
  return record;
}

async function updateJobRecord(tenantId, jobId, updates) {
  const scope = tenantScope(tenantId);
  const existing = (await readKey(makeJobStorageKey(jobId), null, scope)) || { id: jobId };
  const record = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await writeKey(makeJobStorageKey(jobId), record, scope);
  return record;
}

async function markJobStatus(tenantId, jobId, status, updates = {}) {
  return updateJobRecord(tenantId, jobId, { status, ...updates });
}

function sanitizeJobForResponse(record) {
  if (!record) return null;
  const { idempotencyKey, ...rest } = record;
  return rest;
}

function isAdminUser(user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  return perms.includes("admin");
}

function canAccessJob(user, jobRecord) {
  if (!user || !jobRecord) return false;
  if (jobRecord.userId && jobRecord.userId === user.id) return true;
  if (isAdminUser(user)) return true;
  return false;
}

async function getJobRecord(tenantId, jobId) {
  return readKey(makeJobStorageKey(jobId), null, tenantScope(tenantId));
}

async function preflightLettersJob(payload, { tenantId, userId }) {
  const {
    consumerId,
    reportId,
    selections = [],
    requestType = "correct",
    personalInfo,
    inquiries,
    collectors,
    workflow = {},
  } = payload || {};

  const db = await loadDB();
  const consumer = db.consumers.find((c) => c.id === consumerId);
  if (!consumer) {
    return { ok: false, status: 404, error: "Consumer not found" };
  }
  let reportWrap = consumer.reports.find((r) => r.id === reportId);
  if (!reportWrap) {
    const sharedReport = db.consumers
      .flatMap((c) => (Array.isArray(c.reports) ? c.reports : []))
      .find((r) => r.id === reportId);
    if (sharedReport) {
      reportWrap = sharedReport;
    }
  }
  if (!reportWrap) {
    return { ok: false, status: 404, error: "Report not found" };
  }

  for (const sel of selections || []) {
    if (!sel) continue;
    if (!Array.isArray(sel.bureaus) || sel.bureaus.length === 0) {
      logWarn("MISSING_BUREAUS", "Rejecting selection without bureaus", sel);
      return { ok: false, status: 400, error: "Selection missing bureaus" };
    }
  }

  const requestedBureaus = collectRequestedBureaus({ selections, personalInfo, inquiries });
  const workflowForceEnforce = workflow?.forceEnforce === undefined ? undefined : !!workflow.forceEnforce;
  const validation = await validateWorkflowOperation("letters.generate", {
    consumerId: consumer.id,
    requestType,
    bureaus: requestedBureaus,
    now: new Date().toISOString(),
    userId: userId || null,
    forceEnforce: workflowForceEnforce,
  });
  if (!validation.ok) {
    return {
      ok: false,
      status: 409,
      error: "Workflow rules blocked this dispute batch.",
      validation,
    };
  }
  if (validation.results?.some((r) => !r.ok && r.level === "warn")) {
    logWarn("WORKFLOW_RULE_WARNING", "Workflow validation returned warnings", {
      consumerId: consumer.id,
      rules: validation.results.filter((r) => !r.ok).map((r) => r.ruleId),
    });
  }

  return {
    ok: true,
    context: {
      consumerId: consumer.id,
      reportId: reportWrap.id,
      requestedBureaus,
      workflowForceEnforce,
      validation,
      selectionCount: Array.isArray(selections) ? selections.length : 0,
      personalInfoCount: Array.isArray(personalInfo) ? personalInfo.length : 0,
      inquiryCount: Array.isArray(inquiries) ? inquiries.length : 0,
      collectorCount: Array.isArray(collectors) ? collectors.length : 0,
    },
  };
}

async function executeLettersGenerationJob({ jobId, tenantId, userId, payload }) {
  return withTenantContext(tenantId, async () => {
    const {
      consumerId,
      reportId,
      selections = [],
      requestType = "correct",
      personalInfo,
      inquiries,
      collectors,
      useOcr,
      workflow = {},
    } = payload || {};

    const db = await loadDB();
    const consumer = db.consumers.find((c) => c.id === consumerId);
    if (!consumer) {
      const err = new Error("Consumer not found");
      err.status = 404;
      throw err;
    }
    let reportWrap = consumer.reports.find((r) => r.id === reportId);
    if (!reportWrap) {
      const sharedReport = db.consumers
        .flatMap((c) => (Array.isArray(c.reports) ? c.reports : []))
        .find((r) => r.id === reportId);
      if (sharedReport) {
        reportWrap = sharedReport;
      }
    }
    if (!reportWrap) {
      const err = new Error("Report not found");
      err.status = 404;
      throw err;
    }

    const specialReasonMap = {
      identity: "identity theft",
      breach: "data breach",
      assault: "sexual assault",
    };

    const normalizedSelections = Array.isArray(selections)
      ? selections.map((sel) => ({ ...(sel || {}) }))
      : [];
    for (const sel of normalizedSelections) {
      if (!sel) continue;
      if (sel.specialMode && !sel.specificDisputeReason && specialReasonMap[sel.specialMode]) {
        sel.specificDisputeReason = specialReasonMap[sel.specialMode];
      }
      if (!Array.isArray(sel.bureaus) || sel.bureaus.length === 0) {
        const err = new Error("Selection missing bureaus");
        err.status = 400;
        throw err;
      }
    }

    const consumerForLetter = {
      name: consumer.name,
      email: consumer.email,
      phone: consumer.phone,
      addr1: consumer.addr1,
      addr2: consumer.addr2,
      city: consumer.city,
      state: consumer.state,
      zip: consumer.zip,
      ssn_last4: consumer.ssn_last4,
      dob: consumer.dob,
      breaches: consumer.breaches || [],
    };

    const requestedBureaus = collectRequestedBureaus({
      selections: normalizedSelections,
      personalInfo,
      inquiries,
    });

    const workflowForceEnforce = workflow?.forceEnforce === undefined ? undefined : !!workflow.forceEnforce;
    const validation = await validateWorkflowOperation("letters.generate", {
      consumerId: consumer.id,
      requestType,
      bureaus: requestedBureaus,
      now: new Date().toISOString(),
      userId: userId || null,
      forceEnforce: workflowForceEnforce,
    });
    if (!validation.ok) {
      const err = new Error("Workflow rules blocked this dispute batch.");
      err.status = 409;
      err.validation = validation;
      throw err;
    }

    const lettersDb = await loadLettersDB();
    const playbooks = await loadPlaybooks();
    const letters = generateLetters({
      report: reportWrap.data,
      selections: normalizedSelections,
      consumer: consumerForLetter,
      requestType,
      templates: lettersDb.templates || [],
      playbooks,
    });
    if (Array.isArray(personalInfo) && personalInfo.length) {
      letters.push(
        ...generatePersonalInfoLetters({
          consumer: consumerForLetter,
          mismatchedFields: personalInfo,
        }),
      );
    }
    if (Array.isArray(inquiries) && inquiries.length) {
      letters.push(...generateInquiryLetters({ consumer: consumerForLetter, inquiries }));
    }
    if (Array.isArray(collectors) && collectors.length) {
      letters.push(...generateDebtCollectorLetters({ consumer: consumerForLetter, collectors }));
    }

    for (const L of letters) {
      L.useOcr = !!useOcr;
    }
    for (const L of letters) {
      const sel = normalizedSelections.find((s) => s.tradelineIndex === L.tradelineIndex);
      if (sel && sel.useOcr !== undefined) L.useOcr = !!sel.useOcr;
    }

    const jobDir = path.join(LETTERS_DIR, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
    for (const L of letters) {
      fs.writeFileSync(path.join(jobDir, L.filename), L.html, "utf-8");
    }

    const requestUserId = userId || "guest";
    putJobMem(jobId, letters);
    await persistJobToDisk(jobId, letters);
    await recordLettersJob(requestUserId, consumer.id, jobId, letters);

    let jobRequestType = requestType;
    if (normalizedSelections.length) {
      const firstSel = normalizedSelections[0];
      const tpl = firstSel.templateId && (lettersDb.templates || []).find((t) => t.id === firstSel.templateId);
      jobRequestType = firstSel.requestType || tpl?.requestType || requestType;
    }

    await addEvent(consumer.id, "letters_generated", {
      jobId,
      requestType: jobRequestType,
      count: letters.length,
      tradelines: Array.from(new Set(normalizedSelections.map((s) => s.tradelineIndex))).length,
      inquiries: Array.isArray(inquiries) ? inquiries.length : 0,
      collectors: Array.isArray(collectors) ? collectors.length : 0,
      bureaus: requestedBureaus,
    });

    for (const sel of normalizedSelections) {
      const play = sel.playbook && playbooks[sel.playbook];
      if (!play) continue;
      const followUps = play.letters.slice(1);
      for (const [idx, title] of followUps.entries()) {
        const due = new Date();
        due.setDate(due.getDate() + (idx + 1) * 30);
        await addReminder(consumer.id, {
          id: `rem_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          due: due.toISOString(),
          payload: {
            tradelineIndex: sel.tradelineIndex,
            playbook: sel.playbook,
            step: title,
            stepNumber: idx + 2,
          },
        });
      }
    }

    return {
      redirect: `/letters?job=${jobId}`,
      validation,
      lettersCount: letters.length,
      requestType: jobRequestType,
      requestedBureaus,
      consumerId: consumer.id,
    };
  });
}

async function preflightAuditJob(payload, { tenantId }) {
  const consumerId = String(payload?.consumerId || payload?.id || "").trim();
  const reportId = String(payload?.reportId || payload?.rid || "").trim();
  if (!consumerId || !reportId) {
    return { ok: false, status: 400, error: "consumerId and reportId are required" };
  }

  const db = await withTenantContext(tenantId, () => loadDB());
  const consumer = db.consumers.find((c) => c.id === consumerId);
  if (!consumer) {
    return { ok: false, status: 404, error: "Consumer not found" };
  }
  const report = consumer.reports.find((r) => r.id === reportId);
  if (!report) {
    return { ok: false, status: 404, error: "Report not found" };
  }

  return {
    ok: true,
    context: {
      consumerId,
      reportId,
    },
  };
}

registerJobProcessor(JOB_TYPES.LETTERS_GENERATE, async (data) => {
  const { jobId, tenantId, userId, payload } = data || {};
  if (!jobId || !tenantId) {
    logWarn("LETTER_JOB_SKIPPED", "Missing identifiers for letters.generate job", data);
    return;
  }
  await markJobStatus(tenantId, jobId, "processing");
  try {
    const result = await executeLettersGenerationJob({ jobId, tenantId, userId, payload });
    await markJobStatus(tenantId, jobId, "completed", { result });
  } catch (err) {
    const errorPayload = {
      error: {
        message: err?.message || "Letter generation failed",
        status: err?.status || 500,
      },
    };
    if (err?.validation) {
      errorPayload.validation = err.validation;
    }
    await markJobStatus(tenantId, jobId, "failed", errorPayload);
    throw err;
  }
});

async function executeLettersPdfJob({ jobId, tenantId, userId, payload }) {
  return withTenantContext(tenantId, async () => {
    const sourceJobId = String(payload?.sourceJobId || "").trim();
    if (!sourceJobId) {
      const err = new Error("sourceJobId required");
      err.status = 400;
      throw err;
    }

    const requesterId = userId || "guest";
    const letterJob = await loadJobForUser(sourceJobId, requesterId);
    if (!letterJob) {
      const err = new Error("Letters job not found or expired");
      err.status = 404;
      throw err;
    }

    const { job: letterData, meta } = letterJob;
    if (!letterData || !Array.isArray(letterData.letters) || letterData.letters.length === 0) {
      const err = new Error("Letters job has no letters");
      err.status = 404;
      throw err;
    }

    const pdfDir = path.join(LETTERS_DIR, sourceJobId, "pdf");
    fs.mkdirSync(pdfDir, { recursive: true });
    const zipPath = path.join(pdfDir, `${jobId}.zip`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    const output = fs.createWriteStream(zipPath);
    archive.on("error", (err) => {
      throw err;
    });
    archive.pipe(output);

    const needsBrowser = letterData.letters.some((l) => !l.useOcr);
    let browserInstance = null;
    try {
      if (needsBrowser) {
        try {
          browserInstance = await launchBrowser();
        } catch (err) {
          logWarn("LETTER_PDF_BROWSER_UNAVAILABLE", err?.message || "Browser launch failed", { jobId: sourceJobId });
          browserInstance = null;
        }
      }

      for (let i = 0; i < letterData.letters.length; i += 1) {
        const L = letterData.letters[i];
        const baseName = (L.filename || `letter${i}`).replace(/\.html?$/i, "");
        const pdfName = `${baseName}.pdf`;
        try {
          if (L.useOcr) {
            const pdfBuffer = await generateOcrPdf(L.html);
            archive.append(pdfBuffer, { name: pdfName });
            continue;
          }

          const pdfBuffer = await htmlToPdfBuffer(L.html, {
            browser: browserInstance || undefined,
            allowBrowserLaunch: false,
            title: `${L.bureau || "Dispute"} Letter`,
          });
          archive.append(pdfBuffer, { name: pdfName });
        } catch (err) {
          logError("LETTER_PDF_APPEND_FAILED", "Failed to append letter to archive", err, {
            jobId: sourceJobId,
            letter: pdfName,
          });
          throw err;
        }
      }

      await archive.finalize();
      await new Promise((resolve, reject) => {
        output.on("close", resolve);
        output.on("error", reject);
      });
    } finally {
      try {
        await browserInstance?.close();
      } catch {}
    }

    let storedFile = null;
    if (meta?.consumerId) {
      try {
        const db = await loadDB();
        const consumer = db.consumers.find((c) => c.id === meta.consumerId);
        if (consumer) {
          const uploadsDir = consumerUploadsDir(consumer.id);
          const id = nanoid(10);
          const storedName = `${id}.zip`;
          const safe = (consumer.name || "client").toLowerCase().replace(/[^a-z0-9]+/g, "_");
          const date = new Date().toISOString().slice(0, 10);
          const originalName = `${safe}_${date}_letters.zip`;
          const dest = path.join(uploadsDir, storedName);
          await fs.promises.copyFile(zipPath, dest);
          const stat = await fs.promises.stat(dest);
          await addFileMeta(consumer.id, {
            id,
            originalName,
            storedName,
            type: "letters_zip",
            size: stat.size,
            mimetype: "application/zip",
            uploadedAt: new Date().toISOString(),
          });
          await addEvent(consumer.id, "letters_zip_ready", {
            jobId: sourceJobId,
            file: `/api/consumers/${consumer.id}/state/files/${storedName}`,
          });
          storedFile = {
            consumerId: consumer.id,
            storedName,
            originalName,
            url: `/api/consumers/${consumer.id}/state/files/${storedName}`,
          };
        }
      } catch (err) {
        logWarn("LETTER_PDF_STORE_FAILED", err?.message || "Failed to store zip", { jobId: sourceJobId });
      }
    }

    return {
      sourceJobId,
      zipPath,
      lettersCount: letterData.letters.length,
      storedFile,
    };
  });
}

registerJobProcessor(JOB_TYPES.LETTERS_PDF, async (data) => {
  const { jobId, tenantId, userId, payload } = data || {};
  if (!jobId || !tenantId) {
    logWarn("LETTER_PDF_JOB_SKIPPED", "Missing identifiers for letters.pdf job", data);
    return;
  }
  await markJobStatus(tenantId, jobId, "processing");
  try {
    const result = await executeLettersPdfJob({ jobId, tenantId, userId, payload });
    await markJobStatus(tenantId, jobId, "completed", {
      result: {
        ...result,
        downloadUrl: `/api/jobs/${jobId}/artifact`,
      },
    });
  } catch (err) {
    await markJobStatus(tenantId, jobId, "failed", {
      error: {
        message: err?.message || "Letter PDF build failed",
        status: err?.status || 500,
      },
    });
    throw err;
  }
});

async function executeAuditJob({ jobId, tenantId, userId, payload }) {
  return withTenantContext(tenantId, async () => {
    const consumerId = String(payload?.consumerId || payload?.id || "").trim();
    const reportId = String(payload?.reportId || payload?.rid || "").trim();
    const payloadSelections = Array.isArray(payload?.selections) && payload.selections.length ? payload.selections : null;

    const db = await loadDB();
    const consumer = db.consumers.find((c) => c.id === consumerId);
    if (!consumer) {
      const err = new Error("Consumer not found");
      err.status = 404;
      throw err;
    }
    const report = consumer.reports.find((r) => r.id === reportId);
    if (!report) {
      const err = new Error("Report not found");
      err.status = 404;
      throw err;
    }
    const savedSelections = Array.isArray(report.auditSelections) && report.auditSelections.length
      ? report.auditSelections
      : null;
    const selections = payloadSelections || savedSelections;

    let normalized;
    try {
      normalized = normalizeReport(report.data, selections);
    } catch (err) {
      err.status = 500;
      logError("AUDIT_NORMALIZE_FAILED", "Failed to normalize report", err, { consumerId, reportId });
      throw err;
    }

    let html;
    try {
      html = renderHtml(normalized, consumer.name);
    } catch (err) {
      const error = new Error("Failed to render audit HTML");
      error.status = 500;
      logError("AUDIT_HTML_RENDER_FAILED", "Failed to render audit HTML", err, { consumerId, reportId });
      throw error;
    }

    let pdfResult;
    try {
      pdfResult = await savePdf(html);
    } catch (err) {
      const error = new Error("Failed to generate audit document");
      error.status = 500;
      logError("AUDIT_PDF_FAILED", "Failed to generate audit PDF", err, { consumerId, reportId });
      throw error;
    }

    let ext = path.extname(pdfResult.path);
    if (pdfResult.warning || ext !== ".pdf") {
      ext = ".html";
    }
    const mime = ext === ".pdf" ? "application/pdf" : "text/html";

    let storedRecord = null;
    try {
      const uploadsDir = consumerUploadsDir(consumer.id);
      const id = nanoid(10);
      const storedName = `${id}${ext}`;
      const safe = (consumer.name || "client").toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const date = new Date().toISOString().slice(0, 10);
      const originalName = `${safe}_${date}_audit${ext}`;
      const dest = path.join(uploadsDir, storedName);
      await fs.promises.copyFile(pdfResult.path, dest);
      const stat = await fs.promises.stat(dest);
      await addFileMeta(consumer.id, {
        id,
        originalName,
        storedName,
        type: "audit",
        size: stat.size,
        mimetype: mime,
        uploadedAt: new Date().toISOString(),
      });
      storedRecord = {
        storedName,
        originalName,
        url: `/api/consumers/${consumer.id}/state/files/${storedName}`,
        size: stat.size,
        mimetype: mime,
      };
    } catch (err) {
      logError("AUDIT_STORE_FAILED", "Failed to store audit file", err, { consumerId, reportId });
    }

    await addEvent(consumer.id, "audit_generated", {
      reportId,
      file: storedRecord?.url || pdfResult.url,
      jobId,
    });

    return {
      consumerId,
      reportId,
      url: pdfResult.url,
      warning: pdfResult.warning,
      storedFile: storedRecord,
      mime,
    };
  });
}

registerJobProcessor(JOB_TYPES.REPORTS_AUDIT, async (data) => {
  const { jobId, tenantId, userId, payload } = data || {};
  if (!jobId || !tenantId) {
    logWarn("AUDIT_JOB_SKIPPED", "Missing identifiers for reports:audit job", data);
    return;
  }
  await markJobStatus(tenantId, jobId, "processing");
  try {
    const result = await executeAuditJob({ jobId, tenantId, userId, payload });
    await markJobStatus(tenantId, jobId, "completed", { result });
  } catch (err) {
    await markJobStatus(tenantId, jobId, "failed", {
      error: {
        message: err?.message || "Audit generation failed",
        status: err?.status || 500,
      },
    });
    throw err;
  }
});

app.get("/api/jobs/:jobId", authenticate, async (req, res) => {
  try {
    const tenantId = resolveRequestTenant(req);
    const jobId = String(req.params.jobId || "").trim();
    if (!jobId) {
      return res.status(400).json({ ok: false, error: "Job ID required" });
    }
    const jobRecord = await getJobRecord(tenantId, jobId);
    if (!jobRecord) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }
    if (!canAccessJob(req.user, jobRecord)) {
      const status = req.user ? 403 : 401;
      return res.status(status).json({ ok: false, error: status === 403 ? "Forbidden" : "Unauthorized" });
    }
    res.json({ ok: true, job: sanitizeJobForResponse(jobRecord) });
  } catch (err) {
    logError("JOB_STATUS_ERROR", "Failed to load job status", err, { jobId: req.params.jobId });
    res.status(500).json({ ok: false, error: "Failed to load job status" });
  }
});

app.get("/api/jobs/:jobId/artifact", authenticate, async (req, res) => {
  try {
    const tenantId = resolveRequestTenant(req);
    const jobId = String(req.params.jobId || "").trim();
    if (!jobId) {
      return res.status(400).json({ ok: false, error: "Job ID required" });
    }
    const jobRecord = await getJobRecord(tenantId, jobId);
    if (!jobRecord || jobRecord.status !== "completed") {
      return res.status(404).json({ ok: false, error: "Artifact unavailable" });
    }
    if (!canAccessJob(req.user, jobRecord)) {
      const status = req.user ? 403 : 401;
      return res.status(status).json({ ok: false, error: status === 403 ? "Forbidden" : "Unauthorized" });
    }
    const zipPath = jobRecord.result?.zipPath;
    if (!zipPath) {
      return res.status(404).json({ ok: false, error: "Artifact not found" });
    }
    const absolutePath = path.resolve(zipPath);
    if (!absolutePath.startsWith(path.resolve(LETTERS_DIR))) {
      return res.status(400).json({ ok: false, error: "Invalid artifact path" });
    }
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ ok: false, error: "Artifact missing" });
    }
    res.download(absolutePath, path.basename(absolutePath));
  } catch (err) {
    logError("JOB_ARTIFACT_ERROR", "Failed to serve job artifact", err, { jobId: req.params.jobId });
    res.status(500).json({ ok: false, error: "Failed to load artifact" });
  }
});

app.post(
  "/api/letters/:jobId/pdf",
  authenticate,
  requirePermission("letters", { allowGuest: true }),
  enforceTenantQuota("letters:pdf"),
  async (req, res) => {
    try {
      let idempotencyKey;
      try {
        idempotencyKey = sanitizeIdempotencyKey(req.get("x-idempotency-key"));
      } catch (err) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      if (!idempotencyKey) {
        return res.status(400).json({ ok: false, error: "x-idempotency-key header required" });
      }

      const tenantId = resolveRequestTenant(req);
      const sourceJobId = String(req.params.jobId || "").trim();
      if (!sourceJobId) {
        return res.status(400).json({ ok: false, error: "Letters job ID required" });
      }

      const compositeKey = `${sourceJobId}:${idempotencyKey}`;
      const existing = await readIdempotencyRecord(tenantId, JOB_TYPES.LETTERS_PDF, compositeKey);
      if (existing?.jobId) {
        const jobRecord = await getJobRecord(tenantId, existing.jobId);
        if (jobRecord) {
          return res.status(200).json({
            ok: true,
            jobId: jobRecord.id,
            status: jobRecord.status,
            type: jobRecord.type,
            job: sanitizeJobForResponse(jobRecord),
          });
        }
      }

      const letterJobRecord = await getJobRecord(tenantId, sourceJobId);
      if (!letterJobRecord || letterJobRecord.type !== JOB_TYPES.LETTERS_GENERATE) {
        return res.status(404).json({ ok: false, error: "Letters job not found" });
      }
      if (letterJobRecord.status !== "completed") {
        return res.status(409).json({ ok: false, error: "Letters job still processing", status: letterJobRecord.status });
      }

      const userId = req.user?.id || "guest";
      const letterJob = await loadJobForUser(sourceJobId, userId);
      if (!letterJob) {
        return res.status(404).json({ ok: false, error: "Letters job not found or expired" });
      }

      const jobId = crypto.randomBytes(8).toString("hex");
      const metadata = {
        sourceJobId,
        lettersCount: Array.isArray(letterJob.job?.letters) ? letterJob.job.letters.length : 0,
      };
      await createJobRecord({
        tenantId,
        jobId,
        type: JOB_TYPES.LETTERS_PDF,
        userId,
        metadata,
        idempotencyKey: compositeKey,
      });
      await writeIdempotencyRecord(tenantId, JOB_TYPES.LETTERS_PDF, compositeKey, { jobId });

      await enqueueJob(JOB_TYPES.LETTERS_PDF, {
        jobId,
        tenantId,
        userId,
        payload: { sourceJobId },
      });

      const jobRecord = await getJobRecord(tenantId, jobId);
      res.status(202).json({
        ok: true,
        jobId,
        status: jobRecord?.status || "queued",
        type: JOB_TYPES.LETTERS_PDF,
        job: sanitizeJobForResponse(jobRecord),
      });
    } catch (err) {
      logError("LETTER_PDF_JOB_ERROR", "Failed to queue PDF job", err, { jobId: req.params.jobId });
      res.status(500).json({ ok: false, error: "Failed to queue PDF job" });
    }
  },
);

app.get("/api/jobs/:jobId/artifact", optionalAuth, async (req, res) => {
  try {
    const tenantId = resolveRequestTenant(req);
    const jobId = String(req.params.jobId || "").trim();
    if (!jobId) {
      return res.status(400).json({ ok: false, error: "Job ID required" });
    }
    const jobRecord = await getJobRecord(tenantId, jobId);
    if (!jobRecord || jobRecord.status !== "completed") {
      return res.status(404).json({ ok: false, error: "Artifact unavailable" });
    }
    const zipPath = jobRecord.result?.zipPath;
    if (!zipPath) {
      return res.status(404).json({ ok: false, error: "Artifact not found" });
    }
    const absolutePath = path.resolve(zipPath);
    if (!absolutePath.startsWith(path.resolve(LETTERS_DIR))) {
      return res.status(400).json({ ok: false, error: "Invalid artifact path" });
    }
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ ok: false, error: "Artifact missing" });
    }
    res.download(absolutePath, path.basename(absolutePath));
  } catch (err) {
    logError("JOB_ARTIFACT_ERROR", "Failed to serve job artifact", err, { jobId: req.params.jobId });
    res.status(500).json({ ok: false, error: "Failed to load artifact" });
  }
});

app.post(
  "/api/letters/:jobId/pdf",
  authenticate,
  requirePermission("letters", { allowGuest: true }),
  enforceTenantQuota("letters:pdf"),
  async (req, res) => {
    try {
      let idempotencyKey;
      try {
        idempotencyKey = sanitizeIdempotencyKey(req.get("x-idempotency-key"));
      } catch (err) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      if (!idempotencyKey) {
        return res.status(400).json({ ok: false, error: "x-idempotency-key header required" });
      }

      const tenantId = resolveRequestTenant(req);
      const sourceJobId = String(req.params.jobId || "").trim();
      if (!sourceJobId) {
        return res.status(400).json({ ok: false, error: "Letters job ID required" });
      }

      const compositeKey = `${sourceJobId}:${idempotencyKey}`;
      const existing = await readIdempotencyRecord(tenantId, JOB_TYPES.LETTERS_PDF, compositeKey);
      if (existing?.jobId) {
        const jobRecord = await getJobRecord(tenantId, existing.jobId);
        if (jobRecord) {
          return res.status(200).json({
            ok: true,
            jobId: jobRecord.id,
            status: jobRecord.status,
            type: jobRecord.type,
            job: sanitizeJobForResponse(jobRecord),
          });
        }
      }

      const letterJobRecord = await getJobRecord(tenantId, sourceJobId);
      if (!letterJobRecord || letterJobRecord.type !== JOB_TYPES.LETTERS_GENERATE) {
        return res.status(404).json({ ok: false, error: "Letters job not found" });
      }
      if (letterJobRecord.status !== "completed") {
        return res.status(409).json({ ok: false, error: "Letters job still processing", status: letterJobRecord.status });
      }

      const userId = req.user?.id || "guest";
      const letterJob = await loadJobForUser(sourceJobId, userId);
      if (!letterJob) {
        return res.status(404).json({ ok: false, error: "Letters job not found or expired" });
      }

      const jobId = crypto.randomBytes(8).toString("hex");
      const metadata = {
        sourceJobId,
        lettersCount: Array.isArray(letterJob.job?.letters) ? letterJob.job.letters.length : 0,
      };
      await createJobRecord({
        tenantId,
        jobId,
        type: JOB_TYPES.LETTERS_PDF,
        userId,
        metadata,
        idempotencyKey: compositeKey,
      });
      await writeIdempotencyRecord(tenantId, JOB_TYPES.LETTERS_PDF, compositeKey, { jobId });

      await enqueueJob(JOB_TYPES.LETTERS_PDF, {
        jobId,
        tenantId,
        userId,
        payload: { sourceJobId },
      });

      const jobRecord = await getJobRecord(tenantId, jobId);
      res.status(202).json({
        ok: true,
        jobId,
        status: jobRecord?.status || "queued",
        type: JOB_TYPES.LETTERS_PDF,
        job: sanitizeJobForResponse(jobRecord),
      });
    } catch (err) {
      logError("LETTER_PDF_JOB_ERROR", "Failed to queue PDF job", err, { jobId: req.params.jobId });
      res.status(500).json({ ok: false, error: "Failed to queue PDF job" });
    }
  },
);


// Generate letters (from selections) -> background job
app.post(
  "/api/generate",
  authenticate,
  requirePermission("letters", { allowGuest: true }),
  enforceTenantQuota("letters:generate"),
  async (req, res) => {
    try {
      let idempotencyKey;
      try {
        idempotencyKey = sanitizeIdempotencyKey(req.get("x-idempotency-key"));
      } catch (err) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      if (!idempotencyKey) {
        return res.status(400).json({ ok: false, error: "x-idempotency-key header required" });
      }

      const tenantId = resolveRequestTenant(req);
      const existing = await readIdempotencyRecord(tenantId, JOB_TYPES.LETTERS_GENERATE, idempotencyKey);
      if (existing?.jobId) {
        const jobRecord = await getJobRecord(tenantId, existing.jobId);
        if (jobRecord) {
          return res.status(200).json({
            ok: true,
            jobId: jobRecord.id,
            status: jobRecord.status,
            type: jobRecord.type,
            job: sanitizeJobForResponse(jobRecord),
          });
        }
      }

      const payload = req.body || {};
      const preflight = await preflightLettersJob(payload, {
        tenantId,
        userId: req.user?.id || null,
      });
      if (!preflight.ok) {
        const response = { ok: false, error: preflight.error || "Unable to queue letters" };
        if (preflight.validation) {
          response.validation = preflight.validation;
        }
        return res.status(preflight.status || 400).json(response);
      }

      const jobId = crypto.randomBytes(8).toString("hex");
      const metadata = {
        consumerId: preflight.context.consumerId,
        reportId: preflight.context.reportId,
        requestedBureaus: preflight.context.requestedBureaus,
        selectionCount: preflight.context.selectionCount,
      };
      await createJobRecord({
        tenantId,
        jobId,
        type: JOB_TYPES.LETTERS_GENERATE,
        userId: req.user?.id || null,
        metadata,
        idempotencyKey,
      });
      await writeIdempotencyRecord(tenantId, JOB_TYPES.LETTERS_GENERATE, idempotencyKey, { jobId });

      await enqueueJob(JOB_TYPES.LETTERS_GENERATE, {
        jobId,
        tenantId,
        userId: req.user?.id || null,
        payload,
      });

      const jobRecord = await getJobRecord(tenantId, jobId);
      const redirect = `/letters?job=${jobId}`;
      res.status(202).json({
        ok: true,
        jobId,
        status: jobRecord?.status || "queued",
        type: JOB_TYPES.LETTERS_GENERATE,
        redirect,
        job: sanitizeJobForResponse(jobRecord),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: String(e) });
    }
  },
 );

// List stored letter jobs
app.get("/api/letters", authenticate, requirePermission("letters", { allowGuest: true }), async (req,res)=>{

  const ldb = await loadLettersDB();
  const cdb = await loadDB();
  const userId = req.user?.id || "guest";
  const jobs = ldb.jobs
    .filter(j=>j.userId===userId)
    .map(j => ({
      jobId: j.jobId,
      consumerId: j.consumerId,
      consumerName: cdb.consumers.find(c=>c.id===j.consumerId)?.name || "",
      createdAt: j.createdAt,
      count: (j.letters || []).length
    }));
  console.log(`Listing ${jobs.length} letter jobs for ${userId}`);
  res.json({ ok:true, jobs });
});

app.delete("/api/letters/:jobId", authenticate, requirePermission("letters", { allowGuest: true }), async (req,res)=>{
  const { jobId } = req.params;
  try{
    deleteJob(jobId);
    const ldb = await loadLettersDB();
    const userId = req.user?.id || "guest";
    ldb.jobs = ldb.jobs.filter(j => !(j.jobId === jobId && j.userId === userId));
    await saveLettersDB(ldb);
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ ok:false, error:String(e) });
  }
});

// List letters for a job
app.get("/api/letters/:jobId", authenticate, requirePermission("letters", { allowGuest: true }), async (req,res)=>{

  const { jobId } = req.params;
  const userId = req.user?.id || "guest";
  const tenantId = resolveRequestTenant(req);
  const jobRecord = await getJobRecord(tenantId, jobId);
  if (jobRecord && jobRecord.status !== "completed") {
    return res.status(202).json({
      ok: false,
      status: jobRecord.status,
      job: sanitizeJobForResponse(jobRecord),
    });
  }
  const result = await loadJobForUser(jobId, userId);
  if(!result) return res.status(404).json({ ok:false, error:"Job not found or expired" });
  const { job } = result;
  const meta = job.letters.map((L,i)=>({ index:i, filename:L.filename, bureau:L.bureau, creditor:L.creditor, requestType:L.requestType, specificDisputeReason: L.specificDisputeReason }));

  console.log(`Job ${jobId} has ${meta.length} letters`);
  res.json({ ok:true, letters: meta });
});

// Serve letter HTML (preview embed)
app.get("/api/letters/:jobId/:idx.html", optionalAuth, async (req,res)=>{

  const { jobId, idx } = req.params;
  if(req.user && !hasPermission(req.user, "letters")){
    return res.status(403).json({ ok:false, error:"Forbidden" });
  }
  const tenantId = resolveRequestTenant(req);
  const jobRecord = await getJobRecord(tenantId, jobId);
  if (jobRecord && jobRecord.status !== "completed") {
    return res.status(202).json({ ok:false, status: jobRecord.status });
  }
  let job = null;
  if(req.user){
    const result = await loadJobForUser(jobId, req.user.id);
    if(result) job = result.job;
  } else {
    job = await loadJobAny(jobId);
  }
  if(!job) return res.status(404).send("Job not found or expired.");
  const L = job.letters[Number(idx)];
  if(!L) return res.status(404).send("Letter not found.");
  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.send(L.html);
});

// Render letter PDF on-the-fly
app.get("/api/letters/:jobId/:idx.pdf", optionalAuth, enforceTenantQuota("letters:pdf"), async (req,res)=>{

  const { jobId, idx } = req.params;
  if(req.user && !hasPermission(req.user, "letters")){
    return res.status(403).json({ ok:false, error:"Forbidden" });
  }
  console.log(`Generating PDF for job ${jobId} letter ${idx}`);
  const tenantId = resolveRequestTenant(req);
  const jobRecord = await getJobRecord(tenantId, jobId);
  if (jobRecord && jobRecord.status !== "completed") {
    return res.status(202).json({ ok:false, status: jobRecord.status });
  }
  let job = null;
  if(req.user){
    const result = await loadJobForUser(jobId, req.user.id);
    if(result) job = result.job;
  } else {
    job = await loadJobAny(jobId);
  }
  if(!job) return res.status(404).send("Job not found or expired.");
  const L = job.letters[Number(idx)];
  if(!L) return res.status(404).send("Letter not found.");
  let html = L.html;
  let filenameBase = (L.filename||"letter").replace(/\.html?$/i,"");
  let useOcr = !!L.useOcr;

  if(!html || !html.trim()){
    logError("LETTER_HTML_MISSING", "No HTML content for PDF generation", null, { jobId, idx });
    return res.status(500).json({ ok:false, error:'No HTML content to render' });
  }

  if(useOcr){
    try{
      const pdfBuffer = await generateOcrPdf(html);

      res.setHeader("Content-Type","application/pdf");
      res.setHeader("Content-Disposition",`attachment; filename="${filenameBase}.pdf"`);
      console.log(`Generated OCR PDF for ${filenameBase} (${pdfBuffer.length} bytes)`);
      return res.send(pdfBuffer);
    }catch(e){
      console.error("OCR PDF error:", e);
      return res.status(500).json({ ok:false, error:'Failed to render OCR PDF.' });
    }
  }

  try{
    const pdfBuffer = await htmlToPdfBuffer(html, { title: `${L.bureau || "Dispute"} Letter` });
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",`attachment; filename="${filenameBase}.pdf"`);
    console.log(`Generated PDF for ${filenameBase} (${pdfBuffer.length} bytes)`);
    res.send(pdfBuffer);
  }catch(e){
    console.error("PDF error:", e);
    res.status(500).json({ ok:false, error:'Failed to render PDF.' });
  }

});

app.get("/api/letters/:jobId/all.zip", authenticate, requirePermission("letters", { allowGuest: true }), enforceTenantQuota("letters:zip"), async (req,res)=>{

  const { jobId } = req.params;
  const userId = req.user?.id || "guest";
  const result = await loadJobForUser(jobId, userId);
  if(!result) return res.status(404).json({ ok:false, error:"Job not found or expired" });
  const { job, meta } = result;

  res.setHeader("Content-Type","application/zip");
  res.setHeader("Content-Disposition",`attachment; filename="letters_${jobId}.zip"`);
  const archive = archiver('zip',{ zlib:{ level:9 } });
  archive.on('error', err => {
    logError('ARCHIVE_STREAM_ERROR', 'Archive stream error', err, { jobId });
    try{ res.status(500).json({ ok:false, errorCode:'ARCHIVE_STREAM_ERROR', message:'Zip error' }); }catch{}
  });

  // determine consumer for logging and file storage
  let fileStream, storedName, originalName, consumer, id;
  try{
    if(meta.consumerId){
      const db = await loadDB();
      consumer = db.consumers.find(c=>c.id === meta.consumerId);
    }
  }catch{}

  if(consumer){
    const pass = new PassThrough();
    archive.pipe(pass);
    pass.pipe(res);

    const dir = consumerUploadsDir(consumer.id);
    id = nanoid(10);
    storedName = `${id}.zip`;
    const safe = (consumer.name || 'client').toLowerCase().replace(/[^a-z0-9]+/g,'_');
    const date = new Date().toISOString().slice(0,10);
    originalName = `${safe}_${date}_letters.zip`;
    const fullPath = path.join(dir, storedName);
    fileStream = fs.createWriteStream(fullPath);
    pass.pipe(fileStream);
  } else {
    archive.pipe(res);
  }

  const needsBrowser = job.letters.some(l => !l.useOcr);
  let browserInstance;
  try{
    if (needsBrowser) {
      try {
        browserInstance = await launchBrowser();
      } catch (err) {
        logWarn('LETTER_ZIP_BROWSER_UNAVAILABLE', err?.message || 'launch failed', { jobId });
        browserInstance = null;
      }
    }

    for(let i=0;i<job.letters.length;i++){
      const L = job.letters[i];
      const baseName = (L.filename||`letter${i}`).replace(/\.html?$/i,"");
      const pdfName = `${baseName}.pdf`;

      if (L.useOcr) {
        const pdfBuffer = await generateOcrPdf(L.html);

        try{ archive.append(pdfBuffer,{ name: pdfName }); }catch(err){
          logError('ZIP_APPEND_FAILED', 'Failed to append PDF to archive', err, { jobId, letter: pdfName });
          throw err;
        }
        continue;
      }

      const htmlSource = L.html || (L.htmlPath && fs.existsSync(L.htmlPath) ? fs.readFileSync(L.htmlPath, 'utf-8') : '');
      if(!htmlSource){
        logError('ZIP_APPEND_FAILED', 'Letter HTML missing for archive', null, { jobId, letter: pdfName });
        throw new Error('Letter HTML missing');
      }

      try{
        const pdfBuffer = await htmlToPdfBuffer(htmlSource, {
          browser: browserInstance || undefined,
          allowBrowserLaunch: false,
          title: `${L.bureau || 'Dispute'} Letter`,
        });
        archive.append(pdfBuffer,{ name: pdfName });
      }catch(err){
        logError('ZIP_APPEND_FAILED', 'Failed to append PDF to archive', err, { jobId, letter: pdfName });
        throw err;
      }
    }
    await archive.finalize();

    if(fileStream && consumer){
      await new Promise(resolve => fileStream.on('close', resolve));
      try{
        const stat = await fs.promises.stat(path.join(consumerUploadsDir(consumer.id), storedName));
        await addFileMeta(consumer.id, {
          id,
          originalName,
          storedName,
          type: 'letters_zip',
          size: stat.size,
          mimetype: 'application/zip',
          uploadedAt: new Date().toISOString(),
        });
        await addEvent(consumer.id, 'letters_downloaded', { jobId, file: `/api/consumers/${consumer.id}/state/files/${storedName}` });
      }catch(err){ logError('ZIP_RECORD_FAILED', 'Failed to record zip', err, { jobId, consumerId: consumer.id }); }
    }
    logInfo('ZIP_BUILD_SUCCESS', 'Letters zip created', { jobId });
  }catch(e){
    logError('ZIP_BUILD_FAILED', 'Zip generation failed', e, { jobId });
    try{ res.status(500).json({ ok:false, errorCode:'ZIP_BUILD_FAILED', message:'Failed to create zip.' }); }catch{}
  }finally{
    try{ await browserInstance?.close(); }catch{}

  }
});

app.post("/api/letters/:jobId/mail", authenticate, requirePermission("letters"), async (req,res)=>{

  const { jobId } = req.params;
  const result = await loadJobForUser(jobId, req.user.id);
  if(!result) return res.status(404).json({ ok:false, error:"Job not found" });
  const consumerId = String(req.body?.consumerId || "").trim();
  const file = String(req.body?.file || "").trim();
  if(!consumerId) return res.status(400).json({ ok:false, error:"consumerId required" });
  if(!file) return res.status(400).json({ ok:false, error:"file required" });
  const db = await loadDB();
  const consumer = db.consumers.find(c=>c.id===consumerId);
  if(!consumer) return res.status(404).json({ ok:false, error:"Consumer not found" });

  const cstate = await listConsumerState(consumerId);
  const ev = cstate.events.find(e=>e.type==='letters_portal_sent' && e.payload?.jobId===jobId && e.payload?.file?.endsWith(`/state/files/${file}`));
  if(!ev) return res.status(404).json({ ok:false, error:"Letter not found" });
  const filePath = path.join(consumerUploadsDir(consumerId), file);
  try{
    const result = await sendCertifiedMail({
      filePath,
      toName: consumer.name,
      toAddress: consumer.addr1,
      toCity: consumer.city,
      toState: consumer.state,
      toZip: consumer.zip
    });
    await addEvent(consumerId, 'letters_mailed', { jobId, file: ev.payload.file, provider: 'simplecertifiedmail', result });
    res.json({ ok:true });
    logInfo('SCM_MAIL_SUCCESS', 'Sent letter via SimpleCertifiedMail', { jobId, consumerId, file });
  }catch(e){
    logError('SCM_MAIL_FAILED', 'Failed to mail via SimpleCertifiedMail', e, { jobId, consumerId, file });
    res.status(500).json({ ok:false, errorCode:'SCM_MAIL_FAILED', message:String(e) });
  }
});

app.post("/api/letters/:jobId/email", authenticate, requirePermission("letters"), async (req,res)=>{

  const { jobId } = req.params;
  const to = String(req.body?.to || "").trim();
  if(!to) return res.status(400).json({ ok:false, error:"Missing recipient" });
  if(!mailer) return res.status(500).json({ ok:false, error:"Email not configured" });
  const result = await loadJobForUser(jobId, req.user.id);
  if(!result) return res.status(404).json({ ok:false, error:"Job not found or expired" });
  const { job, meta } = result;

  // find consumer for logging
  let consumer = null;
  try{
    if(meta.consumerId){
      const db = await loadDB();
      consumer = db.consumers.find(c=>c.id === meta.consumerId) || null;
    }
  }catch{}

  const needsBrowser = job.letters.some(l => !l.useOcr);
  let browserInstance;
  try{
    if (needsBrowser) browserInstance = await launchBrowser();

    const attachments = [];
    for(let i=0;i<job.letters.length;i++){
      const L = job.letters[i];
      const html = L.html || (L.htmlPath ? fs.readFileSync(L.htmlPath, "utf-8") : fs.readFileSync(path.join(LETTERS_DIR, jobId, L.filename), "utf-8"));

      let pdfBuffer;
      if (L.useOcr) {
        pdfBuffer = await generateOcrPdf(html);

      } else {
        pdfBuffer = await htmlToPdfBuffer(html, {
          browser: browserInstance || undefined,
          allowBrowserLaunch: false,
          title: `${L.bureau || 'Dispute'} Letter`,
        });
      }

      const name = (L.filename || `letter${i}`).replace(/\.html?$/i,"") + '.pdf';
      attachments.push({ filename: name, content: pdfBuffer, contentType: 'application/pdf' });
    }

    await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: `Letters ${jobId}`,
      text: `Attached letters for job ${jobId}`,
      attachments
    });

    if(consumer){
      try{ await addEvent(consumer.id, 'letters_emailed', { jobId, to, count: attachments.length }); }catch{}
    }

    res.json({ ok:true });
    logInfo('EMAIL_SEND_SUCCESS', 'Letters emailed', { jobId, to, count: attachments.length });
  }catch(e){
    logError('EMAIL_SEND_FAILED', 'Failed to email letters', e, { jobId, to });
    res.status(500).json({ ok:false, errorCode:'EMAIL_SEND_FAILED', message:String(e) });

  }finally{
    try{ await browserInstance?.close(); }catch{}

  }
});

app.post("/api/letters/:jobId/portal", authenticate, requirePermission("letters"), async (req,res)=>{

  const { jobId } = req.params;
  const result = await loadJobForUser(jobId, req.user.id);
  if(!result) return res.status(404).json({ ok:false, error:"Job not found or expired" });
  const { job, meta } = result;

  // locate consumer for storage
  let consumer = null;
  try{
    if(meta.consumerId){
      const db = await loadDB();
      consumer = db.consumers.find(c=>c.id === meta.consumerId) || null;
    }
  }catch{}
  if(!consumer) return res.status(400).json({ ok:false, error:"Consumer not found" });

  const needsBrowser = job.letters.some(l => !l.useOcr);
  let browserInstance;
  try{
    logInfo('PORTAL_UPLOAD_START', 'Building portal letters', { jobId, consumerId: consumer.id });

    if (needsBrowser) browserInstance = await launchBrowser();

    const dir = consumerUploadsDir(consumer.id);
    const safe = (consumer.name || 'client').toLowerCase().replace(/[^a-z0-9]+/g,'_');
    const date = new Date().toISOString().slice(0,10);

    for(let i=0;i<job.letters.length;i++){
      const L = job.letters[i];
      const html = L.html || (L.htmlPath ? fs.readFileSync(L.htmlPath, 'utf-8') : fs.readFileSync(path.join(LETTERS_DIR, jobId, L.filename), 'utf-8'));

      let pdfBuffer;
      if (L.useOcr) {
        pdfBuffer = await generateOcrPdf(html);
      } else {
        pdfBuffer = await htmlToPdfBuffer(html, {
          browser: browserInstance || undefined,
          allowBrowserLaunch: false,
          title: `${L.bureau || 'Dispute'} Letter`,
        });
      }

      const id = nanoid(10);
      const storedName = `${id}.pdf`;
      const base = (L.filename||`letter${i}`).replace(/\.html?$/i,"");
      const originalName = `${safe}_${date}_${base}.pdf`;
      const fullPath = path.join(dir, storedName);
      await fs.promises.writeFile(fullPath, pdfBuffer);
      const stat = await fs.promises.stat(fullPath);
      await addFileMeta(consumer.id, {
        id,
        originalName,
        storedName,
        type: 'letter_pdf',
        size: stat.size,
        mimetype: 'application/pdf',
        uploadedAt: new Date().toISOString(),
      });
      await addEvent(consumer.id, 'letters_portal_sent', { jobId, file: `/api/consumers/${consumer.id}/state/files/${storedName}` });
    }

    logInfo('PORTAL_UPLOAD_SUCCESS', 'Portal letters stored', { jobId, consumerId: consumer.id, count: job.letters.length });
    res.json({ ok:true, count: job.letters.length });
  }catch(e){
    logError('PORTAL_UPLOAD_FAILED', 'Letters portal upload failed', e, { jobId });
    res.status(500).json({ ok:false, errorCode:'PORTAL_UPLOAD_FAILED', message:String(e) });
  }finally{
    try{ await browserInstance?.close(); }catch{}
  }
});

app.get("/api/jobs/:jobId/letters", authenticate, requirePermission("letters"), (req, res) => {
  req.url = `/api/letters/${encodeURIComponent(req.params.jobId)}`;
  app._router.handle(req, res);
});
app.get("/api/jobs/:jobId/letters/:idx.html", authenticate, requirePermission("letters"), (req, res) => {
  req.url = `/api/letters/${encodeURIComponent(req.params.jobId)}/${req.params.idx}.html`;
  app._router.handle(req, res);
});
app.get("/api/jobs/:jobId/letters/:idx.pdf", authenticate, requirePermission("letters"), (req, res) => {

  req.url = `/api/letters/${encodeURIComponent(req.params.jobId)}/${req.params.idx}.pdf`;
  app._router.handle(req, res);
});

// =================== Consumer STATE (events + files) ===================
app.get("/api/consumers/:id/tracker", async (req,res)=>{
  const t = await listTracker(req.params.id);
  res.json(t);
});

app.get("/api/tracker/steps", async (_req, res) => {
  res.json({ ok: true, steps: await getTrackerSteps() });
});

app.put("/api/tracker/steps", async (req, res) => {
  const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
  await setTrackerSteps(steps);
  res.json({ ok: true });
});

app.post("/api/consumers/:id/tracker", async (req, res) => {
  const completed = req.body?.completed || {};
  for (const [step, done] of Object.entries(completed)) {
    await markTrackerStep(req.params.id, step, !!done);
  }
  await addEvent(req.params.id, "tracker_updated", { completed });
  res.json({ ok: true });

});

app.get("/api/consumers/:id/state", async (req,res)=>{
  const cstate = await listConsumerState(req.params.id);
  const state = { ...cstate };
  if(state.creditScore == null){
    const db = await loadDB();
    const consumer = db.consumers.find(c=>c.id===req.params.id);
    if(consumer?.creditScore){
      state.creditScore = consumer.creditScore;
    }
  }
  res.json({ ok:true, state });
});

// Upload an attachment (photo/proof/etc.)
const fileUpload = multer({ storage: multer.memoryStorage() });
app.post("/api/consumers/:id/state/upload", fileUpload.single("file"), async (req,res)=>{
  const db = await loadDB();
  const consumer = db.consumers.find(c=>c.id===req.params.id);
  if(!consumer) return res.status(404).json({ ok:false, error:"Consumer not found" });
  if(!req.file) return res.status(400).json({ ok:false, error:"No file uploaded" });

  const dir = consumerUploadsDir(consumer.id);
  const id = nanoid(10);
  const ext = (req.file.originalname.match(/\.[a-z0-9]+$/i)||[""])[0] || "";
  const type = (req.body.type || '').toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'doc';
  const safeName = (consumer.name || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const date = new Date().toISOString().slice(0,10);
  const storedName = `${id}${ext}`;
  const originalName = `${safeName}_${date}_${type}${ext}`;
  const fullPath = path.join(dir, storedName);
  await fs.promises.writeFile(fullPath, req.file.buffer);

  const rec = {
    id,
    originalName,
    storedName,
    type,
    size: req.file.size,
    mimetype: req.file.mimetype,
    uploadedAt: new Date().toISOString()
  };
  await addFileMeta(consumer.id, rec);
  await addEvent(consumer.id, "file_uploaded", { id, name: originalName, size: req.file.size });

  res.json({ ok:true, file: { ...rec, url: `/api/consumers/${consumer.id}/state/files/${storedName}` } });
});

// Serve a consumer file
app.get("/api/consumers/:id/state/files/:stored", (req,res)=>{
  const dir = consumerUploadsDir(req.params.id);
  const full = path.join(dir, path.basename(req.params.stored));
  if (!fs.existsSync(full)) return res.status(404).send("File not found");
  res.sendFile(full);
});

// ============================================================================
// DIY USER MANAGEMENT
// ============================================================================

async function loadDiyUsersDB() {
  let db = await readKey('diy_users', null);
  if (!db) db = { users: [] };
  return db;
}

async function saveDiyUsersDB(db) {
  await writeKey('diy_users', db);
}

async function loadDiyReportsDB() {
  let db = await readKey('diy_reports', null);
  if (!db) db = { reports: [] };
  return db;
}

async function saveDiyReportsDB(db) {
  await writeKey('diy_reports', db);
}

async function loadDiyLettersDB() {
  let db = await readKey('diy_letters', null);
  if (!db) db = { letters: [] };
  return db;
}

async function saveDiyLettersDB(db) {
  await writeKey('diy_letters', db);
}

// DIY Authentication Middleware - uses separate secret to prevent token confusion
const DIY_JWT_SECRET = process.env.DIY_JWT_SECRET || (process.env.JWT_SECRET ? process.env.JWT_SECRET + '-diy' : 'diy-secret-key-isolated');

function diyAuthenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, DIY_JWT_SECRET, { issuer: 'metro2-diy', audience: 'diy-users' });
    if (payload.mode !== 'diy') {
      return res.status(401).json({ ok: false, error: 'Invalid token type' });
    }
    req.diyUser = payload;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }
}

// DIY Plan limits
const DIY_PLAN_LIMITS = {
  free: { canAudit: false, lettersPerMonth: 0 },
  basic: { canAudit: true, lettersPerMonth: 5 },
  pro: { canAudit: true, lettersPerMonth: -1 } // unlimited
};

function diyRequirePlan(allowedPlans) {
  return (req, res, next) => {
    if (!req.diyUser) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    if (!allowedPlans.includes(req.diyUser.plan)) {
      return res.status(403).json({ ok: false, error: 'Upgrade required', requiredPlan: allowedPlans[0] });
    }
    next();
  };
}

function getLatestDiyReportId(reports, userId) {
  const userReports = reports.filter(report => report.userId === userId);
  if (userReports.length === 0) return null;
  const sorted = userReports.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  return sorted[0]?.id || null;
}

async function runDiyAudit({ reportId, userId }) {
  const db = await loadDiyReportsDB();
  const report = db.reports.find(r => r.id === reportId && r.userId === userId);

  if (!report) {
    return { status: 404, error: 'Report not found' };
  }

  const ext = path.extname(report.storedName).toLowerCase();
  if (!ALLOWED_DIY_EXTENSIONS.includes(ext)) {
    return { status: 400, error: 'Unsupported file format. Please upload PDF or HTML credit reports.' };
  }

  const filePath = path.join(__dirname, 'diy_uploads', userId, report.storedName);
  if (!fs.existsSync(filePath)) {
    return { status: 404, error: 'Report file not found' };
  }

  let violations = [];
  const auditDetails = {
    source: null,
    violationCount: 0,
    error: null
  };

  try {
    const buffer = await fs.promises.readFile(filePath);
    const llmResult = await runLLMAnalyzer({
      buffer,
      filename: report.originalName || report.storedName
    });
    auditDetails.source = llmResult?.canonicalReport?.reportMeta?.provider || null;
    if (llmResult?.violations?.length) {
      violations = llmResult.violations.map(v => ({
        ...v,
        explanation: v.explanation || v.description || 'This item may contain inaccurate information that violates credit reporting standards.'
      }));
    }
    auditDetails.violationCount = violations.length;
  } catch (auditErr) {
    auditDetails.error = auditErr?.message || 'Audit engine error';
    logWarn('DIY_AUDIT_ENGINE_ERROR', auditDetails.error);
    report.auditStatus = 'failed';
    report.auditError = auditDetails.error;
    report.auditedAt = new Date().toISOString();
    await saveDiyReportsDB(db);
    return { status: 500, error: 'Audit failed. Please try again later.' };
  }

  report.auditStatus = 'completed';
  report.violations = violations;
  report.auditDetails = auditDetails;
  report.auditedAt = new Date().toISOString();
  await saveDiyReportsDB(db);

  return { violations, auditedAt: report.auditedAt };
}

async function generateDiyLetters({ reportId, userId, violations }) {
  const resolvedReportId = reportId;
  if (!resolvedReportId) {
    return { status: 400, error: 'Report ID is required' };
  }

  let resolvedViolations = violations;
  if (!resolvedViolations || resolvedViolations.length === 0) {
    const reportsDb = await loadDiyReportsDB();
    const report = reportsDb.reports.find(r => r.id === resolvedReportId && r.userId === userId);
    if (!report) {
      return { status: 404, error: 'Report not found' };
    }
    resolvedViolations = report.violations || [];
  }

  if (!resolvedViolations || !Array.isArray(resolvedViolations) || resolvedViolations.length === 0) {
    return { status: 400, error: 'No violations provided' };
  }

  const usersDb = await loadDiyUsersDB();
  const user = usersDb.users.find(u => u.id === userId);
  if (!user) {
    return { status: 404, error: 'User not found' };
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  if (user.lastLetterResetMonth !== currentMonth) {
    user.lettersGeneratedThisMonth = 0;
    user.lastLetterResetMonth = currentMonth;
    await saveDiyUsersDB(usersDb);
  }

  const limits = DIY_PLAN_LIMITS[user.plan];
  if (limits.lettersPerMonth !== -1 && user.lettersGeneratedThisMonth >= limits.lettersPerMonth) {
    return {
      status: 403,
      error: `You have reached your monthly limit of ${limits.lettersPerMonth} letters. Upgrade to Pro for unlimited letters.`
    };
  }

  const lettersDb = await loadDiyLettersDB();
  const generatedLetters = [];

  const bureaus = [...new Set(resolvedViolations.map(v => v.bureau).filter(Boolean))];
  if (bureaus.length === 0) bureaus.push('General');

  for (const bureau of bureaus) {
    const letter = {
      id: nanoid(12),
      userId,
      reportId: resolvedReportId,
      bureau,
      violations: resolvedViolations.filter(v => v.bureau === bureau || !v.bureau),
      createdAt: new Date().toISOString(),
      content: `Dispute letter for ${bureau} - Generated for DIY user`
    };
    lettersDb.letters.push(letter);
    generatedLetters.push({ id: letter.id, bureau: letter.bureau, createdAt: letter.createdAt });
  }

  await saveDiyLettersDB(lettersDb);

  user.lettersGeneratedThisMonth += generatedLetters.length;
  await saveDiyUsersDB(usersDb);

  return { letters: generatedLetters };
}

// DIY Signup
app.post('/api/diy/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password, plan = 'free' } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ ok: false, error: 'All fields are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters' });
    }
    if (!['free', 'basic', 'pro'].includes(plan)) {
      return res.status(400).json({ ok: false, error: 'Invalid plan' });
    }

    const db = await loadDiyUsersDB();
    if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({ ok: false, error: 'Email already registered' });
    }

    const user = {
      id: nanoid(12),
      firstName,
      lastName,
      email: email.toLowerCase(),
      password: bcrypt.hashSync(password, 10),
      plan,
      role: 'diy_user',
      createdAt: new Date().toISOString(),
      lettersGeneratedThisMonth: 0,
      lastLetterResetMonth: new Date().toISOString().slice(0, 7)
    };

    db.users.push(user);
    await saveDiyUsersDB(db);

    const token = jwt.sign(
      { id: user.id, email: user.email, plan: user.plan, mode: 'diy' },
      DIY_JWT_SECRET,
      { expiresIn: '7d', issuer: 'metro2-diy', audience: 'diy-users' }
    );

    res.json({ ok: true, token, user: { id: user.id, email: user.email, plan: user.plan, firstName: user.firstName, lastName: user.lastName } });
  } catch (err) {
    logError('DIY_SIGNUP_ERROR', err);
    res.status(500).json({ ok: false, error: 'Signup failed' });
  }
});

// DIY Login
app.post('/api/diy/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password required' });
    }

    const db = await loadDiyUsersDB();
    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, plan: user.plan, mode: 'diy' },
      DIY_JWT_SECRET,
      { expiresIn: '7d', issuer: 'metro2-diy', audience: 'diy-users' }
    );

    res.json({ ok: true, token, user: { id: user.id, email: user.email, plan: user.plan, firstName: user.firstName, lastName: user.lastName } });
  } catch (err) {
    logError('DIY_LOGIN_ERROR', err);
    res.status(500).json({ ok: false, error: 'Login failed' });
  }
});

// DIY Get current user
app.get('/api/diy/me', diyAuthenticate, async (req, res) => {
  try {
    const db = await loadDiyUsersDB();
    const user = db.users.find(u => u.id === req.diyUser.id);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        plan: user.plan,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    logError('DIY_ME_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to get user info' });
  }
});

// DIY Report Upload - with file type validation
const ALLOWED_DIY_EXTENSIONS = ['.pdf', '.html', '.htm'];
const ALLOWED_DIY_MIMETYPES = ['application/pdf', 'text/html', 'application/xhtml+xml'];

const diyUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'diy_uploads', req.diyUser.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${nanoid(10)}${ext}`);
  }
});

const diyUploadFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_DIY_EXTENSIONS.includes(ext)) {
    return cb(new Error('Only PDF and HTML files are allowed'), false);
  }
  cb(null, true);
};

const diyUpload = multer({
  storage: diyUploadStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: diyUploadFilter
});

app.post('/api/diy/reports/upload', diyAuthenticate, diyUpload.single('report'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file uploaded' });
    }

    const db = await loadDiyReportsDB();
    const report = {
      id: nanoid(12),
      userId: req.diyUser.id,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
      auditStatus: 'pending',
      violations: []
    };

    db.reports.push(report);
    await saveDiyReportsDB(db);

    res.json({ ok: true, report: { id: report.id, originalName: report.originalName, uploadedAt: report.uploadedAt } });
  } catch (err) {
    logError('DIY_UPLOAD_ERROR', err);
    res.status(500).json({ ok: false, error: 'Upload failed' });
  }
});

// DIY Get Reports
app.get('/api/diy/reports', diyAuthenticate, async (req, res) => {
  try {
    const db = await loadDiyReportsDB();
    const userReports = db.reports.filter(r => r.userId === req.diyUser.id);
    res.json({ ok: true, reports: userReports.map(r => ({ id: r.id, originalName: r.originalName, uploadedAt: r.uploadedAt, auditStatus: r.auditStatus })) });
  } catch (err) {
    logError('DIY_REPORTS_LIST_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to load reports' });
  }
});

app.post('/api/diy/audit', diyAuthenticate, diyRequirePlan(['basic', 'pro']), async (req, res) => {
  try {
    const { reportId } = req.body || {};
    const reportsDb = await loadDiyReportsDB();
    const resolvedReportId = reportId || getLatestDiyReportId(reportsDb.reports, req.diyUser.id);

    if (!resolvedReportId) {
      return res.status(400).json({ ok: false, error: 'Report ID is required' });
    }

    const result = await runDiyAudit({ reportId: resolvedReportId, userId: req.diyUser.id });
    if (result.error) {
      return res.status(result.status || 500).json({ ok: false, error: result.error });
    }

    res.json({
      ok: true,
      reportId: resolvedReportId,
      violations: result.violations || [],
      auditedAt: result.auditedAt,
      message: result.message
    });
  } catch (err) {
    logError('DIY_AUDIT_ERROR', err);
    res.status(500).json({ ok: false, error: 'Audit failed' });
  }
});

// DIY Run Audit on Report - uses shared audit engine with DIY context
app.post('/api/diy/reports/:id/audit', diyAuthenticate, diyRequirePlan(['basic', 'pro']), async (req, res) => {
  try {
    const result = await runDiyAudit({ reportId: req.params.id, userId: req.diyUser.id });
    if (result.error) {
      return res.status(result.status || 500).json({ ok: false, error: result.error });
    }

    res.json({
      ok: true,
      violations: result.violations || [],
      auditedAt: result.auditedAt,
      message: result.message
    });
  } catch (err) {
    logError('DIY_AUDIT_ERROR', err);
    res.status(500).json({ ok: false, error: 'Audit failed' });
  }
});

// DIY Get Letters
app.get('/api/diy/letters', diyAuthenticate, async (req, res) => {
  try {
    const db = await loadDiyLettersDB();
    const userLetters = db.letters.filter(l => l.userId === req.diyUser.id);
    res.json({ ok: true, letters: userLetters.map(l => ({ id: l.id, bureau: l.bureau, createdAt: l.createdAt })) });
  } catch (err) {
    logError('DIY_LETTERS_LIST_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to load letters' });
  }
});

app.post('/api/diy/letters', diyAuthenticate, diyRequirePlan(['basic', 'pro']), async (req, res) => {
  try {
    const { reportId, violations } = req.body || {};
    const reportsDb = await loadDiyReportsDB();
    const resolvedReportId = reportId || getLatestDiyReportId(reportsDb.reports, req.diyUser.id);

    if (!resolvedReportId) {
      return res.status(400).json({ ok: false, error: 'Report ID is required' });
    }

    const result = await generateDiyLetters({
      reportId: resolvedReportId,
      userId: req.diyUser.id,
      violations
    });

    if (result.error) {
      return res.status(result.status || 500).json({ ok: false, error: result.error });
    }

    res.json({ ok: true, reportId: resolvedReportId, letters: result.letters || [] });
  } catch (err) {
    logError('DIY_GENERATE_LETTERS_ERROR', err);
    res.status(500).json({ ok: false, error: 'Letter generation failed' });
  }
});

// DIY Generate Letters
app.post('/api/diy/reports/:id/letters', diyAuthenticate, diyRequirePlan(['basic', 'pro']), async (req, res) => {
  try {
    const { violations } = req.body || {};
    const result = await generateDiyLetters({
      reportId: req.params.id,
      userId: req.diyUser.id,
      violations
    });

    if (result.error) {
      return res.status(result.status || 500).json({ ok: false, error: result.error });
    }

    res.json({ ok: true, letters: result.letters || [] });
  } catch (err) {
    logError('DIY_GENERATE_LETTERS_ERROR', err);
    res.status(500).json({ ok: false, error: 'Letter generation failed' });
  }
});

// DIY Download Letter
app.get('/api/diy/letters/:id/download', diyAuthenticate, async (req, res) => {
  try {
    const db = await loadDiyLettersDB();
    const letter = db.letters.find(l => l.id === req.params.id && l.userId === req.diyUser.id);

    if (!letter) {
      return res.status(404).json({ ok: false, error: 'Letter not found' });
    }

    // Return letter content as text for now
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="dispute-${letter.bureau}-${letter.id}.txt"`);
    res.send(letter.content);
  } catch (err) {
    logError('DIY_DOWNLOAD_LETTER_ERROR', err);
    res.status(500).json({ ok: false, error: 'Download failed' });
  }
});

// ============================================================================
// END DIY ROUTES
// ============================================================================

const PORT = process.env.PORT || 3000;
const shouldStartServer =
  process.env.NODE_ENV !== "test" || process.env.START_SERVER_IN_TEST === "true";
if (shouldStartServer) {
  app.listen(PORT, () => {
    console.log(`CRM ready    http://localhost:${PORT}`);
    const dbClient = (process.env.DATABASE_CLIENT || (process.env.NODE_ENV === "production" ? "pg" : "sqlite3")).toString();
    console.log(`DB client    ${dbClient}`);
    console.log(`Tenant mode  ${(process.env.DB_TENANT_STRATEGY || "partitioned").toString()}`);
    console.log(`Letters dir  ${LETTERS_DIR}`);
  });
}

export default app;



// End of server.js
