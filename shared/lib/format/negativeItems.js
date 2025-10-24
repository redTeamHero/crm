import { validateTradeline } from "../../../packages/metro2-core/src/validators.js";
import { normalizeBureau as coreNormalizeBureau } from "../../../packages/metro2-core/src/index.js";

const ALL_BUREAUS = ["TransUnion", "Experian", "Equifax"];

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
  const result = new Set();

  const addCandidate = (value) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach(addCandidate);
      return;
    }
    const text = String(value).trim();
    if (!text) return;
    const normalized = normalizeBureauName(text) || null;
    if (normalized) {
      result.add(normalized);
    }
  };

  const scanEvidence = (node, depth = 0) => {
    if (!node || depth > 3) return;
    if (Array.isArray(node)) {
      node.forEach((item) => scanEvidence(item, depth));
      return;
    }
    if (typeof node !== "object") {
      addCandidate(node);
      return;
    }
    addCandidate(node.bureau);
    addCandidate(node.bureaus);
    for (const [key, value] of Object.entries(node)) {
      addCandidate(key);
      if (value && typeof value === "object") {
        scanEvidence(value, depth + 1);
      } else {
        addCandidate(value);
      }
    }
  };

  addCandidate(entry.bureaus);
  addCandidate(entry.bureau);
  scanEvidence(entry.evidence);
  addCandidate(fallback);

  return Array.from(result);
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
    const bureaus = normalizeBureaus(entry);
    const bureauKey = bureaus.length
      ? bureaus.join(",")
      : entry.bureau || "";
    const detail = (entry.detail || entry.violation || "").toString();
    const key = `${code}|${bureauKey}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
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

function normalizePersonalField(label = ""){
  return String(label)
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeBureauName(value = ""){
  return coreNormalizeBureau(value) || null;
}

function formatPersonalInfoValue(value){
  if (value == null) return "";
  if (Array.isArray(value)){
    return value.map(v => String(v ?? "").trim()).filter(Boolean).join(", ");
  }
  if (typeof value === "object"){
    if (Object.prototype.hasOwnProperty.call(value, "raw")){
      return String(value.raw ?? "").trim();
    }
    return Object.values(value)
      .map(v => String(v ?? "").trim())
      .filter(Boolean)
      .join(", ");
  }
  return String(value).trim();
}

function buildAddressObject(value){
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)){
    const copy = { ...value };
    if (!copy.raw){
      const parts = [copy.addr1, copy.addr2, copy.city, copy.state, copy.zip].filter(Boolean);
      if (parts.length) copy.raw = parts.join(", ");
    }
    return copy;
  }
  const lines = Array.isArray(value)
    ? value
    : String(value)
        .split(/\n|,/)
        .map(part => part.trim())
        .filter(Boolean);
  const parts = lines.map(part => String(part ?? "").trim()).filter(Boolean);
  if (!parts.length) return {};
  const address = { raw: parts.join(", ") };
  if (parts[0]) address.addr1 = parts[0];
  if (parts[1]) address.addr2 = parts[1];
  const last = parts[parts.length - 1];
  const match = last.match(/([A-Za-z\.\s]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/);
  if (match){
    const city = match[1].replace(/,$/, "").trim();
    if (city) address.city = city;
    address.state = match[2];
    address.zip = match[3];
  } else if (parts.length >= 3 && !address.city){
    const cityCandidate = parts[parts.length - 2];
    if (cityCandidate && !/[0-9]/.test(cityCandidate)){
      address.city = cityCandidate.replace(/,$/, "").trim();
    }
  }
  return address;
}

function normalizePersonalInfoEntry(data = {}){
  const entry = {};
  Object.entries(data || {}).forEach(([key, rawValue]) => {
    if (rawValue == null) return;
    if (key === "address" && typeof rawValue === "object" && !Array.isArray(rawValue)){
      entry.address = { ...rawValue };
      return;
    }
    if (Array.isArray(rawValue)){
      const formatted = rawValue.map(v => String(v ?? "").trim()).filter(Boolean);
      if (!formatted.length) return;
      entry[key] = formatted.join(", ");
      if (!entry.address && key.includes("address")){
        entry.address = buildAddressObject(formatted);
      }
      if (!entry.name && key.includes("name")) entry.name = formatted[0];
      if (!entry.dob && (key === "dob" || key.includes("birth"))) entry.dob = formatted[0];
      return;
    }
    if (typeof rawValue === "object"){
      const formatted = formatPersonalInfoValue(rawValue);
      if (!formatted) return;
      entry[key] = formatted;
      if (!entry.address && key.includes("address")){
        entry.address = buildAddressObject(rawValue);
      }
      if (!entry.name && key.includes("name")) entry.name = formatted;
      if (!entry.dob && (key === "dob" || key.includes("birth"))) entry.dob = formatted;
      return;
    }
    const str = String(rawValue).trim();
    if (!str) return;
    entry[key] = str;
    if (!entry.name && key.includes("name")) entry.name = str;
    if (!entry.dob && (key === "dob" || key.includes("birth"))) entry.dob = str;
    if (!entry.address && key.includes("address")){
      entry.address = buildAddressObject(str);
    }
  });
  if (entry.address && typeof entry.address === "string"){
    entry.address = buildAddressObject(entry.address);
  }
  if (entry.address && entry.address.raw == null){
    entry.address.raw = formatPersonalInfoValue(entry.address);
  }
  return entry;
}

function normalizePersonalInfoExtras(personalInfo){
  if (!personalInfo) return null;
  const draft = {};
  const push = (bureau, field, value) => {
    if (!bureau) return;
    const key = normalizePersonalField(field);
    if (!key) return;
    draft[bureau] = draft[bureau] || {};
    draft[bureau][key] = value;
  };

  if (Array.isArray(personalInfo)){
    personalInfo.forEach(entry => {
      if (!entry || typeof entry !== "object") return;
      Object.entries(entry).forEach(([field, values]) => {
        if (!values || typeof values !== "object") return;
        Object.entries(values).forEach(([bureauKey, value]) => {
          push(normalizeBureauName(bureauKey), field, value);
        });
      });
    });
  } else if (typeof personalInfo === "object"){
    const entries = Object.entries(personalInfo);
    let hasExplicitBureaus = false;
    entries.forEach(([key, value]) => {
      const bureau = normalizeBureauName(key);
      if (bureau){
        hasExplicitBureaus = true;
        if (value && typeof value === "object" && !Array.isArray(value)){
          Object.entries(value).forEach(([field, val]) => push(bureau, field, val));
        } else {
          push(bureau, key, value);
        }
      }
    });
    if (!hasExplicitBureaus){
      entries.forEach(([field, value]) => {
        ALL_BUREAUS.forEach(bureau => push(bureau, field, value));
      });
    }
  } else {
    const formatted = formatPersonalInfoValue(personalInfo);
    if (formatted){
      ALL_BUREAUS.forEach(bureau => push(bureau, "raw", formatted));
    }
  }

  const normalized = {};
  Object.entries(draft).forEach(([bureau, data]) => {
    const entry = normalizePersonalInfoEntry(data);
    if (Object.keys(entry).length){
      normalized[bureau] = entry;
    }
  });
  return Object.keys(normalized).length ? normalized : null;
}

function formatPersonalFieldLabel(key){
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase()) || "Field";
}

function normalizeInquiriesExtras(inquiries){
  if (!Array.isArray(inquiries)) return [];
  return inquiries
    .map(item => ({
      creditor: formatPersonalInfoValue(item?.creditor || item?.creditor_name),
      industry: formatPersonalInfoValue(item?.industry || item?.type_of_business),
      date: formatPersonalInfoValue(item?.date || item?.date_of_inquiry),
      bureau: normalizeBureauName(item?.bureau || item?.credit_bureau) || (item?.bureau || item?.credit_bureau || ""),
    }))
    .filter(inquiry => inquiry.creditor || inquiry.bureau || inquiry.date);
}

function buildInquiryItem(inquiries = [], summary = {}){
  if (!Array.isArray(inquiries) || !inquiries.length) return null;
  const bureaus = Array.from(new Set(inquiries.map(inq => inq.bureau).filter(Boolean)));
  let last12 = typeof summary?.last12mo === "number" ? summary.last12mo : null;
  let last24 = typeof summary?.last24mo === "number" ? summary.last24mo : null;
  if (last12 == null || last24 == null){
    const now = Date.now();
    const MS_12 = 365 * 24 * 60 * 60 * 1000;
    const MS_24 = 2 * MS_12;
    let twelve = 0;
    let twentyFour = 0;
    inquiries.forEach(inq => {
      const d = new Date(inq.date || inq.raw?.date);
      if (Number.isNaN(+d)) return;
      const delta = now - +d;
      if (delta <= MS_12) twelve += 1;
      if (delta <= MS_24) twentyFour += 1;
    });
    if (last12 == null) last12 = twelve;
    if (last24 == null) last24 = twentyFour;
  }
  const severity = last12 >= 6 ? 4 : last12 >= 4 ? 3 : last12 >= 2 ? 2 : 1;
  const headline = {
    id: "INQUIRIES_REVIEW",
    code: "INQUIRIES_REVIEW",
    category: "Inquiries",
    title: `${inquiries.length} inquiry${inquiries.length === 1 ? "" : "ies"} reported`,
    detail: `Last 12mo: ${last12 ?? 0} • Last 24mo: ${last24 ?? inquiries.length}`,
    severity,
    bureaus: bureaus.length ? bureaus : [...ALL_BUREAUS],
  };
  const violations = inquiries.map((inq, index) => {
    const detailParts = [];
    if (inq.industry) detailParts.push(`Type: ${inq.industry}`);
    if (inq.date) detailParts.push(`Date: ${inq.date}`);
    if (inq.bureau) detailParts.push(`Bureau: ${inq.bureau}`);
    return {
      id: `INQUIRY_${index}_${(inq.bureau || "ALL").toUpperCase()}`,
      code: "INQUIRY_ENTRY",
      category: "Inquiries",
      title: inq.creditor || "Unknown Creditor",
      detail: detailParts.join(" • ") || "Recent inquiry",
      severity: Math.max(1, severity - 1),
      bureaus: inq.bureau ? [inq.bureau] : (bureaus.length ? bureaus : [...ALL_BUREAUS]),
    };
  });
  return {
    index: "inquiries",
    type: "inquiries",
    creditor: "Recent Inquiries",
    account_numbers: {},
    bureaus: bureaus.length ? bureaus : [...ALL_BUREAUS],
    severity,
    headline,
    violations: dedupeViolations(violations),
    bureau_details: {},
  };
}

function buildPersonalInfoItem(personalInfo, mismatches){
  if (!personalInfo || typeof personalInfo !== "object") return null;
  const bureaus = Object.keys(personalInfo).filter(b => personalInfo[b] && Object.keys(personalInfo[b]).length);
  if (!bureaus.length) return null;
  const mismatchMap = normalizePersonalInfoExtras(mismatches) || {};
  const mismatchCount = Object.values(mismatchMap).reduce((sum, info) => sum + Object.keys(info || {}).length, 0);
  const severity = mismatchCount >= 2 ? 3 : mismatchCount === 1 ? 2 : 1;
  const headline = {
    id: "PERSONAL_INFO_REVIEW",
    code: "PERSONAL_INFO_REVIEW",
    category: "Personal Information",
    title: "Personal information review",
    detail: mismatchCount
      ? `${mismatchCount} mismatch${mismatchCount === 1 ? "" : "es"} flagged across ${Object.keys(mismatchMap).length || 1} bureau${Object.keys(mismatchMap).length === 1 ? "" : "s"}.`
      : "Verify reported names, dates of birth, and addresses across bureaus.",
    severity,
    bureaus,
  };
  const violations = [];
  bureaus.forEach(bureau => {
    const data = personalInfo[bureau] || {};
    const mismatch = mismatchMap[bureau] || {};
    const mismatchKeys = Object.keys(mismatch || {});
    if (mismatchKeys.length){
      mismatchKeys.forEach(key => {
        const value = mismatch[key];
        const detail = typeof value === "object" && value !== null
          ? formatPersonalInfoValue(value)
          : String(value ?? "").trim();
        if (!detail) return;
        violations.push({
          id: `PERSONAL_INFO_${bureau}_${key}`.toUpperCase(),
          code: `PERSONAL_INFO_${key}`.toUpperCase(),
          category: "Personal Information",
          title: `${bureau}: ${formatPersonalFieldLabel(key)} mismatch`,
          detail,
          severity: Math.max(3, severity),
          bureaus: [bureau],
        });
      });
      return;
    }
    const previewFields = [
      ["name", "Name"],
      ["dob", "Date of Birth"],
      ["date_of_birth", "Date of Birth"],
      ["address", "Address"],
    ];
    previewFields.forEach(([key, label]) => {
      const value = data[key];
      if (!value) return;
      const detail = typeof value === "object" && value !== null
        ? value.raw || formatPersonalInfoValue(value)
        : String(value ?? "").trim();
      if (!detail) return;
      violations.push({
        id: `PERSONAL_INFO_${bureau}_${key}`.toUpperCase(),
        code: `PERSONAL_INFO_${key}`.toUpperCase(),
        category: "Personal Information",
        title: `${bureau}: ${label}`,
        detail,
        severity: 1,
        bureaus: [bureau],
      });
    });
  });
  if (!violations.length){
    violations.push({
      id: "PERSONAL_INFO_OVERVIEW",
      code: "PERSONAL_INFO_OVERVIEW",
      category: "Personal Information",
      title: "Review reported personal information",
      detail: "Confirm each bureau's name, date of birth, and address entries.",
      severity,
      bureaus,
    });
  }
  return {
    index: "personal_information",
    type: "personal_info",
    creditor: "Personal Information",
    account_numbers: {},
    bureaus,
    severity,
    headline,
    violations: dedupeViolations(violations),
    bureau_details: {},
  };
}

export function prepareNegativeItems(tradelines = [], extras = {}){
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

  const personalInfo = normalizePersonalInfoExtras(
    extras?.personalInfo || extras?.personal_information || extras?.personal_info
  );
  const personalInfoMismatches = normalizePersonalInfoExtras(extras?.personalInfoMismatches || extras?.personal_info_mismatches) || {};
  const inquiries = normalizeInquiriesExtras(extras?.inquiries);
  const inquirySummary = extras?.inquirySummary || extras?.inquiry_summary || {};

  const personalInfoItem = buildPersonalInfoItem(personalInfo, personalInfoMismatches);
  if (personalInfoItem) items.push(personalInfoItem);
  const inquiryItem = buildInquiryItem(inquiries, inquirySummary);
  if (inquiryItem) items.push(inquiryItem);

  return { tradelines, items };
}
