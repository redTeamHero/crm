// hostNotificationsStore.js
// In-app, email & SMS notification system for Evolv CRM host

import { readKey, writeKey } from "./kvdb.js";
import { registerStateEventListener } from "./state.js";
import { logInfo, logError, logWarn } from "./logger.js";

const KV_NOTIFICATIONS = "host_notifications_v1";
const KV_SETTINGS = "host_notification_settings_v1";
const MAX_NOTIFICATIONS = 200;

const WATCHED_EVENTS = new Set([
  "consumer_created",
  "billing_plan_cycle_processed",
  "billing_plan_created",
  "report_uploaded",
  "file_uploaded",
  "letters_generated",
  "letters_mailed",
  "dispute_response",
  "call_booked",
]);

const EVENT_LABELS = {
  consumer_created: "New client added",
  billing_plan_cycle_processed: "Billing cycle processed",
  billing_plan_created: "New billing plan created",
  report_uploaded: "Credit report uploaded",
  file_uploaded: "File uploaded",
  letters_generated: "Dispute letters generated",
  letters_mailed: "Letters mailed",
  dispute_response: "Dispute response received",
  call_booked: "Call booked",
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
      return name ? `${base}: ${name}` : base;
    case "billing_plan_cycle_processed":
      return [base, name, amount ? `(${amount})` : null].filter(Boolean).join(" — ");
    case "billing_plan_created":
      return [base, planName || name].filter(Boolean).join(": ");
    case "report_uploaded":
      return name ? `${base} for ${name}` : base;
    case "file_uploaded":
      return filename ? `${base}: ${filename}` : base;
    case "letters_generated":
      return name ? `${base} for ${name}` : base;
    case "letters_mailed":
      return name ? `${base} for ${name}` : base;
    case "dispute_response":
      return name ? `${base} for ${name}` : base;
    case "call_booked":
      return name ? `${base} with ${name}` : base;
    default:
      return base;
  }
}

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
  return {
    inApp: true,
    email: false,
    emailAddress: "",
    sms: false,
    smsNumber: "",
    events: {
      consumer_created: true,
      billing_plan_cycle_processed: true,
      billing_plan_created: true,
      report_uploaded: true,
      file_uploaded: true,
      letters_generated: true,
      letters_mailed: true,
      dispute_response: true,
      call_booked: true,
    },
    ...(data || {}),
    events: {
      consumer_created: true,
      billing_plan_cycle_processed: true,
      billing_plan_created: true,
      report_uploaded: true,
      file_uploaded: true,
      letters_generated: true,
      letters_mailed: true,
      dispute_response: true,
      call_booked: true,
      ...((data || {}).events || {}),
    },
  };
}

export async function getNotificationSettings() {
  return loadSettings();
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
  const items = (data.items || []).slice(0, limit);
  const unreadCount = items.filter((n) => !n.read).length;
  return { notifications: items, unreadCount };
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
