import test from 'node:test';
import assert from 'node:assert/strict';
import { filterViolationsBySeverity } from '../letterEngine.js';

test('filterViolationsBySeverity prioritizes high severity', () => {
  const input = [
    { code: 'MISSING_DOFD' },
    { code: 'LATE_STATUS_NO_PASTDUE' }
  ];
  const filtered = filterViolationsBySeverity(input, 4, 'en');
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].code, 'MISSING_DOFD');
});

test('mergeBureauViolations keeps violations separate per bureau', async () => {
  const stubEl = {};
  stubEl.addEventListener = () => {};
  stubEl.classList = { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} };
  stubEl.querySelector = () => stubEl;
  stubEl.querySelectorAll = () => [];
  stubEl.appendChild = () => {};
  stubEl.innerHTML = '';
  stubEl.textContent = '';
  stubEl.style = {};
  stubEl.dataset = {};
  globalThis.document = {
    querySelector: () => stubEl,
    querySelectorAll: () => [],
    getElementById: () => stubEl,
    addEventListener: () => {},
    createElement: () => stubEl,
    body: { style: {} }
  };
  globalThis.window = {};
  globalThis.MutationObserver = class { observe(){} disconnect(){} };
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };

  const { mergeBureauViolations } = await import('../public/index.js');
  const input = [
    {
      id: 'A1',
      category: 'cat',
      title: 'Same Title',
      detail: 'Same Detail',
      severity: 1,
      evidence: { bureau: 'TransUnion' }
    },
    {
      id: 'A1',
      category: 'cat',
      title: 'Same Title',
      detail: 'Same Detail',
      severity: 1,
      evidence: { bureau: 'Experian' }
    }
  ];
  const merged = mergeBureauViolations(input);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map(v=>v.bureaus), [['TransUnion'], ['Experian']]);
});
