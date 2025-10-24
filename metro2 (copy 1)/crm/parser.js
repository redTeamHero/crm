// Unified parser that defers to metro2-core while preserving legacy shapes.
//
// Usage (browser):
//   const { tradelines, inquiries } = parseCreditReportHTML(document);
//
// Usage (Node with jsdom):
//   import { JSDOM } from 'jsdom';
//   import parseCreditReportHTML from './parser.js';
//   const dom = new JSDOM(html);
//   const { tradelines, inquiries, inquiry_summary } = parseCreditReportHTML(dom.window.document);

import {
  parseReport as parseMetro2Report,
  emptyHistory,
} from "../../packages/metro2-core/src/index.js";

const ALL_BUREAUS = ["TransUnion", "Experian", "Equifax"];

function parseCreditReportHTML(doc) {
  const parsed = parseMetro2Report(doc) || {};
  const tradelines = Array.isArray(parsed.tradelines) ? parsed.tradelines : [];
  const inquiries = Array.isArray(parsed.inquiries) ? parsed.inquiries : [];
  const history = parsed.history ?? emptyHistory();
  const inquiryDetails = Array.isArray(parsed.inquiry_details) && parsed.inquiry_details.length
    ? parsed.inquiry_details
    : buildInquiryDetails(inquiries);
  const inquirySummary = parsed.inquiry_summary ?? summarizeInquiries(inquiries);
  const accountHistory = Array.isArray(parsed.account_history) ? parsed.account_history : [];
  const personalInformation = parsed.personal_information ?? {};
  const creditScores = parsed.credit_scores ?? {};
  const creditorContacts = Array.isArray(parsed.creditor_contacts) ? parsed.creditor_contacts : [];

  const result = {
    ...parsed,
    tradelines,
    inquiries,
    history,
    account_history: accountHistory,
    inquiry_details: inquiryDetails,
    inquiry_summary: inquirySummary,
    personal_information: personalInformation,
    credit_scores: creditScores,
    creditor_contacts: creditorContacts,
  };

  const personalInfo = convertPersonalInfo(personalInformation);
  if (personalInfo) {
    result.personalInfo = personalInfo;
  }

  return result;
}

function buildInquiryDetails(inquiries) {
  return (inquiries || []).map((inquiry) => ({
    creditor_name: inquiry.creditor || inquiry.raw?.creditor || "",
    type_of_business: inquiry.industry || inquiry.raw?.industry || "",
    date_of_inquiry: inquiry.date || inquiry.raw?.date || "",
    credit_bureau: inquiry.bureau || inquiry.raw?.bureau || "",
  }));
}

function summarizeInquiries(inqs = []) {
  const summary = {
    byBureau: { TransUnion: 0, Experian: 0, Equifax: 0 },
    total: inqs.length,
    last12mo: 0,
    last24mo: 0,
  };

  const now = Date.now();
  const MS_12MO = 365 * 24 * 60 * 60 * 1000;
  const MS_24MO = 2 * MS_12MO;

  for (const q of inqs) {
    if (q?.bureau && summary.byBureau[q.bureau] != null) {
      summary.byBureau[q.bureau] += 1;
    }
    const d = new Date(q?.date || q?.raw?.date);
    if (!Number.isNaN(+d)) {
      const delta = now - +d;
      if (delta <= MS_12MO) summary.last12mo += 1;
      if (delta <= MS_24MO) summary.last24mo += 1;
    }
  }

  return summary;
}

function normalizePersonalField(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeBureauName(value) {
  const t = String(value || "").toLowerCase();
  if (!t) return null;
  if (/transunion|\btu\b|\btuc\b/.test(t)) return "TransUnion";
  if (/experian|\bexp\b/.test(t)) return "Experian";
  if (/equifax|\beqf\b|\beqx\b/.test(t)) return "Equifax";
  return null;
}

function formatPersonalValue(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const parts = value.map((v) => String(v ?? "").trim()).filter(Boolean);
    return parts.length ? parts : null;
  }
  if (typeof value === "object") {
    const parts = Object.values(value)
      .map((v) => String(v ?? "").trim())
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
    : String(candidate || "")
        .split(/\n|,/)
        .map((part) => part.trim())
        .filter(Boolean);
  if (!lines.length) return next;
  const [line1, line2] = lines;
  if (line1 && !next.addr1) next.addr1 = line1;
  if (line2 && !next.addr2) next.addr2 = line2;
  const combined = lines.join(", ");
  if (!next.raw) next.raw = combined;
  const locationMatch = combined.match(/([A-Za-z\.\s]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/);
  if (locationMatch) {
    const city = locationMatch[1].replace(/,$/, "").trim();
    if (city && !next.city) next.city = city;
    if (!next.state) next.state = locationMatch[2];
    if (!next.zip) next.zip = locationMatch[3];
  }
  return next;
}

function assignPersonalAliases(info, key, value) {
  const display = Array.isArray(value) ? value.join(", ") : value;
  const lower = key.toLowerCase();
  if (!info.name && lower.includes("name")) {
    info.name = Array.isArray(value) ? value[0] || display : display;
  }
  if (!info.dob && (lower === "dob" || lower.includes("birth"))) {
    info.dob = display;
  }
  if (lower.includes("address")) {
    info.address = mergeAddress(info.address, value);
  }
}

function normalizePersonalInfoEntry(entry) {
  if (!entry || typeof entry !== "object") {
    const formatted = formatPersonalValue(entry);
    if (!formatted) return {};
    const display = Array.isArray(formatted) ? formatted.join(", ") : formatted;
    return display ? { raw: display } : {};
  }
  const result = {};
  for (const [field, value] of Object.entries(entry)) {
    const normalizedKey = normalizePersonalField(field);
    const formatted = formatPersonalValue(value);
    if (!formatted) continue;
    const display = Array.isArray(formatted) ? formatted.join(", ") : formatted;
    result[normalizedKey] = display;
    assignPersonalAliases(result, normalizedKey, formatted);
  }
  return result;
}

function convertPersonalInfo(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const bureaus = {};
    raw.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      Object.entries(entry).forEach(([field, values]) => {
        if (!values || typeof values !== "object") return;
        Object.entries(values).forEach(([bureauKey, value]) => {
          const bureau = normalizeBureauName(bureauKey);
          if (!bureau) return;
          const formatted = formatPersonalValue(value);
          if (!formatted) return;
          const key = normalizePersonalField(field);
          bureaus[bureau] = bureaus[bureau] || {};
          const display = Array.isArray(formatted) ? formatted.join(", ") : formatted;
          bureaus[bureau][key] = display;
          assignPersonalAliases(bureaus[bureau], key, formatted);
        });
      });
    });
    const filtered = Object.fromEntries(
      Object.entries(bureaus).filter(([, info]) => info && Object.keys(info).length),
    );
    return Object.keys(filtered).length ? filtered : null;
  }
  if (typeof raw === "object") {
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
    ALL_BUREAUS.forEach((bureau) => {
      replicated[bureau] = { ...normalized };
    });
    return replicated;
  }
  return null;
}

export { parseCreditReportHTML };
export default parseCreditReportHTML;
