import { getDatabase } from "../db/connection.js";
import { sanitizeTenantId, DEFAULT_TENANT_ID } from "../tenantLimits.js";
import { logWarn } from "../logger.js";

function truncate(str, max = 2000) {
  if (!str) return null;
  const value = String(str);
  return value.length > max ? value.slice(0, max) : value;
}

function clampDuration(durationMs) {
  const num = Math.round(Number(durationMs) || 0);
  if (!Number.isFinite(num) || num < 0) return 0;
  return num;
}

function adaptMetadata(db, metadata) {
  if (!metadata || typeof metadata !== "object") {
    return metadata ?? null;
  }
  const client = (db?.client?.config?.client || "").toLowerCase();
  if (client.includes("sqlite")) {
    try {
      return JSON.stringify(metadata);
    } catch (err) {
      logWarn("METRIC_METADATA_SERIALIZE_FAILED", err?.message || String(err));
      return null;
    }
  }
  return metadata;
}

async function ensureTenantRegistryRow(trx, tenantId) {
  const existing = await trx("tenant_registry").where({ tenant_id: tenantId }).first();
  if (existing) {
    return existing;
  }
  const now = trx.fn.now();
  await trx("tenant_registry").insert({
    tenant_id: tenantId,
    created_at: now,
    updated_at: now,
  });
  return trx("tenant_registry").where({ tenant_id: tenantId }).first();
}

export async function recordTenantMigrationMetric({
  tenantId = DEFAULT_TENANT_ID,
  durationMs = 0,
  success = true,
  context = "onboarding",
  errorMessage = null,
  metadata = null,
} = {}) {
  const db = getDatabase();
  const normalizedTenant = sanitizeTenantId(tenantId, DEFAULT_TENANT_ID);
  const payload = {
    tenant_id: normalizedTenant,
    context: context || "onboarding",
    success: !!success,
    duration_ms: clampDuration(durationMs),
    error_message: errorMessage ? truncate(errorMessage) : null,
    metadata: adaptMetadata(db, metadata),
  };
  try {
    await db.transaction(async (trx) => {
      await trx("tenant_migration_events").insert(payload);
      const registryRow = await ensureTenantRegistryRow(trx, normalizedTenant);
      const now = trx.fn.now();
      const currentSuccess = Number(registryRow?.migrations_success_count || 0);
      const currentFailure = Number(registryRow?.migrations_failure_count || 0);
      const nextSuccess = currentSuccess + (success ? 1 : 0);
      const nextFailure = currentFailure + (success ? 0 : 1);
      await trx("tenant_registry")
        .where({ tenant_id: normalizedTenant })
        .update({
          last_migration_at: now,
          last_migration_duration_ms: clampDuration(durationMs),
          last_migration_error: success ? null : truncate(errorMessage),
          migrations_success_count: nextSuccess,
          migrations_failure_count: nextFailure,
          updated_at: now,
        });
    });
  } catch (err) {
    logWarn("TENANT_MIGRATION_METRIC_FAILED", err?.message || String(err), {
      tenantId: normalizedTenant,
    });
  }
}

export async function recordCheckoutStage({
  tenantId = DEFAULT_TENANT_ID,
  invoiceId,
  stage,
  success = false,
  sessionId = null,
  amountCents = 0,
  currency = "usd",
  metadata = null,
} = {}) {
  if (!invoiceId || !stage) return;
  const db = getDatabase();
  const normalizedTenant = sanitizeTenantId(tenantId, DEFAULT_TENANT_ID);
  const payload = {
    tenant_id: normalizedTenant,
    invoice_id: String(invoiceId),
    stage: stage.toString().slice(0, 64),
    success: !!success,
    session_id: sessionId ? String(sessionId).slice(0, 128) : null,
    amount_cents: clampDuration(amountCents),
    currency: (currency || "usd").toString().slice(0, 16).toLowerCase(),
    metadata: adaptMetadata(db, metadata),
  };
  try {
    await db("checkout_conversion_events").insert(payload);
  } catch (err) {
    logWarn("CHECKOUT_STAGE_METRIC_FAILED", err?.message || String(err), {
      tenantId: normalizedTenant,
      invoiceId: String(invoiceId),
      stage,
    });
  }
}

function resolveVariant(variants = []) {
  if (!Array.isArray(variants) || variants.length === 0) {
    return "control";
  }
  const weighted = variants.flatMap((variant) => {
    if (!variant) return [];
    const weight = Math.max(1, Number(variant.weight || 1));
    return Array.from({ length: weight }, () => variant.name || variant.variant || variant);
  });
  if (!weighted.length) {
    return variants[0].name || variants[0].variant || variants[0] || "control";
  }
  const idx = Math.floor(Math.random() * weighted.length);
  return weighted[idx] || "control";
}

export async function assignExperimentVariant({
  tenantId = DEFAULT_TENANT_ID,
  testKey,
  visitorId = "",
  variants = [
    { name: "control", weight: 1 },
    { name: "dedicated", weight: 1 },
  ],
  context = "portal",
  metadata = null,
} = {}) {
  if (!testKey) {
    return { variant: "control" };
  }
  const db = getDatabase();
  const normalizedTenant = sanitizeTenantId(tenantId, DEFAULT_TENANT_ID);
  const normalizedVisitor = visitorId ? String(visitorId).slice(0, 128) : null;
  try {
    const existing = await db("ab_test_assignments")
      .where({ tenant_id: normalizedTenant, test_key: testKey, context, visitor_id: normalizedVisitor })
      .first();
    if (existing) {
      return { variant: existing.variant, converted: !!existing.converted };
    }
    const variantName = resolveVariant(variants);
    await db("ab_test_assignments").insert({
      tenant_id: normalizedTenant,
      test_key: testKey,
      variant: variantName,
      visitor_id: normalizedVisitor,
      context,
      metadata: adaptMetadata(db, metadata),
    });
    return { variant: variantName, converted: false };
  } catch (err) {
    logWarn("AB_ASSIGNMENT_FAILED", err?.message || String(err), {
      tenantId: normalizedTenant,
      testKey,
    });
    return { variant: "control" };
  }
}

export async function recordExperimentConversion({
  tenantId = DEFAULT_TENANT_ID,
  testKey,
  visitorId = "",
  context = "portal",
  metadata = null,
} = {}) {
  if (!testKey) return;
  const db = getDatabase();
  const normalizedTenant = sanitizeTenantId(tenantId, DEFAULT_TENANT_ID);
  const normalizedVisitor = visitorId ? String(visitorId).slice(0, 128) : null;
  try {
    const updated = await db("ab_test_assignments")
      .where({ tenant_id: normalizedTenant, test_key: testKey, context, visitor_id: normalizedVisitor })
      .update({
        converted: true,
        converted_at: db.fn.now(),
        metadata: adaptMetadata(db, metadata),
      });
    if (!updated) {
      await db("ab_test_assignments").insert({
        tenant_id: normalizedTenant,
        test_key: testKey,
        variant: "control",
        visitor_id: normalizedVisitor,
        context,
        converted: true,
        converted_at: db.fn.now(),
        metadata: adaptMetadata(db, metadata),
      });
    }
  } catch (err) {
    logWarn("AB_CONVERSION_FAILED", err?.message || String(err), {
      tenantId: normalizedTenant,
      testKey,
    });
  }
}
