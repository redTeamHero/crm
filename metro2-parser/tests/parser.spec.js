import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReport } from '../src/index.js';
import { enrich } from '../src/validators.js';
import fs from 'fs';

test('extracts DOFD and flags past-due inconsistency', () => {
  const html = fs.readFileSync('tests/fixtures/report.html','utf8');
  const result = parseReport(html);
  const v = result.tradelines[0].violations.find(v => v.code === 'CURRENT_BUT_PASTDUE' && v.bureau === 'TransUnion');
  assert.ok(v, 'should flag past-due inconsistency for TransUnion');
  assert.deepStrictEqual(
    { code: v.code, violation: v.violation, severity: v.severity, fcraSection: v.fcraSection },
    {
      code: 'CURRENT_BUT_PASTDUE',
      violation: 'Past due amount reported on current account',
      severity: 4,
      fcraSection: '§ 623(a)(1)'
    }
  );
});

test('unknown violation codes return only code', () => {
  assert.deepStrictEqual(enrich('UNKNOWN_CODE'), { code: 'UNKNOWN_CODE' });
});
