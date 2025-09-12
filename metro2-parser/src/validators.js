export function validateTradeline(t){
  const violations = [];
  if(t.account_status === "Current" && t.past_due > 0){
    violations.push({ code:"CURRENT_BUT_PASTDUE", detail:"Past due on current account" });
  }
  if(t.account_status === "Charge-off" && !t.date_first_delinquency){
    violations.push({ code:"MISSING_DOFD", detail:"Charge-off missing DOFD" });
  }
  return violations;
}
