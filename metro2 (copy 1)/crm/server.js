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
import helmet from "helmet";
import { PassThrough } from "stream";
import { JSDOM } from "jsdom";


import { logInfo, logError, logWarn } from "./logger.js";

import { readKey, writeKey, listKeys } from "./kvdb.js";
import { sendCertifiedMail } from "./simpleCertifiedMail.js";
import { listEvents as listCalendarEvents, createEvent as createCalendarEvent, updateEvent as updateCalendarEvent, deleteEvent as deleteCalendarEvent, freeBusy as calendarFreeBusy, clearCalendarCache } from "./googleCalendar.js";

import { fetchFn } from "./fetchUtil.js";
import { scrapeTradelines } from "./tradelineScraper.js";
import * as cheerio from "cheerio";
import { parseReport as metro2ParseReport } from "../../packages/metro2-core/src/index.js";
import { getStripeSync, getUncachableStripeClient, getStripePublishableKey } from "./stripeClient.js";
import { WebhookHandlers } from "./webhookHandlers.js";
import pg from "pg";
import {
  groupTradelinesByPrice,
  buildRangeSummary,
  listBanks,
  getBucketMeta,
  paginate,
} from "./tradelineBuckets.js";
import marketingRoutes from "./marketingRoutes.js";
import { prepareNegativeItems } from "../../shared/lib/format/negativeItems.js";
import { diffReports } from "../../shared/lib/format/reportDiff.js";
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
import { mapAuditedViolations } from "./pullTradelineData.js";
import {
  addTradelineKeysToCanonicalReport,
  auditCanonicalReport,
  collectTradelineKeys,
} from "./backend/services/llmAudit.js";
import { CANONICAL_REPORT_SCHEMA } from "./backend/services/llmSchemas.js";
import { assignExperimentVariant, recordExperimentConversion } from "./analytics/metrics.js";
import {
  isSmartCreditConfigured,
  getSmartCreditConfig,
  buildAuthorizationUrl,
  parseOAuthState,
  exchangeCodeForToken,
  refreshAccessToken,
  fetchCreditReport,
  smartCreditReportToBuffer,
} from "./smartCredit.js";
import {
  initHostNotifications,
  listNotifications,
  addNotification,
  emitHostNotification,
  markRead,
  markAllRead,
  getNotificationSettings,
  saveNotificationSettings,
} from "./hostNotificationsStore.js";

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
  fbAppId: "",
  fbAppSecret: "",
  fbRedirectUri: "",
  smartCreditClientId: "",
  smartCreditClientSecret: "",
  smartCreditRedirectUri: "",
  envOverrides: {},
  clientPortal: cloneDefaultClientPortalSettings(),
  hotkeys: {},
};

const SYSTEM_SETTING_KEYS = new Set([
  "stripeApiKey",
  "hibpApiKey",
  "rssFeedUrl",
  "sendCertifiedMailApiKey",
]);

const STRING_SETTING_KEYS = [
  "googleCalendarToken",
  "googleCalendarId",
  "marketingApiBaseUrl",
  "marketingApiKey",
  "gmailClientId",
  "gmailClientSecret",
  "gmailRefreshToken",
  "fbAppId",
  "fbAppSecret",
  "fbRedirectUri",
  "smartCreditClientId",
  "smartCreditClientSecret",
  "smartCreditRedirectUri",
];

const SECRET_SETTING_KEYS = new Set([
  "hibpApiKey",
  "marketingApiKey",
  "googleCalendarToken",
  "gmailClientSecret",
  "gmailRefreshToken",
  "fbAppSecret",
  "smartCreditClientSecret",
]);

function maskSecrets(settings) {
  if (!settings || typeof settings !== "object") return settings;
  const masked = { ...settings };
  for (const key of SECRET_SETTING_KEYS) {
    if (masked[key] && typeof masked[key] === "string" && masked[key].length > 0) {
      const val = masked[key];
      masked[key] = val.length > 4 ? "••••" + val.slice(-4) : "••••";
    }
  }
  return masked;
}

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

function matchCreditorBureau(a, b) {
  const norm = s => (s || '').toString().trim().toLowerCase();
  return norm(a.creditor) === norm(b.creditor) && norm(a.bureau) === norm(b.bureau);
}

function sanitizeSettingString(value = "") {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

initWorkflowEngine().catch((err) => {
  logWarn("WORKFLOW_INIT_FAILED", err?.message || "Workflow engine init failed");
});

initHostNotifications();

// =================== Smart Digest Scheduler ===================
// Fires a 1-hour tick and emits digest events at the right times.
(function startDigestScheduler() {
  let lastDailyDate = "";
  let lastWeeklyDate = "";
  let lastAttentionDate = "";
  // Dedup sets — keyed by consumerId or consumerId:itemId to prevent repeat fires per session
  const _notifiedOverdue = new Set();         // invoice overdue
  const _notifiedDueSoon = new Set();         // invoice due soon
  const _notifiedReminderOverdue = new Set(); // reminder_overdue / followup_overdue / post_call_notes keyed by consumerId:id
  const _notifiedClientInactive = new Set();  // client_inactive keyed by consumerId
  const _notifiedSLA = new Set();             // dispute_sla_missed keyed by consumerId:jobId
  const _notifiedCallReminder = new Set();    // call_reminder keyed by consumerId:bookingId
  const _notifiedDocExpiring = new Set();     // document_expiring keyed by consumerId:filename
  const _notifiedDisputeReady = new Set();    // dispute_ready keyed by consumerId:jobId

  async function runDigestTick() {
    try {
      const settings = await getNotificationSettings();
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const hour = now.getHours();
      const day = now.getDay(); // 0=Sun, 1=Mon

      // Helper to aggregate consumer-level stats across all states
      async function aggregateDigestStats(windowMs) {
        const cutoff = Date.now() - windowMs;
        const allStates = await listAllConsumerStates({ includeEvents: true }).catch(() => []);
        let failedPayments = 0;
        let disputesPending = 0;
        let missedCalls = 0;
        let overdueReminders = 0;
        let unreadDisputes = 0;
        const nowDate = new Date();
        for (const st of allStates) {
          const events = st.events || [];
          failedPayments += events.filter(e => e.type === "payment_failed" && new Date(e.at).getTime() >= cutoff).length;
          disputesPending += events.filter(e => e.type === "letters_generated" && new Date(e.at).getTime() >= cutoff).length;
          missedCalls += events.filter(e => e.type === "no_show_detected" && new Date(e.at).getTime() >= cutoff).length;
          unreadDisputes += events.filter(e => e.type === "dispute_response" && new Date(e.at).getTime() >= cutoff).length;
          overdueReminders += (st.reminders || []).filter(r => r.due && new Date(r.due) < nowDate && r.status !== "done").length;
        }
        return { failedPayments, disputesPending, missedCalls, overdueReminders, unreadDisputes };
      }

      // Daily digest — fires at 00:00 (midnight) if enabled and not already run today
      if (
        hour === 0 &&
        dateStr !== lastDailyDate &&
        settings.events?.daily_digest !== false
      ) {
        lastDailyDate = dateStr;
        const stats = await aggregateDigestStats(24 * 60 * 60 * 1000);
        const parts = [];
        if (stats.failedPayments) parts.push(`${stats.failedPayments} failed payment${stats.failedPayments !== 1 ? "s" : ""}`);
        if (stats.unreadDisputes) parts.push(`${stats.unreadDisputes} new dispute response${stats.unreadDisputes !== 1 ? "s" : ""}`);
        if (stats.missedCalls) parts.push(`${stats.missedCalls} missed call${stats.missedCalls !== 1 ? "s" : ""}`);
        if (stats.overdueReminders) parts.push(`${stats.overdueReminders} overdue reminder${stats.overdueReminders !== 1 ? "s" : ""}`);
        if (stats.disputesPending) parts.push(`${stats.disputesPending} new letter${stats.disputesPending !== 1 ? "s" : ""} generated`);
        const summary = parts.length ? `Daily digest: ${parts.join(", ")}` : "Daily digest: all clear";
        await emitHostNotification("daily_digest", summary, { summary, ...stats });
      }

      // Needs attention digest — fires daily at 09:00 if enabled and there are critical items
      if (
        hour === 9 &&
        dateStr !== lastAttentionDate &&
        settings.events?.needs_attention_digest !== false
      ) {
        lastAttentionDate = dateStr;
        const attentionStats = await aggregateDigestStats(72 * 60 * 60 * 1000); // 3 day window
        const critical = attentionStats.failedPayments + attentionStats.overdueReminders + attentionStats.unreadDisputes;
        if (critical > 0) {
          const attParts = [];
          if (attentionStats.failedPayments) attParts.push(`${attentionStats.failedPayments} failed payment${attentionStats.failedPayments !== 1 ? "s" : ""}`);
          if (attentionStats.overdueReminders) attParts.push(`${attentionStats.overdueReminders} overdue task${attentionStats.overdueReminders !== 1 ? "s" : ""}`);
          if (attentionStats.unreadDisputes) attParts.push(`${attentionStats.unreadDisputes} dispute response${attentionStats.unreadDisputes !== 1 ? "s" : ""} awaiting review`);
          const attSummary = `Needs attention: ${attParts.join(", ")}`;
          await emitHostNotification("needs_attention_digest", attSummary, { summary: attSummary, ...attentionStats });
        }
      }

      // Weekly summary — fires Monday at 08:00 if enabled and not already run this week
      if (
        day === 1 &&
        hour === 8 &&
        dateStr !== lastWeeklyDate &&
        settings.events?.weekly_summary !== false
      ) {
        lastWeeklyDate = dateStr;
        const weekStats = await aggregateDigestStats(7 * 24 * 60 * 60 * 1000);
        const wParts = [];
        if (weekStats.failedPayments) wParts.push(`${weekStats.failedPayments} failed payment${weekStats.failedPayments !== 1 ? "s" : ""}`);
        if (weekStats.unreadDisputes) wParts.push(`${weekStats.unreadDisputes} dispute response${weekStats.unreadDisputes !== 1 ? "s" : ""}`);
        if (weekStats.missedCalls) wParts.push(`${weekStats.missedCalls} missed call${weekStats.missedCalls !== 1 ? "s" : ""}`);
        if (weekStats.overdueReminders) wParts.push(`${weekStats.overdueReminders} overdue task${weekStats.overdueReminders !== 1 ? "s" : ""}`);
        const wSummary = wParts.length
          ? `Weekly summary (${dateStr}): ${wParts.join(", ")}`
          : `Weekly summary (${dateStr}): all clear`;
        await emitHostNotification("weekly_summary", wSummary, { summary: wSummary, ...weekStats });
      }
      // Invoice overdue and due-soon scan — runs on every tick
      if (settings.events?.invoice_overdue !== false || settings.events?.invoice_due_soon !== false) {
        try {
          const db = await loadDB();
          const nowMs = Date.now();
          const DUE_SOON_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
          for (const consumer of (db.consumers || [])) {
            const invoices = (db.invoices || []).filter(inv => inv.consumerId === consumer.id);
            for (const inv of invoices) {
              if (!inv.due || inv.status === "paid" || inv.status === "cancelled") continue;
              const dueMs = new Date(inv.due).getTime();
              if (isNaN(dueMs)) continue;
              const invKey = `${consumer.id}:${inv.id}`;
              // Overdue
              if (settings.events?.invoice_overdue !== false && dueMs < nowMs && !_notifiedOverdue.has(invKey)) {
                _notifiedOverdue.add(invKey);
                try {
                  await addEvent(consumer.id, "invoice_overdue", { name: consumer.name, amount: inv.amount });
                } catch {}
              }
              // Due soon (not yet overdue)
              if (settings.events?.invoice_due_soon !== false && dueMs >= nowMs && dueMs - nowMs <= DUE_SOON_WINDOW_MS && !_notifiedDueSoon.has(invKey)) {
                _notifiedDueSoon.add(invKey);
                try {
                  await addEvent(consumer.id, "invoice_due_soon", { name: consumer.name, amount: inv.amount, due: inv.due });
                } catch {}
              }
            }
          }
        } catch (invoiceErr) {
          logWarn("INVOICE_SCAN_ERROR", invoiceErr?.message || String(invoiceErr));
        }
      }

      // Consumer activity scans — reminder_overdue, client_inactive, dispute_sla_missed
      try {
        const allStates = await listAllConsumerStates({ includeEvents: true }).catch(() => []);
        const nowMs = Date.now();
        const INACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days
        const SLA_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;        // 30 days

        for (const st of allStates) {
          const cId = st.id;
          const events = st.events || [];

          // reminder_overdue: fire once per overdue reminder (keyed by reminderId)
          if (settings.events?.reminder_overdue !== false) {
            for (const rem of (st.reminders || [])) {
              if (rem.status === "overdue") {
                const rKey = `${cId}:${rem.id}`;
                if (!_notifiedReminderOverdue.has(rKey)) {
                  _notifiedReminderOverdue.add(rKey);
                  try { await addEvent(cId, "reminder_overdue", { reminderId: rem.id, due: rem.due }); } catch {}
                }
              }
            }
          }

          // client_inactive: no events in last 30 days
          if (settings.events?.client_inactive !== false && !_notifiedClientInactive.has(cId)) {
            const lastEvent = events.reduce((latest, e) => {
              const t = e.at ? new Date(e.at).getTime() : 0;
              return t > latest ? t : latest;
            }, 0);
            if (lastEvent > 0 && nowMs - lastEvent > INACTIVE_WINDOW_MS) {
              _notifiedClientInactive.add(cId);
              try { await addEvent(cId, "client_inactive", { daysSinceActivity: Math.floor((nowMs - lastEvent) / 86400000) }); } catch {}
            }
          }

          // dispute_sla_missed: dispute_round events older than 30 days with no dispute_response
          if (settings.events?.dispute_sla_missed !== false) {
            const disputeRounds = events.filter(e => e.type === "dispute_round");
            const responseJobIds = new Set(
              events.filter(e => e.type === "dispute_response").map(e => e.payload?.jobId).filter(Boolean)
            );
            for (const dr of disputeRounds) {
              const jobId = dr.payload?.jobId;
              if (!jobId) continue;
              if (responseJobIds.has(jobId)) continue; // already responded
              const drAge = nowMs - new Date(dr.at || 0).getTime();
              if (drAge > SLA_WINDOW_MS) {
                const slaKey = `${cId}:${jobId}`;
                if (!_notifiedSLA.has(slaKey)) {
                  _notifiedSLA.add(slaKey);
                  try { await addEvent(cId, "dispute_sla_missed", { jobId, daysSinceRound: Math.floor(drAge / 86400000) }); } catch {}
                }
              }
            }
          }

          // dispute_ready: most recent dispute_round's followUpDate has passed and no newer round started
          if (settings.events?.dispute_ready !== false) {
            const disputeRounds = events.filter(e => e.type === "dispute_round");
            if (disputeRounds.length > 0) {
              // Sort rounds ascending by date, pick the latest
              const sortedRounds = disputeRounds.slice().sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
              const latestRound = sortedRounds[sortedRounds.length - 1];
              const jobId = latestRound.payload?.jobId;
              const followUpDateStr = latestRound.payload?.followUpDate;
              if (jobId && followUpDateStr) {
                const followUpMs = new Date(followUpDateStr).getTime();
                if (!isNaN(followUpMs) && followUpMs < nowMs) {
                  // Check no newer dispute_round started after this one's followUpDate
                  const newerRoundExists = disputeRounds.some(e => {
                    if (e === latestRound) return false;
                    return new Date(e.at || 0).getTime() > followUpMs;
                  });
                  if (!newerRoundExists) {
                    const drKey = `${cId}:dr:${jobId}`;
                    if (!_notifiedDisputeReady.has(drKey)) {
                      _notifiedDisputeReady.add(drKey);
                      const consumerName = latestRound.payload?.letters?.[0]?.creditor || null;
                      try { await addEvent(cId, "dispute_ready", { jobId, round: latestRound.payload?.round, followUpDate: followUpDateStr, daysPast: Math.floor((nowMs - followUpMs) / 86400000) }); } catch {}
                    }
                  }
                }
              }
            }
          }

          // followup_overdue: dispute_followup reminders that are overdue
          if (settings.events?.followup_overdue !== false) {
            for (const rem of (st.reminders || [])) {
              if (rem.status === "overdue" && rem.payload?.type === "dispute_followup") {
                const rfKey = `${cId}:fo:${rem.id}`;
                if (!_notifiedReminderOverdue.has(rfKey)) {
                  _notifiedReminderOverdue.add(rfKey);
                  try { await addEvent(cId, "followup_overdue", { reminderId: rem.id, due: rem.due, jobId: rem.payload?.jobId }); } catch {}
                }
              }
            }
          }

          // call_reminder: call_booked event where scheduled time is within 24h from now
          if (settings.events?.call_reminder !== false) {
            const upcomingCalls = events.filter(e => {
              if (e.type !== "call_booked") return false;
              const callDateStr = e.payload?.date && e.payload?.time ? `${e.payload.date}T${e.payload.time}` : null;
              if (!callDateStr) return false;
              const callMs = new Date(callDateStr).getTime();
              return !isNaN(callMs) && callMs > nowMs && callMs - nowMs <= 86400000;
            });
            for (const bc of upcomingCalls) {
              const bId = bc.payload?.bookingId || bc.id;
              const crKey = `${cId}:cr:${bId}`;
              if (!_notifiedCallReminder.has(crKey)) {
                _notifiedCallReminder.add(crKey);
                try { await addEvent(cId, "call_reminder", { bookingId: bId, date: bc.payload?.date, time: bc.payload?.time }); } catch {}
              }
            }
          }

          // document_expiring: cfpb-proof documents older than 180 days
          if (settings.events?.document_expiring !== false) {
            const docEvents = events.filter(e => e.type === "document_approved" && new Date(e.at || 0).getTime() < nowMs - 180 * 86400000);
            for (const de of docEvents) {
              const files = de.payload?.files || [];
              const consumerName = de.payload?.name || cId;
              for (const fname of files) {
                const deKey = `${cId}:doc:${fname}`;
                if (!_notifiedDocExpiring.has(deKey)) {
                  _notifiedDocExpiring.add(deKey);
                  try { await addEvent(cId, "document_expiring", { name: consumerName, fileName: fname, daysOld: Math.floor((nowMs - new Date(de.at || 0).getTime()) / 86400000) }); } catch {}
                }
              }
            }
          }

          // post_call_notes_missing: call_booked events older than 24h with no subsequent call_notes event
          if (settings.events?.post_call_notes_missing !== false) {
            const bookedCalls = events.filter(e => e.type === "call_booked" && new Date(e.at || 0).getTime() < nowMs - 86400000);
            const noteEvents = new Set(events.filter(e => e.type === "call_notes").map(e => e.payload?.bookingId).filter(Boolean));
            for (const bc of bookedCalls) {
              const bId = bc.payload?.bookingId || bc.id;
              if (!bId || noteEvents.has(bId)) continue;
              const notesKey = `${cId}:notes:${bId}`;
              if (!_notifiedReminderOverdue.has(notesKey)) {
                _notifiedReminderOverdue.add(notesKey);
                try { await addEvent(cId, "post_call_notes_missing", { bookingId: bId }); } catch {}
              }
            }
          }
        }
      } catch (scanErr) {
        logWarn("ACTIVITY_SCAN_ERROR", scanErr?.message || String(scanErr));
      }
    } catch (err) {
      logWarn("DIGEST_TICK_ERROR", err?.message || String(err));
    }
  }

  // Run on startup (delayed 5s to let DB initialize) then every hour
  setTimeout(runDigestTick, 5000);
  setInterval(runDigestTick, 60 * 60 * 1000);
})();

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
  marketingApiBaseUrl: "MARKETING_API_BASE_URL",
  marketingApiKey: "MARKETING_API_KEY",
  gmailClientId: "GMAIL_CLIENT_ID",
  gmailClientSecret: "GMAIL_CLIENT_SECRET",
  gmailRefreshToken: "GMAIL_REFRESH_TOKEN",
  fbAppId: "FB_APP_ID",
  fbAppSecret: "FB_APP_SECRET",
  fbRedirectUri: "FB_REDIRECT_URI",
  smartCreditClientId: "SMART_CREDIT_CLIENT_ID",
  smartCreditClientSecret: "SMART_CREDIT_CLIENT_SECRET",
  smartCreditRedirectUri: "SMART_CREDIT_REDIRECT_URI",
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
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not configured. Please set JWT_SECRET before starting the server.');
  }
  return secret;
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
      const acctToCreditor = new Map();
      if (Array.isArray(latestReport.data.tradelines)) {
        for (const tl of latestReport.data.tradelines) {
          const name = tl?.meta?.creditor || tl?.creditor || tl?.creditor_name || "";
          if (!name || name === "Unknown Creditor") continue;
          if (tl.meta?.account_numbers && typeof tl.meta.account_numbers === "object") {
            for (const acctNum of Object.values(tl.meta.account_numbers)) {
              if (acctNum) acctToCreditor.set(acctNum.replace(/\*+/g, ""), name);
            }
          }
          const perBureau = tl.per_bureau || {};
          for (const bd of Object.values(perBureau)) {
            if (bd?.account_number) acctToCreditor.set(bd.account_number.replace(/\*+/g, ""), name);
            if (bd?.account_number_raw) acctToCreditor.set(bd.account_number_raw.replace(/\*+/g, ""), name);
          }
        }
      }
      negativeItems = latestReport.data.negative_items.map(item => {
        if (item.creditor && item.creditor !== "Unknown Creditor") return item;
        let name = "";
        if (item.tradelineKeys && Array.isArray(item.tradelineKeys)) {
          for (const tk of item.tradelineKeys) {
            const parts = tk.split("|");
            if (parts.length >= 3) {
              const acctRaw = parts.slice(2).join("|").replace(/\*+/g, "");
              if (acctRaw && acctToCreditor.has(acctRaw)) { name = acctToCreditor.get(acctRaw); break; }
            }
          }
        }
        if (!name && item.account_numbers && typeof item.account_numbers === "object") {
          for (const acctNum of Object.values(item.account_numbers)) {
            const cleaned = String(acctNum || "").replace(/[•\s*]+/g, "");
            if (cleaned) {
              for (const [key, cred] of acctToCreditor) {
                if (key.includes(cleaned) || cleaned.includes(key)) { name = cred; break; }
              }
            }
            if (name) break;
          }
        }
        if (!name) {
          const tl = Array.isArray(latestReport.data.tradelines) ? latestReport.data.tradelines[item.index] : null;
          if (tl) {
            name = tl?.meta?.creditor || tl?.creditor || tl?.creditor_name || "";
            if (name === "Unknown Creditor") name = "";
          }
        }
        if (!name && item.bureau_details && typeof item.bureau_details === "object") {
          for (const bd of Object.values(item.bureau_details)) {
            if (!bd || typeof bd !== "object") continue;
            name = bd.creditor_name || bd.creditor || bd.subscriber_name || bd.company_name || bd.account_name || "";
            if (name && name !== "Unknown Creditor") break;
            name = "";
          }
        }
        return { ...item, creditor: name || (item.type === "personal_info" ? "Personal Information" : "Unknown Creditor") };
      });
      const deduped = new Map();
      for (const item of negativeItems) {
        let acctKey = [...new Set(Object.values(item.account_numbers || {})
          .map(v => String(v || "").replace(/[•\s*]+/g, ""))
          .filter(Boolean))]
          .sort()
          .join(",");
        if (!acctKey && Array.isArray(item.tradelineKeys) && item.tradelineKeys.length) {
          acctKey = item.tradelineKeys
            .map(tk => { const p = tk.split("|"); return p.length >= 3 ? p.slice(2).join("|").replace(/\*+/g, "") : ""; })
            .filter(Boolean)
            .sort()
            .join(",");
        }
        if (!acctKey) acctKey = `__idx_${item.index}`;
        const key = acctKey;
        if (deduped.has(key)) {
          const existing = deduped.get(key);
          const mergedBureaus = [...new Set([...(existing.bureaus || []), ...(item.bureaus || [])])];
          const vKey = v => v.id || v.code || `${v.title || ""}|${v.detail || ""}|${(v.bureaus || []).join(",")}`;
          const existingViolationIds = new Set((existing.violations || []).map(vKey));
          const newViolations = (item.violations || []).filter(v => !existingViolationIds.has(vKey(v)));
          const mergedViolations = [...(existing.violations || []), ...newViolations];
          const mergedAcctNums = { ...(existing.account_numbers || {}), ...(item.account_numbers || {}) };
          const mergedKeys = [...new Set([...(existing.tradelineKeys || []), ...(item.tradelineKeys || [])])];
          const mergedBd = { ...(existing.bureau_details || {}), ...(item.bureau_details || {}) };
          const eCred = existing.creditor || "";
          const iCred = item.creditor || "";
          const bestCreditor = eCred.length >= iCred.length ? eCred : iCred;
          deduped.set(key, {
            ...existing,
            creditor: bestCreditor || "Unknown Creditor",
            bureaus: mergedBureaus,
            violations: mergedViolations,
            account_numbers: mergedAcctNums,
            tradelineKeys: mergedKeys,
            bureau_details: mergedBd,
            severity: Math.max(existing.severity || 0, item.severity || 0),
          });
        } else {
          deduped.set(key, item);
        }
      }
      negativeItems = [...deduped.values()];
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
      smartCreditLinked: !!(consumer.smartCreditToken),
    },
    smartCreditConfigured: isSmartCreditConfigured(),
    creditScore:
      consumer.creditScore ||
      (consumerState && typeof consumerState === 'object' ? consumerState.creditScore : null) ||
      null,
    negativeItems,
    snapshot: buildPortalSnapshot(negativeItems),
    reportProgress: (() => {
      let totalDeletions = 0;
      let totalAdded = 0;
      let totalChanged = 0;
      for (const r of consumer.reports || []) {
        if (r.diff?.summary) {
          totalDeletions += r.diff.summary.deletedCount || 0;
          totalAdded += r.diff.summary.addedCount || 0;
          totalChanged += r.diff.summary.changedCount || 0;
        }
      }
      return { totalDeletions, totalAdded, totalChanged, reportCount: (consumer.reports || []).length };
    })(),
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
import LETTER_TEMPLATES, { getResponseWindowDays } from "./letterTemplates.js";
import { scanResponseLetter } from "./disputeAI.js";
import { recommendFirstLetter, recommendNextLetter } from "./disputeRecommend.js";
import { updateEventPayload } from "./state.js";
import * as objStore from "./objectStore.js";
import { loadPlaybooks } from "./playbook.js";
import { normalizeReport, renderHtml, savePdf } from "./creditAuditTool.js";
import {
  listConsumerState,
  addEvent,
  addFileMeta,
  removeEventsByMatch,
  removeFileMetaByMatch,
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
async function generateOcrPdf(html, pdfOptions = {}){
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
  return await htmlToPdfBuffer(injected, pdfOptions);

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
  if(!apiKey){
    try {
      const { getStripeSecretKey: getConnectorKey } = await import("./stripeClient.js");
      apiKey = await getConnectorKey();
    } catch (err) {
      logError("STRIPE_CONNECTOR_FALLBACK", "Replit Stripe connector fallback failed", err);
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

async function recordCheckoutStage({ tenantId: tid, invoiceId, stage, success, sessionId, amountCents, metadata } = {}){
  try {
    const ts = new Date().toISOString();
    const entry = { ts, tenantId: tid || "unknown", invoiceId, stage, success, sessionId, amountCents, metadata };
    if(!success){
      console.warn("[checkout-stage]", JSON.stringify(entry));
    }
  } catch(_){}
}

async function createStripeCheckoutSession({ invoice, consumer = {}, company = {}, req, stripeClient = null } = {}){
  if(!invoice) return null;
  const tenantId = resolveRequestTenant(req);
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
  const stripeMeta = { tenantId, cacheHit: !!stripeClient };
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
      customer_email: (consumer?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(consumer.email)) ? consumer.email : undefined,
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

app.get("/healthz", async (_req, res) => {
  try {
    const { testConnection } = await import("./db/connection.js");
    const dbOk = await testConnection();
    const status = dbOk ? "ok" : "degraded";
    res.status(dbOk ? 200 : 503).json({ status, db: dbOk ? "connected" : "unreachable" });
  } catch {
    res.status(200).json({ status: "ok", db: "unknown" });
  }
});
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
app.get("/ping", (_req, res) => res.status(200).send("pong"));

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }
      await WebhookHandlers.processWebhook(req.body, sig);
      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error.message);
      // integration_failure: Stripe webhook processing failed
      try { await emitHostNotification("integration_failure", `Stripe webhook error: ${error.message}`, { service: "stripe", error: error.message }); } catch {}
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use(express.json({ limit: "10mb" }));

function stripDangerousKeys(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripDangerousKeys);
  const cleaned = {};
  for (const key of Object.keys(obj)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    cleaned[key] = stripDangerousKeys(obj[key]);
  }
  return cleaned;
}

app.use((req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = stripDangerousKeys(req.body);
  }
  next();
});

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
      if(found) return { ...found, permissions: found.permissions || [] };
      if(payload.role === "client"){
        const mainDb = await loadDB();
        const consumer = mainDb.consumers.find(c=>c.id===payload.id);
        if(consumer){
          return {
            id: consumer.id,
            username: consumer.email || consumer.name || "client",
            name: consumer.name || "",
            role: "client",
            tenantId: sanitizeTenantId(consumer.tenantId || consumer.ownerTenantId || DEFAULT_TENANT_ID),
            permissions: []
          };
        }
      }
      return null;
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
        res.set('Cache-Control', 'no-store');
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

const CLIENT_PORTAL_TEMPLATE = (() => {
  try {
    return fs.readFileSync(path.join(PUBLIC_DIR, "client-portal-template.html"), "utf-8");
  } catch {
    return "";
  }
})();

function isLocalhostHost(hostname = "") {
  const normalized = String(hostname).toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function resolveClientPortalAppBase(req) {
  const configured = (process.env.CLIENT_PORTAL_BASE_URL || process.env.PORTAL_BASE_URL || "").trim();
  if (!configured) return "";
  try {
    const portalUrl = new URL(configured);
    if (req?.hostname && isLocalhostHost(portalUrl.hostname) && !isLocalhostHost(req.hostname)) {
      portalUrl.hostname = req.hostname;
    }
    return portalUrl.toString().replace(/\/$/, "");
  } catch {
    return configured.replace(/\/$/, "");
  }
}

function renderClientPortalHtml({ portalBootstrap = {}, portalEnhanced = {}, negativeItems = [] } = {}) {
  if (!CLIENT_PORTAL_TEMPLATE) {
    return "Client portal unavailable";
  }
  return CLIENT_PORTAL_TEMPLATE
    .replace(/{{portalBootstrap}}/g, toInlineJson(portalBootstrap))
    .replace(/{{portalEnhanced}}/g, toInlineJson(portalEnhanced))
    .replace(/{{portalNegativeItems}}/g, toInlineJson(negativeItems));
}

// Prevent browsers from caching JS files so updated code is always loaded
app.use((req, res, next) => {
  if (req.path.endsWith('.js')) {
    res.set('Cache-Control', 'no-store');
  }
  next();
});

// Long cache for 3D model assets (phoenix GLTF)
app.use('/assets/phoenix', (req, res, next) => {
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  next();
});

// Disable default index to avoid auto-serving the app without auth
app.use(express.static(PUBLIC_DIR, { index: false }));

// Serve neutral welcome page at root, CRM login at /crm
registerStaticPage({ paths: "/", file: "welcome.html" });
registerStaticPage({ paths: ["/crm", "/crm/login", "/login"], file: "login.html" });

// DIY routes
registerStaticPage({ paths: ["/diy", "/diy/login"], file: "diy/login.html" });
registerStaticPage({ paths: "/diy/signup", file: "diy/signup.html" });
registerStaticPage({ paths: "/diy/dashboard", file: "diy/dashboard.html" });
registerStaticPage({ paths: "/diy/upgrade", file: "diy/upgrade.html" });
app.get("/client-setup", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "client-setup.html"));
});
app.get("/lead-capture", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "lead-capture.html"));
});
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
registerStaticPage({ paths: "/disputes", file: "disputes.html" });
registerStaticPage({ paths: "/whats-in-evolv", file: "whats-in-evolv.html" });
registerStaticPage({ paths: "/cfpb", file: "cfpb.html" });
registerStaticPage({ paths: "/client-invoicing", file: "client-invoicing.html" });
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
app.get(["/client-portal", "/client-portal.html", "/portal"], async (_req, res) => {
  const settings = await loadSettings().catch(() => null);
  const portalSettings = exportClientPortalSettings(settings?.clientPortal);
  const html = renderClientPortalHtml({
    portalBootstrap: { portalSettings },
  });
  res.send(html);
});
app.get("/team/:token", (req, res) => {
  const token = path.basename(req.params.token);
  const file = resolvePublicFilePath(`team-${token}.html`);
  if (!file) return res.status(404).send("Not found");
  res.sendFile(file);
});
async function renderClientPortalForConsumer(req, res, consumerId) {
  const db = await loadDB();
  const consumer = db.consumers.find((c) => c.id === consumerId);
  if (!consumer) return res.status(404).send("Portal not found");
  const payload = await buildClientPortalPayload(consumer);
  if (!payload) return res.status(500).send("Portal unavailable");
  const html = renderClientPortalHtml({
    portalBootstrap: {
      consumer: payload.consumer,
      creditScore: payload.creditScore,
      portalSettings: payload.portalSettings,
      snapshot: payload.snapshot,
      reportProgress: payload.reportProgress,
      smartCreditConfigured: payload.smartCreditConfigured,
    },
    portalEnhanced: {
      reminders: payload.reminders,
      tracker: payload.tracker,
      timeline: payload.timeline,
      documents: payload.documents,
      invoices: payload.invoices,
    },
    negativeItems: payload.negativeItems,
  });
  res.send(html);
}

app.get("/client-portal/:id", async (req, res) => {
  await renderClientPortalForConsumer(req, res, req.params.id);
});

app.get("/portal/:id", async (req, res) => {
  await renderClientPortalForConsumer(req, res, req.params.id);
});

async function verifyPortalAccess(req, res) {
  // Support token from Authorization header, query string, or cookie
  if (!req.headers.authorization && !req.query.token) {
    const cookieHeader = req.headers.cookie || "";
    const match = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
    if (match) req.headers.authorization = `Bearer ${decodeURIComponent(match[1])}`;
  }
  const user = await getAuthUser(req);
  if (!user) return false;
  // Portal API endpoints are for clients only; verify token belongs to this consumer
  if (user.role !== "client") {
    res.status(403).json({ ok: false, error: "Client token required" });
    return null;
  }
  if (user.id !== req.params.id) {
    res.status(403).json({ ok: false, error: "Access denied" });
    return null;
  }
  return user;
}

app.get("/api/portal/:id", async (req, res) => {
  try {
    const user = await verifyPortalAccess(req, res);
    if (user === null) return;
    if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });
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

app.get("/api/portal/:id/contracts", async (req, res) => {
  try {
    const user = await verifyPortalAccess(req, res);
    if (user === null) return;
    if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });
    const db = await loadDB();
    const consumer = db.consumers.find(c => c.id === req.params.id);
    if (!consumer) return res.status(404).json({ ok: false, error: "Consumer not found" });
    const ids = consumer.contractIds || [];
    if (!ids.length) return res.json({ ok: true, contracts: [] });
    const lettersDb = await loadLettersDB();
    lettersDb.contracts = lettersDb.contracts || [];
    const results = ids.map(cid => {
      const ct = lettersDb.contracts.find(c => c.id === cid);
      return ct ? normalizeContract(ct) : null;
    }).filter(Boolean);
    res.json({ ok: true, contracts: results });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Failed to load contracts" });
  }
});

app.get("/buy", async (req, res) => {
  const { bank = "", price = "" } = req.query || {};
  const settings = await loadSettings();
  const stripeKey = process.env.STRIPE_API_KEY || settings.stripeApiKey;
  if (!StripeLib || !stripeKey) {
    return res.status(500).json({ ok:false, error:'Stripe not configured' });
  }
  const amt = Math.round(parseFloat(price) * 100);
  if (!amt) return res.status(400).send("Invalid price");
  try {
    const stripe = new StripeLib(stripeKey);
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

app.get("/api/system-status", authenticate, requireRole("admin"), async (_req, res) => {
  try {
    let stripeConnected = false;
    try {
      const { getStripeSecretKey } = await import("./stripeClient.js");
      const sk = await getStripeSecretKey();
      stripeConnected = !!sk;
    } catch (_e) {
      stripeConnected = !!process.env.STRIPE_API_KEY;
    }

    const smtpHost = process.env.SMTP_HOST || "";
    const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER || "";
    const smtpConnected = !!smtpHost;

    const scmKey = process.env.SCM_API_KEY || "";
    const certifiedMailConnected = !!scmKey;

    const hibpKey = process.env.HIBP_API_KEY || "";
    const hibpConnected = !!hibpKey;

    const rssUrl = process.env.RSS_FEED_URL || "";
    const rssDefault = "https://hnrss.org/frontpage";

    res.json({
      ok: true,
      services: {
        stripe: { connected: stripeConnected },
        email: {
          connected: smtpConnected,
          from: smtpConnected && smtpFrom ? smtpFrom.replace(/(.{2}).*(@.*)/, "$1••••$2") : "",
        },
        certifiedMail: { connected: certifiedMailConnected },
        hibp: { connected: hibpConnected },
        rssFeed: { connected: !!rssUrl, url: rssUrl || rssDefault, isDefault: !rssUrl },
      },
    });
  } catch (err) {
    logWarn("SYSTEM_STATUS_ERROR", err?.message || String(err));
    res.status(500).json({ ok: false, error: "Failed to load system status" });
  }
});

app.get("/api/settings", optionalAuth, async (req, res) => {
  const settings = await loadSettings(req);
  const masked = maskSecrets(settings);
  if (process.env.RSS_FEED_URL) masked.rssFeedUrl = process.env.RSS_FEED_URL;
  if (process.env.HIBP_API_KEY && !masked.hibpApiKey) masked.hibpApiKey = "••••";
  res.json({ ok: true, settings: masked });
});

function decodeXmlEntities(str) {
  return str.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/<[^>]+>/g, '');
}

app.get("/api/news", optionalAuth, async (req, res) => {
  try {
    const settings = await loadSettings(req);
    const feedUrl = process.env.RSS_FEED_URL || settings.rssFeedUrl || 'https://hnrss.org/frontpage';
    const response = await fetchFn(feedUrl, { timeout: 8000 });
    if (!response || !response.ok) throw new Error('Failed to fetch news feed');
    const xml = await response.text();
    const items = [];
    const isAtom = xml.includes('<feed') && xml.includes('<entry>');
    if (isAtom) {
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
      let match;
      while ((match = entryRegex.exec(xml)) !== null && items.length < 20) {
        const entryXml = match[1];
        const title = (entryXml.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]>|<title[^>]*>(.*?)<\/title>/) || [])[1] || (entryXml.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]>|<title[^>]*>(.*?)<\/title>/) || [])[2] || '';
        const link = (entryXml.match(/<link[^>]+href="([^"]*)"/) || [])[1] || '';
        const summary = (entryXml.match(/<content[^>]*>([\s\S]*?)<\/content>|<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1] || (entryXml.match(/<content[^>]*>([\s\S]*?)<\/content>|<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[2] || '';
        const updated = (entryXml.match(/<updated>(.*?)<\/updated>|<published>(.*?)<\/published>/) || [])[1] || (entryXml.match(/<updated>(.*?)<\/updated>|<published>(.*?)<\/published>/) || [])[2] || '';
        if (title) items.push({ title: decodeXmlEntities(title), link, description: decodeXmlEntities(summary).slice(0, 200), pubDate: updated });
      }
    } else {
      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      let match;
      while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
        const itemXml = match[1];
        const title = (itemXml.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/) || [])[1] || (itemXml.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/) || [])[2] || '';
        const link = (itemXml.match(/<link>(.*?)<\/link>/) || [])[1] || '';
        const description = (itemXml.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/) || [])[1] || (itemXml.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/) || [])[2] || '';
        const pubDate = (itemXml.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
        if (title) items.push({ title: decodeXmlEntities(title), link, description: decodeXmlEntities(description).slice(0, 200), pubDate });
      }
    }
    res.json({ ok: true, items });
  } catch (err) {
    logError('CRM_NEWS_FEED_ERROR', err);
    res.json({ ok: true, items: [] });
  }
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

