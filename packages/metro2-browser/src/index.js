import { parseMoney, validateTradeline } from '../../metro2-core/src/index.js';

const LABEL_MAP = {
  'Account #': 'account_number',
  'Acct #': 'account_number',
  'Account Status': 'account_status',
  'Payment Status': 'account_status',
  'Past Due': 'past_due',
};

export function parseReport(doc){
  const tradelines = [];
  const tables = doc.querySelectorAll('table.rpt_content_table.rpt_content_header.rpt_table4column');
  tables.forEach(table => {
    const firstRow = table.querySelector('tr');
    const ths = firstRow ? firstRow.querySelectorAll('th') : [];
    const bureau = ths[1]?.textContent.trim() || 'Unknown';
    const tl = { per_bureau: { [bureau]: {} }, violations: [] };
    const rows = table.querySelectorAll('tr');
    for (let i = 1; i < rows.length; i++){
      const tr = rows[i];
      const label = tr.querySelector('td.label')?.textContent.trim();
      const value = tr.querySelector('td.info')?.textContent.trim();
      if (!label) continue;
      if (label === 'Balance / Past Due'){
        const [balRaw = '', dueRaw = ''] = (value || '').split('/').map(s => s.trim());
        const pb = tl.per_bureau[bureau];
        pb.balance = parseMoney(balRaw);
        pb.balance_raw = balRaw;
        pb.past_due = parseMoney(dueRaw);
        pb.past_due_raw = dueRaw;
        continue;
      }
      const field = LABEL_MAP[label];
      if (!field) continue;
      const pb = tl.per_bureau[bureau];
      if (field === 'past_due'){
        pb.past_due = parseMoney(value);
        pb.past_due_raw = value || '';
      } else {
        pb[field] = value || '';
      }
    }
    for (const [bureauName, data] of Object.entries(tl.per_bureau)){
      const vs = validateTradeline(data).map(v => ({ ...v, bureau: bureauName }));
      tl.violations.push(...vs);
    }
    tradelines.push(tl);
  });
  return { tradelines, inquiries: [], inquiry_summary: {} };
}

export default { parseReport };
