// letterEngine.js
import { enrichTradeline } from './pullTradelineData.js';
import { loadMetro2Violations } from './utils.js';
import { LETTER_TEMPLATES } from './letterTemplates.js';

// Load Metro 2 violation definitions from shared metadata
const VIOLATION_DEFS = await loadMetro2Violations();

const CASE_LAW = {
  accuracy: [
    { case: 'Cushman v. Trans Union Corp.', cite: '115 F.3d 220 (3d Cir. 1997)', holding: 'Credit reporting agencies must follow reasonable procedures to assure maximum possible accuracy of consumer reports.' },
    { case: 'Guimond v. Trans Union Credit Info. Co.', cite: '45 F.3d 1329 (9th Cir. 1995)', holding: 'A CRA that fails to verify disputed information through reasonable procedures may be held liable under §1681e(b).' },
  ],
  reinvestigation: [
    { case: 'Stevenson v. TRW Inc.', cite: '987 F.2d 288 (5th Cir. 1993)', holding: 'Simply parroting information from a furnisher without conducting an independent review does not constitute a reasonable reinvestigation under §1681i.' },
    { case: 'Dennis v. BEH-1, LLC', cite: '504 F.Supp.3d 453 (E.D. Va. 2020)', holding: 'A CRA must go beyond the original source of disputed information when conducting a reinvestigation.' },
  ],
  furnisher: [
    { case: 'Johnson v. MBNA America Bank, NA', cite: '357 F.3d 426 (4th Cir. 2004)', holding: 'A furnisher who receives notice of a consumer dispute from a CRA has a duty under §623(b) to conduct a reasonable investigation.' },
    { case: 'Gorman v. Wolpoff & Abramson, LLP', cite: '584 F.3d 1147 (9th Cir. 2009)', holding: 'Furnishers must conduct a meaningful investigation, not merely verify their own records, upon receiving notice of a dispute.' },
  ],
  identity: [
    { case: 'Philbin v. Trans Union Corp.', cite: '101 F.3d 957 (3d Cir. 1996)', holding: 'CRAs have an affirmative duty to maintain procedures that prevent mixed files and identity confusion.' },
    { case: 'Sloane v. Equifax Info. Servs., LLC', cite: '510 F.3d 495 (4th Cir. 2007)', holding: 'A CRA may be liable for willful noncompliance when it fails to adopt reasonable procedures to prevent identity-related reporting errors.' },
  ],
  willful: [
    { case: 'Safeco Ins. Co. of America v. Burr', cite: '551 U.S. 47 (2007)', holding: 'Willful noncompliance under FCRA includes reckless disregard of statutory duties, entitling consumers to statutory and punitive damages.' },
  ],
  fdcpa: [
    { case: 'Chaudhry v. Gallerizzo', cite: '174 F.3d 394 (4th Cir. 1999)', holding: 'Debt validation under FDCPA §809 requires more than a computer-generated printout; the collector must provide sufficient documentation to verify the debt.' },
    { case: 'Jerman v. Carlisle, McNellie, Rini, Kramer & Ulrich LPA', cite: '559 U.S. 573 (2010)', holding: 'The bona fide error defense under FDCPA does not apply to mistakes of law, holding debt collectors to strict statutory compliance.' },
  ],
  fdcpa_harassment: [
    { case: 'Jeter v. Credit Bureau, Inc.', cite: '760 F.2d 1168 (11th Cir. 1985)', holding: 'Excessive telephone calls and threatening language constitute harassment under FDCPA §806.' },
  ],
  fdcpa_time_barred: [
    { case: 'Kimber v. Federal Financial Corp.', cite: '668 F.Supp. 1480 (M.D. Ala. 1987)', holding: 'Attempting to collect a time-barred debt without disclosing that it is beyond the statute of limitations may violate FDCPA §807.' },
  ],
  tila: [
    { case: 'Beach v. Ocwen Federal Bank', cite: '523 U.S. 410 (1998)', holding: 'TILA requires strict compliance with disclosure requirements; even technical violations entitle the consumer to statutory damages.' },
    { case: 'Mourning v. Family Publications Service, Inc.', cite: '411 U.S. 356 (1973)', holding: 'TILA is a remedial statute to be construed liberally in favor of the consumer to ensure meaningful credit disclosures.' },
  ],
  hipaa: [
    { case: 'Byrne v. Avery Center for Obstetrics & Gynecology', cite: '314 Conn. 433 (2014)', holding: 'HIPAA standards may inform the duty of care owed by healthcare providers regarding patient information disclosures.' },
  ],
  glba: [
    { case: 'FTC v. Wyndham Worldwide Corp.', cite: '799 F.3d 236 (3d Cir. 2015)', holding: 'The FTC has authority to enforce data security standards under Gramm-Leach-Bliley, and financial institutions must safeguard consumer NPI.' },
  ],
  bankruptcy: [
    { case: 'In re Sommersdorf', cite: '139 B.R. 700 (Bankr. S.D. Ohio 1991)', holding: 'Reporting a discharged debt as active violates the bankruptcy discharge injunction under 11 U.S.C. §524.' },
  ],
  obsolete: [
    { case: 'Pittman v. Experian Info. Solutions, Inc.', cite: '901 F.3d 619 (6th Cir. 2018)', holding: 'Reporting debts beyond the seven-year limit prescribed by §605(a) constitutes a willful violation of the FCRA.' },
  ],
  reinsertion: [
    { case: 'Philbin v. Trans Union Corp.', cite: '101 F.3d 957 (3d Cir. 1996)', holding: 'Reinsertion of previously deleted information without the required five-day written notice violates §611(a)(5)(B).' },
  ],
};

