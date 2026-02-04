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

const CROSS_BUREAU_SYSTEM_PROMPT = [
  "You are a credit report cross-bureau comparison engine.",
  "Your task is to identify DISCREPANCIES between bureaus (TransUnion/TUC, Experian/EXP, Equifax/EQF) for the same tradeline.",
  "Only emit violations when you find ACTUAL DIFFERENCES in the data between bureaus.",
  "If a field is missing from all bureaus, that is NOT a cross-bureau discrepancy.",
  "Never hallucinate data or differences.",
].join(" ");

const CROSS_BUREAU_DEVELOPER_PROMPT = [
  "Analyze tradelines for cross-bureau discrepancies.",
  "Focus on these violation types:",
  "1. cross_bureau_date_discrepancy: Date Opened, Date Closed, or Date of Last Payment differs between bureaus by more than 30 days.",
  "2. cross_bureau_balance_discrepancy: Balance or High Credit differs significantly between bureaus.",
  "3. cross_bureau_status_discrepancy: Account Status or Payment Status differs between bureaus.",
  "4. cross_bureau_missing_account: Account appears on some bureaus but is completely absent from others.",
  "For each violation, set bureau to the bureau with the discrepant/missing data.",
  "evidencePaths must reference valid JSON paths showing the compared values.",
  "Return up to 25 cross-bureau violations.",
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
 * Deduplicate violations by instanceKey to prevent duplicates from parallel processing
 * @param {Array} violations - Array of violations to deduplicate
 * @returns {Array} Deduplicated violations
 */
function deduplicateViolations(violations = []) {
  const seen = new Map();
  const result = [];
  
  for (const violation of violations) {
    const key = buildViolationInstanceKey(violation);
    if (key && !seen.has(key)) {
      seen.set(key, true);
      result.push(violation);
    } else if (!key) {
      result.push(violation);
    }
  }
  
  return result;
}

/**
 * Run cross-bureau comparison audit on full report
 * Detects discrepancies between TUC/EXP/EQF data for the same tradeline
 * @param {Object} report - Full canonical report with all bureau data
 * @param {Object} client - OpenAI client
 * @param {string} model - Model to use
 * @returns {Promise<Object>} Cross-bureau violations
 */
async function crossBureauAudit(report, client, model) {
  const tradelines = Array.isArray(report.tradelines) ? report.tradelines : [];
  
  // Filter tradelines for cross-bureau analysis:
  // 1. Tradelines with 2+ bureaus (for discrepancy comparison including all 3 bureaus)
  // 2. Tradelines with exactly 1 bureau (missing from other bureaus - potential cross_bureau_missing_account)
  const multiBureauTradelines = tradelines.filter((tl) => {
    const byBureau = tl?.byBureau || {};
    const presentBureaus = ["TUC", "EXP", "EQF"].filter((b) => {
      const entry = byBureau[b];
      return entry && typeof entry === "object" && entry.present !== false;
    });
    // Include if present on 2+ bureaus (for date/balance/status comparison)
    return presentBureaus.length >= 2;
  });
  
  const missingBureauTradelines = tradelines.filter((tl) => {
    const byBureau = tl?.byBureau || {};
    const presentBureaus = ["TUC", "EXP", "EQF"].filter((b) => {
      const entry = byBureau[b];
      return entry && typeof entry === "object" && entry.present !== false;
    });
    // Include if present on 1-2 bureaus (missing from others - cross_bureau_missing_account)
    return presentBureaus.length >= 1 && presentBureaus.length < 3;
  });
  
  // Combine both sets using Map-based deduplication
  const allCandidates = [...new Map(
    [...multiBureauTradelines, ...missingBureauTradelines].map((tl) => [JSON.stringify(tl), tl])
  ).values()];
  
  if (!allCandidates.length) {
    return { violations: [], rawCount: 0 };
  }
  
  const crossBureauReport = { ...report, tradelines: allCandidates };
  
  const response = await client.responses.create({
    model: model || DEFAULT_AUDIT_MODEL,
    input: [
      { role: "system", content: CROSS_BUREAU_SYSTEM_PROMPT },
      { role: "developer", content: CROSS_BUREAU_DEVELOPER_PROMPT },
      { role: "user", content: JSON.stringify(crossBureauReport) },
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
    console.warn("Cross-bureau audit returned no output");
    return { violations: [], rawCount: 0 };
  }
  
  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (err) {
    console.warn(`Cross-bureau audit output is not valid JSON: ${err?.message || err}`);
    return { violations: [], rawCount: 0 };
  }
  
  if (!validateViolationList(parsed)) {
    console.warn("Cross-bureau audit failed schema validation");
    return { violations: [], rawCount: 0 };
  }
  
  return {
    violations: Array.isArray(parsed.violations) ? parsed.violations : [],
    rawCount: parsed.violations?.length || 0,
  };
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
    let crossBureauResults;
    
    try {
      // Run per-bureau audits and cross-bureau analysis in parallel
      const [perBureauResults, crossResults] = await Promise.all([
        parallelProcess(
          bureaus,
          (bureau) => auditBureau(bureauReports[bureau], client, model),
          concurrency
        ),
        crossBureauAudit(report, client, model),
      ]);
      bureauResults = perBureauResults;
      crossBureauResults = crossResults;
    } catch (err) {
      // If any audit fails, propagate the error to maintain parity with sequential behavior
      throw new Error(`Parallel audit failed: ${err?.message || err}`);
    }
    
    // Merge violations from all bureaus + cross-bureau analysis
    const perBureauViolations = bureauResults.flatMap((r) => r.violations || []);
    const crossBureauViolations = crossBureauResults.violations || [];
    const allViolations = [...perBureauViolations, ...crossBureauViolations];
    const totalRawCount = bureauResults.reduce((sum, r) => sum + (r.rawCount || 0), 0) + (crossBureauResults.rawCount || 0);
    
    const { validViolations, errors } = filterValidViolations(allViolations, report);
    if (errors.length) {
      console.warn(
        `LLM audit validation filtered ${errors.length} violation(s): ${errors.join("; ")}`
      );
    }
    
    // Deduplicate violations (in case same issue detected by both passes)
    const dedupedViolations = deduplicateViolations(validViolations);
    
    return {
      violations: dedupedViolations.slice(0, 50).map((violation) => ({
        ...violation,
        instanceKey: buildViolationInstanceKey(violation),
      })),
      rawCount: totalRawCount,
    };
  }
  
  // Standard sequential processing for smaller reports
  // Run both standard audit and cross-bureau analysis
  const [mainResponse, crossBureauResults] = await Promise.all([
    client.responses.create({
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
    }),
    crossBureauAudit(report, client, model),
  ]);

  const outputText = extractOutputText(mainResponse);
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

  // Merge standard violations with cross-bureau violations
  const mainViolations = Array.isArray(parsed.violations) ? parsed.violations : [];
  const crossViolations = crossBureauResults.violations || [];
  const allViolations = [...mainViolations, ...crossViolations];
  const totalRawCount = mainViolations.length + (crossBureauResults.rawCount || 0);
  
  const { validViolations, errors } = filterValidViolations(allViolations, report);
  if (errors.length) {
    console.warn(
      `LLM audit validation filtered ${errors.length} violation(s): ${errors.join("; ")}`
    );
  }

  // Deduplicate violations
  const dedupedViolations = deduplicateViolations(validViolations);

  return {
    violations: dedupedViolations.slice(0, 50).map((violation) => ({
      ...violation,
      instanceKey: buildViolationInstanceKey(violation),
    })),
    rawCount: totalRawCount,
  };
}
