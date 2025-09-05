import test from 'node:test';
import assert from 'node:assert/strict';
import { filterViolationsBySeverity } from '../letterEngine.js';

test('filterViolationsBySeverity prioritizes high severity and loads snippets', () => {
  const input = [
    { code: 'LATE_NO_PAST_DUE' },
    { code: 'PST_DUE_CURR' }
  ];
  const filtered = filterViolationsBySeverity(input, 4, 'en');
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].code, 'PST_DUE_CURR');
  const spanish = filterViolationsBySeverity([{ code: 'PST_DUE_CURR' }], 1, 'es');
  assert.ok(spanish[0].detail.includes('Según la FCRA'));
});
