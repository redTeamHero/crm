import test from 'node:test';
import assert from 'node:assert/strict';
import { filterViolationsBySeverity } from '../letterEngine.js';

test('filterViolationsBySeverity falls back to violation text when snippet missing', () => {
  const result = filterViolationsBySeverity([
    { code: 'CURRENT_BUT_PASTDUE' }
  ]);
  assert.equal(result[0].detail, 'Past due amount reported on current account');
});
