import { loadMetro2Violations } from './utils.js';

const metadata = loadMetro2Violations();

export function enrich(code, extra = {}) {
  const key = code.toUpperCase();
  return { code: key, ...(metadata[key] || {}), ...extra };

}

export function validateTradeline(t){
  const violations = [];
  if(t.account_status === "Current" && t.past_due > 0){
    violations.push(enrich("CURRENT_BUT_PASTDUE"));
  }
  if(t.account_status === "Charge-off" && !t.date_first_delinquency){
    violations.push(enrich("MISSING_DOFD"));
  }
  return violations;
}
