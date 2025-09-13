// letterEngine.js

import { PLAYBOOKS } from './playbook.js';
import { enrichTradeline } from './pullTradelineData.js';
import { loadMetro2Violations } from './utils.js';

// Load Metro 2 violation definitions from shared metadata
const VIOLATION_DEFS = await loadMetro2Violations();

function getViolationInfo(code) {
  return VIOLATION_DEFS[code] || null;
}

function getSeverity(v) {
  const meta = getViolationInfo(v.code);
  return meta?.severity ?? v.severity ?? 1;
}

function filterViolationsBySeverity(violations = [], minSeverity = 1, locale = 'en') {
  return violations
    .filter((v) => getSeverity(v) >= minSeverity)
    .sort((a, b) => getSeverity(b) - getSeverity(a))
    .map((v) => {
      const meta = getViolationInfo(v.code) || {};
      return {
        ...v,
        ...meta,
        detail: meta.snippets?.[locale] || v.detail,
        severity: getSeverity(v),
      };
    });
}

const BUREAU_ADDR = {
  TransUnion: {
    name: "TransUnion Consumer Solutions",
    addr1: "P.O. Box 2000",
    addr2: "Chester, PA 19016-2000",
  },
  Experian: {
    name: "Experian",
    addr1: "P.O. Box 4500",
    addr2: "Allen, TX 75013",
  },
  Equifax: {
    name: "Equifax Information Services LLC",
    addr1: "P.O. Box 740256",
    addr2: "Atlanta, GA 30374-0256",
  },
};

const ALL_BUREAUS = ["TransUnion", "Experian", "Equifax"];

