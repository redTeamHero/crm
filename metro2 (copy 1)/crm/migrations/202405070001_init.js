export async function up(knex) {
  const client = knex.client.config.client;
  const hashPartitions = Number.parseInt(process.env.DB_PARTITIONS || "8", 10) || 8;

  if (client === "pg") {
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS tenant_kv (
        tenant_id text NOT NULL,
        key text NOT NULL,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, key)
      ) PARTITION BY HASH (tenant_id);
    `);

    for (let i = 0; i < hashPartitions; i += 1) {
      await knex.raw(
        `CREATE TABLE IF NOT EXISTS tenant_kv_p${i} PARTITION OF tenant_kv FOR VALUES WITH (MODULUS ${hashPartitions}, REMAINDER ${i});`
      );
    }

    await knex.raw(`CREATE INDEX IF NOT EXISTS tenant_kv_key_idx ON tenant_kv USING btree (key);`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS tenant_kv_updated_at_idx ON tenant_kv USING btree (updated_at);`);

    await knex.raw(`
      CREATE TABLE IF NOT EXISTS tenant_registry (
        tenant_id text PRIMARY KEY,
        schema_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  } else {
    const hasTable = await knex.schema.hasTable("tenant_kv");
    if (!hasTable) {
      await knex.schema.createTable("tenant_kv", (table) => {
        table.string("tenant_id", 128).notNullable();
        table.string("key", 256).notNullable();
        if (client === "mysql" || client === "mysql2") {
          table.json("value").notNullable();
        } else {
          table.text("value").notNullable();
        }
        table.dateTime("updated_at").notNullable().defaultTo(knex.fn.now());
        table.primary(["tenant_id", "key"]);
      });
    }
    try {
      await knex.raw(`CREATE INDEX IF NOT EXISTS tenant_kv_key_idx ON tenant_kv (key);`);
    } catch (err) {
      if (!/exists/i.test(err.message)) {
        throw err;
      }
    }
    try {
      await knex.raw(`CREATE INDEX IF NOT EXISTS tenant_kv_updated_at_idx ON tenant_kv (updated_at);`);
    } catch (err) {
      if (!/exists/i.test(err.message)) {
        throw err;
      }
    }
    if (client === "mysql" || client === "mysql2") {
      await knex.raw(
        `ALTER TABLE tenant_kv PARTITION BY KEY(tenant_id) PARTITIONS ${hashPartitions}`
      ).catch((err) => {
        if (!/partition/i.test(err.message)) {
          throw err;
        }
      });
    }

    const hasRegistry = await knex.schema.hasTable("tenant_registry");
    if (!hasRegistry) {
      await knex.schema.createTable("tenant_registry", (table) => {
        table.string("tenant_id", 128).primary();
        table.string("schema_name", 128);
        table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
        table.dateTime("updated_at").notNullable().defaultTo(knex.fn.now());
      });
    }
  }
}

export async function down(knex) {
  const client = knex.client.config.client;
  if (client === "pg") {
    const partitions = Number.parseInt(process.env.DB_PARTITIONS || "8", 10) || 8;
    for (let i = 0; i < partitions; i += 1) {
      await knex.raw(`DROP TABLE IF EXISTS tenant_kv_p${i} CASCADE;`);
    }
    await knex.raw(`DROP TABLE IF EXISTS tenant_kv CASCADE;`);
    await knex.raw(`DROP TABLE IF EXISTS tenant_registry CASCADE;`);
  } else {
    await knex.schema.dropTableIfExists("tenant_kv");
    await knex.schema.dropTableIfExists("tenant_registry");
  }
}
