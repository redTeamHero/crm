const definitions = {
  CURRENT_BUT_PASTDUE: {
    id: 12,
    violation: 'Past due amount reported on current account',
    severity: 4,
    fcraSection: '§ 623(a)(1)',
    rule: { all: [ { field: 'account_status', eq: 'Current' }, { field: 'past_due', gt: 0 } ] }
  },
  MISSING_DOFD: {
    id: 1,
    violation: 'Missing or invalid Date of First Delinquency',
    severity: 5,
    fcraSection: '§ 623(a)(5)',
    rule: { all: [ { field: 'account_status', eq: 'Charge-off' }, { field: 'date_first_delinquency', exists: false } ] }
  }
};

function compare(cond, value){
  if ('eq' in cond) return value === cond.eq;
  if ('ne' in cond) return value !== cond.ne;
  if ('gt' in cond) return Number(value) > cond.gt;
  if ('gte' in cond) return Number(value) >= cond.gte;
  if ('lt' in cond) return Number(value) < cond.lt;
  if ('lte' in cond) return Number(value) <= cond.lte;
  if ('exists' in cond){
    const exists = value !== undefined && value !== null && value !== '';
    return cond.exists ? exists : !exists;
  }
  return false;
}

function evalRule(rule, tl){
  if (rule.all) return rule.all.every(r => evalRule(r, tl));
  if (rule.any) return rule.any.some(r => evalRule(r, tl));
  return compare(rule, tl[rule.field]);
}

export function validateTradeline(tl){
  const out = [];
  for (const [code, def] of Object.entries(definitions)){
    if (!def.rule) continue;
    if (evalRule(def.rule, tl)){
      const { id, violation, severity, fcraSection } = def;
      out.push({ id, code, violation, severity, fcraSection });
    }
  }
  return out;
}

export function enrich(code, extra = {}){
  const key = code.toUpperCase();
  const base = definitions[key] || { violation: 'Unknown violation code' };
  return { code: key, ...base, ...extra };
}

export function parseMoney(v){
  return Number((v || '').replace(/[^0-9.-]/g,'')) || 0;
}

export function toMDY(v){
  const d = new Date(v);
  return isNaN(d) ? '' : `${d.getMonth()+1}`.padStart(2,'0')+'/'+`${d.getDate()}`.padStart(2,'0')+'/'+d.getFullYear();
}
