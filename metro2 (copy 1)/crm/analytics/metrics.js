import { getDrizzleDb, getDbDialect } from "../db/connection.ts";
import {
  tenantRegistry,
  tenantMigrationEvents,
  checkoutConversionEvents,
  abTestAssignments,
} from "../db/schema.ts";
import { eq, and } from "drizzle-orm";
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

function adaptMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return metadata ?? null;
  const dialect = getDbDialect();
  if (dialect === "sqlite") {
    try {
      return JSON.stringify(metadata);
    } catch {
      logWarn("METRIC_METADATA_SERIALIZE_FAILED", "could not serialize metadata");
      return null;
    }
  }
  return metadata;
}

async function ensureTenantRegistryRow(tx, tenantId) {
  const rows = await tx
    .select()
    .from(tenantRegistry)
    .where(eq(tenantRegistry.tenantId, tenantId));
  const existing = rows[0] ?? null;
  if (existing) return existing;

  const now = new Date();
  await tx
    .insert(tenantRegistry)
    .values({ tenantId, createdAt: now, updatedAt: now });

  const inserted = await tx
    .select()
    .from(tenantRegistry)
    .where(eq(tenantRegistry.tenantId, tenantId));
  return inserted[0] ?? null;
}

export async function recordTenantMigrationMetric({
  tenantId = DEFAULT_TENANT_ID,
  durationMs = 0,
  success = true,
  context = "onboarding",
  errorMessage = null,
  metadata = null,
} = {}) {
  const db = getDrizzleDb();
  const normalizedTenant = sanitizeTenantId(tenantId, DEFAULT_TENANT_ID);
  const payload = {
    tenantId: normalizedTenant,
    context: context || "onboarding",
    success: !!success,
    durationMs: clampDuration(durationMs),
    errorMessage: errorMessage ? truncate(errorMessage) : null,
    metadata: adaptMetadata(metadata),
  };
  try {
    await db.transaction(async (tx) => {
      await tx.insert(tenantMigrationEvents).values(payload);
      const registryRow = await ensureTenantRegistryRow(tx, normalizedTenant);
      const now = new Date();
      const currentSuccess = Number(registryRow?.migrationsSuccessCount || 0);
      const currentFailure = Number(registryRow?.migrationsFailureCount || 0);
      const nextSuccess = currentSuccess + (success ? 1 : 0);
      const nextFailure = currentFailure + (success ? 0 : 1);
      await tx
        .update(tenantRegistry)
        .set({
          lastMigrationAt: now,
          lastMigrationDurationMs: clampDuration(durationMs),
          lastMigrationError: success ? null : truncate(errorMessage),
          migrationsSuccessCount: nextSuccess,
          migrationsFailureCount: nextFailure,
          updatedAt: now,
        })
        .where(eq(tenantRegistry.tenantId, normalizedTenant));
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
  const db = getDrizzleDb();
  const normalizedTenant = sanitizeTenantId(tenantId, DEFAULT_TENANT_ID);
  const payload = {
    tenantId: normalizedTenant,
    invoiceId: String(invoiceId),
    stage: stage.toString().slice(0, 64),
    success: !!success,
    sessionId: sessionId ? String(sessionId).slice(0, 128) : null,
    amountCents: clampDuration(amountCents),
    currency: (currency || "usd").toString().slice(0, 16).toLowerCase(),
    metadata: adaptMetadata(metadata),
  };
  try {
    await db.insert(checkoutConversionEvents).values(payload);
  } catch (err) {
    logWarn("CHECKOUT_STAGE_METRIC_FAILED", err?.message || String(err), {
      tenantId: normalizedTenant,
      invoiceId: String(invoiceId),
      stage,
    });
  }
}

function resolveVariant(variants = []) {
  if (!Array.isArray(variants) || variants.length === 0) return "control";
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
  if (!testKey) return { variant: "control" };
  const db = getDrizzleDb();
  const normalizedTenant = sanitizeTenantId(tenantId, DEFAULT_TENANT_ID);
  const normalizedVisitor = visitorId ? String(visitorId).slice(0, 128) : null;
  try {
    const rows = await db
      .select()
      .from(abTestAssignments)
      .where(
        and(
          eq(abTestAssignments.tenantId, normalizedTenant),
          eq(abTestAssignments.testKey, testKey),
          eq(abTestAssignments.context, context),
          eq(abTestAssignments.visitorId, normalizedVisitor)
        )
      );
    const existing = rows[0] ?? null;
    if (existing) {
      return { variant: existing.variant, converted: !!existing.converted };
    }
    const variantName = resolveVariant(variants);
    await db.insert(abTestAssignments).values({
      tenantId: normalizedTenant,
      testKey,
      variant: variantName,
      visitorId: normalizedVisitor,
      context,
      metadata: adaptMetadata(metadata),
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
  const db = getDrizzleDb();
  const normalizedTenant = sanitizeTenantId(tenantId, DEFAULT_TENANT_ID);
  const normalizedVisitor = visitorId ? String(visitorId).slice(0, 128) : null;
  try {
    const now = new Date();
    const rows = await db
      .select({ id: abTestAssignments.id })
      .from(abTestAssignments)
      .where(
        and(
          eq(abTestAssignments.tenantId, normalizedTenant),
          eq(abTestAssignments.testKey, testKey),
          eq(abTestAssignments.context, context),
          eq(abTestAssignments.visitorId, normalizedVisitor)
        )
      );
    const existing = rows[0] ?? null;
    if (existing) {
      await db
        .update(abTestAssignments)
        .set({
          converted: true,
          convertedAt: now,
          metadata: adaptMetadata(metadata),
        })
        .where(eq(abTestAssignments.id, existing.id));
    } else {
      await db.insert(abTestAssignments).values({
        tenantId: normalizedTenant,
        testKey,
        variant: "control",
        visitorId: normalizedVisitor,
        context,
        converted: true,
        convertedAt: now,
        metadata: adaptMetadata(metadata),
      });
    }
  } catch (err) {
    logWarn("AB_CONVERSION_FAILED", err?.message || String(err), {
      tenantId: normalizedTenant,
      testKey,
    });
  }
}
