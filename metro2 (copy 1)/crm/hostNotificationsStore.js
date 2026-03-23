// hostNotificationsStore.js
// In-app, email & SMS notification system for Evolv CRM host

import { readKey, writeKey } from "./kvdb.js";
import { registerStateEventListener } from "./state.js";
import { logInfo, logError, logWarn } from "./logger.js";

const KV_NOTIFICATIONS = "host_notifications_v1";
const KV_SETTINGS = "host_notification_settings_v1";
const MAX_NOTIFICATIONS = 200;

const WATCHED_EVENTS = new Set([
  // Existing
  "consumer_created",
  "billing_plan_cycle_processed",
  "billing_plan_created",
  "report_uploaded",
  "file_uploaded",
  "letters_generated",
  "letters_mailed",
  "dispute_response",
  "call_booked",
  // Client lifecycle
  "client_invited",
  "client_activated",
  "client_inactive",
  "client_status_changed",
  "client_profile_updated",
  // Billing & payments
  "invoice_created",
  "invoice_due_soon",
  "invoice_overdue",
  "payment_succeeded",
  "payment_failed",
  "refund_issued",
  "subscription_renewed",
  "trial_ending_soon",
  // Credit/dispute workflow
  "dispute_submitted",
  "bureau_acknowledgment",
  "dispute_outcome",
  "item_removed",
  "score_change",
  "dispute_sla_missed",
  // Documents & files
  "file_review_required",
  "document_approved",
  "signature_requested",
  "signature_completed",
  "document_expiring",
  // Communication & engagement
  "message_received",
  "email_bounced",
  "reminder_overdue",
  "followup_overdue",
  // Calls & appointments
  "call_reminder",
  "call_rescheduled",
  "call_canceled",
  "no_show_detected",
  "post_call_notes_missing",
  // Team / admin / security
  "team_member_added",
  "role_changed",
  "login_new_device",
  "login_failed_threshold",
  "integration_failure",
  "system_maintenance",
  // Smart digests
  "daily_digest",
  "weekly_summary",
  "needs_attention_digest",
]);

const EVENT_LABELS = {
  // Existing
  consumer_created: "New client added",
  billing_plan_cycle_processed: "Billing cycle processed",
  billing_plan_created: "New billing plan created",
  report_uploaded: "Credit report uploaded",
  file_uploaded: "File uploaded",
  letters_generated: "Dispute letters generated",
  letters_mailed: "Letters mailed",
  dispute_response: "Dispute response received",
  call_booked: "Call booked",
  // Client lifecycle
  client_invited: "Client invited",
  client_activated: "Client signed up",
  client_inactive: "Client inactive",
  client_status_changed: "Client status changed",
  client_profile_updated: "Client profile updated",
  // Billing & payments
  invoice_created: "Invoice created",
  invoice_due_soon: "Invoice due soon",
  invoice_overdue: "Invoice overdue",
  payment_succeeded: "Payment succeeded",
  payment_failed: "Payment failed",
  refund_issued: "Refund issued",
  subscription_renewed: "Subscription updated",
  trial_ending_soon: "Trial ending soon",
  // Credit/dispute workflow
  dispute_submitted: "Dispute submitted",
  bureau_acknowledgment: "Bureau acknowledgment received",
  dispute_outcome: "Dispute outcome",
  item_removed: "Item removed from report",
  score_change: "Score change detected",
  dispute_sla_missed: "Dispute follow-up needed",
  // Documents & files
  file_review_required: "File requires review",
  document_approved: "Document approved/rejected",
  signature_requested: "Signature requested",
  signature_completed: "Signature completed",
  document_expiring: "Document expiring soon",
  // Communication & engagement
  message_received: "Message from client",
  email_bounced: "Email bounced / SMS undelivered",
  reminder_overdue: "Reminder not acknowledged",
  followup_overdue: "Follow-up task overdue",
  // Calls & appointments
  call_reminder: "Call reminder",
  call_rescheduled: "Call rescheduled",
  call_canceled: "Call canceled / missed",
  no_show_detected: "No-show detected",
  post_call_notes_missing: "Post-call notes missing",
  // Team / admin / security
  team_member_added: "New team member added",
  role_changed: "Role / permission changed",
  login_new_device: "Login from new device",
  login_failed_threshold: "Repeated login failures",
  integration_failure: "Integration / API failure",
  system_maintenance: "System maintenance alert",
  // Smart digests
  daily_digest: "Daily activity digest",
  weekly_summary: "Weekly performance summary",
  needs_attention_digest: "Needs attention digest",
};

