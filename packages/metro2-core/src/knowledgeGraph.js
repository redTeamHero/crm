import { parseConceptToken } from './ontologyMapper.js';

export function compileViolationConstraints(graph = {}, mapper) {
  const violations = new Map();
  for (const node of graph.nodes || []) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const type = String(node.type || '').toLowerCase();
    if (type === 'violation' && node.code) {
      violations.set(node.code, node);
    }
  }

  const compiled = [];
  for (const relationship of graph.relationships || []) {
    if (!relationship || typeof relationship !== 'object') {
      continue;
    }
    const type = String(relationship.type || '').toLowerCase();
    if (type !== 'violation_link') {
      continue;
    }
    const violation = violations.get(relationship.violation);
    if (!violation) {
      continue;
    }

    const whenPredicates = (relationship.when || [])
      .map(condition => buildConceptPredicate(condition, mapper))
      .filter(Boolean);

    const checkPredicates = (relationship.checks || [])
      .map(buildCheckPredicate)
      .filter(Boolean);

    if (!checkPredicates.length) {
      continue;
    }

    const evaluate = tradeline => {
      if (whenPredicates.length && !whenPredicates.every(fn => fn(tradeline))) {
        return false;
      }
      return checkPredicates.every(fn => fn(tradeline));
    };

    const buildExtra = createExtraBuilder(violation, relationship);
    compiled.push({ id: violation.code, evaluate, buildExtra });
  }

  return compiled;
}

function buildConceptPredicate(condition = {}, mapper) {
  if (!condition.field) {
    return null;
  }
  const getter = valueGetter(condition.field);
  const allowedConcepts = new Set();
  let ontologyId = condition.ontology || null;

  const tokens = [];
  if (condition.concepts) {
    tokens.push(...condition.concepts);
  } else if (condition.concept) {
    tokens.push(condition.concept);
  }

  for (const token of tokens) {
    const { ontologyId: tokenOntology, conceptId } = parseConceptToken(token);
    if (conceptId) {
      allowedConcepts.add(conceptId);
    }
    if (!ontologyId && tokenOntology) {
      ontologyId = tokenOntology;
    }
  }

  if (!allowedConcepts.size) {
    return null;
  }

  if (!ontologyId && mapper) {
    ontologyId = mapper.guessOntologyId?.(condition.field) || null;
  }

  if (!mapper || !mapper.resolveConcept) {
    return null;
  }

  return tradeline => {
    const raw = getter(tradeline);
    const concept = mapper.resolveConcept(ontologyId, raw, condition.field);
    if (!concept) {
      return false;
    }
    return allowedConcepts.has(concept);
  };
}

function buildCheckPredicate(check = {}) {
  if (!check.field) {
    return null;
  }
  const getter = valueGetter(check.field);
  const operator = String(check.operator || '').toLowerCase();

  switch (operator) {
    case 'numericgreaterthan':
    case 'gt': {
      const threshold = Number(check.value ?? 0);
      return tradeline => {
        const numeric = toNumber(getter(tradeline));
        return numeric !== null && numeric > threshold;
      };
    }
    case 'notzero':
    case 'numericnotzero': {
      return tradeline => {
        const numeric = toNumber(getter(tradeline));
        return numeric !== null && Math.abs(numeric) > 0;
      };
    }
    case 'blank':
    case 'empty': {
      return tradeline => isBlank(getter(tradeline));
    }
    case 'required':
    case 'notblank':
    case 'exists': {
      return tradeline => !isBlank(getter(tradeline));
    }
    default:
      return null;
  }
}

function createExtraBuilder(violation = {}, relationship = {}) {
  const base = {};
  if (violation.detail) {
    base.detail = violation.detail;
  }
  if (violation.category) {
    base.category = violation.category;
  }
  if (violation.fieldsImpacted) {
    base.fieldsImpacted = violation.fieldsImpacted;
  }
  if (violation.scope) {
    base.scope = violation.scope;
  }

  const evidenceFields = relationship.evidence || violation.evidenceFields || [];
  const getters = evidenceFields.map(field => ({ field, getter: valueGetter(field) }));

  return tradeline => {
    const extra = Object.keys(base).length ? { ...base } : {};
    if (getters.length) {
      const evidence = {};
      for (const { field, getter } of getters) {
        const value = getter(tradeline);
        if (!isBlank(value)) {
          evidence[field] = value;
        }
      }
      if (Object.keys(evidence).length) {
        extra.evidence = evidence;
      }
    }
    return extra;
  };
}

function valueGetter(pathExpression) {
  const pathParts = String(pathExpression)
    .split('.')
    .map(part => part.trim())
    .filter(Boolean);
  return obj => pathParts.reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function isBlank(value) {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return true;
    }
    const normalized = trimmed.toLowerCase();
    return normalized === 'n/a' || normalized === 'na' || normalized === 'not reported' || trimmed === '--';
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

function toNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') {
      return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
