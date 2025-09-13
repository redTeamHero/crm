import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMetro2Violations } from '../utils.js';

test('MISSING_DOFD severity is 5', async () => {
  const violations = await loadMetro2Violations();
  assert.equal(violations.MISSING_DOFD.severity, 5);
});
