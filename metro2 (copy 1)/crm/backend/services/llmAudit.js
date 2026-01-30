import OpenAI from "openai";
import Ajv from "ajv";
import { VIOLATION_LIST_SCHEMA } from "./llmSchemas.js";

// Pre-compiled regex patterns for performance
const RE_WHITESPACE = /\s+/g;
const RE_PIPE = /\|/g;
const RE_NON_ALPHANUM = /[^0-9A-Za-z]/g;
const RE_BRACKET_INDEX = /\[(\d+)\]/g;

// Configurable concurrency for parallel processing
const DEFAULT_CONCURRENCY = 3;

const AUDIT_SYSTEM_PROMPT = [
  "You are a compliance/audit engine.",
  "Only emit violations if evidence exists in the provided JSON.",
  "If prerequisites are missing, do not emit a violation.",
  "Do not compare missing values.",
  "Never hallucinate evidence or fields.",
].join(" ");

const AUDIT_DEVELOPER_PROMPT = [
  "Use only the CanonicalReport JSON provided.",
  "Provide tradelineKey exactly as listed in CanonicalReport.",
  "Return up to 50 violations, prioritizing high-signal Metro2 consistency and cross-bureau mismatches.",
  "Do not invent dates, balances, or account numbers.",
  "evidencePaths must reference valid JSON paths in CanonicalReport.",
  "If the evidence path is not present, do not emit the violation.",
  "Each violation must include bureau and tradelineKey.",
].join(" ");

const DEFAULT_AUDIT_MODEL = process.env.OPENAI_AUDIT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
const validateViolationList = ajv.compile(VIOLATION_LIST_SCHEMA);

function getOpenAiKey() {
  const key = process.env.OPENAI_API_KEY || "";
  if (!key.trim()) {
    throw new Error("OPENAI_API_KEY is required for LLM audit.");
  }
  return key.trim();
}

function getOpenAiClient() {
  return new OpenAI({ apiKey: getOpenAiKey() });
}

export function normalizeFurnisherName(value = "") {
  return String(value || "")
    .replace(RE_WHITESPACE, " ")
    .replace(RE_PIPE, " ")
    .trim()
    .toUpperCase();
}

export function cleanAccountMasked(value = "") {
  return String(value || "")
    .replace(RE_NON_ALPHANUM, "")
    .trim()
    .toUpperCase();
}

export function buildTradelineKey({ bureau, furnisherName, accountNumberMasked }) {
  const normalizedFurnisher = normalizeFurnisherName(furnisherName);
  const accountClean = cleanAccountMasked(accountNumberMasked);
  return `${bureau}|${normalizedFurnisher}|${accountClean}`;
}

export function addTradelineKeysToCanonicalReport(report = {}) {
  if (!report || typeof report !== "object") return report;
  const tradelines = Array.isArray(report.tradelines) ? report.tradelines : [];
  return {
    ...report,
    tradelines: tradelines.map((tradeline) => {
      if (!tradeline || typeof tradeline !== "object") return tradeline;
      const byBureau = tradeline.byBureau || {};
      const furnisherName = tradeline.furnisherName || "";
      const nextByBureau = {};
      ["TUC", "EXP", "EQF"].forEach((bureau) => {
        const entry = byBureau[bureau] && typeof byBureau[bureau] === "object"
          ? { ...byBureau[bureau] }
          : { present: false };
        const accountNumberMasked = entry.accountNumberMasked || null;
        entry.tradelineKey = buildTradelineKey({
          bureau,
          furnisherName,
          accountNumberMasked,
        });
        nextByBureau[bureau] = entry;
      });
      return {
        ...tradeline,
        byBureau: nextByBureau,
      };
    }),
  };
}

