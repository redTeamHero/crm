// letterEngine.js

// ---------- bureau addresses ----------
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

// ---------- utils ----------
function todayISO() {
  return new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
function safe(val, fallback = "") {
  return val === null || val === undefined ? fallback : String(val);
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

// ---------- conflict parsing ----------
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

  // Cross-bureau mismatches
  for (const v of violations) {
    const ev = v.evidence || {};
    for (const [evKey, field] of Object.entries(EVIDENCE_KEY_TO_FIELD)) {
      if (!ev[evKey]) continue;
      const map = ev[evKey];
      const entries = Object.entries(map).filter(
        ([, value]) => value !== null && value !== "" && value !== undefined
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

  // Within-bureau contradictions (short list; extend as needed)
  for (const v of violations) {
    const t = (v.title || "").toLowerCase();
    const ev = v.evidence || {};
    const b = ev.bureau;
    if (!b) continue;

    if (t.includes("past-due reported with 'current'") || t.includes("past-due reported with 'current")) {
      ensureBureauSet(b).add("past_due"); ensureBureauSet(b).add("payment_status");
    }
    if (t.includes("late status but no past-due")) {
      ensureBureauSet(b).add("payment_status"); ensureBureauSet(b).add("past_due");
    }
    if (t.includes("open account with zero credit limit") || t.includes("open revolving with high credit set but no credit limit")) {
      ensureBureauSet(b).add("credit_limit"); ensureBureauSet(b).add("high_credit");
    }
    if (t.includes("last reported precedes date opened") || t.includes("date of last payment precedes date opened")) {
      ensureBureauSet(b).add("dates");
    }
  }

  return { conflictMap, errorMap };
}

// ---------- comparison & blocks ----------
function cellStyle({ conflict, error }) {
  if (error) return "background:#fef2f2; border:1px solid #ef4444;";
  if (conflict) return "background:#fff7ed; border:1px solid #f59e0b;";
  return "border:1px solid #e5e7eb;";
}
function renderRow(label, available, tl, conflictMap, errorMap, renderersByField) {
  const { renderLabel, fields } = renderersByField;
  const tds = available.map((b) => {
    const pb = tl.per_bureau[b] || {};
    let conflict = false;
    let error = false;
    for (const f of fields) {
      if (conflictMap[f]?.[b] === "conflict") conflict = true;
      if (errorMap[b]?.has(f)) error = true;
    }
    const style = cellStyle({ conflict, error });
    const html = renderersByField.renderCell(pb, b);
    return `<td style="padding:8px; ${style}; word-break:break-word;">${html}</td>`;
  }).join("");

  return `
  <tr>
    <td style="padding:8px; border:1px solid #e5e7eb; background:#f9fafb; font-weight:600; white-space:nowrap">
      ${renderLabel}
    </td>
    ${tds}
  </tr>`;
}
function buildComparisonTableHTML(tl, comparisonBureaus, conflictMap, errorMap) {
  const available = (comparisonBureaus || ALL_BUREAUS).filter((b) =>
    hasAnyData(tl.per_bureau[b])
  );
  if (!available.length) return "<p>No bureau data available for comparison.</p>";

  const rows = [
    renderRow("Creditor", available, tl, conflictMap, errorMap, {
      renderLabel: "Creditor", fields: [], renderCell: () => safe(tl.meta.creditor, "Unknown"),
    }),
    renderRow("Account #", available, tl, conflictMap, errorMap, {
      renderLabel: "Account #", fields: ["account_number"], renderCell: (pb) => safe(pb.account_number, "—"),
    }),
    renderRow("Account Status / Payment Status", available, tl, conflictMap, errorMap, {
      renderLabel: "Account Status / Payment Status",
      fields: ["account_status", "payment_status"],
      renderCell: (pb) => `${safe(pb.account_status, "—")} / ${safe(pb.payment_status, "—")}`,
    }),
    renderRow("Balance / Past Due", available, tl, conflictMap, errorMap, {
      renderLabel: "Balance / Past Due",
      fields: ["balance", "past_due"],
      renderCell: (pb) => `${showMoney(pb, "balance") || "—"} / ${showMoney(pb, "past_due") || "—"}`,
    }),
    renderRow("Credit Limit / High Credit", available, tl, conflictMap, errorMap, {
      renderLabel: "Credit Limit / High Credit",
      fields: ["credit_limit", "high_credit"],
      renderCell: (pb) => `${showMoney(pb, "credit_limit") || "—"} / ${showMoney(pb, "high_credit") || "—"}`,
    }),
    renderRow("Dates", available, tl, conflictMap, errorMap, {
      renderLabel: "Dates",
      fields: ["date_opened", "last_reported", "date_last_payment"],
      renderCell: (pb) =>
        `Opened: ${showDate(pb, "date_opened") || "—"} &nbsp; | &nbsp; Last Reported: ${showDate(pb, "last_reported") || "—"} &nbsp; | &nbsp; Last Payment: ${showDate(pb, "date_last_payment") || "—"}`,
    }),
    renderRow("Comments", available, tl, conflictMap, errorMap, {
      renderLabel: "Comments",
      fields: ["comments"],
      renderCell: (pb) => safe(pb.comments, "—"),
    }),
  ];

  const header = available
    .map((b) => `<th style="padding:8px; border:1px solid #e5e7eb; background:#f3f4f6; text-align:left">${b}</th>`)
    .join("");

  const legend = `
    <div style="margin-top:6px; font-size:12px; color:#6b7280">
      <span style="display:inline-block; width:12px; height:12px; background:#fff7ed; border:1px solid #f59e0b; vertical-align:middle"></span>
      &nbsp; Cross-bureau mismatch &nbsp;&nbsp;
      <span style="display:inline-block; width:12px; height:12px; background:#fef2f2; border:1px solid #ef4444; vertical-align:middle"></span>
      &nbsp; Within-bureau contradiction
    </div>`;

  return `
    <table style="width:100%; border-collapse:collapse; font-size:14px; margin-top:8px">
      <thead>
        <tr>
          <th style="padding:8px; border:1px solid #e5e7eb; background:#f3f4f6; text-align:left"></th>
          ${header}
        </tr>
      </thead>
      <tbody>
        ${rows.join("")}
      </tbody>
    </table>
    ${legend}
  `;
}

function buildTradelineBlockHTML(tl, bureau) {
  const pb = tl.per_bureau[bureau] || {};
  const acct = safe(pb.account_number, "N/A");
  const status = safe(pb.account_status, "N/A");
  const payStatus = safe(pb.payment_status, "N/A");
  const bal = showMoney(pb, "balance") || "N/A";
  const cl = showMoney(pb, "credit_limit") || "N/A";
  const hc = showMoney(pb, "high_credit") || "N/A";
  const pd = showMoney(pb, "past_due") || "N/A";
  const opened = showDate(pb, "date_opened") || "N/A";
  const lastRpt = showDate(pb, "last_reported") || "N/A";
  const lastPay = showDate(pb, "date_last_payment") || "N/A";
  const comments = safe(pb.comments, "");

  return `
    <table style="width:100%; border-collapse: collapse; font-size: 14px; margin-top:8px">
      <tbody>
        <tr><td style="width:35%; padding:6px; border:1px solid #e5e7eb; background:#f9fafb">Creditor</td><td style="padding:6px; border:1px solid #e5e7eb">${safe(tl.meta.creditor, "Unknown")}</td></tr>
        <tr><td style="padding:6px; border:1px solid #e5e7eb; background:#f9fafb">Account # (${bureau})</td><td style="padding:6px; border:1px solid #e5e7eb">${acct}</td></tr>
        <tr><td style="padding:6px; border:1px solid #e5e7eb; background:#f9fafb">Account Status / Payment Status</td><td style="padding:6px; border:1px solid #e5e7eb">${status} / ${payStatus}</td></tr>
        <tr><td style="padding:6px; border:1px solid #e5e7eb; background:#f9fafb">Balance / Past Due</td><td style="padding:6px; border:1px solid #e5e7eb">${bal} / ${pd}</td></tr>
        <tr><td style="padding:6px; border:1px solid #e5e7eb; background:#f9fafb">Credit Limit / High Credit</td><td style="padding:6px; border:1px solid #e5e7eb">${cl} / ${hc}</td></tr>
        <tr><td style="padding:6px; border:1px solid #e5e7eb; background:#f9fafb">Dates</td><td style="padding:6px; border:1px solid #e5e7eb">Opened: ${opened} &nbsp; | &nbsp; Last Reported: ${lastRpt} &nbsp; | &nbsp; Last Payment: ${lastPay}</td></tr>
        ${comments ? `<tr><td style="padding:6px; border:1px solid #e5e7eb; background:#f9fafb">Comments</td><td style="padding:6px; border:1px solid #e5e7eb">${comments}</td></tr>` : ""}
      </tbody>
    </table>
  `;
}

// ---------- evidence rendering ----------
function isByBureauMap(obj) {
  if (!obj || typeof obj !== "object") return false;
  const keys = Object.keys(obj);
  return keys.some(k => ["TransUnion","Experian","Equifax"].includes(k));
}
function renderByBureauTable(title, map) {
  const cols = Object.entries(map)
    .filter(([k]) => ["TransUnion","Experian","Equifax"].includes(k))
    .map(([k,v]) => `<tr><td style="padding:6px; border:1px solid #e5e7eb; background:#f9fafb; width:160px">${k}</td><td style="padding:6px; border:1px solid #e5e7eb; word-break:break-word">${safe(v,"—")}</td></tr>`)
    .join("");
  return `
    <div style="margin:8px 0">
      <div style="font-weight:600; margin-bottom:4px">${safe(title.replace(/_/g, " "))}</div>
      <table style="width:100%; border-collapse:collapse; font-size:12px">
        <tbody>${cols}</tbody>
      </table>
    </div>
  `;
}
function renderGenericEvidence(ev) {
  const keys = Object.keys(ev || {});
  if (!keys.length) return "";
  return `<div style="font-size:12px; color:#6b7280; margin-top:4px">Additional supporting details available upon request.</div>`;
}
function renderEvidenceHTML(evidence) {
  if (!evidence || typeof evidence !== "object") return "";
  const parts = [];
  for (const [k, v] of Object.entries(evidence)) {
    if (isByBureauMap(v)) parts.push(renderByBureauTable(k, v));
    else parts.push(renderGenericEvidence({ [k]: v }));
  }
  return parts.join("");
}
function buildViolationListHTML(violations, selectedIds) {
  if (!violations || !violations.length) return "<p>No specific violations were selected.</p>";
  const chosen = violations.filter((_, idx) => selectedIds.includes(idx));
  if (!chosen.length) return "<p>No specific violations were selected.</p>";

  const items = chosen.map((v) => {
    const evHTML = renderEvidenceHTML(v.evidence);
    return `
      <li style="margin-bottom:12px">
        <strong>${safe(v.category)} – ${safe(v.title)}</strong>
        ${v.detail ? `<div style="margin-top:4px">${safe(v.detail)}</div>` : ""}
        ${evHTML ? `<div style="margin-top:6px">${evHTML}</div>` : ""}
      </li>
    `;
  }).join("");
  return `<ol style="margin:0; padding-left:18px">${items}</ol>`;
}

// ---------- mode-specific copy ----------
function modeCopy(mode, requestType){
  if (mode === "identity") {
    return {
      heading: "Identity Theft Block Request (FCRA §605B)",
      intro: `I am a victim of identity theft. I request that you block the reporting of the tradeline described below as it results from identity theft, pursuant to FCRA §605B (15 U.S.C. 1681c-2).`,
      ask: `Please block or remove the item from my file and notify any recipient who received this information in the last reporting period.`,
      afterIssues: `Enclosures may include a copy of a government-issued ID and a police report/identity theft report, as applicable.`,
    };
  }
  if (mode === "breach") {
    return {
      heading: "Data Breach–Related Reinvestigation Request",
      intro: `My identifiers may have been exposed in a data breach. I request a thorough reinvestigation of the tradeline shown below and appropriate safeguards to prevent re-occurrence of any unauthorized reporting.`,
      ask: requestType === "delete"
        ? `If you cannot verify the accuracy with competent evidence, please delete the item entirely from my credit file.`
        : `If you identify any inaccuracy or unverifiable element, please correct it and provide me an updated report.`,
      afterIssues: `Please document the method of verification, including the furnisher, and note any fraud alerts or security freezes appropriately.`,
    };
  }
  if (mode === "assault") {
    return {
      heading: "Safety & Confidentiality Handling – Special Circumstances",
      intro: `Due to safety concerns (e.g., harassment or assault), I request heightened confidentiality when handling my dispute and communications.`,
      ask: requestType === "delete"
        ? `If the information cannot be verified with competent evidence, please remove it and provide confirmation.`
        : `If the information is inaccurate or incomplete, please correct it and provide confirmation.`,
      afterIssues: `Please avoid disclosing unnecessary personal contact details and use written correspondence to the address provided.`,
    };
  }
  // default
  return {
    heading: requestType === "delete"
      ? "Request for Deletion of Inaccurate/Unverifiable Information"
      : "Request for Correction of Inaccurate/Incomplete Information",
    intro: `I am disputing the reporting of the tradeline below. I believe it is inaccurate and/or not in compliance with Metro 2 standards and the FCRA.`,
    ask: requestType === "delete"
      ? "Please delete the inaccurate/unverifiable information pursuant to the FCRA."
      : "Please correct the inaccurate/incomplete reporting pursuant to the FCRA.",
    afterIssues: "",
  };
}

// ---------- letter HTML ----------
function buildLetterHTML({ consumer, bureau, tl, selectedViolationIdxs, requestType, comparisonBureaus, mode }) {
  const dateStr = todayISO();
  const bureauMeta = BUREAU_ADDR[bureau];

  const yourNameBlock = `
    <div style="line-height:1.4">
      <strong>${safe(consumer.name)}</strong><br>
      ${safe(consumer.addr1)}${consumer.addr2 ? "<br>"+safe(consumer.addr2) : ""}<br>
      ${safe(consumer.city)}, ${safe(consumer.state)} ${safe(consumer.zip)}<br>
      ${consumer.phone ? "Phone: "+safe(consumer.phone)+"<br>" : ""}
      ${consumer.email ? "Email: "+safe(consumer.email)+"<br>" : ""}
      ${consumer.ssn_last4 ? "SSN (last 4): "+safe(consumer.ssn_last4)+"<br>" : ""}
      ${consumer.dob ? "DOB: "+safe(consumer.dob) : ""}
    </div>
  `;

  const { conflictMap, errorMap } = buildConflictMap(tl.violations || []);
  const compTable = buildComparisonTableHTML(
    tl,
    (comparisonBureaus && comparisonBureaus.length ? comparisonBureaus : ALL_BUREAUS),
    conflictMap,
    errorMap
  );
  const tlBlock = buildTradelineBlockHTML(tl, bureau);
  const chosenList = buildViolationListHTML(tl.violations, selectedViolationIdxs);

  const mc = modeCopy(mode, requestType);

  const letterBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${bureau} – ${mc.heading}</title>
  <style>
    @media print { @page { margin: 1in; } }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial; color:#0b1226; }
    * { overflow-wrap:anywhere; word-break:break-word; }
    .card{ border:1px solid #e5e7eb; border-radius:12px; padding:18px; }
    .muted{ color:#6b7280; }
    h1{ font-size:20px; margin:0 0 8px 0; }
    h2{ font-size:16px; margin:18px 0 8px 0; }
    table { table-layout: fixed; }
    td, th { word-break: break-word; }
  </style>
</head>
<body>
  <div style="display:flex; justify-content:space-between; gap:24px; margin-bottom:16px">
    <div class="card" style="flex:1">${yourNameBlock}</div>
    <div class="card" style="flex:1">
      <div style="line-height:1.4">
        <strong>${bureauMeta.name}</strong><br>
        ${bureauMeta.addr1}<br>
        ${bureauMeta.addr2}
      </div>
    </div>
  </div>

  <div class="muted" style="margin-bottom:12px">${dateStr}</div>

  <h1>${mc.heading}</h1>
  <p>${mc.intro}</p>
  <p>${mc.ask}</p>

  <h2>Comparison (All Available Bureaus)</h2>
  ${compTable}

  <h2 style="margin-top:22px">Bureau-Specific Details (${bureau})</h2>
  ${tlBlock}

  <h2>Specific Issues (Selected)</h2>
  ${chosenList}

  ${mc.afterIssues ? `<p>${mc.afterIssues}</p>` : ""}

  <p>
    Please provide the method of verification, including the name, address, and telephone number of any furnisher you contacted.
    If you cannot verify the accuracy, please delete the item and send me an updated report.
  </p>

  <p>Sincerely,</p>
  <p>${safe(consumer.name)}</p>
</body>
</html>
  `.trim();

  const fnSafeCred = safe(tl.meta.creditor, "Unknown")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");

  // ✅ Correct variable: use the function parameter 'mode'
  const modeSuffix = mode ? `_${mode}` : "";

  const filename = `${bureau}_${fnSafeCred}${modeSuffix}_dispute_${new Date()
    .toISOString()
    .slice(0, 10)}.html`;

  return { filename, html: letterBody };
}

// ---------- main API ----------
function generateLetters({ report, selections, consumer, requestType = "correct" }) {
  const SPECIAL_ONE_BUREAU = new Set(["identity", "breach", "assault"]);
  const letters = [];

  for (const sel of selections || []) {
    const tl = report.tradelines?.[sel.tradelineIndex];
    if (!tl) continue;

    const isSpecial = SPECIAL_ONE_BUREAU.has(sel.specialMode);

    for (const bureau of sel.bureaus || []) {
      if (!ALL_BUREAUS.includes(bureau)) continue;

      const comparisonBureaus = isSpecial ? [bureau] : ALL_BUREAUS;

      const letter = buildLetterHTML({
        consumer,
        bureau,
        tl,
        selectedViolationIdxs: sel.violationIdxs || [],
        requestType,
        comparisonBureaus,
        mode: sel.specialMode || null, // ✅ pass correct prop name
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
