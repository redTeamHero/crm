import type { Config } from "drizzle-kit";

const rawClient = (
  process.env.DATABASE_CLIENT ||
  (process.env.DATABASE_URL ? "pg" : "sqlite")
).toLowerCase();

const isSqlite =
  rawClient === "sqlite" ||
  rawClient === "sqlite3" ||
  rawClient === "better-sqlite3";

export default {
  schema: "./db/schema.ts",
  out: "./migrations-drizzle",
  dialect: isSqlite ? "sqlite" : "postgresql",
  dbCredentials: isSqlite
    ? { url: process.env.DATABASE_URL || "./data/dev.sqlite" }
    : { url: process.env.DATABASE_URL! },
} satisfies Config;
