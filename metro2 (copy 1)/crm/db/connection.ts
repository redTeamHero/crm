import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import knex, { type Knex } from "knex";
import * as schema from "./schema.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const MIGRATIONS_DIR = path.join(PROJECT_ROOT, "migrations");

const SUPPORTED_CLIENTS = new Map([
  ["postgres", "pg"],
  ["postgresql", "pg"],
  ["pg", "pg"],
  ["mysql", "mysql2"],
  ["mysql2", "mysql2"],
  ["mariadb", "mysql2"],
  ["sqlite", "sqlite3"],
  ["sqlite3", "sqlite3"],
]);

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function normalizeClient(input?: string): string {
  const raw = (input || "").toString().trim().toLowerCase();
  if (!raw) {
    if (process.env.DATABASE_URL) return "pg";
    return "sqlite3";
  }
  return SUPPORTED_CLIENTS.get(raw) || raw;
}

export function getTenantStrategy(): string {
  const strategy = (process.env.DB_TENANT_STRATEGY || "partitioned")
    .trim()
    .toLowerCase();
  if (["schema", "partitioned", "shared"].includes(strategy)) return strategy;
  return "partitioned";
}

export function getSchemaPrefix(): string {
  return process.env.DB_TENANT_SCHEMA_PREFIX || "tenant_";
}

export function getDbDialect(): "pg" | "sqlite" | "mysql" {
  const client = normalizeClient(process.env.DATABASE_CLIENT);
  if (client === "pg") return "pg";
  if (client === "sqlite3") return "sqlite";
  return "mysql";
}

let _pool: Pool | null = null;
let _drizzleDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _knexInstance: Knex | null = null;
let _migrationPromise: Promise<void> | null = null;

function buildPgPool(): Pool {
  const connectionUrl = process.env.DATABASE_URL;
  if (!connectionUrl) {
    throw new Error("DATABASE_URL is required for PostgreSQL connections.");
  }
  const ssl =
    process.env.NODE_ENV === "production" ||
    connectionUrl.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined;
  return new Pool({
    connectionString: connectionUrl,
    min: Number.parseInt(process.env.DATABASE_POOL_MIN || "0", 10) || 0,
    max: Number.parseInt(process.env.DATABASE_POOL_MAX || "10", 10) || 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl,
  });
}

function buildKnexConfig(): Knex.Config {
  const client = normalizeClient(process.env.DATABASE_CLIENT);
  const poolMin =
    Number.parseInt(process.env.DATABASE_POOL_MIN || "0", 10) || 0;
  const poolMax =
    Number.parseInt(process.env.DATABASE_POOL_MAX || "10", 10) || 10;

  const baseConfig: Knex.Config = {
    client,
    pool: {
      min: poolMin,
      max: poolMax,
      acquireTimeoutMillis: 10000,
      createTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      propagateCreateError: false,
    },
    migrations: {
      directory: MIGRATIONS_DIR,
      tableName: "schema_versions",
    },
    log: {
      warn(message: string) {
        if (process.env.NODE_ENV !== "test") console.warn("[knex:warn]", message);
      },
      error(message: string) {
        console.error("[knex:error]", message);
      },
      deprecate(message: string) {
        if (process.env.NODE_ENV !== "test")
          console.warn("[knex:deprecate]", message);
      },
      debug(message: string) {
        if (process.env.KNEX_DEBUG) console.debug("[knex:debug]", message);
      },
    },
  };

  if (client === "sqlite3") {
    ensureDataDir();
    const filename =
      process.env.DATABASE_URL && process.env.DATABASE_URL.includes("://")
        ? path.join(PROJECT_ROOT, "dev.sqlite")
        : process.env.DATABASE_URL || path.join(PROJECT_ROOT, "dev.sqlite");

    console.log("Using database file:", filename);
    try {
      const targetPath = path.isAbsolute(filename)
        ? filename
        : path.join(PROJECT_ROOT, filename);
      if (!fs.existsSync(targetPath)) {
        fs.writeFileSync(targetPath, "");
        fs.chmodSync(targetPath, 0o666);
      }
    } catch (e) {
      console.error("Failed to ensure database file:", e);
    }
    return { ...baseConfig, connection: { filename }, useNullAsDefault: true };
  }

  const connectionUrl = process.env.DATABASE_URL;
  if (!connectionUrl) {
    throw new Error(
      "DATABASE_URL is required for PostgreSQL/MySQL connections."
    );
  }
  const pgConnection: Record<string, unknown> = {
    connectionString: connectionUrl,
  };
  if (
    process.env.NODE_ENV === "production" ||
    connectionUrl.includes("sslmode=require")
  ) {
    pgConnection.ssl = { rejectUnauthorized: false };
  }
  return { ...baseConfig, connection: pgConnection };
}

function getKnexInstance(): Knex {
  if (!_knexInstance) {
    _knexInstance = knex(buildKnexConfig());
  }
  return _knexInstance;
}

export function getDrizzleDb(): ReturnType<typeof drizzle<typeof schema>> {
  const client = normalizeClient(process.env.DATABASE_CLIENT);
  if (client !== "pg") {
    throw new Error(
      `Drizzle db requires PostgreSQL. Current client: "${client}". Use getDatabase() for non-pg drivers.`
    );
  }
  if (!_drizzleDb) {
    _pool = buildPgPool();
    _drizzleDb = drizzle(_pool, { schema });
  }
  return _drizzleDb;
}

export function getDatabase(): Knex {
  return getKnexInstance();
}

export async function runMigrations(): Promise<void> {
  if (!_migrationPromise) {
    const knexDb = getKnexInstance();
    _migrationPromise = knexDb.migrate
      .latest()
      .then(() => undefined)
      .catch((err: Error) => {
        _migrationPromise = null;
        console.error("[db] Migration failed:", err.message);
        throw err;
      });
  }
  return _migrationPromise;
}

export async function testConnection(): Promise<boolean> {
  try {
    const client = normalizeClient(process.env.DATABASE_CLIENT);
    if (client === "pg") {
      const pool = _pool || buildPgPool();
      const res = await pool.query("SELECT 1");
      return res.rows.length > 0;
    }
    await getKnexInstance().raw("SELECT 1");
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[db] Connection test failed:", message);
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  const errors: Error[] = [];
  if (_pool) {
    try {
      await _pool.end();
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)));
    } finally {
      _pool = null;
      _drizzleDb = null;
    }
  }
  if (_knexInstance) {
    try {
      await _knexInstance.destroy();
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)));
    } finally {
      _knexInstance = null;
      _migrationPromise = null;
    }
  }
  if (errors.length > 0) {
    throw errors[0];
  }
}

export const db = new Proxy({} as ReturnType<typeof getDrizzleDb>, {
  get(_target, prop, _receiver) {
    const instance = getDrizzleDb();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(instance);
    }
    return value;
  },
});
