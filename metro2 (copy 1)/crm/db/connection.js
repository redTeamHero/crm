import fs from "fs";
import path from "path";
import knex from "knex";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const DEFAULT_SQLITE_FILE = path.join(DATA_DIR, "dev.sqlite");
const MIGRATIONS_DIR = path.join(PROJECT_ROOT, "migrations");

let knexInstance = null;
let migrationPromise = null;

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

function normalizeClient(input) {
  const raw = (input || "").toString().trim().toLowerCase();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      return "pg";
    }
    return "sqlite3";
  }
  return SUPPORTED_CLIENTS.get(raw) || raw;
}

function buildConnectionConfig() {
  const client = normalizeClient(process.env.DATABASE_CLIENT);
  if (!SUPPORTED_CLIENTS.has(client) && !Array.from(SUPPORTED_CLIENTS.values()).includes(client)) {
    throw new Error(
      `Unsupported database client "${client}". Set DATABASE_CLIENT to one of: ${Array.from(
        new Set(SUPPORTED_CLIENTS.values())
      ).join(", ")}.`
    );
  }
  const poolMin = Number.parseInt(process.env.DATABASE_POOL_MIN || "0", 10) || 0;
  const poolMax = Number.parseInt(process.env.DATABASE_POOL_MAX || "10", 10) || 10;
  const baseConfig = {
    client,
    pool: { min: poolMin, max: poolMax },
    migrations: {
      directory: MIGRATIONS_DIR,
      tableName: "schema_versions",
    },
    log: {
      warn(message) {
        if (process.env.NODE_ENV !== "test") {
          console.warn("[knex:warn]", message);
        }
      },
      error(message) {
        console.error("[knex:error]", message);
      },
      deprecate(message) {
        if (process.env.NODE_ENV !== "test") {
          console.warn("[knex:deprecate]", message);
        }
      },
      debug(message) {
        if (process.env.KNEX_DEBUG) {
          console.debug("[knex:debug]", message);
        }
      },
    },
  };

  if (client === "sqlite3") {
    ensureDataDir();
    const filename = process.env.DATABASE_URL
      ? process.env.DATABASE_URL.replace(/^file:/i, "")
      : DEFAULT_SQLITE_FILE;
    return {
      ...baseConfig,
      connection: {
        filename,
      },
      useNullAsDefault: true,
    };
  }

  const connectionUrl = process.env.DATABASE_URL;
  if (!connectionUrl) {
    throw new Error("DATABASE_URL is required for PostgreSQL/MySQL connections.");
  }
  return {
    ...baseConfig,
    connection: connectionUrl,
  };
}

export function getDatabase() {
  if (!knexInstance) {
    const config = buildConnectionConfig();
    knexInstance = knex(config);
  }
  return knexInstance;
}

export async function runMigrations() {
  if (!migrationPromise) {
    const db = getDatabase();
    migrationPromise = db.migrate.latest();
  }
  return migrationPromise;
}

export function getTenantStrategy() {
  const strategy = (process.env.DB_TENANT_STRATEGY || "partitioned").trim().toLowerCase();
  if (["schema", "partitioned", "shared"].includes(strategy)) {
    return strategy;
  }
  return "partitioned";
}

export function getSchemaPrefix() {
  return process.env.DB_TENANT_SCHEMA_PREFIX || "tenant_";
}

export async function closeDatabase() {
  if (knexInstance) {
    await knexInstance.destroy();
    knexInstance = null;
  }
  migrationPromise = null;
}
