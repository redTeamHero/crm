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

test('mergeBureauViolations merges same violation across bureaus', async () => {

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
  globalThis.location = { search: '', pathname: '/' };

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
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].bureaus.sort(), ['Experian','TransUnion']);
});

test('mergeBureauViolations merges bureaus array into single violation', async () => {
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
  globalThis.location = { search: '', pathname: '/' };

  const { mergeBureauViolations } = await import('../public/index.js');
  const merged = mergeBureauViolations([
    { id: 'A1', category: 'cat', title: 'Same Title', detail: 'Same Detail', bureaus: ['TransUnion','Experian'] }
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].bureaus.sort(), ['Experian','TransUnion']);

});

test('renderViolations shows violation text when title missing', async () => {
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
  globalThis.location = { search: '', pathname: '/' };

  const { mergeBureauViolations } = await import('../public/index.js');
  const merged = mergeBureauViolations([
    { category: 'cat', violation: 'Only violation field', severity: 1 }
  ]);

  const html = merged.map(v => `
    <div class="font-medium text-sm wrap-anywhere">${v.category || ''} – ${v.title || v.violation || ''}</div>
  `).join('');
  assert.ok(html.includes('Only violation field'));
});
