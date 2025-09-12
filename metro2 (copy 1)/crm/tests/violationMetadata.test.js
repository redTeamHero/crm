import test from 'node:test';
import assert from 'node:assert/strict';
import { filterViolationsBySeverity } from '../letterEngine.js';

test('enriches MISSING_DOFD with severity and FCRA section', () => {
  const result = filterViolationsBySeverity([{ code: 'MISSING_DOFD' }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].severity, 5);
  assert.equal(result[0].fcraSection, '§ 623(a)(5)');
});

test('unknown violation codes fall back gracefully', () => {
  const result = filterViolationsBySeverity([{ code: 'UNKNOWN_RULE' }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].severity, 1);
  assert.ok(!('fcraSection' in result[0]));
});

