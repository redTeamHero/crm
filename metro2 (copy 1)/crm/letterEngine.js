// letterEngine.js
import { enrichTradeline } from './pullTradelineData.js';
import { loadMetro2Violations } from './utils.js';
import { LETTER_TEMPLATES } from './letterTemplates.js';
import { getStateLawAddendum } from './stateLaws.js';

const _COLLECTOR_TPL_MAP = Object.fromEntries(LETTER_TEMPLATES.map(t => [t.id, t]));

function collectorLinesToHtml(text) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i].trim();
    if (l === '') {
      out.push('<br>');
      i++;
    } else if (/^[•·]\s*/.test(l)) {
      const items = [];
      while (i < lines.length && /^[•·]\s*/.test(lines[i].trim())) {
        items.push(`<li>${colorize(lines[i].trim().replace(/^[•·]\s*/, ''))}</li>`);
        i++;
      }
      out.push(`<ul style="margin:6px 0 6px 20px;padding:0;">${items.join('')}</ul>`);
    } else if (/^\d+[.)]\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(`<li>${colorize(lines[i].trim().replace(/^\d+[.)]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol style="margin:6px 0 6px 20px;padding:0;">${items.join('')}</ol>`);
    } else {
      out.push(`<p class="ocr">${colorize(l)}</p>`);
      i++;
    }
  }
  return out.join('\n');
}

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
        detail: meta.snippets?.[locale] || v.detail || meta.violation || v.title,
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

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function safe(val, fallback = "") {
  return val == null ? fallback : escapeHtml(String(val));
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
      renderCell: (pb) => fieldVal(pb, "account_number") || "—",
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
    renderRow("Last Reported", available, tl, conflictMap, errorMap, {
      fields: ["last_reported"],
      renderCell: (pb) => fieldVal(pb, "last_reported") || "—",
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
    acct: fieldVal(pb, "account_number") || "N/A",
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
    lastReported: fieldVal(pb, "last_reported") || "N/A",
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
        <tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Last Reported</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.lastReported}</td></tr>
        ${creds.comments ? `<tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;">Comments</td><td style="padding:6px;border:1px solid #e5e7eb;">${creds.comments}</td></tr>` : ""}
      </tbody>
    </table>`;
}

// Evidence / violations
function stripPdfMarkers(text) {
  if (!text || typeof text !== 'string') return text || '';
  return text
    .replace(/##\/?BOLD##/g, '')
    .replace(/##\/?LI##/g, '')
    .replace(/##\|[^|]*\|##/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripBureauFromText(text) {
  if (!text || typeof text !== 'string') return text || '';
  return text
    .replace(/\b(Experian|TransUnion|Equifax)\s*[-–—:,;.]\s*/gi, '')
    .replace(/\b(on|at|for|from|with|per|via)\s+(Experian|TransUnion|Equifax)\b/gi, '')
    .replace(/\b(Experian|TransUnion|Equifax)\s+(reports?|shows?|lists?|has|file)\b/gi, '')
    .replace(/\(\s*(Experian|TransUnion|Equifax)\s*\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanViolationText(text) {
  return stripBureauFromText(stripPdfMarkers(text));
}

function isByBureauMap(obj) {
  if (!obj || typeof obj !== "object") return false;
  return Object.keys(obj).some(k => ["TransUnion","Experian","Equifax"].includes(k));
}

function renderByBureauTable(title, map) {
  const rows = Object.entries(map)
    .filter(([k]) => ["TransUnion","Experian","Equifax"].includes(k))
    .map(([k, v]) => `<tr><td style="padding:6px;border:1px solid #e5e7eb;background:#f9fafb;width:160px;">${k}</td><td style="padding:6px;border:1px solid #e5e7eb;word-break:break-word;">${safe(stripPdfMarkers(String(v ?? '')) || '—')}</td></tr>`)
    .join("");
  return `
    <div style="margin:8px 0;">
      <div style="font-weight:600;margin-bottom:4px;">${safe(stripPdfMarkers(title.replace(/_/g, " ")))}</div>
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

function buildViolationListHTML(
  violations,
  selectedIds,
  manualReason,
  { locale = 'en', minSeverity = 1 } = {}
) {
  const hasSelections = Array.isArray(selectedIds) && selectedIds.length > 0;
  if (!violations?.length || !hasSelections) {
    if (manualReason) return `<p>${safe(manualReason)}</p>`;
    return `<ol class="ocr" style="margin:10px 0 0;padding-left:8px;"><li style="margin-bottom:12px;"><strong>The information reported for this account is inaccurate, incomplete, or unverifiable.</strong><div style="margin-top:6px;">I am requesting a full reinvestigation of this account. The reported data does not correspond to my records. If this information cannot be independently verified through documentation from the original creditor, it must be promptly deleted from my credit file.</div></li></ol>`;
  }
  const selected = selectedIds.map((idx) => violations[idx]).filter(Boolean);
  const enriched = filterViolationsBySeverity(selected, minSeverity, locale);
  const items = enriched
    .map((v) => {
      const evHTML = renderEvidenceHTML(v.evidence);
      const violationLabel = cleanViolationText(v.violation || v.category || v.title || '');
      const rawDetail = v.detail || '';
      const cleanDetail = cleanViolationText(rawDetail);
      const fcraText = cleanDetail;
      let primaryText = violationLabel || fcraText || '';
      const secondaryText = violationLabel && fcraText && fcraText !== violationLabel ? fcraText : '';
      if (!primaryText && !secondaryText && !evHTML) {
        primaryText = v.code
          ? `Reporting violation (${v.code}) — the data furnished for this account does not comply with Metro 2 accuracy requirements.`
          : 'The information reported for this account is inaccurate and does not match my records.';
      }
      return `
        <li style="margin-bottom:12px;">
          <strong>${safe(primaryText)}</strong>
          ${secondaryText ? `<div style="margin-top:4px;">${safe(secondaryText)}</div>` : ''}
          ${evHTML ? `<div style="margin-top:6px;">${evHTML}</div>` : ''}
        </li>`;
    })
    .filter(s => s && s.trim())
    .join("");
  if (!items) return `<ol class="ocr" style="margin:10px 0 0;padding-left:8px;"><li style="margin-bottom:12px;"><strong>The information reported for this account is inaccurate, incomplete, or unverifiable.</strong><div style="margin-top:6px;">I am requesting a full reinvestigation. The reported data does not correspond to my records and cannot be verified with maximum possible accuracy. If this information cannot be independently verified, it must be deleted from my credit file.</div></li></ol>`;
  return `<ol class="ocr" style="margin:10px 0 0;padding-left:8px;">${items}</ol>`;
}

// Mode-based copy
function modeCopy(modeKey, requestType, hasEvidence = false) {
  if (modeKey === "identity") {
    return {
      heading: "Identity Theft — Request to Block Fraudulent Account",
      intro: `I am a victim of identity theft. The account(s) listed below were opened or reported as a result of fraudulent activity and do not belong to me. I have not authorized this account, and the information being reported is not accurate.`,
      ask: `I am requesting that you immediately block this information from my credit file and provide me with an updated report within five business days. If the information cannot be verified as legitimately mine through documentation bearing my actual signature, it must be permanently removed.`,
      afterIssues: `Please provide written confirmation of the actions taken within 30 days.`,
      evidence: hasEvidence
        ? `Enclosed are supporting documents: FTC Identity Theft Report, police report, government-issued identification, and proof of current address.`
        : ``,
    };
  }

  if (modeKey === "breach") {
    return {
      heading: "Data Breach — Request for Reinvestigation",
      intro: `I am disputing the accuracy of the following account(s) because my personal information was compromised in a documented data breach. Information reported from a compromised source cannot be reliably verified as accurate, complete, or attributable to me. Heightened verification is required before this information can continue to be reported.`,
      ask: requestType === "delete"
        ? `I am requesting that you delete or block this account if it cannot be independently verified as accurate and legitimately mine through documentation unaffected by the breach.`
        : `I am requesting that you conduct a thorough reinvestigation, contact the original furnisher for primary source documentation, and correct any information that cannot be verified with maximum possible accuracy. Please provide me with an updated credit report reflecting any corrections.`,
      afterIssues: `Please document the method of verification, including the name and contact information of any furnisher relied upon. Provide your written results within 30 days.`,
      evidence: hasEvidence
        ? `Enclosed are supporting documents: data breach notification letter, FTC Identity Theft Report, government-issued identification, and proof of current address.`
        : ``,
    };
  }

  if (modeKey === "assault") {
    return {
      heading: "Special Circumstances — Safety and Confidentiality Request",
      intro: `Due to documented safety concerns, I am requesting special handling of the information below to ensure my privacy and security. I am also requesting that my address and contact information be treated as confidential to prevent disclosure that could endanger my safety.`,
      ask: requestType === "delete"
        ? `If the information cannot be verified with certainty through documentation bearing my actual signature, please remove it immediately. Any account opened through fraud or coercion should be blocked.`
        : `If the information is inaccurate or incomplete, please correct it. Do not disclose sensitive personal contact details in any correspondence or to any third parties.`,
      afterIssues: `Please restrict access to my file and apply any available protective measures. Provide written confirmation of actions taken.`,
      evidence: hasEvidence
        ? `Enclosed are supporting documents: restraining order, law enforcement letter, or other evidence of safety concerns, along with government-issued identification.`
        : ``,
    };
  }

  // Default fallback
  return {
    heading: requestType === "delete"
      ? "Request for Deletion of Inaccurate or Unverifiable Information"
      : "Request for Correction of Inaccurate or Incomplete Information",
    intro: `I am disputing the reporting of the tradeline below because it is inaccurate, incomplete, or unverifiable. I am requesting a full reinvestigation of this account. You are required to conduct a reasonable reinvestigation and record the current status, or delete the item, within 30 days of receiving this dispute.`,
    ask: requestType === "delete"
      ? "I am requesting deletion of this inaccurate or unverifiable information. If it cannot be verified through independent documentation from the original creditor, it must be promptly removed from my credit file."
      : "I am requesting correction of the inaccurate or incomplete reporting. Please investigate and correct the disputed entries, and provide the method of verification including the name and contact information of any furnisher relied upon.",
    afterIssues: `Please provide your investigation results in writing within 30 days.`,
    evidence: hasEvidence
      ? `Enclosed are supporting documents: government-issued identification and proof of current address.`
      : ``,
  };
}

// Build letter HTML and filename
function buildLetterHTML(opts) {
  const {
    consumer,
    bureau,
    tl,
    selectedViolationIdxs,
    requestType,
    comparisonBureaus,
    modeKey,
    dateOverride,
    template,
    specificDisputeReason,
    previousDisputeDate,
    priorDates,
  } = opts || {};
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
  const rawManualReason =
    typeof specificDisputeReason === 'string' && specificDisputeReason.trim()
      ? specificDisputeReason.trim()
      : null;
  const manualReason = rawManualReason ? cleanViolationText(rawManualReason) : null;
  const chosenList = manualReason
    ? `<ol class="ocr" style="margin:0;padding-left:8px;"><li style="margin-bottom:12px;"><strong>${safe(manualReason)}</strong></li></ol>`
    : buildViolationListHTML(tl.violations, selectedViolationIdxs);

  const _isEnglishBlob = (s) => typeof s === 'string' && (s.includes('\n[Address]') || s.startsWith('[Your Name]'));
  const _effectiveEnglish = template?.english || (_isEnglishBlob(template?.intro) ? template.intro : null);

  if (template && _effectiveEnglish) {
    const accountNum = tl.per_bureau?.[bureau]?.account_number
      || tl.meta?.account_numbers?.[bureau]
      || tl.meta?.account_number
      || '****';
    const creditorName = tl.meta?.creditor || 'Unknown';
    const prevDate = previousDisputeDate || 'a prior date';
    const allDates = Array.isArray(priorDates) && priorDates.length ? priorDates.join(', ') : prevDate;
    const violationSummary = (tl.violations || []).slice(0, 2).map(v => v.title || v.category || v.detail || '').filter(Boolean).join('; ') || 'inaccurate or unverifiable information';
    const _engRawBal = tl.per_bureau?.[bureau]?.balance_raw
      ?? tl.per_bureau?.[bureau]?.balance
      ?? tl.meta?.balance
      ?? null;
    const _engNum = _engRawBal != null ? parseFloat(String(_engRawBal).replace(/[^0-9.]/g, '')) : NaN;
    const _engBalStr = !isNaN(_engNum) ? `$${_engNum.toFixed(2)}`          : '[BALANCE — ENTER MANUALLY]';
    const _engP40Str = !isNaN(_engNum) ? `$${(_engNum * 0.40).toFixed(2)}` : '[40% AMOUNT — ENTER MANUALLY]';
    const _engP50Str = !isNaN(_engNum) ? `$${(_engNum * 0.50).toFixed(2)}` : '[50% AMOUNT — ENTER MANUALLY]';
    const personalized = _effectiveEnglish
      .replace(/\[Your Name\]/g, safe(consumer.name))
      .replace(/\[Address\]/g, safe(consumer.addr1 || ''))
      .replace(/\[City, State ZIP\]/g, [consumer.city, consumer.state, consumer.zip].filter(Boolean).join(', '))
      .replace(/\[Phone\]/g, safe(consumer.phone || ''))
      .replace(/\[Email\]/g, safe(consumer.email || ''))
      .replace(/\[Previous Dispute Date\]/g, safe(prevDate))
      .replace(/\[Dates\]/g, safe(allDates))
      .replace(/\[Date\]/g, dateStr)
      .replace(/\[Credit Bureau Name\]/g, safe(bureauMeta.name))
      .replace(/\[Credit Bureau or Creditor Name\]/g, safe(bureauMeta.name))
      .replace(/\[Creditor or Debt Collector Name\]/g, safe(creditorName))
      .replace(/\[Financial Institution Name\]/g, safe(creditorName))
      .replace(/\[Healthcare Provider Name\]/g, safe(creditorName))
      .replace(/\[Debt Collector Name\]/g, safe(creditorName))
      .replace(/\[Account Number\]/g, safe(accountNum))
      .replace(/\[Bureau\]/g, safe(bureauMeta.name))
      .replace(/\[List Accounts\]/g, safe(`${creditorName} #${accountNum}`))
      .replace(/\[specific inaccuracy\]/gi, safe(violationSummary))
      .replace(/\[describe error\]/gi, safe(violationSummary))
      .replace(/\[Discharge Date\]/g, 'the date referenced in the enclosed discharge order')
      .replace(/\[Month, Year\]/g, 'the date of first delinquency on file')
      .replace(/\[Total Balance\]/g, _engBalStr)
      .replace(/\[40% Amount\]/g, _engP40Str)
      .replace(/\[50% Amount\]/g, _engP50Str)
      .replace(/\{BALANCE\}/g, _engBalStr)
      .replace(/\{40_PCT\}/g, _engP40Str)
      .replace(/\{50_PCT\}/g, _engP50Str)
      .replace(/\{ACCOUNT\}/g, safe(accountNum))
      .replace(/\{CREDITOR\}/g, safe(creditorName))
      .replace(/\[Amount\]/g, _engBalStr)
      .replace(/\[number\]/g, '[NUMBER OF CALLS — ENTER MANUALLY]')
      .replace(/\[time period\]/g, '[TIME PERIOD — ENTER MANUALLY]')
      .replace(/\[brief explanation[^\]]*\]/gi, '[CIRCUMSTANCES — ENTER MANUALLY]')
      .replace(/\[List\]/g, '[SEE ATTACHED]')
      .replace(/\[Arbitration Forum[^\]]*\]/gi, 'AAA or JAMS');

    let cleaned = personalized;
    const consName = (consumer.name || '').trim();
    const consAddr = (consumer.addr1 || '').trim();
    const consCityLine = [consumer.city, consumer.state, consumer.zip].filter(Boolean).join(', ');
    if (consName) {
      cleaned = cleaned.replace(new RegExp('^\\s*' + consName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n', 'i'), '');
    }
    cleaned = cleaned.replace(/^\s*\[?Address\]?[^\n]*\n?/im, '');
    cleaned = cleaned.replace(/^\s*\[?City[^\n]*\n?/im, '');
    cleaned = cleaned.replace(/^\s*\[?Phone\]?[^\n]*\n?/im, '');
    cleaned = cleaned.replace(/^\s*\[?Email\]?[^\n]*\n?/im, '');
    if (consAddr) {
      cleaned = cleaned.replace(new RegExp('^\\s*' + consAddr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\n]*\\n', 'i'), '');
    }
    if (consCityLine) {
      cleaned = cleaned.replace(new RegExp('^\\s*' + consCityLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\n]*\\n', 'i'), '');
    }
    const hasSig = /sincerely[,.]?\s*(\n\s*\S.*)?$/im.test(cleaned.trim());
    if (hasSig) {
      cleaned = cleaned.replace(/\n?\s*Sincerely[,.]?\s*(\n\s*[^\n]+)?\s*$/i, '');
    }
    const lines = cleaned.split('\n');
    const bodyHtml = lines.map(l => l.trim() === '' ? '<br>' : `<p class="ocr">${colorize(l)}</p>`).join('\n');

    const creditorForTitle = safe(tl.meta?.creditor || 'Dispute');
    const letterBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${bureau} Dispute – ${creditorForTitle}</title>
  <style>
    @media print { @page { margin: 1in; } }
    body { font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial; color:#000000; line-height:1.55; }
    * { word-break:break-word; }
    .card{ border:1px solid #e5e7eb; border-radius:12px; padding:18px; }
    .muted{ color:#6b7280; }
    p { margin:10px 0; }
    h1{ font-size:20px; margin-top:18px; margin-bottom:10px; }
    h2{ font-size:16px; margin-top:28px; margin-bottom:10px; }
    table { table-layout: fixed; width:100%; border-collapse:collapse; }
    td, th { word-break:break-word; padding:8px; border:1px solid #e5e7eb; }
    .enclosures { margin-top:28px; font-size:13px; color:#374151; }
    .sig-block { margin-top:32px; }
  </style>
</head>
<body>
  ${buildLetterHeader(consumer, bureauMeta)}
  <div class="muted" style="margin-bottom:14px;">${dateStr}</div>

  ${bodyHtml}

  <h2>Comparison (All Available Bureaus)</h2>
  ${compTable}

  <h2>Bureau-Specific Details (${bureau})</h2>
  ${tlBlock}

  <h2>Specific Issues (Selected)</h2>
  ${chosenList}

  <p style="margin-top:24px;">Please provide the method of verification, including the name and contact information of any furnisher relied upon. If you cannot verify the information with maximum possible accuracy, delete the item and send me an updated report.</p>
  ${(() => { const _sl = getStateLawAddendum(consumer.state); return _sl ? `<p class="ocr" style="margin-top:16px;padding:12px;border-left:3px solid #d4a853;background:#fffbf0;font-size:13px;color:#374151;">${safe(_sl.addendum)}</p>` : ''; })()}
  ${hasSig ? '' : `<div class="sig-block"><p>Sincerely,<br>${safe(consumer.name)}</p></div>`}
  ${opts._enclosuresHtml || ''}
  ${(() => { const _sl = getStateLawAddendum(consumer.state); return _sl ? `<p style="font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:8px;text-align:center;">Applicable state law: ${safe(_sl.name)}</p>` : ''; })()}
</body>
</html>`.trim();

    const fnSafeCred = safe(tl.meta.creditor, "Unknown")
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "");
    const tplSuffix = `_${template.id}`;
    const filename = `${bureau}_${fnSafeCred}${tplSuffix}_dispute_${new Date().toISOString().slice(0, 10)}.html`;

    return { filename, html: letterBody, letterType: template.id };
  }

  const mc = template
    ? {
        heading: template.heading || "",
        intro: template.intro || "",
        ask: template.ask || "",
        afterIssues: template.afterIssues || "",
        evidence: template.evidence || "",
      }
    : modeCopy(modeKey, requestType);

  {
    const _acct = tl.per_bureau?.[bureau]?.account_number
      || tl.meta?.account_numbers?.[bureau]
      || tl.meta?.account_number
      || '****';
    const _cred = safe(tl.meta?.creditor || 'Unknown');
    const _rawBal = tl.per_bureau?.[bureau]?.balance_raw
      ?? tl.per_bureau?.[bureau]?.balance
      ?? tl.meta?.balance
      ?? null;
    const _num = _rawBal != null ? parseFloat(String(_rawBal).replace(/[^0-9.]/g, '')) : NaN;
    const _balStr  = !isNaN(_num) ? `$${_num.toFixed(2)}`           : '[BALANCE — ENTER MANUALLY]';
    const _p40Str  = !isNaN(_num) ? `$${(_num * 0.40).toFixed(2)}`  : '[40% AMOUNT — ENTER MANUALLY]';
    const _p50Str  = !isNaN(_num) ? `$${(_num * 0.50).toFixed(2)}`  : '[50% AMOUNT — ENTER MANUALLY]';
    const _sub = (s) => !s ? s : s
      .replace(/\{BALANCE\}/g,  _balStr)
      .replace(/\{40_PCT\}/g,   _p40Str)
      .replace(/\{50_PCT\}/g,   _p50Str)
      .replace(/\{CREDITOR\}/g, _cred)
      .replace(/\{ACCOUNT\}/g,  safe(_acct));
    mc.heading    = _sub(mc.heading);
    mc.intro      = _sub(mc.intro);
    mc.ask        = _sub(mc.ask);
    mc.afterIssues = _sub(mc.afterIssues);
    mc.evidence   = _sub(mc.evidence);
  }

  const intro = colorize(mc.intro);
  const ask = colorize(mc.ask);
  const afterIssuesPara = mc.afterIssues ? `<p class="ocr">${colorize(mc.afterIssues)}</p>` : "";
  const evidencePara = mc.evidence ? `<p class="ocr">${colorize(mc.evidence)}</p>` : "";
  const breachList = Array.isArray(consumer.breachSelections) && consumer.breachSelections.length
    ? consumer.breachSelections
    : (consumer.breaches || []);
  const breachSection =
    modeKey === "breach" && breachList.length
      ? `<h2>Data Breaches</h2><p>The following breaches exposed my information:</p><ul>${breachList
          .map((b) => `<li>${safe(b)}</li>`)
          .join("")}</ul>`
      : "";
  const breachEvidenceNotes = safe(consumer.breachEvidenceNotes);
  const breachEvidenceFiles = Array.isArray(consumer.breachEvidenceFiles) ? consumer.breachEvidenceFiles : [];
  const breachEvidenceSection =
    modeKey === "breach" && (breachEvidenceNotes || breachEvidenceFiles.length)
      ? `<h2>Breach Evidence</h2>${breachEvidenceNotes ? `<p class="ocr">${breachEvidenceNotes}</p>` : ""}${
          breachEvidenceFiles.length
            ? `<ul>${breachEvidenceFiles
                .map((file) => `<li>${safe(file.name || file.originalName || "Evidence file")}</li>`)
                .join("")}</ul>`
            : ""
        }`
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
  <title>${bureau} Dispute – ${safe(tl.meta?.creditor || 'Account')}</title>
  <style>
    @media print { @page { margin: 1in; } }
    body { font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial; color:#000000; line-height:1.55; }
    * { word-break:break-word; }
    .card{ border:1px solid #e5e7eb; border-radius:12px; padding:18px; }
    .muted{ color:#6b7280; }
    p { margin:10px 0; }
    h1{ font-size:20px; margin-top:18px; margin-bottom:10px; }
    h2{ font-size:16px; margin-top:28px; margin-bottom:10px; }
    table { table-layout: fixed; width:100%; border-collapse:collapse; }
    td, th { word-break:break-word; padding:8px; border:1px solid #e5e7eb; }
    .enclosures { margin-top:28px; font-size:13px; color:#374151; }
    .sig-block { margin-top:32px; }
  </style>
</head>
<body>
  ${buildLetterHeader(consumer, bureauMeta)}
  <div class="muted" style="margin-bottom:14px;">${dateStr}</div>

  <h1>${colorize(mc.heading)}</h1>
  <p class="ocr">${intro}</p>
  <p class="ocr">${ask}</p>

  ${breachSection}
  ${breachEvidenceSection}
  <h2>Comparison (All Available Bureaus)</h2>
  ${compTable}

  <h2>Bureau-Specific Details (${bureau})</h2>
  ${tlBlock}

  <h2>Specific Issues (Selected)</h2>
  ${chosenList}

  ${evidencePara}
  ${afterIssuesPara}

  <p style="margin-top:24px;">${verifyLine}</p>
  ${(() => { const _sl = getStateLawAddendum(consumer.state); return _sl ? `<p class="ocr" style="margin-top:16px;padding:12px;border-left:3px solid #d4a853;background:#fffbf0;font-size:13px;color:#374151;">${safe(_sl.addendum)}</p>` : ''; })()}
  <div class="sig-block">
    <p>${signOff}</p>
  </div>
  ${opts._enclosuresHtml || ''}
  ${(() => { const _sl = getStateLawAddendum(consumer.state); return _sl ? `<p style="font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:8px;text-align:center;">Applicable state law: ${safe(_sl.name)}</p>` : ''; })()}
</body>
</html>`.trim();

  const fnSafeCred = safe(tl.meta.creditor, "Unknown")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");

  const _suffix = template ? `_${template.id}` : (modeKey ? `_${modeKey}` : "");
  const filename = `${bureau}_${fnSafeCred}${_suffix}_dispute_${new Date().toISOString().slice(0, 10)}.html`;

  return { filename, html: letterBody, letterType: template?.id };
}

function namePrefix(consumer) {
  return (consumer.name || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function buildLetterHeader(consumer, recipient){
  const consumerLines = [
    `<strong>${safe(consumer.name)}</strong>`,
    safe(consumer.addr1),
    consumer.addr2 ? safe(consumer.addr2) : null,
    [consumer.city, consumer.state, consumer.zip].filter(Boolean).join(', ') || null,
    consumer.phone ? `Phone: ${safe(consumer.phone)}` : null,
    consumer.email ? `Email: ${safe(consumer.email)}` : null,
    consumer.ssn_last4 ? `SSN (last 4): ${safe(consumer.ssn_last4)}` : null,
    consumer.dob ? `DOB: ${safe(consumer.dob)}` : null,
  ].filter(Boolean).join('<br>');

  const recipientLines = [
    `<strong>${safe(recipient.name)}</strong>`,
    recipient.addr1 ? safe(recipient.addr1) : null,
    recipient.addr2 ? safe(recipient.addr2) : null,
    recipient.phone ? `Phone: ${safe(recipient.phone)}` : null,
  ].filter(Boolean).join('<br>');

  return `
  <table style="width:100%; border-collapse:separate; border-spacing:12px 0; margin-bottom:16px;">
    <tr>
      <td style="border:1px solid #e5e7eb; border-radius:8px; padding:16px; vertical-align:top; width:50%;">${consumerLines}</td>
      <td style="border:1px solid #e5e7eb; border-radius:8px; padding:16px; vertical-align:top; width:50%;">${recipientLines}</td>
    </tr>
  </table>`;
}

function buildLetterTemplate({ title, bodyHtml, consumer, headerData }) {
  const dateStr = todayISO();
  const _sl = getStateLawAddendum(consumer?.state);
  const stateLawHtml = _sl
    ? `<p style="margin-top:16px;padding:12px;border-left:3px solid #d4a853;background:#fffbf0;font-size:13px;color:#374151;">${safe(_sl.addendum)}</p>`
    : '';
  const stateLawFooterHtml = _sl
    ? `<p style="font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:8px;text-align:center;">Applicable state law: ${safe(_sl.name)}</p>`
    : '';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @media print { @page { margin: 1in; } }
    body { font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial; color:#000000; line-height:1.55; }
    * { word-break:break-word; }
    .card{ border:1px solid #e5e7eb; border-radius:12px; padding:18px; }
    .muted{ color:#6b7280; }
    p { margin:10px 0; }
    h1{ font-size:20px; margin-top:18px; margin-bottom:10px; }
    h2{ font-size:16px; margin-top:28px; margin-bottom:10px; }
    table { table-layout: fixed; width:100%; border-collapse:collapse; }
    td, th { word-break:break-word; padding:8px; border:1px solid #e5e7eb; }
    .enclosures { margin-top:28px; font-size:13px; color:#374151; }
    .sig-block { margin-top:32px; }
  </style>
</head>
<body>
  ${buildLetterHeader(consumer, headerData)}
  <div class="muted" style="margin-bottom:14px;">${dateStr}</div>
  ${bodyHtml}
  ${stateLawHtml}
  ${stateLawFooterHtml}
</body>
</html>
  `.trim();
}

function buildPersonalInfoLetterHTML({ consumer, bureau, mismatchedFields = [] }) {
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

  const bodyHtml = `
  <h1>${colorize("Personal Information Dispute")}</h1>
  <p>${colorize("Please update your records to reflect my correct personal information and remove any other data that does not belong to me.")}</p>
  <h2>My Correct Information</h2>
  ${infoTable}
  <p>${colorize("Sincerely,")}<br>${colorize(safe(consumer.name))}</p>
  `;

  const letterBody = buildLetterTemplate({
    title: `${bureau} – Personal Information Dispute`,
    bodyHtml,
    consumer,
    headerData: bureauMeta,
  });

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
  const bureauMeta = BUREAU_ADDR[bureau];
  const bodyHtml = `
  <h1>${colorize("Unauthorized Inquiry Dispute")}</h1>
  <p>${colorize(`Please remove the inquiry by ${safe(inquiry.creditor)} dated ${safe(inquiry.date)} from my ${bureau} credit file. I did not authorize this inquiry.`)}</p>
  <p>${colorize("Sincerely,")}<br>${colorize(safe(consumer.name))}</p>
  `;

  const letterBody = buildLetterTemplate({
    title: `${bureau} – Inquiry Dispute`,
    bodyHtml,
    consumer,
    headerData: bureauMeta,
  });

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
  const templateId = collector.templateId || 'debt-validation';
  const template = _COLLECTOR_TPL_MAP[templateId] || null;
  const dateStr = todayISO();
  const collectorName = safe(collector.name || 'Debt Collector');
  const accountNum = collector.accountNumber ? safe(collector.accountNumber) : '[ACCOUNT NUMBER — ENTER MANUALLY]';

  const headerData = {
    name: collector.name || 'Debt Collector',
    addr1: '[Add collector address — required before mailing]',
  };

  let bodyHtml;

  if (template && template.english) {
    const _rawBal = collector.balance ?? null;
    const _num = _rawBal != null ? parseFloat(String(_rawBal).replace(/[^0-9.]/g, '')) : NaN;
    const _balStr = !isNaN(_num) ? `$${_num.toFixed(2)}`           : '[BALANCE — ENTER MANUALLY]';
    const _p40Str = !isNaN(_num) ? `$${(_num * 0.40).toFixed(2)}`  : '[40% AMOUNT — ENTER MANUALLY]';
    const _p50Str = !isNaN(_num) ? `$${(_num * 0.50).toFixed(2)}`  : '[50% AMOUNT — ENTER MANUALLY]';

    const personalized = template.english
      .replace(/\[Your Name\]/g, safe(consumer.name))
      .replace(/\[Address\]/g, safe(consumer.addr1 || ''))
      .replace(/\[City, State ZIP\]/g, [consumer.city, consumer.state, consumer.zip].filter(Boolean).join(', '))
      .replace(/\[Phone\]/g, safe(consumer.phone || ''))
      .replace(/\[Email\]/g, safe(consumer.email || ''))
      .replace(/\[Date\]/g, dateStr)
      .replace(/\[Debt Collector Name\]/g, collectorName)
      .replace(/\[Creditor or Debt Collector Name\]/g, collectorName)
      .replace(/\[Healthcare Provider Name\]/g, collectorName)
      .replace(/\[Financial Institution Name\]/g, collectorName)
      .replace(/\[Credit Bureau Name\]/g, collectorName)
      .replace(/\[Credit Bureau or Creditor Name\]/g, collectorName)
      .replace(/\[Bureau\]/g, collectorName)
      .replace(/\[Account Number\]/g, accountNum)
      .replace(/\{ACCOUNT\}/g, accountNum)
      .replace(/\{CREDITOR\}/g, collectorName)
      .replace(/\[Total Balance\]/g, _balStr)
      .replace(/\[40% Amount\]/g, _p40Str)
      .replace(/\[50% Amount\]/g, _p50Str)
      .replace(/\{BALANCE\}/g, _balStr)
      .replace(/\{40_PCT\}/g, _p40Str)
      .replace(/\{50_PCT\}/g, _p50Str)
      .replace(/\[Amount\]/g, _balStr)
      .replace(/\[number\]/g, '[NUMBER OF CALLS — ENTER MANUALLY]')
      .replace(/\[time period\]/g, '[TIME PERIOD — ENTER MANUALLY]')
      .replace(/\[brief explanation[^\]]*\]/gi, '[CIRCUMSTANCES — ENTER MANUALLY]')
      .replace(/\[List\]/g, '[SEE ATTACHED]')
      .replace(/\[Arbitration Forum[^\]]*\]/gi, 'AAA or JAMS');

    const reIdx = personalized.search(/^Re:/im);
    const bodyText = reIdx >= 0 ? personalized.slice(reIdx) : personalized;

    const hasSig = /sincerely[,.]?\s*(\n\s*\S.*)?$/im.test(bodyText.trim());
    let cleaned = hasSig ? bodyText.replace(/\n?\s*Sincerely[,.]?\s*(\n\s*[^\n]+)?\s*$/i, '') : bodyText;

    const innerHtml = collectorLinesToHtml(cleaned);
    bodyHtml = `${innerHtml}<div class="sig-block" style="margin-top:28px;"><p>Sincerely,<br>${safe(consumer.name)}</p></div>`;

  } else if (template && (template.heading || template.intro || template.ask)) {
    const _rawBal = collector.balance ?? null;
    const _num = _rawBal != null ? parseFloat(String(_rawBal).replace(/[^0-9.]/g, '')) : NaN;
    const _balStr = !isNaN(_num) ? `$${_num.toFixed(2)}`           : '[BALANCE — ENTER MANUALLY]';
    const _p40Str = !isNaN(_num) ? `$${(_num * 0.40).toFixed(2)}`  : '[40% AMOUNT — ENTER MANUALLY]';
    const _p50Str = !isNaN(_num) ? `$${(_num * 0.50).toFixed(2)}`  : '[50% AMOUNT — ENTER MANUALLY]';
    const _sub = (s) => !s ? s : s
      .replace(/\{BALANCE\}/g,  _balStr)
      .replace(/\{40_PCT\}/g,   _p40Str)
      .replace(/\{50_PCT\}/g,   _p50Str)
      .replace(/\{CREDITOR\}/g, collectorName)
      .replace(/\{ACCOUNT\}/g,  accountNum);

    const heading    = _sub(template.heading    || '');
    const intro      = _sub(template.intro      || '');
    const ask        = _sub(template.ask        || '');
    const afterIssues = _sub(template.afterIssues || '');
    const evidence   = _sub(template.evidence   || '');

    bodyHtml = `
      ${heading     ? `<h1>${colorize(heading)}</h1>` : ''}
      ${intro       ? `<p class="ocr">${colorize(intro)}</p>` : ''}
      ${ask         ? `<p class="ocr">${colorize(ask)}</p>` : ''}
      ${afterIssues ? `<p class="ocr">${colorize(afterIssues)}</p>` : ''}
      ${evidence    ? `<p class="ocr">${colorize(evidence)}</p>` : ''}
      <div class="sig-block" style="margin-top:28px;"><p>Sincerely,<br>${safe(consumer.name)}</p></div>
    `;
  } else {
    bodyHtml = `
      <h1>${colorize("Debt Validation Request")}</h1>
      <p>${colorize("Please provide validation of the debt you allege is owed. Until validation is provided, cease all collection activities and communication with me regarding this account.")}</p>
      <p>${colorize("Sincerely,")}<br>${colorize(safe(consumer.name))}</p>
    `;
  }

  const letterBody = buildLetterTemplate({
    title: `${collectorName} – ${template ? template.name : 'Collection Letter'}`,
    bodyHtml,
    consumer,
    headerData,
  });

  const fnSafe = safe(collector.name)
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  const tplSuffix = template ? `_${template.id}` : '';
  const filename = `${namePrefix(consumer)}_${fnSafe}${tplSuffix}_collector_${new Date().toISOString().slice(0, 10)}.html`;
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

function buildEnclosuresHtml(enclosures) {
  if (!enclosures || !enclosures.length) return '';
  const items = enclosures.map(e => `<li>${safe(e.label)}</li>`).join('');
  return `<div class="enclosures"><strong>Enclosures:</strong><ul style="margin:4px 0 0;padding-left:18px;">${items}</ul></div>`;
}

function buildBatchLetterHTML({ consumer, bureau, items, requestType = "correct", enclosuresHtml = '' }) {
  const bureauMeta = BUREAU_ADDR[bureau];
  const dateStr = todayISO();
  const signOff = `Sincerely,<br>${safe(consumer.name)}`;
  const stateLaw = getStateLawAddendum(consumer.state);

  const accountBlocks = items.map((item, idx) => {
    const { tl, sel } = item;
    enrichTradeline(tl);
    const creditor = safe(tl.meta?.creditor || `Account ${idx + 1}`);
    const accountNum = tl.per_bureau?.[bureau]?.account_number
      || tl.meta?.account_numbers?.[bureau]
      || tl.meta?.account_number
      || null;
    const acctLine = accountNum ? ` (Acct: ${safe(accountNum)})` : '';
    const rawReason = typeof sel.specificDisputeReason === 'string' && sel.specificDisputeReason.trim() ? sel.specificDisputeReason.trim() : null;
    const violationsHtml = rawReason
      ? `<ol class="ocr" style="margin:6px 0 0;padding-left:18px;"><li>${safe(rawReason)}</li></ol>`
      : buildViolationListHTML(tl.violations, sel.violationIdxs || []);
    return `
    <div style="border-left:3px solid #d4a853;padding:12px 0 12px 16px;margin:20px 0;">
      <div style="font-weight:700;font-size:15px;margin-bottom:4px;">${idx + 1}. ${creditor}${acctLine}</div>
      <div style="font-size:13px;color:#374151;margin-bottom:6px;">Reported by: <strong>${safe(bureau)}</strong></div>
      ${violationsHtml}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safe(bureau)} Batch Dispute – ${items.length} Account${items.length !== 1 ? 's' : ''}</title>
  <style>
    @media print { @page { margin: 1in; } }
    body { font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial; color:#000000; line-height:1.55; }
    * { word-break:break-word; }
    p { margin:10px 0; }
    h1 { font-size:20px; margin-top:18px; margin-bottom:10px; }
    h2 { font-size:16px; margin-top:28px; margin-bottom:10px; }
    table { table-layout:fixed; width:100%; border-collapse:collapse; }
    td, th { word-break:break-word; padding:8px; border:1px solid #e5e7eb; }
    .enclosures { margin-top:28px; font-size:13px; color:#374151; }
    .sig-block { margin-top:32px; }
    ol.ocr { margin:0; padding-left:18px; }
    ol.ocr li { margin-bottom:8px; }
  </style>
</head>
<body>
  ${buildLetterHeader(consumer, bureauMeta)}
  <div style="color:#6b7280;margin-bottom:14px;">${dateStr}</div>

  <h1>Formal Dispute of Multiple Accounts</h1>
  <p>Pursuant to the Fair Credit Reporting Act (FCRA), 15 U.S.C. § 1681i, I am formally disputing the accuracy of the following accounts on my credit report maintained by ${safe(bureauMeta.name)}. I request a full reinvestigation of each item listed below.</p>

  <h2>Disputed Accounts (${items.length})</h2>
  ${accountBlocks}

  <p style="margin-top:24px;">For each account listed above, please provide the method of verification, including the name and contact information of any furnisher relied upon. If you cannot verify an item with maximum possible accuracy, delete it from my credit file and send me an updated report.</p>
  ${stateLaw ? `<p style="margin-top:16px;padding:12px;border-left:3px solid #d4a853;background:#fffbf0;font-size:13px;color:#374151;">${safe(stateLaw.addendum)}</p>` : ''}
  <div class="sig-block"><p>${signOff}</p></div>
  ${enclosuresHtml}
  ${stateLaw ? `<p style="font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:8px;text-align:center;">Applicable state law: ${safe(stateLaw.name)}</p>` : ''}
</body>
</html>`.trim();

  const batchIdx = items.length;
  const filename = `${namePrefix(consumer)}_${bureau}_batch${batchIdx}_dispute_${new Date().toISOString().slice(0, 10)}.html`;
  return { filename, html, letterType: 'batch' };
}

function generateLetters({ report, selections, consumer, requestType = "correct", templates = [], playbooks = {}, previousDisputeDate, priorDates, enclosures, itemsPerLetter = 0 }) {
  const SPECIAL_ONE_BUREAU = new Set(["identity", "breach", "assault"]);
  const letters = [];
  const templateMap = Object.fromEntries((LETTER_TEMPLATES || []).map(t => [t.id, t]));
  for (const t of (templates || [])) {
    templateMap[t.id] = t;
  }

  const templateByName = {};
  for (const tpl of Object.values(templateMap)) {
    if (tpl.name) templateByName[tpl.name.toLowerCase().trim()] = tpl;
    if (tpl.heading) templateByName[tpl.heading.toLowerCase().trim()] = tpl;
  }

  const batchSize = Number(itemsPerLetter) || 0;
  if (batchSize > 1) {
    const enclosuresHtml = buildEnclosuresHtml(enclosures);
    const prepared = [];
    for (const sel of selections || []) {
      const tl = report.tradelines?.[sel.tradelineIndex];
      if (!tl) continue;
      if (sel.creditor) { tl.meta = tl.meta || {}; tl.meta.creditor = sel.creditor; }
      enrichTradeline(tl);
      for (const bureau of sel.bureaus || []) {
        if (!ALL_BUREAUS.includes(bureau)) continue;
        prepared.push({ tl, sel, bureau });
      }
    }
    const byBureau = {};
    for (const entry of prepared) {
      (byBureau[entry.bureau] ||= []).push(entry);
    }
    for (const bureau of Object.keys(byBureau)) {
      const entries = byBureau[bureau];
      for (let i = 0; i < entries.length; i += batchSize) {
        const chunk = entries.slice(i, i + batchSize);
        const letter = buildBatchLetterHTML({ consumer, bureau, items: chunk, requestType, enclosuresHtml });
        const batchNum = Math.floor(i / batchSize) + 1;
        const filename = `${namePrefix(consumer)}_${bureau}_batch${batchNum}_of_${Math.ceil(entries.length / batchSize)}_dispute_${new Date().toISOString().slice(0, 10)}.html`;
        letters.push({ bureau, tradelineIndex: null, creditor: null, requestType, ...letter, filename });
      }
    }
    return letters;
  }

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
    const bureausWithData = new Set(
      Object.entries(tl.per_bureau || {})
        .filter(([_, pb]) => hasAnyData(pb))
        .map(([b]) => b)
    );
    const bureausPresent = Array.from(bureausWithData);

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

    for (const bureau of sel.bureaus || []) {
      if (ALL_BUREAUS.includes(bureau)) {
        tl.per_bureau = tl.per_bureau || {};
        if (!tl.per_bureau[bureau]) tl.per_bureau[bureau] = {};
      }
    }

    const isSpecial = SPECIAL_ONE_BUREAU.has(sel.specialMode);
    const comparisonBureaus = isSpecial ? [sel.bureaus[0]] : ALL_BUREAUS;

    const play = sel.playbook && playbooks[sel.playbook];
    const steps = play ? play.letters : [null];

    steps.forEach((stepTitle, stepIdx) => {
      const dateOverride = play ? futureISO(stepIdx * 30) : undefined;
      for (const bureau of sel.bureaus || []) {
        if (!ALL_BUREAUS.includes(bureau)) continue;

        const stepTpl = stepTitle ? (templateByName[stepTitle.toLowerCase().trim()] ?? null) : null;
        const tpl = stepTpl ?? (sel.templateId ? templateMap[sel.templateId] : null);
        const req = sel.requestType || tpl?.requestType || requestType;
        let letter = buildLetterHTML({
          consumer,
          bureau,
          tl,
          selectedViolationIdxs: sel.violationIdxs || [],
          requestType: req,
          comparisonBureaus,
          modeKey: sel.specialMode || null,
          dateOverride,
          template: tpl,
          specificDisputeReason: sel.specificDisputeReason,
          previousDisputeDate,
          priorDates,
          _enclosuresHtml: buildEnclosuresHtml(enclosures),
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
          requestType: req,
          specificDisputeReason: sel.specificDisputeReason,
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

