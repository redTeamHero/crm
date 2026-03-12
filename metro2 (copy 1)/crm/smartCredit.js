import crypto from "crypto";
import { fetchFn } from "./fetchUtil.js";
import { logInfo, logError, logWarn } from "./logger.js";

const SMART_CREDIT_AUTH_BASE = "https://www.smartcredit.com/oauth";
const SMART_CREDIT_API_BASE = "https://api.smartcredit.com/v1";

export function isSmartCreditConfigured() {
  const clientId = (process.env.SMART_CREDIT_CLIENT_ID || "").trim();
  const clientSecret = (process.env.SMART_CREDIT_CLIENT_SECRET || "").trim();
  const redirectUri = (process.env.SMART_CREDIT_REDIRECT_URI || "").trim();
  return !!(clientId && clientSecret && redirectUri);
}

export function getSmartCreditConfig() {
  const clientId = (process.env.SMART_CREDIT_CLIENT_ID || "").trim();
  const clientSecret = (process.env.SMART_CREDIT_CLIENT_SECRET || "").trim();
  const redirectUri = (process.env.SMART_CREDIT_REDIRECT_URI || "").trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Smart Credit integration is not configured. Set SMART_CREDIT_CLIENT_ID, SMART_CREDIT_CLIENT_SECRET, and SMART_CREDIT_REDIRECT_URI environment variables."
    );
  }
  return { clientId, clientSecret, redirectUri };
}

function getStateSigningKey() {
  return process.env.JWT_SECRET || process.env.SMART_CREDIT_CLIENT_SECRET || "";
}

export function buildAuthorizationUrl(consumerId) {
  const { clientId, redirectUri } = getSmartCreditConfig();
  const state = generateOAuthState(consumerId);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "credit_report",
    state,
  });
  return {
    url: `${SMART_CREDIT_AUTH_BASE}/authorize?${params.toString()}`,
    state,
  };
}

export function generateOAuthState(consumerId) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = JSON.stringify({ consumerId, nonce, ts: Date.now() });
  const data = Buffer.from(payload).toString("base64url");
  const hmac = crypto
    .createHmac("sha256", getStateSigningKey())
    .update(data)
    .digest("base64url");
  return `${data}.${hmac}`;
}

export function parseOAuthState(stateParam) {
  try {
    const dotIndex = stateParam.lastIndexOf(".");
    if (dotIndex < 1) {
      logWarn("SMART_CREDIT_STATE_NO_SIG", "OAuth state missing HMAC signature");
      return null;
    }
    const data = stateParam.slice(0, dotIndex);
    const providedHmac = stateParam.slice(dotIndex + 1);
    const expectedHmac = crypto
      .createHmac("sha256", getStateSigningKey())
      .update(data)
      .digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(providedHmac), Buffer.from(expectedHmac))) {
      logWarn("SMART_CREDIT_STATE_TAMPERED", "OAuth state HMAC verification failed");
      return null;
    }
    const decoded = Buffer.from(data, "base64url").toString("utf-8");
    const parsed = JSON.parse(decoded);
    if (!parsed.consumerId || !parsed.nonce || !parsed.ts) {
      return null;
    }
    const age = Date.now() - parsed.ts;
    if (age > 10 * 60 * 1000) {
      logWarn("SMART_CREDIT_STATE_EXPIRED", "OAuth state parameter has expired");
      return null;
    }
    return parsed;
  } catch (err) {
    logError("SMART_CREDIT_STATE_PARSE", "Failed to parse OAuth state", err);
    return null;
  }
}

export async function exchangeCodeForToken(code) {
  const { clientId, clientSecret, redirectUri } = getSmartCreditConfig();
  const response = await fetchFn(`${SMART_CREDIT_AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Smart Credit token exchange failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Smart Credit token response missing access_token");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresIn: data.expires_in || 3600,
    tokenType: data.token_type || "Bearer",
  };
}

export async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = getSmartCreditConfig();
  const response = await fetchFn(`${SMART_CREDIT_AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Smart Credit token refresh failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Smart Credit token refresh response missing access_token");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in || 3600,
    tokenType: data.token_type || "Bearer",
  };
}

export async function fetchCreditReport(accessToken) {
  const response = await fetchFn(`${SMART_CREDIT_API_BASE}/credit-report`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Smart Credit report fetch failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  logInfo("SMART_CREDIT_REPORT_FETCHED", "Credit report fetched from Smart Credit");
  return data;
}

export function smartCreditReportToBuffer(reportData) {
  const jsonString = JSON.stringify(reportData, null, 2);
  return Buffer.from(jsonString, "utf-8");
}