const TEMPLATE_CASE_LAW_MAP = {
  'debt-validation': ['fdcpa'],
  '611-general-dispute': ['accuracy', 'reinvestigation'],
  'second-round-dispute': ['reinvestigation', 'willful'],
  '623-direct-dispute': ['furnisher'],
  'method-of-verification': ['reinvestigation'],
  'ag-cfpb-escalation': ['reinvestigation', 'willful'],
  '609-disclosure': ['accuracy'],
  'reinsertion-dispute': ['reinsertion'],
  'cease-and-desist': ['fdcpa'],
  'bankruptcy-misreporting': ['bankruptcy', 'accuracy'],
  'obsolete-debt': ['obsolete', 'willful'],
  'arbitration-election': ['fdcpa'],
  'tila-disclosure': ['tila'],
  'tila-rescission': ['tila'],
  'hipaa-medical-debt': ['hipaa'],
  'hipaa-phi-disclosure': ['hipaa'],
  'glba-privacy-violation': ['glba'],
  'glba-opt-out': ['glba'],
  'fdcpa-harassment': ['fdcpa_harassment', 'fdcpa'],
  'fdcpa-time-barred': ['fdcpa_time_barred', 'fdcpa'],
  'goodwill-removal': [],
  'pay-for-delete': [],
};

const MODE_CASE_LAW_MAP = {
  identity: ['identity', 'accuracy'],
  breach: ['identity', 'glba', 'accuracy'],
  assault: ['accuracy'],
};

