import { loadMetro2Violations, loadKnowledgeGraph } from './utils.js';
import { createOntologyMapper } from './ontologyMapper.js';
import { compileViolationConstraints } from './knowledgeGraph.js';

const metadata = loadMetro2Violations();
const knowledgeGraph = loadKnowledgeGraph();
const ontologyMapper = createOntologyMapper(knowledgeGraph.ontologies || []);
const compiledConstraints = compileViolationConstraints(knowledgeGraph, ontologyMapper);

function normalizeTradelineForRules(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const normalized = { ...raw };

  if (normalized.account_status == null && normalized.payment_status != null) {
    normalized.account_status = normalized.payment_status;
  } else if (normalized.payment_status == null && normalized.account_status != null) {
    normalized.payment_status = normalized.account_status;
  }

  if (normalized.past_due != null) {
    normalized.past_due = coerceNumber(normalized.past_due);
  } else if (normalized.past_due_raw != null) {
    normalized.past_due = coerceNumber(normalized.past_due_raw);
  }

  if (normalized.balance != null) {
    normalized.balance = coerceNumber(normalized.balance);
  }

  if (normalized.high_credit != null) {
    normalized.high_credit = coerceNumber(normalized.high_credit);
  }

  if (normalized.credit_limit != null) {
    normalized.credit_limit = coerceNumber(normalized.credit_limit);
  }

  return normalized;
}

function coerceNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    if (!cleaned) {
      return 0;
    }
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

export function enrich(code, extra = {}) {
  const key = code.toUpperCase();
  const base = metadata[key] || { violation: 'Unknown violation code' };
  return { code: key, ...base, ...extra };
}

export function validateTradeline(tradeline = {}) {
  const normalized = normalizeTradelineForRules(tradeline);
  const violations = [];
  for (const constraint of compiledConstraints) {
    if (constraint.evaluate(normalized)) {
      const extra = constraint.buildExtra(normalized);
      violations.push(enrich(constraint.id, extra));
    }
  }
  return violations;
}
