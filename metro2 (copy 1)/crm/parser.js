// parser.js
//
// Usage (browser):
//   const { tradelines } = parseCreditReportHTML(document);
//   // or: parseCreditReportHTML(new DOMParser().parseFromString(html, "text/html"));
//
// Usage (Node + jsdom):
//   import { JSDOM } from "jsdom";
//   const dom = new JSDOM(html);
//   const { tradelines } = parseCreditReportHTML(dom.window.document);

function parseCreditReportHTML(doc) {
  const results = { tradelines: [] };

  // The report can have multiple tradeline blocks. Each block looks like the one you pasted.
  // We select by the table class used for the comparison area and walk up to a container.
  const tlTables = Array.from(
    doc.querySelectorAll("table.rpt_content_table.rpt_content_header.rpt_table4column")
  );

  // If no tables found, bail early.
  if (!tlTables.length) return results;

  for (const table of tlTables) {
    const container = table.closest("td.ng-binding, ng-include, body") || table.parentElement;

    const tl = {
      meta: { creditor: null },
      per_bureau: {
        TransUnion: {},
        Experian: {},
        Equifax: {},
      },
      // optional: violations can be filled later by your engine
      violations: [],
      // include parsed history
      history: { TransUnion: [], Experian: [], Equifax: [] },
      history_summary: {}, // quick counts per bureau
    };

    // ---- A) Creditor (header above the table) ----
    const creditorEl = container.querySelector("div.sub_header");
    tl.meta.creditor = text(creditorEl) || "Unknown";

    // ---- B) Bureau order from the header row ----
    const trs = rows(table);
    const headerThs = trs.length ? Array.from(trs[0].querySelectorAll("th")).slice(1) : [];
    const bureauOrder = headerThs.map((th) => normalizeBureau(text(th))).filter(Boolean);

    // Map "column index" -> bureau key
    // Example: ["TransUnion","Experian","Equifax"]
    // We will use this to place each <td.info> into tl.per_bureau[bureau]
    // starting from col 0 = first bureau after label.
    // Note: if some bureaus are hidden (ng-show=false), header text should still reflect order.
    // Fallback to ALL if header missing (conservative).
    const ALL = ["TransUnion", "Experian", "Equifax"];
    const bureaus = bureauOrder.length ? bureauOrder : ALL;

    // ---- C) Row label → field(s) rules ----
    // Each key is the *visual* left label from the HTML.
    // The value declares which field(s) to populate and how to render (single or combined).
    const rowRules = [
      // exact label, fields (single)
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
      rule("Date Last Payment", ["date_last_payment"]),
      rule("Date Last Active", ["date_last_active"]),
      rule("No. of Months (terms)", ["months_terms"]),

      // combined rows present in some templates
      rule("Account Status / Payment Status", ["account_status", "payment_status"], "combined"),
      rule("Balance / Past Due", ["balance", "past_due"], "combined"),
      rule("Credit Limit / High Credit", ["credit_limit", "high_credit"], "combined"),
      rule("Dates", ["date_opened", "last_reported", "date_last_payment"], "combined"),

      // comments (special handling)
      rule("Comments", ["comments"], "comments"),
    ];

    // ---- D) Walk data rows ----
    for (let i = 1; i < trs.length; i++) {
      const tr = trs[i];
      const label = text(tr.querySelector("td.label")).replace(/:\s*$/, "");

      const ruleDef = matchRule(rowRules, label);
      if (!ruleDef) continue;

      const infoTds = Array.from(tr.querySelectorAll("td.info"));
      // normalize over bureau count; if fewer tds, pad with nulls
      while (infoTds.length < bureaus.length) infoTds.push(null);

      infoTds.forEach((td, idx) => {
        const bureau = bureaus[idx];
        if (!bureau) return;

        // prepare pb record
        const pb = tl.per_bureau[bureau] || (tl.per_bureau[bureau] = {});
        if (!td) return;

        if (ruleDef.kind === "comments") {
          const remarks = extractComments(td);
          if (remarks.length) {
            // store array and also a joined string for convenience
            pb.comments = remarks;
            pb.comments_raw = remarks.slice(); // original lines
          } else if (!pb.comments) {
            pb.comments = []; // keep array semantics
          }
          return;
        }

        if (ruleDef.kind === "combined") {
          // Combined cells sometimes have child elements instead of explicit separators.
          // Gather each sub-value and map them to their respective fields.
          const parts = cellParts(td, ruleDef.fields.length);
          ruleDef.fields.forEach((field, j) => {
            const raw = (parts[j] || "").trim();
            setField(pb, field, raw);
          });
        } else {
          // single-field row
          const raw = cellText(td);
          setField(pb, ruleDef.fields[0], raw);
        }
      });
    }

    // ---- E) Payment history table ----
    const histTable = container.querySelector("table.addr_hsrty");
    if (histTable) {
      const hist = parseHistoryTable(histTable);
      tl.history = hist.byBureau;
      tl.history_summary = hist.summary;
    }

    // Push this tradeline
    results.tradelines.push(tl);
  }

  return results;

  // ---------- helpers ----------

  function rows(table) {
    const bodyRows = table.querySelectorAll("tbody > tr");
    return bodyRows.length ? Array.from(bodyRows) : Array.from(table.querySelectorAll("tr"));
  }

  function text(el) {
    return (el && (el.textContent || "").replace(/\s+/g, " ").trim()) || "";
  }

  function cellText(td) {
    if (!td) return "";
    // Comments can contain multiple divs; for non-comments row,
    // we still gather all strings to be resilient.
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
    if (t.includes("transunion")) return "TransUnion";
    if (t.includes("experian")) return "Experian";
    if (t.includes("equifax")) return "Equifax";
    return null;
  }

  function rule(label, fields, kind = "single") {
    return { label, fields, kind };
  }

  function matchRule(rules, label) {
    // exact first
    let r = rules.find((x) => x.label === label);
    if (r) return r;

    // loose fallbacks (in case the source uses minor variants/spaces)
    const L = label.toLowerCase().replace(/\s+/g, " ").trim();
    return rules.find((x) => x.label.toLowerCase().replace(/\s+/g, " ").trim() === L) || null;
  }

  function extractComments(td) {
    // multiple remarks are in <div> children; fallback to td text if empty
    const divs = Array.from(td.querySelectorAll("div"));
    const lines = divs.map((d) => text(d)).filter(Boolean);
    if (lines.length) return uniq(lines);

    const raw = cellText(td);
    if (!raw) return [];
    // If combined with \u00a0 we split on two+ spaces or " • " etc.
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
    pb[`${field}_raw`] = raw || "";
    pb[field] = normalized;
  }

  function normalizeFieldValue(field, raw) {
    const v = (raw || "").trim();
    if (!v) return "";

    // money fields
    if (["balance", "credit_limit", "high_credit", "past_due", "monthly_payment"].includes(field)) {
      const num = parseMoneyToNumber(v);
      // keep formatted like "$1,234.00" if we could parse; else keep as-is
      return isFinite(num) ? formatMoney(num) : v;
    }

    // dates -> keep "MM/DD/YYYY" if already in that form; otherwise try to coerce
    if (
      ["date_opened", "last_reported", "date_last_payment", "date_last_active"].includes(field)
    ) {
      const d = coerceDateMDY(v);
      return d || v;
    }

    // months_terms -> numeric if possible
    if (field === "months_terms") {
      const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
      return Number.isFinite(n) ? String(n) : v;
    }

    // Everything else: return as-is
    return v;
  }

  function parseMoneyToNumber(s) {
    // accepts "$202.00", "202", "0", "$0.00"
    const m = (s || "").replace(/[^0-9.-]/g, "");
    const n = parseFloat(m);
    return Number.isFinite(n) ? n : NaN;
  }

  function formatMoney(n) {
    // always 2 decimals, US style with commas
    try {
      return n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });
    } catch {
      // simple fallback
      const fixed = n.toFixed(2);
      return `$${fixed}`;
    }
  }

  function coerceDateMDY(s) {
    // if already looks like MM/DD/YYYY, return it
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;

    // try to parse and output as MM/DD/YYYY
    const d = new Date(s);
    if (isNaN(+d)) return "";

    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
    // (If you need to keep original, it's in *_raw)
  }

  // smart split for combined cells like "X / Y" or "Opened: A | Last Reported: B | Last Payment: C"
  function smartSplit(val, expectedParts) {
    if (!val) return Array(expectedParts).fill("");

    // Try pipe with labels first
    // "Opened: 05/01/2025 | Last Reported: 08/19/2025 | Last Payment: 07/03/2025"
    let byPipe = val.split("|").map((s) => s.trim());
    if (byPipe.length >= expectedParts) {
      return byPipe.map((part) => part.replace(/^[A-Za-z ]+:\s*/, ""));
    }

    // Then try slash
    let bySlash = val.split("/").map((s) => s.trim());
    if (bySlash.length >= expectedParts) return bySlash;

    // Then try splitting on multiple spaces (often used when values are in separate spans)
    let bySpace = val.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    if (bySpace.length >= expectedParts) return bySpace;

    // Finally, split on single spaces as a last resort if multiple numeric pieces are glued
    let bySingle = val.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    if (bySingle.length >= expectedParts) return bySingle;

    // Fallback: return the whole value in the first field
    const arr = Array(expectedParts).fill("");
    arr[0] = val.trim();
    return arr;
  }

  // ---- Payment history parsing ----
  function parseHistoryTable(hTable) {
    const trs = rows(hTable);
    if (trs.length < 2) return { byBureau: {}, summary: {} };

    // Months row = first row (labels)
    const months = Array.from(trs[0].querySelectorAll("td.info")).map((td) => {
      const lg = td.querySelector("span.lg-view");
      return text(lg) || text(td);
    });

    // Years row = second row (two-digit years)
    const years = Array.from(trs[1].querySelectorAll("td.info")).map((td) => text(td));
    const labels = months.map((m, i) => `${m} ’${years[i] || ""}`.trim());

    const byBureau = {
      TransUnion: [],
      Experian: [],
      Equifax: [],
    };
    const summary = {};

    // Subsequent rows: per-bureau statuses
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
        return {
          col: labels[idx] || `col_${idx}`,
          status_class: cls,   // e.g. hstry-ok, hstry-unknown
          status_text: txt,    // often "OK" or ""
        };
      });

      byBureau[bureau] = statuses;

      // quick counts
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
}

export { parseCreditReportHTML };

