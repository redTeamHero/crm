import { loadMetro2Violations, loadMetro2Rules } from './utils.js';

const metadata = loadMetro2Violations();
const compiledRules = compilePerBureauRules(loadMetro2Rules());

export function enrich(code, extra = {}) {
  const key = code.toUpperCase();
  const base = metadata[key] || { violation: 'Unknown violation code' };
  return { code: key, ...base, ...extra };
}

export function validateTradeline(tradeline = {}) {
  const violations = [];
  for (const rule of compiledRules) {
    if (rule.evaluate(tradeline)) {
      const extra = rule.buildExtra(tradeline);
      violations.push(enrich(rule.id, extra));
    }
  }
  return violations;
}

function compilePerBureauRules(source) {
  const rules = normalizeRuleMap(source);
  const compiled = [];
  for (const [id, config] of rules.entries()) {
    if (!id || !config) continue;
    const scope = normalizeScope(config.scope || config.type || config.target);
    if (scope !== 'per_bureau') continue;
    const predicate = buildPredicate(config.rule || config.when || config.conditions);
    if (!predicate) continue;
    const buildExtra = createExtraBuilder(config);
    compiled.push({ id, evaluate: predicate, buildExtra });
  }
  return compiled;
}

function normalizeScope(scope) {
  if (!scope) return 'per_bureau';
  const normalized = String(scope).toLowerCase();
  if (normalized === 'per-bureau' || normalized === 'tradeline') {
    return 'per_bureau';
  }
  return normalized;
}

function normalizeRuleMap(source) {
  if (!source) {
    return new Map();
  }

  if (source.rules) {
    return normalizeRuleMap(source.rules);
  }

  if (Array.isArray(source)) {
    return new Map(
      source
        .filter(entry => entry && entry.id)
        .map(entry => [entry.id, entry])
    );
  }

  if (source instanceof Map) {
    return source;
  }

  if (typeof source === 'object') {
    return new Map(Object.entries(source));
  }

  return new Map();
}

function buildPredicate(definition) {
  if (!definition) {
    return null;
  }
  if (Array.isArray(definition)) {
    // Treat bare array as implicit "all"
    const predicates = definition.map(buildPredicate).filter(Boolean);
    if (!predicates.length) {
      return null;
    }
    return value => predicates.every(fn => fn(value));
  }

  if (definition.all) {
    const predicates = (definition.all || []).map(buildPredicate).filter(Boolean);
    if (!predicates.length) {
      return null;
    }
    return tradeline => predicates.every(fn => fn(tradeline));
  }

  if (definition.any) {
    const predicates = (definition.any || []).map(buildPredicate).filter(Boolean);
    if (!predicates.length) {
      return null;
    }
    return tradeline => predicates.some(fn => fn(tradeline));
  }

  if (definition.not) {
    const predicate = buildPredicate(definition.not);
    if (!predicate) {
      return null;
    }
    return tradeline => !predicate(tradeline);
  }

  return compileCondition(definition);
}

function compileCondition(condition) {
  const field = condition.field;
  if (!field) {
    return null;
  }
  const getter = valueGetter(field);
  const comparators = [];
  const options = {
    caseInsensitive: condition.caseInsensitive !== false,
    trim: condition.trim !== false,
  };

  if (Object.prototype.hasOwnProperty.call(condition, 'eq')) {
    comparators.push(makeEqualityComparator(condition.eq, options));
  }
  if (Object.prototype.hasOwnProperty.call(condition, 'neq')) {
    const comparator = makeEqualityComparator(condition.neq, options);
    comparators.push(value => !comparator(value));
  }
  const inValues = condition.in || condition.values;
  if (Array.isArray(inValues) && inValues.length) {
    comparators.push(makeInComparator(inValues, options));
  }
  const notInValues = condition.nin || condition.notIn;
  if (Array.isArray(notInValues) && notInValues.length) {
    const comparator = makeInComparator(notInValues, options);
    comparators.push(value => !comparator(value));
  }
  const pattern = condition.regex || condition.match;
  if (pattern) {
    comparators.push(makeRegexComparator(pattern, condition.flags, options));
  }
  if (Object.prototype.hasOwnProperty.call(condition, 'exists')) {
    const shouldExist = Boolean(condition.exists);
    comparators.push(value => (shouldExist ? !isBlank(value) : isBlank(value)));
  }
  if (Object.prototype.hasOwnProperty.call(condition, 'empty')) {
    const shouldBeEmpty = Boolean(condition.empty);
    comparators.push(value => (shouldBeEmpty ? isBlank(value) : !isBlank(value)));
  }
  if (Object.prototype.hasOwnProperty.call(condition, 'gt')) {
    comparators.push(makeNumericComparator('gt', condition.gt));
  }
  if (Object.prototype.hasOwnProperty.call(condition, 'gte')) {
    comparators.push(makeNumericComparator('gte', condition.gte));
  }
  if (Object.prototype.hasOwnProperty.call(condition, 'lt')) {
    comparators.push(makeNumericComparator('lt', condition.lt));
  }
  if (Object.prototype.hasOwnProperty.call(condition, 'lte')) {
    comparators.push(makeNumericComparator('lte', condition.lte));
  }

  if (!comparators.length) {
    return null;
  }

  return tradeline => {
    const value = getter(tradeline);
    return comparators.every(compare => compare(value, tradeline));
  };
}