function extractConsumerName(payload) {
  return (
    payload?.name ||
    payload?.consumerName ||
    payload?.clientName ||
    payload?.fullName ||
    null
  );
}

function buildMessage(eventType, payload) {
  const base = EVENT_LABELS[eventType] || eventType;
  const name = extractConsumerName(payload);
  const amount = payload?.amount != null ? `$${Number(payload.amount).toFixed(2)}` : null;
  const planName = payload?.planName || null;
  const filename = payload?.name || payload?.filename || null;

  switch (eventType) {
    case "consumer_created":
    case "client_invited":
    case "client_activated":
    case "client_inactive":
    case "client_status_changed":
    case "client_profile_updated":
      return name ? `${base}: ${name}` : base;

    case "billing_plan_cycle_processed":
      return [base, name, amount ? `(${amount})` : null].filter(Boolean).join(" — ");
    case "billing_plan_created":
      return [base, planName || name].filter(Boolean).join(": ");

    case "invoice_created":
    case "invoice_due_soon":
    case "invoice_overdue":
      return [base, name, amount ? `(${amount})` : null].filter(Boolean).join(" — ");

    case "payment_succeeded":
    case "payment_failed":
    case "refund_issued":
      return [base, name, amount ? `(${amount})` : null].filter(Boolean).join(" — ");

    case "subscription_renewed":
    case "trial_ending_soon":
      return name ? `${base} — ${name}` : base;

    case "report_uploaded":
    case "dispute_submitted":
    case "bureau_acknowledgment":
    case "dispute_outcome":
    case "item_removed":
    case "score_change":
    case "dispute_sla_missed":
    case "letters_generated":
    case "letters_mailed":
    case "dispute_response":
      return name ? `${base} for ${name}` : base;

    case "file_uploaded":
    case "file_review_required":
    case "document_approved":
    case "document_expiring":
      return filename ? `${base}: ${filename}` : (name ? `${base} — ${name}` : base);

    case "signature_requested":
    case "signature_completed":
      return name ? `${base} — ${name}` : base;

    case "message_received":
    case "email_bounced":
    case "reminder_overdue":
    case "followup_overdue":
      return name ? `${base} — ${name}` : base;

    case "call_booked":
    case "call_reminder":
    case "call_rescheduled":
    case "call_canceled":
    case "no_show_detected":
    case "post_call_notes_missing":
      return name ? `${base} with ${name}` : base;

    case "team_member_added":
    case "role_changed":
      return payload?.memberName ? `${base}: ${payload.memberName}` : base;

    case "login_new_device":
    case "login_failed_threshold":
    case "integration_failure":
    case "system_maintenance":
      return payload?.detail ? `${base}: ${payload.detail}` : base;

    case "daily_digest":
    case "weekly_summary":
    case "needs_attention_digest":
      return payload?.summary || base;

    default:
      return base;
  }
}

