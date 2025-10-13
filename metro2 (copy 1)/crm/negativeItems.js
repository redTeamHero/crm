import { validateTradeline } from "../../packages/metro2-core/src/validators.js";

function normalizeSeverity(value){
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatCurrency(value){
  const num = Number(value);
  if(!Number.isFinite(num)) return "";
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  const [whole, decimals] = abs.toFixed(2).split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${withCommas}.${decimals}`;
}

function maskAccountNumber(value){
  if(value === undefined || value === null) return "";
  const raw = String(value).trim();
  if(!raw) return "";
  const clean = raw.replace(/[^0-9a-z]/gi, "");
  if(clean.length <= 4) return clean;
  return `•••• ${clean.slice(-4)}`;
}

function normalizeBureaus(entry = {}, fallback = []){
  const bureaus = Array.isArray(entry.bureaus) && entry.bureaus.length
    ? entry.bureaus
    : entry.bureau
      ? [entry.bureau]
      : fallback;
  return Array.from(new Set(bureaus.filter(Boolean)));
}

function normalizeTitle(entry = {}){
  const raw = entry.title || entry.violation || "";
  return typeof raw === "string" ? raw : String(raw ?? "");
}

function dedupeViolations(entries = []){
  const seen = new Set();
  const result = [];
  for (const entry of entries){
    if (!entry || typeof entry !== "object") continue;
    const code = (entry.code || entry.id || entry.violation || "").toString().toUpperCase();
    const bureauKey = Array.isArray(entry.bureaus) && entry.bureaus.length
      ? entry.bureaus.join(",")
      : entry.bureau || "";
    const detail = (entry.detail || entry.violation || "").toString();
    const key = `${code}|${bureauKey}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const bureaus = normalizeBureaus(entry);
    result.push({
      ...entry,
      code,
      id: entry.id || code,
      category: entry.category || entry.group || null,
      bureaus,
      severity: normalizeSeverity(entry.severity ?? entry.weight)
    });
  }
  return result;
}

function summarizeBureaus(perBureau = {}){
  return Object.entries(perBureau)
    .filter(([, data]) => data && typeof data === "object" && Object.keys(data).length)
    .map(([bureau]) => bureau);
}

function collectAccountNumbers(perBureau = {}){
  const numbers = {};
  for (const [bureau, data] of Object.entries(perBureau)){
    const accountNumber = data?.account_number || data?.accountNumber;
    if (!accountNumber) continue;
    numbers[bureau] = maskAccountNumber(accountNumber);
  }
  return numbers;
}

function headlineFromViolations(list = []){
  if (!Array.isArray(list) || !list.length) return null;
  for (const entry of list){
    const title = normalizeTitle(entry).trim();
    if (!title) continue;
    const category = entry.category || entry.group || null;
    const text = [category, title].filter(Boolean).join(" – ");
    return {
      id: entry.id || entry.code || null,
      code: entry.code || null,
      category,
      title,
      detail: entry.detail || "",
      severity: normalizeSeverity(entry.severity),
      bureaus: normalizeBureaus(entry),
      text,
    };
  }
  return null;
}

function mapViolation(entry = {}){
  const title = normalizeTitle(entry);
  return {
    id: entry.id || entry.code || null,
    code: entry.code || null,
    category: entry.category || entry.group || null,
    title,
    detail: entry.detail || "",
    severity: normalizeSeverity(entry.severity),
    bureaus: normalizeBureaus(entry),
  };
}

function pickField(entry = {}, key, { type = "text" } = {}){
  if(!entry || typeof entry !== "object") return "";
  const rawKey = `${key}_raw`;
  const rawValue = entry[rawKey];
  if(typeof rawValue === "string" && rawValue.trim()){
    return rawValue.trim();
  }
  const value = entry[key];
  if(value === undefined || value === null || value === "") return "";
  if(type === "money"){
    const formatted = formatCurrency(value);
    return formatted || String(value);
  }
  if(type === "date"){
    const str = String(value).trim();
    if(!str) return "";
    return str.slice(0, 10);
  }
  return String(value);
}

const BUREAU_FIELDS = [
  { key: "account_number", type: "account" },
  { key: "payment_status" },
  { key: "account_status" },
  { key: "past_due", type: "money" },
  { key: "balance", type: "money" },
  { key: "credit_limit", type: "money" },
  { key: "high_credit", type: "money" },
  { key: "date_opened", type: "date" },
  { key: "last_reported", type: "date" },
  { key: "date_last_payment", type: "date" },
  { key: "date_first_delinquency", type: "date" },
];

function buildBureauDetails(perBureau = {}){
  const details = {};
  for (const [bureau, data] of Object.entries(perBureau)){
    if(!data || typeof data !== "object") continue;
    const entry = {};
    for (const { key, type } of BUREAU_FIELDS){
      if(key === "account_number"){
        const value = data.account_number || data.accountNumber || data.account_number_raw || "";
        const masked = maskAccountNumber(value);
        if(masked) entry[key] = masked;
        continue;
      }
      const fieldType = type === "money" ? "money" : type === "date" ? "date" : "text";
      const display = pickField(data, key, { type: fieldType });
      if(display) entry[key] = display;
    }
    if(Object.keys(entry).length){
      details[bureau] = entry;
    }
  }
  return details;
}

export function prepareNegativeItems(tradelines = []){
  if (!Array.isArray(tradelines)) return { tradelines: [], items: [] };
  const items = [];
  tradelines.forEach((tl, idx) => {
    if (!tl || typeof tl !== "object") return;
    const perBureau = tl.per_bureau || {};
    const computed = [];

    for (const [bureau, data] of Object.entries(perBureau)){
      if (!data || typeof data !== "object") continue;
      const violations = validateTradeline(data) || [];
      violations.forEach(v => {
        computed.push({
          ...v,
          bureau,
          bureaus: Array.isArray(v.bureaus) && v.bureaus.length
            ? v.bureaus
            : v.bureau
              ? [v.bureau]
              : [bureau],
          source: v.source || "metro2-core",
        });
      });
    }

    const existing = Array.isArray(tl.violations) ? tl.violations : [];
    const merged = [...existing, ...computed];
    const deduped = dedupeViolations(merged);
    deduped.sort((a, b) => {
      const severityDelta = (b.severity ?? 0) - (a.severity ?? 0);
      if (severityDelta !== 0) return severityDelta;
      return (a.code || "").localeCompare(b.code || "");
    });

    tl.violations = deduped;
    tl.metrics = {
      ...(tl.metrics || {}),
      violationCount: deduped.length,
      maxSeverity: deduped.reduce((max, v) => Math.max(max, v.severity ?? 0), 0),
    };

    const headline = headlineFromViolations(deduped);

    items.push({
      index: idx,
      creditor: tl.meta?.creditor || "Unknown Creditor",
      account_numbers: collectAccountNumbers(perBureau),
      bureaus: summarizeBureaus(perBureau),
      severity: tl.metrics.maxSeverity,
      headline,
      violations: deduped.map(mapViolation),
      bureau_details: buildBureauDetails(perBureau),
    });
  });

  return { tradelines, items };
}
