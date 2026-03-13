import { getDatabase, runMigrations, getTenantStrategy, getSchemaPrefix } from "./db/connection.js";
import { DEFAULT_TENANT_ID, sanitizeTenantId } from "./tenantLimits.js";
import { getCurrentTenantId } from "./tenantContext.js";

const schemaCache = new Set();
let sharedTableInitialized = false;
let initializationPromise = null;

// ── In-memory KV cache ────────────────────────────────────────────────────────
// Dramatically reduces PostgreSQL round-trips on login when the dashboard fires
// 8-10 concurrent API calls that all read the same large blobs (consumers, users…).
// Strategy: write-through (writes update cache immediately) + 60s TTL reads.
// Concurrent reads for the same key share one in-flight DB promise ("thundering
// herd" prevention) so we never issue duplicate queries.
const KV_CACHE_TTL_MS = 60_000; // 60 seconds

const _kvCache = new Map();    // cacheKey -> { value, expiresAt }
const _kvInflight = new Map(); // cacheKey -> Promise  (dedup concurrent reads)

function _cacheKey(key, tenantId) {
  return `${tenantId}::${key}`;
}

function _cacheGet(cacheKey) {
  const entry = _kvCache.get(cacheKey);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    _kvCache.delete(cacheKey);
    return undefined;
  }
  return entry.value;
}

function _cacheSet(cacheKey, value) {
  _kvCache.set(cacheKey, { value, expiresAt: Date.now() + KV_CACHE_TTL_MS });
}

function _cacheDelete(cacheKey) {
  _kvCache.delete(cacheKey);
  _kvInflight.delete(cacheKey);
}
// ─────────────────────────────────────────────────────────────────────────────

function toJson(value) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      return JSON.stringify(null);
    }
    return serialized;
  } catch (err) {
    return JSON.stringify(null);
  }
}

function parseValue(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === "object") {
    return raw;
  }
  if (typeof raw === "string") {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }
  try {
    return JSON.parse(JSON.stringify(raw));
  } catch (err) {
    return fallback;
  }
}

function resolveTenant(options) {
  if (typeof options === "string") {
    return sanitizeTenantId(options, DEFAULT_TENANT_ID);
  }
  if (options && typeof options === "object") {
    if (options.tenantId) {
      return sanitizeTenantId(options.tenantId, DEFAULT_TENANT_ID);
    }
    if (options.req && options.req.user && options.req.user.tenantId) {
      return sanitizeTenantId(options.req.user.tenantId, DEFAULT_TENANT_ID);
    }
  }
  const activeTenant = getCurrentTenantId();
  if (activeTenant) {
    return sanitizeTenantId(activeTenant, DEFAULT_TENANT_ID);
  }
  return DEFAULT_TENANT_ID;
}

function schemaNameForTenant(tenantId) {
  const prefix = getSchemaPrefix();
  const safeTenant = tenantId.replace(/[^a-z0-9_]+/gi, "_").replace(/^_+/, "").replace(/_+$/, "");
  const finalName = safeTenant ? `${prefix}${safeTenant}` : `${prefix}${DEFAULT_TENANT_ID}`;
  if (/^[0-9]/.test(finalName)) {
    return `t_${finalName}`;
  }
  return finalName;
}

async function ensureInitialized() {
  if (!initializationPromise) {
    initializationPromise = runMigrations().catch((err) => {
      initializationPromise = null;
      throw err;
    });
  }
  await initializationPromise;
}

async function ensureSharedStructures() {
  if (sharedTableInitialized) return;
  await ensureInitialized();
  sharedTableInitialized = true;
}

