export async function up(knex) {
  const client = knex.client.config.client;

  const hasRegistry = await knex.schema.hasTable("tenant_registry");
  if (hasRegistry) {
    const hasLastMigrationAt = await knex.schema.hasColumn("tenant_registry", "last_migration_at");
    if (!hasLastMigrationAt) {
      await knex.schema.alterTable("tenant_registry", (table) => {
        table.timestamp("last_migration_at").nullable();
        table.integer("last_migration_duration_ms").nullable();
        table.integer("migrations_success_count").notNullable().defaultTo(0);
        table.integer("migrations_failure_count").notNullable().defaultTo(0);
        table.text("last_migration_error").nullable();
      });
    }
  }

  const jsonColumn = (table, name) => {
    if (client === "pg" || client === "postgres" || client === "postgresql") {
      table.jsonb(name).nullable();
    } else if (client === "mysql" || client === "mysql2" || client === "mariadb") {
      table.json(name).nullable();
    } else {
      table.text(name).nullable();
    }
  };

  const hasMigrationEvents = await knex.schema.hasTable("tenant_migration_events");
  if (!hasMigrationEvents) {
    await knex.schema.createTable("tenant_migration_events", (table) => {
      table.increments("id").primary();
      table.string("tenant_id", 128).notNullable();
      table.string("context", 64).notNullable().defaultTo("onboarding");
      table.boolean("success").notNullable().defaultTo(true);
      table.integer("duration_ms").notNullable().defaultTo(0);
      table.text("error_message");
      jsonColumn(table, "metadata");
      table.timestamp("occurred_at").notNullable().defaultTo(knex.fn.now());
      table.index(["tenant_id", "occurred_at"], "tenant_migration_events_tenant_time_idx");
    });
  }

  const hasCheckout = await knex.schema.hasTable("checkout_conversion_events");
  if (!hasCheckout) {
    await knex.schema.createTable("checkout_conversion_events", (table) => {
      table.increments("id").primary();
      table.string("tenant_id", 128).notNullable();
      table.string("invoice_id", 128).notNullable();
      table.string("stage", 64).notNullable();
      table.boolean("success").notNullable().defaultTo(false);
      table.string("session_id", 128);
      table.integer("amount_cents").notNullable().defaultTo(0);
      table.string("currency", 16).notNullable().defaultTo("usd");
      jsonColumn(table, "metadata");
      table.timestamp("occurred_at").notNullable().defaultTo(knex.fn.now());
      table.index(["tenant_id", "stage", "occurred_at"], "checkout_events_stage_idx");
    });
  }

  const hasAssignments = await knex.schema.hasTable("ab_test_assignments");
  if (!hasAssignments) {
    await knex.schema.createTable("ab_test_assignments", (table) => {
      table.increments("id").primary();
      table.string("tenant_id", 128).notNullable();
      table.string("test_key", 128).notNullable();
      table.string("variant", 64).notNullable();
      table.string("visitor_id", 128);
      table.string("context", 64).notNullable().defaultTo("portal");
      table.boolean("converted").notNullable().defaultTo(false);
      table.timestamp("assigned_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("converted_at");
      jsonColumn(table, "metadata");
      table.unique(["tenant_id", "test_key", "visitor_id", "context"], "ab_assignments_unique");
      table.index(["tenant_id", "test_key"], "ab_assignments_test_idx");
    });
  }
}

export async function down(knex) {
  const hasAssignments = await knex.schema.hasTable("ab_test_assignments");
  if (hasAssignments) {
    await knex.schema.dropTable("ab_test_assignments");
  }

  const hasCheckout = await knex.schema.hasTable("checkout_conversion_events");
  if (hasCheckout) {
    await knex.schema.dropTable("checkout_conversion_events");
  }

  const hasMigrationEvents = await knex.schema.hasTable("tenant_migration_events");
  if (hasMigrationEvents) {
    await knex.schema.dropTable("tenant_migration_events");
  }

  const hasRegistry = await knex.schema.hasTable("tenant_registry");
  if (hasRegistry) {
    const hasLastMigrationAt = await knex.schema.hasColumn("tenant_registry", "last_migration_at");
    if (hasLastMigrationAt) {
      await knex.schema.alterTable("tenant_registry", (table) => {
        table.dropColumn("last_migration_at");
        table.dropColumn("last_migration_duration_ms");
        table.dropColumn("migrations_success_count");
        table.dropColumn("migrations_failure_count");
        table.dropColumn("last_migration_error");
      });
    }
  }
}
