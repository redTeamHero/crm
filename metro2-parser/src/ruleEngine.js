import { loadMetro2Violations } from './utils.js';

const definitions = loadMetro2Violations();

function compare(cond, value) {
  if ('eq' in cond) return value === cond.eq;
  if ('ne' in cond) return value !== cond.ne;
  if ('gt' in cond) return Number(value) > cond.gt;
  if ('gte' in cond) return Number(value) >= cond.gte;
  if ('lt' in cond) return Number(value) < cond.lt;
  if ('lte' in cond) return Number(value) <= cond.lte;
  if ('exists' in cond) {
    const exists = value !== undefined && value !== null && value !== '';
    return cond.exists ? exists : !exists;
  }
  return false;
}

function evalRule(rule, tl) {
  if (rule.all) return rule.all.every(r => evalRule(r, tl));
  if (rule.any) return rule.any.some(r => evalRule(r, tl));
  return compare(rule, tl[rule.field]);
}

export function runRules(tl) {
  const out = [];
  for (const [code, def] of Object.entries(definitions)) {
    if (!def.rule) continue;
    if (evalRule(def.rule, tl)) {
      const { id, violation, severity, fcraSection } = def;
      out.push({ id, code, violation, severity, fcraSection });
    }
  }
  return out;
}

export function enrich(code, extra = {}) {
  const key = code.toUpperCase();
  const base = definitions[key] || { violation: 'Unknown violation code' };
  return { code: key, ...base, ...extra };
}