function valueGetter(pathExpression) {
  const pathParts = String(pathExpression)
    .split('.')
    .map(part => part.trim())
    .filter(Boolean);
  return obj => pathParts.reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function makeEqualityComparator(target, options) {
  const expected = normalizeComparable(target, options);
  return value => {
    const actual = normalizeComparable(value, options);
    if (actual === null || actual === undefined) {
      return false;
    }
    return actual === expected;
  };
}

function makeInComparator(values, options) {
  const normalized = values.map(value => normalizeComparable(value, options));
  return value => {
    const actual = normalizeComparable(value, options);
    if (actual === null || actual === undefined) {
      return false;
    }
    return normalized.includes(actual);
  };
}

function makeRegexComparator(pattern, flags = '', options) {
  const finalFlags = options.caseInsensitive && !flags?.includes('i') ? `${flags}i` : flags || '';
  const regex = new RegExp(pattern, finalFlags);
  return value => {
    if (value === undefined || value === null) {
      return false;
    }
    return regex.test(String(value));
  };
}

function makeNumericComparator(type, threshold) {
  const limit = Number(threshold);
  if (!Number.isFinite(limit)) {
    return () => false;
  }
  return value => {
    const numeric = toNumber(value);
    if (numeric === null) {
      return false;
    }
    switch (type) {
      case 'gt':
        return numeric > limit;
      case 'gte':
        return numeric >= limit;
      case 'lt':
        return numeric < limit;
      case 'lte':
        return numeric <= limit;
      default:
        return false;
    }
  };
}

function createExtraBuilder(config = {}) {
  const base = {};
  if (config.detail || config.message) {
    base.detail = config.detail || config.message;
  }
  if (config.category) {
    base.category = config.category;
  }
  if (config.fieldsImpacted) {
    base.fieldsImpacted = config.fieldsImpacted;
  }
  if (config.scope) {
    base.scope = config.scope;
  }
  const evidenceResolver = buildEvidenceResolver(config);
  return tradeline => {
    const extra = Object.keys(base).length ? { ...base } : {};
    if (evidenceResolver) {
      const evidence = evidenceResolver(tradeline);
      if (evidence && (Array.isArray(evidence) ? evidence.length : Object.keys(evidence).length)) {
        extra.evidence = evidence;
      }
    }
    return extra;
  };
}

function buildEvidenceResolver(config = {}) {
  if (Array.isArray(config.evidenceFields) && config.evidenceFields.length) {
    const fields = [...config.evidenceFields];
    return tradeline => {
      const captured = {};
      for (const field of fields) {
        const value = valueGetter(field)(tradeline);
        if (!isBlank(value)) {
          captured[field] = value;
        }
      }
      return Object.keys(captured).length ? captured : undefined;
    };
  }

  if (config.evidence && typeof config.evidence === 'object') {
    const snapshot = JSON.parse(JSON.stringify(config.evidence));
    return () => snapshot;
  }

  return null;
}

function normalizeComparable(value, { caseInsensitive = true, trim = true } = {}) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    let result = trim ? value.trim() : value;
    if (caseInsensitive) {
      result = result.toLowerCase();
    }
    return result;
  }
  return value;
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
