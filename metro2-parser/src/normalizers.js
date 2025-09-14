export function parseMoney(v){
  return Number(v.replace(/[^0-9.-]/g,'')) || 0;
}

export function toMDY(v){
  const d = new Date(v);
  return isNaN(d)
    ? ''
    : `${d.getMonth()+1}`.padStart(2,'0')+'/'+`${d.getDate()}`.padStart(2,'0')+'/'+d.getFullYear();
}

export const identity = v => v;
