import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReport } from '../src/index.js';
import { enrich, validateTradeline } from '../src/validators.js';
import fs from 'fs';

test('extracts DOFD and flags past-due inconsistency', () => {
  const html = fs.readFileSync('tests/fixtures/report.html','utf8');
  const result = parseReport(html);
  const v = result.tradelines[0].violations.find(v => v.code === 'CURRENT_BUT_PASTDUE' && v.bureau === 'TransUnion');
  assert.ok(v, 'should flag past-due inconsistency for TransUnion');
  assert.deepStrictEqual(
    { id: v.id, violation: v.violation, severity: v.severity, fcraSection: v.fcraSection },
    {
      id: 12,
      violation: 'Past due amount reported on current account',
      severity: 4,
      fcraSection: '§ 623(a)(1)'
    }
  );
});

test('validateTradeline executes multiple rule types', () => {
  const comparison = validateTradeline({ account_status: 'Current', past_due: 100 });
  assert.deepStrictEqual(comparison, [
    {
      code: 'CURRENT_BUT_PASTDUE',
      id: 12,
      violation: 'Past due amount reported on current account',
      severity: 4,
      fcraSection: '§ 623(a)(1)'
    }
  ]);

  const missing = validateTradeline({ account_status: 'Charge-off' });
  assert.deepStrictEqual(missing, [
    {
      code: 'MISSING_DOFD',
      id: 1,
      violation: 'Missing or invalid Date of First Delinquency',
      severity: 5,
      fcraSection: '§ 623(a)(5)'
    }
  ]);
});

test('unknown violation codes fall back to default message', () => {
  assert.deepStrictEqual(
    enrich('UNKNOWN_CODE'),
    { code: 'UNKNOWN_CODE', violation: 'Unknown violation code' }
  );
});

test('lowercase violation codes return same metadata as uppercase', () => {
  const upperPastDue = enrich('CURRENT_BUT_PASTDUE');
  const lowerPastDue = enrich('current_but_pastdue');
  assert.deepStrictEqual(lowerPastDue, upperPastDue);

  const upperMissingDofd = enrich('MISSING_DOFD');
  const lowerMissingDofd = enrich('missing_dofd');
  assert.deepStrictEqual(lowerMissingDofd, upperMissingDofd);
});

test('parses alternate label names', () => {
  const html = fs.readFileSync('tests/fixtures/report-alt.html','utf8');
  const result = parseReport(html);
  const eq = result.tradelines[0].per_bureau['Equifax'];
  assert.equal(eq.account_number, '12345');
  assert.equal(eq.account_status, 'Current');
});

test('handles combined balance/past due rows', () => {
  const html = fs.readFileSync('tests/fixtures/report-alt.html','utf8');
  const eq = parseReport(html).tradelines[0].per_bureau['Equifax'];
  assert.equal(eq.balance, 500);
  assert.equal(eq.past_due, 0);
  assert.equal(eq.balance_raw, '$500');
  assert.equal(eq.past_due_raw, '$0');
});
