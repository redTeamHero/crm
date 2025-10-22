import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveStateInfo } from '../public/state-utils.js';

test('resolveStateInfo normalizes standard state abbreviations and names', () => {
  const cases = [
    ['tx', { code: 'TX', name: 'Texas' }],
    ['Texas', { code: 'TX', name: 'Texas' }],
    ['texas.', { code: 'TX', name: 'Texas' }],
    ['washington dc', { code: 'DC', name: 'District of Columbia' }],
    ['Washington, D.C.', { code: 'DC', name: 'District of Columbia' }],
    ['N. Dakota', { code: 'ND', name: 'North Dakota' }],
    ['s. carolina', { code: 'SC', name: 'South Carolina' }],
    ['Commonwealth of Puerto Rico', { code: 'PR', name: 'Puerto Rico' }],
    ['US Virgin Islands', { code: 'VI', name: 'U.S. Virgin Islands' }]
  ];

  for (const [input, expected] of cases) {
    assert.deepStrictEqual(resolveStateInfo(input), expected, `Failed for input: ${input}`);
  }
});

test('resolveStateInfo preserves readable label when state is unknown', () => {
  assert.deepStrictEqual(resolveStateInfo('ontario'), { code: null, name: 'Ontario' });
});

test('resolveStateInfo returns nulls for empty values', () => {
  assert.deepStrictEqual(resolveStateInfo('  '), { code: null, name: null });
  assert.deepStrictEqual(resolveStateInfo(null), { code: null, name: null });
});
