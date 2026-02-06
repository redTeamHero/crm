export default {
  "Account #":                 { key: "account_number" },
  "Account Number":           { key: "account_number" },
  "Account No.":              { key: "account_number" },
  "Account No":               { key: "account_number" },
  "Acct #":                   { key: "account_number" },
  "Acct No.":                 { key: "account_number" },
  "Acct No":                  { key: "account_number" },
  "Acct Number":              { key: "account_number" },
  "Account Type":             { key: "account_type" },
  "Account Type - Detail":    { key: "account_type_detail" },
  "Account Type Detail":      { key: "account_type_detail" },
  "Account Type Detail/Loan Type": { key: "account_type_detail" },
  "Bureau Code":              { key: "bureau_code" },
  "Account Status":           { key: "account_status" },
  "Payment Status":           { key: "payment_status" },
  "Payment Status/Account Status": { key: "payment_status" },
  "Monthly Payment":          { key: "monthly_payment", normalizer: parseMoney },
  "Date Opened":              { key: "date_opened", normalizer: toMDY },
  "Opened":                   { key: "date_opened", normalizer: toMDY },
  "Balance":                  { key: "balance", normalizer: parseMoney },
  "No. of Months (terms)":    { key: "months_terms", normalizer: parseInteger },
  "No. of Months (Terms)":    { key: "months_terms", normalizer: parseInteger },
  "Number of Months (terms)": { key: "months_terms", normalizer: parseInteger },
  "High Credit":              { key: "high_credit", normalizer: parseMoney },
  "High Balance":             { key: "high_credit", normalizer: parseMoney },
  "Credit Limit":             { key: "credit_limit", normalizer: parseMoney },
  "Limit":                    { key: "credit_limit", normalizer: parseMoney },
  "Past Due":                 { key: "past_due", normalizer: parseMoney },
  "Past Due Amount":          { key: "past_due", normalizer: parseMoney },
  "Last Reported":            { key: "last_reported", normalizer: toMDY },
  "Reported":                 { key: "last_reported", normalizer: toMDY },
  "Date Last Active":         { key: "date_last_active", normalizer: toMDY },
  "Comments":                 { key: "comments" },
  "Comment":                  { key: "comments" },
  "Date of Last Payment":     { key: "date_last_payment", normalizer: toMDY },
  "Date Last Payment":        { key: "date_last_payment", normalizer: toMDY },
  "Last Payment Date":        { key: "date_last_payment", normalizer: toMDY },
  "Two-Year Payment History": { key: "two_year_payment_history" },
  "Two Year Payment History": { key: "two_year_payment_history" },
  "Creditor":                 { key: "creditor_name" },
  "Creditor Name":            { key: "creditor_name" },
  "Company Name":             { key: "creditor_name" },
  "Subscriber Name":          { key: "creditor_name" },
  "Furnisher Name":           { key: "creditor_name" },
};

function isBlank(value){
  const text = String(value ?? '').trim();
  if(!text) return true;
  if(/^[-–—]+$/.test(text)) return true;
  if(/^(n\/?a|none|not reported|not available)$/i.test(text)) return true;
  return false;
}

function parseMoney(v){
  if(isBlank(v)) return null;
  const cleaned = String(v).replace(/[^0-9.-]/g,'');
  if(!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function toMDY(v){
  if(isBlank(v)) return null;
  const d = new Date(v);
  return isNaN(d) ? null : `${d.getMonth()+1}`.padStart(2,'0')+'/'+`${d.getDate()}`.padStart(2,'0')+'/'+d.getFullYear();
}

function parseInteger(v){
  if(isBlank(v)) return null;
  const cleaned = String(v).replace(/[^0-9-]/g,'');
  if(!cleaned) return null;
  const n = parseInt(cleaned,10);
  return Number.isNaN(n) ? null : n;
}
