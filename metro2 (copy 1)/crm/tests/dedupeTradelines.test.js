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
let fnCode = source.slice(start, i);
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