export function collectTradelineKeys(report = {}) {
  const keys = [];
  const seen = new Set();
  (report?.tradelines || []).forEach((tradeline) => {
    const byBureau = tradeline?.byBureau || {};
    ["TUC", "EXP", "EQF"].forEach((bureau) => {
      const entry = byBureau[bureau];
      const key = entry?.tradelineKey;
      if (typeof key === "string" && key.trim() && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    });
  });
  return keys;
}

function pathExists(root, path) {
  const parts = String(path || "")
    .replace(RE_BRACKET_INDEX, ".$1")
    .split(".")
    .filter(Boolean);
  let cursor = root;
  for (const part of parts) {
    if (cursor && Object.prototype.hasOwnProperty.call(cursor, part)) {
      cursor = cursor[part];
    } else {
      return false;
    }
  }
  return true;
}

function validateEvidencePaths(violation, report = {}) {
  if (!Array.isArray(violation.evidencePaths)) {
    return { valid: false, error: "evidencePaths must be an array." };
  }
  for (const path of violation.evidencePaths) {
    if (!pathExists(report, path)) {
      return { valid: false, error: `evidencePaths missing path: ${path}` };
    }
  }
  return { valid: true };
}

function validateTradelineKey(violation, tradelineKeySet) {
  if (!violation.tradelineKey) {
    return { valid: false, error: "tradelineKey required." };
  }
  if (tradelineKeySet.has(violation.tradelineKey)) {
    return { valid: true };
  }
  const normalizedFromKey = normalizeTradelineKeyInput(violation.tradelineKey);
  if (normalizedFromKey && tradelineKeySet.has(normalizedFromKey)) {
    violation.tradelineKey = normalizedFromKey;
    return { valid: true };
  }
  if (violation.bureau && violation.furnisherName !== undefined) {
    const normalizedFromFields = buildTradelineKey({
      bureau: violation.bureau,
      furnisherName: violation.furnisherName,
      accountNumberMasked: violation.accountNumberMasked,
    });
    if (tradelineKeySet.has(normalizedFromFields)) {
      violation.tradelineKey = normalizedFromFields;
      return { valid: true };
    }
  }
  return { valid: false, error: "tradelineKey not found in CanonicalReport." };
}

function filterValidViolations(violations = [], report = {}) {
  const errors = [];
  const tradelineKeySet = new Set(collectTradelineKeys(report));
  const validViolations = [];
  violations.forEach((violation, idx) => {
    const evidenceCheck = validateEvidencePaths(violation, report);
    if (!evidenceCheck.valid) {
      errors.push(`violations[${idx}].${evidenceCheck.error}`);
      return;
    }
    const tradelineCheck = validateTradelineKey(violation, tradelineKeySet);
    if (!tradelineCheck.valid) {
      errors.push(`violations[${idx}].${tradelineCheck.error}`);
      return;
    }
    validViolations.push(violation);
  });
  return { validViolations, errors };
}

function normalizeTradelineKeyInput(value) {
  if (typeof value !== "string") return null;
  const parts = value.split("|").map((part) => part.trim());
  if (parts.length < 3) return null;
  const [bureau, furnisherName, accountNumberMasked] = parts;
  if (!bureau) return null;
  return buildTradelineKey({
    bureau,
    furnisherName,
    accountNumberMasked,
  });
}

function buildViolationInstanceKey(violation) {
  if (!violation || typeof violation !== "object") return null;
  const tradelineKey = typeof violation.tradelineKey === "string" ? violation.tradelineKey : "";
  const ruleId = typeof violation.ruleId === "string" ? violation.ruleId : "";
  const base = [tradelineKey, ruleId].filter(Boolean).join("|");
  return base || null;
}

function extractOutputText(response) {
  if (response?.output_text) return response.output_text;
  if (Array.isArray(response?.output)) {
    const joined = response.output
      .map((item) => item?.content?.map((content) => content?.text || content?.output_text || "").join("") || "")
      .join("");
    if (joined.trim()) return joined;
  }
  const jsonContent = response?.output?.[0]?.content?.find((content) => content?.type === "output_json");
  if (jsonContent?.json) return JSON.stringify(jsonContent.json);
  return "";
}

/**
 * Process items in parallel with configurable concurrency limit
 * @param {Array} items - Items to process
 * @param {Function} processor - Async function to process each item
 * @param {number} concurrency - Max concurrent operations
 * @returns {Promise<Array>} Results array
 */
async function parallelProcess(items, processor, concurrency = DEFAULT_CONCURRENCY) {
  const results = [];
  const executing = new Set();
  
  for (const [index, item] of items.entries()) {
    const promise = Promise.resolve().then(() => processor(item, index));
    results.push(promise);
    executing.add(promise);
    
    const cleanup = () => executing.delete(promise);
    promise.then(cleanup, cleanup);
    
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  
  return Promise.all(results);
}

/**
 * Process tradelines by bureau in parallel
 * @param {Object} report - Canonical report
 * @returns {Object} Report split by bureau for parallel processing
 */
export function splitReportByBureau(report = {}) {
  const tradelines = Array.isArray(report.tradelines) ? report.tradelines : [];
  const bureauReports = {
    TUC: { ...report, tradelines: [], bureau: "TUC" },
    EXP: { ...report, tradelines: [], bureau: "EXP" },
    EQF: { ...report, tradelines: [], bureau: "EQF" },
  };
  
  for (const tradeline of tradelines) {
    const byBureau = tradeline?.byBureau || {};
    for (const bureau of ["TUC", "EXP", "EQF"]) {
      const entry = byBureau[bureau];
      // Only include if bureau data explicitly exists and is not marked absent
      if (entry && typeof entry === "object" && entry.present !== false) {
        bureauReports[bureau].tradelines.push({
          ...tradeline,
          // Keep full byBureau to preserve cross-bureau context for audit logic
          byBureau: tradeline.byBureau,
        });
      }
    }
  }
  
  return bureauReports;
}

/**
 * Audit a single bureau's tradelines
 * @throws {Error} Propagates errors to caller for proper error handling
 */
async function auditBureau(bureauReport, client, model) {
  if (!bureauReport.tradelines.length) {
    return { violations: [], rawCount: 0, bureau: bureauReport.bureau };
  }
  
  const response = await client.responses.create({
    model: model || DEFAULT_AUDIT_MODEL,
    input: [
      { role: "system", content: AUDIT_SYSTEM_PROMPT },
      { role: "developer", content: AUDIT_DEVELOPER_PROMPT },
      { role: "user", content: JSON.stringify(bureauReport) },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "ViolationList",
        strict: true,
        schema: VIOLATION_LIST_SCHEMA,
      },
    },
    temperature: 0,
    store: false,
  });

  const outputText = extractOutputText(response);
  if (!outputText) {
    throw new Error(`LLM audit response missing structured output for bureau ${bureauReport.bureau}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (err) {
    throw new Error(`LLM audit output for bureau ${bureauReport.bureau} is not valid JSON: ${err?.message || err}`);
  }

  if (!validateViolationList(parsed)) {
    const details = validateViolationList.errors?.map((e) => `${e.instancePath} ${e.message}`).join("; ");
    throw new Error(`LLM audit schema validation failed for bureau ${bureauReport.bureau}: ${details || "unknown error"}`);
  }

  return {
    violations: Array.isArray(parsed.violations) ? parsed.violations : [],
    rawCount: parsed.violations?.length || 0,
    bureau: bureauReport.bureau,
  };
}

/**
 * Audit canonical report with parallel bureau processing
 * @param {Object} report - Canonical report to audit
 * @param {Object} options - Audit options
 * @param {string} options.model - OpenAI model to use
 * @param {boolean} options.parallel - Enable parallel bureau processing (default: true)
 * @param {number} options.concurrency - Max concurrent API calls (default: 3)
 * @returns {Promise<Object>} Audit results with violations
 */
export async function auditCanonicalReport(report, { model, parallel = true, concurrency = DEFAULT_CONCURRENCY } = {}) {
  if (!report || typeof report !== "object") {
    throw new Error("CanonicalReport is required for audit.");
  }
  
  const client = getOpenAiClient();
  
  // Parallel bureau processing for faster results
  if (parallel && Array.isArray(report.tradelines) && report.tradelines.length > 5) {
    const bureauReports = splitReportByBureau(report);
    const bureaus = ["TUC", "EXP", "EQF"].filter(
      (b) => bureauReports[b].tradelines.length > 0
    );
    
    let bureauResults;
    try {
      bureauResults = await parallelProcess(
        bureaus,
        (bureau) => auditBureau(bureauReports[bureau], client, model),
        concurrency
      );
    } catch (err) {
      // If any bureau audit fails, propagate the error to maintain parity with sequential behavior
      throw new Error(`Parallel bureau audit failed: ${err?.message || err}`);
    }
    
    // Merge violations from all bureaus
    const allViolations = bureauResults.flatMap((r) => r.violations || []);
    const totalRawCount = bureauResults.reduce((sum, r) => sum + (r.rawCount || 0), 0);
    
    const { validViolations, errors } = filterValidViolations(allViolations, report);
    if (errors.length) {
      console.warn(
        `LLM audit validation filtered ${errors.length} violation(s): ${errors.join("; ")}`
      );
    }
    
    return {
      violations: validViolations.slice(0, 50).map((violation) => ({
        ...violation,
        instanceKey: buildViolationInstanceKey(violation),
      })),
      rawCount: totalRawCount,
    };
  }
  
  // Standard sequential processing for smaller reports
  const response = await client.responses.create({
    model: model || DEFAULT_AUDIT_MODEL,
    input: [
      { role: "system", content: AUDIT_SYSTEM_PROMPT },
      { role: "developer", content: AUDIT_DEVELOPER_PROMPT },
      { role: "user", content: JSON.stringify(report) },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "ViolationList",
        strict: true,
        schema: VIOLATION_LIST_SCHEMA,
      },
    },
    temperature: 0,
    store: false,
  });

  const outputText = extractOutputText(response);
  if (!outputText) {
    throw new Error("LLM audit response missing structured output.");
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (err) {
    throw new Error(`LLM audit output is not valid JSON: ${err?.message || err}`);
  }

  if (!validateViolationList(parsed)) {
    const details = validateViolationList.errors?.map((e) => `${e.instancePath} ${e.message}`).join("; ");
    throw new Error(`LLM audit schema validation failed: ${details || "unknown error"}`);
  }

  const violations = Array.isArray(parsed.violations) ? parsed.violations : [];
  const { validViolations, errors } = filterValidViolations(violations, report);
  if (errors.length) {
    console.warn(
      `LLM audit validation filtered ${errors.length} violation(s): ${errors.join("; ")}`
    );
  }

  return {
    violations: validViolations.slice(0, 50).map((violation) => ({
      ...violation,
      instanceKey: buildViolationInstanceKey(violation),
    })),
    rawCount: violations.length,
  };
}
