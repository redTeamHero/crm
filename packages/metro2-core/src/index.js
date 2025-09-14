import fieldMap from './fieldMap.js';
import { validateTradeline, enrich } from './validators.js';

export { fieldMap, validateTradeline, enrich };

export function buildTradeline(bureaus, rows){
  const tl = { per_bureau:{}, violations:[] };
  for(const {label, values} of rows){
    const rule = fieldMap[label];
    if(!rule) continue;
    values.forEach((raw,i)=>{
      const bureau = bureaus[i];
      if(!bureau) return;
      const norm = rule.normalizer ? rule.normalizer(raw) : raw;
      tl.per_bureau[bureau] ??= {};
      tl.per_bureau[bureau][rule.key] = norm;
      tl.per_bureau[bureau][`${rule.key}_raw`] = raw;
    });
  }
  for(const b of bureaus){
    const v = validateTradeline(tl.per_bureau[b]||{});
    tl.violations.push(...v.map(x=>({ ...x, bureau:b })));
  }
  return tl;
}

export function parseHistory(){
  return { byBureau:{}, summary:{} };
}

export function parseInquiries(){
  return [];

}
