import { logWarn } from "./logger.js";

export const DEFAULT_TENANT_ID = "default";

function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const num = Number(raw);
  if (Number.isFinite(num) && num > 0) return num;
  return fallback;
}

const DEFAULT_OPERATION_LIMITS = {
  "requests:minute": {
    limit: envNumber("TENANT_REQUESTS_PER_MINUTE", 240),
    windowMs: envNumber("TENANT_REQUEST_WINDOW_MS", 60_000),
  },
  "letters:generate": {
    limit: envNumber("TENANT_LETTER_JOBS_PER_HOUR", 60),
    windowMs: envNumber("TENANT_LETTER_JOBS_WINDOW_MS", 60 * 60 * 1000),
  },
  "letters:pdf": {
    limit: envNumber("TENANT_LETTER_PDFS_PER_HOUR", 200),
    windowMs: envNumber("TENANT_LETTER_PDFS_WINDOW_MS", 60 * 60 * 1000),
  },
  "letters:zip": {
    limit: envNumber("TENANT_LETTER_ZIPS_PER_HOUR", 40),
    windowMs: envNumber("TENANT_LETTER_ZIPS_WINDOW_MS", 60 * 60 * 1000),
  },
  "reports:audit": {
    limit: envNumber("TENANT_AUDITS_PER_HOUR", 40),
    windowMs: envNumber("TENANT_AUDITS_WINDOW_MS", 60 * 60 * 1000),
  },
  "breach:lookup": {
    limit: envNumber("TENANT_BREACH_LOOKUPS_PER_HOUR", 50),
    windowMs: envNumber("TENANT_BREACH_LOOKUPS_WINDOW_MS", 60 * 60 * 1000),
  },
};

function cloneMap(source) {
  const target = new Map();
  if (!source) return target;
  for (const [key, value] of source.entries()) {
    if (value instanceof Map) {
      target.set(key, cloneMap(value));
    } else {
      target.set(key, value);
    }
  }
  return target;
}

export function sanitizeTenantId(raw, fallback = DEFAULT_TENANT_ID) {
  if (raw === undefined || raw === null) return fallback;
  const str = String(raw).trim().toLowerCase();
  if (!str) return fallback;
  const normalized = str.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+/, "").replace(/-+$/, "").slice(0, 64);
  return normalized || fallback;
}

function normalizeLimitConfig(input = {}) {
  if (!input || typeof input !== "object") return {};
  const out = {};
  if (input.limit !== undefined) {
    const limitNum = Number(input.limit);
    if (Number.isFinite(limitNum)) out.limit = limitNum;
  }
  if (input.windowMs !== undefined) {
    const windowNum = Number(input.windowMs);
    if (Number.isFinite(windowNum) && windowNum > 0) out.windowMs = windowNum;
  }
  return out;
}

function parseOverridesInput(input) {
  if (!input) return new Map();
  let source = input;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch (err) {
      logWarn("TENANT_LIMIT_OVERRIDE_PARSE_FAILED", err?.message || "Invalid JSON", { inputSnippet: source.slice(0, 120) });
      return new Map();
    }
  }
  if (source instanceof Map) return cloneMap(source);
  const map = new Map();
  if (typeof source !== "object") return map;
  for (const [tenantKey, operations] of Object.entries(source)) {
    const tenantId = sanitizeTenantId(tenantKey);
    if (!tenantId) continue;
    const opMap = new Map();
    if (operations && typeof operations === "object") {
      for (const [operationKey, config] of Object.entries(operations)) {
        const opName = String(operationKey || "").trim();
        if (!opName) continue;
        const normalizedConfig = normalizeLimitConfig(config);
        if (Object.keys(normalizedConfig).length > 0) {
          opMap.set(opName, normalizedConfig);
        }
      }
    }
    if (opMap.size > 0) {
      map.set(tenantId, opMap);
    }
  }
  return map;
}

let tenantOverrides = parseOverridesInput(process.env.TENANT_LIMIT_OVERRIDES || process.env.TENANT_LIMITS || null);

const usageStore = new Map();

function getDefaultConfig(operation) {
  const base = DEFAULT_OPERATION_LIMITS[operation];
  if (base) {
    return { limit: base.limit, windowMs: base.windowMs };
  }
  return { limit: 60, windowMs: 60_000 };
}

function getTenantOverrideConfig(tenantId, operation) {
  const tenantMap = tenantOverrides.get(tenantId) || tenantOverrides.get(DEFAULT_TENANT_ID);
  if (!tenantMap) return null;
  return tenantMap.get(operation) || null;
}

function resolveLimitConfig(tenantId, operation, localOverride = {}) {
  const config = getDefaultConfig(operation);
  const tenantConfig = getTenantOverrideConfig(tenantId, operation);
  if (tenantConfig) {
    if (tenantConfig.limit !== undefined) config.limit = tenantConfig.limit;
    if (tenantConfig.windowMs !== undefined) config.windowMs = tenantConfig.windowMs;
  }
  if (localOverride.limit !== undefined) config.limit = localOverride.limit;
  if (localOverride.windowMs !== undefined) config.windowMs = localOverride.windowMs;
  if (!Number.isFinite(config.limit)) {
    config.limit = getDefaultConfig(operation).limit;
  }
  if (!Number.isFinite(config.windowMs) || config.windowMs <= 0) {
    config.windowMs = getDefaultConfig(operation).windowMs;
  }
  return config;
}

