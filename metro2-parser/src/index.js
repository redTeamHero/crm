import * as cheerio from "cheerio";
import fields from "./rules/fields.json" with { type: "json" };
import * as normalizers from "./normalizers.js";
import { validateTradeline } from "./validators.js";

const fieldRules = fields.map(f => ({
  ...f,
  patterns: f.patterns.map(p => p.regex ? new RegExp(p.regex) : p.exact),
  normalizer: f.normalizer ? normalizers[f.normalizer] : undefined
}));

function findRule(label){
  return fieldRules.find(r =>
    r.patterns.some(p => typeof p === "string" ? p === label : p.test(label))
  );
}

export function parseReport(html){
  const $ = cheerio.load(html);
  const tradelines = [];

  $("table.rpt_content_table.rpt_content_header.rpt_table4column").each((_,table)=>{
    const tl = { per_bureau:{}, violations:[] };
    const bureaus = $("th", table).slice(1).map((i,th)=>$(th).text().trim()).get();
    $("tr", table).slice(1).each((_,row)=>{
      const label = $("td.label",row).text().trim();
      const rule = findRule(label);
      if(!rule) return;
      $("td.info",row).each((i,td)=>{
        const bureau = bureaus[i];
        const raw = $(td).text().trim();
        tl.per_bureau[bureau] ??= {};
        if(Array.isArray(rule.keys)){
          const parts = raw.split(rule.split || '/').map(s=>s.trim());
          rule.keys.forEach((key,idx)=>{
            const partRaw = parts[idx] ?? '';
            const norm = rule.normalizer ? rule.normalizer(partRaw) : partRaw;
            tl.per_bureau[bureau][key] = norm;
            tl.per_bureau[bureau][`${key}_raw`] = partRaw;
          });
        } else {
          const norm = rule.normalizer ? rule.normalizer(raw) : raw;
          tl.per_bureau[bureau][rule.key] = norm;
          tl.per_bureau[bureau][`${rule.key}_raw`] = raw;
        }
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
