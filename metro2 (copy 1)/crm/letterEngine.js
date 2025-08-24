// letterEngine.js

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
function safe(val, fallback = "") {
  return val == null ? fallback : String(val);
}
function showMoney(pb, key) {
  return safe(pb?.[`${key}_raw`] ?? pb?.[key], "");
}
function showDate(pb, key) {
  return safe(pb?.[`${key}_raw`] ?? pb?.[key], "");
}
function hasAnyData(pb) {
  if (!pb) return false;
  const keys = [
    "account_number","account_status","payment_status","balance","credit_limit",
    "high_credit","past_due","date_opened","last_reported","date_last_payment","comments",
  ];
  return keys.some((k) => {
    const v = pb[k] ?? pb[`${k}_raw`];
    return v !== undefined && String(v).trim() !== "";
  });
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
      renderCell: (pb) => `${showMoney(pb, "balance") || "—"} / ${showMoney(pb, "past_due") || "—"}`,
    }),
    renderRow("Credit Limit / High Credit", available, tl, conflictMap, errorMap, {
      fields: ["credit_limit", "high_credit"],
      renderCell: (pb) => `${showMoney(pb, "credit_limit") || "—"} / ${showMoney(pb, "high_credit") || "—"}`,
    }),
    renderRow("Dates", available, tl, conflictMap, errorMap, {
      fields: ["date_opened", "last_reported", "date_last_payment"],
      renderCell: (pb) =>
        `Opened: ${showDate(pb, "date_opened") || "—"} | Last Reported: ${showDate(pb, "last_reported") || "—"} | Last Payment: ${showDate(pb, "date_last_payment") || "—"}`,
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
    bal: showMoney(pb, "balance") || "N/A",
    cl: showMoney(pb, "credit_limit") || "N/A",
    hc: showMoney(pb, "high_credit") || "N/A",
    pd: showMoney(pb, "past_due") || "N/A",
    opened: showDate(pb, "date_opened") || "N/A",
    lastRpt: showDate(pb, "last_reported") || "N/A",
    lastPay: showDate(pb, "date_last_payment") || "N/A",
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
}) {
  const dateStr = todayISO();
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

  const letterBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${bureau} – ${mc.heading}</title>
  <style>
    @media print { @page { margin: 1in; } }
    body { font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial; color:#0b1226; }
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
  <h1>${mc.heading}</h1>
  <p>${mc.intro}</p>
  <p>${mc.ask}</p>
  <h2>Comparison (All Available Bureaus)</h2>
  ${compTable}
  <h2>Bureau‑Specific Details (${bureau})</h2>
  ${tlBlock}
  <h2>Specific Issues (Selected)</h2>
  ${chosenList}
  ${mc.afterIssues ? `<p>${mc.afterIssues}</p>` : ""}
  <p>Please provide the method of verification... if you cannot verify... delete the item and send me an updated report.</p>
  <p>Sincerely,<br>${safe(consumer.name)}</p>
</body>
</html>`.trim();

  const fnSafeCred = safe(tl.meta.creditor, "Unknown")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");

  const modeSuffix = modeKey ? `_${modeKey}` : "";
  const filename = `${bureau}_${fnSafeCred}${modeSuffix}_dispute_${new Date().toISOString().slice(0, 10)}.html`;

  return { filename, html: letterBody };
}

function generateLetters({ report, selections, consumer, requestType = "correct" }) {
  const SPECIAL_ONE_BUREAU = new Set(["identity", "breach", "assault"]);
  const letters = [];

  for (const sel of selections || []) {
    const tl = report.tradelines?.[sel.tradelineIndex];
    if (!tl) continue;

    const isSpecial = SPECIAL_ONE_BUREAU.has(sel.specialMode);
    const comparisonBureaus = isSpecial ? [sel.bureaus[0]] : ALL_BUREAUS;

    for (const bureau of sel.bureaus || []) {
      if (!ALL_BUREAUS.includes(bureau)) continue;

      const letter = buildLetterHTML({
        consumer,
        bureau,
        tl,
        selectedViolationIdxs: sel.violationIdxs || [],
        requestType,
        comparisonBureaus,
        modeKey: sel.specialMode || null,
      });
      letters.push({
        bureau,
        tradelineIndex: sel.tradelineIndex,
        creditor: tl.meta.creditor,
        ...letter,
      });
    }
  }

  return letters;
}

export { generateLetters };