app.post("/api/settings", authenticate, requireRole("admin"), async (req, res) => {
  const payload = req && req.body && typeof req.body === "object" ? req.body : {};
  const updates = {};

  for (const key of STRING_SETTING_KEYS) {
    if (SYSTEM_SETTING_KEYS.has(key)) continue;
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

app.get("/api/tour/status", optionalAuth, async (req, res) => {
  try {
    const scope = tenantScope(resolveRequestTenant(req));
    const dismissed = !!(await readKey("tour_dismissed", null, scope));
    res.json({ ok: true, dismissed });
  } catch (err) {
    res.json({ ok: true, dismissed: false });
  }
});

app.post("/api/tour/dismiss", authenticate, async (req, res) => {
  try {
    const scope = tenantScope(resolveRequestTenant(req));
    await writeKey("tour_dismissed", true, scope);
    res.json({ ok: true });
  } catch (err) {
    logError("TOUR_DISMISS_ERROR", err);
    res.status(500).json({ ok: false });
  }
});

app.get("/api/credit-companies", authenticate, requirePermission("admin"), async (_req, res) => {
  try {
    const companiesDb = await loadCreditCompaniesDB();
    res.json({ ok: true, companies: companiesDb.companies });
  } catch (err) {
    logError("CREDIT_COMPANY_LIST_ERROR", err);
    res.status(500).json({ ok: false, error: "Failed to load credit companies" });
  }
});

app.post("/api/credit-companies", authenticate, requirePermission("admin"), async (req, res) => {
  try {
    const payload = req?.body || {};
    const companiesDb = await loadCreditCompaniesDB();
    let nextCompanies = companiesDb.companies;
    const requestTenantId = sanitizeTenantId(
      req.user?.tenantId || getCurrentTenantId() || DEFAULT_TENANT_ID,
      DEFAULT_TENANT_ID
    );

    if (Array.isArray(payload.companies)) {
      nextCompanies = payload.companies
        .map(entry => normalizeCreditCompany(entry))
        .filter(Boolean);
    } else if (payload.company && typeof payload.company === "object") {
      const normalized = normalizeCreditCompany(payload.company);
      if (!normalized) {
        return res.status(400).json({ ok: false, error: "Company name is required" });
      }
      const normalizedName = normalized.name.toLowerCase();
      let existingIndex = nextCompanies.findIndex(entry => entry.id === normalized.id);
      if (existingIndex < 0) {
        existingIndex = nextCompanies.findIndex(entry => entry.name?.toLowerCase() === normalizedName);
      }
      if (!normalized.tenantId) {
        normalized.tenantId = requestTenantId;
      }
      if (existingIndex >= 0) {
        const existing = nextCompanies[existingIndex];
        nextCompanies[existingIndex] = {
          ...existing,
          ...normalized,
          tenantId: existing?.tenantId || normalized.tenantId
        };
      } else {
        nextCompanies = [...nextCompanies, normalized];
      }
    } else {
      return res.status(400).json({ ok: false, error: "Company payload is required" });
    }

    companiesDb.companies = nextCompanies;
    await saveCreditCompaniesDB(companiesDb);
    const metricsDb = await loadCreditCompanyMetricsDB();
    await syncCreditCompanyMetrics(metricsDb, companiesDb);

    res.json({ ok: true, companies: companiesDb.companies });
  } catch (err) {
    logError("CREDIT_COMPANY_SAVE_ERROR", err);
    res.status(500).json({ ok: false, error: "Failed to save credit companies" });
  }
});

app.delete("/api/credit-companies/:id", authenticate, requirePermission("admin"), async (req, res) => {
  try {
    const requestTenantId = sanitizeTenantId(
      req.user?.tenantId || getCurrentTenantId() || DEFAULT_TENANT_ID,
      DEFAULT_TENANT_ID
    );
    const companiesDb = await loadCreditCompaniesDB();
    const idx = companiesDb.companies.findIndex(c => c.id === req.params.id);
    if (idx < 0) return res.status(404).json({ ok: false, error: "Company not found" });
    const company = companiesDb.companies[idx];
    if (company.tenantId && company.tenantId !== requestTenantId) {
      return res.status(403).json({ ok: false, error: "Not authorized to delete this company" });
    }
    companiesDb.companies.splice(idx, 1);
    await saveCreditCompaniesDB(companiesDb);
    const metricsDb = await loadCreditCompanyMetricsDB();
    metricsDb.metrics = metricsDb.metrics.filter(m => m.companyId !== req.params.id);
    await saveCreditCompanyMetricsDB(metricsDb);
    res.json({ ok: true });
  } catch (err) {
    logError("CREDIT_COMPANY_DELETE_ERROR", err);
    res.status(500).json({ ok: false, error: "Failed to delete credit company" });
  }
});

app.put("/api/credit-companies/:id/metrics", authenticate, requirePermission("admin"), async (req, res) => {
  try {
    const requestTenantId = sanitizeTenantId(
      req.user?.tenantId || getCurrentTenantId() || DEFAULT_TENANT_ID,
      DEFAULT_TENANT_ID
    );
    const companiesDb = await loadCreditCompaniesDB();
    const company = companiesDb.companies.find(c => c.id === req.params.id);
    if (!company) return res.status(404).json({ ok: false, error: "Company not found" });
    if (company.tenantId && company.tenantId !== requestTenantId) {
      return res.status(403).json({ ok: false, error: "Not authorized to update this company's metrics" });
    }
    const metricsDb = await loadCreditCompanyMetricsDB();
    const existing = metricsDb.metrics.find(m => m.companyId === req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: "Company metrics not found" });
    const allowed = ['disputeSuccessRate', 'caseCloseRate', 'avgResponseTimeDays', 'activeClients', 'reviewScore'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) existing[key] = Number(req.body[key]) || 0;
    }
    existing.updatedAt = new Date().toISOString();
    await saveCreditCompanyMetricsDB(metricsDb);
    res.json({ ok: true, metrics: existing });
  } catch (err) {
    logError("CREDIT_COMPANY_METRICS_UPDATE_ERROR", err);
    res.status(500).json({ ok: false, error: "Failed to update metrics" });
  }
});

app.use("/api/marketing", marketingKeyAuth, authenticate, forbidMember, marketingRoutes);

app.get("/api/calendar/events", authenticate, async (_req, res) => {
  try {
    const { events, mode, notice } = await listCalendarEvents();
    res.json({ ok: true, events, mode, notice });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/calendar/events", authenticate, forbidMember, async (req, res) => {
  try {
    const { event, mode, notice } = await createCalendarEvent(req.body);
    res.json({ ok: true, event, mode, notice });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put("/api/calendar/events/:id", authenticate, forbidMember, async (req, res) => {
  try {
    const { event, mode, notice } = await updateCalendarEvent(req.params.id, req.body);
    // Emit call_rescheduled if start/time/date is being changed
    if (req.body?.start || req.body?.date || req.body?.time) {
      const evtConsumerId = event?.consumerId || req.body?.consumerId || null;
      const evtName = event?.attendeeName || event?.summary || req.body?.attendeeName || null;
      if (evtConsumerId) {
        try { await addEvent(evtConsumerId, "call_rescheduled", { name: evtName, date: req.body.date || req.body.start }); } catch {}
      } else {
        try {
          await emitHostNotification("call_rescheduled", `Call rescheduled${evtName ? `: ${evtName}` : ""}`, { name: evtName });
        } catch {}
      }
    }
    res.json({ ok: true, event, mode, notice });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/calendar/events/:id", authenticate, forbidMember, async (req, res) => {
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

app.get("/api/consumers/:id/tradeline-recommendations", async (req, res) => {
  try {
    const consumerId = req.params.id;
    const db = await loadDB(req);
    const consumer = db.consumers.find(c => c.id === consumerId);
    if (!consumer) return res.status(404).json({ ok: false, error: "Consumer not found" });

    const latestReport = consumer.reports?.[0];
    const creditScore = consumer.creditScore;
    let avgScore = null;
    if (creditScore) {
      const scores = [creditScore.current, creditScore.transunion, creditScore.experian, creditScore.equifax]
        .map(Number).filter(v => Number.isFinite(v) && v > 0);
      if (scores.length) avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }

    let avgAccountAgeMonths = null;
    let estimatedUtilization = null;
    let hasRevolvingAccounts = true;
    let reportTradelines = [];

    if (latestReport?.data?.tradelines && Array.isArray(latestReport.data.tradelines)) {
      reportTradelines = latestReport.data.tradelines;
    } else if (latestReport?.data && Array.isArray(latestReport.data) && latestReport.data.length > 0 && latestReport.data[0]?.byBureau) {
      reportTradelines = latestReport.data;
    }

    if (reportTradelines.length > 0) {
      const now = new Date();
      const ages = [];
      let totalBalance = 0;
      let totalLimit = 0;
      let revolvingCount = 0;

      for (const tl of reportTradelines) {
        const bureaus = tl.byBureau || tl.per_bureau || {};
        for (const bureau of Object.values(bureaus)) {
          if (!bureau || typeof bureau !== 'object') continue;
          if (bureau.present === false) continue;

          const dateOpened = bureau.dateOpened || bureau.date_opened;
          if (dateOpened) {
            try {
              const openDate = new Date(dateOpened);
              if (!isNaN(openDate.getTime())) {
                const monthsDiff = (now.getFullYear() - openDate.getFullYear()) * 12 + (now.getMonth() - openDate.getMonth());
                if (monthsDiff > 0) ages.push(monthsDiff);
              }
            } catch {}
          }

          const bal = Number(bureau.balance ?? bureau.balance_raw ?? 0);
          const lim = Number(bureau.creditLimit ?? bureau.credit_limit ?? bureau.highCredit ?? bureau.high_credit ?? 0);
          if (Number.isFinite(bal) && bal >= 0) totalBalance += bal;
          if (Number.isFinite(lim) && lim > 0) totalLimit += lim;

          const acctType = String(bureau.accountType || bureau.account_type || tl?.meta?.accountType || '').toLowerCase();
          if (acctType.includes('revolv') || acctType.includes('credit card') || acctType.includes('charge')) {
            revolvingCount++;
          }
          break;
        }
      }

      if (ages.length > 0) {
        avgAccountAgeMonths = Math.round(ages.reduce((a, b) => a + b, 0) / ages.length);
      }
      if (totalLimit > 0) {
        estimatedUtilization = Math.round((totalBalance / totalLimit) * 100);
      }
      hasRevolvingAccounts = revolvingCount >= 2;
    }

    const hasProfileData = avgScore != null || avgAccountAgeMonths != null || estimatedUtilization != null;
    if (!hasProfileData) {
      return res.json({ ok: true, recommendations: [], profile: null, reason: "Insufficient credit profile data" });
    }

    const profile = {
      score: avgScore,
      avgAccountAgeMonths,
      estimatedUtilization,
      hasRevolvingAccounts,
    };

    let weaknesses = [];
    if (estimatedUtilization != null && estimatedUtilization > 30) {
      weaknesses.push({ type: 'high_utilization', severity: estimatedUtilization > 50 ? 3 : 2 });
    }
    if (avgAccountAgeMonths != null && avgAccountAgeMonths < 36) {
      weaknesses.push({ type: 'low_age', severity: avgAccountAgeMonths < 12 ? 3 : 2 });
    }
    if (!hasRevolvingAccounts) {
      weaknesses.push({ type: 'low_mix', severity: 1 });
    }
    if (avgScore != null && avgScore < 650) {
      weaknesses.push({ type: 'low_score', severity: avgScore < 580 ? 3 : 2 });
    }

    if (weaknesses.length === 0) {
      weaknesses.push({ type: 'general', severity: 1 });
    }

    weaknesses.sort((a, b) => b.severity - a.severity);
    const primaryWeakness = weaknesses[0].type;

    const scrapeImpl = req.app.get("scrapeTradelinesOverride") || scrapeTradelines;
    const allTradelines = await scrapeImpl(fetchFn);

    if (!allTradelines || allTradelines.length === 0) {
      return res.json({ ok: true, recommendations: [], profile, reason: "No tradelines available" });
    }

    function parseAgeToMonths(ageStr) {
      if (!ageStr) return 0;
      const s = String(ageStr);
      const dateMatch = s.match(/(\d{4})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
      if (dateMatch) {
        const year = parseInt(dateMatch[1], 10);
        const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
        const month = monthMap[dateMatch[2].toLowerCase()] ?? 0;
        const opened = new Date(year, month, 1);
        const now = new Date();
        return Math.max(0, (now.getFullYear() - opened.getFullYear()) * 12 + (now.getMonth() - opened.getMonth()));
      }
      const yearMatch = s.match(/(\d+)\s*(?:year|yr)/i);
      if (yearMatch) return parseInt(yearMatch[1], 10) * 12;
      const monthMatch = s.match(/(\d+)\s*(?:month|mo)/i);
      if (monthMatch) return parseInt(monthMatch[1], 10);
      return 0;
    }

    function parseLimitValue(limitVal) {
      if (typeof limitVal === 'number') return limitVal;
      if (!limitVal) return 0;
      const cleaned = String(limitVal).replace(/[^0-9.]/g, '');
      return parseFloat(cleaned) || 0;
    }

    const minPrice = parseFloat(req.query.minPrice);
    const maxPrice = parseFloat(req.query.maxPrice);
    const hasRangeFilter = Number.isFinite(minPrice) || Number.isFinite(maxPrice);
    const filtered = allTradelines.filter(tl => {
      const p = typeof tl.price === 'number' ? tl.price : parseFloat(tl.price);
      if (!Number.isFinite(p)) return !hasRangeFilter;
      if (Number.isFinite(minPrice) && p < minPrice) return false;
      if (Number.isFinite(maxPrice) && p > maxPrice) return false;
      return true;
    });

    if (filtered.length === 0) {
      return res.json({ ok: true, recommendations: [], profile, primaryWeakness, reason: "No tradelines match the selected price range" });
    }

    const scored = filtered.map(tl => {
      const ageMonths = parseAgeToMonths(tl.age);
      const limit = parseLimitValue(tl.limit);
      const price = typeof tl.price === 'number' ? tl.price : 0;
      let score = 0;
      let reason = '';

      const years = Math.floor(ageMonths / 12);
      const bankLabel = tl.bank || 'account';
      const ageDesc = years > 0 ? `${years} year${years !== 1 ? 's' : ''} of history` : 'positive payment history';

      if (primaryWeakness === 'high_utilization' || primaryWeakness === 'low_score') {
        score += Math.min(limit / 1000, 30);
        score += Math.min(ageMonths / 12, 10);
        if (limit >= 15000) {
          reason = `This ${bankLabel} has a $${limit.toLocaleString()} limit that can help lower your overall credit utilization.`;
        } else {
          reason = `This ${bankLabel} adds a $${limit.toLocaleString()} limit and ${ageDesc} to your profile.`;
        }
      } else if (primaryWeakness === 'low_age') {
        score += Math.min(ageMonths / 6, 30);
        score += Math.min(limit / 5000, 10);
        if (years > 0) {
          reason = `This ${bankLabel} opened in ${tl.age} adds ${years} year${years !== 1 ? 's' : ''} of seasoned history to raise your average account age.`;
        } else {
          reason = `This ${bankLabel} adds a seasoned revolving account with a $${limit.toLocaleString()} limit to strengthen your profile.`;
        }
      } else if (primaryWeakness === 'low_mix') {
        score += 10;
        score += Math.min(ageMonths / 12, 15);
        score += Math.min(limit / 5000, 10);
        reason = `Adding this ${bankLabel} revolving account diversifies your credit mix and adds ${ageDesc}.`;
      } else {
        score += Math.min(ageMonths / 12, 15);
        score += Math.min(limit / 5000, 15);
        reason = `This ${bankLabel} with a $${limit.toLocaleString()} limit and ${ageDesc} strengthens your credit profile.`;
      }

      if (Number.isFinite(price) && price > 0) {
        if (price < 600) score += 3;
        else if (price <= 800) score += 1;
      }

      return { ...tl, _score: score, reason, _ageMonths: ageMonths, _limit: limit };
    });

    scored.sort((a, b) => b._score - a._score);

    const seen = new Set();
    const recommendations = [];
    for (const item of scored) {
      const key = `${item.bank}-${item._limit}-${item._ageMonths}`;
      if (seen.has(key)) continue;
      seen.add(key);
      recommendations.push({
        bank: item.bank,
        price: item.price,
        limit: item.limit,
        age: item.age,
        statement_date: item.statement_date,
        reporting: item.reporting,
        buy_link: item.buy_link,
        reason: item.reason,
      });
      if (recommendations.length >= 3) break;
    }

    res.json({ ok: true, recommendations, profile, primaryWeakness });
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

// ---------- Call Booking System ----------

const DEFAULT_AVAILABILITY = {
  timezone: "America/New_York",
  slotDuration: 30,
  slots: {
    0: [],
    1: [{ start: "09:00", end: "17:00" }],
    2: [{ start: "09:00", end: "17:00" }],
    3: [{ start: "09:00", end: "17:00" }],
    4: [{ start: "09:00", end: "17:00" }],
    5: [{ start: "09:00", end: "17:00" }],
    6: [],
  },
};

app.get("/api/booking/availability", async (req, res) => {
  try {
    const avail = await readKey("call_availability", DEFAULT_AVAILABILITY);
    res.json({ ok: true, availability: avail });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put("/api/booking/availability", authenticate, forbidMember, async (req, res) => {
  try {
    const raw = req.body || {};
    const current = await readKey("call_availability", DEFAULT_AVAILABILITY);
    const ALLOWED_AVAILABILITY_KEYS = new Set(["timezone", "slotDuration", "slots"]);
    const updates = {};
    for (const key of Object.keys(raw)) {
      if (ALLOWED_AVAILABILITY_KEYS.has(key)) {
        updates[key] = raw[key];
      }
    }
    if (updates.timezone !== undefined) {
      updates.timezone = sanitizeSettingString(updates.timezone).slice(0, 64);
    }
    if (updates.slotDuration !== undefined) {
      const dur = Number(updates.slotDuration);
      updates.slotDuration = Number.isFinite(dur) && dur > 0 && dur <= 480 ? dur : current.slotDuration || 30;
    }
    if (updates.slots !== undefined && typeof updates.slots === "object" && !Array.isArray(updates.slots)) {
      const sanitizedSlots = {};
      for (const dayKey of Object.keys(updates.slots)) {
        const dayNum = Number(dayKey);
        if (!Number.isInteger(dayNum) || dayNum < 0 || dayNum > 6) continue;
        const daySlots = updates.slots[dayKey];
        if (!Array.isArray(daySlots)) continue;
        sanitizedSlots[dayNum] = daySlots
          .filter(s => s && typeof s === "object" && typeof s.start === "string" && typeof s.end === "string")
          .map(s => ({ start: s.start.slice(0, 5), end: s.end.slice(0, 5) }));
      }
      updates.slots = sanitizedSlots;
    } else {
      delete updates.slots;
    }
    const merged = { ...current, ...updates };
    await writeKey("call_availability", merged);
    res.json({ ok: true, availability: merged });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/booking/slots", async (req, res) => {
  try {
    const { date } = req.query || {};
    if (!date) return res.status(400).json({ ok: false, error: "date required (YYYY-MM-DD)" });

    const avail = await readKey("call_availability", DEFAULT_AVAILABILITY);
    const tz = avail.timezone || "America/New_York";
    const slotMinutes = avail.slotDuration || 30;

    const targetDate = new Date(date + "T00:00:00");
    const dayOfWeek = targetDate.getUTCDay();
    const daySlots = avail.slots[dayOfWeek] || [];

    if (!daySlots.length) {
      return res.json({ ok: true, slots: [], date, timezone: tz });
    }

    const bookings = await readKey("call_bookings", []);
    const dayBookings = bookings.filter(b => b.date === date && b.status !== "cancelled");
    const bookedTimes = new Set(dayBookings.map(b => b.time));

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    const available = [];
    for (const window of daySlots) {
      const [startH, startM] = window.start.split(":").map(Number);
      const [endH, endM] = window.end.split(":").map(Number);
      let minutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      while (minutes + slotMinutes <= endMinutes) {
        const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
        const mm = String(minutes % 60).padStart(2, "0");
        const timeStr = `${hh}:${mm}`;

        let isPast = false;
        if (date === todayStr) {
          const slotDate = new Date(date + "T" + timeStr + ":00");
          isPast = slotDate <= now;
        }

        if (!bookedTimes.has(timeStr) && !isPast) {
          available.push(timeStr);
        }
        minutes += slotMinutes;
      }
    }

    res.json({ ok: true, slots: available, date, timezone: tz });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/booking/bookings", authenticate, async (req, res) => {
  try {
    const bookings = await readKey("call_bookings", []);
    const active = bookings.filter(b => b.status !== "cancelled");
    active.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    res.json({ ok: true, bookings: active });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/booking/book", async (req, res) => {
  try {
    const { date, time, name, email, phone, consumerId, notes } = req.body || {};
    if (!date || !time) return res.status(400).json({ ok: false, error: "date and time required" });
    if (!name) return res.status(400).json({ ok: false, error: "name required" });

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    if (date < todayStr) return res.status(400).json({ ok: false, error: "Cannot book a past date" });

    const avail = await readKey("call_availability", DEFAULT_AVAILABILITY);
    const slotMinutes = avail.slotDuration || 30;

    const targetDate = new Date(date + "T00:00:00");
    const dayOfWeek = targetDate.getUTCDay();
    const daySlots = avail.slots[dayOfWeek] || [];
    if (!daySlots.length) {
      return res.status(400).json({ ok: false, error: "No availability on this day" });
    }

    const [h, m] = time.split(":").map(Number);
    const reqMinutes = h * 60 + m;
    let validSlot = false;
    for (const window of daySlots) {
      const [sh, sm] = window.start.split(":").map(Number);
      const [eh, em] = window.end.split(":").map(Number);
      if (reqMinutes >= sh * 60 + sm && reqMinutes + slotMinutes <= eh * 60 + em) {
        validSlot = true;
        break;
      }
    }
    if (!validSlot) return res.status(400).json({ ok: false, error: "Selected time is outside available hours" });

    const bookings = await readKey("call_bookings", []);
    const conflict = bookings.find(b => b.date === date && b.time === time && b.status !== "cancelled");
    if (conflict) return res.status(409).json({ ok: false, error: "This time slot is already booked" });

    const booking = {
      id: nanoid(10),
      date,
      time,
      name,
      email: email || "",
      phone: phone || "",
      consumerId: consumerId || "",
      notes: notes || "",
      status: "confirmed",
      createdAt: new Date().toISOString(),
    };

    bookings.push(booking);
    await writeKey("call_bookings", bookings);

    const endH = Math.floor((reqMinutes + slotMinutes) / 60);
    const endM = (reqMinutes + slotMinutes) % 60;
    const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
    const h12 = (parseInt(time.split(":")[0]) % 12) || 12;
    const ampm = parseInt(time.split(":")[0]) >= 12 ? "PM" : "AM";
    const niceTime = `${h12}:${time.split(":")[1]} ${ampm}`;
    const niceDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

    if (consumerId) {
      try {
        const msgText = `New call booked for ${niceDate} at ${niceTime}.\nName: ${name}\nPhone: ${phone || "N/A"}\nEmail: ${email || "N/A"}${notes ? "\nNotes: " + notes : ""}`;
        await addEvent(consumerId, "message", { from: "system", text: msgText });
        await addEvent(consumerId, "call_booked", {
          bookingId: booking.id,
          date,
          time,
          name,
          email: email || "",
          phone: phone || "",
          notes: notes || "",
        });
      } catch (msgErr) {
        logWarn("BOOKING_MESSAGE_FAILED", msgErr?.message || "Could not post booking notification");
      }
    }

    try {
      await createCalendarEvent({
        summary: `Call with ${name}`,
        description: `Phone: ${phone || "N/A"}\nEmail: ${email || "N/A"}\nNotes: ${notes || ""}${consumerId ? "\nClient ID: " + consumerId : ""}`,
        start: { dateTime: `${date}T${time}:00`, timeZone: avail.timezone },
        end: { dateTime: `${date}T${endTime}:00`, timeZone: avail.timezone },
      });
    } catch (calErr) {
      logWarn("BOOKING_CALENDAR_SYNC_FAILED", calErr?.message || "Could not sync to calendar");
    }

    res.json({ ok: true, booking });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/booking/bookings/:id", authenticate, async (req, res) => {
  try {
    const bookings = await readKey("call_bookings", []);
    const idx = bookings.findIndex(b => b.id === req.params.id);
    if (idx === -1) return res.status(404).json({ ok: false, error: "Booking not found" });
    const booking = bookings[idx];
    const isNoShow = !!req.body?.noShow;
    booking.status = isNoShow ? "no_show" : "cancelled";
    await writeKey("call_bookings", bookings);
    // Emit call event notifications
    if (booking.consumerId) {
      try {
        const callConsumer = { name: booking.name };
        if (isNoShow) {
          await addEvent(booking.consumerId, "no_show_detected", { name: callConsumer.name, date: booking.date, time: booking.time });
        } else {
          await addEvent(booking.consumerId, "call_canceled", { name: callConsumer.name, date: booking.date, time: booking.time });
        }
      } catch {}
    } else {
      // No consumerId — emit host-level notification via settings-checked path
      const _evtType = isNoShow ? "no_show_detected" : "call_canceled";
      const _evtMsg = isNoShow
        ? `No-show: ${booking.name || "client"} — ${booking.date} ${booking.time}`
        : `Call canceled: ${booking.name || "client"} — ${booking.date} ${booking.time}`;
      try { await emitHostNotification(_evtType, _evtMsg, { name: booking.name, date: booking.date, time: booking.time }); } catch {}
    }
    res.json({ ok: true });
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
      const hydratedLetters = [];
      for (const d of disk.letters) {
        const fname = d.filename || path.basename(d.htmlPath);
        const html = await loadLetterHtml(jobId, fname) || "<html><body>Missing file.</body></html>";
        hydratedLetters.push({ filename: fname, bureau: d.bureau, creditor: d.creditor, html, useOcr: d.useOcr });
      }
      putJobMem(jobId, hydratedLetters, disk.enclosures);
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

const dbMutex = new (await import("./state.js")).AsyncMutex();

async function loadDB(context){
  await dbMutex.acquire();
  try {
    const scope = tenantScope(resolveTenantContextInput(context));
    let db = await readKey('consumers', null, scope);
    let changed = false;
    if(!db){
      await new Promise(r => setTimeout(r, 500));
      db = await readKey('consumers', null, scope);
    }
    if(!db){
      const sentinel = await readKey('_db_seeded', null, scope);
      if (sentinel) {
        console.warn("[loadDB] DB was previously seeded but consumers key is missing — using empty default without overwriting");
        db = JSON.parse(JSON.stringify(DEFAULT_DB));
        db.consumers = [];
        return db;
      }
      console.warn("[loadDB] Initializing fresh consumers DB (first-time setup)");
      db = JSON.parse(JSON.stringify(DEFAULT_DB));
      changed = true;
    }
    db.consumers = Array.isArray(db.consumers) ? db.consumers : [];
    if(db.consumers.length === 0){
      const sentinel = await readKey('_db_seeded', null, scope);
      if (!sentinel) {
        db.consumers.push({ id: nanoid(10), name: "Sample Consumer", reports: [] });
        changed = true;
      }
    }
    for(const c of db.consumers){
      c.reports = Array.isArray(c.reports) ? c.reports : [];
    }
    if (changed) {
      let seededSample = false;
      for(const c of db.consumers){
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
          } else {
            seededSample = true;
          }
        }
      }
      const hasReports = db.consumers.some(c => c.reports.length > 0);
      if(!hasReports && db.consumers.length){
        const seeded = await buildSeedReport();
        db.consumers[0].reports.push(seeded);
      }
    }
    if(changed){
      await writeKey('consumers', db, scope);
      await writeKey('_db_seeded', { at: new Date().toISOString() }, scope);
    }
    return db;
  } finally {
    dbMutex.release();
  }
}
async function saveDB(db, context){
  await dbMutex.acquire();
  try {
    await writeKey('consumers', db, tenantScope(resolveTenantContextInput(context)));
  } finally {
    dbMutex.release();
  }
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
  if(!db){
    // Distinguish between genuine first boot vs. KV returning null under load.
    // If a sentinel key exists, users WERE initialized before — this is data loss,
    // not first boot. Refuse to overwrite so we don't wipe real accounts.
    const everInit = await readKey('users_ever_initialized', null);
    if(everInit){
      logError('USERS_DB_MISSING', 'users key returned null but sentinel exists — KV may be under load. Aborting to prevent data loss.');
      throw new Error('Users database temporarily unavailable — please retry.');
    }
    db = { users: [] };
  }
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
    await writeKey('users_ever_initialized', { at: new Date().toISOString() });
  }
  // Ensure sentinel is stamped so future null-reads are detected as data loss, not first boot.
  readKey('users_ever_initialized', null).then(s => {
    if(!s) writeKey('users_ever_initialized', { at: new Date().toISOString() }).catch(() => {});
  }).catch(() => {});

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

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
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
  <h1>${escapeHtml(company.name || 'Invoice')}</h1>
  <p><strong>Bill To:</strong> ${escapeHtml(consumer.name || '')}</p>
  <table>
    <thead><tr><th>Description</th><th>Amount</th><th>Due</th></tr></thead>
    <tbody><tr><td>${escapeHtml(inv.desc || '')}</td><td>$${Number(inv.amount).toFixed(2)}</td><td>${escapeHtml(inv.due || '')}</td></tr></tbody>
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

    const fid = nanoid(10);
    const storedName = `${fid}${ext}`;
    const objectKey = objStore.consumerFileKey(inv.consumerId, storedName);
    const pdfBuf = fs.readFileSync(pdfResult.path);
    await objStore.uploadFile(objectKey, pdfBuf, mime);
    await addFileMeta(inv.consumerId, {
      id: fid,
      originalName: `invoice_${inv.id}${ext}`,
      storedName,
      objectKey,
      type: "invoice",
      size: pdfBuf.length,
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

function normalizeParseMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (["legacy", "python", "non_llm", "non-llm"].includes(mode)) return "legacy";
  return "llm";
}

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
  const sanitized = text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_SSN]")
    .replace(/\b\d{9}\b/g, "[REDACTED_SSN]");

  const zipWithLabel = /\b(?:zip|postal)(?:\s+code)?\s*[:#]?\s*(\d{5}(?:-\d{4})?)\b/gi;
  const zipWithState = /\b([A-Z]{2})[ ,]+(\d{5}(?:-\d{4})?)\b/g;

  return sanitized
    .replace(zipWithLabel, (match, zip) => match.replace(zip, "[REDACTED_ZIP]"))
    .replace(zipWithState, (_match, state) => `${state} [REDACTED_ZIP]`);
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

async function callOpenAiText({ system, user, model, temperature = 0.7 }) {
  const apiKey = getOpenAiKey();
  const body = {
    model: model || OPENAI_PARSE_MODEL,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
    store: false,
  };
  const response = await fetchFn(OPENAI_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`OpenAI error ${response.status}: ${JSON.stringify(payload)}`);
  }
  const outputText = payload.output_text
    || payload.output?.map(item => item.content?.map(c => c.text || c.output_text || '').join('') || '').join('');
  if (!outputText) throw new Error("OpenAI returned an empty text response");
  return outputText;
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
    date_last_payment: entry.dateLastPayment || null,
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
    date_last_payment:
      entry.last_payment ??
      entry.date_last_payment ??
      entry.date_of_last_payment ??
      entry.last_payment_date ??
      entry.dateLastPayment ??
      null,
    date_of_last_payment: entry.date_of_last_payment ?? entry.date_last_payment ?? entry.last_payment_date ?? null,
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
    reportText: text,
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
      if (
        /charge[- ]?off|collection/i.test(data.account_status || "") &&
        !(data.date_of_last_payment || data.date_last_payment || data.last_payment_date)
      ) {
        add("MISSING_LAST_PAYMENT_DATE", "Charge-off or collection missing Date of Last Payment");
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
function extractCreditScores(text = ""){
  const scores = {};
  const source = String(text || "");

  const bureauNames = ["transunion", "experian", "equifax"];

  const bureauOccurrences = [];
  for (const name of bureauNames) {
    const re = new RegExp(name, "gi");
    let m;
    while ((m = re.exec(source)) !== null) {
      bureauOccurrences.push({ name, pos: m.index, end: m.index + m[0].length });
    }
  }
  bureauOccurrences.sort((a, b) => a.pos - b.pos);

  const headerGroups = [];
  let currentGroup = [];
  for (const occ of bureauOccurrences) {
    if (currentGroup.length === 0) {
      currentGroup.push(occ);
    } else {
      const lastInGroup = currentGroup[currentGroup.length - 1];
      const gap = occ.pos - lastInGroup.end;
      if (gap < 200) {
        const between = source.slice(lastInGroup.end, occ.pos);
        const hasScoreBetween = /\b\d{3}\b/.test(between);
        const names = new Set(currentGroup.map(o => o.name));
        if (!names.has(occ.name) && !hasScoreBetween) {
          currentGroup.push(occ);
        } else {
          if (currentGroup.length >= 2) headerGroups.push([...currentGroup]);
          currentGroup = [occ];
        }
      } else {
        if (currentGroup.length >= 2) headerGroups.push([...currentGroup]);
        currentGroup = [occ];
      }
    }
  }
  if (currentGroup.length >= 2) headerGroups.push([...currentGroup]);

  let tabularMatch = false;
  for (const group of headerGroups) {
    const lastBureau = group[group.length - 1];
    const searchStart = lastBureau.end;
    const searchText = source.slice(searchStart, searchStart + 500);
    const validScores = [];
    const scoreRe = /\b(\d{3})\b/g;
    let sm;
    while ((sm = scoreRe.exec(searchText)) !== null) {
      const val = Number(sm[1]);
      if (val >= 300 && val <= 850) {
        validScores.push(val);
        if (validScores.length >= group.length) break;
      }
    }
    if (validScores.length >= group.length) {
      for (let i = 0; i < group.length; i++) {
        scores[group[i].name] = validScores[i];
      }
      tabularMatch = true;
      break;
    }
  }

  if (!tabularMatch) {
    for (const name of bureauNames) {
      if (scores[name]) continue;
      const directRe = new RegExp(name + "[^0-9]{0,120}(\\d{3})", "i");
      const reverseRe = new RegExp("(\\d{3})[^0-9]{0,120}" + name, "i");
      for (const re of [directRe, reverseRe]) {
        const m = source.match(re);
        if (m) {
          const val = Number(m[1]);
          if (val >= 300 && val <= 850) {
            scores[name] = val;
          }
          break;
        }
      }
    }
  }

  if (!scores.current) {
    const overallMatch = source.match(/\bcredit\s*score\b[^0-9]{0,40}(\d{3})/i);
    if (overallMatch) {
      scores.current = Number(overallMatch[1]);
    }
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
    source: req.body.source || "",
    sourcePostId: req.body.sourcePostId || "",
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
  const prevStatus = c.status;
  const prevSignature = c.geo_signature || addressSignature(c);
  Object.assign(c, {
    name:req.body.name??c.name, email:req.body.email??c.email, phone:req.body.phone??c.phone,
    addr1:req.body.addr1??c.addr1, addr2:req.body.addr2??c.addr2, city:req.body.city??c.city,
    state:req.body.state??c.state, zip:req.body.zip??c.zip, ssn_last4:req.body.ssn_last4??c.ssn_last4,
    dob:req.body.dob??c.dob,
    sale: req.body.sale !== undefined ? Number(req.body.sale) : c.sale,
    paid: req.body.paid !== undefined ? Number(req.body.paid) : c.paid,
    status: req.body.status ?? c.status ?? "active",
    breachSelections: req.body.breachSelections ?? c.breachSelections,
    breachEvidenceNotes: req.body.breachEvidenceNotes ?? c.breachEvidenceNotes,
    breachEvidenceFiles: req.body.breachEvidenceFiles ?? c.breachEvidenceFiles

  });
  const newSignature = addressSignature(c);
  const needsGeoRefresh = prevSignature !== newSignature || !Number.isFinite(Number(c.geo_lat)) || !Number.isFinite(Number(c.geo_lon));
  if(needsGeoRefresh){
    refreshConsumerGeo(c, { force: true });
  }
  c.updatedAt = new Date().toISOString();
  await saveDB(db);
  await addEvent(c.id, "consumer_updated", { fields: Object.keys(req.body||{}) });
  // client_profile_updated: fires when any core profile field is changed
  const PROFILE_FIELDS = ["name","email","phone","addr1","city","state","zip","dob","ssn_last4"];
  if (PROFILE_FIELDS.some(f => req.body?.[f] !== undefined)) {
    try { await addEvent(c.id, "client_profile_updated", { name: c.name, changedFields: PROFILE_FIELDS.filter(f => req.body?.[f] !== undefined) }); } catch {}
  }
  if (req.body?.status && req.body.status !== prevStatus) {
    try {
      await addEvent(c.id, "client_status_changed", { name: c.name, status: req.body.status });
    } catch {}
  }
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
app.get("/api/leads", authenticate, async (_req,res)=> res.json({ ok:true, ...(await loadLeadsDB()) }));


app.post("/api/leads", authenticate, forbidMember, async (req,res)=>{
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
  try { await emitHostNotification("lead_new", `New lead received: ${lead.name}`, { name: lead.name, email: lead.email, phone: lead.phone, source: lead.source }); } catch {}
  res.json({ ok:true, lead });
});

app.put("/api/leads/:id", authenticate, forbidMember, async (req,res)=>{
  const db = await loadLeadsDB();
  const lead = db.leads.find(l=>l.id===req.params.id);
  if(!lead) return res.status(404).json({ error:"Not found" });
  const prevStatus = lead.status;
  Object.assign(lead, {
    name: req.body.name ?? lead.name,
    email: req.body.email ?? lead.email,
    phone: req.body.phone ?? lead.phone,
    addr1: req.body.addr1 ?? lead.addr1,
    addr2: req.body.addr2 ?? lead.addr2,
    city: req.body.city ?? lead.city,
    state: req.body.state ?? lead.state,
    zip: req.body.zip ?? lead.zip,
    dob: req.body.dob ?? lead.dob,
    source: req.body.source ?? lead.source,
    notes: req.body.notes ?? lead.notes,
    status: req.body.status !== undefined ? normalizeLeadStatus(req.body.status) : lead.status
  });
  lead.updatedAt = new Date().toISOString();
  await saveLeadsDB(db);
  if (req.body.status !== undefined && lead.status !== prevStatus) {
    try { await emitHostNotification("lead_status_changed", `Lead status changed: ${lead.name} → ${lead.status}`, { name: lead.name, email: lead.email, from: prevStatus, to: lead.status }); } catch {}
    if (lead.status === "won") {
      try { await emitHostNotification("lead_converted", `Lead converted to client: ${lead.name}`, { name: lead.name, email: lead.email, phone: lead.phone }); } catch {}
    }
  }
  res.json({ ok:true, lead });
});

app.delete("/api/leads/:id", authenticate, forbidMember, async (req,res)=>{
  const db = await loadLeadsDB();
  const idx = db.leads.findIndex(l=>l.id===req.params.id);
  if(idx === -1) return res.status(404).json({ error:"Not found" });
  db.leads.splice(idx,1);
  await saveLeadsDB(db);
  res.json({ ok:true });
});

// =================== Invoices ===================
app.get("/api/invoices/:consumerId", authenticate, async (req,res)=>{
  const db = await loadInvoicesDB();
  const list = db.invoices.filter(inv => inv.consumerId === req.params.consumerId);
  res.json({ ok:true, invoices: list });
});

app.post("/api/invoices", authenticate, forbidMember, async (req,res)=>{
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
    if (result.invoice) {
      try {
        await addEvent(consumerId, "invoice_created", {
          name: consumer?.name,
          amount: result.invoice.amount,
          desc: result.invoice.desc,
        });
      } catch {}
    }
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
app.get("/api/billing/plans/:consumerId", authenticate, async (req,res)=>{
  const plansDb = await loadBillingPlansDB();
  const plans = plansDb.plans.filter(plan => plan.consumerId === req.params.consumerId);
  res.json({ ok:true, plans: plans.map(clonePlan) });
});

app.post("/api/billing/plans", authenticate, forbidMember, async (req,res)=>{
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

app.put("/api/billing/plans/:id", authenticate, forbidMember, async (req,res)=>{
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

app.post("/api/billing/plans/:id/send", authenticate, forbidMember, async (req,res)=>{
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
    // Emit payment_failed event for unexpected billing failures
    if (req.body?.consumerId || req.params?.id) {
      const plansDb2 = await loadBillingPlansDB().catch(() => null);
      const failPlan = plansDb2?.plans?.find(p => p.id === req.params.id);
      if (failPlan?.consumerId) {
        try {
          await addEvent(failPlan.consumerId, "payment_failed", {
            name: null,
            amount: failPlan.amount,
            detail: err?.message?.slice(0, 100),
          });
        } catch {}
      }
    }
    res.status(500).json({ ok:false, error: "Failed to send plan invoice" });
  }
});

app.post("/api/invoices/:id/checkout", authenticate, async (req, res) => {
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

app.put("/api/invoices/:id", authenticate, forbidMember, async (req,res)=>{
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
  if (!wasPaid && inv.paid) {
    try {
      const mainDb2 = await loadDB().catch(() => null);
      const invConsumer = mainDb2?.consumers?.find(c => c.id === inv.consumerId);
      await addEvent(inv.consumerId, "payment_succeeded", {
        name: invConsumer?.name,
        amount: inv.amount,
        desc: inv.desc,
      });
    } catch {}
  }
  res.json({ ok:true, invoice: inv });
});

// =================== Users ===================
app.post("/api/register", async (req,res)=>{
  const { username, password, name, email } = req.body;
  if (!username || !password || !name || !email) return res.status(400).json({ ok:false, error:"Name, email, username, and password are required" });
  if (password.length < 6) return res.status(400).json({ ok:false, error:"Password must be at least 6 characters" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok:false, error:"A valid email is required" });
  const db = await loadUsersDB();
  if(db.users.find(u=>u.username===username)) return res.status(400).json({ ok:false, error:"Registration failed. Please try a different username and email." });
  if(db.users.find(u=>u.email && u.email === email)) return res.status(400).json({ ok:false, error:"Registration failed. Please try a different username and email." });
  const newTenantId = `tenant_${nanoid(12)}`;
  const user = normalizeUser({
    id: nanoid(10),
    username: req.body.username || "",
    name: req.body.name || "",
    email: req.body.email || "",
    phone: req.body.phone || "",
    company: req.body.company || "",
    password: bcrypt.hashSync(req.body.password || "", 10),
    role: "admin",
    tenantId: newTenantId,
    permissions: []
  });
  db.users.push(user);
  await saveUsersDB(db);
  res.json({ ok:true, token: generateToken(user) });
});

// Track login failures per username for login_failed_threshold notifications
const _loginFailCounts = new Map();
const LOGIN_FAIL_THRESHOLD = 5;
const LOGIN_FAIL_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Track last known IP per username for login_new_device detection
const _lastLoginIP = new Map();

function recordLoginFailure(username) {
  const now = Date.now();
  const entry = _loginFailCounts.get(username) || { count: 0, firstAt: now };
  // Reset window if expired
  if (now - entry.firstAt > LOGIN_FAIL_WINDOW_MS) {
    entry.count = 0;
    entry.firstAt = now;
  }
  entry.count++;
  _loginFailCounts.set(username, entry);
  return entry.count;
}

app.post("/api/login", async (req,res)=>{
  logInfo("LOGIN_ATTEMPT", "Admin login attempt", { username: req.body.username });
  const db = await loadUsersDB();
  const user = db.users.find(u=>u.username===req.body.username);
  if(!user){
    logWarn("LOGIN_FAIL", "Admin login failed: user not found", { username: req.body.username });
    const failCount = recordLoginFailure(req.body.username || "unknown");
    if (failCount >= LOGIN_FAIL_THRESHOLD) {
      try {
        const _thresh_msg = `${failCount} failed login attempts for "${req.body.username}" in the last 15 minutes`;
        await emitHostNotification("login_failed_threshold", _thresh_msg, { count: failCount, username: req.body.username });
        _loginFailCounts.delete(req.body.username || "unknown");
      } catch {}
    }
    return res.status(401).json({ ok:false, error:"Invalid credentials" });
  }
  if(!bcrypt.compareSync(req.body.password || "", user.password)){
    logWarn("LOGIN_FAIL", "Admin login failed: wrong password", { username: req.body.username });
    const failCount = recordLoginFailure(req.body.username);
    if (failCount >= LOGIN_FAIL_THRESHOLD) {
      try {
        const _thresh_msg = `${failCount} failed login attempts for "${req.body.username}" in the last 15 minutes`;
        await emitHostNotification("login_failed_threshold", _thresh_msg, { count: failCount, username: req.body.username });
        _loginFailCounts.delete(req.body.username);
      } catch {}
    }
    return res.status(401).json({ ok:false, error:"Invalid credentials" });
  }
  // Clear failure count on success
  _loginFailCounts.delete(req.body.username);
  // login_new_device: emit when a successful login comes from a new/different IP
  const clientIp = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const lastIp = _lastLoginIP.get(user.username);
  if (lastIp && lastIp !== clientIp) {
    try { await emitHostNotification("login_new_device", `Login from new device/location for "${user.username}" (IP: ${clientIp})`, { username: user.username, ip: clientIp, previousIp: lastIp }); } catch {}
  }
  _lastLoginIP.set(user.username, clientIp);
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
    const loginEmail = (req.body.email || "").trim().toLowerCase();
    logInfo("CLIENT_LOGIN_ATTEMPT", "Client login with email", { email: loginEmail });
    client = db.consumers.find(c=>(c.email||"").trim().toLowerCase()===loginEmail);
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

const PORTAL_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

app.post("/api/consumers/:id/portal-invite", authenticate, async (req, res) => {
  const db = await loadDB();
  const userTenant = sanitizeTenantId(req.user?.tenantId || DEFAULT_TENANT_ID);
  const consumer = db.consumers.find(c => c.id === req.params.id);
  if (!consumer) return res.status(404).json({ ok: false, error: "Consumer not found" });
  const consTenant = sanitizeTenantId(consumer.tenantId || consumer.ownerTenantId || DEFAULT_TENANT_ID);
  if (consTenant !== userTenant) return res.status(403).json({ ok: false, error: "Access denied" });
  const token = nanoid(20);
  consumer.portalInviteToken = token;
  consumer.portalInviteCreatedAt = new Date().toISOString();
  await saveDB(db);
  const base = `${req.protocol}://${req.get("host")}`;
  const link = `${base}/client-setup?token=${token}`;
  try { await addEvent(consumer.id, "client_invited", { name: consumer.name }); } catch {}
  res.json({ ok: true, link, token });
});

function findConsumerByInviteToken(db, token) {
  const consumer = db.consumers.find(c => c.portalInviteToken === token);
  if (!consumer) return null;
  if (consumer.password && consumer.portalSetupCompletedAt) return consumer;
  const created = new Date(consumer.portalInviteCreatedAt).getTime();
  if (Date.now() - created > PORTAL_INVITE_TTL_MS) return null;
  return consumer;
}

app.get("/api/client-setup/validate", async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ ok: false, error: "Missing token" });
  const db = await loadDB();
  const consumer = findConsumerByInviteToken(db, token);
  if (!consumer) return res.status(410).json({ ok: false, error: "This link is invalid or has expired. Please request a new one." });
  const hasPassword = !!consumer.password;
  res.json({ ok: true, name: consumer.name || "", email: consumer.email || "", hasPassword });
});

app.post("/api/client-setup/complete", async (req, res) => {
  const { token, password, email: submittedEmail } = req.body;
  if (!token || !password) return res.status(400).json({ ok: false, error: "Token and password required" });
  if (password.length < 6) return res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });
  const db = await loadDB();
  const consumer = findConsumerByInviteToken(db, token);
  if (!consumer) return res.status(410).json({ ok: false, error: "This link is invalid or has expired. Please request a new one." });
  if (consumer.password && consumer.portalSetupCompletedAt) {
    return res.status(409).json({ ok: false, error: "Your account is already set up. Please use the login page.", alreadySetup: true });
  }
  if (!consumer.email && submittedEmail) {
    const normalizedEmail = submittedEmail.trim().toLowerCase();
    if (!/\S+@\S+\.\S+/.test(normalizedEmail)) return res.status(400).json({ ok: false, error: "Please enter a valid email address" });
    const emailTaken = db.consumers.find(c => c.id !== consumer.id && (c.email || "").trim().toLowerCase() === normalizedEmail);
    if (emailTaken) return res.status(409).json({ ok: false, error: "This email is already associated with another account" });
    consumer.email = normalizedEmail;
  } else if (!consumer.email && !submittedEmail) {
    return res.status(400).json({ ok: false, error: "Email address is required to create your account" });
  }
  if (consumer.email) {
    consumer.email = consumer.email.trim().toLowerCase();
  }
  consumer.password = bcrypt.hashSync(password, 10);
  consumer.portalSetupCompletedAt = new Date().toISOString();
  await saveDB(db);
  try { await addEvent(consumer.id, "client_activated", { name: consumer.name }); } catch {}
  const clientTenant = sanitizeTenantId(consumer?.tenantId || consumer?.ownerTenantId || DEFAULT_TENANT_ID);
  const u = { id: consumer.id, username: consumer.email || consumer.name || "client", role: "client", tenantId: clientTenant, permissions: [] };
  res.json({ ok: true, token: generateToken(u) });
});

const leadCaptureTimestamps = new Map();

app.post("/api/lead-capture", async (req, res) => {
  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim();
  const phone = (req.body.phone || "").trim();
  if (!name || !email || !phone) return res.status(400).json({ ok: false, error: "Name, email, and phone are required" });
  if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ ok: false, error: "Invalid email address" });
  if (req.body.website) return res.status(200).json({ ok: true, lead: { id: "ok", name } });

  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();
  const last = leadCaptureTimestamps.get(ip) || 0;
  if (now - last < 10000) return res.status(429).json({ ok: false, error: "Please wait a moment before submitting again" });
  leadCaptureTimestamps.set(ip, now);

  const affRef = (req.body.ref || "").trim();
  const isAffiliate = !!affRef;
  const db = await loadLeadsDB();
  const id = nanoid(10);
  const lead = {
    id,
    name,
    email,
    phone,
    addr1: req.body.addr1 || "",
    addr2: req.body.addr2 || "",
    city: req.body.city || "",
    state: req.body.state || "",
    zip: req.body.zip || "",
    dob: req.body.dob || "",
    source: isAffiliate ? "Affiliate Referral" : (req.body.source || "Lead Capture Form"),
    notes: isAffiliate
      ? [req.body.notes, `Affiliate Ref: ${affRef}`].filter(Boolean).join('\n')
      : (req.body.notes || ""),
    creditGoal: req.body.creditGoal || "",
    currentScore: req.body.currentScore || "",
    status: "new",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.leads.push(lead);
  await saveLeadsDB(db);
  try { await emitHostNotification("lead_new", `New lead received: ${lead.name}`, { name: lead.name, email: lead.email, phone: lead.phone, source: lead.source }); } catch {}

  if (isAffiliate) {
    try {
      const aff = await findAffiliateByRefCode(affRef);
      if (aff) {
        const commission = (aff.customCommissionRate != null && aff.customCommissionRate !== '') ? Number(aff.customCommissionRate) : 0;
        if (!aff.referrals) aff.referrals = [];
        aff.referrals.push({ id: nanoid(8), type: 'lead', name, email: email.toLowerCase(), source: 'Affiliate Referral', earned: commission, status: 'pending', date: new Date().toISOString() });
        aff.totalEarned = (aff.totalEarned || 0) + commission;
        await saveAffiliate(aff);
      }
    } catch (e) { logWarn('AFFILIATE_LEAD_CREDIT_ERROR', e.message); }
  }

  res.json({ ok: true, lead: { id: lead.id, name: lead.name } });
});

app.post("/api/lead-capture/generate-link", authenticate, async (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;
  const source = req.body.source || "link";
  const link = `${base}/lead-capture?source=${encodeURIComponent(source)}`;
  res.json({ ok: true, link });
});

app.get("/api/public/credit-companies", async (_req, res) => {
  try {
    const [companiesDb, metricsDb, boostsDb] = await Promise.all([
      loadCreditCompaniesDB(),
      loadCreditCompanyMetricsDB(),
      loadCreditCompanyBoostsDB()
    ]);
    const now = Date.now();
    const metricsByCompany = new Map(metricsDb.metrics.map(m => [m.companyId, m]));
    const boostsByCompany = new Map(boostsDb.boosts.map(b => [b.companyId, b]));
    const activeCompanies = companiesDb.companies.filter(c => c.isActive);

    const ranges = {
      responseTime: normalizeRange(activeCompanies.map(c => metricsByCompany.get(c.id)?.avgResponseTimeDays)),
      activeClients: normalizeRange(activeCompanies.map(c => metricsByCompany.get(c.id)?.activeClients)),
      reviewScore: normalizeRange(activeCompanies.map(c => metricsByCompany.get(c.id)?.reviewScore))
    };

    let rankings = activeCompanies.map(company => {
      const metrics = metricsByCompany.get(company.id) || {};
      const boost = boostsByCompany.get(company.id);
      const isBoosted = isBoostActive(boost, now);
      const performanceScore = Object.keys(metrics).length ? calculatePerformanceScore(metrics, ranges) : 0;
      const boostMultiplier = isBoosted ? 1 + Math.min(0.25, boost.amount || 0) : 1;
      return {
        companyId: company.id,
        name: company.name,
        serviceArea: company.serviceArea || 'Nationwide',
        focus: company.focus || '',
        isBoosted,
        performanceScore,
        finalScore: performanceScore * boostMultiplier,
        metrics: {
          successRate: metrics.disputeSuccessRate ? Math.round(metrics.disputeSuccessRate * 100) : null,
          avgResponseDays: metrics.avgResponseTimeDays ? parseFloat(metrics.avgResponseTimeDays.toFixed(1)) : null,
          rating: metrics.reviewScore ? parseFloat(metrics.reviewScore.toFixed(1)) : null,
          activeClients: metrics.activeClients || null
        }
      };
    });

    rankings = rankings.sort((a, b) => b.finalScore - a.finalScore);
    rankings = applyRotationWindow(rankings);

    res.json({ ok: true, companies: rankings.map((e, i) => ({ rank: i + 1, ...e })) });
  } catch (err) {
    logError('PUBLIC_CREDIT_COMPANY_LIST_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch specialists' });
  }
});

app.post("/api/public/leads", async (req, res) => {
  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim();
  const phone = (req.body.phone || "").trim();
  const companyId = (req.body.companyId || "").trim();

  if (!name || !email || !phone) {
    return res.status(400).json({ ok: false, error: "Name, email, and phone are required" });
  }
  if (!/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ ok: false, error: "Invalid email address" });
  }
  if (req.body.website) return res.status(200).json({ ok: true });

  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const now = Date.now();
  const last = leadCaptureTimestamps.get(ip) || 0;
  if (now - last < 10000) {
    return res.status(429).json({ ok: false, error: "Please wait a moment before submitting again" });
  }
  leadCaptureTimestamps.set(ip, now);

  try {
    let companyName = '';
    if (companyId) {
      const companiesDb = await loadCreditCompaniesDB();
      const company = companiesDb.companies.find(c => c.id === companyId);
      if (company) companyName = company.name;
    }

    const db = await loadLeadsDB();
    const id = nanoid(10);
    const sourceLabel = companyName ? `Specialist Directory — ${companyName}` : 'Specialist Directory';
    const noteParts = [];
    if (req.body.notes) noteParts.push(req.body.notes.trim());
    if (companyName) noteParts.push(`Requested specialist: ${companyName}`);

    const lead = {
      id,
      name,
      email,
      phone,
      addr1: "",
      addr2: "",
      city: "",
      state: "",
      zip: "",
      dob: "",
      source: sourceLabel,
      notes: noteParts.join('\n'),
      creditGoal: req.body.creditGoal || "",
      currentScore: "",
      status: "new",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.leads.push(lead);
    await saveLeadsDB(db);

    try {
      await emitHostNotification("lead_new", `New specialist inquiry from ${lead.name}`, {
        name: lead.name, email: lead.email, phone: lead.phone, source: lead.source
      });
    } catch {}

    res.json({ ok: true, lead: { id: lead.id, name: lead.name } });
  } catch (err) {
    logError('PUBLIC_LEAD_CAPTURE_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to submit your inquiry. Please try again.' });
  }
});

const _resetRateMap = new Map();
function checkResetRateLimit(key, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const entry = _resetRateMap.get(key);
  if (entry && now - entry.start < windowMs) {
    if (entry.count >= maxAttempts) return false;
    entry.count++;
    return true;
  }
  _resetRateMap.set(key, { start: now, count: 1 });
  return true;
}

app.post("/api/request-password-reset", async (req,res)=>{
  const email = (req.body.email || "").trim().toLowerCase();
  if(!email) return res.status(400).json({ ok:false, error:"Email is required" });
  if(!checkResetRateLimit("req:" + email, 5)) return res.status(429).json({ ok:false, error:"Too many reset requests. Please try again later." });
  const db = await loadUsersDB();
  const user = db.users.find(u=> (u.email || "").toLowerCase() === email);
  if(!user){
    return res.json({ ok:true });
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  user.resetCode = code;
  user.resetCodeExpires = Date.now() + 15 * 60 * 1000;
  delete user.resetToken;
  await saveUsersDB(db);
  if(mailer){
    try{
      await mailer.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@evolv.ai",
        to: user.email,
        subject: "Your Evolv Password Reset Code",
        text: `Your password reset code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, please ignore this email.`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0a0a0a;color:#fff;border-radius:16px"><h2 style="margin:0 0 8px;color:#d4a853">Password Reset</h2><p style="color:rgba(255,255,255,0.6);margin:0 0 24px">Use the code below to reset your password.</p><div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:20px;text-align:center;letter-spacing:8px;font-size:32px;font-weight:700;color:#d4a853">${code}</div><p style="color:rgba(255,255,255,0.4);font-size:13px;margin:20px 0 0">This code expires in 15 minutes. If you did not request this, ignore this email.</p></div>`
      });
    }catch(emailErr){
      logError("RESET_EMAIL_FAIL", emailErr);
    }
  }else{
    logWarn("RESET_NO_MAILER", "No SMTP configured; reset code generated for user but could not be delivered");
  }
  res.json({ ok:true });
});

app.post("/api/reset-password", async (req,res)=>{
  const email = (req.body.email || "").trim().toLowerCase();
  const code = (req.body.code || "").trim();
  const password = req.body.password || "";
  if(!email || !code || !password) return res.status(400).json({ ok:false, error:"Email, code, and new password are required" });
  if(!checkResetRateLimit("verify:" + email, 10)) return res.status(429).json({ ok:false, error:"Too many attempts. Please request a new code." });
  if(password.length < 6) return res.status(400).json({ ok:false, error:"Password must be at least 6 characters" });
  const db = await loadUsersDB();
  const user = db.users.find(u=> (u.email || "").toLowerCase() === email && u.resetCode === code);
  if(!user) return res.status(400).json({ ok:false, error:"Invalid or expired code" });
  if(user.resetCodeExpires && Date.now() > user.resetCodeExpires) {
    delete user.resetCode;
    delete user.resetCodeExpires;
    await saveUsersDB(db);
    return res.status(400).json({ ok:false, error:"Code has expired. Please request a new one." });
  }
  user.password = bcrypt.hashSync(password, 10);
  delete user.resetCode;
  delete user.resetCodeExpires;
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
  try { await emitHostNotification("team_member_added", `New team member added: ${member.name || member.username}`, { memberName: member.name || member.username, username: member.username, teamRole: member.teamRole }); } catch {}
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

// system_maintenance: admin-triggered maintenance mode notification
app.post("/api/admin/maintenance", authenticate, requireRole("admin"), async (req, res) => {
  const { message, scheduledAt, expectedDurationMins } = req.body || {};
  const msg = (typeof message === "string" && message.trim()) || "Scheduled system maintenance";
  try {
    await emitHostNotification("system_maintenance", msg, {
      scheduledAt: scheduledAt || new Date().toISOString(),
      expectedDurationMins: expectedDurationMins || null,
      triggeredBy: req.user?.username || "admin",
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
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
    try { await emitHostNotification("role_changed", `Role updated for ${member.name || member.username}: ${member.teamRole || "custom"}`, { memberName: member.name || member.username, teamRole: member.teamRole }); } catch {}
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
app.get("/api/messages", authenticate, async (_req, res) => {
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

app.get("/api/messages/:consumerId", authenticate, async (req,res)=>{
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
  // Emit message_received notification when a client sends a message
  if (from === "client" || (!req.user && req.body.from === "client")) {
    try {
      const msgDb = await loadDB().catch(() => null);
      const msgConsumer = msgDb?.consumers?.find(c => c.id === req.params.consumerId);
      await addEvent(req.params.consumerId, "message_received", {
        name: msgConsumer?.name,
        text: text.slice(0, 100),
      });
    } catch {}
  }
  res.json({ ok:true });
});

// =================== Pipeline Pulse Feed ===================
// Returns a merged, time-sorted list of recent client messages + host notification events
// System events get _kind:'system'; client messages get _kind:'message'
app.get("/api/pulse-feed", authenticate, async (req, res) => {
  const LIMIT = 20;
  const SYSTEM_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h for system events
  const cutoff = new Date(Date.now() - SYSTEM_WINDOW_MS).toISOString();

  try {
    const [db, { notifications }] = await Promise.all([
      loadDB(),
      listNotifications({ limit: 50 }),
    ]);

    const systemItems = (notifications || [])
      .filter(n => n.at >= cutoff)
      .map(n => ({
        _kind: "system",
        id: n.id,
        eventType: n.eventType,
        eventLabel: n.eventLabel,
        message: n.message,
        consumerName: n.consumerName,
        consumerId: n.consumerId,
        at: n.at,
        read: n.read,
      }));

    const msgItems = [];
    for (const c of db.consumers || []) {
      try {
        const cstate = await listConsumerState(c.id);
        const msgs = (cstate.events || [])
          .filter(e => e.type === "message" && e.at >= cutoff)
          .map(m => ({
            _kind: "message",
            id: m.id,
            consumer: { id: c.id, name: c.name || "" },
            payload: m.payload || {},
            message: m.payload?.text || "",
            at: m.at,
          }));
        msgItems.push(...msgs);
      } catch {}
    }

    const all = [...systemItems, ...msgItems]
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, LIMIT);

    res.json({ ok: true, items: all });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Failed to load pulse feed" });
  }
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
    if(ensureTemplateDefaults(db)) mutated = true;
  }
  if(ensureContractDefaults(db)) mutated = true;
  if(ensureSequenceDefaults(db)) mutated = true;
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
  for(const lt of LETTER_TEMPLATES){
    if(!existingIds.has(lt.id)){
      db.templates.push({
        id: lt.id,
        heading: lt.name,
        intro: lt.english || '',
        ask: '',
        afterIssues: '',
        evidence: '',
        requestType: 'correct'
      });
      existingIds.add(lt.id);
      mutated = true;
    }
  }
  return mutated;
}

function defaultContracts(){
  return [
    {
      id: "contract-credit-repair-retainer",
      name: "Credit Repair Service Agreement",
      english: `CREDIT REPAIR SERVICE AGREEMENT

This Credit Repair Service Agreement ("Agreement") is entered into between the Credit Repair Organization ("Company") and the undersigned consumer ("Client").

1. SCOPE OF SERVICES
Company agrees to provide credit repair services in compliance with the Credit Repair Organizations Act (CROA), 15 U.S.C. §1679, including:
- Review and analysis of Client's credit reports from Equifax, Experian, and TransUnion
- Identification of inaccurate, incomplete, or unverifiable information
- Preparation and mailing of dispute letters to credit bureaus and furnishers pursuant to FCRA §611
- Follow-up correspondence including Method of Verification (MOV) requests, escalation letters, and regulatory complaints as warranted
- Monthly progress reports and credit score monitoring updates

2. CLIENT OBLIGATIONS
Client agrees to:
- Provide accurate personal information and documentation as requested
- Promptly forward any correspondence received from credit bureaus or creditors
- Not engage another credit repair organization simultaneously without written notice
- Complete any required identity verification questionnaires

3. FEES AND PAYMENT
- Setup Fee: $_____ due upon execution of this Agreement (no work begins until 3 business days after signing per CROA §1679b(b))
- Monthly Service Fee: $_____ billed on the _____ of each month
- Per-deletion Fee (if applicable): $_____ per verified removal
All fees are earned only after services are performed. No advance fees may be collected before the 3-day cancellation window expires.

4. CANCELLATION AND REFUND POLICY
Client may cancel this Agreement at any time without penalty by providing written notice. Per CROA §1679e, Client has the right to cancel within three (3) business days of signing. Upon cancellation, Company will refund any fees for services not yet rendered.

5. NO GUARANTEES
Company does not guarantee specific results. No credit repair organization can lawfully guarantee the removal of accurate, timely information from a credit report. Per CROA §1679b(a)(1), it is unlawful to make untrue or misleading representations regarding credit repair services.

6. TERM
This Agreement shall remain in effect for an initial term of _____ months, renewable on a month-to-month basis thereafter unless cancelled by either party with 30 days written notice.

7. GOVERNING LAW
This Agreement shall be governed by the laws of the State of __________ and applicable federal law including the Fair Credit Reporting Act (FCRA), the Credit Repair Organizations Act (CROA), and the Fair Debt Collection Practices Act (FDCPA).

NOTICE: You have a right to dispute inaccurate information in your credit report by contacting the credit bureau directly. However, under the FCRA you have the right to hire a credit repair organization to assist you.

___________________________          ___________________________
Company Representative               Client Signature
Date: _______________                Date: _______________`
    },
    {
      id: "contract-compliance-retainer",
      name: "Metro 2 Compliance Retainer Agreement",
      english: `METRO 2 COMPLIANCE RETAINER AGREEMENT

This Metro 2 Compliance Retainer Agreement ("Agreement") is entered into between the Credit Repair Organization ("Company") and the undersigned consumer ("Client").

1. SERVICE DESCRIPTION
Company will provide ongoing Metro 2 compliance monitoring and dispute management services, including:
- Continuous monitoring of Client's credit reports for Metro 2 format violations
- Automated detection of data field inaccuracies (Base Segment, J1/J2 Segments, K-Segment irregularities)
- Priority dispute filing for newly identified errors within 5 business days
- Quarterly compliance audits with written findings reports
- Certified mail concierge service for all dispute correspondence
- Access to Company's client portal for real-time dispute tracking

2. COMPLIANCE STANDARDS
All dispute communications are prepared in accordance with:
- FCRA §611 (Procedure in case of disputed accuracy)
- FCRA §623 (Responsibilities of furnishers of information)
- CDIA Metro 2 Format Reporting Standards
- CFPB Supervision and Examination Manual guidelines

3. FEES
- Monthly Retainer: $_____ per month
- Certified Mail Fees: Included (up to 10 pieces per month; additional at $_____ each)
- Rush Processing: $_____ per item (disputes filed within 24 hours)
All fees comply with CROA advance fee prohibitions. No charges are assessed before services are actually performed.

4. TERM AND RENEWAL
Initial term: _____ months. Automatically renews month-to-month unless either party provides 30 days written notice of cancellation.

5. CANCELLATION
Client may cancel at any time without penalty. CROA 3-day right of rescission applies from the date of signing.

6. DISPUTE RESOLUTION
Any disputes arising under this Agreement shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association.

___________________________          ___________________________
Company Representative               Client Signature
Date: _______________                Date: _______________`
    },
    {
      id: "contract-premium-concierge",
      name: "Premium Concierge Dispute Package",
      english: `PREMIUM CONCIERGE DISPUTE PACKAGE AGREEMENT

This Premium Concierge Dispute Package Agreement ("Agreement") is entered into between the Credit Repair Organization ("Company") and the undersigned consumer ("Client").

1. PACKAGE DESCRIPTION
The Premium Concierge Package includes white-glove dispute management services:

TIER 1 — INITIAL AUDIT & DISPUTE (Months 1-2)
- Comprehensive tri-bureau credit report analysis
- Metro 2 compliance audit identifying all reporting violations
- First-round dispute letters via certified mail to all three bureaus
- Direct furnisher disputes under FCRA §623 where applicable

TIER 2 — ESCALATION (Months 3-4)
- Second-round disputes for all items verified or not addressed
- Method of Verification (MOV) demands under FCRA §611(a)(7)
- AG/CFPB escalation letters for non-compliant bureaus
- Evidence-based dispute strategy adjustments

TIER 3 — RESOLUTION & PROTECTION (Months 5-6)
- Final-round disputes with case law citations
- CFPB complaint filing assistance for unresolved items
- Goodwill and pay-for-delete negotiations where appropriate
- Credit monitoring setup and identity theft prevention measures

2. DELIVERABLES
- All dispute letters prepared and mailed via USPS Certified Mail with Return Receipt
- Monthly written progress reports
- Client portal access with real-time tracking
- Dedicated case manager for the duration of the engagement

3. INVESTMENT
- One-Time Package Fee: $_____ (billed in _____ monthly installments of $_____)
- No additional per-item or per-round fees
- Certified mail costs included

4. COMPLIANCE NOTICE
This package is offered in full compliance with the Credit Repair Organizations Act (CROA). No work will commence until the 3-business-day cancellation period has elapsed. Company makes no guarantee of specific outcomes.

5. CANCELLATION
Client may cancel at any time. Unused portions of prepaid installments will be refunded on a pro-rata basis.

___________________________          ___________________________
Company Representative               Client Signature
Date: _______________                Date: _______________`
    }
  ];
}

function defaultSequences(){
  return [
    {
      id: "playbook-standard-dispute",
      name: "Standard Dispute Flow (6-Round)",
      templates: [
        "611-general-dispute",
        "second-round-dispute",
        "method-of-verification",
        "623-direct-dispute",
        "ag-cfpb-escalation",
        "goodwill-removal"
      ]
    },
    {
      id: "playbook-debt-collector",
      name: "Debt Collector Defense",
      templates: [
        "debt-validation",
        "cease-and-desist",
        "fdcpa-time-barred",
        "fdcpa-harassment",
        "arbitration-election"
      ]
    },
    {
      id: "playbook-aggressive-deletion",
      name: "Aggressive Deletion Strategy",
      templates: [
        "611-general-dispute",
        "609-disclosure",
        "method-of-verification",
        "second-round-dispute",
        "623-direct-dispute",
        "reinsertion-dispute",
        "ag-cfpb-escalation"
      ]
    },
    {
      id: "playbook-medical-debt",
      name: "Medical Debt Removal",
      templates: [
        "hipaa-medical-debt",
        "hipaa-phi-disclosure",
        "debt-validation",
        "611-general-dispute",
        "ag-cfpb-escalation"
      ]
    },
    {
      id: "playbook-bankruptcy-cleanup",
      name: "Post-Bankruptcy Cleanup",
      templates: [
        "bankruptcy-misreporting",
        "obsolete-debt",
        "611-general-dispute",
        "method-of-verification",
        "623-direct-dispute"
      ]
    }
  ];
}

function ensureContractDefaults(db){
  if(!Array.isArray(db.contracts)){ db.contracts = []; }
  const existingIds = new Set(db.contracts.map(c => c.id));
  let mutated = false;
  for(const ct of defaultContracts()){
    if(!existingIds.has(ct.id)){
      db.contracts.push(normalizeContract({ ...ct }));
      mutated = true;
    }
  }
  return mutated;
}

function ensureSequenceDefaults(db){
  if(!Array.isArray(db.sequences)){ db.sequences = []; }
  const existingIds = new Set(db.sequences.map(s => s.id));
  let mutated = false;
  for(const seq of defaultSequences()){
    if(!existingIds.has(seq.id)){
      db.sequences.push({ ...seq });
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

app.put("/api/contracts/:id", async (req,res)=>{
  const id = (req.params?.id || "").trim();
  if(!id) return res.status(400).json({ ok:false, error:"id required" });
  const db = await loadLettersDB();
  db.contracts = db.contracts || [];
  const existing = db.contracts.find(c => c.id === id);
  if(!existing) return res.status(404).json({ ok:false, error:"contract not found" });
  const name = (req.body?.name || "").trim();
  const english = (req.body?.english || req.body?.body || "").trim();
  if(!name) return res.status(400).json({ ok:false, error:"name required" });
  if(!english) return res.status(400).json({ ok:false, error:"english body required" });
  existing.name = name;
  existing.english = english;
  existing.body = english;
  await saveLettersDB(db);
  res.json({ ok:true, contract: normalizeContract(existing) });
});

app.delete("/api/contracts/:id", async (req,res)=>{
  const id = (req.params?.id || "").trim();
  if(!id) return res.status(400).json({ ok:false, error:"id required" });
  const db = await loadLettersDB();
  db.contracts = db.contracts || [];
  const before = db.contracts.length;
  db.contracts = db.contracts.filter(c => c.id !== id);
  if(db.contracts.length === before) return res.status(404).json({ ok:false, error:"contract not found" });
  await saveLettersDB(db);
  res.json({ ok:true });
});

app.get("/api/contracts/:id", async (req,res)=>{
  const id = (req.params?.id || "").trim();
  if(!id) return res.status(400).json({ ok:false, error:"id required" });
  const db = await loadLettersDB();
  db.contracts = db.contracts || [];
  const contract = db.contracts.find(c => c.id === id);
  if(!contract) return res.status(404).json({ ok:false, error:"contract not found" });
  res.json({ ok:true, contract: normalizeContract(contract) });
});

app.post("/api/contracts/:id/send", authenticate, async (req,res)=>{
  const contractId = (req.params?.id || "").trim();
  const consumerId = (req.body?.consumerId || "").trim();
  if(!contractId) return res.status(400).json({ ok:false, error:"contract id required" });
  if(!consumerId) return res.status(400).json({ ok:false, error:"consumerId required" });
  const lettersDb = await loadLettersDB();
  lettersDb.contracts = lettersDb.contracts || [];
  const contract = lettersDb.contracts.find(c => c.id === contractId);
  if(!contract) return res.status(404).json({ ok:false, error:"contract not found" });
  const db = await loadDB();
  const consumer = db.consumers.find(c => c.id === consumerId);
  if(!consumer) return res.status(404).json({ ok:false, error:"consumer not found" });
  if(!Array.isArray(consumer.contractIds)) consumer.contractIds = [];
  if(!consumer.contractIds.includes(contractId)){
    consumer.contractIds.push(contractId);
    await saveDB(db);
  }
  const portalLink = `/portal/${encodeURIComponent(consumerId)}`;
  res.json({ ok:true, portalLink });
});

// Upload HTML/PDF -> analyze -> save under consumer
app.post("/api/consumers/:id/upload", upload.single("file"), async (req,res)=>{
  const db=await loadDB();
  const consumer = db.consumers.find(c=>c.id===req.params.id);
  if(!consumer) return res.status(404).json({ ok:false, error:"Consumer not found" });
  if(!req.file) return res.status(400).json({ ok:false, error:"No file uploaded" });

  const parseMode = normalizeParseMode(req.query?.parseMode);
  const errors = [];
  const sanitizedOriginalName = path.basename(req.file.originalname || "");
  const diagnostics = {
    llmTradelineCount: 0,
    llmViolationCount: 0,
    llmParseSource: null,
    llmError: null,
    llmAuditRawCount: 0,
    legacyAnalyzersEnabled: LEGACY_ANALYZERS_ENABLED,
    parseMode,
  };
  try{
    const isPdf = req.file.mimetype === "application/pdf" || /\.pdf$/i.test(sanitizedOriginalName || "");
    const htmlText = isPdf ? "" : req.file.buffer.toString("utf-8");
    let analyzed = { tradelines: [], status: "analyzing" };
    let llmResult = null;

    if (parseMode === "llm") {
      try {
        llmResult = await runLLMAnalyzer({
          buffer: req.file.buffer,
          filename: sanitizedOriginalName,
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
    } else {
      try {
        const pyResult = await runPythonAnalyzer({
          buffer: req.file.buffer,
          filename: sanitizedOriginalName,
        });
        const pyData = pyResult?.data || {};
        const personalInformation = pyData.personal_information || {};
        analyzed = {
          ...pyData,
          tradelines: mapAuditedViolations(pyData),
          personal_information: personalInformation,
          personalInfo: personalInformation,
          personal_info_mismatches: pyData.personal_mismatches || [],
          status: "analyzed",
        };
      } catch (e) {
        logError("PYTHON_ANALYZER_ERROR", "Python analyzer failed", e);
        analyzed.status = "analyzer_failed";
        errors.push({ step: "python_analyzer", message: e.message, details: e.stack || String(e) });
      }
    }

    if (!llmResult && LEGACY_ANALYZERS_ENABLED) {
      logWarn("LEGACY_ANALYZERS_SKIPPED", "LLM audit failed; legacy analyzers are disabled by default.");
    }

    try{
      let scoreText = "";
      if (isPdf) {
        scoreText = llmResult?.reportText || "";
        if (!scoreText) {
          const extracted = await extractReportText({ buffer: req.file.buffer, filename: sanitizedOriginalName });
          scoreText = extracted.text || "";
        }
      } else {
        scoreText = extractHtmlVisibleText(htmlText);
      }
      const extractedScores = extractCreditScores(scoreText);
      if (Object.keys(extractedScores).length) {
        consumer.creditScore = mergeCreditScores(consumer.creditScore, extractedScores);
        await setCreditScore(consumer.id, consumer.creditScore);
        try { await addEvent(consumer.id, "score_change", { scores: extractedScores }); } catch {}
      }
    }catch(e){
      logError("SCORE_EXTRACT_FAILED", "Failed to extract credit scores", e);
      errors.push({ step: "score_extract", message: e.message, details: e.stack || String(e) });
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
    const ext = (sanitizedOriginalName.match(/\.[a-z0-9]+$/i)||[""])[0] || "";
    const storedName = `${rid}${ext}`;
    const objectKey = objStore.consumerFileKey(consumer.id, storedName);
    await objStore.uploadFile(objectKey, req.file.buffer, req.file.mimetype || "application/octet-stream");
    await addFileMeta(consumer.id, {
      id: rid,
      originalName: sanitizedOriginalName,
      storedName,
      objectKey,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
      personalInfoMismatches: mismatches,
    });
    consumer.reports.unshift({
      id: rid,
      status: analyzed.status || "analyzed",
      uploadedAt: new Date().toISOString(),
      filename: sanitizedOriginalName,
      size: req.file.size,
      summary: {
        tradelines: analyzed?.tradelines?.length || 0,
        negative_items: analyzed?.negative_items?.length || analyzed?.tradelines?.length || 0,
        personalInfoMismatches: mismatches
      },
      data: analyzed
    });
    if (consumer.reports.length >= 2) {
      try {
        const previousReport = consumer.reports[1];
        if (previousReport?.data?.tradelines) {
          const diff = diffReports(previousReport.data, analyzed);
          consumer.reports[0].diff = diff;
          logInfo("REPORT_DIFF", `Report diff computed: ${diff.summary.deletedCount} deleted, ${diff.summary.addedCount} added, ${diff.summary.changedCount} changed`, { consumerId: consumer.id, reportId: rid, previousReportId: previousReport.id });
        }
      } catch (e) {
        logError("REPORT_DIFF_ERROR", "Failed to compute report diff", e, { consumerId: consumer.id, reportId: rid });
      }
    }
    await saveDB(db);
    await addEvent(consumer.id, "report_uploaded", {
      reportId: rid,
      filename: sanitizedOriginalName,
      size: req.file.size,
      ...(consumer.reports[0].diff?.summary || {}),
    });

    // file_review_required: emit when the uploaded report has disputable items
    const negCount = analyzed?.negative_items?.length || analyzed?.tradelines?.filter(t => (t.violations || []).length > 0).length || 0;
    if (negCount > 0) {
      try { await addEvent(consumer.id, "file_review_required", { reportId: rid, negativeItemCount: negCount }); } catch {}
    }

    try {
      const disputableItems = (analyzed.tradelines || [])
        .map((tl, idx) => {
          const violations = tl?.violations || [];
          if (!violations.length) return null;
          const bureaus = Object.keys(tl?.per_bureau || {});
          return {
            tradelineIndex: idx,
            creditor: tl?.meta?.creditor || tl?.creditor || "Unknown",
            bureaus,
            violationCount: violations.length,
            violations: violations.map(v => ({ field: v.field, description: v.description || v.reason, bureau: v.bureau })),
            accountType: tl?.meta?.accountType || tl?.account_type || null,
            accountStatus: tl?.meta?.accountStatus || tl?.account_status || null,
          };
        })
        .filter(Boolean);
      if (disputableItems.length) {
        const recommendations = disputableItems.map(item => {
          const rec = recommendFirstLetter({
            violations: item.violations || [],
            accountType: item.accountType || "",
            accountStatus: item.accountStatus || "",
          });
          return { tradelineIndex: item.tradelineIndex, creditor: item.creditor, ...rec };
        });
        await addEvent(consumer.id, "dispute_activated", {
          reportId: rid,
          totalDisputableItems: disputableItems.length,
          items: disputableItems,
          recommendations,
        });
      }
    } catch (e) {
      logError("DISPUTE_ACTIVATE_ERROR", "Failed to auto-activate dispute tracking", e, { consumerId: consumer.id, reportId: rid });
    }

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

  if (Array.isArray(r.data?.tradelines) && r.data.tradelines.length > 0) {
    const unknownCount = r.data.tradelines.filter(tl => !tl.meta?.creditor || tl.meta.creditor === "Unknown Creditor").length;
    const unknownRatio = unknownCount / r.data.tradelines.length;
    if (unknownRatio > 0.5) {
      try {
        let html = null;
        for (const ext of [".html", ".htm"]) {
          const key = objStore.consumerFileKey(c.id, `${r.id}${ext}`);
          try {
            const buf = await objStore.downloadFile(key);
            html = buf.toString("utf-8");
            break;
          } catch {}
        }
        if (!html) {
          const uploadsDir = consumerUploadsDir(c.id);
          for (const ext of [".html", ".htm"]) {
            const candidate = path.join(uploadsDir, `${r.id}${ext}`);
            if (fs.existsSync(candidate)) { html = await fs.promises.readFile(candidate, "utf-8"); break; }
          }
        }
        if (!html) {
          logWarn("CREDITOR_BACKFILL_SKIP", `No HTML file found for report ${r.id}`, { consumerId: c.id, reportId: r.id });
        }
        if (html) {
          const $ = cheerio.load(html);
          const parsed = metro2ParseReport($);
          if (parsed.tradelines && parsed.tradelines.length > 0) {
            const parsedCreditors = parsed.tradelines
              .map(pt => (pt.meta?.creditor || "").trim())
              .filter(c => c && c !== "Unknown Creditor");
            if (parsedCreditors.length > 0) {
              const matchCreditors = (stored, parsed) => {
                for (const st of stored) {
                  if (st.meta?.creditor && st.meta.creditor !== "Unknown Creditor") continue;
                  const stBureaus = Object.keys(st.per_bureau || {});
                  let bestMatch = null;
                  let bestScore = 0;
                  for (const pt of parsed) {
                    const ptBureaus = Object.keys(pt.per_bureau || {});
                    let score = 0;
                    for (const b of stBureaus) {
                      if (!pt.per_bureau?.[b]) continue;
                      const sd = st.per_bureau[b] || {};
                      const pd = pt.per_bureau[b] || {};
                      if (sd.account_number && pd.account_number && sd.account_number === pd.account_number) score += 10;
                      if (sd.account_status && pd.account_status && sd.account_status === pd.account_status) score += 2;
                      if (sd.date_opened && pd.date_opened && sd.date_opened === pd.date_opened) score += 3;
                      if (sd.balance_raw && pd.balance_raw && sd.balance_raw === pd.balance_raw) score += 1;
                      if (ptBureaus.includes(b)) score += 1;
                    }
                    if (score > bestScore) {
                      bestScore = score;
                      bestMatch = pt;
                    }
                  }
                  if (bestMatch && bestScore >= 3) {
                    st.meta = st.meta || {};
                    st.meta.creditor = bestMatch.meta?.creditor || st.meta.creditor;
                  }
                }
              };
              matchCreditors(r.data.tradelines, parsed.tradelines);
              const fixed = r.data.tradelines.filter(tl => tl.meta?.creditor && tl.meta.creditor !== "Unknown Creditor").length;
              if (fixed > 0) {
                await saveDB(db);
                logInfo("CREDITOR_BACKFILL", `Backfilled ${fixed}/${r.data.tradelines.length} creditor names`, { consumerId: c.id, reportId: r.id });
              }
            }
          }
        }
      } catch (e) {
        logWarn("CREDITOR_BACKFILL_ERROR", `Failed to backfill creditor names: ${e.message}`, { consumerId: c.id, reportId: r.id });
      }
    }
  }

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

app.get("/api/consumers/:id/report/:rid/diff", async (req, res) => {
  const db = await loadDB();
  const c = db.consumers.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: "Consumer not found" });
  const rIdx = c.reports.findIndex(x => x.id === req.params.rid);
  if (rIdx === -1) return res.status(404).json({ ok: false, error: "Report not found" });
  const r = c.reports[rIdx];
  if (r.diff) return res.json({ ok: true, diff: r.diff });
  const prevReport = c.reports[rIdx + 1];
  if (!prevReport?.data?.tradelines) {
    return res.json({ ok: true, diff: null, reason: "No previous report to compare against" });
  }
  try {
    const diff = diffReports(prevReport.data, r.data);
    r.diff = diff;
    await saveDB(db);
    res.json({ ok: true, diff });
  } catch (e) {
    logError("REPORT_DIFF_ERROR", "Failed to compute report diff on demand", e, { consumerId: c.id, reportId: r.id });
    res.status(500).json({ ok: false, error: "Failed to compute diff" });
  }
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
  const apiKey = process.env.HIBP_API_KEY || (await loadSettings()).hibpApiKey;
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

function renderBreachAuditHtml(consumer) {
  const allBreaches = Array.isArray(consumer.breaches) ? consumer.breaches : [];
  const details = Array.isArray(consumer.breachDetails) ? consumer.breachDetails : [];
  const selectedBreaches = Array.isArray(consumer.breachSelections) && consumer.breachSelections.length
    ? consumer.breachSelections
    : allBreaches;
  const notes = escapeHtml(consumer.breachEvidenceNotes || "");
  const files = Array.isArray(consumer.breachEvidenceFiles) ? consumer.breachEvidenceFiles : [];
  const filesList = files.length
    ? files.map(file => {
      const name = escapeHtml(file.name || file.originalName || "Evidence file");
      const url = escapeHtml(file.url || "#");
      const date = file.uploadedAt ? ` (${escapeHtml(new Date(file.uploadedAt).toLocaleString())})` : "";
      return `<li><a href="${url}" target="_blank">${name}</a>${date}</li>`;
    }).join("")
    : "";
  const dateStr = new Date().toLocaleString();
  const evidenceSection = notes || filesList
    ? `<h2 style="color:#1a1a2e;border-bottom:2px solid #d4a853;padding-bottom:6px;">Supporting Evidence</h2>${notes ? `<p>${notes}</p>` : ""}${filesList ? `<ul>${filesList}</ul>` : ""}`
    : "";

  let breachListHtml = "";
  if (selectedBreaches.length) {
    breachListHtml = selectedBreaches.map(bName => {
      const detail = details.find(d => d.name === bName);
      if (detail && (detail.breachDate || detail.dataClasses?.length)) {
        const classes = Array.isArray(detail.dataClasses) ? detail.dataClasses : [];
        const dataTags = classes.length
          ? classes.map(d => {
              const cls = escapeHtml(d);
              const sensitive = /password|social|ssn|credit|financial|security.question|phone/i.test(d);
              const bg = sensitive ? "#fde8e8" : "#eef2ff";
              const border = sensitive ? "#f5c6c6" : "#c8d6f0";
              const color = sensitive ? "#991b1b" : "#3730a3";
              return `<span style="display:inline-block;padding:3px 10px;margin:3px 4px 3px 0;border-radius:20px;font-size:11px;font-weight:600;background:${bg};border:1px solid ${border};color:${color};">${cls}</span>`;
            }).join("")
          : '<span style="display:inline-block;padding:3px 10px;margin:3px 4px 3px 0;border-radius:20px;font-size:11px;font-weight:600;background:#f5f5f5;border:1px solid #ddd;color:#666;">Unknown</span>';
        const affected = detail.pwnCount ? detail.pwnCount.toLocaleString() : "Unknown";
        return `<div style="background:#f8f4ee;border:1px solid #e8dcc8;border-radius:8px;padding:16px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;">
            <div style="font-weight:700;font-size:15px;color:#1a1a2e;">${escapeHtml(bName)}</div>
            ${detail.breachDate ? `<div style="font-size:11px;color:#888;white-space:nowrap;">${escapeHtml(detail.breachDate)}</div>` : ""}
          </div>
          <div style="font-size:11px;color:#666;margin-top:2px;">${affected} accounts affected</div>
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid #e8dcc8;">
            <div style="font-size:11px;font-weight:700;color:#1a1a2e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Data Exposed</div>
            <div style="line-height:1.8;">${dataTags}</div>
          </div>
          ${detail.description ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #e0d6c4;font-size:11px;color:#777;line-height:1.5;">${escapeHtml(detail.description)}</div>` : ""}
        </div>`;
      }
      return `<div style="background:#f8f4ee;border:1px solid #e8dcc8;border-radius:8px;padding:16px;margin-bottom:12px;">
        <div style="font-weight:700;font-size:15px;color:#1a1a2e;">${escapeHtml(bName)}</div>
        <div style="font-size:12px;color:#666;margin-top:4px;">Data breach exposure confirmed</div>
      </div>`;
    }).join("");
  } else {
    breachListHtml = `<p style="color:#666;">No breaches found for this email address.</p>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 30px; color: #1a1a2e; line-height: 1.6; }
  h1 { text-align: center; color: #1a1a2e; font-size: 22px; margin-bottom: 4px; }
  h2 { color: #1a1a2e; font-size: 16px; margin-top: 24px; border-bottom: 2px solid #d4a853; padding-bottom: 6px; }
  .subtitle { text-align: center; color: #666; font-size: 13px; margin-bottom: 24px; }
  .info-box { background: #f0f4ff; border: 1px solid #c8d6f0; border-radius: 8px; padding: 16px; margin: 16px 0; font-size: 13px; }
  .strategy-box { background: #f0faf0; border: 1px solid #b8ddb8; border-radius: 8px; padding: 16px; margin: 16px 0; font-size: 13px; }
  .strategy-box ul { margin: 8px 0 0 0; padding-left: 20px; }
  .strategy-box li { margin-bottom: 6px; }
  footer { margin-top: 30px; border-top: 1px solid #ddd; padding-top: 12px; font-size: 11px; color: #888; }
</style></head><body>
<h1>Credit Repair Audit</h1>
<div class="subtitle">Data Breach Analysis for ${escapeHtml(consumer.name || "Consumer")}</div>

<h2>What Is a Data Breach?</h2>
<div class="info-box">
  <p style="margin:0 0 8px 0;">A <strong>data breach</strong> occurs when sensitive personal information — such as names, Social Security numbers, dates of birth, account numbers, or financial records — is accessed, stolen, or exposed without authorization. When a consumer's data is compromised in a breach, the accuracy and integrity of their credit file may be affected.</p>
  <p style="margin:0;">Under the <strong>Fair Credit Reporting Act (FCRA)</strong>, credit bureaus and data furnishers are required to report only accurate information. If a consumer's personal data was exposed in a breach, any account information linked to that compromised data may be inaccurate, unverifiable, or the result of identity theft — all of which are valid grounds for dispute.</p>
</div>

<h2>Breach Findings</h2>
<p><strong>Email Analyzed:</strong> ${escapeHtml(consumer.email || "N/A")}</p>
<p><strong>Breaches Found:</strong> ${selectedBreaches.length}</p>
${breachListHtml}

<h2>How to Use Breach Data in Disputes</h2>
<div class="strategy-box">
  <p style="margin:0 0 8px 0;"><strong>Dispute Strategy:</strong> Data breach exposure provides strong grounds to challenge the accuracy of reported information on a consumer's credit file. Here is how to leverage these findings:</p>
  <ul>
    <li><strong>Question Data Accuracy:</strong> If a creditor or bureau was involved in a breach, the consumer's account data may have been altered, corrupted, or fabricated. Dispute the accuracy of account details (balances, dates, account numbers) citing the breach.</li>
    <li><strong>Request Method of Verification:</strong> Under FCRA Section 611, demand that the bureau explain exactly how they verified the disputed information, especially given known data compromise. Breached data cannot be reliably used for verification.</li>
    <li><strong>Identity Theft Angle:</strong> If personal identifiers (SSN, DOB, addresses) were exposed, any unfamiliar or suspicious accounts may be the result of identity theft. File an identity theft dispute with an FTC affidavit referencing the specific breach.</li>
    <li><strong>Heightened Scrutiny Argument:</strong> Courts have held that bureaus must use "reasonable procedures" to ensure accuracy (FCRA Section 607). When a consumer's data has been compromised, the standard of reasonable verification is higher.</li>
    <li><strong>Reference in Dispute Letters:</strong> Include the breach name, date, and types of data exposed in your dispute letter. This creates a documented paper trail showing the bureau was put on notice that the consumer's data integrity is compromised.</li>
  </ul>
</div>

${evidenceSection}

<footer>
  <div>Generated ${escapeHtml(dateStr)}</div>
  <div style="margin-top:4px;">This report is for informational purposes and should be used in conjunction with professional credit repair guidance. Data breach information sourced from Have I Been Pwned (haveibeenpwned.com).</div>
</footer>
</body></html>`;
}

async function handleDataBreach(email, consumerId, res) {
  const result = await hibpLookup(email);
  if (result.ok && consumerId) {
    try {
      const db = await loadDB();
      const c = db.consumers.find(x => x.id === consumerId);
      if (c) {
        c.breaches = (result.breaches || []).map(b => b.Name || b.name || "");
        c.breachDetails = (result.breaches || []).map(b => ({
          name: b.Name || b.name || "",
          domain: b.Domain || b.domain || "",
          breachDate: b.BreachDate || b.breachDate || "",
          description: (b.Description || b.description || "").replace(/<[^>]+>/g, ""),
          dataClasses: b.DataClasses || b.dataClasses || [],
          pwnCount: b.PwnCount || b.pwnCount || 0,
        }));
        await saveDB(db);
        await addEvent(consumerId, "breach_lookup", { count: c.breaches.length, email });
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
    const id = nanoid(10);
    const storedName = `${id}${ext}`;
    const objectKey = objStore.consumerFileKey(consumer.id, storedName);
    const safe = (consumer.name || "client").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const date = new Date().toISOString().slice(0, 10);
    const originalName = `${safe}_${date}_breach_audit${ext}`;
    const pdfBuf = fs.readFileSync(result.path);
    await objStore.uploadFile(objectKey, pdfBuf, mime);
    await addFileMeta(consumer.id, {
      id,
      originalName,
      storedName,
      objectKey,
      type: "breach-audit",
      size: pdfBuf.length,
      mimetype: mime,
      uploadedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to store breach audit file", err);
  }
  const allBreaches = Array.isArray(consumer.breaches) ? consumer.breaches : [];
  const selectedBreaches = Array.isArray(consumer.breachSelections) && consumer.breachSelections.length
    ? consumer.breachSelections
    : allBreaches;
  await addEvent(consumer.id, "breach_audit_generated", {
    file: result.url,
    count: allBreaches.length,
    selected: selectedBreaches.length,
  });
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
function putJobMem(jobId, letters, enclosures){ jobs.set(jobId,{ letters, enclosures: enclosures || [], createdAt: Date.now() }); }
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
  const letters = [];
  for (const item of disk.letters) {
    const fname = item.filename || path.basename(item.htmlPath);
    const html = await loadLetterHtml(jobId, fname) || "<html><body>Letter unavailable.</body></html>";
    letters.push({ ...item, html });
  }
  putJobMem(jobId, letters, disk.enclosures);
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
async function persistJobToDisk(jobId, letters, enclosures){
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
    })),
    enclosures: (enclosures || []).map(e => ({
      type: e.type,
      storedName: e.storedName,
      originalName: e.originalName,
      mimetype: e.mimetype,
      label: e.label,
    })),
  };
  await saveJobsIndex(idx);
  console.log(`Job ${jobId} saved to index`);
}

async function loadLetterHtml(jobId, filename) {
  const key = objStore.letterFileKey(jobId, filename);
  try {
    const buf = await objStore.downloadFile(key);
    return buf.toString("utf-8");
  } catch {
    const localPath = path.join(LETTERS_DIR, jobId, filename);
    if (fs.existsSync(localPath)) return fs.readFileSync(localPath, "utf-8");
    return null;
  }
}

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
    objectKey: objStore.letterFileKey(jobId, item.filename),
    htmlPath: path.join(LETTERS_DIR, jobDir, item.filename),
  }));
  console.log(`Loaded job ${jobId} with ${letters.length} letters from disk`);
  return { letters, enclosures: meta.enclosures || [], createdAt: meta.createdAt || Date.now(), dir: jobDir };
}

async function deleteJob(jobId){
  jobs.delete(jobId);
  const idx = await loadJobsIndex();
  const meta = idx.jobs?.[jobId];
  if(meta){
    for (const item of (meta.letters || [])) {
      try { await objStore.deleteFile(objStore.letterFileKey(jobId, item.filename)); } catch {}
    }
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
      console.log(`[generate] TL#${sel.tradelineIndex} specificDisputeReason=${JSON.stringify(sel.specificDisputeReason || null)}, specialMode=${sel.specialMode || 'none'}, violationIdxs=${JSON.stringify(sel.violationIdxs || [])}`);

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

    let previousDisputeDate = null;
    let priorDates = [];
    try {
      const cstate = await listConsumerState(consumer.id);
      const genEvents = (cstate?.events || []).filter(e => e.type === 'letters_generated').sort((a, b) => {
        const ta = new Date(a.payload?.generatedAt || a.at || a.timestamp || 0).getTime();
        const tb = new Date(b.payload?.generatedAt || b.at || b.timestamp || 0).getTime();
        return ta - tb;
      });
      priorDates = genEvents.map(e => {
        const ts = e.payload?.generatedAt || e.at || e.timestamp;
        return ts ? new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
      }).filter(Boolean);
      if (priorDates.length) previousDisputeDate = priorDates[priorDates.length - 1];
    } catch {}

    const cstateForFiles = await listConsumerState(consumer.id);
    const consumerFiles = cstateForFiles?.files || [];
    const enclosureFiles = consumerFiles.filter(f =>
      f.type === 'id' || f.type === 'residency'
    );
    const enclosures = enclosureFiles.map(f => ({
      label: f.type === 'id' ? 'Copy of government-issued photo ID' : 'Proof of current residency',
      type: f.type,
      storedName: f.storedName,
      originalName: f.originalName,
      mimetype: f.mimetype,
    }));

    const letters = generateLetters({
      report: reportWrap.data,
      selections: normalizedSelections,
      consumer: consumerForLetter,
      requestType,
      templates: lettersDb.templates || [],
      playbooks,
      previousDisputeDate,
      priorDates,
      enclosures,
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

    for (let li = 0; li < letters.length; li++) {
      const L = letters[li];
      const lKey = objStore.letterFileKey(jobId, L.filename);
      let uploaded = false;
      for (let attempt = 0; attempt < 4 && !uploaded; attempt++) {
        try {
          await objStore.uploadFile(lKey, Buffer.from(L.html, "utf-8"), "text/html");
          uploaded = true;
        } catch (uploadErr) {
          const isRateLimit = /rate.?limit|429|too many/i.test(String(uploadErr?.message || uploadErr));
          if (isRateLimit && attempt < 3) {
            const delay = (attempt + 1) * 1000;
            await new Promise(r => setTimeout(r, delay));
          } else {
            throw uploadErr;
          }
        }
      }
      if (li > 0 && li % 10 === 0) await new Promise(r => setTimeout(r, 200));
    }

    const requestUserId = userId || "guest";
    putJobMem(jobId, letters, enclosures);
    await persistJobToDisk(jobId, letters, enclosures);
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

    try {
      const consumerState = await listConsumerState(consumer.id);
      const previousRounds = (consumerState.events || []).filter(e => e.type === "dispute_round");
      const roundNumber = previousRounds.length + 1;

      const firstTemplateId = normalizedSelections[0]?.templateId || null;
      const followUpDays = getResponseWindowDays(firstTemplateId);
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + followUpDays);

      function resolveCreditorName(L) {
        let name = L.creditor || L.creditorName || null;
        if (!name || name === L.bureau || name === "Unknown") {
          const tl = reportWrap?.data?.tradelines?.[L.tradelineIndex];
          if (tl) {
            name = tl.meta?.creditor || tl.creditor || name;
          }
        }
        return name || "Unknown";
      }
      function resolveAccountNumber(L) {
        const tl = reportWrap?.data?.tradelines?.[L.tradelineIndex];
        if (!tl) return null;
        const accts = [];
        for (const [, bd] of Object.entries(tl.per_bureau || {})) {
          const acct = bd.account_number || bd.accountNumber || bd["Account Number"] || null;
          if (acct) accts.push(acct);
        }
        if (accts.length) {
          const raw = accts[0].replace(/[^0-9A-Za-z]/g, "");
          return raw.length > 4 ? "••••" + raw.slice(-4) : raw;
        }
        return null;
      }

      const now = new Date();
      const roundItems = letters.map(L => {
        const itemFollowUpDays = getResponseWindowDays(L.templateId);
        const itemFollowUpDate = new Date(now);
        itemFollowUpDate.setDate(itemFollowUpDate.getDate() + itemFollowUpDays);
        const tl = reportWrap?.data?.tradelines?.[L.tradelineIndex];
        const itemViolations = (tl?.violations || []).map(v => ({
          title: v.title || v.category || '',
          detail: v.detail || '',
          code: v.code || '',
          rule: v.rule || '',
        })).slice(0, 10);
        const accountType = tl?.meta?.account_type || tl?.meta?.accountType || '';
        const accountStatus = tl?.meta?.account_status || tl?.meta?.accountStatus || '';
        return {
          creditor: resolveCreditorName(L),
          bureau: L.bureau || null,
          letterType: L.templateId || L.filename || null,
          tradelineIndex: L.tradelineIndex ?? null,
          accountNumber: resolveAccountNumber(L),
          specificDisputeReason: L.specificDisputeReason || null,
          violations: itemViolations,
          accountType,
          accountStatus,
          followUpDays: itemFollowUpDays,
          followUpDate: itemFollowUpDate.toISOString(),
          status: "awaiting",
        };
      });

      const maxFollowUpDays = Math.max(...roundItems.map(i => i.followUpDays), followUpDays);
      const maxFollowUpDate = new Date(now);
      maxFollowUpDate.setDate(maxFollowUpDate.getDate() + maxFollowUpDays);

      await addEvent(consumer.id, "dispute_round", {
        jobId,
        round: roundNumber,
        requestType: jobRequestType,
        letters: letters.map(L => ({
          bureau: L.bureau || null,
          creditor: resolveCreditorName(L),
          letterType: L.templateId || null,
          tradelineIndex: L.tradelineIndex ?? null,
          filename: L.filename,
          accountNumber: resolveAccountNumber(L),
        })),
        sentAt: now.toISOString(),
        followUpDays: maxFollowUpDays,
        followUpDate: maxFollowUpDate.toISOString(),
        status: "awaiting_response",
        items: roundItems,
      });

      const followUpReminderId = `dispute_followup_${jobId}_${Date.now()}`;
      await addReminder(consumer.id, {
        id: followUpReminderId,
        due: followUpDate.toISOString(),
        payload: {
          type: "dispute_followup",
          jobId,
          round: roundNumber,
          followUpDays,
          itemCount: roundItems.length,
        },
      });
    } catch (e) {
      logError("DISPUTE_ROUND_ERROR", "Failed to create dispute round tracking", e, { consumerId: consumer.id, jobId });
    }

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

      const enclosureList = letterData.enclosures || [];
      if (enclosureList.length && meta?.consumerId) {
        const addedTypes = new Set();
        for (const enc of enclosureList) {
          if (addedTypes.has(enc.type)) continue;
          try {
            const encKey = objStore.consumerFileKey(meta.consumerId, enc.storedName);
            const encBuf = await objStore.downloadFile(encKey);
            const ext = path.extname(enc.originalName || enc.storedName) || '.pdf';
            const encName = enc.type === 'id' ? `supporting_photo_id${ext}` : `supporting_proof_of_residency${ext}`;
            archive.append(encBuf, { name: encName });
            addedTypes.add(enc.type);
          } catch (encErr) {
            logWarn("ENCLOSURE_APPEND_SKIPPED", `Could not attach ${enc.type} document`, { consumerId: meta.consumerId, storedName: enc.storedName, error: encErr?.message });
          }
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
          const id = nanoid(10);
          const storedName = `${id}.zip`;
          const objectKey = objStore.consumerFileKey(consumer.id, storedName);
          const safe = (consumer.name || "client").toLowerCase().replace(/[^a-z0-9]+/g, "_");
          const date = new Date().toISOString().slice(0, 10);
          const originalName = `${safe}_${date}_letters.zip`;
          const zipBuf = fs.readFileSync(zipPath);
          await objStore.uploadFile(objectKey, zipBuf, "application/zip");
          await addFileMeta(consumer.id, {
            id,
            originalName,
            storedName,
            objectKey,
            type: "letters_zip",
            size: zipBuf.length,
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
      const id = nanoid(10);
      const storedName = `${id}${ext}`;
      const objectKey = objStore.consumerFileKey(consumer.id, storedName);
      const safe = (consumer.name || "client").toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const date = new Date().toISOString().slice(0, 10);
      const originalName = `${safe}_${date}_audit${ext}`;
      const pdfBuf = fs.readFileSync(pdfResult.path);
      await objStore.uploadFile(objectKey, pdfBuf, mime);
      await addFileMeta(consumer.id, {
        id,
        originalName,
        storedName,
        objectKey,
        type: "audit",
        size: pdfBuf.length,
        mimetype: mime,
        uploadedAt: new Date().toISOString(),
      });
      storedRecord = {
        storedName,
        originalName,
        url: `/api/consumers/${consumer.id}/state/files/${storedName}`,
        size: pdfBuf.length,
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
        validation: preflight.context.validation,
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
  const consumerId = req.query.consumerId || null;
  try{
    deleteJob(jobId);
    const ldb = await loadLettersDB();
    const userId = req.user?.id || "guest";
    ldb.jobs = ldb.jobs.filter(j => !(j.jobId === jobId && j.userId === userId));
    await saveLettersDB(ldb);

    if (consumerId) {
      const st = await listConsumerState(consumerId);
      if (st) {
        const portalEvents = (st.events || []).filter(
          e => e.type === 'letters_portal_sent' && e.payload?.jobId === jobId
        );
        const storedNames = new Set();
        for (const ev of portalEvents) {
          const file = ev.payload?.file || '';
          const m = file.match(/\/([^/]+)$/);
          if (m) storedNames.add(m[1]);
        }

        if (storedNames.size) {
          for (const sn of storedNames) {
            try { await objStore.deleteFile(objStore.consumerFileKey(consumerId, sn)); } catch {}
            try { fs.unlinkSync(path.join(consumerUploadsDir(consumerId), sn)); } catch {}
          }
          await removeFileMetaByMatch(consumerId, f => storedNames.has(f.storedName));
        }

        await removeEventsByMatch(consumerId, 'letters_portal_sent', e => e.payload?.jobId === jobId);
        await removeEventsByMatch(consumerId, 'dispute_round', e => e.payload?.jobId === jobId);

        const reminderSt = await listConsumerState(consumerId);
        if (reminderSt?.reminders?.length) {
          for (const r of reminderSt.reminders) {
            if (r.jobId === jobId || r.payload?.jobId === jobId) {
              await removeReminder(consumerId, r.id);
            }
          }
        }
      }
    }

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
      jobStatus: jobRecord.status,
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
    return res.status(202).json({ ok:false, jobStatus: jobRecord.status });
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
    return res.status(202).json({ ok:false, jobStatus: jobRecord.status });
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
  let html = L.html || await loadLetterHtml(jobId, L.filename);
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

  const zipChunks = [];
  if(consumer){
    const pass = new PassThrough();
    archive.pipe(pass);
    pass.pipe(res);

    id = nanoid(10);
    storedName = `${id}.zip`;
    const safe = (consumer.name || 'client').toLowerCase().replace(/[^a-z0-9]+/g,'_');
    const date = new Date().toISOString().slice(0,10);
    originalName = `${safe}_${date}_letters.zip`;
    pass.on('data', chunk => zipChunks.push(chunk));
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

      const htmlSource = L.html || await loadLetterHtml(jobId, L.filename) || '';
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

    if(consumer && zipChunks.length){
      try{
        let zipRoundNumber = 0;
        try {
          const cstate = await listConsumerState(consumer.id);
          const roundEvt = (cstate.events || []).find(e => e.type === 'dispute_round' && e.payload?.jobId === jobId);
          if (roundEvt) zipRoundNumber = roundEvt.payload.round || 0;
        } catch {}
        const zipBuf = Buffer.concat(zipChunks);
        const objectKey = objStore.consumerFileKey(consumer.id, storedName);
        await objStore.uploadFile(objectKey, zipBuf, "application/zip");
        await addFileMeta(consumer.id, {
          id,
          originalName,
          storedName,
          objectKey,
          type: 'letters_zip',
          size: zipBuf.length,
          mimetype: 'application/zip',
          uploadedAt: new Date().toISOString(),
          jobId: jobId,
          round: zipRoundNumber || null,
        });
        await addEvent(consumer.id, 'letters_downloaded', { jobId, file: `/api/consumers/${consumer.id}/state/files/${storedName}`, round: zipRoundNumber || null });
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
  let filePath;
  const objectKey = objStore.consumerFileKey(consumerId, file);
  try {
    const buf = await objStore.downloadFile(objectKey);
    const tmpPath = path.join(os.tmpdir(), `mail_${nanoid(8)}_${file}`);
    fs.writeFileSync(tmpPath, buf);
    filePath = tmpPath;
  } catch {
    filePath = path.join(consumerUploadsDir(consumerId), file);
  }
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
    try { await addEvent(consumerId, 'dispute_submitted', { name: consumer?.name, jobId, provider: 'simplecertifiedmail' }); } catch {}
    try { await addEvent(consumerId, 'signature_requested', { name: consumer?.name, jobId, documentType: 'dispute_letter', provider: 'simplecertifiedmail' }); } catch {}
    res.json({ ok:true });
    logInfo('SCM_MAIL_SUCCESS', 'Sent letter via SimpleCertifiedMail', { jobId, consumerId, file });
  }catch(e){
    logError('SCM_MAIL_FAILED', 'Failed to mail via SimpleCertifiedMail', e, { jobId, consumerId, file });
    res.status(500).json({ ok:false, errorCode:'SCM_MAIL_FAILED', message:String(e) });
  }finally{
    if(filePath && filePath.startsWith(os.tmpdir())) try{ fs.unlinkSync(filePath); }catch{}
  }
});

app.post("/api/portal/:consumerId/mail", async (req,res)=>{
  const { consumerId } = req.params;
  const jobId = String(req.body?.jobId || "").trim();
  const file = String(req.body?.file || "").trim();
  if(!consumerId) return res.status(400).json({ ok:false, error:"consumerId required" });
  if(!jobId) return res.status(400).json({ ok:false, error:"jobId required" });
  if(!file) return res.status(400).json({ ok:false, error:"file required" });
  const db = await loadDB();
  const consumer = db.consumers.find(c=>c.id===consumerId);
  if(!consumer) return res.status(404).json({ ok:false, error:"Consumer not found" });

  const cstate = await listConsumerState(consumerId);
  const ev = cstate.events.find(e=>e.type==='letters_portal_sent' && e.payload?.jobId===jobId && e.payload?.file?.endsWith(`/state/files/${file}`));
  if(!ev) return res.status(404).json({ ok:false, error:"Letter not found" });
  let filePath;
  const portalObjKey = objStore.consumerFileKey(consumerId, file);
  try {
    const buf = await objStore.downloadFile(portalObjKey);
    const tmpPath = path.join(os.tmpdir(), `mail_${nanoid(8)}_${file}`);
    fs.writeFileSync(tmpPath, buf);
    filePath = tmpPath;
  } catch {
    filePath = path.join(consumerUploadsDir(consumerId), file);
  }
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
    try { await addEvent(consumerId, 'dispute_submitted', { name: consumer?.name, jobId, provider: 'simplecertifiedmail' }); } catch {}
    try { await addEvent(consumerId, 'signature_requested', { name: consumer?.name, jobId, documentType: 'dispute_letter', provider: 'simplecertifiedmail' }); } catch {}
    res.json({ ok:true });
    logInfo('SCM_MAIL_SUCCESS', 'Sent letter via SimpleCertifiedMail (portal)', { jobId, consumerId, file });
  }catch(e){
    logError('SCM_MAIL_FAILED', 'Failed to mail via SimpleCertifiedMail (portal)', e, { jobId, consumerId, file });
    res.status(500).json({ ok:false, errorCode:'SCM_MAIL_FAILED', message:String(e) });
  }finally{
    if(filePath && filePath.startsWith(os.tmpdir())) try{ fs.unlinkSync(filePath); }catch{}
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
      const html = L.html || await loadLetterHtml(jobId, L.filename) || "";

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
  let browserAvailable = false;
  try{
    logInfo('PORTAL_UPLOAD_START', 'Building portal letters', { jobId, consumerId: consumer.id });

    let roundNumber = 0;
    try {
      const cstate = await listConsumerState(consumer.id);
      const roundEvt = (cstate.events || []).find(e => e.type === 'dispute_round' && e.payload?.jobId === jobId);
      if (roundEvt) roundNumber = roundEvt.payload.round || 0;
    } catch {}

    if (needsBrowser) {
      try {
        browserInstance = await launchBrowser();
        browserAvailable = true;
      } catch (browserErr) {
        logInfo('PORTAL_BROWSER_FALLBACK', 'Chrome not available, falling back to OCR PDF generation', { error: browserErr.message });
      }
    }

    const safe = (consumer.name || 'client').toLowerCase().replace(/[^a-z0-9]+/g,'_');
    const date = new Date().toISOString().slice(0,10);

    for(let i=0;i<job.letters.length;i++){
      const L = job.letters[i];
      const html = L.html || await loadLetterHtml(jobId, L.filename) || '';

      let pdfBuffer;
      if (L.useOcr || !browserAvailable) {
        pdfBuffer = await generateOcrPdf(html, { allowBrowserLaunch: false });
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
      const roundTag = roundNumber ? `round${roundNumber}_` : '';
      const originalName = `${safe}_${date}_${roundTag}${base}.pdf`;
      const objectKey = objStore.consumerFileKey(consumer.id, storedName);
      for (let attempt = 0; ; attempt++) {
        try {
          await objStore.uploadFile(objectKey, pdfBuffer, "application/pdf");
          break;
        } catch (uploadErr) {
          const isRateLimit = /rate.?limit|429|too many/i.test(String(uploadErr?.message || uploadErr));
          if (isRateLimit && attempt < 3) {
            await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
          } else { throw uploadErr; }
        }
      }
      if (i > 0 && i % 10 === 0) await new Promise(r => setTimeout(r, 200));
      await addFileMeta(consumer.id, {
        id,
        originalName,
        storedName,
        objectKey,
        type: 'letter_pdf',
        size: pdfBuffer.length,
        mimetype: 'application/pdf',
        uploadedAt: new Date().toISOString(),
        jobId: jobId,
        round: roundNumber || null,
      });
      await addEvent(consumer.id, 'letters_portal_sent', { jobId, file: `/api/consumers/${consumer.id}/state/files/${storedName}`, round: roundNumber || null });
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

  const id = nanoid(10);
  const sanitizedOriginalName = path.basename(req.file.originalname || "");
  const ext = (sanitizedOriginalName.match(/\.[a-z0-9]+$/i)||[""])[0] || "";
  const type = (req.body.type || '').toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'doc';
  const safeName = (consumer.name || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const date = new Date().toISOString().slice(0,10);
  const storedName = `${id}${ext}`;
  const originalName = `${safeName}_${date}_${type}${ext}`;
  const objectKey = objStore.consumerFileKey(consumer.id, storedName);
  await objStore.uploadFile(objectKey, req.file.buffer, req.file.mimetype || "application/octet-stream");

  const rec = {
    id,
    originalName,
    storedName,
    objectKey,
    type,
    size: req.file.size,
    mimetype: req.file.mimetype,
    uploadedAt: new Date().toISOString()
  };
  await addFileMeta(consumer.id, rec);
  await addEvent(consumer.id, "file_uploaded", { id, name: originalName, size: req.file.size });

  res.json({ ok:true, file: { ...rec, url: `/api/consumers/${consumer.id}/state/files/${storedName}` } });
});

app.get("/api/consumers/:id/state/files/:stored", async (req,res)=>{
  const stored = path.basename(req.params.stored);
  const objectKey = objStore.consumerFileKey(req.params.id, stored);
  const served = await objStore.streamToResponse(objectKey, res);
  if (!served) {
    const localDir = consumerUploadsDir(req.params.id);
    const localPath = path.join(localDir, stored);
    if (fs.existsSync(localPath)) return res.sendFile(localPath);
    return res.status(404).send("File not found");
  }
});

app.delete("/api/consumers/:id/state/files/:stored", authenticate, async (req, res) => {
  try {
    const consumerId = req.params.id;
    const stored = path.basename(req.params.stored);
    const db = await loadDB();
    const consumer = db.consumers.find(c => c.id === consumerId);
    if (!consumer) return res.status(404).json({ ok: false, error: "Consumer not found" });
    const cstate = await listConsumerState(consumerId);
    const fileRec = (cstate.files || []).find(f => f.storedName === stored);
    if (!fileRec) return res.status(404).json({ ok: false, error: "File not found" });
    const objectKey = fileRec.objectKey || objStore.consumerFileKey(consumerId, stored);
    try { await objStore.deleteFile(objectKey); } catch (_) {}
    try {
      const localPath = path.join(consumerUploadsDir(consumerId), stored);
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    } catch (_) {}
    await removeFileMetaByMatch(consumerId, f => f.storedName === stored);
    await addEvent(consumerId, "file_deleted", { name: fileRec.originalName, type: fileRec.type });
    res.json({ ok: true });
  } catch (e) {
    logError("FILE_DELETE_ERROR", "Failed to delete consumer file", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================================
// DISPUTE TRACKER ENDPOINTS (IntelliFeats)
// ============================================================================

app.get("/api/consumers/:id/disputes", authenticate, async (req, res) => {
  try {
    const consumerId = req.params.id;
    const state = await listConsumerState(consumerId);
    const events = state.events || [];

    const activated = events.filter(e => e.type === "dispute_activated");
    const rounds = events
      .filter(e => e.type === "dispute_round")
      .map(e => {
        const responses = events.filter(r => r.type === "dispute_response" && r.payload?.jobId === e.payload?.jobId);
        const recommendations = events.filter(r => r.type === "dispute_recommendation" && r.payload?.jobId === e.payload?.jobId);
        const items = (e.payload?.items || []).map(item => {
          const resp = responses.find(r =>
            r.payload?.items?.some(ri => matchCreditorBureau(ri, item))
          );
          const respItem = resp?.payload?.items?.find(ri => matchCreditorBureau(ri, item));
          const rec = recommendations.find(r => matchCreditorBureau(r.payload || {}, item));
          return {
            ...item,
            outcome: respItem?.outcome || item.status,
            notes: respItem?.notes || null,
            evidenceFiles: respItem?.evidenceFiles || [],
            recommendation: rec?.payload || null,
          };
        });
        return {
          jobId: e.payload?.jobId,
          round: e.payload?.round,
          requestType: e.payload?.requestType,
          sentAt: e.payload?.sentAt,
          followUpDays: e.payload?.followUpDays,
          followUpDate: e.payload?.followUpDate,
          status: e.payload?.status,
          letters: e.payload?.letters || [],
          items,
          createdAt: e.at,
        };
      });

    const pendingFollowups = (state.reminders || []).filter(r => r.payload?.type === "dispute_followup");

    res.json({ ok: true, activated, rounds, pendingFollowups });
  } catch (e) {
    logError("DISPUTE_LIST_ERROR", "Failed to list disputes", e, { consumerId: req.params.id });
    res.status(500).json({ ok: false, error: "Failed to load dispute data" });
  }
});

app.put("/api/consumers/:id/disputes/:jobId/settings", authenticate, async (req, res) => {
  try {
    const { id: consumerId, jobId } = req.params;
    const { followUpDays, itemIndex, sentAt: sentAtInput } = req.body || {};

    if (sentAtInput) {
      const parts = String(sentAtInput).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!parts) {
        return res.status(400).json({ ok: false, error: "Invalid sentAt date format (expected YYYY-MM-DD)" });
      }
      const newSentAt = new Date(Date.UTC(parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]), 12, 0, 0));
      if (isNaN(newSentAt.getTime())) {
        return res.status(400).json({ ok: false, error: "Invalid sentAt date" });
      }
      const state = await listConsumerState(consumerId);
      const roundEvent = (state.events || []).find(e => e.type === "dispute_round" && e.payload?.jobId === jobId);
      if (!roundEvent) {
        return res.status(404).json({ ok: false, error: "Dispute round not found" });
      }

      const newSentISO = newSentAt.toISOString();

      await updateEventPayload(consumerId, "dispute_round",
        e => e.payload?.jobId === jobId,
        p => {
          p.sentAt = newSentISO;
          const roundDays = p.followUpDays || 30;
          const roundFollowUp = new Date(newSentAt);
          roundFollowUp.setDate(roundFollowUp.getDate() + roundDays);
          p.followUpDate = roundFollowUp.toISOString();
          (p.items || []).forEach(item => {
            const itemDays = item.followUpDays || 30;
            const itemFollowUp = new Date(newSentAt);
            itemFollowUp.setDate(itemFollowUp.getDate() + itemDays);
            item.followUpDate = itemFollowUp.toISOString();
          });
        }
      );

      const existingReminder = (state.reminders || []).find(r => r.payload?.type === "dispute_followup" && r.payload?.jobId === jobId);
      if (existingReminder) {
        await removeReminder(consumerId, existingReminder.id);
      }
      const updatedState = await listConsumerState(consumerId);
      const updatedRound = (updatedState.events || []).find(e => e.type === "dispute_round" && e.payload?.jobId === jobId);
      const newFollowUpDate = updatedRound?.payload?.followUpDate;
      if (newFollowUpDate) {
        await addReminder(consumerId, {
          id: `dispute_followup_${jobId}_${Date.now()}`,
          due: newFollowUpDate,
          payload: { type: "dispute_followup", jobId, round: updatedRound.payload.round, followUpDays: updatedRound.payload.followUpDays, itemCount: (updatedRound.payload.items || []).length },
        });
      }

      await addEvent(consumerId, "dispute_settings_updated", { jobId, sentAt: newSentISO });
      return res.json({ ok: true, sentAt: newSentISO, followUpDate: newFollowUpDate });
    }

    if (!followUpDays || typeof followUpDays !== "number" || followUpDays < 1 || followUpDays > 180) {
      return res.status(400).json({ ok: false, error: "followUpDays must be a number between 1 and 180" });
    }

    const state = await listConsumerState(consumerId);
    const roundEvent = (state.events || []).find(e => e.type === "dispute_round" && e.payload?.jobId === jobId);
    if (!roundEvent) {
      return res.status(404).json({ ok: false, error: "Dispute round not found" });
    }

    const sentAt = roundEvent.payload.sentAt;

    if (typeof itemIndex === "number" && itemIndex >= 0) {
      const items = roundEvent.payload.items || [];
      if (itemIndex >= items.length) {
        return res.status(400).json({ ok: false, error: "Invalid item index" });
      }
      const itemFollowUpDate = new Date(sentAt);
      itemFollowUpDate.setDate(itemFollowUpDate.getDate() + followUpDays);

      await updateEventPayload(consumerId, "dispute_round",
        e => e.payload?.jobId === jobId,
        p => {
          if (p.items && p.items[itemIndex]) {
            p.items[itemIndex].followUpDays = followUpDays;
            p.items[itemIndex].followUpDate = itemFollowUpDate.toISOString();
          }
          const maxDays = Math.max(...(p.items || []).map(i => i.followUpDays || 30));
          const maxDate = new Date(sentAt);
          maxDate.setDate(maxDate.getDate() + maxDays);
          p.followUpDays = maxDays;
          p.followUpDate = maxDate.toISOString();
        }
      );

      const updatedState = await listConsumerState(consumerId);
      const updatedRound = (updatedState.events || []).find(e => e.type === "dispute_round" && e.payload?.jobId === jobId);
      const newRoundFollowUp = updatedRound?.payload?.followUpDate;

      const existingReminder = (state.reminders || []).find(r => r.payload?.type === "dispute_followup" && r.payload?.jobId === jobId);
      if (existingReminder) {
        await removeReminder(consumerId, existingReminder.id);
      }
      if (newRoundFollowUp) {
        await addReminder(consumerId, {
          id: `dispute_followup_${jobId}_${Date.now()}`,
          due: newRoundFollowUp,
          payload: { type: "dispute_followup", jobId, round: roundEvent.payload.round, followUpDays: updatedRound.payload.followUpDays, itemCount: (updatedRound.payload.items || []).length },
        });
      }

      await addEvent(consumerId, "dispute_settings_updated", { jobId, itemIndex, followUpDays, followUpDate: itemFollowUpDate.toISOString() });
      return res.json({ ok: true, itemIndex, followUpDays, followUpDate: itemFollowUpDate.toISOString() });
    }

    const newFollowUpDate = new Date(sentAt);
    newFollowUpDate.setDate(newFollowUpDate.getDate() + followUpDays);

    await updateEventPayload(consumerId, "dispute_round",
      e => e.payload?.jobId === jobId,
      p => {
        p.followUpDays = followUpDays;
        p.followUpDate = newFollowUpDate.toISOString();
        (p.items || []).forEach(item => {
          item.followUpDays = followUpDays;
          const d = new Date(sentAt);
          d.setDate(d.getDate() + followUpDays);
          item.followUpDate = d.toISOString();
        });
      }
    );

    const existingReminder = (state.reminders || []).find(r => r.payload?.type === "dispute_followup" && r.payload?.jobId === jobId);
    if (existingReminder) {
      await removeReminder(consumerId, existingReminder.id);
    }
    await addReminder(consumerId, {
      id: `dispute_followup_${jobId}_${Date.now()}`,
      due: newFollowUpDate.toISOString(),
      payload: {
        type: "dispute_followup",
        jobId,
        round: roundEvent.payload.round,
        followUpDays,
        itemCount: (roundEvent.payload.items || []).length,
      },
    });

    await addEvent(consumerId, "dispute_settings_updated", { jobId, followUpDays, followUpDate: newFollowUpDate.toISOString() });
    res.json({ ok: true, followUpDays, followUpDate: newFollowUpDate.toISOString() });
  } catch (e) {
    logError("DISPUTE_SETTINGS_ERROR", "Failed to update dispute settings", e, { consumerId: req.params.id, jobId: req.params.jobId });
    res.status(500).json({ ok: false, error: "Failed to update settings" });
  }
});

app.post("/api/consumers/:id/disputes/:jobId/response", authenticate, async (req, res) => {
  try {
    const { id: consumerId, jobId } = req.params;
    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ ok: false, error: "items array is required" });
    }

    const state = await listConsumerState(consumerId);
    const roundEvent = (state.events || []).find(e => e.type === "dispute_round" && e.payload?.jobId === jobId);
    if (!roundEvent) {
      return res.status(404).json({ ok: false, error: "Dispute round not found" });
    }

    const validOutcomes = ["removed", "verified", "no_response", "stalled", "partial", "updated", "deleted", "corrected"];
    const normalizedItems = items.map(item => ({
      creditor: item.creditor || "Unknown",
      bureau: item.bureau || null,
      outcome: validOutcomes.includes(item.outcome) ? item.outcome : "no_response",
      notes: item.notes || null,
      evidenceFiles: item.evidenceFiles || [],
      itemIndex: typeof item.itemIndex === 'number' ? item.itemIndex : null,
    }));

    await updateEventPayload(consumerId, "dispute_round",
      e => e.payload?.jobId === jobId,
      p => {
        for (const ri of normalizedItems) {
          const roundItem = (ri.itemIndex !== null && (p.items || [])[ri.itemIndex])
            ? (p.items || [])[ri.itemIndex]
            : (p.items || []).find(i => matchCreditorBureau(i, ri));
          if (roundItem) roundItem.status = ri.outcome;
        }
        const allResolved = (p.items || []).every(i => ["removed", "deleted", "corrected"].includes(i.status));
        p.status = allResolved ? "resolved" : "response_received";
      }
    );

    await addEvent(consumerId, "dispute_response", {
      jobId,
      round: roundEvent.payload.round,
      items: normalizedItems,
      respondedAt: new Date().toISOString(),
    });

    // bureau_acknowledgment: fired every time a response is received from the bureau
    await addEvent(consumerId, "bureau_acknowledgment", {
      jobId,
      round: roundEvent.payload.round,
      itemCount: normalizedItems.length,
    }).catch(() => {});

    // item_removed: fired for each item with a successful outcome
    const removedItems = normalizedItems.filter(i => ["removed", "deleted", "corrected"].includes(i.outcome));
    for (const ri of removedItems) {
      await addEvent(consumerId, "item_removed", {
        jobId,
        creditor: ri.creditor,
        bureau: ri.bureau,
        outcome: ri.outcome,
      }).catch(() => {});
    }

    // dispute_outcome: fired when the round is fully resolved
    const allResolved = normalizedItems.every(i => ["removed", "deleted", "corrected"].includes(i.outcome));
    if (allResolved && normalizedItems.length > 0) {
      await addEvent(consumerId, "dispute_outcome", {
        jobId,
        round: roundEvent.payload.round,
        removedCount: removedItems.length,
      }).catch(() => {});
      // signature_completed: bureau has acknowledged and resolved all items — equivalent to signing off
      try { await addEvent(consumerId, "signature_completed", { jobId, round: roundEvent.payload.round, resolvedCount: removedItems.length, documentType: 'dispute_resolution' }); } catch {}
    }

    const roundPayloadItems = roundEvent.payload.items || [];
    const recommendations = [];
    for (const ri of normalizedItems) {
      if (["removed", "deleted", "corrected"].includes(ri.outcome)) continue;
      const letterInfo = (roundEvent.payload.letters || []).find(l => matchCreditorBureau(l, ri));
      const matchedItem = (ri.itemIndex !== null && roundPayloadItems[ri.itemIndex])
        ? roundPayloadItems[ri.itemIndex]
        : roundPayloadItems.find(pi => matchCreditorBureau(pi, ri));
      const rec = recommendNextLetter({
        letterType: matchedItem?.letterType || letterInfo?.letterType || null,
        round: roundEvent.payload.round,
        outcome: ri.outcome,
        violations: Array.isArray(matchedItem?.violations) ? matchedItem.violations : [],
        accountType: matchedItem?.accountType || '',
        accountStatus: matchedItem?.accountStatus || '',
      });
      recommendations.push({ creditor: ri.creditor, bureau: ri.bureau, ...rec });
      await addEvent(consumerId, "dispute_recommendation", {
        jobId,
        creditor: ri.creditor,
        bureau: ri.bureau,
        round: roundEvent.payload.round,
        ...rec,
      });
    }

    const existingReminder = (state.reminders || []).find(r => r.payload?.type === "dispute_followup" && r.payload?.jobId === jobId);
    if (existingReminder) {
      await removeReminder(consumerId, existingReminder.id);
    }

    res.json({ ok: true, items: normalizedItems, recommendations });
  } catch (e) {
    logError("DISPUTE_RESPONSE_ERROR", "Failed to record dispute response", e, { consumerId: req.params.id, jobId: req.params.jobId });
    res.status(500).json({ ok: false, error: "Failed to record response" });
  }
});

const evidenceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
app.post("/api/consumers/:id/disputes/:jobId/evidence", authenticate, evidenceUpload.single("file"), async (req, res) => {
  try {
    const { id: consumerId, jobId } = req.params;
    const { creditor, bureau } = req.body || {};
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "File is required" });
    }

    const ext = path.extname(req.file.originalname) || ".pdf";
    const storedName = `evidence_${jobId}_${Date.now()}${ext}`;
    const objectKey = objStore.consumerFileKey(consumerId, storedName);
    await objStore.uploadFile(objectKey, req.file.buffer, req.file.mimetype || "application/octet-stream");

    let aiScanResult = null;
    try {
      aiScanResult = await scanResponseLetter(req.file.buffer, req.file.mimetype);
    } catch (e) {
      logError("DISPUTE_AI_SCAN_ERROR", "Failed to scan evidence with AI", e, { consumerId, jobId });
    }

    await addFileMeta(consumerId, {
      id: `evidence_${Date.now()}`,
      originalName: req.file.originalname,
      storedName,
      objectKey,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
      context: { type: "dispute_evidence", jobId, creditor, bureau },
    });

    await addEvent(consumerId, "dispute_evidence_uploaded", {
      jobId,
      creditor: creditor || null,
      bureau: bureau || null,
      filename: req.file.originalname,
      storedName,
      aiScan: aiScanResult,
    });

    res.json({ ok: true, storedName, aiScan: aiScanResult });
  } catch (e) {
    logError("DISPUTE_EVIDENCE_ERROR", "Failed to upload evidence", e, { consumerId: req.params.id, jobId: req.params.jobId });
    res.status(500).json({ ok: false, error: "Failed to upload evidence" });
  }
});

app.get("/api/consumers/:id/disputes/:jobId/recommendation", authenticate, async (req, res) => {
  try {
    const { id: consumerId, jobId } = req.params;
    const state = await listConsumerState(consumerId);
    const roundEvent = (state.events || []).find(e => e.type === "dispute_round" && e.payload?.jobId === jobId);
    if (!roundEvent) {
      return res.status(404).json({ ok: false, error: "Dispute round not found" });
    }

    const recommendations = [];
    const payloadItems = roundEvent.payload.items || [];
    for (let idx = 0; idx < payloadItems.length; idx++) {
      const item = payloadItems[idx];
      if (["removed", "deleted", "corrected"].includes(item.status)) {
        recommendations.push({ creditor: item.creditor, bureau: item.bureau, tradelineIndex: item.tradelineIndex ?? null, itemIndex: idx, resolved: true });
        continue;
      }
      const letterInfo = (roundEvent.payload.letters || []).find(l => matchCreditorBureau(l, item));
      const itemLetterType = item.letterType || letterInfo?.letterType || null;
      const itemViolations = Array.isArray(item.violations) ? item.violations : [];
      const itemAccountType = item.accountType || '';
      const itemAccountStatus = item.accountStatus || '';

      let outcome = item.status;
      if (outcome === 'awaiting' || outcome === 'awaiting_response') {
        outcome = 'awaiting';
      }

      const rec = recommendNextLetter({
        letterType: itemLetterType,
        round: roundEvent.payload.round,
        outcome,
        violations: itemViolations,
        accountType: itemAccountType,
        accountStatus: itemAccountStatus,
      });
      const prevReason = item.specificDisputeReason || letterInfo?.specificDisputeReason || null;
      recommendations.push({ creditor: item.creditor, bureau: item.bureau, tradelineIndex: item.tradelineIndex ?? null, itemIndex: idx, resolved: false, specificDisputeReason: prevReason, ...rec });
    }

    res.json({ ok: true, jobId, round: roundEvent.payload.round, recommendations });
  } catch (e) {
    logError("DISPUTE_RECOMMEND_ERROR", "Failed to get recommendations", e, { consumerId: req.params.id, jobId: req.params.jobId });
    res.status(500).json({ ok: false, error: "Failed to get recommendations" });
  }
});

// ============================================================================
// CFPB COMPLAINT GENERATOR (CRM)
// ============================================================================

const CFPB_VIOLATION_LABELS = {
  no_response_30: 'The bureau failed to complete its investigation within 30 days as required by FCRA §611(a)(1)(A)',
  verified_inaccurate: 'The bureau verified information that is demonstrably inaccurate, in violation of FCRA §611(a)(1)',
  reaged: 'The creditor illegally re-aged the debt by changing the date of first delinquency, violating FCRA §605(c)',
  continued_after_paid: 'The creditor continued reporting the account after it was paid/settled, violating FCRA §623(a)(2)',
  not_mine: 'The account does not belong to the consumer and may be the result of identity theft, under FCRA §611 and §623',
  no_response_45: 'The bureau failed to complete its investigation within 45 days (extended period for disputes submitted with new information) as required by FCRA §611(a)(1)(B)',
  duplicate_reporting: 'The same debt is being reported multiple times by different collection agencies, constituting duplicate reporting in violation of FCRA §623(a)',
  obsolete_info: 'The bureau is reporting information that is past the 7-year reporting period and is legally obsolete under FCRA §605(a)',
  wrong_balance: 'The creditor is reporting an incorrect balance that does not reflect actual amounts owed, violating FCRA §623(a)(2) and Metro-2 accuracy requirements',
  wrong_status: 'The account status is being reported inaccurately (e.g., open vs. closed, current vs. delinquent), violating FCRA §623(a)(1)',
  mixed_file: 'The consumer\'s credit file has been mixed with another consumer\'s information, violating FCRA §611 accuracy requirements',
  collection_no_validation: 'The debt collector failed to provide debt validation upon request as required by FDCPA §809(b)',
  collection_harassment: 'The debt collector engaged in harassment and abusive collection practices in violation of FDCPA §806',
  collection_false_representation: 'The debt collector made false, deceptive, or misleading representations in violation of FDCPA §807',
  collection_unfair_practices: 'The debt collector used unfair or unconscionable means to collect a debt in violation of FDCPA §808',
  paid_collection: 'A paid/satisfied collection account continues to be reported negatively in violation of FCRA §623(a)(2)',
  medical_debt: 'A medical debt under $500 is being reported in violation of the CFPB\'s 2023 Medical Debt Rule and FCRA §605(a)(6)',
  bankruptcy_discharge: 'A debt that was discharged in bankruptcy continues to be reported as owed, violating FCRA §623(a)(1)(B)',
  settlement_not_reflected: 'A settled debt is not being reported as settled, misrepresenting the account status in violation of FCRA §623(a)(2)',
  other: null,
};

const CFPB_TONE_MAP = {
  professional: 'Use a measured, formal, and professional tone throughout.',
  firm_assertive: 'Use a direct, firm, and assertive tone. Make clear demands without being hostile.',
  urgent: 'Emphasize time-sensitivity and urgency. Convey that the consumer has waited long enough and needs immediate action.',
  legal_formal: 'Use heavy legal language with extensive statute references. Write as if drafting a legal brief.',
  strong_aggressive: 'Use strong, aggressive consumer advocacy language. Be forceful and unrelenting in describing the harm done to the consumer.',
  curious: 'Write in a genuinely curious and inquisitive tone, as if the consumer truly cannot understand how or why this error occurred and sincerely wants answers. Ask pointed questions throughout.',
  tired: 'Write in an exhausted, worn-down tone. The consumer has been fighting this for a long time and is emotionally drained. Convey fatigue, frustration from repetition, and a sense of being ignored.',
  hopeless: 'Write in a tone of despair and loss of faith in the system. The consumer feels powerless, as if nothing will ever be fixed. Convey the real-world damage this is causing to their life.',
  hopeful: 'Write in a cautiously optimistic tone. The consumer still believes in the process and hopes this complaint will finally resolve the issue. Sincere, earnest, and forward-looking.',
  frustrated: 'Write in a tone of clear frustration and exasperation. The consumer is not angry but is deeply irritated that this issue persists despite multiple attempts to resolve it.',
  emotional: 'Write with heartfelt emotion. Describe the personal impact — stress, sleepless nights, damaged relationships, lost opportunities. Make the human cost tangible.',
  desperate: 'Write with a sense of urgency born from desperation. The consumer is at a breaking point and needs help now. Convey that this error is seriously affecting their daily life and financial survival.',
};

const CFPB_GOAL_MAP = {
  delete: 'The consumer\'s primary goal is complete deletion of the disputed item(s) from all credit bureaus. In the resolution section, demand full removal and cite the bureau\'s obligation to delete unverifiable or inaccurate information.',
  correct: 'The consumer\'s primary goal is correction of inaccurate information on the credit report. In the resolution section, demand specific corrections and that the accurate information be reported to all bureaus.',
};

function buildCfpbPrompt({ consumerName, consumerState, companyName, violationDesc, itemsList, disputeSentDate, responseOutcome, additionalNotes, tone, complaintGoal }) {
  const toneInstruction = CFPB_TONE_MAP[tone] || CFPB_TONE_MAP.professional;
  const goalInstruction = CFPB_GOAL_MAP[complaintGoal] || '';
  const system = `You are a consumer rights attorney specializing in FCRA and FDCPA violations. Write a formal CFPB complaint on behalf of the consumer. ${toneInstruction}${goalInstruction ? ' ' + goalInstruction : ''} Write in first person from the consumer's perspective. Always cite the applicable federal law by section number. Format your response with exactly two labeled sections: "WHAT HAPPENED:" followed by 2-3 detailed paragraphs, then "WHAT RESOLUTION I AM SEEKING:" followed by 1-2 paragraphs. Do not include any other sections, headers, or extra formatting.`;
  const parts = [
    `Consumer: ${consumerName}${consumerState ? ', ' + consumerState : ''}`,
    `Company being complained about: ${companyName}`,
    `Violation: ${violationDesc}`,
  ];
  if (complaintGoal === 'delete') parts.push('Complaint goal: Complete deletion of the disputed item(s) from credit reports');
  else if (complaintGoal === 'correct') parts.push('Complaint goal: Correction of inaccurate information on the credit report');
  if (itemsList && itemsList.length > 0) parts.push(`Account(s) / item(s) disputed: ${itemsList.join(', ')}`);
  if (disputeSentDate) parts.push(`Date dispute was sent: ${disputeSentDate}`);
  if (responseOutcome) parts.push(`Bureau/creditor response received: ${responseOutcome}`);
  if (additionalNotes) parts.push(`Additional details: ${additionalNotes}`);
  const user = `Write a CFPB complaint based on the following:\n\n${parts.join('\n')}`;
  return { system, user };
}

function parseCfpbOutput(rawText) {
  const narrativeMatch = rawText.match(/WHAT HAPPENED:\s*([\s\S]*?)(?=WHAT RESOLUTION I AM SEEKING:|$)/i);
  const resolutionMatch = rawText.match(/WHAT RESOLUTION I AM SEEKING:\s*([\s\S]*?)$/i);
  return {
    narrative: (narrativeMatch?.[1] || rawText).trim(),
    resolution: (resolutionMatch?.[1] || '').trim(),
  };
}

app.post("/api/consumers/:id/cfpb-complaint", authenticate, async (req, res) => {
  try {
    const consumerId = req.params.id;
    const { companyName, violationType, otherViolationText, itemsDisputed, disputeSentDate, responseOutcome, additionalNotes, roundJobId, tone, complaintGoal, proofFiles, save: saveRecord } = req.body || {};
    if (!companyName) return res.status(400).json({ ok: false, error: "companyName is required" });
    const db = await loadDB(req);
    const consumer = db.consumers.find(c => c.id === consumerId);
    if (!consumer) return res.status(404).json({ ok: false, error: "Consumer not found" });
    const consumerName = [consumer.firstName, consumer.lastName].filter(Boolean).join(' ') || consumer.name || 'the consumer';
    const consumerState = consumer.state || consumer.address?.state || '';
    const violationDesc = CFPB_VIOLATION_LABELS[violationType] || otherViolationText || 'Violation of consumer credit reporting laws (FCRA)';
    const itemsList = Array.isArray(itemsDisputed) ? itemsDisputed.filter(Boolean) : (itemsDisputed ? [itemsDisputed] : []);
    const { system, user } = buildCfpbPrompt({ consumerName, consumerState, companyName, violationDesc, itemsList, disputeSentDate, responseOutcome, additionalNotes, tone: tone || 'professional', complaintGoal: complaintGoal || '' });
    const rawText = await callOpenAiText({ system, user });
    const { narrative, resolution } = parseCfpbOutput(rawText);
    if (saveRecord) {
      const complaintId = `cfpb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const eventPayload = { id: complaintId, companyName, violationType, narrative, resolution, itemsDisputed: itemsList, disputeSentDate, tone: tone || 'professional', complaintGoal: complaintGoal || '', roundJobId: roundJobId || null, generatedAt: new Date().toISOString() };
      if (Array.isArray(proofFiles) && proofFiles.length) eventPayload.proofFiles = proofFiles;
      await addEvent(consumerId, 'cfpb_complaint', eventPayload);
    }
    res.json({ ok: true, narrative, resolution });
  } catch (e) {
    logError('CFPB_GENERATE_ERROR', 'Failed to generate CFPB complaint', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/consumers/:id/cfpb-complaints", authenticate, async (req, res) => {
  try {
    const consumerId = req.params.id;
    const state = await listConsumerState(consumerId);
    const complaints = (state.events || []).filter(e => e.type === 'cfpb_complaint').map(e => ({ ...e.payload, at: e.at }));
    complaints.sort((a, b) => new Date(b.at || b.generatedAt || 0) - new Date(a.at || a.generatedAt || 0));
    res.json({ ok: true, complaints });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/consumers/:id/negative-items", authenticate, async (req, res) => {
  try {
    const db = await loadDB(req);
    const consumer = db.consumers.find(c => c.id === req.params.id);
    if (!consumer) return res.status(404).json({ ok: false, error: "Consumer not found" });
    const latestReport = consumer.reports?.[0];
    if (!latestReport?.data) return res.json({ ok: true, items: [] });
    let items = [];
    if (Array.isArray(latestReport.data.negative_items)) {
      items = latestReport.data.negative_items.map((ni, idx) => ({
        id: ni.id || `ni_${idx}`,
        name: ni.creditor || ni.creditor_name || 'Unknown',
        accountNumber: ni.account_number || (ni.account_numbers ? Object.values(ni.account_numbers).filter(Boolean).join(', ') : ''),
        bureaus: Array.isArray(ni.bureaus) ? ni.bureaus : (ni.bureau ? [ni.bureau] : []),
        balance: ni.balance || ni.current_balance || '',
        status: ni.status || ni.account_status || '',
      }));
    } else if (Array.isArray(latestReport.data.tradelines)) {
      items = latestReport.data.tradelines
        .filter(tl => {
          const status = (tl.account_status || tl.status || '').toLowerCase();
          const rating = (tl.payment_rating || '').toLowerCase();
          return status.includes('derog') || status.includes('collection') || status.includes('charge') || status.includes('late') || rating.includes('late') || rating.includes('derog');
        })
        .map((tl, idx) => ({
          id: tl.id || `tl_${idx}`,
          name: tl.meta?.creditor || tl.creditor || tl.creditor_name || 'Unknown',
          accountNumber: tl.meta?.account_numbers ? Object.values(tl.meta.account_numbers).filter(Boolean).join(', ') : '',
          bureaus: tl.per_bureau ? Object.keys(tl.per_bureau) : [],
          balance: tl.balance || tl.current_balance || '',
          status: tl.account_status || tl.status || '',
        }));
    }
    res.json({ ok: true, items });
  } catch (e) {
    logError('NEGATIVE_ITEMS_ERROR', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

const cfpbProofUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const SAFE_PROOF_MIMES = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

app.post("/api/consumers/:id/cfpb-proof", authenticate, cfpbProofUpload.array('files', 5), async (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ ok: false, error: "No files uploaded" });
    const consumerId = req.params.id;
    const db = await loadDB(req);
    const consumer = db.consumers.find(c => c.id === consumerId);
    if (!consumer) return res.status(404).json({ ok: false, error: "Consumer not found" });
    const results = [];
    for (const file of req.files) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!SAFE_PROOF_MIMES[ext]) continue;
      const storedName = `cfpb_proof_${Date.now()}_${nanoid(6)}${ext}`;
      const objectKey = objStore.consumerFileKey(consumerId, storedName);
      await objStore.uploadFile(objectKey, file.buffer, SAFE_PROOF_MIMES[ext]);
      results.push({ key: storedName, name: file.originalname || storedName, size: file.size });
    }
    if (results.length) {
      try { await addEvent(consumerId, "document_approved", { name: consumer.name, fileCount: results.length, files: results.map(r => r.name) }); } catch {}
    }
    res.json({ ok: true, files: results });
  } catch (e) {
    logError('CFPB_PROOF_UPLOAD_ERROR', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/consumers/:id/cfpb-proof/:filename", authenticate, async (req, res) => {
  try {
    const consumerId = req.params.id;
    const db = await loadDB(req);
    const consumer = db.consumers.find(c => c.id === consumerId);
    if (!consumer) return res.status(404).json({ ok: false, error: "Consumer not found" });
    const filename = path.basename(req.params.filename);
    if (!filename.startsWith('cfpb_proof_')) return res.status(400).json({ ok: false, error: "Invalid filename" });
    const ext = path.extname(filename).toLowerCase();
    const safeMime = SAFE_PROOF_MIMES[ext] || 'application/octet-stream';
    const objectKey = objStore.consumerFileKey(consumerId, filename);
    const exists = await objStore.fileExists(objectKey);
    if (!exists) return res.status(404).json({ ok: false, error: "File not found" });
    res.set({ 'Content-Type': safeMime, 'Content-Disposition': `attachment; filename="${filename}"` });
    const stream = await objStore.downloadFileStream(objectKey);
    stream.pipe(res);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ ok: false, error: e.message });
  }
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

async function loadCreditCompaniesDB() {
  let db = await readKey('credit_companies', null);
  if (!db) {
    db = { companies: [] };
    await writeKey('credit_companies', db);
  }
  return db;
}

async function saveCreditCompaniesDB(db) {
  await writeKey('credit_companies', db);
}

function normalizeCreditCompany(payload = {}) {
  const name = sanitizeSettingString(payload.name || '').slice(0, 120);
  if (!name) return null;
  const serviceArea = sanitizeSettingString(payload.serviceArea || '').slice(0, 120);
  const focus = sanitizeSettingString(payload.focus || '').slice(0, 160);
  const minPlanValue = sanitizeSettingString(payload.minPlan || '').toLowerCase();
  const minPlan = DIY_PLAN_ORDER.includes(minPlanValue) ? minPlanValue : 'basic';
  const isActive = payload.isActive !== false;
  const idValue = sanitizeSettingString(payload.id || '');
  const tenantValue = sanitizeSettingString(payload.tenantId || '');
  const tenantId = tenantValue ? sanitizeTenantId(tenantValue, DEFAULT_TENANT_ID) : null;
  return {
    id: idValue || nanoid(),
    name,
    serviceArea,
    minPlan,
    isActive,
    focus,
    tenantId
  };
}

async function syncCreditCompanyMetrics(metricsDb, companiesDb) {
  const metricsByCompany = new Map(metricsDb.metrics.map(metric => [metric.companyId, metric]));
  const now = new Date().toISOString();
  const additions = companiesDb.companies
    .filter(company => !metricsByCompany.has(company.id))
    .map(company => ({
      companyId: company.id,
      disputeSuccessRate: 0,
      caseCloseRate: 0,
      avgResponseTimeDays: 0,
      activeClients: 0,
      reviewScore: 0,
      dissatisfiedCount: 0,
      updatedAt: now
    }));
  if (additions.length) {
    metricsDb.metrics = [...metricsDb.metrics, ...additions];
    await saveCreditCompanyMetricsDB(metricsDb);
  }
}

async function loadCreditCompanyMetricsDB() {
  let db = await readKey('credit_company_metrics', null);
  if (!db) {
    db = { metrics: [] };
    await writeKey('credit_company_metrics', db);
  }
  try {
    const companiesDb = await loadCreditCompaniesDB();
    await syncCreditCompanyMetrics(db, companiesDb);
  } catch (err) {
    logWarn('CREDIT_COMPANY_METRICS_SYNC_FAILED', err?.message || String(err));
  }
  return db;
}

async function saveCreditCompanyMetricsDB(db) {
  await writeKey('credit_company_metrics', db);
}

async function loadCreditCompanyBoostsDB() {
  let db = await readKey('credit_company_boosts', null);
  if (!db) {
    db = { boosts: [] };
    await writeKey('credit_company_boosts', db);
  }
  return db;
}

async function saveCreditCompanyBoostsDB(db) {
  await writeKey('credit_company_boosts', db);
}

async function loadDiyCompanyMatchesDB() {
  let db = await readKey('diy_company_matches', null);
  if (!db) db = { matches: [] };
  return db;
}

async function saveDiyCompanyMatchesDB(db) {
  await writeKey('diy_company_matches', db);
}

async function ensureDiyClientForCompany({ company, diyUser, diyPlan } = {}) {
  if (!company?.tenantId || !diyUser?.id) return null;
  const tenantId = company.tenantId;
  const nowIso = new Date().toISOString();
  const nameParts = [diyUser.firstName, diyUser.lastName].map(part => sanitizeSettingString(part)).filter(Boolean);
  const name = nameParts.join(' ') || diyUser.email || 'DIY Client';

  const db = await loadDB(tenantId);
  const existing = db.consumers.find(consumer => consumer?.diyUserId === diyUser.id);
  const consumerId = existing?.id || nanoid(10);
  if (!existing) {
    const consumer = {
      id: consumerId,
      name,
      email: diyUser.email || "",
      phone: "",
      addr1: "",
      addr2: "",
      city: "",
      state: "",
      zip: "",
      ssn_last4: "",
      dob: "",
      sale: 0,
      paid: 0,
      status: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
      reports: [],
      diyUserId: diyUser.id,
      diyPlan: diyPlan || null,
      source: "diy"
    };
    db.consumers.push(consumer);
    await saveDB(db, tenantId);
  } else {
    const shouldUpdateName = !existing.name && name;
    const shouldUpdateEmail = !existing.email && diyUser.email;
    if (shouldUpdateName || shouldUpdateEmail) {
      if (shouldUpdateName) existing.name = name;
      if (shouldUpdateEmail) existing.email = diyUser.email;
      existing.updatedAt = nowIso;
      await saveDB(db, tenantId);
    }
  }

  await withTenantContext(tenantId, async () => {
    await addEvent(consumerId, "diy_client_selected", {
      text: `${name} selected ${company.name} from DIY.`,
      diyUserId: diyUser.id,
      plan: diyPlan || null,
      companyId: company.id
    });
  });

  return { tenantId, consumerId };
}

// DIY Authentication Middleware - uses separate secret to prevent token confusion
function getDiyJwtSecret() {
  const secret = process.env.DIY_JWT_SECRET;
  if (!secret) {
    throw new Error('DIY_JWT_SECRET environment variable is not configured. Please set DIY_JWT_SECRET before starting the server.');
  }
  return secret;
}

const DIY_JWT_SECRET = getDiyJwtSecret();

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
  free: { canAudit: true, lettersPerMonth: 0 },
  basic: { canAudit: true, lettersPerMonth: -1 },
  pro: { canAudit: true, lettersPerMonth: -1 }
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

const DIY_PLAN_ORDER = ['free', 'basic', 'pro'];

function isPlanAllowed(userPlan, minPlan) {
  return DIY_PLAN_ORDER.indexOf(userPlan) >= DIY_PLAN_ORDER.indexOf(minPlan);
}

function normalizeRange(values) {
  const filtered = values.filter(value => Number.isFinite(value));
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  return { min, max };
}

function normalizeValue(value, range) {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.max === range.min) return 1;
  return (value - range.min) / (range.max - range.min);
}

function calculatePerformanceScore(metrics, ranges) {
  const responseNormalized = 1 - normalizeValue(metrics.avgResponseTimeDays, ranges.responseTime);
  const activeNormalized = normalizeValue(metrics.activeClients, ranges.activeClients);
  const reviewNormalized = normalizeValue(metrics.reviewScore, ranges.reviewScore);
  const dissatisfiedPenalty = Math.min(0.1, (metrics.dissatisfiedCount || 0) * 0.02);
  const baseScore =
    0.4 * metrics.disputeSuccessRate +
    0.2 * metrics.caseCloseRate +
    0.15 * responseNormalized +
    0.15 * activeNormalized +
    0.1 * reviewNormalized;
  return Math.max(0, baseScore - dissatisfiedPenalty);
}

function isBoostActive(boost, now) {
  if (!boost) return false;
  const start = new Date(boost.startDate).getTime();
  const end = new Date(boost.endDate).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
}

function applyRotationWindow(rankings) {
  const topFive = rankings.slice(0, 5);
  const hasNonBoosted = topFive.some(entry => !entry.isBoosted);
  if (hasNonBoosted) return rankings;

  const bestNonBoosted = rankings.find(entry => !entry.isBoosted);
  if (!bestNonBoosted) return rankings;

  const updated = rankings.filter(entry => entry.companyId !== bestNonBoosted.companyId);
  updated.splice(4, 0, bestNonBoosted);
  return updated;
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

  let filePath;
  const diyObjKey = report.objectKey || objStore.diyFileKey(userId, report.storedName);
  try {
    const buf = await objStore.downloadFile(diyObjKey);
    const tmpPath = path.join(os.tmpdir(), `diy_${nanoid(8)}_${report.storedName}`);
    fs.writeFileSync(tmpPath, buf);
    filePath = tmpPath;
  } catch {
    filePath = path.join(__dirname, 'diy_uploads', userId, report.storedName);
    if (!fs.existsSync(filePath)) {
      return { status: 404, error: 'Report file not found' };
    }
  }

  let violations = [];
  let tradelineResults = [];
  const auditDetails = {
    source: null,
    violationCount: 0,
    error: null
  };

  try {
    const buffer = await fs.promises.readFile(filePath);
    const pyResult = await runPythonAnalyzer({ buffer, filename: report.originalName || report.storedName });
    const pyData = pyResult?.data || {};
    auditDetails.source = 'legacy';
    const rawTradelines = mapAuditedViolations(pyData);
    for (const tl of rawTradelines) {
      const creditor = tl?.meta?.creditor || 'Unknown Creditor';
      const tlViolations = (tl.violations || []).map(v => ({
        ruleId: v.id || v.ruleId || '',
        title: v.title || v.id || 'Violation',
        explanation: v.explanation || v.description || v.message || 'This item may contain inaccurate information that violates credit reporting standards.',
        bureau: v.bureau || '',
        creditor,
      }));
      violations.push(...tlViolations);
      if (tlViolations.length > 0) {
        const bureauData = tl.per_bureau || {};
        const bureaus = Object.keys(bureauData).filter(b => bureauData[b] && Object.keys(bureauData[b]).length > 0);
        const firstBureau = bureauData[bureaus[0]] || {};
        const pick = (key) => {
          for (const b of bureaus) { const v = bureauData[b]?.[key]; if (v != null && v !== '') return v; }
          return '';
        };
        const accountNumber = tl?.meta?.account_numbers
          ? Object.values(tl.meta.account_numbers)[0] || ''
          : firstBureau.account_number || '';
        tradelineResults.push({
          creditor,
          accountNumber,
          accountStatus:   pick('account_status'),
          accountType:     pick('account_type'),
          balance:         pick('balance'),
          creditLimit:     pick('credit_limit'),
          highCredit:      pick('high_credit'),
          pastDue:         pick('past_due'),
          dateOpened:      pick('date_opened'),
          lastReported:    pick('last_reported'),
          dateLastPayment: pick('date_last_payment'),
          paymentStatus:   pick('payment_status'),
          comments:        pick('comments'),
          bureaus,
          violations: tlViolations,
        });
      }
    }
    auditDetails.violationCount = violations.length;
  } catch (auditErr) {
    auditDetails.error = auditErr?.message || 'Audit engine error';
    logWarn('DIY_AUDIT_ENGINE_ERROR', auditDetails.error);
    report.auditStatus = 'failed';
    report.auditError = auditDetails.error;
    report.auditedAt = new Date().toISOString();
    await saveDiyReportsDB(db);
    if(filePath && filePath.startsWith(os.tmpdir())) try{ fs.unlinkSync(filePath); }catch{}
    return { status: 500, error: 'Audit failed. Please try again later.' };
  }

  if(filePath && filePath.startsWith(os.tmpdir())) try{ fs.unlinkSync(filePath); }catch{}

  report.auditStatus = 'completed';
  report.violations = violations;
  report.auditDetails = auditDetails;
  report.auditedAt = new Date().toISOString();
  await saveDiyReportsDB(db);

  return { violations, tradelines: tradelineResults, auditedAt: report.auditedAt };
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
      error: `You have reached your monthly letter limit. Upgrade to the DIY plan for unlimited letters.`
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

    const refCode = req.body.ref || req.query.ref;
    if (refCode) {
      try {
        const aff = await findAffiliateByRefCode(refCode);
        if (aff) {
          const commission = (aff.customCommissionRate != null && aff.customCommissionRate !== '') ? Number(aff.customCommissionRate) : (AFFILIATE_COMMISSIONS['diy_' + plan] || 0);
          if (!aff.referrals) aff.referrals = [];
          aff.referrals.push({ id: nanoid(8), type: 'diy', plan, email: email.toLowerCase(), earned: commission, status: 'pending', date: new Date().toISOString() });
          aff.totalEarned = (aff.totalEarned || 0) + commission;
          await saveAffiliate(aff);
        }
      } catch (e) { logWarn('AFFILIATE_CREDIT_ERROR', e.message); }
    }

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
        createdAt: user.createdAt,
        wizardStep: user.wizardStep || 1,
        wizardCompleted: user.wizardCompleted || [],
        disputeStrategy: user.disputeStrategy || '',
        markedSent: user.markedSent || {},
        badges: user.badges || [],
        scoreGoal: user.scoreGoal || 0,
        disputeRounds: user.disputeRounds || [],
      }
    });
  } catch (err) {
    logError('DIY_ME_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to get user info' });
  }
});

app.post('/api/diy/upgrade', diyAuthenticate, async (req, res) => {
  try {
    const { plan } = req.body || {};
    if (!DIY_PLAN_ORDER.includes(plan)) {
      return res.status(400).json({ ok: false, error: 'Invalid plan selection' });
    }

    const db = await loadDiyUsersDB();
    const user = db.users.find(u => u.id === req.diyUser.id);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    user.plan = plan;
    await saveDiyUsersDB(db);

    const token = jwt.sign(
      { id: user.id, email: user.email, plan: user.plan, mode: 'diy' },
      DIY_JWT_SECRET,
      { expiresIn: '7d', issuer: 'metro2-diy', audience: 'diy-users' }
    );

    res.json({
      ok: true,
      token,
      user: { id: user.id, email: user.email, plan: user.plan, firstName: user.firstName, lastName: user.lastName }
    });
  } catch (err) {
    logError('DIY_UPGRADE_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to upgrade plan' });
  }
});

app.get('/api/diy/credit-companies', diyAuthenticate, async (req, res) => {
  try {
    const [companiesDb, metricsDb, boostsDb] = await Promise.all([
      loadCreditCompaniesDB(),
      loadCreditCompanyMetricsDB(),
      loadCreditCompanyBoostsDB()
    ]);
    const now = Date.now();

    const metricsByCompany = new Map(metricsDb.metrics.map(metric => [metric.companyId, metric]));
    const boostsByCompany = new Map(boostsDb.boosts.map(boost => [boost.companyId, boost]));
    const activeCompanies = companiesDb.companies.filter(company => company.isActive);

    const ranges = {
      responseTime: normalizeRange(activeCompanies.map(company => metricsByCompany.get(company.id)?.avgResponseTimeDays)),
      activeClients: normalizeRange(activeCompanies.map(company => metricsByCompany.get(company.id)?.activeClients)),
      reviewScore: normalizeRange(activeCompanies.map(company => metricsByCompany.get(company.id)?.reviewScore))
    };

    let rankings = activeCompanies.map(company => {
      const metrics = metricsByCompany.get(company.id);
      const boost = boostsByCompany.get(company.id);
      const isBoosted = isBoostActive(boost, now);
      const performanceScore = metrics ? calculatePerformanceScore(metrics, ranges) : 0;
      const boostMultiplier = isBoosted ? 1 + Math.min(0.25, boost.amount || 0) : 1;
      const finalScore = performanceScore * boostMultiplier;

      return {
        companyId: company.id,
        name: company.name,
        serviceArea: company.serviceArea,
        minPlan: company.minPlan,
        focus: company.focus,
        performanceScore,
        finalScore,
        boostMultiplier,
        isBoosted,
        metrics: metrics || {}
      };
    });

    rankings = rankings.sort((a, b) => b.finalScore - a.finalScore);
    rankings = applyRotationWindow(rankings);

    const response = rankings.map((entry, index) => ({
      rank: index + 1,
      eligible: isPlanAllowed(req.diyUser.plan, entry.minPlan),
      ...entry
    }));

    res.json({ ok: true, companies: response });
  } catch (err) {
    logError('DIY_CREDIT_COMPANY_LIST_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch credit companies' });
  }
});

app.get('/api/diy/credit-companies/current', diyAuthenticate, async (req, res) => {
  try {
    const [matchesDb, companiesDb] = await Promise.all([
      loadDiyCompanyMatchesDB(),
      loadCreditCompaniesDB()
    ]);
    const match = [...matchesDb.matches]
      .filter(entry => entry.userId === req.diyUser.id)
      .sort((a, b) => new Date(b.selectedAt) - new Date(a.selectedAt))[0];

    if (!match) {
      return res.json({ ok: true, company: null });
    }

    const company = companiesDb.companies.find(entry => entry.id === match.companyId);
    res.json({ ok: true, company, match });
  } catch (err) {
    logError('DIY_CREDIT_COMPANY_CURRENT_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch current company' });
  }
});

app.post('/api/diy/credit-companies/select', diyAuthenticate, async (req, res) => {
  try {
    const { companyId, dissatisfiedReason } = req.body || {};
    if (!companyId) {
      return res.status(400).json({ ok: false, error: 'Company selection required' });
    }

    const [matchesDb, metricsDb, companiesDb, usersDb] = await Promise.all([
      loadDiyCompanyMatchesDB(),
      loadCreditCompanyMetricsDB(),
      loadCreditCompaniesDB(),
      loadDiyUsersDB()
    ]);
    const diyUser = usersDb.users.find(user => user.id === req.diyUser.id);
    const selectedCompany = companiesDb.companies.find(entry => entry.id === companyId);

    const now = new Date().toISOString();
    const currentMatch = matchesDb.matches
      .filter(entry => entry.userId === req.diyUser.id)
      .sort((a, b) => new Date(b.selectedAt) - new Date(a.selectedAt))[0];

    if (currentMatch && dissatisfiedReason) {
      currentMatch.dissatisfiedReason = dissatisfiedReason;
      currentMatch.endedAt = now;
      currentMatch.status = 'switched';

      const metrics = metricsDb.metrics.find(entry => entry.companyId === currentMatch.companyId);
      if (metrics) {
        metrics.dissatisfiedCount = (metrics.dissatisfiedCount || 0) + 1;
        metrics.updatedAt = now;
      }
    }

    const newMatch = {
      id: nanoid(),
      userId: req.diyUser.id,
      companyId,
      selectedAt: now,
      status: 'active'
    };

    if (selectedCompany && diyUser) {
      const clientResult = await ensureDiyClientForCompany({
        company: selectedCompany,
        diyUser,
        diyPlan: req.diyUser.plan
      });
      if (clientResult) {
        newMatch.tenantId = clientResult.tenantId;
        newMatch.consumerId = clientResult.consumerId;
      }
    }

    matchesDb.matches.push(newMatch);
    await Promise.all([
      saveDiyCompanyMatchesDB(matchesDb),
      saveCreditCompanyMetricsDB(metricsDb)
    ]);

    res.json({ ok: true, match: newMatch });
  } catch (err) {
    logError('DIY_CREDIT_COMPANY_SELECT_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to save company selection' });
  }
});

// DIY Report Upload - with file type validation
const ALLOWED_DIY_EXTENSIONS = ['.pdf', '.html', '.htm'];
const ALLOWED_DIY_MIMETYPES = ['application/pdf', 'text/html', 'application/xhtml+xml'];

const diyUploadFilter = (req, file, cb) => {
  const sanitizedOriginalName = path.basename(file.originalname || "");
  const ext = path.extname(sanitizedOriginalName).toLowerCase();
  if (!ALLOWED_DIY_EXTENSIONS.includes(ext)) {
    return cb(new Error('Only PDF and HTML files are allowed'), false);
  }
  cb(null, true);
};

const diyUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: diyUploadFilter
});

app.post('/api/diy/reports/upload', diyAuthenticate, diyUpload.single('report'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file uploaded' });
    }

    const sanitizedOriginalName = path.basename(req.file.originalname || "");
    const ext = path.extname(sanitizedOriginalName).toLowerCase();
    const storedName = `${nanoid(10)}${ext}`;
    const objectKey = objStore.diyFileKey(req.diyUser.id, storedName);
    await objStore.uploadFile(objectKey, req.file.buffer, req.file.mimetype || "application/octet-stream");

    const db = await loadDiyReportsDB();
    const report = {
      id: nanoid(12),
      userId: req.diyUser.id,
      originalName: sanitizedOriginalName,
      storedName,
      objectKey,
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

app.post('/api/diy/audit', diyAuthenticate, async (req, res) => {
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
      tradelines: result.tradelines || [],
      auditedAt: result.auditedAt,
      message: result.message
    });
  } catch (err) {
    logError('DIY_AUDIT_ERROR', err);
    res.status(500).json({ ok: false, error: 'Audit failed' });
  }
});

// DIY Run Audit on Report - uses shared audit engine with DIY context
app.post('/api/diy/reports/:id/audit', diyAuthenticate, async (req, res) => {
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

// ============================================================================
// DIY INTELLIFEATS: DISPUTE ROUND TRACKER
// ============================================================================

const OUTCOME_LETTER_MAP = {
  verified:    'method_of_verification',
  updated:     'still_inaccurate',
  no_response: 'no_response_demand',
  frivolous:   'frivolous_rebuttal',
  not_found:   'verification_of_debt',
};

function generateFollowUpLetterContent({ type, creditor, bureau, userName }) {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const name = userName || 'Consumer';

  const subjects = {
    method_of_verification: `Re: Method of Verification Demand — ${creditor} / ${bureau}`,
    still_inaccurate:       `Re: Continued Inaccuracy After Investigation — ${creditor} / ${bureau}`,
    no_response_demand:     `Re: FCRA § 611 Non-Compliance — Failure to Investigate — ${creditor} / ${bureau}`,
    frivolous_rebuttal:     `Re: Rebuttal of Frivolous Designation — ${creditor} / ${bureau}`,
    verification_of_debt:   `Re: Demand for Verification of Account — ${creditor} / ${bureau}`,
    furnisher_623:          `Re: Direct Dispute Under FCRA § 623 — ${creditor}`,
    intent_to_sue:          `Re: Notice of Intent to Pursue Legal Remedies — FCRA — ${creditor}`,
  };

  const bodies = {
    method_of_verification: `I am writing to demand the method of verification used to investigate my recent dispute regarding the above-referenced account.

Under the Fair Credit Reporting Act (FCRA) § 611(a)(7), you are required to provide a description of the procedure used to determine the accuracy and completeness of the disputed information, including the business name and address of any furnisher contacted.

Your bureau reported that this item was "verified." However, no method of verification has been provided. I hereby demand that you provide this information within 15 days.

If you cannot substantiate the method of verification, you are required by law to delete this item from my credit report immediately.`,

    still_inaccurate: `I am writing regarding the above-referenced account, which continues to be reported inaccurately despite my previous dispute and your subsequent investigation.

While your bureau acknowledged my dispute and made a partial update, the account still contains material inaccuracies. The information as currently reported does not accurately reflect the true status of this account.

Under FCRA § 611, you are required to conduct a reasonable reinvestigation. I hereby demand that you complete a full reinvestigation and correct or delete this item. If the inaccuracy cannot be resolved, the item must be removed.`,

    no_response_demand: `I am writing to notify you that you have failed to complete your investigation within the 30-day period mandated by the Fair Credit Reporting Act § 611(a)(1).

I submitted a formal dispute regarding the above-referenced account. As of the date of this letter, I have received no response and the disputed item has not been corrected or deleted.

Your failure to respond within the legally required timeframe constitutes a violation of the FCRA. I demand that you immediately delete this item from my credit report. Continued failure to comply may result in civil liability under FCRA § 616 and § 617, including statutory damages of up to $1,000 per violation.`,

    frivolous_rebuttal: `I am writing to formally contest your designation of my previous dispute as "frivolous" or "irrelevant" pursuant to FCRA § 611(a)(3).

This designation is improper and without merit. My dispute was based on specific, factual inaccuracies in my credit file and was submitted with sufficient identifying information. The FCRA permits a frivolous designation only when a dispute lacks any factual basis — mine clearly did not.

I hereby resubmit my dispute and demand a proper reinvestigation in compliance with FCRA § 611. Please confirm receipt of this letter and provide your reinvestigation results within 30 days.`,

    verification_of_debt: `I am writing to demand complete verification of the above-referenced account appearing on my credit report.

You have indicated that you cannot locate or verify this account. Under FCRA § 611, if a consumer reporting agency cannot verify the accuracy of disputed information following a reinvestigation, that information must be promptly deleted.

As you have confirmed your inability to verify this account, I hereby demand that you delete this item from my credit report immediately and notify me in writing of the deletion.`,

    furnisher_623: `I am writing to submit a direct dispute under my rights pursuant to the Fair Credit Reporting Act § 623 regarding the above-referenced account.

Despite multiple rounds of disputes with the credit bureaus, this account continues to be reported inaccurately. As the original furnisher of this information, you have an independent legal obligation under FCRA § 623 to investigate disputes submitted directly to you, and to correct or delete any inaccurate information.

I hereby dispute the accuracy of this account and demand that you investigate and correct the inaccurate information within 30 days. Please notify all credit reporting agencies to which you have furnished this information of any corrections made.`,

    intent_to_sue: `I am writing to provide formal notice of my intent to pursue all available legal remedies regarding the continued inaccurate reporting of the above-referenced account.

Despite multiple rounds of disputes submitted pursuant to my rights under the Fair Credit Reporting Act, this information remains inaccurately reported. This constitutes a willful or negligent violation of the FCRA.

Under FCRA § 616 and § 617, I am entitled to actual damages, statutory damages of up to $1,000 per violation, punitive damages, and attorney's fees and costs. I intend to pursue these remedies unless this matter is fully resolved within 30 days of this notice.

I strongly urge you to investigate immediately and correct or delete the disputed information.`,
  };

  const subject = subjects[type] || `Re: Credit Dispute — ${creditor}`;
  const body = bodies[type] || 'I am writing to dispute inaccurate information on my credit report.';

  return `${name}
${date}

${bureau || 'Credit Reporting Agency'}
Dispute Resolution Department

${subject}

To Whom It May Concern:

${body}

Sincerely,

${name}
[Address]
[City, State, ZIP]
[Phone]
[Email]

Enclosures: Copy of identification, Copy of credit report`;
}

// GET /api/diy/dispute-rounds
app.get('/api/diy/dispute-rounds', diyAuthenticate, async (req, res) => {
  try {
    const db = await loadDiyUsersDB();
    const user = db.users.find(u => u.id === req.diyUser.id);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    res.json({ ok: true, rounds: user.disputeRounds || [] });
  } catch (err) {
    logError('DIY_ROUNDS_GET_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to load dispute rounds' });
  }
});

// POST /api/diy/dispute-rounds — start a new round
app.post('/api/diy/dispute-rounds', diyAuthenticate, async (req, res) => {
  try {
    const { items, sentAt } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'items array is required' });
    }
    const db = await loadDiyUsersDB();
    const user = db.users.find(u => u.id === req.diyUser.id);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const rounds = user.disputeRounds || [];
    const roundNum = rounds.length + 1;
    const now = new Date().toISOString();
    const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const newRound = {
      round: roundNum,
      startedAt: now,
      sentAt: sentAt || now,
      deadline,
      status: 'active',
      items: items.map(item => ({
        creditor: item.creditor || 'Unknown',
        accountNumber: item.accountNumber || '',
        bureau: item.bureau || '',
        outcome: null,
        outcomeAt: null,
        letterType: null,
      })),
    };

    rounds.push(newRound);
    user.disputeRounds = rounds;
    await saveDiyUsersDB(db);
    res.json({ ok: true, round: newRound });
  } catch (err) {
    logError('DIY_ROUNDS_START_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to start dispute round' });
  }
});

// PUT /api/diy/dispute-rounds/:n/outcomes
app.put('/api/diy/dispute-rounds/:n/outcomes', diyAuthenticate, async (req, res) => {
  try {
    const roundNum = parseInt(req.params.n, 10);
    const { outcomes } = req.body || {};
    if (!Array.isArray(outcomes)) return res.status(400).json({ ok: false, error: 'outcomes array required' });

    const db = await loadDiyUsersDB();
    const user = db.users.find(u => u.id === req.diyUser.id);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const round = (user.disputeRounds || []).find(r => r.round === roundNum);
    if (!round) return res.status(404).json({ ok: false, error: 'Round not found' });

    const VALID_OUTCOMES = ['deleted', 'verified', 'updated', 'no_response', 'frivolous', 'not_found', 'pending'];
    const now = new Date().toISOString();

    for (const o of outcomes) {
      const item = round.items.find(i => i.creditor === o.creditor && i.bureau === o.bureau);
      if (item && VALID_OUTCOMES.includes(o.outcome)) {
        item.outcome = o.outcome;
        item.outcomeAt = now;
        if (o.outcome !== 'deleted' && o.outcome !== 'pending') {
          item.letterType = roundNum >= 4 ? 'intent_to_sue'
            : roundNum === 3 ? 'furnisher_623'
            : (OUTCOME_LETTER_MAP[o.outcome] || null);
        } else {
          item.letterType = null;
        }
      }
    }

    if (round.items.every(i => i.outcome === 'deleted')) round.status = 'completed';

    await saveDiyUsersDB(db);
    res.json({ ok: true, round });
  } catch (err) {
    logError('DIY_ROUNDS_OUTCOMES_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to save outcomes' });
  }
});

// POST /api/diy/dispute-rounds/:n/letters
app.post('/api/diy/dispute-rounds/:n/letters', diyAuthenticate, diyRequirePlan(['basic', 'pro']), async (req, res) => {
  try {
    const roundNum = parseInt(req.params.n, 10);
    const db = await loadDiyUsersDB();
    const user = db.users.find(u => u.id === req.diyUser.id);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const round = (user.disputeRounds || []).find(r => r.round === roundNum);
    if (!round) return res.status(404).json({ ok: false, error: 'Round not found' });

    const needLetters = round.items.filter(i => i.letterType && i.outcome !== 'deleted' && i.outcome !== 'pending' && i.outcome !== null);
    if (needLetters.length === 0) return res.status(400).json({ ok: false, error: 'No items require follow-up letters' });

    const lettersDb = await loadDiyLettersDB();
    const userName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    const generated = [];

    for (const item of needLetters) {
      const content = generateFollowUpLetterContent({ type: item.letterType, creditor: item.creditor, bureau: item.bureau, userName });
      const letter = {
        id: nanoid(12),
        userId: user.id,
        bureau: item.bureau || 'General',
        creditor: item.creditor,
        letterType: item.letterType,
        disputeRound: roundNum + 1,
        content,
        createdAt: new Date().toISOString(),
      };
      lettersDb.letters.push(letter);
      generated.push({ id: letter.id, bureau: letter.bureau, creditor: letter.creditor, letterType: letter.letterType, createdAt: letter.createdAt });
    }

    await saveDiyLettersDB(lettersDb);
    res.json({ ok: true, letters: generated, nextRound: roundNum + 1 });
  } catch (err) {
    logError('DIY_ROUND_LETTERS_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to generate follow-up letters' });
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
// CFPB COMPLAINT GENERATOR (DIY)
// ============================================================================

app.get('/api/diy/negative-items', diyAuthenticate, async (req, res) => {
  try {
    const db = await loadDiyReportsDB();
    const userReports = db.reports.filter(r => r.userId === req.diyUser.id).sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
    const latestReport = userReports[0];
    if (!latestReport) return res.json({ ok: true, items: [] });
    let items = [];
    if (latestReport.data && Array.isArray(latestReport.data.negative_items)) {
      items = latestReport.data.negative_items.map((ni, idx) => ({
        id: ni.id || `ni_${idx}`,
        name: ni.creditor || ni.creditor_name || 'Unknown',
        accountNumber: ni.account_number || (ni.account_numbers ? Object.values(ni.account_numbers).filter(Boolean).join(', ') : ''),
        bureaus: Array.isArray(ni.bureaus) ? ni.bureaus : (ni.bureau ? [ni.bureau] : []),
        balance: ni.balance || ni.current_balance || '',
        status: ni.status || ni.account_status || '',
      }));
    } else if (latestReport.data && Array.isArray(latestReport.data.tradelines)) {
      items = latestReport.data.tradelines
        .filter(tl => {
          const status = (tl.account_status || tl.status || '').toLowerCase();
          const rating = (tl.payment_rating || '').toLowerCase();
          return status.includes('derog') || status.includes('collection') || status.includes('charge') || status.includes('late') || rating.includes('late') || rating.includes('derog');
        })
        .map((tl, idx) => ({
          id: tl.id || `tl_${idx}`,
          name: tl.meta?.creditor || tl.creditor || tl.creditor_name || 'Unknown',
          accountNumber: tl.meta?.account_numbers ? Object.values(tl.meta.account_numbers).filter(Boolean).join(', ') : '',
          bureaus: tl.per_bureau ? Object.keys(tl.per_bureau) : [],
          balance: tl.balance || tl.current_balance || '',
          status: tl.account_status || tl.status || '',
        }));
    } else {
      const violations = latestReport.violations || [];
      items = violations.map((v, idx) => ({
        id: v.id || `v_${idx}`,
        name: v.creditorName || v.creditor || v.accountName || 'Unknown',
        accountNumber: v.accountNumber || v.account_number || '',
        bureaus: v.bureau ? [v.bureau] : (Array.isArray(v.bureaus) ? v.bureaus : []),
        balance: v.balance || '',
        status: v.status || v.remark || v.description || '',
      }));
    }
    res.json({ ok: true, items });
  } catch (e) {
    logError('DIY_NEGATIVE_ITEMS_ERROR', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

const diyProofUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/diy/cfpb-proof', diyAuthenticate, diyProofUpload.array('files', 5), async (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ ok: false, error: "No files uploaded" });
    const userId = req.diyUser.id;
    const results = [];
    for (const file of req.files) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!SAFE_PROOF_MIMES[ext]) continue;
      const storedName = `cfpb_proof_${Date.now()}_${nanoid(6)}${ext}`;
      const objectKey = objStore.diyFileKey(userId, storedName);
      await objStore.uploadFile(objectKey, file.buffer, SAFE_PROOF_MIMES[ext]);
      results.push({ key: storedName, name: file.originalname || storedName, size: file.size });
    }
    res.json({ ok: true, files: results });
  } catch (e) {
    logError('DIY_CFPB_PROOF_UPLOAD_ERROR', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/diy/cfpb-proof/:filename', diyAuthenticate, async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    if (!filename.startsWith('cfpb_proof_')) return res.status(400).json({ ok: false, error: "Invalid filename" });
    const ext = path.extname(filename).toLowerCase();
    const safeMime = SAFE_PROOF_MIMES[ext] || 'application/octet-stream';
    const objectKey = objStore.diyFileKey(req.diyUser.id, filename);
    const exists = await objStore.fileExists(objectKey);
    if (!exists) return res.status(404).json({ ok: false, error: "File not found" });
    res.set({ 'Content-Type': safeMime, 'Content-Disposition': `attachment; filename="${filename}"` });
    const stream = await objStore.downloadFileStream(objectKey);
    stream.pipe(res);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ ok: false, error: e.message });
  }
});

async function loadDiyCfpbDB() {
  let db = await readKey('diy_cfpb_complaints', null);
  if (!db || typeof db !== 'object') db = { complaints: [] };
  if (!Array.isArray(db.complaints)) db.complaints = [];
  return db;
}

app.post('/api/diy/cfpb-complaint', diyAuthenticate, async (req, res) => {
  try {
    const user = req.diyUser;
    const { companyName, violationType, otherViolationText, itemsDisputed, disputeSentDate, responseOutcome, additionalNotes, roundJobId, tone, complaintGoal, proofFiles, save: saveRecord } = req.body || {};
    if (!companyName) return res.status(400).json({ ok: false, error: 'companyName is required' });
    const consumerName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'the consumer';
    const consumerState = user.state || '';
    const violationDesc = CFPB_VIOLATION_LABELS[violationType] || otherViolationText || 'Violation of consumer credit reporting laws (FCRA)';
    const itemsList = Array.isArray(itemsDisputed) ? itemsDisputed.filter(Boolean) : (itemsDisputed ? [itemsDisputed] : []);
    const { system, userPrompt: userMsg } = (() => { const p = buildCfpbPrompt({ consumerName, consumerState, companyName, violationDesc, itemsList, disputeSentDate, responseOutcome, additionalNotes, tone: tone || 'professional', complaintGoal: complaintGoal || '' }); return { system: p.system, userPrompt: p.user }; })();
    const rawText = await callOpenAiText({ system, user: userMsg });
    const { narrative, resolution } = parseCfpbOutput(rawText);
    if (saveRecord) {
      const db = await loadDiyCfpbDB();
      const entry = { id: `cfpb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, userId: user.id, companyName, violationType, narrative, resolution, itemsDisputed: itemsList, disputeSentDate, tone: tone || 'professional', complaintGoal: complaintGoal || '', roundJobId: roundJobId || null, generatedAt: new Date().toISOString() };
      if (Array.isArray(proofFiles) && proofFiles.length) entry.proofFiles = proofFiles;
      db.complaints.push(entry);
      await writeKey('diy_cfpb_complaints', db);
    }
    res.json({ ok: true, narrative, resolution });
  } catch (e) {
    logError('DIY_CFPB_ERROR', 'Failed to generate DIY CFPB complaint', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/diy/cfpb-complaints', diyAuthenticate, async (req, res) => {
  try {
    const db = await loadDiyCfpbDB();
    const complaints = db.complaints.filter(c => c.userId === req.diyUser.id).sort((a, b) => new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0));
    res.json({ ok: true, complaints });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================================
// END DIY ROUTES
// ============================================================================

// ============================================================================
// STRIPE SUBSCRIPTION ROUTES
// ============================================================================

app.get('/api/stripe/publishable-key', async (_req, res) => {
  try {
    const key = await getStripePublishableKey();
    res.json({ ok: true, publishableKey: key });
  } catch (err) {
    res.json({ ok: false, publishableKey: null });
  }
});

app.get('/api/stripe/products', async (_req, res) => {
  try {
    const result = await pgQuery(`
      SELECT p.id, p.name, p.description, p.metadata, p.active,
             pr.id as price_id, pr.unit_amount, pr.currency, pr.recurring, pr.active as price_active
      FROM stripe.products p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
      ORDER BY p.metadata->>'type', pr.unit_amount
    `);

    const productsMap = new Map();
    for (const row of result.rows) {
      if (!productsMap.has(row.id)) {
        const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
        productsMap.set(row.id, {
          id: row.id,
          name: row.name,
          description: row.description,
          metadata: meta,
          type: meta.type || 'crm',
          tier: meta.tier || '',
          prices: []
        });
      }
      if (row.price_id) {
        const recurring = typeof row.recurring === 'string' ? JSON.parse(row.recurring) : (row.recurring || {});
        productsMap.get(row.id).prices.push({
          id: row.price_id,
          unit_amount: row.unit_amount,
          currency: row.currency || 'usd',
          interval: recurring.interval || 'month'
        });
      }
    }

    const products = Array.from(productsMap.values());
    res.json({ ok: true, products });
  } catch (err) {
    logError('STRIPE_PRODUCTS_ERROR', err);
    res.json({ ok: true, products: [] });
  }
});

app.post('/api/stripe/checkout', async (req, res) => {
  try {
    const { priceId, mode = 'crm', userId, email } = req.body;
    if (!priceId) {
      return res.status(400).json({ ok: false, error: 'Price ID required' });
    }

    const stripe = await getUncachableStripeClient();
    const base = `${req.protocol}://${req.get('host')}`;

    let customerId = null;

    if (mode === 'diy' && userId) {
      const db = await loadDiyUsersDB();
      const user = db.users.find(u => u.id === userId);
      if (user?.stripeCustomerId) {
        customerId = user.stripeCustomerId;
      } else if (user) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user.id, mode: 'diy' }
        });
        customerId = customer.id;
        user.stripeCustomerId = customerId;
        await saveDiyUsersDB(db);
      }
    } else if (mode === 'crm' && req.user) {
      const usersDb = await loadUsersDB();
      const crmUser = usersDb.users.find(u => u.id === req.user.id);
      if (crmUser?.stripeCustomerId) {
        customerId = crmUser.stripeCustomerId;
      } else if (crmUser) {
        const customer = await stripe.customers.create({
          email: crmUser.email || crmUser.username,
          metadata: { userId: crmUser.id, mode: 'crm', tenantId: crmUser.tenantId || '' }
        });
        customerId = customer.id;
        crmUser.stripeCustomerId = customerId;
        await writeKey('users', usersDb);
      }
    }

    const successUrl = mode === 'diy'
      ? `${base}/diy/dashboard?subscription=success&session_id={CHECKOUT_SESSION_ID}`
      : `${base}/billing?subscription=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = mode === 'diy'
      ? `${base}/diy/dashboard?subscription=canceled`
      : `${base}/billing?subscription=canceled`;

    const sessionParams = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    if (customerId) {
      sessionParams.customer = customerId;
    } else if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sessionParams.customer_email = email;
    }

    sessionParams.metadata = { mode, userId: userId || '' };
    sessionParams.subscription_data = { metadata: { mode, userId: userId || '' } };

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ ok: true, url: session.url, sessionId: session.id });
  } catch (err) {
    logError('STRIPE_CHECKOUT_ERROR', err);
    let userMessage = 'Checkout failed. Please try again.';
    if (err?.type === 'StripeAuthenticationError') {
      userMessage = 'Payment system configuration error. Please contact support.';
    } else if (err?.type === 'StripeConnectionError') {
      userMessage = 'Unable to reach the payment processor. Please try again in a moment.';
    }
    res.status(500).json({ ok: false, error: userMessage });
  }
});

app.post('/api/stripe/portal', async (req, res) => {
  try {
    const { customerId, mode = 'crm' } = req.body;
    if (!customerId) {
      return res.status(400).json({ ok: false, error: 'Customer ID required' });
    }

    const stripe = await getUncachableStripeClient();
    const base = `${req.protocol}://${req.get('host')}`;
    const returnUrl = mode === 'diy' ? `${base}/diy/dashboard` : `${base}/billing`;

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl
    });

    res.json({ ok: true, url: session.url });
  } catch (err) {
    logError('STRIPE_PORTAL_ERROR', err);
    res.status(500).json({ ok: false, error: 'Portal session failed' });
  }
});

app.get('/api/stripe/subscription-status', optionalAuth, async (req, res) => {
  try {
    const { customerId, userId, mode = 'crm' } = req.query;
    let stripeCustomerId = customerId;

    if (!stripeCustomerId && mode === 'diy' && userId) {
      const db = await loadDiyUsersDB();
      const user = db.users.find(u => u.id === userId);
      stripeCustomerId = user?.stripeCustomerId;
    } else if (!stripeCustomerId && mode === 'crm' && req.user) {
      const usersDb = await loadUsersDB();
      const crmUser = usersDb.users.find(u => u.id === req.user.id);
      stripeCustomerId = crmUser?.stripeCustomerId;
    }

    if (!stripeCustomerId) {
      return res.json({ ok: true, subscription: null, plan: mode === 'diy' ? 'free' : null });
    }

    const result = await pgQuery(`
      SELECT s.id, s.status, s.current_period_start, s.current_period_end,
             s.cancel_at_period_end, s.metadata,
             si.price as price_id
      FROM stripe.subscriptions s
      LEFT JOIN stripe.subscription_items si ON si.subscription = s.id
      WHERE s.customer = $1
        AND s.status IN ('active', 'trialing', 'past_due')
      ORDER BY s.created DESC
      LIMIT 1
    `, [stripeCustomerId]);

    if (result.rows.length === 0) {
      return res.json({ ok: true, subscription: null, plan: mode === 'diy' ? 'free' : null });
    }

    const sub = result.rows[0];
    let plan = null;

    if (sub.price_id) {
      const priceResult = await pgQuery(`
        SELECT pr.id, pr.unit_amount, pr.recurring,
               p.name, p.metadata as product_metadata
        FROM stripe.prices pr
        JOIN stripe.products p ON pr.product = p.id
        WHERE pr.id = $1
      `, [sub.price_id]);

      if (priceResult.rows.length > 0) {
        const priceRow = priceResult.rows[0];
        const prodMeta = typeof priceRow.product_metadata === 'string' ? JSON.parse(priceRow.product_metadata) : (priceRow.product_metadata || {});
        plan = prodMeta.tier || priceRow.name?.toLowerCase() || null;
      }
    }

    res.json({
      ok: true,
      subscription: {
        id: sub.id,
        status: sub.status,
        currentPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: sub.cancel_at_period_end
      },
      plan,
      customerId: stripeCustomerId
    });
  } catch (err) {
    logError('STRIPE_SUB_STATUS_ERROR', err);
    res.json({ ok: true, subscription: null, plan: null });
  }
});

const CRM_TIER_FEATURES = {
  starter: {
    maxClients: 25,
    canBulkAutomate: false,
    canUseAiLetters: false,
    canWhiteLabel: false,
    canAccessApi: false,
    teamSeats: 1
  },
  growth: {
    maxClients: -1,
    canBulkAutomate: true,
    canUseAiLetters: true,
    canWhiteLabel: false,
    canAccessApi: false,
    teamSeats: 5
  },
  enterprise: {
    maxClients: -1,
    canBulkAutomate: true,
    canUseAiLetters: true,
    canWhiteLabel: true,
    canAccessApi: true,
    teamSeats: -1
  }
};

app.get('/api/stripe/feature-access', optionalAuth, async (req, res) => {
  try {
    const { mode = 'crm', userId } = req.query;

    if (mode === 'diy' && userId) {
      const db = await loadDiyUsersDB();
      const user = db.users.find(u => u.id === userId);
      if (!user) return res.json({ ok: true, plan: 'free', features: DIY_PLAN_LIMITS.free });

      if (user.stripeCustomerId && pgPool) {
        try {
          const subResult = await pgQuery(`
            SELECT s.status, si.price as price_id
            FROM stripe.subscriptions s
            LEFT JOIN stripe.subscription_items si ON si.subscription = s.id
            WHERE s.customer = $1 AND s.status IN ('active', 'trialing')
            ORDER BY s.created DESC LIMIT 1
          `, [user.stripeCustomerId]);

          if (subResult.rows.length > 0) {
            const priceResult = await pgQuery(`
              SELECT p.metadata FROM stripe.prices pr
              JOIN stripe.products p ON pr.product = p.id
              WHERE pr.id = $1
            `, [subResult.rows[0].price_id]);

            if (priceResult.rows.length > 0) {
              const meta = typeof priceResult.rows[0].metadata === 'string'
                ? JSON.parse(priceResult.rows[0].metadata)
                : (priceResult.rows[0].metadata || {});
              const tier = meta.tier || 'basic';
              return res.json({ ok: true, plan: tier, features: DIY_PLAN_LIMITS[tier] || DIY_PLAN_LIMITS.basic });
            }
          }
        } catch (err) {
          console.warn('Feature access check fallback:', err.message);
        }
      }

      return res.json({ ok: true, plan: user.plan, features: DIY_PLAN_LIMITS[user.plan] || DIY_PLAN_LIMITS.free });
    }

    if (!req.user) {
      return res.json({ ok: true, plan: null, features: CRM_TIER_FEATURES.starter });
    }

    const usersDb = await loadUsersDB();
    const crmUser = usersDb.users.find(u => u.id === req.user.id);

    if (crmUser?.stripeCustomerId && pgPool) {
      try {
        const subResult = await pgQuery(`
          SELECT s.status, si.price as price_id
          FROM stripe.subscriptions s
          LEFT JOIN stripe.subscription_items si ON si.subscription = s.id
          WHERE s.customer = $1 AND s.status IN ('active', 'trialing')
          ORDER BY s.created DESC LIMIT 1
        `, [crmUser.stripeCustomerId]);

        if (subResult.rows.length > 0) {
          const priceResult = await pgQuery(`
            SELECT p.metadata FROM stripe.prices pr
            JOIN stripe.products p ON pr.product = p.id
            WHERE pr.id = $1
          `, [subResult.rows[0].price_id]);

          if (priceResult.rows.length > 0) {
            const meta = typeof priceResult.rows[0].metadata === 'string'
              ? JSON.parse(priceResult.rows[0].metadata)
              : (priceResult.rows[0].metadata || {});
            const tier = meta.tier || 'starter';
            return res.json({ ok: true, plan: tier, features: CRM_TIER_FEATURES[tier] || CRM_TIER_FEATURES.starter });
          }
        }
      } catch (err) {
        console.warn('CRM feature access check fallback:', err.message);
      }
    }

    return res.json({ ok: true, plan: null, features: CRM_TIER_FEATURES.starter });
  } catch (err) {
    logError('FEATURE_ACCESS_ERROR', err);
    res.json({ ok: true, plan: null, features: CRM_TIER_FEATURES.starter });
  }
});

// ============================================================================
// END STRIPE SUBSCRIPTION ROUTES
// ============================================================================

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const LAN_IP = (() => {
  const nets = os.networkInterfaces();
  for (const interfaces of Object.values(nets)) {
    for (const net of interfaces || []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
})();
async function initStripeSubscriptions() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('DATABASE_URL not set — Stripe subscription sync disabled');
    return;
  }
  const INIT_TIMEOUT = 15000;
  const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms))
  ]);
  try {
    const { runMigrations } = await import('stripe-replit-sync');
    console.log('Initializing Stripe schema...');
    await withTimeout(runMigrations({ databaseUrl }), INIT_TIMEOUT, 'Stripe migrations');
    console.log('Stripe schema ready');

    const stripeSync = await withTimeout(getStripeSync(), INIT_TIMEOUT, 'Stripe sync init');

    const webhookBaseUrl = `https://${(process.env.REPLIT_DOMAINS || '').split(',')[0]}`;
    if (webhookBaseUrl !== 'https://') {
      console.log('Setting up managed webhook...');
      try {
        const result = await withTimeout(
          stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`),
          INIT_TIMEOUT,
          'Webhook setup'
        );
        console.log(`Webhook configured: ${result?.webhook?.url || 'ready'}`);
      } catch (whErr) {
        console.warn('Managed webhook setup note:', whErr.message);
      }
    }

    console.log('Syncing Stripe data...');
    stripeSync.syncBackfill()
      .then(() => console.log('Stripe data synced'))
      .catch((err) => console.error('Error syncing Stripe data:', err));
  } catch (error) {
    if (error?.type === 'StripeAuthenticationError' || (error?.message || '').includes('Invalid API Key')) {
      console.error('STRIPE KEY ERROR: The Stripe API key is invalid. In production, update your live Stripe keys in the Publish settings.');
    }
    console.error('Failed to initialize Stripe subscriptions:', error.message);
  }
}

// DIY Update Profile
app.put('/api/diy/profile', diyAuthenticate, async (req, res) => {
  try {
    const { firstName, lastName, phone, address, city, state, zip, wizardStep, wizardCompleted, disputeStrategy, markedSent, badges, scoreGoal } = req.body || {};
    const db = await loadDiyUsersDB();
    const user = db.users.find(u => u.id === req.diyUser.id);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    if (firstName !== undefined) user.firstName = sanitizeSettingString(String(firstName).trim());
    if (lastName !== undefined) user.lastName = sanitizeSettingString(String(lastName).trim());
    if (phone !== undefined) user.phone = sanitizeSettingString(String(phone).trim());
    if (address !== undefined) user.address = sanitizeSettingString(String(address).trim());
    if (city !== undefined) user.city = sanitizeSettingString(String(city).trim());
    if (state !== undefined) user.state = sanitizeSettingString(String(state).trim());
    if (zip !== undefined) user.zip = sanitizeSettingString(String(zip).trim());

    if (wizardStep !== undefined) user.wizardStep = Math.max(1, Math.min(6, parseInt(wizardStep, 10) || 1));
    if (wizardCompleted !== undefined && Array.isArray(wizardCompleted)) user.wizardCompleted = wizardCompleted.filter(s => [1,2,3,4,5,6].includes(s));
    if (disputeStrategy !== undefined && ['basic','advanced','legal',''].includes(disputeStrategy)) {
      if ((disputeStrategy === 'advanced' || disputeStrategy === 'legal') && user.plan === 'free') {
        return res.status(403).json({ ok: false, error: 'Upgrade to a paid plan to use ' + disputeStrategy + ' strategy' });
      }
      user.disputeStrategy = disputeStrategy;
    }
    if (markedSent !== undefined && typeof markedSent === 'object') user.markedSent = markedSent;
    if (badges !== undefined && Array.isArray(badges)) user.badges = badges;
    if (scoreGoal !== undefined) user.scoreGoal = parseInt(scoreGoal, 10) || 0;

    await saveDiyUsersDB(db);
    res.json({ ok: true, user: {
      id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
      phone: user.phone || '', address: user.address || '', city: user.city || '',
      state: user.state || '', zip: user.zip || '', plan: user.plan,
      wizardStep: user.wizardStep || 1, wizardCompleted: user.wizardCompleted || [],
      disputeStrategy: user.disputeStrategy || '', markedSent: user.markedSent || {},
      badges: user.badges || [], scoreGoal: user.scoreGoal || 0,
      disputeRounds: user.disputeRounds || [],
    }});
  } catch (err) {
    logError('DIY_UPDATE_PROFILE_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to update profile' });
  }
});

// DIY Forgot Password
app.post('/api/diy/request-password-reset', async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: "Email is required" });
    if (!checkResetRateLimit("diy-req:" + email, 5)) return res.status(429).json({ ok: false, error: "Too many reset requests. Please try again later." });
    const db = await loadDiyUsersDB();
    const user = db.users.find(u => (u.email || "").toLowerCase() === email);
    if (!user) return res.json({ ok: true });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    user.resetCode = code;
    user.resetCodeExpires = Date.now() + 15 * 60 * 1000;
    await saveDiyUsersDB(db);
    if (mailer) {
      try {
        await mailer.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@evolv.ai",
          to: user.email,
          subject: "Your Evolv Password Reset Code",
          text: `Your password reset code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, please ignore this email.`,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0a0a0a;color:#fff;border-radius:16px"><h2 style="margin:0 0 8px;color:#818cf8">Password Reset</h2><p style="color:rgba(255,255,255,0.6);margin:0 0 24px">Use the code below to reset your password.</p><div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:20px;text-align:center;letter-spacing:8px;font-size:32px;font-weight:700;color:#818cf8">${code}</div><p style="color:rgba(255,255,255,0.4);font-size:13px;margin:20px 0 0">This code expires in 15 minutes. If you did not request this, ignore this email.</p></div>`
        });
      } catch (emailErr) {
        logError("DIY_RESET_EMAIL_FAIL", emailErr);
      }
    } else {
      logWarn("DIY_RESET_NO_MAILER", "No SMTP configured; DIY reset code generated but could not be delivered");
    }
    res.json({ ok: true });
  } catch (err) {
    logError("DIY_REQUEST_RESET_ERROR", err);
    res.status(500).json({ ok: false, error: "Reset request failed" });
  }
});

app.post('/api/diy/reset-password', async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const code = (req.body.code || "").trim();
    const password = req.body.password || "";
    if (!email || !code || !password) return res.status(400).json({ ok: false, error: "Email, code, and new password are required" });
    if (!checkResetRateLimit("diy-verify:" + email, 10)) return res.status(429).json({ ok: false, error: "Too many attempts. Please request a new code." });
    if (password.length < 8) return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
    const db = await loadDiyUsersDB();
    const user = db.users.find(u => (u.email || "").toLowerCase() === email && u.resetCode === code);
    if (!user) return res.status(400).json({ ok: false, error: "Invalid or expired code" });
    if (user.resetCodeExpires && Date.now() > user.resetCodeExpires) {
      delete user.resetCode;
      delete user.resetCodeExpires;
      await saveDiyUsersDB(db);
      return res.status(400).json({ ok: false, error: "Code has expired. Please request a new one." });
    }
    user.password = bcrypt.hashSync(password, 10);
    delete user.resetCode;
    delete user.resetCodeExpires;
    await saveDiyUsersDB(db);
    res.json({ ok: true });
  } catch (err) {
    logError("DIY_RESET_PASSWORD_ERROR", err);
    res.status(500).json({ ok: false, error: "Password reset failed" });
  }
});

// DIY Change Password
app.post('/api/diy/change-password', diyAuthenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ ok: false, error: 'Both current and new password are required' });
    if (newPassword.length < 8) return res.status(400).json({ ok: false, error: 'New password must be at least 8 characters' });

    const db = await loadDiyUsersDB();
    const user = db.users.find(u => u.id === req.diyUser.id);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const isValid = bcrypt.compareSync(currentPassword, user.password);
    if (!isValid) return res.status(400).json({ ok: false, error: 'Current password is incorrect' });

    user.password = bcrypt.hashSync(newPassword, 10);
    await saveDiyUsersDB(db);
    res.json({ ok: true });
  } catch (err) {
    logError('DIY_CHANGE_PASSWORD_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to change password' });
  }
});

// DIY News Feed (RSS Proxy)
app.get('/api/diy/news', diyAuthenticate, async (req, res) => {
  try {
    const settings = await loadSettings();
    const feedUrl = process.env.RSS_FEED_URL || settings.rssFeedUrl || 'https://hnrss.org/frontpage';
    const response = await fetchFn(feedUrl, { timeout: 8000 });
    if (!response || !response.ok) throw new Error('Failed to fetch news feed');
    const xml = await response.text();

    const items = [];
    const isAtom = xml.includes('<feed') && xml.includes('<entry>');
    if (isAtom) {
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
      let match;
      while ((match = entryRegex.exec(xml)) !== null && items.length < 20) {
        const entryXml = match[1];
        const title = (entryXml.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]>|<title[^>]*>(.*?)<\/title>/) || [])[1] || (entryXml.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]>|<title[^>]*>(.*?)<\/title>/) || [])[2] || '';
        const link = (entryXml.match(/<link[^>]+href="([^"]*)"/) || [])[1] || '';
        const summary = (entryXml.match(/<content[^>]*>([\s\S]*?)<\/content>|<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1] || (entryXml.match(/<content[^>]*>([\s\S]*?)<\/content>|<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[2] || '';
        const updated = (entryXml.match(/<updated>(.*?)<\/updated>|<published>(.*?)<\/published>/) || [])[1] || (entryXml.match(/<updated>(.*?)<\/updated>|<published>(.*?)<\/published>/) || [])[2] || '';
        if (title) items.push({ title: decodeXmlEntities(title), link, description: decodeXmlEntities(summary).slice(0, 200), pubDate: updated });
      }
    } else {
      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      let match;
      while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
        const itemXml = match[1];
        const title = (itemXml.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/) || [])[1] || (itemXml.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/) || [])[2] || '';
        const link = (itemXml.match(/<link>(.*?)<\/link>/) || [])[1] || '';
        const description = (itemXml.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/) || [])[1] || (itemXml.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/) || [])[2] || '';
        const pubDate = (itemXml.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
        if (title) items.push({ title: decodeXmlEntities(title), link, description: decodeXmlEntities(description).slice(0, 200), pubDate });
      }
    }
    res.json({ ok: true, items });
  } catch (err) {
    logError('DIY_NEWS_FEED_ERROR', err);
    res.json({ ok: true, items: [] });
  }
});

// DIY Get full profile (with extended fields)
app.get('/api/diy/profile', diyAuthenticate, async (req, res) => {
  try {
    const db = await loadDiyUsersDB();
    const user = db.users.find(u => u.id === req.diyUser.id);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    res.json({
      ok: true,
      user: {
        id: user.id, email: user.email, firstName: user.firstName || '', lastName: user.lastName || '',
        phone: user.phone || '', address: user.address || '', city: user.city || '',
        state: user.state || '', zip: user.zip || '', plan: user.plan, createdAt: user.createdAt,
        stripeCustomerId: user.stripeCustomerId || null,
        wizardStep: user.wizardStep || 1, wizardCompleted: user.wizardCompleted || [],
        disputeStrategy: user.disputeStrategy || '', markedSent: user.markedSent || {},
        badges: user.badges || [], scoreGoal: user.scoreGoal || 0
      }
    });
  } catch (err) {
    logError('DIY_PROFILE_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to load profile' });
  }
});

let pgPool = null;
try {
  if (process.env.DATABASE_URL) {
    pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 10000 });
    pgPool.on('error', (err) => {
      console.error('PostgreSQL pool error (non-fatal):', err.message);
    });
  }
} catch (err) {
  console.warn('Failed to create PostgreSQL pool:', err.message);
}

async function pgQuery(text, params = []) {
  if (!pgPool) throw new Error('PostgreSQL not configured');
  const result = await pgPool.query(text, params);
  return result;
}

const shouldStartServer =
  process.env.NODE_ENV !== "test" || process.env.START_SERVER_IN_TEST === "true";
if (shouldStartServer) {
  app.listen(PORT, HOST, () => {
    const displayHost = HOST === "0.0.0.0" || HOST === "::" ? "localhost" : HOST;
    console.log(`CRM ready    http://${displayHost}:${PORT}`);
    if (LAN_IP && (HOST === "0.0.0.0" || HOST === "::" || HOST === "localhost" || HOST === "127.0.0.1")) {
      console.log(`CRM LAN URL  http://${LAN_IP}:${PORT}`);
    }
    const dbClient = (process.env.DATABASE_CLIENT || (process.env.DATABASE_URL ? "pg" : "sqlite3")).toString();
    console.log(`DB client    ${dbClient}`);
    console.log(`DB URL host  ${(process.env.DATABASE_URL || "").replace(/\/\/.*@/, "//***@").split("/")[2] || "n/a"}`);
    console.log(`Tenant mode  ${(process.env.DB_TENANT_STRATEGY || "partitioned").toString()}`);
    console.log(`Letters dir  ${LETTERS_DIR}`);
    import("./db/connection.js").then(({ testConnection }) => {
      testConnection().then(ok => {
        console.log(`DB connected  ${ok ? "YES" : "NO — database is unreachable"}`);
      });
    }).catch(() => {});
    initStripeSubscriptions().catch(err => console.error('Stripe init error:', err));
    (async () => {
      try {
        const migrated = await readKey('_migration_purge_fake_companies', null);
        if (!migrated) {
          const companiesDb = await loadCreditCompaniesDB();
          const realCompanies = companiesDb.companies.filter(c => c.tenantId);
          const removedIds = new Set(companiesDb.companies.filter(c => !c.tenantId).map(c => c.id));
          await writeKey('credit_companies', { companies: realCompanies });
          if (removedIds.size > 0) {
            const metricsDb = await readKey('credit_company_metrics', { metrics: [] });
            metricsDb.metrics = (metricsDb.metrics || []).filter(m => !removedIds.has(m.companyId));
            await writeKey('credit_company_metrics', metricsDb);
            const boostsDb = await readKey('credit_company_boosts', { boosts: [] });
            boostsDb.boosts = (boostsDb.boosts || []).filter(b => !removedIds.has(b.companyId));
            await writeKey('credit_company_boosts', boostsDb);
          }
          await writeKey('_migration_purge_fake_companies', { done: true, at: new Date().toISOString(), removed: removedIds.size });
          console.log(`Purged ${removedIds.size} fake seed companies from specialist directory (kept ${realCompanies.length} real)`);
        }
      } catch (err) {
        console.error('Migration purge error:', err);
      }
    })();
  });
}

async function migrateAffiliatesIfNeeded() {
  const legacy = await readKey('affiliates', null);
  if (!legacy || !Array.isArray(legacy.affiliates) || legacy.affiliates.length === 0) return;
  for (const aff of legacy.affiliates) {
    const key = `aff:${aff.userType}:${aff.userId}`;
    const existing = await readKey(key, null);
    if (!existing) {
      await writeKey(key, aff);
    }
    if (aff.refCode) {
      await writeKey(`aff_ref:${aff.refCode}`, { userId: aff.userId, userType: aff.userType });
    }
  }
  await writeKey('affiliates', { affiliates: [], migrated: true });
}

let affMigrationDone = false;
async function ensureAffMigration() {
  if (affMigrationDone) return;
  affMigrationDone = true;
  try { await migrateAffiliatesIfNeeded(); } catch (e) { logWarn('AFFILIATE_MIGRATION_ERROR', e.message); affMigrationDone = false; }
}

async function loadAffiliate(userId, userType) {
  await ensureAffMigration();
  return readKey(`aff:${userType}:${userId}`, null);
}

async function saveAffiliate(aff) {
  await writeKey(`aff:${aff.userType}:${aff.userId}`, aff);
}

async function findAffiliateByRefCode(refCode) {
  await ensureAffMigration();
  const ref = await readKey(`aff_ref:${refCode}`, null);
  if (!ref) return null;
  return loadAffiliate(ref.userId, ref.userType);
}

const AFFILIATE_COMMISSIONS = {
  diy_basic: 10, diy_pro: 25, diy_tradeline: 0.10,
  crm_starter: 25, crm_business: 50, crm_enterprise: 100
};

function affiliateAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, DIY_JWT_SECRET, { issuer: 'metro2-diy', audience: 'diy-users' });
    req.affUser = { id: payload.id, type: 'diy' };
    return next();
  } catch {}
  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (payload.role === 'client') {
      req.affUser = { id: payload.id, type: 'client', tenantId: payload.tenantId };
    } else {
      req.affUser = { id: payload.id || payload.username, type: 'crm', tenantId: payload.tenantId };
    }
    return next();
  } catch {}
  return res.status(401).json({ ok: false, error: 'Unauthorized' });
}

async function resolveAffTarget(req) {
  const cid = req.body?.consumerId || req.query?.consumerId;
  if (cid && (req.affUser.type === 'crm' || req.affUser.type === 'client')) {
    if (req.affUser.type === 'crm' && req.affUser.tenantId) {
      const db = await loadDB(req.affUser.tenantId);
      const consumer = db.consumers.find(c => c.id === cid);
      if (!consumer) return null;
      const consTenant = sanitizeTenantId(consumer.tenantId || consumer.ownerTenantId || DEFAULT_TENANT_ID);
      if (consTenant !== sanitizeTenantId(req.affUser.tenantId)) return null;
    }
    return { id: cid, type: 'client' };
  }
  return { id: req.affUser.id, type: req.affUser.type };
}

const affJoinLocks = new Map();
app.post('/api/affiliate/join', affiliateAuth, async (req, res) => {
  const target = await resolveAffTarget(req);
  if (!target) return res.status(403).json({ ok: false, error: 'Access denied' });
  const lockKey = `${target.type}:${target.id}`;
  if (affJoinLocks.has(lockKey)) {
    try { await affJoinLocks.get(lockKey); } catch {}
  }
  let resolve;
  const lockPromise = new Promise(r => { resolve = r; });
  affJoinLocks.set(lockKey, lockPromise);
  try {
    let aff = await loadAffiliate(target.id, target.type);
    if (aff) {
      if (aff.refCode) {
        const refIndex = await readKey(`aff_ref:${aff.refCode}`, null);
        if (!refIndex) await writeKey(`aff_ref:${aff.refCode}`, { userId: aff.userId, userType: aff.userType });
      }
      return res.json({ ok: true, affiliate: aff });
    }
    aff = {
      id: nanoid(12),
      userId: target.id,
      userType: target.type,
      refCode: nanoid(8),
      clicks: 0,
      referrals: [],
      totalEarned: 0,
      totalPaid: 0,
      createdAt: new Date().toISOString()
    };
    await saveAffiliate(aff);
    await writeKey(`aff_ref:${aff.refCode}`, { userId: aff.userId, userType: aff.userType });
    res.json({ ok: true, affiliate: aff });
  } catch (err) {
    logError('AFFILIATE_JOIN_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to join' });
  } finally {
    resolve();
    affJoinLocks.delete(lockKey);
  }
});

function calcAffiliateBalance(aff) {
  const payouts = aff.payouts || [];
  const pendingPayoutTotal = payouts.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);
  const availableBalance = Math.max(0, (aff.totalEarned || 0) - (aff.totalPaid || 0) - pendingPayoutTotal);
  return { pendingPayoutTotal, availableBalance, pendingPayoutCount: payouts.filter(p => p.status === 'pending').length };
}

app.get('/api/affiliate/me', affiliateAuth, async (req, res) => {
  try {
    const target = await resolveAffTarget(req);
    if (!target) return res.status(403).json({ ok: false, error: 'Access denied' });
    const aff = await loadAffiliate(target.id, target.type);
    if (!aff) return res.json({ ok: true, affiliate: null });
    const conversions = (aff.referrals || []).length;
    const conversionRate = aff.clicks > 0 ? ((conversions / aff.clicks) * 100).toFixed(1) : '0.0';
    const bal = calcAffiliateBalance(aff);
    res.json({ ok: true, affiliate: aff, stats: { clicks: aff.clicks, conversions, conversionRate, totalEarned: aff.totalEarned, totalPaid: aff.totalPaid, availableBalance: bal.availableBalance, pendingPayoutTotal: bal.pendingPayoutTotal, pendingPayoutCount: bal.pendingPayoutCount } });
  } catch (err) {
    logError('AFFILIATE_ME_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to load' });
  }
});

app.post('/api/affiliate/payout', affiliateAuth, async (req, res) => {
  try {
    const target = await resolveAffTarget(req);
    if (!target) return res.status(403).json({ ok: false, error: 'Access denied' });
    const aff = await loadAffiliate(target.id, target.type);
    if (!aff) return res.status(404).json({ ok: false, error: 'Affiliate not found' });
    const { method, payoutEmail, details } = req.body;
    if (!method || !['paypal', 'venmo', 'check'].includes(method)) {
      return res.status(400).json({ ok: false, error: 'Invalid payout method. Choose paypal, venmo, or check.' });
    }
    if ((method === 'paypal' || method === 'venmo') && !payoutEmail) {
      return res.status(400).json({ ok: false, error: 'Payout email/username is required for ' + method });
    }
    const bal = calcAffiliateBalance(aff);
    if (bal.availableBalance <= 0) {
      return res.status(400).json({ ok: false, error: 'No available balance for payout' });
    }
    const amount = parseFloat(req.body.amount) || bal.availableBalance;
    const finalAmount = Math.min(amount, bal.availableBalance);
    if (finalAmount <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid payout amount' });
    }
    if (!aff.payouts) aff.payouts = [];
    const payout = {
      id: nanoid(10),
      amount: Math.round(finalAmount * 100) / 100,
      status: 'pending',
      method,
      payoutEmail: payoutEmail || '',
      details: details || '',
      requestedAt: new Date().toISOString(),
      processedAt: null
    };
    aff.payouts.push(payout);
    await saveAffiliate(aff);
    res.json({ ok: true, payout });
  } catch (err) {
    logError('AFFILIATE_PAYOUT_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to request payout' });
  }
});

app.get('/api/affiliate/payouts', affiliateAuth, async (req, res) => {
  try {
    const target = await resolveAffTarget(req);
    if (!target) return res.status(403).json({ ok: false, error: 'Access denied' });
    const aff = await loadAffiliate(target.id, target.type);
    if (!aff) return res.status(404).json({ ok: false, error: 'Affiliate not found' });
    res.json({ ok: true, payouts: aff.payouts || [] });
  } catch (err) {
    logError('AFFILIATE_PAYOUTS_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to load payouts' });
  }
});

app.post('/api/affiliate/payout/:id/cancel', affiliateAuth, async (req, res) => {
  try {
    const target = await resolveAffTarget(req);
    if (!target) return res.status(403).json({ ok: false, error: 'Access denied' });
    const aff = await loadAffiliate(target.id, target.type);
    if (!aff) return res.status(404).json({ ok: false, error: 'Affiliate not found' });
    const payout = (aff.payouts || []).find(p => p.id === req.params.id);
    if (!payout) return res.status(404).json({ ok: false, error: 'Payout not found' });
    if (payout.status !== 'pending') return res.status(400).json({ ok: false, error: 'Only pending payouts can be cancelled' });
    payout.status = 'cancelled';
    payout.processedAt = new Date().toISOString();
    await saveAffiliate(aff);
    res.json({ ok: true, payout });
  } catch (err) {
    logError('AFFILIATE_PAYOUT_CANCEL_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to cancel payout' });
  }
});

app.get('/api/affiliate/track/:refCode', async (req, res) => {
  const refCode = req.params.refCode;
  const qs = new URLSearchParams({ ref: refCode, source: 'Affiliate Referral' });

  try {
    const aff = await findAffiliateByRefCode(refCode);
    if (aff) {
      try {
        aff.clicks = (aff.clicks || 0) + 1;
        await saveAffiliate(aff);
      } catch (saveErr) {
        logWarn('AFFILIATE_CLICK_SAVE_ERROR', saveErr.message);
      }
    }
  } catch (lookupErr) {
    logWarn('AFFILIATE_TRACK_LOOKUP_ERROR', lookupErr.message);
  }

  res.redirect(`/lead-capture?${qs.toString()}`);
});

app.get('/api/admin/affiliates', authenticate, forbidMember, async (req, res) => {
  try {
    const keys = await listKeys();
    const affKeys = keys.filter(k => {
      const key = typeof k === 'string' ? k : k.key;
      return key.startsWith('aff:');
    });

    let diyUsersDb = null;
    let consumersDb = null;
    let crmUsersDb = null;
    function resolveAffUserInfo(aff) {
      let name = '';
      let email = '';
      if (aff.userType === 'diy') {
        if (!diyUsersDb) return { name: aff.userId, email: '' };
        const u = diyUsersDb.users.find(u => u.id === aff.userId);
        if (u) {
          name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || aff.userId;
          email = u.email || '';
        } else {
          name = aff.userId;
        }
      } else if (aff.userType === 'client') {
        const c = consumersDb?.consumers?.find(c => c.id === aff.userId);
        if (c) {
          name = c.name || c.email || aff.userId;
          email = c.email || '';
        } else {
          const u = diyUsersDb?.users?.find(u => u.id === aff.userId || u.username === aff.userId);
          if (u) {
            name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.username || aff.userId;
            email = u.email || '';
          } else {
            name = aff.userId;
          }
        }
      } else if (aff.userType === 'crm') {
        if (!crmUsersDb) return { name: aff.userId, email: '' };
        const u = crmUsersDb.users.find(u => u.id === aff.userId || u.username === aff.userId);
        if (u) {
          name = u.name || u.username || aff.userId;
          email = u.email || '';
        } else {
          name = aff.userId;
        }
      } else {
        name = aff.userId;
      }
      return { name, email };
    }

    try { diyUsersDb = await loadDiyUsersDB(); } catch {}
    try { consumersDb = await loadDB(); } catch {}
    try { crmUsersDb = await loadUsersDB(); } catch {}

    const affiliates = [];
    for (const k of affKeys) {
      const key = typeof k === 'string' ? k : k.key;
      const aff = await readKey(key, null);
      if (aff) {
        const conversions = (aff.referrals || []).length;
        const bal = calcAffiliateBalance(aff);
        const userInfo = resolveAffUserInfo(aff);
        affiliates.push({
          id: aff.id,
          userId: aff.userId,
          userType: aff.userType,
          name: userInfo.name,
          email: userInfo.email,
          refCode: aff.refCode,
          clicks: aff.clicks || 0,
          conversions,
          totalEarned: aff.totalEarned || 0,
          totalPaid: aff.totalPaid || 0,
          availableBalance: bal.availableBalance,
          customPrice: aff.customPrice ?? '',
          customCommissionRate: aff.customCommissionRate ?? '',
          createdAt: aff.createdAt
        });
      }
    }
    res.json({ ok: true, affiliates });
  } catch (err) {
    logError('ADMIN_AFFILIATES_LIST_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to load affiliates' });
  }
});

app.post('/api/admin/affiliates/repair-index', authenticate, forbidMember, async (req, res) => {
  try {
    const keys = await listKeys();
    const affKeys = keys.filter(k => {
      const key = typeof k === 'string' ? k : k.key;
      return key.startsWith('aff:');
    });
    let repaired = 0;
    let skipped = 0;
    for (const k of affKeys) {
      const key = typeof k === 'string' ? k : k.key;
      const aff = await readKey(key, null);
      if (!aff || !aff.refCode) { skipped++; continue; }
      const existing = await readKey(`aff_ref:${aff.refCode}`, null);
      if (!existing) {
        await writeKey(`aff_ref:${aff.refCode}`, { userId: aff.userId, userType: aff.userType });
        repaired++;
      } else {
        skipped++;
      }
    }
    res.json({ ok: true, repaired, skipped, total: affKeys.length });
  } catch (err) {
    logError('AFFILIATE_REPAIR_INDEX_ERROR', err);
    res.status(500).json({ ok: false, error: 'Repair failed' });
  }
});

app.patch('/api/admin/affiliates/:affId', authenticate, forbidMember, async (req, res) => {
  try {
    const keys = await listKeys();
    const affKeys = keys.filter(k => {
      const key = typeof k === 'string' ? k : k.key;
      return key.startsWith('aff:');
    });
    let found = null;
    let foundKey = null;
    for (const k of affKeys) {
      const key = typeof k === 'string' ? k : k.key;
      const aff = await readKey(key, null);
      if (aff && aff.id === req.params.affId) {
        found = aff;
        foundKey = key;
        break;
      }
    }
    if (!found) return res.status(404).json({ ok: false, error: 'Affiliate not found' });
    if (req.body.customPrice !== undefined) {
      if (req.body.customPrice === '' || req.body.customPrice === null) {
        found.customPrice = '';
      } else {
        const p = Number(req.body.customPrice);
        if (!isFinite(p) || p < 0 || p > 99999) return res.status(400).json({ ok: false, error: 'Invalid price value' });
        found.customPrice = Math.round(p * 100) / 100;
      }
    }
    if (req.body.customCommissionRate !== undefined) {
      if (req.body.customCommissionRate === '' || req.body.customCommissionRate === null) {
        found.customCommissionRate = '';
      } else {
        const c = Number(req.body.customCommissionRate);
        if (!isFinite(c) || c < 0 || c > 99999) return res.status(400).json({ ok: false, error: 'Invalid commission rate' });
        found.customCommissionRate = Math.round(c * 100) / 100;
      }
    }
    await writeKey(foundKey, found);
    res.json({ ok: true, affiliate: found });
  } catch (err) {
    logError('ADMIN_AFFILIATE_UPDATE_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to update affiliate' });
  }
});

app.get('/api/affiliate/commission-rates', async (req, res) => {
  try {
    const saved = await readKey('affiliate_commission_settings', null);
    const rates = {
      diy_basic: saved?.diy_basic ?? AFFILIATE_COMMISSIONS.diy_basic,
      diy_pro: saved?.diy_pro ?? AFFILIATE_COMMISSIONS.diy_pro,
      diy_tradeline: saved?.diy_tradeline ?? AFFILIATE_COMMISSIONS.diy_tradeline,
      crm_starter: saved?.crm_starter ?? AFFILIATE_COMMISSIONS.crm_starter,
      crm_business: saved?.crm_business ?? AFFILIATE_COMMISSIONS.crm_business,
      crm_enterprise: saved?.crm_enterprise ?? AFFILIATE_COMMISSIONS.crm_enterprise,
    };
    res.json({ ok: true, rates });
  } catch (err) {
    logError('COMMISSION_RATES_GET_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to load commission rates' });
  }
});

app.put('/api/affiliate/commission-rates', authenticate, forbidMember, async (req, res) => {
  try {
    const fields = ['diy_basic', 'diy_pro', 'diy_tradeline', 'crm_starter', 'crm_business', 'crm_enterprise'];
    const update = {};
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        if (req.body[f] === '' || req.body[f] === null) continue;
        const v = Number(req.body[f]);
        if (!isFinite(v) || v < 0 || v > 99999) {
          return res.status(400).json({ ok: false, error: 'Invalid value for ' + f });
        }
        update[f] = Math.round(v * 100) / 100;
      }
    }
    const existing = await readKey('affiliate_commission_settings', {});
    const merged = { ...existing, ...update };
    await writeKey('affiliate_commission_settings', merged);
    const rates = {
      diy_basic: merged.diy_basic ?? AFFILIATE_COMMISSIONS.diy_basic,
      diy_pro: merged.diy_pro ?? AFFILIATE_COMMISSIONS.diy_pro,
      diy_tradeline: merged.diy_tradeline ?? AFFILIATE_COMMISSIONS.diy_tradeline,
      crm_starter: merged.crm_starter ?? AFFILIATE_COMMISSIONS.crm_starter,
      crm_business: merged.crm_business ?? AFFILIATE_COMMISSIONS.crm_business,
      crm_enterprise: merged.crm_enterprise ?? AFFILIATE_COMMISSIONS.crm_enterprise,
    };
    res.json({ ok: true, rates });
  } catch (err) {
    logError('COMMISSION_RATES_PUT_ERROR', err);
    res.status(500).json({ ok: false, error: 'Failed to save commission rates' });
  }
});

registerStaticPage({ paths: "/affiliate", file: "affiliate.html", middlewares: [optionalAuth] });
app.get('/affiliates', (req, res) => res.redirect('/affiliate'));

// ============================================================================
// SOCIAL MEDIA MANAGER — RSS → Facebook Post Generator + Scheduler
// ============================================================================

let RssParser;
try { RssParser = require('rss-parser'); } catch (_) { RssParser = null; }

function stripHtmlTags(str) {
  return String(str ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim();
}

const FB_API = 'https://graph.facebook.com/v20.0';
function getFbConfig(req = null) {
  let origin = (process.env.PUBLIC_BASE_URL || '').trim();
  if (!origin && req) {
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https');
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '');
    if (host) origin = `${proto}://${host}`;
  }
  return {
    appId:       (process.env.FB_APP_ID      || '').trim(),
    appSecret:   (process.env.FB_APP_SECRET  || '').trim(),
    redirectUri: (process.env.FB_REDIRECT_URI || `${origin}/api/social/auth/facebook/callback`).trim(),
  };
}

async function loadSocialDB() {
  const db = await readKey('social_media_db', null);
  return db || { feeds: [], queue: [], connection: null };
}
async function saveSocialDB(db) { await writeKey('social_media_db', db); }

async function fbGraphGet(path, params = {}, token) {
  const qs = new URLSearchParams({ ...params, access_token: token }).toString();
  const res = await fetch(`${FB_API}${path}?${qs}`);
  const json = await res.json();
  if (json && json.error) {
    const fb = json.error;
    const msg = fb.error_user_msg || fb.message || 'Facebook API error';
    const code = fb.code ? ` (code ${fb.code})` : '';
    const err = new Error(`${msg}${code}`);
    err.name = 'FacebookGraphError';
    err.fbErrorCode = fb.code;
    err.fbErrorType = fb.type;
    err.fbErrorSubcode = fb.error_subcode;
    throw err;
  }
  return json;
}
async function fbGraphPost(path, body = {}, token) {
  const res = await fetch(`${FB_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  return res.json();
}

async function fbPublishPost(post, connection) {
  const params = { message: post.content };
  if (post.articleUrl) params.link = post.articleUrl;
  if (post.scheduledAt && new Date(post.scheduledAt) > new Date()) {
    params.scheduled_publish_time = Math.floor(new Date(post.scheduledAt).getTime() / 1000);
    params.published = false;
  }
  return fbGraphPost(`/${connection.pageId}/feed`, params, connection.pageAccessToken);
}

async function buildSocialPostPrompt(article) {
  const system = `You are a social media expert for a credit repair and financial empowerment company. Write a compelling, engaging Facebook post based on the article below. 
Rules:
- Start with a powerful hook line (question, bold statement, or shocking stat)
- Write 2-3 concise paragraphs that provide real value
- End with a clear call-to-action
- Include 3-5 relevant hashtags at the end (#CreditRepair #FinancialFreedom etc.)
- Keep the total post under 500 words
- Write in a conversational, empowering tone — not corporate
- Do NOT include the article title as a header`;
  const user = `Article title: ${article.title}\nArticle description: ${article.contentSnippet || article.content || article.summary || ''}\nArticle URL: ${article.link || ''}`;
  return { system, user };
}

registerStaticPage({ paths: '/social', file: 'facebook-manager.html', middlewares: [authenticate] });

function getTokenStatus(connection) {
  if (!connection) return 'none';
  if (!connection.tokenExpiresAt) return 'ok';
  const expiresAt = new Date(connection.tokenExpiresAt);
  const now = new Date();
  if (expiresAt <= now) return 'expired';
  const daysLeft = (expiresAt - now) / (1000 * 60 * 60 * 24);
  if (daysLeft < 7) return 'expiring_soon';
  return 'ok';
}

app.get('/api/social/status', authenticate, async (req, res) => {
  try {
    const db = await loadSocialDB();
    const { appId, appSecret } = getFbConfig();
    const fbConfigured = !!(appId && appSecret);
    const connection = db.connection || null;
    const scheduledCount = (db.queue || []).filter(p => p.status === 'scheduled').length;
    const publishedCount = (db.queue || []).filter(p => p.status === 'published').length;
    const failedCount = (db.queue || []).filter(p => p.status === 'failed').length;
    const tokenStatus = getTokenStatus(connection);
    res.json({ ok: true, fbConfigured, connection, scheduledCount, publishedCount, failedCount, tokenStatus, rssParserAvailable: !!RssParser });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/social/auth/facebook', authenticate, (req, res) => {
  const { appId, redirectUri } = getFbConfig(req);
  if (!appId) return res.status(400).json({ ok: false, error: 'FB_APP_ID is not configured. Add it in Settings → Social Media / API.' });
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: 'pages_manage_posts,pages_read_engagement,pages_show_list,leads_retrieval',
    response_type: 'code',
    state: nanoid(16),
  });
  res.redirect(`https://www.facebook.com/v20.0/dialog/oauth?${params}`);
});

app.get('/api/social/auth/facebook/callback', authenticate, async (req, res) => {
  try {
    const { appId, appSecret, redirectUri } = getFbConfig(req);
    if (!appId || !appSecret) return res.redirect('/social?error=fb_not_configured');
    const { code } = req.query;
    if (!code) return res.redirect('/social?error=fb_no_code');
    const tokenRes = await fetch(`${FB_API}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`);
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect('/social?error=fb_token_failed');
    const longTokenRes = await fetch(`${FB_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`);
    const longToken = await longTokenRes.json();
    const userToken = longToken.access_token || tokenData.access_token;
    const tokenExpiresAt = longToken.expires_in ? new Date(Date.now() + longToken.expires_in * 1000).toISOString() : null;
    const permissionsData = await fbGraphGet('/me/permissions', {}, userToken);
    const grantedScopes = (permissionsData.data || []).filter(p => p.status === 'granted').map(p => p.permission);
    const pagesData = await fbGraphGet('/me/accounts', {}, userToken);
    const pages = (pagesData.data || []);
    if (!pages.length) return res.redirect('/social?error=no_pages');
    const db = await loadSocialDB();
    const connectedByUserId = req.user?.id || req.user?.username || null;
    if (pages.length === 1) {
      const page = pages[0];
      db.connection = { pageId: page.id, pageName: page.name, pageAccessToken: page.access_token, connectedAt: new Date().toISOString(), tokenExpiresAt, grantedScopes, connectedByUserId };
      if (!db.pendingPagesByUser) db.pendingPagesByUser = {};
      delete db.pendingPagesByUser[connectedByUserId];
      await saveSocialDB(db);
      return res.redirect('/social?connected=1');
    }
    if (!db.pendingPagesByUser) db.pendingPagesByUser = {};
    db.pendingPagesByUser[connectedByUserId] = { pages: pages.map(p => ({ id: p.id, name: p.name, accessToken: p.access_token, category: p.category || '' })), tokenExpiresAt, grantedScopes, connectedByUserId, expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
    await saveSocialDB(db);
    res.redirect('/social?pick_page=1');
  } catch (e) {
    logError('FB_AUTH_CALLBACK_ERROR', e);
    res.redirect('/social?error=fb_auth_failed');
  }
});

app.get('/api/social/pending-pages', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.username || null;
    const db = await loadSocialDB();
    const pending = (db.pendingPagesByUser || {})[userId];
    if (!pending || new Date(pending.expiresAt) < new Date()) {
      return res.json({ ok: false, error: 'No pending page selection or session expired. Please reconnect.' });
    }
    res.json({ ok: true, pages: pending.pages });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/social/auth/pick-page', authenticate, async (req, res) => {
  try {
    const { pageId } = req.body || {};
    if (!pageId) return res.status(400).json({ ok: false, error: 'pageId is required' });
    const userId = req.user?.id || req.user?.username || null;
    const db = await loadSocialDB();
    const pending = (db.pendingPagesByUser || {})[userId];
    if (!pending || new Date(pending.expiresAt) < new Date()) {
      return res.status(400).json({ ok: false, error: 'Page selection session expired. Please reconnect Facebook.' });
    }
    const page = pending.pages.find(p => p.id === pageId);
    if (!page) return res.status(400).json({ ok: false, error: 'Page not found in pending list.' });
    db.connection = { pageId: page.id, pageName: page.name, pageAccessToken: page.accessToken, connectedAt: new Date().toISOString(), tokenExpiresAt: pending.tokenExpiresAt, grantedScopes: pending.grantedScopes, connectedByUserId: pending.connectedByUserId };
    delete db.pendingPagesByUser[userId];
    await saveSocialDB(db);
    res.json({ ok: true, connection: db.connection });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/social/disconnect', authenticate, forbidMember, async (req, res) => {
  try {
    const db = await loadSocialDB();
    db.connection = null;
    db.pendingPages = null;
    await saveSocialDB(db);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/social/page/comments', authenticate, async (req, res) => {
  try {
    const db = await loadSocialDB();
    if (!db.connection) return res.status(400).json({ ok: false, error: 'No Facebook page connected.' });
    const { pageId, pageAccessToken } = db.connection;
    const limit = parseInt(req.query.limit || '25', 10);
    const data = await fbGraphGet(`/${pageId}/feed`, { fields: 'message,story,created_time,from,comments{message,created_time,from}', limit }, pageAccessToken);
    const posts = (data.data || []).slice(0, limit);
    const comments = [];
    for (const post of posts) {
      const postPreview = (post.message || post.story || '').slice(0, 80);
      for (const c of (post.comments?.data || [])) {
        comments.push({ id: c.id, fromName: c.from?.name || 'Unknown', fromId: c.from?.id || null, message: c.message || '', createdAt: c.created_time, postPreview, postId: post.id });
      }
    }
    comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ ok: true, comments: comments.slice(0, limit) });
  } catch (e) {
    logError('SOCIAL_COMMENTS_ERROR', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/social/page/leads', authenticate, async (req, res) => {
  try {
    const db = await loadSocialDB();
    if (!db.connection) return res.status(400).json({ ok: false, error: 'No Facebook page connected.' });
    const { pageId, pageAccessToken } = db.connection;
    const formsData = await fbGraphGet(`/${pageId}/leadgen_forms`, { fields: 'id,name,status', limit: 20 }, pageAccessToken);
    const forms = formsData.data || [];
    const leads = [];
    for (const form of forms.slice(0, 5)) {
      const leadsData = await fbGraphGet(`/${form.id}/leads`, { fields: 'id,created_time,field_data,ad_id', limit: 25 }, pageAccessToken);
      for (const lead of (leadsData.data || [])) {
        const fields = {};
        (lead.field_data || []).forEach(f => { fields[f.name] = (f.values || [])[0] || ''; });
        leads.push({ id: lead.id, formId: form.id, formName: form.name, name: fields.full_name || (fields.first_name ? `${fields.first_name} ${fields.last_name || ''}`.trim() : ''), email: fields.email || '', phone: fields.phone_number || fields.phone || '', adId: lead.ad_id || null, createdAt: lead.created_time, fields });
      }
    }
    leads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ ok: true, leads, formCount: forms.length });
  } catch (e) {
    logError('SOCIAL_LEADS_ERROR', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/social/rss-feeds', authenticate, async (req, res) => {
  try {
    const db = await loadSocialDB();
    res.json({ ok: true, feeds: db.feeds || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/social/rss-feeds', authenticate, forbidMember, async (req, res) => {
  try {
    const { url, name } = req.body || {};
    if (!url) return res.status(400).json({ ok: false, error: 'URL is required' });
    const db = await loadSocialDB();
    if ((db.feeds || []).length >= 20) return res.status(400).json({ ok: false, error: 'Maximum 20 feeds allowed' });
    const feed = { id: nanoid(10), url: url.trim(), name: (name || '').trim() || url.trim(), addedAt: new Date().toISOString(), enabled: true };
    db.feeds = db.feeds || [];
    db.feeds.push(feed);
    await saveSocialDB(db);
    res.json({ ok: true, feed });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/social/rss-feeds/:id', authenticate, forbidMember, async (req, res) => {
  try {
    const db = await loadSocialDB();
    db.feeds = (db.feeds || []).filter(f => f.id !== req.params.id);
    await saveSocialDB(db);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/social/rss-feeds/:id/items', authenticate, async (req, res) => {
  try {
    if (!RssParser) return res.status(503).json({ ok: false, error: 'RSS parser not available. Run npm install rss-parser in the crm directory.' });
    const db = await loadSocialDB();
    const feed = (db.feeds || []).find(f => f.id === req.params.id);
    if (!feed) return res.status(404).json({ ok: false, error: 'Feed not found' });
    const parser = new RssParser({ timeout: 10000, headers: { 'User-Agent': 'EvolvCRM/1.0 RSS Reader' } });
    const parsed = await parser.parseURL(feed.url);
    feed.lastFetched = new Date().toISOString();
    feed.name = feed.name || parsed.title || feed.url;
    await saveSocialDB(db);
    const items = (parsed.items || []).slice(0, 30).map(item => ({
      guid: item.guid || item.id || item.link,
      title: stripHtmlTags(item.title || '(no title)'),
      contentSnippet: stripHtmlTags((item.contentSnippet || item.summary || '').slice(0, 500)),
      link: item.link,
      pubDate: item.pubDate || item.isoDate,
      imageUrl: item.enclosure?.url || null,
    }));
    res.json({ ok: true, feedTitle: parsed.title, items });
  } catch (e) {
    logError('RSS_FETCH_ERROR', e);
    res.status(500).json({ ok: false, error: `Failed to fetch RSS: ${e.message}` });
  }
});

app.post('/api/social/generate-post', authenticate, async (req, res) => {
  try {
    const { title, contentSnippet, link, imageUrl } = req.body || {};
    if (!title) return res.status(400).json({ ok: false, error: 'Article title is required' });
    const article = { title, contentSnippet, content: contentSnippet, link };
    const { system, user } = await buildSocialPostPrompt(article);
    const content = await callOpenAiText({ system, user });
    res.json({ ok: true, content: content.trim(), articleUrl: link, imageUrl: imageUrl || null });
  } catch (e) {
    logError('SOCIAL_GENERATE_POST_ERROR', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/social/queue', authenticate, async (req, res) => {
  try {
    const db = await loadSocialDB();
    const posts = (db.queue || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ ok: true, posts });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/social/queue', authenticate, async (req, res) => {
  try {
    const { content, articleUrl, articleTitle, imageUrl, scheduledAt, publishNow } = req.body || {};
    if (!content) return res.status(400).json({ ok: false, error: 'Post content is required' });
    const db = await loadSocialDB();
    const post = {
      id: nanoid(12),
      content,
      articleUrl: articleUrl || null,
      articleTitle: articleTitle || null,
      imageUrl: imageUrl || null,
      scheduledAt: scheduledAt || null,
      status: scheduledAt ? 'scheduled' : 'draft',
      createdAt: new Date().toISOString(),
      publishedAt: null,
      fbPostId: null,
      error: null,
    };
    if (publishNow && db.connection) {
      try {
        const result = await fbPublishPost(post, db.connection);
        if (result.id) {
          post.status = 'published';
          post.publishedAt = new Date().toISOString();
          post.fbPostId = result.id;
        } else {
          post.status = 'failed';
          post.error = result.error?.message || 'Unknown error';
        }
      } catch (pubErr) {
        post.status = 'failed';
        post.error = pubErr.message;
      }
    }
    db.queue = db.queue || [];
    db.queue.unshift(post);
    if (db.queue.length > 500) db.queue = db.queue.slice(0, 500);
    await saveSocialDB(db);
    res.json({ ok: true, post });
  } catch (e) {
    logError('SOCIAL_QUEUE_ERROR', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/social/queue/:id', authenticate, async (req, res) => {
  try {
    const db = await loadSocialDB();
    const idx = (db.queue || []).findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'Post not found' });
    const post = db.queue[idx];
    const { content, scheduledAt, status } = req.body || {};
    if (content !== undefined) post.content = content;
    if (scheduledAt !== undefined) { post.scheduledAt = scheduledAt; if (scheduledAt && post.status === 'draft') post.status = 'scheduled'; }
    if (status !== undefined && ['draft', 'scheduled'].includes(status)) post.status = status;
    db.queue[idx] = post;
    await saveSocialDB(db);
    res.json({ ok: true, post });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/social/queue/:id', authenticate, async (req, res) => {
  try {
    const db = await loadSocialDB();
    db.queue = (db.queue || []).filter(p => p.id !== req.params.id);
    await saveSocialDB(db);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/social/queue/:id/publish-now', authenticate, async (req, res) => {
  try {
    const db = await loadSocialDB();
    const post = (db.queue || []).find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ ok: false, error: 'Post not found' });
    if (!db.connection) return res.status(400).json({ ok: false, error: 'No Facebook page connected' });
    const result = await fbPublishPost({ ...post, scheduledAt: null }, db.connection);
    if (result.id) {
      post.status = 'published';
      post.publishedAt = new Date().toISOString();
      post.fbPostId = result.id;
      post.error = null;
    } else {
      post.status = 'failed';
      post.error = result.error?.message || 'Unknown error from Facebook';
    }
    await saveSocialDB(db);
    res.json({ ok: true, post });
  } catch (e) {
    logError('SOCIAL_PUBLISH_ERROR', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── New Post Composer: AI content generation ─────────────────────────────────
app.post('/api/social/post/generate-content', authenticate, async (req, res) => {
  try {
    const { topic, tone } = req.body || {};
    if (!topic) return res.status(400).json({ ok: false, error: 'Topic is required' });
    const toneInstruction = tone ? `Write in a ${tone} tone.` : 'Write in a conversational, empowering tone — not corporate.';
    const system = `You are a social media expert for a credit repair and financial empowerment company. Write a compelling, engaging Facebook post about the given topic.
Rules:
- Start with a powerful hook line (question, bold statement, or shocking stat)
- Write 2-3 concise paragraphs that provide real value
- End with a clear call-to-action
- Include 3-5 relevant hashtags at the end (#CreditRepair #FinancialFreedom etc.)
- Keep the total post under 500 words
- ${toneInstruction}
- Do NOT include any title headers`;
    const user = `Topic: ${topic}`;
    const content = await callOpenAiText({ system, user });
    res.json({ ok: true, content: content.trim() });
  } catch (e) {
    logError('SOCIAL_GENERATE_CONTENT_ERROR', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── New Post Composer: Photo upload to Facebook ───────────────────────────────
const socialMediaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.post('/api/social/post/photo', authenticate, socialMediaUpload.single('photo'), async (req, res) => {
  try {
    const db = await loadSocialDB();
    if (!db.connection) return res.status(400).json({ ok: false, error: 'No Facebook page connected' });
    if (!req.file) return res.status(400).json({ ok: false, error: 'No photo file uploaded' });
    if (!req.file.mimetype.startsWith('image/')) return res.status(400).json({ ok: false, error: 'File must be an image (JPG, PNG, GIF, etc.)' });
    const caption = req.body.caption || '';
    const scheduledAt = req.body.scheduledAt || null;
    const publishNow = req.body.publishNow !== 'false';

    const formData = new FormData();
    formData.append('access_token', db.connection.pageAccessToken);
    formData.append('caption', caption);
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    formData.append('source', blob, req.file.originalname || 'photo.jpg');
    if (scheduledAt && !publishNow) {
      formData.append('published', 'false');
      formData.append('scheduled_publish_time', String(Math.floor(new Date(scheduledAt).getTime() / 1000)));
    }

    const fbRes = await fetch(`${FB_API}/${db.connection.pageId}/photos`, { method: 'POST', body: formData });
    const fbJson = await fbRes.json();
    if (fbJson.error) {
      const fb = fbJson.error;
      throw new Error(`${fb.error_user_msg || fb.message} (code ${fb.code})`);
    }

    const post = {
      id: nanoid(12),
      content: caption,
      mediaType: 'photo',
      fbMediaId: fbJson.id || null,
      fbPostId: fbJson.post_id || fbJson.id || null,
      scheduledAt: scheduledAt || null,
      scheduledVia: scheduledAt && !publishNow ? 'facebook' : null,
      status: scheduledAt && !publishNow ? 'scheduled' : 'published',
      publishedAt: publishNow ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
      error: null,
      source: 'composer',
    };
    db.queue = db.queue || [];
    db.queue.unshift(post);
    if (db.queue.length > 500) db.queue = db.queue.slice(0, 500);
    await saveSocialDB(db);
    res.json({ ok: true, post });
  } catch (e) {
    logError('SOCIAL_PHOTO_UPLOAD_ERROR', e.message || String(e), e);
    res.status(500).json({ ok: false, error: e.message || 'Upload failed' });
  }
});

// ── New Post Composer: Video upload to Facebook ───────────────────────────────
app.post('/api/social/post/video', authenticate, socialMediaUpload.single('video'), async (req, res) => {
  try {
    const db = await loadSocialDB();
    if (!db.connection) return res.status(400).json({ ok: false, error: 'No Facebook page connected' });
    if (!req.file) return res.status(400).json({ ok: false, error: 'No video file uploaded' });
    if (!req.file.mimetype.startsWith('video/')) return res.status(400).json({ ok: false, error: 'File must be a video (MP4, MOV, etc.)' });
    const title = req.body.title || '';
    const description = req.body.description || '';
    const scheduledAt = req.body.scheduledAt || null;
    const publishNow = req.body.publishNow !== 'false';

    const formData = new FormData();
    formData.append('access_token', db.connection.pageAccessToken);
    if (title) formData.append('title', title);
    if (description) formData.append('description', description);
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    formData.append('source', blob, req.file.originalname || 'video.mp4');
    if (scheduledAt && !publishNow) {
      formData.append('published', 'false');
      formData.append('scheduled_publish_time', String(Math.floor(new Date(scheduledAt).getTime() / 1000)));
    }

    const fbRes = await fetch(`${FB_API}/${db.connection.pageId}/videos`, { method: 'POST', body: formData });
    const fbJson = await fbRes.json();
    if (fbJson.error) {
      const fb = fbJson.error;
      throw new Error(`${fb.error_user_msg || fb.message} (code ${fb.code})`);
    }

    const post = {
      id: nanoid(12),
      content: description || title,
      mediaType: 'video',
      fbMediaId: fbJson.id || null,
      fbPostId: fbJson.id || null,
      scheduledAt: scheduledAt || null,
      scheduledVia: scheduledAt && !publishNow ? 'facebook' : null,
      status: scheduledAt && !publishNow ? 'scheduled' : 'published',
      publishedAt: publishNow ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
      error: null,
      source: 'composer',
      articleTitle: title || null,
    };
    db.queue = db.queue || [];
    db.queue.unshift(post);
    if (db.queue.length > 500) db.queue = db.queue.slice(0, 500);
    await saveSocialDB(db);
    res.json({ ok: true, post });
  } catch (e) {
    logError('SOCIAL_VIDEO_UPLOAD_ERROR', e.message || String(e), e);
    res.status(500).json({ ok: false, error: e.message || 'Upload failed' });
  }
});

// Background scheduler: publish due posts every 60s
setInterval(async () => {
  try {
    const db = await loadSocialDB();
    if (!db.connection) return;
    const tokenStatus = getTokenStatus(db.connection);
    if (tokenStatus === 'expired') return;
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const due = (db.queue || []).filter(p => {
      if (p.scheduledVia === 'facebook') return false;
      if (p.status === 'scheduled' && p.scheduledAt && new Date(p.scheduledAt) <= now) return true;
      if (p.status === 'failed' && (p.retryCount || 0) < 3 && (!p.lastAttemptAt || new Date(p.lastAttemptAt) <= oneHourAgo)) return true;
      return false;
    });
    if (!due.length) return;
    for (const post of due) {
      try {
        const result = await fbPublishPost({ ...post, scheduledAt: null }, db.connection);
        if (result.id) {
          post.status = 'published'; post.publishedAt = new Date().toISOString(); post.fbPostId = result.id; post.error = null;
          delete post.retryCount; delete post.lastAttemptAt;
        } else {
          post.retryCount = (post.retryCount || 0) + 1;
          post.lastAttemptAt = now.toISOString();
          post.status = 'failed';
          post.error = result.error?.message || 'Facebook error';
        }
      } catch (err) {
        post.retryCount = (post.retryCount || 0) + 1;
        post.lastAttemptAt = now.toISOString();
        post.status = 'failed';
        post.error = err.message;
      }
    }
    await saveSocialDB(db);
  } catch (_) {}
}, 60_000);

// ─── Hourly token health tick ─────────────────────────────────────────────────
async function checkTokenHealth() {
  try {
    const db = await loadSocialDB();
    if (!db.connection) return;
    const status = getTokenStatus(db.connection);
    if (status !== 'ok') {
      console.warn(`[TokenHealth] Facebook token status: ${status}` + (db.connection.tokenExpiresAt ? ` (expires ${db.connection.tokenExpiresAt})` : ''));
    }
  } catch (_) {}
}
checkTokenHealth();
setInterval(checkTokenHealth, 60 * 60 * 1000);

// ─── Autopilot ────────────────────────────────────────────────────────────────
function getDefaultAutopilot() {
  return { enabled: false, postsPerDay: 1, feedIds: 'all', postedGuids: [], lastRunAt: null, nextRunAt: null, history: [] };
}

const AUTOPILOT_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function autopilotNextRunAt(fromDate = new Date()) {
  return new Date(fromDate.getTime() + AUTOPILOT_CHECK_INTERVAL_MS).toISOString();
}

async function runAutopilotCycle(db, force = false) {
  const ap = db.autopilot || getDefaultAutopilot();
  if (!force && !ap.enabled) return;

  const runAt = new Date().toISOString();

  const feedList = db.feeds || [];
  const targetFeeds = ap.feedIds === 'all' ? feedList : feedList.filter(f => (ap.feedIds || []).includes(f.id));
  if (!targetFeeds.length) {
    ap.history = [{ runAt, status: 'skipped', reason: 'No feeds configured' }, ...(ap.history || [])].slice(0, 20);
    ap.nextRunAt = autopilotNextRunAt();
    db.autopilot = ap;
    return;
  }

  if (!RssParser) {
    ap.history = [{ runAt, status: 'skipped', reason: 'RSS parser unavailable' }, ...(ap.history || [])].slice(0, 20);
    ap.nextRunAt = autopilotNextRunAt();
    db.autopilot = ap;
    return;
  }

  // Collect all articles from all target feeds
  const allItems = [];
  for (const feed of targetFeeds) {
    try {
      const parser = new RssParser({ timeout: 8000 });
      const parsed = await parser.parseURL(feed.url);
      for (const it of (parsed.items || [])) {
        const guid = it.guid || it.link || it.title || '';
        if (guid) allItems.push({ ...it, guid, feedName: feed.name, title: stripHtmlTags(it.title || ''), contentSnippet: stripHtmlTags(it.contentSnippet || it.summary || '') });
      }
    } catch (_) {}
  }

  if (!allItems.length) {
    ap.history = [{ runAt, status: 'skipped', reason: 'No articles found in feeds' }, ...(ap.history || [])].slice(0, 20);
    ap.nextRunAt = autopilotNextRunAt();
    db.autopilot = ap;
    return;
  }

  // Sort all items newest-first
  allItems.sort((a, b) => {
    const da = a.isoDate || a.pubDate ? new Date(a.isoDate || a.pubDate) : new Date(0);
    const db2 = b.isoDate || b.pubDate ? new Date(b.isoDate || b.pubDate) : new Date(0);
    return db2 - da;
  });

  const isFirstRun = !(ap.postedGuids || []).length;
  const postedSet = new Set(ap.postedGuids || []);

  if (isFirstRun) {
    // First run: mark all articles as seen, post only the single most recent
    allItems.forEach(it => postedSet.add(it.guid));
    const newest = allItems[0];
    try {
      const { system, user } = await buildSocialPostPrompt(newest);
      const content = await callOpenAiText({ system, user });
      const postId = `ap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const postEntry = { id: postId, content: content.trim(), articleTitle: newest.title || '', articleUrl: newest.link || '', feedName: newest.feedName || '', source: 'autopilot', status: 'scheduled', scheduledAt: runAt, createdAt: runAt };
      (db.queue = db.queue || []).push(postEntry);
      ap.postedGuids = [...postedSet].slice(-2000);
      ap.lastRunAt = runAt;
      ap.nextRunAt = autopilotNextRunAt();
      ap.history = [{ runAt, status: 'success', articleTitle: newest.title || '', postId, count: 1, firstRun: true }, ...(ap.history || [])].slice(0, 20);
    } catch (err) {
      ap.postedGuids = [...postedSet].slice(-2000);
      ap.lastRunAt = runAt;
      ap.nextRunAt = autopilotNextRunAt();
      ap.history = [{ runAt, status: 'error', reason: err.message }, ...(ap.history || [])].slice(0, 20);
    }
    db.autopilot = ap;
    return;
  }

  // Subsequent runs: find all NEW articles (not seen before)
  const newItems = allItems.filter(it => !postedSet.has(it.guid));

  if (!newItems.length) {
    ap.lastRunAt = runAt;
    ap.nextRunAt = autopilotNextRunAt();
    ap.history = [{ runAt, status: 'skipped', reason: 'No new articles since last check' }, ...(ap.history || [])].slice(0, 20);
    db.autopilot = ap;
    return;
  }

  // Post only the single most recent new article — one per cycle
  const candidate = newItems[0];
  try {
    const { system, user } = await buildSocialPostPrompt(candidate);
    const content = await callOpenAiText({ system, user });
    const postId = `ap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const postEntry = { id: postId, content: content.trim(), articleTitle: candidate.title || '', articleUrl: candidate.link || '', feedName: candidate.feedName || '', source: 'autopilot', status: 'scheduled', scheduledAt: runAt, createdAt: runAt };
    (db.queue = db.queue || []).push(postEntry);
    postedSet.add(candidate.guid);
    ap.postedGuids = [...postedSet].slice(-2000);
    ap.lastRunAt = runAt;
    ap.nextRunAt = autopilotNextRunAt();
    ap.history = [{ runAt, status: 'success', articleTitle: candidate.title || '', postId, newRemaining: newItems.length - 1 }, ...(ap.history || [])].slice(0, 20);
  } catch (err) {
    postedSet.add(candidate.guid);
    ap.postedGuids = [...postedSet].slice(-2000);
    ap.lastRunAt = runAt;
    ap.nextRunAt = autopilotNextRunAt();
    ap.history = [{ runAt, status: 'error', reason: err.message }, ...(ap.history || [])].slice(0, 20);
  }
  db.autopilot = ap;
}

// On startup: cap any stale nextRunAt (old 24h cadence values) to 5 min from now
(async () => {
  try {
    const db = await loadSocialDB();
    const ap = db.autopilot || getDefaultAutopilot();
    if (ap.enabled && ap.nextRunAt && new Date(ap.nextRunAt) > new Date(Date.now() + AUTOPILOT_CHECK_INTERVAL_MS)) {
      ap.nextRunAt = autopilotNextRunAt();
      db.autopilot = ap;
      await saveSocialDB(db);
    }
  } catch (_) {}
})();

// Autopilot background loop — checks every 5 minutes for new articles
setInterval(async () => {
  try {
    const db = await loadSocialDB();
    const ap = db.autopilot || getDefaultAutopilot();
    if (!ap.enabled) return;
    if (ap.nextRunAt && new Date(ap.nextRunAt) > new Date()) return;
    await runAutopilotCycle(db);
    await saveSocialDB(db);
  } catch (_) {}
}, AUTOPILOT_CHECK_INTERVAL_MS);

app.get('/api/social/autopilot', authenticate, async (req, res) => {
  try {
    const db = await loadSocialDB();
    const ap = db.autopilot || getDefaultAutopilot();
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const postsToday = (db.queue || []).filter(p => p.source === 'autopilot' && p.createdAt && new Date(p.createdAt) >= todayStart).length;
    const tokenStatus = getTokenStatus(db.connection || null);
    const connection = db.connection ? { pageId: db.connection.pageId, pageName: db.connection.pageName, tokenExpiresAt: db.connection.tokenExpiresAt } : null;
    res.json({ ok: true, autopilot: ap, postsToday, tokenStatus, connection, feeds: (db.feeds || []).map(f => ({ id: f.id, name: f.name })) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/social/autopilot', authenticate, forbidMember, async (req, res) => {
  try {
    const db = await loadSocialDB();
    const ap = db.autopilot || getDefaultAutopilot();
    const { enabled, postsPerDay, feedIds } = req.body || {};
    if (enabled !== undefined) ap.enabled = !!enabled;
    if (postsPerDay !== undefined) ap.postsPerDay = Math.min(4, Math.max(1, Number(postsPerDay) || 1));
    if (feedIds !== undefined) {
      const validFeedIds = (db.feeds || []).map(f => f.id);
      if (feedIds === 'all') {
        ap.feedIds = 'all';
      } else if (Array.isArray(feedIds)) {
        const filtered = feedIds.filter(id => typeof id === 'string' && validFeedIds.includes(id));
        ap.feedIds = filtered.length ? filtered : 'all';
      } else {
        return res.status(400).json({ ok: false, error: 'feedIds must be "all" or an array of valid feed IDs' });
      }
    }
    if (ap.enabled) ap.nextRunAt = autopilotNextRunAt();
    else ap.nextRunAt = null;
    db.autopilot = ap;
    await saveSocialDB(db);
    res.json({ ok: true, autopilot: ap });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/social/autopilot/run-now', authenticate, forbidMember, async (req, res) => {
  try {
    const db = await loadSocialDB();
    if (!(db.feeds || []).length) return res.status(400).json({ ok: false, error: 'No RSS feeds configured. Add a feed first.' });
    await runAutopilotCycle(db, true);
    await saveSocialDB(db);
    const latest = (db.autopilot.history || [])[0];
    if (latest?.status === 'error') return res.status(500).json({ ok: false, error: latest.reason });
    if (latest?.status === 'skipped') return res.json({ ok: true, skipped: true, reason: latest.reason });
    res.json({ ok: true, postId: latest?.postId });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

async function smartCreditIngestReport(consumer, reportData, db) {
  const reportBuffer = smartCreditReportToBuffer(reportData);
  const filename = `smartcredit_report_${Date.now()}.json`;
  let analyzed = { tradelines: [], status: "analyzing" };
  let llmResult = null;

  try {
    llmResult = await runLLMAnalyzer({ buffer: reportBuffer, filename });
    analyzed.tradelines = llmResult.tradelines;
    analyzed.canonical_report = llmResult.canonicalReport;
    analyzed.llm_violations = llmResult.violations;
    analyzed.violations = llmResult.violations;
    analyzed.required_field_violations = llmResult.requiredFieldViolations;
    analyzed.personalInfo = llmResult.personalInfo;
    analyzed.status = "analyzed";
  } catch (e) {
    logError("SMART_CREDIT_LLM_ERROR", "LLM analyzer failed for Smart Credit report", e);
    analyzed.status = "analyzer_failed";
  }

  try {
    const { items } = prepareNegativeItems(analyzed.tradelines || [], {
      inquiries: analyzed.inquiries,
      inquirySummary: analyzed.inquiry_summary,
      personalInfo: analyzed.personalInfo || analyzed.personal_information,
      personalInfoMismatches: analyzed.personalInfoMismatches,
    }, { includeLegacyRules: LEGACY_ANALYZERS_ENABLED });
    analyzed.negative_items = items;
  } catch (e) {
    logError("SMART_CREDIT_NEGATIVE_ITEMS_ERROR", "Failed to prepare negative items", e);
  }

  const rid = nanoid(8);
  const objectKey = objStore.consumerFileKey(consumer.id, `${rid}.json`);
  await objStore.uploadFile(objectKey, reportBuffer, "application/json");
  await addFileMeta(consumer.id, {
    id: rid,
    originalName: filename,
    storedName: `${rid}.json`,
    objectKey,
    size: reportBuffer.length,
    mimetype: "application/json",
    uploadedAt: new Date().toISOString(),
    source: "smart_credit",
  });

  consumer.reports = Array.isArray(consumer.reports) ? consumer.reports : [];
  consumer.reports.unshift({
    id: rid,
    status: analyzed.status || "analyzed",
    uploadedAt: new Date().toISOString(),
    filename,
    size: reportBuffer.length,
    source: "smart_credit",
    summary: {
      tradelines: analyzed?.tradelines?.length || 0,
      negative_items: analyzed?.negative_items?.length || analyzed?.tradelines?.length || 0,
    },
    data: analyzed,
  });

  if (consumer.reports.length >= 2) {
    try {
      const previousReport = consumer.reports[1];
      if (previousReport?.data?.tradelines) {
        const diff = diffReports(previousReport.data, analyzed);
        consumer.reports[0].diff = diff;
      }
    } catch (e) {
      logError("SMART_CREDIT_DIFF_ERROR", "Failed to compute report diff", e, { consumerId: consumer.id, reportId: rid });
    }
  }

  try {
    const scoreText = llmResult?.reportText || JSON.stringify(reportData);
    const extractedScores = extractCreditScores(scoreText);
    if (Object.keys(extractedScores).length) {
      consumer.creditScore = mergeCreditScores(consumer.creditScore, extractedScores);
      await setCreditScore(consumer.id, consumer.creditScore);
      try { await addEvent(consumer.id, "score_change", { scores: extractedScores }); } catch {}
    }
  } catch (e) {
    logError("SMART_CREDIT_SCORE_EXTRACT_FAILED", "Failed to extract credit scores from Smart Credit report", e);
  }

  await saveDB(db);

  await addEvent(consumer.id, "report_uploaded", {
    reportId: rid,
    filename,
    size: reportBuffer.length,
    source: "Smart Credit OAuth",
    ...(consumer.reports[0].diff?.summary || {}),
  });

  return { reportId: rid, tradelines: analyzed.tradelines?.length || 0, status: analyzed.status };
}

async function resolveSmartCreditToken(consumer, db) {
  const expiry = consumer.smartCreditTokenExpiry ? Date.parse(consumer.smartCreditTokenExpiry) : 0;
  const isExpired = !expiry || Date.now() > expiry - 60000;

  if (!isExpired && consumer.smartCreditToken) {
    return consumer.smartCreditToken;
  }

  if (consumer.smartCreditRefreshToken) {
    try {
      const tokenData = await refreshAccessToken(consumer.smartCreditRefreshToken);
      consumer.smartCreditToken = tokenData.accessToken;
      consumer.smartCreditRefreshToken = tokenData.refreshToken;
      consumer.smartCreditTokenExpiry = new Date(
        Date.now() + (tokenData.expiresIn || 3600) * 1000
      ).toISOString();
      await saveDB(db);
      logInfo("SMART_CREDIT_TOKEN_REFRESHED", "Smart Credit token refreshed", { consumerId: consumer.id });
      return tokenData.accessToken;
    } catch (e) {
      logError("SMART_CREDIT_TOKEN_REFRESH_FAILED", "Failed to refresh Smart Credit token", e, { consumerId: consumer.id });
      throw new Error("Smart Credit token expired and refresh failed. Please reconnect your Smart Credit account.");
    }
  }

  if (consumer.smartCreditToken) {
    return consumer.smartCreditToken;
  }

  throw new Error("No Smart Credit token available");
}

function authorizeSmartCreditAccess(req, consumerId) {
  if (!req.user) return false;
  if (req.user.role === "admin") return true;
  if (req.user.role === "member" && (req.user.permissions || []).includes("consumers")) return true;
  if (req.user.role === "client" && req.user.id === consumerId) return true;
  return false;
}

app.get("/api/smartcredit/status", authenticate, async (req, res) => {
  try {
    const configured = isSmartCreditConfigured();
    const consumerId = req.query.consumerId;
    if (consumerId && !authorizeSmartCreditAccess(req, consumerId)) {
      return res.status(403).json({ ok: false, error: "Unauthorized" });
    }
    let linked = false;
    let tokenExpiry = null;
    if (consumerId && configured) {
      const db = await loadDB();
      const consumer = db.consumers.find((c) => c.id === consumerId);
      if (consumer && consumer.smartCreditToken) {
        linked = true;
        tokenExpiry = consumer.smartCreditTokenExpiry || null;
      }
    }
    res.json({ ok: true, configured, linked, tokenExpiry });
  } catch (err) {
    logError("SMART_CREDIT_STATUS_ERROR", "Failed to check Smart Credit status", err);
    res.status(500).json({ ok: false, error: "Failed to check Smart Credit status" });
  }
});

app.get("/api/smartcredit/connect", authenticate, async (req, res) => {
  try {
    const consumerId = req.query.consumerId;
    if (!consumerId) {
      return res.status(400).json({ ok: false, error: "consumerId is required" });
    }
    if (!authorizeSmartCreditAccess(req, consumerId)) {
      return res.status(403).json({ ok: false, error: "Unauthorized" });
    }
    if (!isSmartCreditConfigured()) {
      return res.status(503).json({ ok: false, error: "Smart Credit integration is not configured" });
    }
    const db = await loadDB();
    const consumer = db.consumers.find((c) => c.id === consumerId);
    if (!consumer) {
      return res.status(404).json({ ok: false, error: "Consumer not found" });
    }
    const { url, state } = buildAuthorizationUrl(consumerId);
    consumer.smartCreditOAuthState = state;
    await saveDB(db);
    res.redirect(url);
  } catch (err) {
    logError("SMART_CREDIT_CONNECT_ERROR", "Failed to initiate Smart Credit OAuth", err);
    res.status(500).json({ ok: false, error: "Failed to initiate Smart Credit connection" });
  }
});

app.get("/api/smartcredit/callback", async (req, res) => {
  let consumerId = null;
  try {
    const { code, state, error: oauthError } = req.query;

    if (state) {
      const stateData = parseOAuthState(state);
      if (stateData) consumerId = stateData.consumerId;
    }

    const portalRedirect = consumerId
      ? `/portal/${encodeURIComponent(consumerId)}`
      : "/";

    if (oauthError) {
      logWarn("SMART_CREDIT_OAUTH_DENIED", `OAuth denied: ${oauthError}`);
      return res.redirect(`${portalRedirect}?smartcredit=denied`);
    }
    if (!code || !state) {
      return res.redirect(`${portalRedirect}?smartcredit=error`);
    }
    if (!consumerId) {
      return res.status(400).json({ ok: false, error: "Invalid or expired OAuth state" });
    }

    const db = await loadDB();
    const consumer = db.consumers.find((c) => c.id === consumerId);
    if (!consumer) {
      return res.status(404).json({ ok: false, error: "Consumer not found" });
    }
    if (!consumer.smartCreditOAuthState || consumer.smartCreditOAuthState !== state) {
      return res.status(400).json({ ok: false, error: "OAuth state mismatch — possible CSRF" });
    }

    const tokenData = await exchangeCodeForToken(code);
    consumer.smartCreditToken = tokenData.accessToken;
    consumer.smartCreditRefreshToken = tokenData.refreshToken;
    consumer.smartCreditTokenExpiry = new Date(
      Date.now() + (tokenData.expiresIn || 3600) * 1000
    ).toISOString();
    delete consumer.smartCreditOAuthState;
    await saveDB(db);
    logInfo("SMART_CREDIT_TOKEN_SAVED", "Smart Credit token saved", { consumerId });

    let reportImported = false;
    try {
      const reportData = await fetchCreditReport(tokenData.accessToken);
      await smartCreditIngestReport(consumer, reportData, db);
      logInfo("SMART_CREDIT_REPORT_IMPORTED", "Report imported via Smart Credit", { consumerId });
      reportImported = true;
    } catch (reportErr) {
      logError("SMART_CREDIT_REPORT_FETCH_ERROR", "Failed to fetch/import Smart Credit report", reportErr, { consumerId });
      await addEvent(consumer.id, "smart_credit_error", {
        error: reportErr.message || "Failed to fetch credit report from Smart Credit",
        source: "Smart Credit OAuth",
      });
    }

    res.redirect(`${portalRedirect}?smartcredit=${reportImported ? "success" : "linked"}`);
  } catch (err) {
    logError("SMART_CREDIT_CALLBACK_ERROR", "Smart Credit OAuth callback failed", err);
    const fallback = consumerId
      ? `/portal/${encodeURIComponent(consumerId)}?smartcredit=error`
      : "/?smartcredit=error";
    res.redirect(fallback);
  }
});

app.post("/api/smartcredit/refresh", authenticate, async (req, res) => {
  try {
    const { consumerId } = req.body || {};
    if (!consumerId) {
      return res.status(400).json({ ok: false, error: "consumerId is required" });
    }
    if (!authorizeSmartCreditAccess(req, consumerId)) {
      return res.status(403).json({ ok: false, error: "Unauthorized" });
    }
    if (!isSmartCreditConfigured()) {
      return res.status(503).json({ ok: false, error: "Smart Credit integration is not configured" });
    }
    const db = await loadDB();
    const consumer = db.consumers.find((c) => c.id === consumerId);
    if (!consumer) {
      return res.status(404).json({ ok: false, error: "Consumer not found" });
    }
    if (!consumer.smartCreditToken) {
      return res.status(400).json({ ok: false, error: "Consumer has not linked their Smart Credit account" });
    }

    const accessToken = await resolveSmartCreditToken(consumer, db);
    const reportData = await fetchCreditReport(accessToken);
    const result = await smartCreditIngestReport(consumer, reportData, db);

    logInfo("SMART_CREDIT_REPORT_REFRESHED", "Report refreshed via Smart Credit", {
      consumerId,
      reportId: result.reportId,
    });

    res.json({ ok: true, ...result });
  } catch (err) {
    logError("SMART_CREDIT_REFRESH_ERROR", "Smart Credit report refresh failed", err);
    res.status(500).json({ ok: false, error: err.message || "Failed to refresh Smart Credit report" });
  }
});

app.get("/api/notifications", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const result = await listNotifications({ limit });
    res.json({ ok: true, ...result });
  } catch (err) {
    logError("NOTIF_LIST_ERROR", "Failed to list notifications", err);
    res.status(500).json({ ok: false, error: "Failed to load notifications" });
  }
});

app.post("/api/notifications/read", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { id, all } = req.body || {};
    if (all) {
      await markAllRead();
    } else if (id) {
      await markRead(id);
    } else {
      return res.status(400).json({ ok: false, error: "Provide id or all:true" });
    }
    res.json({ ok: true });
  } catch (err) {
    logError("NOTIF_READ_ERROR", "Failed to mark notification read", err);
    res.status(500).json({ ok: false, error: "Failed to update notification" });
  }
});

app.get("/api/notifications/settings", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const settings = await getNotificationSettings();
    res.json({ ok: true, settings });
  } catch (err) {
    logError("NOTIF_SETTINGS_GET_ERROR", "Failed to get notification settings", err);
    res.status(500).json({ ok: false, error: "Failed to load notification settings" });
  }
});

app.put("/api/notifications/settings", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const updates = req.body || {};
    const saved = await saveNotificationSettings(updates);
    res.json({ ok: true, settings: saved });
  } catch (err) {
    logError("NOTIF_SETTINGS_PUT_ERROR", "Failed to save notification settings", err);
    res.status(500).json({ ok: false, error: "Failed to save notification settings" });
  }
});

export default app;

// End of server.js