function buildCaseLawSection(categories) {
  if (!categories || !categories.length) return '';
  const seen = new Set();
  const cases = [];
  for (const cat of categories) {
    for (const c of CASE_LAW[cat] || []) {
      const key = c.case;
      if (seen.has(key)) continue;
      seen.add(key);
      cases.push(c);
    }
  }
  if (!cases.length) return '';
  const items = cases.map(c =>
    `<li style="margin-bottom:12px;"><strong><em>${safe(c.case)}</em></strong>, ${safe(c.cite)}<br><span style="color:#4b5563;">${safe(c.holding)}</span></li>`
  ).join('');
  return `<h2>Legal Authority</h2><ol style="margin:10px 0 0;padding-left:18px;">${items}</ol>`;
}

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
    return `<ol class="ocr" style="margin:10px 0 0;padding-left:18px;"><li style="margin-bottom:12px;"><strong>The information reported for this account is inaccurate, incomplete, or unverifiable.</strong><div style="margin-top:6px;">Under FCRA §611 (15 U.S.C. §1681i), I request a full reinvestigation. The reported data does not correspond to my records and cannot be verified with maximum possible accuracy as required by §1681e(b). If this information cannot be independently verified through documentation from the original creditor, it must be promptly deleted from my credit file.</div></li></ol>`;
  }
  const selected = selectedIds.map((idx) => violations[idx]).filter(Boolean);
  const enriched = filterViolationsBySeverity(selected, minSeverity, locale);
  const items = enriched
    .map((v) => {
      const evHTML = renderEvidenceHTML(v.evidence);
      const violationLabel = cleanViolationText(v.violation || v.category || v.title || '');
      const rawDetail = v.detail || '';
      const cleanDetail = cleanViolationText(rawDetail);
      const fcraText =
        v.fcraSection && cleanDetail && !cleanDetail.includes(v.fcraSection)
          ? `Per FCRA §${v.fcraSection}, ${cleanDetail}`
          : cleanDetail;
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
  if (!items) return `<ol class="ocr" style="margin:10px 0 0;padding-left:18px;"><li style="margin-bottom:12px;"><strong>The information reported for this account is inaccurate, incomplete, or unverifiable.</strong><div style="margin-top:6px;">Under FCRA §611 (15 U.S.C. §1681i), I request a full reinvestigation. The reported data does not correspond to my records and cannot be verified with maximum possible accuracy as required by §1681e(b).</div></li></ol>`;
  return `<ol class="ocr" style="margin:10px 0 0;padding-left:18px;">${items}</ol>`;
}

// Mode-based copy
function modeCopy(modeKey, requestType, hasEvidence = false) {
  if (modeKey === "identity") {
    return {
      heading: "Identity Theft Block Request (FCRA §605B / 15 U.S.C. §1681c-2)",
      intro: `I am a victim of identity theft. The item(s) listed below were the result of fraudulent activity and are not mine. Under FCRA §605B (15 U.S.C. §1681c-2), upon submission of an identity theft report and proper identification, you are required to block the reporting of any information that resulted from identity theft within four business days. Additionally, under FCRA §605A (15 U.S.C. §1681c-1), I am entitled to place a fraud alert on my credit file.`,
      ask: `I demand that you immediately block all information resulting from identity theft pursuant to §605B and provide me with an updated credit report within five business days. If the information cannot be verified as legitimately mine through documentation bearing my actual signature, it must be permanently removed.`,
      afterIssues: `Under FCRA §616 (15 U.S.C. §1681n), willful failure to block identity theft information entitles me to actual damages, statutory damages of $100–$1,000 per violation, punitive damages, and attorney's fees. In Philbin v. Trans Union Corp., 101 F.3d 957 (3d Cir. 1996), the court held that CRAs have an affirmative duty to maintain procedures preventing mixed files and identity confusion. Provide written confirmation of your actions within 30 days.`,
      evidence: hasEvidence
        ? `Enclosed are supporting documents: FTC Identity Theft Report (filed pursuant to 15 U.S.C. §1681c-2(a)), police report, government-issued identification, and proof of current address.`
        : ``,
    };
  }

  if (modeKey === "breach") {
    return {
      heading: "Data Breach–Related Reinvestigation Request (FCRA §607(b) / §605B / GLBA)",
      intro: `I am disputing the accuracy of the following account(s) because my personal identifiers were compromised in a documented data breach. Information reported from a compromised source cannot be verified as accurate, complete, or attributable to me. Under FCRA §607(b) (15 U.S.C. §1681e(b)), you are required to follow reasonable procedures to assure maximum possible accuracy. Under the Gramm-Leach-Bliley Act (15 U.S.C. §6801), financial institutions have a duty to safeguard consumer information. When a breach has occurred, the presumption of accuracy is undermined, and heightened verification is required.`,
      ask: requestType === "delete"
        ? `I demand that you delete or block this account if it cannot be independently verified as 100% accurate and legitimately mine through documentation unaffected by the breach. Under FCRA §605B, information resulting from identity theft facilitated by a data breach must be blocked upon request.`
        : `I demand that you conduct a thorough reinvestigation, contact the original furnisher for primary source documentation, and correct any information that cannot be verified with maximum possible accuracy. Provide me with an updated credit report reflecting any corrections.`,
      afterIssues: `Please document the method of verification per FCRA §611(a)(7), including the name and contact information of any furnisher relied upon. In FTC v. Wyndham Worldwide Corp., 799 F.3d 236 (3d Cir. 2015), the court confirmed that financial institutions have enforceable duties to safeguard consumer data under GLBA. Provide your written results within 30 days as required by FCRA §611(a)(1).`,
      evidence: hasEvidence
        ? `Enclosed are supporting documents: data breach notification letter, FTC Identity Theft Report, government-issued identification, and proof of current address.`
        : ``,
    };
  }

  if (modeKey === "assault") {
    return {
      heading: "Safety & Confidentiality Handling – Special Circumstances (FCRA §605A)",
      intro: `Due to documented safety concerns, I am requesting special handling of the information below to ensure my privacy and security. Under FCRA §605A (15 U.S.C. §1681c-1), I am entitled to place an extended fraud alert or active duty alert to protect my credit file. I am also requesting that my address and contact information be treated as confidential to prevent disclosure that could endanger my safety.`,
      ask: requestType === "delete"
        ? `If the information cannot be verified with certainty through documentation bearing my actual signature, please remove it immediately. Any account opened through fraud or coercion must be blocked under §605B.`
        : `If the information is inaccurate or incomplete, please correct it. Do not disclose sensitive personal contact details in any correspondence or to any third parties.`,
      afterIssues: `Please restrict access to my file and apply any available protective measures. Provide written confirmation of actions taken. Failure to protect my information may constitute negligence under state and federal law.`,
      evidence: hasEvidence
        ? `Enclosed are supporting documents: restraining order, law enforcement letter, or other evidence of safety concerns, along with government-issued identification.`
        : ``,
    };
  }

  // Default fallback
  return {
    heading: requestType === "delete"
      ? "Request for Deletion of Inaccurate/Unverifiable Information (FCRA §611)"
      : "Request for Correction of Inaccurate/Incomplete Information (FCRA §611)",
    intro: `I am disputing the reporting of the tradeline below because it is inaccurate, incomplete, or unverifiable. Under FCRA §611(a)(1)(A) (15 U.S.C. §1681i(a)(1)(A)), upon receiving notice of a consumer dispute, you must conduct a reasonable reinvestigation to determine whether the disputed information is inaccurate and record the current status, or delete the item, within 30 days. Under FCRA §1681e(b), you must follow reasonable procedures to assure maximum possible accuracy of the information in consumer reports.`,
    ask: requestType === "delete"
      ? "I demand deletion of this inaccurate or unverifiable information pursuant to FCRA §611(a)(5)(A). If the information cannot be verified through independent documentation from the original creditor, it must be promptly removed from my credit file and you must notify the furnisher of the deletion."
      : "I demand correction of the inaccurate or incomplete reporting pursuant to FCRA §611(a)(5)(A). Please investigate, correct the disputed entries, and provide the method of verification as required by §611(a)(7).",
    afterIssues: `Provide your investigation results in writing within 30 days as required by FCRA §611(a)(1). I reserve all rights under FCRA §616 (willful noncompliance, providing statutory damages of $100–$1,000 per violation, punitive damages, and attorney's fees) and §617 (negligent noncompliance, providing actual damages).`,
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
    ? `<ol class="ocr" style="margin:0;padding-left:18px;"><li style="margin-bottom:12px;"><strong>${safe(manualReason)}</strong></li></ol>`
    : buildViolationListHTML(tl.violations, selectedViolationIdxs);

  if (template && template.english) {
    const accountNum = tl.per_bureau?.[bureau]?.account_number
      || tl.meta?.account_numbers?.[bureau]
      || tl.meta?.account_number
      || '****';
    const creditorName = tl.meta?.creditor || 'Unknown';
    const prevDate = previousDisputeDate || 'a prior date';
    const allDates = Array.isArray(priorDates) && priorDates.length ? priorDates.join(', ') : prevDate;
    const violationSummary = (tl.violations || []).slice(0, 2).map(v => v.title || v.category || v.detail || '').filter(Boolean).join('; ') || 'inaccurate or unverifiable information';
    const personalized = template.english
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
      .replace(/\[Amount\]/g, '[SETTLEMENT AMOUNT]')
      .replace(/\[number\]/g, '[NUMBER OF CALLS]')
      .replace(/\[time period\]/g, '[TIME PERIOD]')
      .replace(/\[brief explanation[^\]]*\]/gi, '[CIRCUMSTANCES]')
      .replace(/\[List\]/g, '[SEE ATTACHED]')
      .replace(/\[Arbitration Forum[^\]]*\]/gi, 'AAA or JAMS');

    const lines = personalized.split('\n');
    const bodyHtml = lines.map(l => l.trim() === '' ? '<br>' : `<p class="ocr">${colorize(l)}</p>`).join('\n');

    const letterBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${bureau} – ${safe(template.name)}</title>
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

  ${buildCaseLawSection(template.id in TEMPLATE_CASE_LAW_MAP ? TEMPLATE_CASE_LAW_MAP[template.id] : ['accuracy'])}

  <p style="margin-top:24px;">Please provide the method of verification, including the name and contact information of any furnisher relied upon. If you cannot verify the information with maximum possible accuracy, delete the item and send me an updated report.</p>
  <div class="sig-block">
    <p>Sincerely,<br>${safe(consumer.name)}</p>
  </div>
  ${opts._enclosuresHtml || ''}
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
  <title>${bureau} – ${mc.heading}</title>
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

  ${buildCaseLawSection(MODE_CASE_LAW_MAP[modeKey] || ['accuracy', 'reinvestigation'])}

  <p style="margin-top:24px;">${verifyLine}</p>
  <div class="sig-block">
    <p>${signOff}</p>
  </div>
  ${opts._enclosuresHtml || ''}
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
      ${[consumer.city, consumer.state, consumer.zip].filter(Boolean).join(', ') || ''}<br>
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

function buildLetterTemplate({ title, bodyHtml, consumer, headerData }) {
  const dateStr = todayISO();
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
  const bodyHtml = `
  <h1>${colorize("Debt Validation Request")}</h1>
  <p>${colorize("Please provide validation of the debt you allege is owed. Until validation is provided, cease all collection activities and communication with me regarding this account.")}</p>
  <p>${colorize("Sincerely,")}<br>${colorize(safe(consumer.name))}</p>
  `;

  const letterBody = buildLetterTemplate({
    title: `${safe(collector.name)} – Collection Notice`,
    bodyHtml,
    consumer,
    headerData: collector,
  });

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

function buildEnclosuresHtml(enclosures) {
  if (!enclosures || !enclosures.length) return '';
  const items = enclosures.map(e => `<li>${safe(e.label)}</li>`).join('');
  return `<div class="enclosures"><strong>Enclosures:</strong><ul style="margin:4px 0 0;padding-left:18px;">${items}</ul></div>`;
}

function generateLetters({ report, selections, consumer, requestType = "correct", templates = [], playbooks = {}, previousDisputeDate, priorDates, enclosures }) {
  const SPECIAL_ONE_BUREAU = new Set(["identity", "breach", "assault"]);
  const letters = [];
  const templateMap = Object.fromEntries((LETTER_TEMPLATES || []).map(t => [t.id, t]));
  for (const t of (templates || [])) {
    templateMap[t.id] = t;
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

        const tpl = sel.templateId ? templateMap[sel.templateId] : null;
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