// Default on/off per event (true = on by default)
// Tier policy:
//   Essential (always on) — payment_failed, dispute_outcome, item_removed, score_change,
//     no_show_detected, login_failed_threshold, invoice_overdue, message_received
//   Recommended (default on) — everything else
//   Advanced (default off) — login_new_device, daily_digest, weekly_summary, needs_attention_digest
const EVENT_DEFAULTS = {
  // Existing — all recommended/on
  consumer_created: true,
  billing_plan_cycle_processed: true,
  billing_plan_created: true,
  report_uploaded: true,
  file_uploaded: true,
  letters_generated: true,
  letters_mailed: true,
  dispute_response: true,
  call_booked: true,
  // Client lifecycle
  client_invited: true,
  client_activated: true,
  client_inactive: true,
  client_status_changed: true,
  client_profile_updated: true,
  // Billing & payments
  invoice_created: true,
  invoice_due_soon: true,
  invoice_overdue: true,      // Essential
  payment_succeeded: true,
  payment_failed: true,       // Essential
  refund_issued: true,
  subscription_renewed: true,
  trial_ending_soon: true,
  // Credit/dispute workflow
  dispute_submitted: true,
  bureau_acknowledgment: true,
  dispute_outcome: true,      // Essential
  item_removed: true,         // Essential
  score_change: true,         // Essential
  dispute_sla_missed: true,
  // Documents & files
  file_review_required: true,
  document_approved: true,
  signature_requested: true,
  signature_completed: true,
  document_expiring: true,
  // Communication & engagement
  message_received: true,     // Essential
  email_bounced: true,
  reminder_overdue: true,
  followup_overdue: true,
  // Calls & appointments
  call_reminder: true,
  call_rescheduled: true,
  call_canceled: true,
  no_show_detected: true,     // Essential
  post_call_notes_missing: true,
  // Team / admin / security
  team_member_added: true,
  role_changed: true,
  login_new_device: false,    // Advanced
  login_failed_threshold: true, // Essential
  integration_failure: true,
  system_maintenance: true,
  // Smart digests — Advanced
  daily_digest: false,
  weekly_summary: false,
  needs_attention_digest: false,
};

async function loadNotifications() {
  const data = await readKey(KV_NOTIFICATIONS, null);
  if (!data || !Array.isArray(data.items)) return { items: [] };
  return data;
}

async function saveNotifications(data) {
  await writeKey(KV_NOTIFICATIONS, data);
}

async function loadSettings() {
  const data = await readKey(KV_SETTINGS, null);
  const savedEvents = (data || {}).events || {};
  const mergedEvents = {};
  for (const [k, v] of Object.entries(EVENT_DEFAULTS)) {
    mergedEvents[k] = savedEvents[k] !== undefined ? savedEvents[k] : v;
  }
  return {
    inApp: true,
    email: false,
    emailAddress: "",
    sms: false,
    smsNumber: "",
    ...(data || {}),
    events: mergedEvents,
  };
}

export async function getNotificationSettings() {
  return loadSettings();
}

/**
 * Emit a host-level notification (not tied to a specific consumer) while
 * respecting per-event settings and optional email/SMS delivery — same path
 * used by the consumer-state event listener.
 */
export async function emitHostNotification(eventType, message, payload = {}) {
  if (!WATCHED_EVENTS.has(eventType)) return null;
  let settings;
  try {
    settings = await loadSettings();
  } catch (err) {
    logWarn("NOTIF_SETTINGS_READ_ERROR", err?.message || String(err));
    return null;
  }
  const eventEnabled = settings.events?.[eventType] !== false;
  if (!eventEnabled) return null;

  const delivery = {
    inApp: settings.inApp !== false,
    emailSent: false,
    smsSent: false,
  };

  if (settings.email && settings.emailAddress) {
    delivery.emailSent = await sendEmailNotification(settings, message).catch(() => false);
  }
  if (settings.sms && settings.smsNumber) {
    delivery.smsSent = await sendSmsNotification(settings, message).catch(() => false);
  }

  if (!delivery.inApp) return null;

  return addNotification({
    eventType,
    message,
    payload,
    delivery,
  });
}

export async function saveNotificationSettings(updates) {
  const current = await loadSettings();
  const merged = {
    ...current,
    ...updates,
    events: {
      ...current.events,
      ...(updates.events || {}),
    },
  };
  await writeKey(KV_SETTINGS, merged);
  return merged;
}

export async function listNotifications({ limit = 50 } = {}) {
  const data = await loadNotifications();
  const all = data.items || [];
  const unreadCount = all.filter((n) => !n.read).length;
  const notifications = all.slice(0, limit);
  return { notifications, unreadCount };
}