// Helpers
function todayISO() {
  return new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function futureISO(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function safe(val, fallback = "") {
  return val == null ? fallback : String(val);
}

function fieldVal(pb, key) {
  return safe(pb?.[`${key}_raw`] ?? pb?.[key], "");
}

// PATCH 1: hasAnyData tolerant of arrays (e.g., comments)
function hasAnyData(pb) {
  if (!pb) return false;
  const keys = [
    "account_number",
    "account_type",
    "account_status",
    "payment_status",
    "monthly_payment",
    "balance",
    "credit_limit",
    "high_credit",
    "past_due",
    "date_opened",
    "date_last_active",
    "date_last_payment",
    "date_closed",
    "last_reported",
    "comments",
  ];
  return keys.some((k) => {
    const v = pb?.[`${k}_raw`] ?? pb?.[k];
    if (Array.isArray(v)) return v.join("").trim() !== "";
    if (v == null) return false;
    return String(v).trim() !== "";
  });
}

// PATCH 2: isNegative robust to array comments
function isNegative(pb) {
  if (!pb) return false;
  const NEG_WORDS = [
    "collection",
    "charge-off",
    "charge off",
    "late",
    "delinquent",
    "derog",
  ];
  const fields = ["payment_status", "account_status", "comments"];
  return fields.some((k) => {
    const raw = pb?.[`${k}_raw`] ?? pb?.[k];
    const v = Array.isArray(raw) ? raw.join(" ") : String(raw || "");
    const t = v.toLowerCase();
    return NEG_WORDS.some((w) => t.includes(w));
  });
}

function colorize(text) {
  return text || "";
}

// Conflict detection (trimmed)
const EVIDENCE_KEY_TO_FIELD = {
  balance_by_bureau: "balance",
  past_due_by_bureau: "past_due",
  credit_limit_by_bureau: "credit_limit",
  high_credit_by_bureau: "high_credit",
  monthly_payment_by_bureau: "monthly_payment",
  payment_status_by_bureau: "payment_status",
  account_status_by_bureau: "account_status",
  date_opened_by_bureau: "date_opened",
  last_reported_by_bureau: "last_reported",
  date_last_payment_by_bureau: "date_last_payment",
};

function buildConflictMap(violations = []) {
  const conflictMap = {};
  const errorMap = {};
  const ensureBureauSet = (b) => (errorMap[b] ??= new Set());

  for (const v of violations) {
    const ev = v.evidence || {};
    for (const [evKey, field] of Object.entries(EVIDENCE_KEY_TO_FIELD)) {
      if (!ev[evKey]) continue;
      const map = ev[evKey];
      const entries = Object.entries(map).filter(([, value]) =>
        value !== null && value !== "" && value !== undefined
      );
      if (entries.length <= 1) continue;

      const count = {};
      for (const [, value] of entries) {
        const key = JSON.stringify(value);
        count[key] = (count[key] || 0) + 1;
      }
      const [majorityKey, majorityCount] =
        Object.entries(count).sort((a, b) => b[1] - a[1])[0] || [];
      conflictMap[field] ??= {};
      if (majorityKey && majorityCount > 1) {
        for (const [bureau, value] of entries) {
          const key = JSON.stringify(value);
          conflictMap[field][bureau] = key !== majorityKey ? "conflict" : "ok";
        }
      } else {
        for (const [bureau] of entries) {
          conflictMap[field][bureau] = "conflict";
        }
      }
    }
  }

  for (const v of violations) {
    const t = (v.title || "").toLowerCase();
    const ev = v.evidence || {};
    const b = ev.bureau;
    if (!b) continue;

    if (t.includes("past-due reported with 'current'") || t.includes("late status but no past-due")) {
      ensureBureauSet(b).add("past_due"); ensureBureauSet(b).add("payment_status");
    }
    if (t.includes("open account with zero credit limit") || t.includes("last reported precedes date opened")) {
      ensureBureauSet(b).add("credit_limit"); ensureBureauSet(b).add("high_credit"); ensureBureauSet(b).add("dates");
    }
  }

  return { conflictMap, errorMap };
}

// Comparison & detail builders
function cellStyle({ conflict, error }) {
  if (error) return "background:#fef2f2; border:1px solid #ef4444;";
  if (conflict) return "background:#fff7ed; border:1px solid #f59e0b;";
  return "border:1px solid #e5e7eb;";
}

function renderRow(label, available, tl, conflictMap, errorMap, renderersByField) {
  const tds = available
    .map((b) => {
      const pb = (tl.per_bureau[b] ||= {});
      let conflict = false, error = false;
      for (const f of renderersByField.fields) {
        if (conflictMap[f]?.[b] === "conflict") conflict = true;
        if (errorMap[b]?.has(f)) error = true;
      }
      return `<td style="padding:8px; ${cellStyle({ conflict, error })}; word-break:break-word;">
        ${renderersByField.renderCell(pb, b)}
      </td>`;
    })
    .join("");

  return `
    <tr>
      <td style="padding:8px; border:1px solid #e5e7eb; background:#f9fafb; font-weight:600; white-space:nowrap">
        ${label}
      </td>${tds}
    </tr>`;
}

function buildComparisonTableHTML(tl, comparisonBureaus, conflictMap, errorMap) {
  const available = (comparisonBureaus || ALL_BUREAUS).filter((b) => hasAnyData(tl.per_bureau[b]));
  if (!available.length) return "<p>No bureau data available for comparison.</p>";

  const rows = [
    renderRow("Creditor", available, tl, conflictMap, errorMap, {
      fields: [], renderCell: () => safe(tl.meta.creditor, "Unknown"),
    }),
    renderRow("Account #", available, tl, conflictMap, errorMap, {
      fields: ["account_number"],
      renderCell: (pb) => safe(pb.account_number, "—"),
    }),
    renderRow("Account Type", available, tl, conflictMap, errorMap, {
      fields: ["account_type"],
      renderCell: (pb) => safe(pb.account_type, "—"),
    }),
    renderRow("Account Status", available, tl, conflictMap, errorMap, {
      fields: ["account_status"],
      renderCell: (pb) => safe(pb.account_status, "—"),
    }),
    renderRow("Payment Status", available, tl, conflictMap, errorMap, {
      fields: ["payment_status"],
      renderCell: (pb) => safe(pb.payment_status, "—"),
    }),
    renderRow("Payment", available, tl, conflictMap, errorMap, {
      fields: ["monthly_payment"],
      renderCell: (pb) => fieldVal(pb, "monthly_payment") || "—",
    }),
    renderRow("Credit Limit", available, tl, conflictMap, errorMap, {
      fields: ["credit_limit"],
      renderCell: (pb) => fieldVal(pb, "credit_limit") || "—",
    }),
    renderRow("High Credit", available, tl, conflictMap, errorMap, {
      fields: ["high_credit"],
      renderCell: (pb) => fieldVal(pb, "high_credit") || "—",
    }),
    renderRow("Balance", available, tl, conflictMap, errorMap, {
      fields: ["balance"],
      renderCell: (pb) => fieldVal(pb, "balance") || "—",
    }),
    renderRow("Past Due", available, tl, conflictMap, errorMap, {
      fields: ["past_due"],
      renderCell: (pb) => fieldVal(pb, "past_due") || "—",
    }),
    renderRow("Date Opened", available, tl, conflictMap, errorMap, {
      fields: ["date_opened"],
      renderCell: (pb) => fieldVal(pb, "date_opened") || "—",
    }),
    renderRow("Date Last Active", available, tl, conflictMap, errorMap, {
      fields: ["date_last_active"],
      renderCell: (pb) => fieldVal(pb, "date_last_active") || "—",
    }),
    renderRow("Date Last Payment", available, tl, conflictMap, errorMap, {
      fields: ["date_last_payment"],
      renderCell: (pb) => fieldVal(pb, "date_last_payment") || "—",
    }),
    renderRow("Date Closed", available, tl, conflictMap, errorMap, {
      fields: ["date_closed"],
      renderCell: (pb) => fieldVal(pb, "date_closed") || "—",
    }),
    // PATCH 3: Comments rendered correctly (arrays join with <br>)
    renderRow("Comments", available, tl, conflictMap, errorMap, {
      fields: ["comments"],
      renderCell: (pb) => {
        const v = pb.comments_raw ?? pb.comments;
        if (Array.isArray(v)) return v.length ? v.map(safe).join("<br>") : "—";
        return safe(v, "—");
      },
    }),
  ];

  const header = available
    .map((b) => `<th style="padding:8px; border:1px solid #e5e7eb; background:#f3f4f6; text-align:left;">${b}</th>`)
    .join("");

  const legend = `
    <div style="margin-top:6px; font-size:12px; color:#6b7280">
      <span style="display:inline-block;width:12px;height:12px;background:#fff7ed;border:1px solid #f59e0b;vertical-align:middle;"></span>&nbsp;Mismatch
      &nbsp;&nbsp;
      <span style="display:inline-block;width:12px;height:12px;background:#fef2f2;border:1px solid #ef4444;vertical-align:middle;"></span>&nbsp;Contradiction
    </div>`;

  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">
      <thead><tr><th style="padding:8px;border:1px solid #e5e7eb;background:#f3f4f6;"></th>${header}</tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>${legend}`;
}

// Letter-specific block
function buildTradelineBlockHTML(tl, bureau) {
  const pb = (tl.per_bureau[bureau] ||= {});
  const commentsVal = pb.comments_raw ?? pb.comments;
  const commentsHTML = Array.isArray(commentsVal)
    ? commentsVal.map(safe).join("<br>")
    : safe(commentsVal, "");

  const creds = {
    acct: safe(pb.account_number, "N/A"),
    type: safe(pb.account_type, "N/A"),
    status: safe(pb.account_status, "N/A"),
    payStatus: safe(pb.payment_status, "N/A"),
    payment: fieldVal(pb, "monthly_payment") || "N/A",
    cl: fieldVal(pb, "credit_limit") || "N/A",
    hc: fieldVal(pb, "high_credit") || "N/A",
    bal: fieldVal(pb, "balance") || "N/A",
    pd: fieldVal(pb, "past_due") || "N/A",
    opened: fieldVal(pb, "date_opened") || "N/A",
    lastActive: fieldVal(pb, "date_last_active") || "N/A",
    lastPay: fieldVal(pb, "date_last_payment") || "N/A",
    closed: fieldVal(pb, "date_closed") || "N/A",
    comments: commentsHTML,
  };

  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">
      <tbody>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Creditor</td><td style="padding:6px;border:1px solid #e5e7eb;">${safe(tl.meta.creditor, "Unknown")}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Acct # (${bureau})</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.acct}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Account Type</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.type}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Account Status</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.status}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Payment Status</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.payStatus}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Payment</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.payment}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Credit Limit</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.cl}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">High Credit</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.hc}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Balance</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.bal}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Past Due</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.pd}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Date Opened</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.opened}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Date Last Active</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.lastActive}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Date Last Payment</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.lastPay}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Date Closed</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.closed}</td></tr>
        ${creds.comments ? `<tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Comments</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.comments}</td></tr>` : ""}
      </tbody>
    </table>`;
}

// Evidence / violations
function isByBureauMap(obj) {
  if (!obj || typeof obj !== "object") return false;
  return Object.keys(obj).some(k => ["TransUnion","Experian","Equifax"].includes(k));
}

function renderByBureauTable(title, map) {
  const rows = Object.entries(map)
    .filter(([k]) => ["TransUnion","Experian","Equifax"].includes(k))
    .map(([k, v]) => `<tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;width:160px;">${k}</td><td style="padding:6px;border:1px solid #e5e7eb;word-break:break-word;">${safe(v, "—")}</td></tr>`)
    .join("");
  return `
    <div style="margin:8px 0;">
      <div style="font-weight:600;margin-bottom:4px;">${safe(title.replace(/_/g, " "))}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>${rows}</tbody></table>
    </div>`;
}

function renderGenericEvidence(ev) {
  const keys = Object.keys(ev || {});
  return keys.length
    ? `<div style="font-size:12px;color:#6b7280;margin-top:4px;">Additional supporting details available upon request.</div>`
    : "";
}

function renderEvidenceHTML(evidence) {
  if (!evidence || typeof evidence !== "object") return "";
  return Object.entries(evidence)
    .map(([k, v]) =>
      isByBureauMap(v) ? renderByBureauTable(k, v) : renderGenericEvidence({ [k]: v })
    ).join("");
}

function buildViolationListHTML(violations, selectedIds, { locale = 'en', minSeverity = 1 } = {}) {
  if (!violations?.length) return "<p>No specific violations were selected.</p>";
  const selected = selectedIds.map((idx) => violations[idx]).filter(Boolean);
  const enriched = filterViolationsBySeverity(selected, minSeverity, locale);
  const items = enriched
    .map((v) => {
      const evHTML = renderEvidenceHTML(v.evidence);
      const fcraText = v.fcraSection && v.detail && !v.detail.includes(v.fcraSection)
        ? `Per FCRA §${v.fcraSection}, ${v.detail}`
        : v.detail;
      return `
        <li style="margin-bottom:12px;">
          <strong>${safe(v.violation || v.category || '')}</strong>
          ${v.severity ? ` <span class=\"severity-tag severity-${v.severity}\">S${v.severity}</span>` : ''}
          ${fcraText ? `<div style=\"margin-top:4px;\">${safe(fcraText)}</div>` : ''}
          ${evHTML ? `<div style=\"margin-top:6px;\">${evHTML}</div>` : ''}
        </li>`;
    })
    .join("");
  return `<ol class="ocr" style="margin:0;padding-left:18px;">${items}</ol>`;
}

// Mode-based copy
function modeCopy(modeKey, requestType, hasEvidence = false) {
  if (modeKey === "identity") {
    return {
      heading: "Identity Theft Block Request (FCRA §605B)",
      intro: `I am a victim of identity theft. The item(s) listed below were the result of fraudulent activity and are not mine. Under the FCRA (§605B), you are required to block the reporting of identity theft–related information.`,
      ask: `Please block or remove the item(s) from my credit file and send me an updated report.`,
      afterIssues: `Provide written confirmation of your actions within 30 days as required by law.`,
      evidence: hasEvidence
        ? `Enclosed are supporting documents: FTC Identity Theft Report, police report, government-issued ID, and proof of current address.`
        : ``,
    };
  }

  if (modeKey === "breach") {
    return {
      heading: "Data Breach–Related Reinvestigation Request",
      intro: `I am disputing the accuracy of the following account(s) because my personal identifiers were compromised in a data breach. Information reported from a compromised source cannot be verified as accurate, complete, or attributable to me. Under the FCRA (§607(b) maximum possible accuracy and §605B blocking of identity theft–related data), I request a reinvestigation.`,
      ask: requestType === "delete"
        ? `Please delete or block this account if it cannot be verified as 100% accurate and legitimately mine.`
        : `If you identify any inaccuracy or unverifiable data, correct it and provide me with an updated credit report.`,
      afterIssues: `Please document the method of verification, including the name and contact information of any furnisher relied upon. Provide your written results within 30 days as required by the FCRA.`,
      evidence: hasEvidence
        ? `Enclosed are supporting documents: breach notification letter, FTC Identity Theft Report, government-issued ID, and proof of current address.`
        : ``,
    };
  }

  if (modeKey === "assault") {
    return {
      heading: "Safety & Confidentiality Handling – Special Circumstances",
      intro: `Due to documented safety concerns, I am requesting special handling of the information below to ensure my privacy and security.`,
      ask: requestType === "delete"
        ? `If the information cannot be verified with certainty, please remove it immediately.`
        : `If the information is inaccurate or incomplete, please correct it without disclosing sensitive personal details.`,
      afterIssues: `Please avoid disclosing unnecessary personal contact details in any correspondence.`,
      evidence: hasEvidence
        ? `Enclosed are supporting documents: restraining order, law enforcement letter, or other evidence of safety concerns.`
        : ``,
    };
  }

  // Default fallback
  return {
    heading: requestType === "delete"
      ? "Request for Deletion of Inaccurate/Unverifiable Information"
      : "Request for Correction of Inaccurate/Incomplete Information",
    intro: `I am disputing the reporting of the tradeline below because it is inaccurate, incomplete, or unverifiable.`,
    ask: requestType === "delete"
      ? "Please delete the inaccurate/unverifiable information pursuant to the FCRA."
      : "Please correct the inaccurate/incomplete reporting pursuant to the FCRA.",
    afterIssues: `Provide your investigation results in writing within 30 days as required by law.`,
    evidence: hasEvidence
      ? `Enclosed are supporting documents: government-issued ID and proof of address.`
      : ``,
  };
}

// Build letter HTML and filename
function buildLetterHTML({
  consumer,
  bureau,
  tl,
  selectedViolationIdxs,
  requestType,
  comparisonBureaus,
  modeKey,
  dateOverride,
}) {
  const dateStr = dateOverride || todayISO();
  const bureauMeta = BUREAU_ADDR[bureau];
  const { conflictMap, errorMap } = buildConflictMap(tl.violations || []);
  const compTable = buildComparisonTableHTML(
    tl,
    comparisonBureaus,
    conflictMap,
    errorMap
  );
  const tlBlock = buildTradelineBlockHTML(tl, bureau);
  const chosenList = buildViolationListHTML(tl.violations, selectedViolationIdxs);
  const mc = modeCopy(modeKey, requestType);

  const intro = colorize(mc.intro);
  const ask = colorize(mc.ask);
  const afterIssuesPara = mc.afterIssues ? `<p class="ocr">${colorize(mc.afterIssues)}</p>` : "";
  const evidencePara = mc.evidence ? `<p class="ocr">${colorize(mc.evidence)}</p>` : "";
  const breachSection =
    modeKey === "breach" && consumer.breaches && consumer.breaches.length
      ? `<h2>Data Breaches</h2><p>The following breaches exposed my information:</p><ul>${consumer.breaches
          .map((b) => `<li>${safe(b)}</li>`)
          .join("")}</ul>`
      : "";
  const verifyLine = colorize(
    "Please provide the method of verification, including the name and contact information of any furnisher relied upon. If you cannot verify the information with maximum possible accuracy, delete the item and send me an updated report."
  );
  const signOff = `${colorize("Sincerely,")}<br>${colorize(safe(consumer.name))}`;

  const letterBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${bureau} – ${mc.heading}</title>
  <style>
    @media print { @page { margin: 1in; } }
    body { font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial; color:#000000; }
    * { word-break:break-word; }
    .card{ border:1px solid #e5e7eb; border-radius:12px; padding:18px; }
    .muted{ color:#6b7280; }
    h1{ font-size:20px; margin-bottom:8px; }
    h2{ font-size:16px; margin-top:22px; margin-bottom:8px; }
    table { table-layout: fixed; width:100%; border-collapse:collapse; }
    td, th { word-break:break-word; padding:8px; border:1px solid #e5e7eb; }
  </style>
</head>
<body>
  ${buildLetterHeader(consumer, bureauMeta)}
  <div class="muted" style="margin-bottom:12px;">${dateStr}</div>

  <h1>${colorize(mc.heading)}</h1>
  <p class="ocr">${intro}</p>
  <p class="ocr">${ask}</p>

  ${breachSection}
  <h2>Comparison (All Available Bureaus)</h2>
  ${compTable}

  <h2>Bureau-Specific Details (${bureau})</h2>
  ${tlBlock}

  <h2>Specific Issues (Selected)</h2>
  ${chosenList}

  ${evidencePara}
  ${afterIssuesPara}

  <p>${verifyLine}</p>
  <p>${signOff}</p>
</body>
</html>`.trim();

  const fnSafeCred = safe(tl.meta.creditor, "Unknown")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");

  const modeSuffix = modeKey ? `_${modeKey}` : "";
  const filename = `${bureau}_${fnSafeCred}${modeSuffix}_dispute_${new Date().toISOString().slice(0, 10)}.html`;

  return { filename, html: letterBody };
}

function namePrefix(consumer) {
  return (consumer.name || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function buildLetterHeader(consumer, recipient){
  return `
  <div style="display:flex; gap:24px; margin-bottom:16px;">
    <div class="card" style="flex:1;">
      <strong>${safe(consumer.name)}</strong><br>
      ${safe(consumer.addr1)}${consumer.addr2 ? "<br>"+safe(consumer.addr2) : ""}<br>
      ${consumer.city}, ${consumer.state} ${consumer.zip}<br>
      ${consumer.phone ? "Phone: "+safe(consumer.phone)+"<br>" : ""}
      ${consumer.email ? "Email: "+safe(consumer.email)+"<br>" : ""}
      ${consumer.ssn_last4 ? "SSN (last 4): "+safe(consumer.ssn_last4)+"<br>" : ""}
      ${consumer.dob ? "DOB: "+safe(consumer.dob) : ""}
    </div>
    <div class="card" style="flex:1;">
      <strong>${safe(recipient.name)}</strong><br>
      ${recipient.addr1 ? safe(recipient.addr1)+"<br>" : ""}${recipient.addr2 ? safe(recipient.addr2) : ""}
      ${recipient.phone ? `${(recipient.addr1||recipient.addr2)?"<br>" : ""}Phone: ${safe(recipient.phone)}` : ""}
    </div>
  </div>`;
}

function buildPersonalInfoLetterHTML({ consumer, bureau, mismatchedFields = [] }) {
  const dateStr = todayISO();
  const bureauMeta = BUREAU_ADDR[bureau];
  const mismatchSet = new Set(mismatchedFields);
  const row = (label, value) =>
    value
      ? `<tr><td class="bg-gray-50 border px-2 py-1">${label}</td><td class="border px-2 py-1">${safe(value)}</td></tr>`
      : "";
  const maybeRow = (keys, label, value) =>
    keys.some((k) => mismatchSet.has(k)) ? row(label, value) : "";
  const infoTable = `
    <table class="w-full text-sm border-collapse">
      <tbody>
        ${maybeRow(["name"], "Name", consumer.name)}
        ${maybeRow(
          ["addr1", "addr2", "address"],
          "Address",
          [consumer.addr1, consumer.addr2].filter(Boolean).join("<br>")
        )}
        ${maybeRow(
          ["city", "state", "zip", "city_state_zip"],
          "City / State / ZIP",
          [consumer.city, consumer.state, consumer.zip].filter(Boolean).join(", ")
        )}
        ${maybeRow(["phone"], "Phone", consumer.phone)}
        ${maybeRow(["email"], "Email", consumer.email)}
        ${maybeRow(["ssn_last4", "ssn"], "SSN (last 4)", consumer.ssn_last4)}
        ${maybeRow(["dob"], "DOB", consumer.dob)}
      </tbody>
    </table>
  `;

  const letterBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${bureau} – Personal Information Dispute</title>
  <style>
    @media print { @page { margin: 1in; } }
    body { font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial; color:#000000; }
    * { word-break:break-word; }
    .card{ border:1px solid #e5e7eb; border-radius:12px; padding:18px; }
    .muted{ color:#6b7280; }
    h1{ font-size:20px; margin-bottom:8px; }
    h2{ font-size:16px; margin-top:22px; margin-bottom:8px; }
    table { table-layout: fixed; width:100%; border-collapse:collapse; }
    td, th { word-break:break-word; padding:8px; border:1px solid #e5e7eb; }
  </style>
</head>
<body>
  ${buildLetterHeader(consumer, bureauMeta)}
  <div class="muted" style="margin-bottom:12px;">${dateStr}</div>
  <h1>${colorize("Personal Information Dispute")}</h1>
  <p>${colorize("Please update your records to reflect my correct personal information and remove any other data that does not belong to me.")}</p>
  <h2>My Correct Information</h2>
  ${infoTable}
  <p>${colorize("Sincerely,")}<br>${colorize(safe(consumer.name))}</p>
</body>
</html>
  `.trim();

  const filename = `${namePrefix(consumer)}_${bureau}_personal_info_dispute_${new Date()
    .toISOString()
    .slice(0, 10)}.html`;

  return { filename, html: letterBody };
}

function generatePersonalInfoLetters({ consumer, mismatchedFields = [] }) {
  const letters = [];
  for (const bureau of ALL_BUREAUS) {
    const { filename, html } = buildPersonalInfoLetterHTML({
      consumer,
      bureau,
      mismatchedFields,
    });
    letters.push({ bureau, creditor: "Personal Information", filename, html });
  }
  return letters;
}

function buildInquiryLetterHTML({ consumer, bureau, inquiry }) {
  const dateStr = todayISO();
  const bureauMeta = BUREAU_ADDR[bureau];
  const letterBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${bureau} – Inquiry Dispute</title>
  <style>
    @media print { @page { margin: 1in; } }
    body { font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial; color:#000000; }
    * { word-break:break-word; }
    .card{ border:1px solid #e5e7eb; border-radius:12px; padding:18px; }
    .muted{ color:#6b7280; }
    h1{ font-size:20px; margin-bottom:8px; }
  </style>
</head>
<body>
  ${buildLetterHeader(consumer, bureauMeta)}
  <div class="muted" style="margin-bottom:12px;">${dateStr}</div>
  <h1>${colorize("Unauthorized Inquiry Dispute")}</h1>
  <p>${colorize(`Please remove the inquiry by ${safe(inquiry.creditor)} dated ${safe(inquiry.date)} from my ${bureau} credit file. I did not authorize this inquiry.`)}</p>
  <p>${colorize("Sincerely,")}<br>${colorize(safe(consumer.name))}</p>
</body>
</html>
  `.trim();

  const fnSafeCred = safe(inquiry.creditor || "Unknown")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  const filename = `${namePrefix(consumer)}_${bureau}_${fnSafeCred}_inquiry_dispute_${new Date()
    .toISOString()
    .slice(0, 10)}.html`;

  return { filename, html: letterBody };
}

function generateInquiryLetters({ consumer, inquiries = [] }) {
  const letters = [];
  for (const inq of inquiries) {
    if (!inq.bureau) continue;
    const { filename, html } = buildInquiryLetterHTML({
      consumer,
      bureau: inq.bureau,
      inquiry: inq,
    });
    letters.push({ bureau: inq.bureau, creditor: inq.creditor, filename, html });
  }
  return letters;
}

function buildCollectorLetterHTML({ consumer, collector }) {
  const dateStr = todayISO();
  const letterBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safe(collector.name)} – Collection Notice</title>
  <style>
    @media print { @page { margin: 1in; } }
    body { font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial; color:#000000; }
    * { word-break:break-word; }
    .card{ border:1px solid #e5e7eb; border-radius:12px; padding:18px; }
    .muted{ color:#6b7280; }
    h1{ font-size:20px; margin-bottom:8px; }
  </style>
</head>
<body>
  ${buildLetterHeader(consumer, collector)}
  <div class="muted" style="margin-bottom:12px;">${dateStr}</div>
  <h1>${colorize("Debt Validation Request")}</h1>
  <p>${colorize("Please provide validation of the debt you allege is owed. Until validation is provided, cease all collection activities and communication with me regarding this account.")}</p>
  <p>${colorize("Sincerely,")}<br>${colorize(safe(consumer.name))}</p>
</body>
</html>
  `.trim();

  const fnSafe = safe(collector.name)
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  const filename = `${namePrefix(consumer)}_${fnSafe}_collector_letter_${new Date().toISOString().slice(0,10)}.html`;
  return { filename, html: letterBody };
}

function generateDebtCollectorLetters({ consumer, collectors = [] }) {
  const letters = [];
  for (const col of collectors) {
    const { filename, html } = buildCollectorLetterHTML({ consumer, collector: col });
    letters.push({ collector: col.name, filename, html });
  }
  return letters;
}

function generateLetters({ report, selections, consumer, requestType = "correct" }) {
  const SPECIAL_ONE_BUREAU = new Set(["identity", "breach", "assault"]);
  const letters = [];

  for (const sel of selections || []) {
    const tl = report.tradelines?.[sel.tradelineIndex];
    if (!tl) continue;

    if (sel.creditor) {
      tl.meta = tl.meta || {};
      tl.meta.creditor = sel.creditor;
    }
    if (sel.accountNumbers) {
      tl.meta = tl.meta || {};
      tl.meta.account_numbers = tl.meta.account_numbers || {};
      tl.per_bureau = tl.per_bureau || {};
      for (const [b, acct] of Object.entries(sel.accountNumbers)) {
        if (!acct) continue;
        tl.meta.account_numbers[b] = acct;
        (tl.per_bureau[b] ||= {}).account_number = acct;
      }
    }

    // Auto-flag: negative appears on one bureau only => incomplete/misleading
    const bureausPresent = Object.entries(tl.per_bureau || {})
      .filter(([_, pb]) => hasAnyData(pb))
      .map(([b]) => b);

    if (
      bureausPresent.length === 1 &&
      isNegative(tl.per_bureau[bureausPresent[0]])
    ) {
      tl.violations = tl.violations || [];
      const exists = tl.violations.some(
        (v) => (v.title || "").toLowerCase() === "incomplete file and misleading"
      );
      if (!exists) {
        tl.violations.push({
          title: "Incomplete file and misleading",
          detail: "Negative item reported by only one bureau",
        });
        sel.violationIdxs = [
          ...(sel.violationIdxs || []),
          tl.violations.length - 1,
        ];
      }
    }

    // Ensure each tradeline has complete data before letter creation
    enrichTradeline(tl);

    const isSpecial = SPECIAL_ONE_BUREAU.has(sel.specialMode);
    const comparisonBureaus = isSpecial ? [sel.bureaus[0]] : ALL_BUREAUS;

    const play = sel.playbook && PLAYBOOKS[sel.playbook];
    const steps = play ? play.letters : [null];

    steps.forEach((stepTitle, stepIdx) => {
      const dateOverride = play ? futureISO(stepIdx * 30) : undefined;
      for (const bureau of sel.bureaus || []) {
        if (!ALL_BUREAUS.includes(bureau)) continue;

        let letter = buildLetterHTML({
          consumer,
          bureau,
          tl,
          selectedViolationIdxs: sel.violationIdxs || [],
          requestType,
          comparisonBureaus,
          modeKey: sel.specialMode || null,
          dateOverride,
        });
        let filename = letter.filename;
        if (play) {
          const safeStep = (stepTitle || `step${stepIdx + 1}`)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
          filename = filename.replace("_dispute_", `_${safeStep}_`);
        }
        filename = `${namePrefix(consumer)}_${filename}`;
        letters.push({
          bureau,
          tradelineIndex: sel.tradelineIndex,
          creditor: tl.meta.creditor,
          ...letter,
          filename,
        });
      }
    });
  }

  return letters;
}

export {
  generateLetters,
  generatePersonalInfoLetters,
  generateInquiryLetters,
  generateDebtCollectorLetters,
  modeCopy,
  filterViolationsBySeverity
};

