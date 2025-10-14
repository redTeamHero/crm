import test from "node:test";
import assert from "node:assert/strict";

const originalClient = process.env.DATABASE_CLIENT;
const originalUrl = process.env.DATABASE_URL;

process.env.NODE_ENV = "test";
process.env.DATABASE_CLIENT = "sqlite3";
process.env.DATABASE_URL = ":memory:";

test("records tenant migrations, checkout stages, and experiment conversions", async () => {
  const connection = await import("../db/connection.js");
  const metrics = await import("../analytics/metrics.js");
  const { runMigrations, getDatabase, closeDatabase } = connection;
  const {
    recordTenantMigrationMetric,
    recordCheckoutStage,
    assignExperimentVariant,
    recordExperimentConversion,
  } = metrics;

  await runMigrations();

  await recordTenantMigrationMetric({ tenantId: "TenantA", durationMs: 37, success: true, context: "schema_bootstrap" });
  await recordCheckoutStage({
    tenantId: "TenantA",
    invoiceId: "INV123",
    stage: "session_created",
    success: true,
    sessionId: "sess_123",
    amountCents: 4999,
    metadata: { cacheHit: true },
  });

  const assignment = await assignExperimentVariant({
    tenantId: "TenantA",
    testKey: "test-banner",
    visitorId: "consumer1",
    variants: [
      { name: "control", weight: 1 },
      { name: "dedicated", weight: 1 },
    ],
  });
  await recordExperimentConversion({
    tenantId: "TenantA",
    testKey: "test-banner",
    visitorId: "consumer1",
    metadata: { action: "cta_click" },
  });

  const db = getDatabase();
  const migrationEvents = await db("tenant_migration_events").where({ tenant_id: "tenanta" });
  assert.equal(migrationEvents.length, 1);
  assert.equal(migrationEvents[0].duration_ms, 37);

  const registry = await db("tenant_registry").where({ tenant_id: "tenanta" }).first();
  assert.equal(registry.migrations_success_count, 1);
  assert.equal(registry.migrations_failure_count, 0);

  const checkoutEvents = await db("checkout_conversion_events").where({ invoice_id: "INV123" });
  assert.equal(checkoutEvents.length, 1);
  assert.equal(checkoutEvents[0].amount_cents, 4999);
  assert.equal(checkoutEvents[0].success, 1);

  const assignments = await db("ab_test_assignments").where({ test_key: "test-banner", visitor_id: "consumer1" });
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].converted, 1);
  assert.ok(["control", "dedicated"].includes(assignment.variant));

  await closeDatabase();
});

test.after(() => {
  if (originalClient === undefined) delete process.env.DATABASE_CLIENT;
  else process.env.DATABASE_CLIENT = originalClient;
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
});