function getUsageBucket(tenantId, operation) {
  let tenantUsage = usageStore.get(tenantId);
  if (!tenantUsage) {
    tenantUsage = new Map();
    usageStore.set(tenantId, tenantUsage);
  }
  let bucket = tenantUsage.get(operation);
  if (!bucket) {
    bucket = { windowStart: 0, count: 0 };
    tenantUsage.set(operation, bucket);
  }
  return bucket;
}

export function resolveTenantId(req, fallback = DEFAULT_TENANT_ID) {
  if (!req) return fallback;
  if (req.user && req.user.tenantId) {
    return sanitizeTenantId(req.user.tenantId, fallback);
  }
  const headers = req.headers || {};
  const headerKeys = ["x-tenant-id", "x-org-id", "x-company-id"];
  for (const key of headerKeys) {
    const raw = headers[key];
    if (!raw) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const sanitized = sanitizeTenantId(value, fallback);
    if (sanitized) return sanitized;
  }
  if (req.query) {
    const queryTenant = req.query.tenantId || req.query.tenant || null;
    if (queryTenant) {
      return sanitizeTenantId(queryTenant, fallback);
    }
  }
  if (req.body && typeof req.body === "object" && req.body.tenantId) {
    return sanitizeTenantId(req.body.tenantId, fallback);
  }
  return fallback;
}

function isUnlimited(limit) {
  return limit === Infinity || (typeof limit === "number" && limit < 0);
}

export function enforceTenantQuota(operation, options = {}) {
  if (!operation || typeof operation !== "string") {
    throw new Error("Operation is required for tenant quota enforcement");
  }
  const localOverride = normalizeLimitConfig(options);
  const keyResolver = options.keyResolver || resolveTenantId;
  const skipFn = typeof options.skip === "function" ? options.skip : null;
  const message = options.message || "Tenant quota exceeded. Please wait before retrying.";
  return async function tenantQuotaMiddleware(req, res, next) {
    try {
      if (req.method === "OPTIONS") return next();
      if (skipFn && skipFn(req)) return next();
      const key = await Promise.resolve(keyResolver(req, DEFAULT_TENANT_ID));
      const tenantId = sanitizeTenantId(key, DEFAULT_TENANT_ID);
      const config = resolveLimitConfig(tenantId, operation, localOverride);
      if (isUnlimited(config.limit)) return next();
      const now = Date.now();
      const bucket = getUsageBucket(tenantId, operation);
      const bucketStart = Math.floor(now / config.windowMs) * config.windowMs;
      if (bucket.windowStart !== bucketStart) {
        bucket.windowStart = bucketStart;
        bucket.count = 0;
      }
      if (bucket.count >= config.limit) {
        const resetInMs = Math.max(bucket.windowStart + config.windowMs - now, 0);
        const retryAfterSeconds = Math.max(Math.ceil(resetInMs / 1000), 1);
        res.setHeader("Retry-After", String(retryAfterSeconds));
        res.setHeader("X-Tenant-Limit", String(config.limit));
        res.setHeader("X-Tenant-Window-Ms", String(config.windowMs));
        res.setHeader("X-Tenant-Retry-After-Ms", String(resetInMs));
        logWarn("TENANT_QUOTA_EXCEEDED", "Tenant quota exceeded", {
          tenantId,
          operation,
          limit: config.limit,
          windowMs: config.windowMs,
        });
        return res.status(429).json({
          ok: false,
          error: message,
          code: "TENANT_QUOTA",
          meta: {
            tenantId,
            operation,
            limit: config.limit,
            windowMs: config.windowMs,
            retryAfterMs: resetInMs,
          },
        });
      }
      bucket.count += 1;
      const remaining = Math.max(config.limit - bucket.count, 0);
      res.setHeader("X-Tenant-Limit", String(config.limit));
      res.setHeader("X-Tenant-Remaining", String(remaining));
      res.setHeader("X-Tenant-Window-Ms", String(config.windowMs));
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export function resetTenantUsage() {
  usageStore.clear();
}

export function configureTenantLimits(overrides = {}) {
  tenantOverrides = parseOverridesInput(overrides);
}

export function resetTenantOverrides() {
  tenantOverrides = parseOverridesInput(process.env.TENANT_LIMIT_OVERRIDES || process.env.TENANT_LIMITS || null);
}

export function getTenantUsageSnapshot() {
  const snapshot = {};
  for (const [tenantId, operations] of usageStore.entries()) {
    snapshot[tenantId] = {};
    for (const [operation, bucket] of operations.entries()) {
      snapshot[tenantId][operation] = { count: bucket.count, windowStart: bucket.windowStart };
    }
  }
  return snapshot;
}

export { DEFAULT_OPERATION_LIMITS };