export async function addNotification({
  eventType,
  message,
  consumerName,
  consumerId,
  payload,
  delivery,
}) {
  const data = await loadNotifications();
  const notification = {
    id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    eventType: eventType || "unknown",
    eventLabel: EVENT_LABELS[eventType] || eventType || "Event",
    message,
    consumerName: consumerName || null,
    consumerId: consumerId || null,
    payload: payload || {},
    delivery: delivery || { inApp: true, emailSent: false, smsSent: false },
    read: false,
    at: new Date().toISOString(),
  };
  data.items = [notification, ...(data.items || [])].slice(0, MAX_NOTIFICATIONS);
  await saveNotifications(data);
  return notification;
}

export async function markRead(id) {
  const data = await loadNotifications();
  let changed = false;
  for (const n of data.items || []) {
    if (n.id === id && !n.read) {
      n.read = true;
      changed = true;
    }
  }
  if (changed) await saveNotifications(data);
  return { ok: true };
}

export async function markAllRead() {
  const data = await loadNotifications();
  let changed = false;
  for (const n of data.items || []) {
    if (!n.read) {
      n.read = true;
      changed = true;
    }
  }
  if (changed) await saveNotifications(data);
  return { ok: true };
}

async function sendEmailNotification(settings, message) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return false;
  const to = (settings.emailAddress || "").trim();
  if (!to) return false;

  try {
    const body = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: process.env.SENDGRID_FROM_EMAIL || to, name: "Evolv CRM" },
      subject: `Evolv Alert: ${message.slice(0, 80)}`,
      content: [{ type: "text/plain", value: message }],
    };
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logWarn("NOTIF_EMAIL_FAILED", `SendGrid ${res.status}: ${text.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    logWarn("NOTIF_EMAIL_ERROR", err?.message || String(err));
    return false;
  }
}

async function sendSmsNotification(settings, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return false;

  const to = (settings.smsNumber || "").trim();
  if (!to) return false;

  const from = (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID || "").trim();
  if (!from) return false;

  try {
    const params = new URLSearchParams();
    params.set("To", to);
    params.set("Body", `Evolv: ${message.slice(0, 140)}`);
    if (from.startsWith("MG")) {
      params.set("MessagingServiceSid", from);
    } else {
      params.set("From", from);
    }

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logWarn("NOTIF_SMS_FAILED", `Twilio ${res.status}: ${text.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    logWarn("NOTIF_SMS_ERROR", err?.message || String(err));
    return false;
  }
}

export function initHostNotifications() {
  registerStateEventListener(async ({ consumerId, event }) => {
    if (!WATCHED_EVENTS.has(event.type)) return;

    let settings;
    try {
      settings = await loadSettings();
    } catch (err) {
      logWarn("NOTIF_SETTINGS_READ_ERROR", err?.message || String(err));
      return;
    }

    const eventEnabled = settings.events?.[event.type] !== false;
    if (!eventEnabled) return;

    const payload = event.payload || {};
    const consumerName = extractConsumerName(payload);
    const message = buildMessage(event.type, payload);

    const delivery = {
      inApp: settings.inApp !== false,
      emailSent: false,
      smsSent: false,
    };

    if (settings.email && settings.emailAddress) {
      delivery.emailSent = await sendEmailNotification(settings, message).catch(() => false);
      if (!delivery.emailSent && event.type !== "email_bounced") {
        // Record the email delivery failure as an email_bounced notification (direct insert, no recursion)
        try {
          await addNotification({
            eventType: "email_bounced",
            message: `Email delivery failed for notification: ${message.slice(0, 100)}`,
            consumerName,
            consumerId,
            payload: { originalEvent: event.type, toAddress: settings.emailAddress },
            delivery: { inApp: true, emailSent: false, smsSent: false },
          });
        } catch {}
      }
    }

    if (settings.sms && settings.smsNumber) {
      delivery.smsSent = await sendSmsNotification(settings, message).catch(() => false);
    }

    if (delivery.inApp) {
      try {
        await addNotification({
          eventType: event.type,
          message,
          consumerName,
          consumerId,
          payload,
          delivery,
        });
      } catch (err) {
        logError("NOTIF_STORE_ERROR", "Failed to store notification", err);
      }
    }
  });

  logInfo("HOST_NOTIFICATIONS_INIT", "Host notification listener registered");
}
