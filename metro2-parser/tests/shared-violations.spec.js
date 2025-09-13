import test from 'node:test';
import assert from 'node:assert/strict';

import { loadMetro2Violations as loadCrm } from '../../metro2 (copy 1)/crm/utils.js';
import { loadMetro2Violations as loadParser } from '../src/utils.js';

test('CRM and parser share the same violations data', () => {
  assert.deepEqual(loadCrm(), loadParser());
});
