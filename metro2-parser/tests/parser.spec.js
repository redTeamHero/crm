import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReport } from '../src/index.js';
import fs from 'fs';

test('extracts DOFD and flags past-due inconsistency', () => {
  const html = fs.readFileSync('tests/fixtures/report.html','utf8');
  const result = parseReport(html);
  assert.ok(
    result.tradelines[0].violations.find(v => v.code === 'CURRENT_BUT_PASTDUE' && v.bureau === 'TransUnion'),
    'should flag past-due inconsistency for TransUnion'
  );
});
