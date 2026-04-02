import {
  getDrizzleDb,
  getDatabase,
  runMigrations,
  getTenantStrategy,
  getSchemaPrefix,
  getDbDialect,
} from "./db/connection.ts";
import { tenantKv, tenantRegistry } from "./db/schema.ts";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { DEFAULT_TENANT_ID, sanitizeTenantId } from "./tenantLimits.js";
import { getCurrentTenantId } from "./tenantContext.js";

const schemaCache = new Set();
let sharedTableInitialized = false;
let initializationPromise = null;

// ── In-memory KV cache ────────────────────────────────────────────────────────
const KV_CACHE_TTL_MS = 60_000;

const _kvCache = new Map();
const _kvInflight = new Map();

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

function parseValue(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  try {
    return JSON.parse(JSON.stringify(raw));
  } catch {
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
    if (options.req?.user?.tenantId) {
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
  const safeTenant = tenantId
    .replace(/[^a-z0-9_]+/gi, "_")
    .replace(/^_+/, "")
    .replace(/_+$/, "");
  const finalName = safeTenant
    ? `${prefix}${safeTenant}`
    : `${prefix}${DEFAULT_TENANT_ID}`;
  if (/^[0-9]/.test(finalName)) return `t_${finalName}`;
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

// ── Schema-strategy helpers (PostgreSQL only, raw SQL via Drizzle) ─────────────

async function ensureTenantSchema(db, tenantId) {
  const schemaName = schemaNameForTenant(tenantId);
  if (schemaCache.has(schemaName)) return schemaName;

  await ensureInitialized();

  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(tenantRegistry)
      .where(eq(tenantRegistry.tenantId, tenantId));
    const existing = rows[0] ?? null;

    if (existing && existing.schemaName) {
      schemaCache.add(existing.schemaName);
      return;
    }

    await tx.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`));

    const tableCheck = await tx.execute(sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = ${schemaName} AND table_name = 'kv_store'
      LIMIT 1
    `);

    if (!tableCheck.rows.length) {
      await tx.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."kv_store" (
          key text PRIMARY KEY,
          value jsonb NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `));
      await tx.execute(
        sql.raw(
          `CREATE INDEX IF NOT EXISTS kv_store_updated_at_idx ON "${schemaName}"."kv_store" (updated_at)`
        )
      );
    }

    if (!existing) {
      await tx
        .insert(tenantRegistry)
        .values({ tenantId, schemaName })
        .onConflictDoUpdate({
          target: tenantRegistry.tenantId,
          set: { schemaName, updatedAt: new Date() },
        });
    } else if (!existing.schemaName) {
      await tx
        .update(tenantRegistry)
        .set({ schemaName, updatedAt: new Date() })
        .where(eq(tenantRegistry.tenantId, tenantId));
    }
  });

  schemaCache.add(schemaName);
  return schemaName;
}

// ── Knex fallback for non-pg drivers ─────────────────────────────────────────

async function _knexRead(key, tenantId, strategy, schemaName) {
  const knexDb = getDatabase();
  if (strategy === "schema") {
    const row = await knexDb
      .withSchema(schemaName)
      .from("kv_store")
      .where({ key })
      .first();
    return row ? parseValue(row.value, undefined) : undefined;
  }
  const row = await knexDb("tenant_kv")
    .where({ tenant_id: tenantId, key })
    .first();
  return row ? parseValue(row.value, undefined) : undefined;
}

async function _knexWrite(key, value, tenantId, strategy, schemaName) {
  const knexDb = getDatabase();
  const jsonStr = typeof value === "string" ? value : JSON.stringify(value);
  const payload = { value: jsonStr, updated_at: knexDb.fn.now() };
  if (strategy === "schema") {
    await knexDb
      .withSchema(schemaName)
      .from("kv_store")
      .insert({ key, ...payload })
      .onConflict("key")
      .merge(payload);
    return;
  }
  await knexDb("tenant_kv")
    .insert({ tenant_id: tenantId, key, ...payload })
    .onConflict(["tenant_id", "key"])
    .merge(payload);
}

async function _knexDelete(key, tenantId, strategy, schemaName) {
  const knexDb = getDatabase();
  if (strategy === "schema") {
    await knexDb.withSchema(schemaName).from("kv_store").where({ key }).del();
    return;
  }
  await knexDb("tenant_kv").where({ tenant_id: tenantId, key }).del();
}

async function _knexList(tenantId, strategy, schemaName) {
  const knexDb = getDatabase();
  if (strategy === "schema") {
    return knexDb
      .withSchema(schemaName)
      .from("kv_store")
      .select("key", "updated_at");
  }
  return knexDb("tenant_kv")
    .where({ tenant_id: tenantId })
    .select("key", "updated_at");
}

// ── Resolve tenant context ────────────────────────────────────────────────────

async function getTenantContext(options) {
  const tenantId = resolveTenant(options);
  const strategy = getTenantStrategy();
  const dialect = getDbDialect();

  if (strategy === "schema" && dialect === "pg") {
    const db = getDrizzleDb();
    const schemaName = await ensureTenantSchema(db, tenantId);
    return { tenantId, strategy: "schema", schemaName, isPg: true };
  }

  await ensureSharedStructures();
  return { tenantId, strategy: "shared", schemaName: null, isPg: dialect === "pg" };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function readKey(key, fallback, options = {}) {
  const { tenantId, strategy, schemaName, isPg } = await getTenantContext(options);
  const ck = _cacheKey(key, tenantId);

  const cached = _cacheGet(ck);
  if (cached !== undefined) return cached;

  if (_kvInflight.has(ck)) {
    const val = await _kvInflight.get(ck);
    return val !== undefined ? val : fallback;
  }

  const dbPromise = (async () => {
    if (!isPg) {
      return _knexRead(key, tenantId, strategy, schemaName);
    }

    const db = getDrizzleDb();

    if (strategy === "schema") {
      const result = await db.execute(
        sql`SELECT value FROM ${sql.raw(`"${schemaName}"."kv_store"`)} WHERE key = ${key}`
      );
      const row = result.rows[0];
      return row ? parseValue(row.value, undefined) : undefined;
    }

    const rows = await db
      .select()
      .from(tenantKv)
      .where(and(eq(tenantKv.tenantId, tenantId), eq(tenantKv.key, key)));
    const row = rows[0];
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
  const { tenantId, strategy, schemaName, isPg } = await getTenantContext(options);
  const ck = _cacheKey(key, tenantId);

  _cacheSet(ck, value);

  if (!isPg) {
    await _knexWrite(key, value, tenantId, strategy, schemaName);
    return;
  }

  const db = getDrizzleDb();

  if (strategy === "schema") {
    const jsonStr = JSON.stringify(value);
    await db.execute(
      sql`INSERT INTO ${sql.raw(`"${schemaName}"."kv_store"`)} (key, value, updated_at)
          VALUES (${key}, ${jsonStr}::jsonb, now())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`
    );
    return;
  }

  await db
    .insert(tenantKv)
    .values({ tenantId, key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [tenantKv.tenantId, tenantKv.key],
      set: { value, updatedAt: new Date() },
    });
}

export async function deleteKey(key, options = {}) {
  const { tenantId, strategy, schemaName, isPg } = await getTenantContext(options);
  _cacheDelete(_cacheKey(key, tenantId));

  if (!isPg) {
    await _knexDelete(key, tenantId, strategy, schemaName);
    return;
  }

  const db = getDrizzleDb();

  if (strategy === "schema") {
    await db.execute(
      sql`DELETE FROM ${sql.raw(`"${schemaName}"."kv_store"`)} WHERE key = ${key}`
    );
    return;
  }

  await db
    .delete(tenantKv)
    .where(and(eq(tenantKv.tenantId, tenantId), eq(tenantKv.key, key)));
}

export async function listKeys(options = {}) {
  const { tenantId, strategy, schemaName, isPg } = await getTenantContext(options);

  if (!isPg) {
    return _knexList(tenantId, strategy, schemaName);
  }

  const db = getDrizzleDb();

  if (strategy === "schema") {
    const result = await db.execute(
      sql`SELECT key, updated_at FROM ${sql.raw(`"${schemaName}"."kv_store"`)}`
    );
    return result.rows;
  }

  return db
    .select({ key: tenantKv.key, updatedAt: tenantKv.updatedAt })
    .from(tenantKv)
    .where(eq(tenantKv.tenantId, tenantId));
}

export async function purgeTenant(tenantId) {
  const id = sanitizeTenantId(tenantId, DEFAULT_TENANT_ID);
  const strategy = getTenantStrategy();
  const dialect = getDbDialect();

  if (strategy === "schema" && dialect === "pg") {
    const db = getDrizzleDb();
    const schemaName = schemaNameForTenant(id);
    await db.execute(
      sql.raw(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
    );
    await db.delete(tenantRegistry).where(eq(tenantRegistry.tenantId, id));
    schemaCache.delete(schemaName);
    return;
  }

  if (dialect === "pg") {
    const db = getDrizzleDb();
    await db
      .delete(tenantKv)
      .where(eq(tenantKv.tenantId, id));
    await db
      .delete(tenantRegistry)
      .where(eq(tenantRegistry.tenantId, id));
    return;
  }

  const knexDb = getDatabase();
  await knexDb("tenant_kv").where({ tenant_id: id }).del();
  await knexDb("tenant_registry").where({ tenant_id: id }).del();
}

export const DB_FILE = null;
