import { buildTradeline, parseHistory, parseInquiries } from "../../metro2-core/src/index.js";

export function parseReport(doc){
  const tradelines = [];
  doc.querySelectorAll("table.rpt_content_table.rpt_content_header.rpt_table4column").forEach(table=>{
    const headers = Array.from(table.querySelectorAll("th")).slice(1).map(th=>th.textContent.trim());
    const rows = Array.from(table.querySelectorAll("tr")).slice(1).map(tr=>({
      label: tr.querySelector("td.label")?.textContent.trim() || "",
      values: Array.from(tr.querySelectorAll("td.info")).map(td=>td.textContent.trim())
    }));
    tradelines.push(buildTradeline(headers, rows));
  });
  return { tradelines, history: parseHistory(), inquiries: parseInquiries() };
}
=