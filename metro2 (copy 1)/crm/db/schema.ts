import {
  pgTable,
  text,
  jsonb,
  timestamp,
  primaryKey,
  serial,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

export const tenantKv = pgTable(
  "tenant_kv",
  {
    tenantId: text("tenant_id").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.key] })]
);

export const tenantRegistry = pgTable("tenant_registry", {
  tenantId: text("tenant_id").primaryKey(),
  schemaName: text("schema_name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastMigrationAt: timestamp("last_migration_at"),
  lastMigrationDurationMs: integer("last_migration_duration_ms"),
  migrationsSuccessCount: integer("migrations_success_count")
    .notNull()
    .default(0),
  migrationsFailureCount: integer("migrations_failure_count")
    .notNull()
    .default(0),
  lastMigrationError: text("last_migration_error"),
});

export const tenantMigrationEvents = pgTable("tenant_migration_events", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  context: text("context").notNull().default("onboarding"),
  success: boolean("success").notNull().default(true),
  durationMs: integer("duration_ms").notNull().default(0),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const checkoutConversionEvents = pgTable(
  "checkout_conversion_events",
  {
    id: serial("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    invoiceId: text("invoice_id").notNull(),
    stage: text("stage").notNull(),
    success: boolean("success").notNull().default(false),
    sessionId: text("session_id"),
    amountCents: integer("amount_cents").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    metadata: jsonb("metadata"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }
);

export const abTestAssignments = pgTable("ab_test_assignments", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  testKey: text("test_key").notNull(),
  variant: text("variant").notNull(),
  visitorId: text("visitor_id"),
  context: text("context").notNull().default("portal"),
  converted: boolean("converted").notNull().default(false),
  assignedAt: timestamp("assigned_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  metadata: jsonb("metadata"),
});
