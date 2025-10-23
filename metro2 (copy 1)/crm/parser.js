// parser.js
//
// Usage (browser):
//   const { tradelines, inquiries } = parseCreditReportHTML(document);
//   // or: parseCreditReportHTML(new DOMParser().parseFromString(html, "text/html"));
//
// Usage (Node with jsdom):
//   import { JSDOM } from 'jsdom';
//   import parseCreditReportHTML from './parser.js';
//   const dom = new JSDOM(html);
//   const { tradelines, inquiries, inquiry_summary } = parseCreditReportHTML(dom.window.document);

import { parseReport as parseMetro2Report } from "../../packages/metro2-core/src/index.js";

const DEFAULT_CREDITOR_NAME = 'Unknown Creditor';
const ALL_BUREAUS = ['TransUnion', 'Experian', 'Equifax'];

function parseCreditReportHTML(doc) {
  const results = { tradelines: [], inquiries: [], inquiry_summary: {} };
  const NON_CREDITOR_HEADERS = new Set(["risk factors"]);

  // ---- Locate all tradeline comparison tables ----
  const tlTables = Array.from(
    doc.querySelectorAll("table.rpt_content_table.rpt_content_header.rpt_table4column")
  );

  // Parse each tradeline table block
  for (const table of tlTables) {
    let container = table.closest("td.ng-binding");
    if (!container) {
      const ngInclude = table.closest("ng-include");
      container =
        (ngInclude && ngInclude.parentElement) ||
        table.closest("td") ||
        table.parentElement;
    }

    const tl = {
      meta: { creditor: null },
      per_bureau: {
        TransUnion: {},
        Experian: {},
        Equifax: {},
      },
      violations: [],
      history: { TransUnion: [], Experian: [], Equifax: [] },
      history_summary: {},
    };

    // ---- A) Creditor (header above the table) ----
    const creditorEl = container.querySelector("div.sub_header");
    const creditorName = (text(creditorEl) || "").trim();
    if (NON_CREDITOR_HEADERS.has(creditorName.toLowerCase())) {
      continue; // skip non-creditor sections like "Risk Factors"
    }
    tl.meta.creditor = creditorName || DEFAULT_CREDITOR_NAME;

    // ---- B) Bureau order from the header row ----
    const trs = rows(table);
    const headerThs = trs.length ? Array.from(trs[0].querySelectorAll("th")).slice(1) : [];
    const bureauOrder = headerThs.map((th) => normalizeBureau(text(th))).filter(Boolean);

    const ALL = ["TransUnion", "Experian", "Equifax"]; // fallback order
    const bureaus = bureauOrder.length ? bureauOrder : ALL;

    // ---- C) Row label → field(s) rules ----
    const rowRules = [
      // single-field rows
      rule("Account #", ["account_number"]),
      rule("Account Type", ["account_type"]),
      rule("Account Type - Detail", ["account_type_detail"]),
      rule("Bureau Code", ["bureau_code"]),
      rule("Account Status", ["account_status"]),
      rule("Payment Status", ["payment_status"]),
      rule("Monthly Payment", ["monthly_payment"]),
      rule("Balance", ["balance"]),
      rule("Credit Limit", ["credit_limit"]),
      rule("High Credit", ["high_credit"]),
      rule("Past Due", ["past_due"]),
      rule("Date Opened", ["date_opened"]),
      rule("Last Reported", ["last_reported"]),
      rule(/(Date\s*of\s*)?Last Payment(?:\s*Date)?/i, ["date_last_payment"]),
      rule("Date Last Active", ["date_last_active"]),
      rule("Date Closed", ["date_closed"]),
      rule(/Date(?: of)? First Delinquency/i, ["date_first_delinquency"]),
      rule("No. of Months (terms)", ["months_terms"]),

      // combined rows
      rule("Account Status / Payment Status", ["account_status", "payment_status"], "combined"),
      rule("Balance / Past Due", ["balance", "past_due"], "combined"),
      rule("Credit Limit / High Credit", ["credit_limit", "high_credit"], "combined"),
      rule(
        "Dates",
        ["date_opened", "last_reported", "date_last_payment", "date_first_delinquency"],
        "combined"
      ),

      // comments row
      rule("Comments", ["comments"], "comments"),
    ];

    // ---- D) Walk data rows ----
    for (let i = 1; i < trs.length; i++) {
      const tr = trs[i];
      const label = text(tr.querySelector("td.label")).replace(/:\s*$/, "");
      const ruleDef = matchRule(rowRules, label);
      if (!ruleDef) continue;

      const infoTds = Array.from(tr.querySelectorAll("td.info"));
      // ensure we have a cell for each bureau column
      while (infoTds.length < bureaus.length) infoTds.push(null);

      infoTds.forEach((td, idx) => {
        const bureau = bureaus[idx];
        if (!bureau) return;

        const pb = tl.per_bureau[bureau] || (tl.per_bureau[bureau] = {});
        if (!td) return;

        if (ruleDef.kind === "comments") {
          const remarks = extractComments(td);
          if (remarks.length) {
            pb.comments = remarks; // store as array
            ensureRaw(pb);
            pb.raw.comments = remarks.slice(); // original lines
          } else if (!pb.comments) {
            pb.comments = [];
          }
          return;
        }

        if (ruleDef.kind === "combined") {
          const parts = cellParts(td, ruleDef.fields.length);
          ruleDef.fields.forEach((field, j) => {
            const raw = (parts[j] || "").trim();
            setField(pb, field, raw);
          });
        } else {
          const raw = cellText(td);
          setField(pb, ruleDef.fields[0], raw);
        }
      });
    }

    // ---- E) Payment history table ----
    let histTable = container.querySelector("table.addr_hsrty") ||
      findFollowing(container, "table.addr_hsrty");
    if (histTable) {
      const hist = parseHistoryTable(histTable);
      tl.history = hist.byBureau;
      tl.history_summary = hist.summary;
    }

    const hasData = Object.values(tl.per_bureau).some((pb) => Object.keys(pb).length);
    if (hasData) {
      results.tradelines.push(tl);
    }
  }

  // ---- F) Inquiries (hard pulls) ----
  const inqs = parseInquiries(doc);
  results.inquiries = inqs;
  results.inquiry_summary = summarizeInquiries(inqs);
  results.inquiry_details = inqs.map(inquiry => ({
    creditor_name: inquiry.creditor || '',
    type_of_business: inquiry.industry || '',
    date_of_inquiry: inquiry.date || inquiry.raw?.date || '',
    credit_bureau: inquiry.bureau || inquiry.raw?.bureau || '',
  }));

  try {
    const parsedExtras = parseMetro2Report(doc);
    if (parsedExtras && parsedExtras.personal_information) {
      const normalized = convertPersonalInfo(parsedExtras.personal_information);
      if (normalized) {
        results.personalInfo = normalized;
        results.personal_information = parsedExtras.personal_information;
      }
    }
    if (parsedExtras && parsedExtras.credit_scores && !results.credit_scores) {
      results.credit_scores = parsedExtras.credit_scores;
    }
    if (Array.isArray(parsedExtras?.account_history) && parsedExtras.account_history.length) {
      results.account_history = parsedExtras.account_history;
    }
    if (Array.isArray(parsedExtras?.inquiry_details) && parsedExtras.inquiry_details.length && !results.inquiry_details.length) {
      results.inquiry_details = parsedExtras.inquiry_details;
    }
    if (Array.isArray(parsedExtras?.inquiries) && !results.inquiries.length) {
      results.inquiries = parsedExtras.inquiries;
      results.inquiry_summary = parsedExtras.inquiry_summary || summarizeInquiries(results.inquiries);
      results.inquiry_details = parsedExtras.inquiry_details || results.inquiry_details;
    }
  } catch {
    // Ignore metro2-core parse errors and fall back to the lightweight parser output.
  }

  return results;

  // ---------- helpers ----------

  function rows(table) {
    const bodyRows = table.querySelectorAll("tbody > tr");
    return bodyRows.length ? Array.from(bodyRows) : Array.from(table.querySelectorAll("tr"));
  }

  function findFollowing(el, selector) {
    let cur = el;
    while (cur && cur !== doc.body) {
      let sib = cur.nextElementSibling;
      while (sib) {
        if (sib.matches && sib.matches(selector)) return sib;
        if (sib.matches && sib.matches("table.rpt_content_table.rpt_content_header.rpt_table4column")) return null;
        sib = sib.nextElementSibling;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function text(el) {
    return (el && (el.textContent || "").replace(/\s+/g, " ").trim()) || "";
  }

  function cellText(td) {
    if (!td) return "";
    const parts = [];
    td.querySelectorAll("*").forEach((n) => {
      if (n.childElementCount === 0) {
        const s = (n.textContent || "").trim();
        if (s) parts.push(s);
      }
    });
    if (!parts.length) {
      const base = (td.textContent || "").trim();
      if (base) parts.push(base);
    }
    const joined = parts.join(" ").replace(/\s+/g, " ").trim();
    return joined;
  }

  // For combined cells, try to extract multiple values from child nodes
  function cellParts(td, expectedParts) {
    if (!td) return Array(expectedParts).fill("");

    const nodes = Array.from(td.childNodes).filter((n) => {
      if (n.nodeType === 3) return Boolean((n.textContent || "").trim());
      if (n.nodeType === 1) return Boolean((n.textContent || "").trim());
      return false;
    });
    const texts = nodes.map((n) => (n.textContent || "").trim()).filter(Boolean);
    if (texts.length >= expectedParts) {
      return texts.slice(0, expectedParts);
    }

    // Fallback to smart splitting of the joined text
    return smartSplit(texts.join(" "), expectedParts);
  }

  function normalizeBureau(s) {
    const t = (s || "").toLowerCase();
    if (/\b(transunion|tu|tuc)\b/.test(t)) return "TransUnion";
    if (/\b(experian|exp)\b/.test(t)) return "Experian";
    if (/\b(equifax|eqf|eqx)\b/.test(t)) return "Equifax";
    return null;
  }

  function rule(label, fields, kind = "single") {
    return { label, fields, kind };
  }

  function matchRule(rules, label) {
    // exact string match first
    let r = rules.find((x) => typeof x.label === "string" && x.label === label);
    if (r) return r;

    // regex match
    r = rules.find((x) => x.label instanceof RegExp && x.label.test(label));
    if (r) return r;

    // loose fallbacks for string labels (trim spaces, case-insensitive)
    const L = label.toLowerCase().replace(/\s+/g, " ").trim();
    return (
      rules.find(
        (x) =>
          typeof x.label === "string" &&
          x.label.toLowerCase().replace(/\s+/g, " ").trim() === L
      ) || null
    );
  }

  function extractComments(td) {
    // multiple remarks are in <div> children; fallback to td text if empty
    const divs = Array.from(td.querySelectorAll("div"));
    const lines = divs.map((d) => text(d)).filter(Boolean);
    if (lines.length) return uniq(lines);

    const raw = cellText(td);
    if (!raw) return [];
    // split on 2+ spaces, bullet dots, or double non-breaking spaces
    return uniq(
      raw
        .split(/\s{2,}|•|\u00A0{2,}/)
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }

  function uniq(arr) {
    return Array.from(new Set(arr));
  }

  function setField(pb, field, raw) {
    const normalized = normalizeFieldValue(field, raw);
    ensureRaw(pb);
    const val = raw || "";
    pb.raw[field] = val;
    Object.defineProperty(pb, `${field}_raw`, {
      value: val,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    pb[field] = normalized;
  }

  function ensureRaw(pb) {
    if (!pb.raw) {
      Object.defineProperty(pb, "raw", { value: {}, enumerable: false, configurable: true });
    }
  }

  function normalizeFieldValue(field, raw) {
    const v = (raw || "").trim();
    if (!v) return "";

    // money fields
    if (["balance", "credit_limit", "high_credit", "past_due", "monthly_payment"].includes(field)) {
      const num = parseMoneyToNumber(v);
      return isFinite(num) ? formatMoney(num) : v;
    }

    // dates -> output as MM/DD/YYYY when possible
    if (["date_opened", "last_reported", "date_last_payment", "date_last_active", "date_closed"].includes(field)) {

      const d = coerceDateMDY(v);
      return d || v;
    }

    // months_terms -> numeric if possible
    if (field === "months_terms") {
      const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
      return Number.isFinite(n) ? String(n) : v;
    }

    // default: return trimmed text
    return v;
  }

  function parseMoneyToNumber(s) {
    const m = (s || "").replace(/[^0-9.-]/g, "");
    const n = parseFloat(m);
    return Number.isFinite(n) ? n : NaN;
  }

  function formatMoney(n) {
    try {
      return n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });
    } catch {
      const fixed = n.toFixed(2);
      return `$${fixed}`;
    }
  }

  function coerceDateMDY(s) {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    const d = new Date(s);
    if (isNaN(+d)) return "";
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  // smart split for combined cells like "X / Y" or labeled pipes
  function smartSplit(val, expectedParts) {
    if (!val) return Array(expectedParts).fill("");

    let byPipe = val.split("|").map((s) => s.trim());
    if (byPipe.length >= expectedParts) {
      return byPipe.map((part) => part.replace(/^[A-Za-z ]+:\s*/, ""));
    }

    let bySlash = val.split("/").map((s) => s.trim());
    if (bySlash.length >= expectedParts) return bySlash;

    let bySpace = val.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    if (bySpace.length >= expectedParts) return bySpace;

    let bySingle = val.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    if (bySingle.length >= expectedParts) return bySingle;

    const arr = Array(expectedParts).fill("");
    arr[0] = val.trim();
    return arr;
  }

  // ---- Payment history parsing ----
  function parseHistoryTable(hTable) {
    const trs = rows(hTable);
    if (trs.length < 2) return { byBureau: {}, summary: {} };

    // Months row
    const months = Array.from(trs[0].querySelectorAll("td.info")).map((td) => {
      const lg = td.querySelector("span.lg-view");
      return text(lg) || text(td);
    });

    // Years row (two-digit years)
    const years = Array.from(trs[1].querySelectorAll("td.info")).map((td) => text(td));
    const labels = months.map((m, i) => `${m} ’${years[i] || ""}`.trim());

    const byBureau = { TransUnion: [], Experian: [], Equifax: [] };
    const summary = {};

    for (let i = 2; i < trs.length; i++) {
      const tr = trs[i];
      const labelTd = tr.querySelector("td.label");
      if (!labelTd) continue;
      const bureau = normalizeBureau(text(labelTd));
      if (!bureau) continue;

      const cells = Array.from(tr.querySelectorAll("td.info"));
      const statuses = cells.map((td, idx) => {
        const cls = (td.getAttribute("class") || "").split(/\s+/).find((c) => c.startsWith("hstry-")) || null;
        const txt = text(td) || null;
        return { col: labels[idx] || `col_${idx}`, status_class: cls, status_text: txt };
      });

      byBureau[bureau] = statuses;

      const counts = {
        ok: statuses.filter((s) => s.status_class === "hstry-ok" || s.status_text === "OK").length,
        unknown: statuses.filter((s) => s.status_class === "hstry-unknown").length,
        late: statuses.filter((s) => /hstry-(late|derog|neg)/.test(s.status_class || "")).length,
        total: statuses.length,
      };
      summary[bureau] = counts;
    }

    return { byBureau, summary };
  }

  // ---- Inquiries parsing ----
  function parseInquiries(doc) {
    // Primary: Angular-style rows matching the user's snippet
    const byNgRepeat = Array.from(
      doc.querySelectorAll("tr[ng-repeat*='inqPartition']")
    );

    // Fallback: heuristic for 4-td rows likely representing inquiries
    const byHeuristic = Array.from(doc.querySelectorAll("tr")).filter((tr) => {
      if (tr.hasAttribute && tr.hasAttribute("ng-repeat")) return false; // avoid duplicates
      const tds = tr.querySelectorAll("td.info");
      if (tds.length !== 4) return false;
      const bureauTxt = text(tds[3]);
      const dateTxt = text(tds[2]);
      const hasBureau = /\b(transunion|experian|equifax|tu|tuc|exp|eqf)\b/i.test(bureauTxt);
      const looksLikeDate = /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateTxt) || !isNaN(+new Date(dateTxt));
      return hasBureau && looksLikeDate;
    });

    const rows = byNgRepeat.length ? byNgRepeat : byHeuristic;

    const inquiries = rows.map((tr) => {
      const tds = tr.querySelectorAll("td.info");
      if (tds.length < 4) return null;

      const creditorRaw = text(tds[0]);
      const industryRaw = text(tds[1]);
      const dateRaw = text(tds[2]);
      const bureauRaw = text(tds[3]);

      const bureau = normalizeBureau(bureauRaw) || bureauRaw || "";

      return {
        creditor: creditorRaw || "",
        industry: industryRaw || "",
        date: coerceDateMDY(dateRaw) || dateRaw || "",
        bureau,
        raw: { creditor: creditorRaw, industry: industryRaw, date: dateRaw, bureau: bureauRaw },
      };
    }).filter(Boolean);

    // newest → oldest
    inquiries.sort((a, b) => {
      const da = new Date(a.date || a.raw.date);
      const db = new Date(b.date || b.raw.date);
      if (isNaN(+da) && isNaN(+db)) return 0;
      if (isNaN(+da)) return 1;
      if (isNaN(+db)) return -1;
      return db - da;
    });

    return inquiries;
  }

  function summarizeInquiries(inqs) {
    const summary = {
      byBureau: { TransUnion: 0, Experian: 0, Equifax: 0 },
      total: inqs.length,
      last12mo: 0,
      last24mo: 0,
    };

    const now = Date.now();
    const MS_12MO = 365 * 24 * 3600 * 1000;
    const MS_24MO = 2 * MS_12MO;

    for (const q of inqs) {
      if (q.bureau && summary.byBureau[q.bureau] != null) {
        summary.byBureau[q.bureau] += 1;
      }
      const d = new Date(q.date || q.raw?.date);
      if (!isNaN(+d)) {
        const delta = now - +d;
        if (delta <= MS_12MO) summary.last12mo += 1;
        if (delta <= MS_24MO) summary.last24mo += 1;
      }
    }
    return summary;
  }

  function normalizePersonalField(label) {
    return String(label || '')
      .toLowerCase()
      .replace(/&amp;/g, '&')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function normalizeBureauName(value) {
    const t = String(value || '').toLowerCase();
    if (!t) return null;
    if (/transunion|\btu\b|\btuc\b/.test(t)) return 'TransUnion';
    if (/experian|\bexp\b/.test(t)) return 'Experian';
    if (/equifax|\beqf\b|\beqx\b/.test(t)) return 'Equifax';
    return null;
  }

  function formatPersonalValue(value) {
    if (value == null) return null;
    if (Array.isArray(value)) {
      const parts = value.map(v => String(v ?? '').trim()).filter(Boolean);
      return parts.length ? parts : null;
    }
    if (typeof value === 'object') {
      const parts = Object.values(value)
        .map(v => String(v ?? '').trim())
        .filter(Boolean);
      if (parts.length === 0) return null;
      return parts.length === 1 ? parts[0] : parts;
    }
    const str = String(value).trim();
    return str || null;
  }

  function mergeAddress(existing, candidate) {
    const next = existing ? { ...existing } : {};
    const lines = Array.isArray(candidate)
      ? candidate
      : String(candidate || '')
          .split(/\n|,/)
          .map(part => part.trim())
          .filter(Boolean);
    if (!lines.length) return next;
    const [line1, line2] = lines;
    if (line1 && !next.addr1) next.addr1 = line1;
    if (line2 && !next.addr2) next.addr2 = line2;
    const combined = lines.join(', ');
    if (!next.raw) next.raw = combined;
    const locationMatch = combined.match(/([A-Za-z\.\s]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/);
    if (locationMatch) {
      const city = locationMatch[1].replace(/,$/, '').trim();
      if (city && !next.city) next.city = city;
      if (!next.state) next.state = locationMatch[2];
      if (!next.zip) next.zip = locationMatch[3];
    }
    return next;
  }

  function assignPersonalAliases(info, key, value) {
    const display = Array.isArray(value) ? value.join(', ') : value;
    const lower = key.toLowerCase();
    if (!info.name && lower.includes('name')) {
      info.name = Array.isArray(value) ? value[0] || display : display;
    }
    if (!info.dob && (lower === 'dob' || lower.includes('birth'))) {
      info.dob = display;
    }
    if (lower.includes('address')) {
      info.address = mergeAddress(info.address, value);
    }
  }

  function normalizePersonalInfoEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      const formatted = formatPersonalValue(entry);
      if (!formatted) return {};
      const display = Array.isArray(formatted) ? formatted.join(', ') : formatted;
      return display ? { raw: display } : {};
    }
    const result = {};
    for (const [field, value] of Object.entries(entry)) {
      const normalizedKey = normalizePersonalField(field);
      const formatted = formatPersonalValue(value);
      if (!formatted) continue;
      const display = Array.isArray(formatted) ? formatted.join(', ') : formatted;
      result[normalizedKey] = display;
      assignPersonalAliases(result, normalizedKey, formatted);
    }
    return result;
  }

  function convertPersonalInfo(raw) {
    if (!raw) return null;
    if (Array.isArray(raw)) {
      const bureaus = {};
      raw.forEach(entry => {
        if (!entry || typeof entry !== 'object') return;
        Object.entries(entry).forEach(([field, values]) => {
          if (!values || typeof values !== 'object') return;
          Object.entries(values).forEach(([bureauKey, value]) => {
            const bureau = normalizeBureauName(bureauKey);
            if (!bureau) return;
            const formatted = formatPersonalValue(value);
            if (!formatted) return;
            const key = normalizePersonalField(field);
            bureaus[bureau] = bureaus[bureau] || {};
            const display = Array.isArray(formatted) ? formatted.join(', ') : formatted;
            bureaus[bureau][key] = display;
            assignPersonalAliases(bureaus[bureau], key, formatted);
          });
        });
      });
      const filtered = Object.fromEntries(
        Object.entries(bureaus).filter(([, info]) => info && Object.keys(info).length)
      );
      return Object.keys(filtered).length ? filtered : null;
    }
    if (typeof raw === 'object') {
      const entries = Object.entries(raw);
      const bureauMap = {};
      let looksLikeBureauMap = true;
      for (const [key, value] of entries) {
        const bureau = normalizeBureauName(key);
        if (!bureau) {
          looksLikeBureauMap = false;
          break;
        }
        const normalized = normalizePersonalInfoEntry(value);
        if (Object.keys(normalized).length) {
          bureauMap[bureau] = normalized;
        }
      }
      if (looksLikeBureauMap && Object.keys(bureauMap).length) {
        return bureauMap;
      }
      const normalized = normalizePersonalInfoEntry(raw);
      if (!Object.keys(normalized).length) return null;
      const replicated = {};
      ALL_BUREAUS.forEach(bureau => {
        replicated[bureau] = { ...normalized };
      });
      return replicated;
    }
    return null;
  }
}

export { parseCreditReportHTML };
export default parseCreditReportHTML;