async function ensureTenantSchema(db, tenantId) {
  const schemaName = schemaNameForTenant(tenantId);
  if (schemaCache.has(schemaName)) return schemaName;

  await ensureInitialized();
  await db.transaction(async (trx) => {
    const existing = await trx("tenant_registry").where({ tenant_id: tenantId }).first();
    if (existing && existing.schema_name) {
      schemaCache.add(existing.schema_name);
      return;
    }

    await trx.raw(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    const tableExists = await trx
      .select(1)
      .from("information_schema.tables")
      .where({ table_schema: schemaName, table_name: "kv_store" })
      .first();

    if (!tableExists) {
      await trx.raw(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."kv_store" (
          key text PRIMARY KEY,
          value jsonb NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      await trx.raw(`CREATE INDEX IF NOT EXISTS kv_store_updated_at_idx ON "${schemaName}"."kv_store" (updated_at);`);
    }

    if (!existing) {
      await trx("tenant_registry")
        .insert({ tenant_id: tenantId, schema_name: schemaName })
        .onConflict("tenant_id")
        .merge({ schema_name: schemaName, updated_at: trx.fn.now() });
    } else if (!existing.schema_name) {
      await trx("tenant_registry")
        .where({ tenant_id: tenantId })
        .update({ schema_name: schemaName, updated_at: trx.fn.now() });
    }
  });

  schemaCache.add(schemaName);
  return schemaName;
}

async function getTenantContext(options) {
  const tenantId = resolveTenant(options);
  const db = getDatabase();
  const strategy = getTenantStrategy();
  if (strategy === "schema" && db.client.config.client === "pg") {
    const schemaName = await ensureTenantSchema(db, tenantId);
    return { db, tenantId, strategy: "schema", schemaName };
  }
  await ensureSharedStructures();
  return { db, tenantId, strategy: "shared" };
}

export async function readKey(key, fallback, options = {}) {
  const { db, tenantId, strategy, schemaName } = await getTenantContext(options);
  const ck = _cacheKey(key, tenantId);

  // 1. Serve from cache if fresh
  const cached = _cacheGet(ck);
  if (cached !== undefined) return cached;

  // 2. If another caller is already fetching this key, share their promise
  if (_kvInflight.has(ck)) {
    const val = await _kvInflight.get(ck);
    return val !== undefined ? val : fallback;
  }

  // 3. Go to DB and dedup concurrent callers
  const dbPromise = (async () => {
    if (strategy === "schema") {
      const row = await db.withSchema(schemaName).from("kv_store").where({ key }).first();
      return row ? parseValue(row.value, undefined) : undefined;
    }
    const row = await db("tenant_kv").where({ tenant_id: tenantId, key }).first();
    return row ? parseValue(row.value, undefined) : undefined;
  })();

  _kvInflight.set(ck, dbPromise);
  let result;
  try {
    result = await dbPromise;
  } finally {
    _kvInflight.delete(ck);
  }

  if (result !== undefined) {
    _cacheSet(ck, result);
    return result;
  }
  return fallback;
}

export async function writeKey(key, value, options = {}) {
  const { db, tenantId, strategy, schemaName } = await getTenantContext(options);
  const ck = _cacheKey(key, tenantId);

  // Write-through: update cache immediately so subsequent reads are instant
  _cacheSet(ck, value);

  const payload = { value: toJson(value), updated_at: db.fn.now() };
  if (strategy === "schema") {
    await db
      .withSchema(schemaName)
      .from("kv_store")
      .insert({ key, ...payload })
      .onConflict("key")
      .merge(payload);
    return;
  }
  await db("tenant_kv")
    .insert({ tenant_id: tenantId, key, ...payload })
    .onConflict(["tenant_id", "key"])
    .merge(payload);
}

export async function deleteKey(key, options = {}) {
  const { db, tenantId, strategy, schemaName } = await getTenantContext(options);
  _cacheDelete(_cacheKey(key, tenantId));
  if (strategy === "schema") {
    await db.withSchema(schemaName).from("kv_store").where({ key }).del();
    return;
  }
  await db("tenant_kv").where({ tenant_id: tenantId, key }).del();
}

export async function listKeys(options = {}) {
  const { db, tenantId, strategy, schemaName } = await getTenantContext(options);
  if (strategy === "schema") {
    const rows = await db.withSchema(schemaName).from("kv_store").select("key", "updated_at");
    return rows;
  }
  return db("tenant_kv").where({ tenant_id: tenantId }).select("key", "updated_at");
}

export async function purgeTenant(tenantId) {
  const { db } = await getTenantContext({ tenantId });
  const strategy = getTenantStrategy();
  const id = sanitizeTenantId(tenantId, DEFAULT_TENANT_ID);
  if (strategy === "schema" && db.client.config.client === "pg") {
    const schemaName = schemaNameForTenant(id);
    await db.raw(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`);
    await db("tenant_registry").where({ tenant_id: id }).del();
    schemaCache.delete(schemaName);
    return;
  }
  await db("tenant_kv").where({ tenant_id: id }).del();
  await db("tenant_registry").where({ tenant_id: id }).del();
}

export const DB_FILE = null;
