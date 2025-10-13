#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import fetch from "node-fetch";
import twilio from "twilio";

const DEFAULT_ENV_FILE = ".env";

async function loadEnvFile() {
  const customPath = process.env.MARKETING_ENV_FILE || process.env.ENV_FILE;
  const filePath = path.resolve(process.cwd(), customPath || DEFAULT_ENV_FILE);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .forEach((line) => {
        const idx = line.indexOf("=");
        if (idx === -1) return;
        const key = line.slice(0, idx).trim();
        if (!key || process.env[key]) return;
        let value = line.slice(idx + 1).trim();
        if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      });
  } catch (error) {
    if (customPath) {
      console.warn(`[marketingTwilioWorker] Unable to read env file ${filePath}:`, error.message);
    }
  }
}

await loadEnvFile();

function requireEnv(name, { allowEmpty = false } = {}) {
  const value = process.env[name];
  if (!allowEmpty && (!value || !String(value).trim())) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return String(value).trim();
}

function optionalEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

let twilioClient;
let messagingServiceSid;
let fromNumber;

function bootstrapTwilio() {
  const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
  const authToken = requireEnv("TWILIO_AUTH_TOKEN");
  messagingServiceSid = optionalEnv("TWILIO_MESSAGING_SERVICE_SID");
  fromNumber = optionalEnv("TWILIO_FROM_NUMBER");
  if (!messagingServiceSid && !fromNumber) {
    throw new Error("Provide TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER so SMS can be sent");
  }
  twilioClient = twilio(accountSid, authToken);
}

bootstrapTwilio();

const marketingBaseInput = optionalEnv("MARKETING_API_BASE_URL") || optionalEnv("CRM_URL") || "http://localhost:3000";
const marketingBase = marketingBaseInput.endsWith("/api/marketing")
  ? marketingBaseInput.replace(/\/$/, "")
  : `${marketingBaseInput.replace(/\/$/, "")}/api/marketing`;

const marketingKey = optionalEnv("MARKETING_API_KEY");
const crmToken = optionalEnv("CRM_TOKEN");
if (!marketingKey && !crmToken) {
  throw new Error("Set MARKETING_API_KEY or CRM_TOKEN so the worker can authenticate");
}
const tenantId = optionalEnv("MARKETING_TENANT_ID");

const providerId = optionalEnv("MARKETING_SMS_PROVIDER_ID") || "sms_twilio";
const pollIntervalMs = Number.parseInt(optionalEnv("MARKETING_POLL_INTERVAL_MS") || "15000", 10);
const fetchLimit = Number.parseInt(optionalEnv("MARKETING_TEST_FETCH_LIMIT") || "5", 10);
const statusCallback = optionalEnv("TWILIO_STATUS_CALLBACK_URL");

const authHeaders = {};
if (marketingKey) authHeaders["X-Marketing-Key"] = marketingKey;
if (crmToken) authHeaders.Authorization = `Bearer ${crmToken}`;
if (tenantId) authHeaders["X-Tenant-Id"] = tenantId;

function logInfo(message, meta = {}) {
  console.log(`[marketingTwilioWorker] ${message}`, meta);
}

function logError(message, error, meta = {}) {
  console.error(`[marketingTwilioWorker] ${message}`, { error: error?.message || error, ...meta });
}

async function marketingRequest(path, options = {}) {
  const url = `${marketingBase}${path}`;
  const headers = { ...authHeaders, ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Marketing API ${res.status}: ${text}`);
  }
  return res;
}

async function marketingJson(path, options = {}) {
  const res = await marketingRequest(path, options);
  return res.json();
}

async function patchTestItem(id, payload) {
  return marketingJson(`/tests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

let lastProviderStatus = "";
async function updateProviderStatus(status) {
  if (!status || status === lastProviderStatus) return;
  lastProviderStatus = status;
  try {
    await marketingJson(`/providers/${providerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  } catch (error) {
    logError("Failed to update provider status", error, { providerId, status });
  }
}

async function claimNextTest() {
  const { items = [] } = await marketingJson(`/tests?limit=${Math.max(1, Math.min(fetchLimit, 50))}`);
  const next = items.find((item) => item.status === "queued");
  if (!next) return null;
  try {
    const { item } = await patchTestItem(next.id, { status: "sending" });
    return item;
  } catch (error) {
    logError("Failed to claim test item", error, { id: next.id });
    return null;
  }
}

function buildMessagePayload(item) {
  if (!item?.recipient) {
    throw new Error("Test item missing recipient");
  }
  const body = (item.smsPreview || "").trim();
  if (!body) {
    throw new Error("Test item missing smsPreview body");
  }
  const params = { to: item.recipient, body };
  if (messagingServiceSid) {
    params.messagingServiceSid = messagingServiceSid;
  } else if (fromNumber) {
    params.from = fromNumber;
  }
  if (statusCallback) {
    params.statusCallback = statusCallback;
  }
  return params;
}

async function sendSms(item) {
  const payload = buildMessagePayload(item);
  const response = await twilioClient.messages.create(payload);
  return {
    sid: response.sid,
    status: response.status,
    to: response.to,
    messagingServiceSid: response.messagingServiceSid || payload.messagingServiceSid || null,
    accountSid: response.accountSid,
  };
}

async function processQueueOnce() {
  const item = await claimNextTest();
  if (!item) {
    return false;
  }
  try {
    const providerResponse = await sendSms(item);
    await patchTestItem(item.id, {
      status: "sent",
      deliveredAt: new Date().toISOString(),
      error: null,
      providerResponse,
    });
    await updateProviderStatus("ready");
    logInfo("Sent test SMS", { id: item.id, to: item.recipient, sid: providerResponse.sid });
    return true;
  } catch (error) {
    logError("Failed to send SMS", error, { id: item.id, to: item.recipient });
    await patchTestItem(item.id, {
      status: "failed",
      error: error.message || "Unknown Twilio error",
      providerResponse: error.code ? { code: error.code } : null,
    }).catch((patchErr) => {
      logError("Failed to record test failure", patchErr, { id: item.id });
    });
    await updateProviderStatus("error");
    return true;
  }
}

let shuttingDown = false;

async function runLoop() {
  if (shuttingDown) return;
  try {
    await processQueueOnce();
  } catch (error) {
    logError("Queue processing error", error);
  } finally {
    if (!shuttingDown) {
      setTimeout(runLoop, Math.max(2000, pollIntervalMs));
    }
  }
}

logInfo("Starting Twilio marketing worker", {
  marketingBase,
  providerId,
  pollIntervalMs,
  fetchLimit,
  messagingServiceSid: messagingServiceSid || undefined,
  fromNumber: fromNumber || undefined,
});

runLoop();

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  logInfo("Shutting down worker");
  setTimeout(() => process.exit(0), 100);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
