import OpenAI from "openai";
import Ajv from "ajv";
import { VIOLATION_LIST_SCHEMA } from "./llmSchemas.js";

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
    .replace(/\s+/g, " ")
    .replace(/\|/g, " ")
    .trim()
    .toUpperCase();
}

export function cleanAccountMasked(value = "") {
  return String(value || "")
    .replace(/[^0-9A-Za-z]/g, "")
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
    .replace(/\[(\d+)\]/g, ".$1")
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

function validateEvidencePaths(violations = [], report = {}) {
  const errors = [];
  violations.forEach((violation, idx) => {
    if (!Array.isArray(violation.evidencePaths)) {
      errors.push(`violations[${idx}].evidencePaths must be an array.`);
      return;
    }
    violation.evidencePaths.forEach((path) => {
      if (!pathExists(report, path)) {
        errors.push(`violations[${idx}].evidencePaths missing path: ${path}`);
      }
    });
  });
  return errors;
}

function validateTradelineKeys(violations = [], report = {}) {
  const errors = [];
  const tradelineKeySet = new Set(collectTradelineKeys(report));
  violations.forEach((violation, idx) => {
    if (!violation.tradelineKey) {
      errors.push(`violations[${idx}].tradelineKey required.`);
      return;
    }
    if (tradelineKeySet.has(violation.tradelineKey)) {
      return;
    }
    const normalizedFromKey = normalizeTradelineKeyInput(violation.tradelineKey);
    if (normalizedFromKey && tradelineKeySet.has(normalizedFromKey)) {
      violation.tradelineKey = normalizedFromKey;
      return;
    }
    if (violation.bureau && violation.furnisherName !== undefined) {
      const normalizedFromFields = buildTradelineKey({
        bureau: violation.bureau,
        furnisherName: violation.furnisherName,
        accountNumberMasked: violation.accountNumberMasked,
      });
      if (tradelineKeySet.has(normalizedFromFields)) {
        violation.tradelineKey = normalizedFromFields;
        return;
      }
    }
    errors.push(`violations[${idx}].tradelineKey not found in CanonicalReport.`);
  });
  return errors;
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

export async function auditCanonicalReport(report, { model } = {}) {
  if (!report || typeof report !== "object") {
    throw new Error("CanonicalReport is required for audit.");
  }
  const client = getOpenAiClient();
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
  const evidenceErrors = validateEvidencePaths(violations, report);
  const tradelineErrors = validateTradelineKeys(violations, report);
  if (evidenceErrors.length || tradelineErrors.length) {
    throw new Error(
      `LLM audit validation failed: ${[...evidenceErrors, ...tradelineErrors].join("; ")}`
    );
  }

  return {
    violations: violations.slice(0, 50).map((violation) => ({
      ...violation,
      instanceKey: buildViolationInstanceKey(violation),
    })),
    rawCount: violations.length,
  };
}
