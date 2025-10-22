import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadKnowledgeGraph } from "../../../shared/knowledgeGraph.js";
import { loadMetro2Violations } from "../../../shared/violations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT_DIR, "data", "report.json");

const MONEY_FIELDS = new Set(["past_due", "balance", "credit_limit", "high_credit"]);
const DATE_FIELDS = new Set([
  "date_opened",
  "date_last_payment",
  "date_first_delinquency",
  "last_reported",
]);

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function parseConceptToken(token) {
  if (!token && token !== 0) {
    return { ontologyId: null, conceptId: null };
  }
  const raw = String(token).trim();
  if (!raw) {
    return { ontologyId: null, conceptId: null };
  }
  const parts = raw.split(".");
  if (parts.length === 1) {
    return { ontologyId: null, conceptId: parts[0] };
  }
  const conceptId = parts.pop();
  const ontologyId = parts.join(".") || null;
  return { ontologyId, conceptId };
}

function toCurrency(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  return `$${value.toFixed(2)}`;
}

function setField(target, field, value, { overwrite = true } = {}) {
  if (!overwrite && Object.prototype.hasOwnProperty.call(target, field)) {
    return;
  }
  if (value === undefined) {
    return;
  }
  if (MONEY_FIELDS.has(field) && typeof value === "number" && Number.isFinite(value)) {
    target[field] = Number(value.toFixed(2));
    target[`${field}_raw`] = toCurrency(value);
    return;
  }
  if (DATE_FIELDS.has(field)) {
    if (value === null || value === "") {
      target[field] = "";
      target[`${field}_raw`] = "";
      return;
    }
    const iso = typeof value === "string"
      ? value
      : new Date(value).toISOString().slice(0, 10);
    target[field] = iso;
    target[`${field}_raw`] = iso;
    return;
  }
  target[field] = value;
}

function ensureDefaultFields(fields, defaults) {
  Object.entries(defaults).forEach(([key, value]) => {
    if (fields[key] === undefined) {
      setField(fields, key, value, { overwrite: true });
    }
  });
}

function pickConceptSample(condition, ontologyMapById, ontologyMapByField) {
  let ontologyId = condition.ontology || null;
  if (!ontologyId && condition.field) {
    const entry = ontologyMapByField.get(condition.field);
    if (entry) {
      ontologyId = entry.id;
    }
  }
  const tokens = [];
  if (Array.isArray(condition.concepts)) tokens.push(...condition.concepts);
  if (condition.concept) tokens.push(condition.concept);
  for (const token of tokens) {
    const { ontologyId: tokenOntology, conceptId } = parseConceptToken(token);
    const resolvedOntologyId = tokenOntology || ontologyId;
    if (!resolvedOntologyId || !conceptId) continue;
    const ontology = ontologyMapById.get(resolvedOntologyId);
    if (!ontology) continue;
    const concept = (ontology.concepts || []).find((c) => c.id === conceptId);
    if (!concept) continue;
    const sample = concept.synonyms?.[0] || concept.id;
    return titleCase(sample);
  }
  if (tokens.length) {
    return titleCase(tokens[0]);
  }
  return "Sample";
}

function applyWhen(fields, whenConditions, ontologyMapById, ontologyMapByField) {
  for (const condition of whenConditions || []) {
    if (!condition || !condition.field) continue;
    const value = pickConceptSample(condition, ontologyMapById, ontologyMapByField);
    if (value) {
      setField(fields, condition.field, value, { overwrite: false });
    }
  }
}

function applyCheck(fields, check) {
  if (!check || !check.field) return;
  const operator = String(check.operator || "").toLowerCase();
  switch (operator) {
    case "numericgreaterthan":
    case "gt": {
      const threshold = Number(check.value ?? 0);
      const base = Math.max(150, Math.abs(threshold) * 0.25 || 0);
      const amount = Number.isFinite(threshold) ? threshold + base : 150;
      setField(fields, check.field, amount, { overwrite: true });
      break;
    }
    case "numericnotzero":
    case "notzero": {
      setField(fields, check.field, 100, { overwrite: true });
      break;
    }
    case "blank":
    case "empty": {
      setField(fields, check.field, "", { overwrite: true });
      break;
    }
    case "required":
    case "exists":
    case "notblank": {
      setField(fields, check.field, fields[check.field] ?? "Provided", { overwrite: true });
      break;
    }
    default: {
      if (fields[check.field] === undefined) {
        setField(fields, check.field, "Sample", { overwrite: true });
      }
    }
  }
}

