import { validateTradeline } from "../../packages/metro2-core/src/validators.js";

function normalizeSeverity(value){
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
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
    numbers[bureau] = accountNumber;
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
    });
  });

  return { tradelines, items };
}
