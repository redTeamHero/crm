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

function stubDom(){
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
}

async function loadPublicModule(){
  stubDom();
  return import('../public/index.js');
}

test('normalizeViolations preserves order and idx values', async () => {
  const { normalizeViolations } = await loadPublicModule();
  const normalized = normalizeViolations([
    { id: 'A1', category: 'cat', title: 'First', idx: 5, bureaus: ['TransUnion'] },
    { id: 'A2', category: 'cat', title: 'Second', evidence: { bureau: 'Experian' } }
  ]);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].idx, 5);
  assert.deepEqual(normalized[0].bureaus, ['TransUnion']);
  assert.equal(normalized[1].idx, 1);
  assert.deepEqual(normalized[1].bureaus, ['Experian']);
});

test('normalizeViolations builds unique bureau list', async () => {
  const { normalizeViolations } = await loadPublicModule();
  const normalized = normalizeViolations([
    {
      id: 'A1',
      category: 'cat',
      title: 'Duplicate bureaus',
      bureaus: ['TransUnion'],
      bureau: 'TransUnion',
      evidence: { bureau: 'Experian' }
    }
  ]);
  assert.deepEqual(normalized[0].bureaus.sort(), ['Experian', 'TransUnion']);
});

test('normalizeViolations falls back to violation text when title missing', async () => {
  const { normalizeViolations } = await loadPublicModule();
  const normalized = normalizeViolations([
    { category: 'cat', violation: 'Only violation field', severity: 1 }
  ]);
  const html = normalized.map(v => `
    <div class="font-medium text-sm wrap-anywhere">${v.category || ''} – ${v.title || v.violation || ''}</div>
  `).join('');
  assert.ok(html.includes('Only violation field'));
});