function applyChecks(fields, checkConditions) {
  for (const check of checkConditions || []) {
    applyCheck(fields, check);
  }
}

function friendlyName(violationCode, meta) {
  const base = meta?.violation || violationCode;
  return `Rule Debug – ${base}`;
}

function buildRuleTradeline(relationship, meta, index, ontologyMapById, ontologyMapByField) {
  const bureau = "TransUnion";
  const accountNumber = `RULE-${String(index + 1).padStart(3, "0")}`;
  const fields = {};

  setField(fields, "account_number", accountNumber, { overwrite: true });
  applyWhen(fields, relationship.when, ontologyMapById, ontologyMapByField);
  applyChecks(fields, relationship.checks);

  const defaults = {
    payment_status: fields.account_status || "Open",
    balance: 1200 + index * 250,
    credit_limit: 5000,
    high_credit: 5200,
    past_due: 0,
    date_opened: "2019-01-01",
    last_reported: "2024-01-15",
    date_last_payment: "2023-12-01",
  };
  ensureDefaultFields(fields, defaults);
  if (fields.payment_status === undefined && fields.account_status) {
    setField(fields, "payment_status", fields.account_status, { overwrite: true });
  }

  const evidence = new Set([...(relationship.evidence || []), ...(meta?.fieldsImpacted || [])]);
  for (const field of evidence) {
    if (!field || fields[field] !== undefined) continue;
    if (MONEY_FIELDS.has(field)) {
      setField(fields, field, 500, { overwrite: true });
    } else if (DATE_FIELDS.has(field)) {
      setField(fields, field, "2023-06-01", { overwrite: true });
    } else {
      setField(fields, field, "Provided", { overwrite: true });
    }
  }

  const balanceValue = Number(fields.balance ?? 0);
  const creditLimit = Number(fields.credit_limit ?? 0);
  const avgUtilization = creditLimit > 0 ? Number(((balanceValue / creditLimit) * 100).toFixed(2)) : null;

  return {
    meta: {
      creditor: friendlyName(relationship.violation, meta),
      rule_code: relationship.violation,
      description: meta?.detail || meta?.violation || relationship.violation,
      tags: ["rule-debug-auto"],
      account_numbers: { [bureau]: accountNumber },
    },
    per_bureau: {
      [bureau]: fields,
    },
    metrics: {
      avg_utilization: avgUtilization,
    },
  };
}

function loadExistingReport() {
  if (!fs.existsSync(DATA_PATH)) {
    return { personal_info: {}, tradelines: [], inquiries: [] };
  }
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { personal_info: {}, tradelines: [], inquiries: [] };
    }
    parsed.tradelines = Array.isArray(parsed.tradelines) ? parsed.tradelines : [];
    return parsed;
  } catch (err) {
    console.warn(`Failed to read existing report: ${err.message}`);
    return { personal_info: {}, tradelines: [], inquiries: [] };
  }
}

function main() {
  const graph = loadKnowledgeGraph();
  const violationsMeta = loadMetro2Violations();
  const ontologyMapById = new Map();
  const ontologyMapByField = new Map();
  for (const ontology of graph.ontologies || []) {
    if (!ontology || !ontology.id) continue;
    ontologyMapById.set(ontology.id, ontology);
    if (ontology.field) {
      ontologyMapByField.set(ontology.field, ontology);
    }
  }

  const relationships = (graph.relationships || []).filter(
    (rel) => rel && String(rel.type || "").toLowerCase() === "violation_link"
  );

  const report = loadExistingReport();
  const preserved = report.tradelines.filter(
    (tl) => !tl?.meta?.tags?.includes("rule-debug-auto")
  );

  const generated = relationships.map((rel, idx) => {
    const meta = violationsMeta?.[rel.violation] || {};
    return buildRuleTradeline(rel, meta, idx, ontologyMapById, ontologyMapByField);
  });

  report.tradelines = [...preserved, ...generated];
  report.generated_at = new Date().toISOString();
  if (!report.personal_info) report.personal_info = {};
  if (!report.inquiries) report.inquiries = [];

  fs.writeFileSync(DATA_PATH, JSON.stringify(report, null, 2));
  console.log(
    `Generated ${generated.length} rule tradelines. Report now has ${report.tradelines.length} tradelines.\nSaved to ${DATA_PATH}.`
  );
}

main();
