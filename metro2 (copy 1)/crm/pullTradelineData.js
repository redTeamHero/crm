import { JSDOM } from 'jsdom';
import parseCreditReportHTML from './parser.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import os from 'os';

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

async function pullTradelineData({ apiUrl, fetchImpl = fetch, overrides = {}, auditImpl = runMetro2Audit }) {
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
  try {
    const audit = auditImpl ? await auditImpl(html) : null;
    const audited = audit?.tradelines || [];
    report.tradelines?.forEach((tl, idx) => {
      tl.violations = audited[idx]?.violations || [];
      tl.violations_grouped = audited[idx]?.violations_grouped || {};
    });
  } catch (err) {
    console.error('metro2_audit_multi.py failed', err);
  }
  return report;
}

export { pullTradelineData, enrichTradeline };
export default pullTradelineData;

async function runMetro2Audit(html) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const tmpHtml = path.join(os.tmpdir(), `tl-${Date.now()}.html`);
  const tmpJson = path.join(os.tmpdir(), `tl-${Date.now()}.json`);
  await fs.writeFile(tmpHtml, html, 'utf-8');
  await new Promise((resolve, reject) => {
    const py = spawn('python', [
      path.join(__dirname, 'metro2_audit_multi.py'),
      '-i', tmpHtml,
      '-o', tmpJson
    ], { stdio: 'ignore' });
    py.on('close', code => code === 0 ? resolve() : reject(new Error(`metro2_audit_multi.py exited with code ${code}`)));
  });
  try {
    const raw = await fs.readFile(tmpJson, 'utf-8');
    return JSON.parse(raw);
  } finally {
    fs.unlink(tmpHtml).catch(() => {});
    fs.unlink(tmpJson).catch(() => {});
  }
}
