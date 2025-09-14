import * as cheerio from "cheerio";
import { buildTradeline, parseHistory, parseInquiries } from "../../metro2-core/src/index.js";

export function parseReport(html){
  const $ = cheerio.load(html);
  const tradelines = [];

  $("table.rpt_content_table.rpt_content_header.rpt_table4column").each((_,table)=>{
    const bureaus = $("th", table).slice(1).map((i,th)=>$(th).text().trim()).get();
    const rows = $("tr", table).slice(1).map((_,row)=>({
      label: $("td.label",row).text().trim(),
      values: $("td.info",row).map((i,td)=>$(td).text().trim()).get()
    })).get();
    const tl = buildTradeline(bureaus, rows);
    tradelines.push(tl);
  });
  return { tradelines, history: parseHistory(), inquiries: parseInquiries() };
}
