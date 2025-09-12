import { JSDOM } from 'jsdom';
import parseCreditReportHTML from './parser.js';

const ALL_BUREAUS = ['TransUnion', 'Experian', 'Equifax'];
const ENRICH_FIELDS = [
  'account_number',
  'account_type',
  'account_status',
  'payment_status',
  'monthly_payment',
  'balance',
  'credit_limit',
  'high_credit',
  'past_due',
  'date_opened',
  'last_reported',
  'date_last_payment',
  'comments'
];

function enrichTradeline(tl, override = {}) {
  for (const bureau of ALL_BUREAUS) {
    const pb = (tl.per_bureau[bureau] ||= {});
    for (const field of ENRICH_FIELDS) {
      if (pb[field] == null || pb[field] === '') {
        if (override[field] != null) {
          pb[field] = override[field];
          continue;
        }
        for (const b2 of ALL_BUREAUS) {
          const v = tl.per_bureau?.[b2]?.[field];
          if (v != null && v !== '') {
            pb[field] = v;
            break;
          }
        }
      }
    }
  }
  return tl;
}

async function pullTradelineData({ apiUrl, fetchImpl = fetch, overrides = {} }) {
  const res = await fetchImpl(apiUrl);
  if (!res.ok) throw new Error(`Failed to fetch report: ${res.status}`);
  const html = await res.text();
  const dom = new JSDOM(html);
  const report = parseCreditReportHTML(dom.window.document);
  for (const tl of report.tradelines || []) {
    const ov = overrides[tl.meta?.creditor] || {};
    enrichTradeline(tl, ov);
    tl.meta = tl.meta || {};
    tl.meta.account_numbers = tl.meta.account_numbers || {};
    for (const b of ALL_BUREAUS) {
      const acct = tl.per_bureau?.[b]?.account_number;
      if (acct && !tl.meta.account_numbers[b]) {
        tl.meta.account_numbers[b] = acct;
      }
    }
  }
  return report;
}

export { pullTradelineData, enrichTradeline };
export default pullTradelineData;
