// letterEngine.js

import { PLAYBOOKS } from './playbook.js';

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
function hasAnyData(pb) {
  if (!pb) return false;
  const keys = [
    "account_number",
    "account_status",
    "payment_status",
    "balance",
    "credit_limit",
    "high_credit",
    "past_due",
    "date_opened",
    "last_reported",
    "date_last_payment",
    "comments",
  ];
  return keys.some((k) => fieldVal(pb, k).trim() !== "");
}

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
    const v = fieldVal(pb, k).toLowerCase();
    return NEG_WORDS.some((w) => v.includes(w));
  });
}

// Light pastel palette to hinder basic OCR while remaining human-readable

// Restricted pastel palette for OCR disruption
const OCR_COLORS = [
  "#ffb347", // pastel orange
 // "#ffa500", // fluorescent orange
//  "#ffff99", // light yellow
  "#add8e6", // light blue
  "#90ee90", // light green
  "#ffd1dc", // pale pink
];

function colorize(text) {
  if (!text) return "";
  const letters = Array.from(text);
  return letters
    .map((ch, idx) => {
      if (/\s/.test(ch)) return ch;
      if (idx === 0) {
        return `<span style="color:#000000">${ch}</span>`;
      }
      if (Math.random() < 0.2) {
        const color = OCR_COLORS[Math.floor(Math.random() * OCR_COLORS.length)];
        return `<span style="color:${color}">${ch}</span>`;
      }
      return ch; // default body color (blue)
    })
    .join("");
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
      const pb = tl.per_bureau[b] ||= {};
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
    renderRow("Account Status / Payment Status", available, tl, conflictMap, errorMap, {
      fields: ["account_status", "payment_status"],
      renderCell: (pb) => `${safe(pb.account_status, "—")} / ${safe(pb.payment_status, "—")}`,
    }),
    renderRow("Balance / Past Due", available, tl, conflictMap, errorMap, {
      fields: ["balance", "past_due"],
      renderCell: (pb) => `${fieldVal(pb, "balance") || "—"} / ${fieldVal(pb, "past_due") || "—"}`,
    }),
    renderRow("Credit Limit / High Credit", available, tl, conflictMap, errorMap, {
      fields: ["credit_limit", "high_credit"],
      renderCell: (pb) => `${fieldVal(pb, "credit_limit") || "—"} / ${fieldVal(pb, "high_credit") || "—"}`,
    }),
    renderRow("Dates", available, tl, conflictMap, errorMap, {
      fields: ["date_opened", "last_reported", "date_last_payment"],
      renderCell: (pb) =>
        `Opened: ${fieldVal(pb, "date_opened") || "—"} | Last Reported: ${fieldVal(pb, "last_reported") || "—"} | Last Payment: ${fieldVal(pb, "date_last_payment") || "—"}`,
    }),
    renderRow("Comments", available, tl, conflictMap, errorMap, {
      fields: ["comments"],
      renderCell: (pb) => safe(pb.comments, "—"),
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
  const pb = tl.per_bureau[bureau] ||= {};
  const creds = {
    acct: safe(pb.account_number, "N/A"),
    status: safe(pb.account_status, "N/A"),
    payStatus: safe(pb.payment_status, "N/A"),
    bal: fieldVal(pb, "balance") || "N/A",
    cl: fieldVal(pb, "credit_limit") || "N/A",
    hc: fieldVal(pb, "high_credit") || "N/A",
    pd: fieldVal(pb, "past_due") || "N/A",
    opened: fieldVal(pb, "date_opened") || "N/A",
    lastRpt: fieldVal(pb, "last_reported") || "N/A",
    lastPay: fieldVal(pb, "date_last_payment") || "N/A",
    comments: safe(pb.comments, ""),
  };

  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">
      <tbody>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Creditor</td><td style="padding:6px;border:1px solid #e5e7eb;">${safe(tl.meta.creditor, "Unknown")}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Acct # (${bureau})</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.acct}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Status/Payment</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.status} / ${creds.payStatus}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Balance / Past Due</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.bal} / ${creds.pd}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Credit Limit / High Credit</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.cl} / ${creds.hc}</td></tr>
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Dates</td><td style="padding:6px;border:1px solid #e5e7eb;">Opened: ${creds.opened} | Last Reported: ${creds.lastRpt} | Last Payment: ${creds.lastPay}</td></tr>
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

function buildViolationListHTML(violations, selectedIds) {
  if (!violations?.length) return "<p>No specific violations were selected.</p>";
  const items = violations
    .filter((_, idx) => selectedIds.includes(idx))
    .map((v) => {
      const evHTML = renderEvidenceHTML(v.evidence);
      return `
        <li style="margin-bottom:12px;">
          <strong>${safe(v.category)} – ${safe(v.title)}</strong>
          ${v.detail ? `<div style="margin-top:4px;">${safe(v.detail)}</div>` : ""}
          ${evHTML ? `<div style="margin-top:6px;">${evHTML}</div>` : ""}
        </li>`;
    }).join("");
  return `<ol style="margin:0;padding-left:18px;">${items}</ol>`;
}

// Mode-based copy
function modeCopy(modeKey, requestType) {
  if (modeKey === "identity") {
    return {
      heading: "Identity Theft Block Request (FCRA §605B)",
      intro: `I am a victim of identity theft...`,
      ask: `Please block or remove the item...`,
      afterIssues: `Enclosures may include...`,
    };
  }
  if (modeKey === "breach") {
    return {
      heading: "Data Breach–Related Reinvestigation Request",
      intro: `My identifiers may have been exposed in a data breach...`,
      ask: requestType === "delete"
        ? `If you cannot verify the accuracy... delete the item.`
        : `If you identify any inaccuracy... provide me an updated report.`,
      afterIssues: `Please document the method of verification...`,
    };
  }
  if (modeKey === "assault") {
    return {
      heading: "Safety & Confidentiality Handling – Special Circumstances",
      intro: `Due to safety concerns...`,
      ask: requestType === "delete"
        ? `If the information cannot be verified… remove it.`
        : `If the information is inaccurate… correct it.`,
      afterIssues: `Please avoid disclosing unnecessary personal contact details.`,
    };
  }
  return {
    heading: requestType === "delete"
      ? "Request for Deletion of Inaccurate/Unverifiable Information"
      : "Request for Correction of Inaccurate/Incomplete Information",
    intro: `I am disputing the reporting of the tradeline below...`,
    ask: requestType === "delete"
      ? "Please delete the inaccurate/unverifiable information pursuant to the FCRA."
      : "Please correct the inaccurate/incomplete reporting pursuant to the FCRA.",
    afterIssues: "",
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
  const afterIssuesPara = mc.afterIssues ? `<p>${colorize(mc.afterIssues)}</p>` : "";
  const verifyLine = colorize(
    "Please provide the method of verification... if you cannot verify... delete the item and send me an updated report."
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
        <strong>${bureauMeta.name}</strong><br>
        ${bureauMeta.addr1}<br>${bureauMeta.addr2}
      </div>
    </div>
    <div class="muted" style="margin-bottom:12px;">${dateStr}</div>
    <h1>${colorize(mc.heading)}</h1>
    <p>${intro}</p>
    <p>${ask}</p>
    <h2>Comparison (All Available Bureaus)</h2>
    ${compTable}
    <h2>Bureau‑Specific Details (${bureau})</h2>
    ${tlBlock}
    <h2>Specific Issues (Selected)</h2>
    ${chosenList}
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

function buildPersonalInfoLetterHTML({ consumer, bureau }) {
  const dateStr = todayISO();
  const bureauMeta = BUREAU_ADDR[bureau];
  const row = (label, value) =>
    value
      ? `<tr><td class="bg-gray-50 border px-2 py-1">${label}</td><td class="border px-2 py-1">${safe(value)}</td></tr>`
      : "";
  const infoTable = `
    <table class="w-full text-sm border-collapse">
      <tbody>
        ${row("Name", consumer.name)}
        ${row(
          "Address",
          [consumer.addr1, consumer.addr2].filter(Boolean).join("<br>")
        )}
        ${row(
          "City / State / ZIP",
          [consumer.city, consumer.state, consumer.zip]
            .filter(Boolean)
            .join(", ")
        )}
        ${row("Phone", consumer.phone)}
        ${row("Email", consumer.email)}
        ${row("SSN (last 4)", consumer.ssn_last4)}
        ${row("DOB", consumer.dob)}
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
      <strong>${bureauMeta.name}</strong><br>
      ${bureauMeta.addr1}<br>${bureauMeta.addr2}
    </div>
  </div>
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

function generatePersonalInfoLetters({ consumer }) {
  const letters = [];
  for (const bureau of ALL_BUREAUS) {
    const { filename, html } = buildPersonalInfoLetterHTML({ consumer, bureau });
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
      <strong>${bureauMeta.name}</strong><br>
      ${bureauMeta.addr1}<br>${bureauMeta.addr2}
    </div>
  </div>
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
      <strong>${safe(collector.name)}</strong><br>
      ${collector.phone ? "Phone: "+safe(collector.phone)+"<br>" : ""}
    </div>
  </div>
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

export { generateLetters, generatePersonalInfoLetters, generateInquiryLetters, generateDebtCollectorLetters };





