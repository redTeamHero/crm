import * as cheerio from "cheerio";
import fieldMap from "./fieldMap.js";
import { validateTradeline } from "./validators.js";

export function parseReport(html){
  const $ = cheerio.load(html);
  const tradelines = [];

  $("table.rpt_content_table.rpt_content_header.rpt_table4column").each((_,table)=>{
    const tl = { per_bureau:{}, violations:[] };
    const bureaus = $("th", table).slice(1).map((i,th)=>$(th).text().trim()).get();
    $("tr", table).slice(1).each((_,row)=>{
      const label = $("td.label",row).text().trim();
      const rule = fieldMap[label];
      if(!rule) return;
      $("td.info",row).each((i,td)=>{
        const bureau = bureaus[i];
        const raw = $(td).text().trim();
        const norm = rule.normalizer ? rule.normalizer(raw) : raw;
        tl.per_bureau[bureau] ??= {};
        tl.per_bureau[bureau][rule.key] = norm;
        tl.per_bureau[bureau][`${rule.key}_raw`] = raw;
      });
    });
    for(const b of bureaus){
      const v = validateTradeline(tl.per_bureau[b]||{});
      tl.violations.push(...v.map(x=>({ ...x, bureau:b })));
    }
    tradelines.push(tl);
  });
  return { tradelines };
}
