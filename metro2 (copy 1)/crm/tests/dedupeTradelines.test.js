import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Extract dedupeTradelines from public/index.js without executing the whole module
const source = await readFile(new URL('../public/index.js', import.meta.url), 'utf8');
const start = source.indexOf('export function dedupeTradelines');
if (start === -1) throw new Error('dedupeTradelines not found');
const braceStart = source.indexOf('{', start);
let depth = 1, i = braceStart + 1;
for (; i < source.length && depth > 0; i++) {
  if (source[i] === '{') depth++;
  else if (source[i] === '}') depth--;
}
const helpersStart = source.lastIndexOf('function isPlainObject', start);
let fnCode = '';
if (helpersStart !== -1) {
  fnCode += source.slice(helpersStart, start);
}
fnCode += source.slice(start, i);
fnCode = fnCode.replace('export function', 'function');
const dedupeTradelines = (new Function(`${fnCode}; return dedupeTradelines;`))();

test('dedupeTradelines merges entries with matching account numbers across bureaus', () => {
  const lines = [
    { meta:{ creditor:'Test Creditor' }, per_bureau:{ TransUnion:{ account_number:'123' }, Experian:{}, Equifax:{} }, violations:[] },
    { meta:{ creditor:'Test Creditor' }, per_bureau:{ TransUnion:{}, Experian:{ account_number:'123' }, Equifax:{} }, violations:[] }
  ];
  const deduped = dedupeTradelines(lines);
  assert.equal(deduped.length, 1);
});

test('dedupeTradelines keeps creditor-only entries separate when no account numbers exist', () => {
  const lines = [
    { meta:{ creditor:'No Numbers Creditor' }, per_bureau:{ TransUnion:{ balance:100 }, Experian:{}, Equifax:{} }, violations:[] },
    { meta:{ creditor:'No Numbers Creditor' }, per_bureau:{ TransUnion:{ balance:200 }, Experian:{}, Equifax:{} }, violations:[] }
  ];
  const deduped = dedupeTradelines(lines);
  assert.equal(deduped.length, 2);
});

test('dedupeTradelines merges using meta.account_numbers when bureau numbers are missing', () => {
  const lines = [
    { meta:{ creditor:'Meta Number Creditor', account_numbers:{ Experian:' abc123 ' } }, per_bureau:{ TransUnion:{ balance:150 }, Experian:{}, Equifax:{} }, violations:[] },
    { meta:{ creditor:'Meta Number Creditor', account_numbers:{ TransUnion:'ABC123' } }, per_bureau:{ TransUnion:{}, Experian:{ balance:250 }, Equifax:{} }, violations:[] }
  ];
  const deduped = dedupeTradelines(lines);
  assert.equal(deduped.length, 1);
});

test('dedupeTradelines merges bureau data, violations, and metadata without losing detail', () => {
  const lines = [
    {
      meta:{
        creditor:'Merge Creditor',
        account_numbers:{ TransUnion:'12345TU' },
        manual_reason:'Detailed bilingual rationale / Razón detallada'
      },
      per_bureau:{
        TransUnion:{ account_number:'12345TU', balance:200, payment_status:'Late' },
        Experian:{},
        Equifax:{ account_number:'12345TU', payment_status:'Current' }
      },
      violations:[{ title:'TU mismatch', bureaus:['TransUnion'] }]
    },
    {
      meta:{
        creditor:'Merge Creditor',
        account_numbers:{ Experian:'12345TU' },
        manual_reason:' '
      },
      per_bureau:{
        TransUnion:{ account_number:'12345TU', past_due:0 },
        Experian:{ account_number:'12345TU', past_due:50 },
        Equifax:{ account_number:'12345TU', payment_status:'' }
      },
      violations:[
        { title:'TU mismatch', bureaus:['TransUnion'] },
        { title:'Experian notice missing', bureaus:['Experian'] }
      ]
    }
  ];

  const deduped = dedupeTradelines(lines);
  assert.equal(deduped.length, 1);
  const merged = deduped[0];

  assert.equal(merged.per_bureau.TransUnion.account_number, '12345TU');
  assert.equal(merged.per_bureau.TransUnion.balance, 200);
  assert.equal(merged.per_bureau.Experian.account_number, '12345TU');
  assert.equal(merged.per_bureau.Experian.past_due, 50);
  assert.equal(merged.per_bureau.Equifax.payment_status, 'Current');

  assert.equal(merged.violations.length, 2);
  assert.deepEqual(new Set(merged.violations.map(v => v.title)), new Set(['TU mismatch', 'Experian notice missing']));

  assert.equal(merged.meta.manual_reason, 'Detailed bilingual rationale / Razón detallada');
  assert.equal(merged.meta.account_numbers.TransUnion, '12345TU');
  assert.equal(merged.meta.account_numbers.Experian, '12345TU');
});
