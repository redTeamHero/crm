import { load } from 'cheerio';
import { parseMoney, validateTradeline } from '../../metro2-core/src/index.js';

const LABEL_MAP = {
  'Account #': 'account_number',
  'Acct #': 'account_number',
  'Account Status': 'account_status',
  'Payment Status': 'account_status',
  'Past Due': 'past_due',
};

export function parseReport(html){
  const $ = load(html);
  const tradelines = [];
  $('.rpt_content_table.rpt_content_header.rpt_table4column').each((_, table) => {
    const ths = $(table).find('tr').first().find('th');
    const bureau = ths.eq(1).text().trim() || 'Unknown';
    const tl = { per_bureau: { [bureau]: {} }, violations: [] };
    $(table).find('tr').slice(1).each((_, tr) => {
      const label = $(tr).find('td.label').text().trim();
      const value = $(tr).find('td.info').text().trim();
      if (!label) return;
      if (label === 'Balance / Past Due'){
        const [balRaw = '', dueRaw = ''] = value.split('/').map(s => s.trim());
        const pb = tl.per_bureau[bureau];
        pb.balance = parseMoney(balRaw);
        pb.balance_raw = balRaw;
        pb.past_due = parseMoney(dueRaw);
        pb.past_due_raw = dueRaw;
        return;
      }
      const field = LABEL_MAP[label];
      if (!field) return;
      const pb = tl.per_bureau[bureau];
      if (field === 'past_due'){
        pb.past_due = parseMoney(value);
        pb.past_due_raw = value;
      } else {
        pb[field] = value;
      }
    });
    for (const [bureauName, data] of Object.entries(tl.per_bureau)){
      const vs = validateTradeline(data).map(v => ({ ...v, bureau: bureauName }));
      tl.violations.push(...vs);
    }
    tradelines.push(tl);
  });
  return { tradelines, inquiries: [], inquiry_summary: {} };
}

export default { parseReport };
