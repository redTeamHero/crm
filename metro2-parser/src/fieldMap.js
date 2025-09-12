export default {
  "Account #":          { key: "account_number" },
  "Account Type":       { key: "account_type" },
  "Payment Status":     { key: "account_status" },
  "Balance":            { key: "balance", normalizer: parseMoney },
  "Past Due":           { key: "past_due", normalizer: parseMoney },
  "Date Opened":        { key: "date_opened", normalizer: toMDY },
  "Last Reported":      { key: "last_reported", normalizer: toMDY },
  "Date of First Delinquency": { key: "date_first_delinquency", normalizer: toMDY },
};

function parseMoney(v){ return Number(v.replace(/[^0-9.-]/g,'')) || 0; }
function toMDY(v){ const d=new Date(v); return isNaN(d)?'':`${d.getMonth()+1}`.padStart(2,'0')+'/'+`${d.getDate()}`.padStart(2,'0')+'/'+d.getFullYear(); }
