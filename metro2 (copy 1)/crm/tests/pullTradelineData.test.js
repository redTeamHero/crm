import test from 'node:test';
import assert from 'node:assert/strict';
import pullTradelineData, { mapAuditedViolations, mergeViolationLists, mergeGroupedViolations, enrichTradeline } from '../pullTradelineData.js';

const SAMPLE_AUDIT = {
  account_history: [
    {
      creditor_name: 'Test Creditor',
      bureau: 'TransUnion',
      account_number: '1234',
      balance: '$500',
      violations: [{ id: 'V1', title: 'Missing Date of Last Payment' }],
    },
    {
      creditor_name: 'Test Creditor',
      bureau: 'Experian',
      account_number: '1234',
      balance: '$510',
      violations: [{ id: 'V2', title: 'Balance mismatch' }],
    },
  ],
  personal_information: [{ Name: { TransUnion: 'John Doe', Experian: 'John Doe', Equifax: 'John Doe' } }],
  personal_mismatches: [],
  inquiries: [],
  inquiry_violations: [],
};

test('mapAuditedViolations groups bureaus by creditor/account number', () => {
  const tradelines = mapAuditedViolations(SAMPLE_AUDIT);
  assert.equal(tradelines.length, 1);
  const tl = tradelines[0];
  assert.equal(tl.meta.creditor, 'Test Creditor');
  assert.equal(tl.per_bureau.TransUnion.account_number, '1234');
  assert.equal(tl.per_bureau.Experian.account_number, '1234');
  assert.deepEqual(Object.keys(tl.violations_grouped), ['V1', 'V2']);
});

test('merge helpers deduplicate violations and merge groups', () => {
  const merged = mergeViolationLists(
    [{ id: 'V1', title: 'A' }],
    [{ id: 'V1', title: 'A' }, { id: 'V2', title: 'B' }],
  );
  assert.deepEqual(merged, [
    { id: 'V1', title: 'A' },
    { id: 'V2', title: 'B' },
  ]);

  const grouped = mergeGroupedViolations({ V1: [{ id: 'V1', title: 'A' }] }, { V1: [{ id: 'V1', title: 'A' }], V2: [{ id: 'V2', title: 'B' }] });
  assert.deepEqual(grouped, {
    V1: [{ id: 'V1', title: 'A' }],
    V2: [{ id: 'V2', title: 'B' }],
  });
});

test('pullTradelineData uses overrides and returns audit metadata', async () => {
  const fakeFetch = async () => ({
    ok: true,
    text: async () => '<html></html>',
    status: 200,
    statusText: 'OK',
  });
  const overrides = { 'Test Creditor': { date_opened: '01/01/2020' } };
  const report = await pullTradelineData({ apiUrl: 'http://example.com', fetchImpl: fakeFetch, overrides, auditImpl: async () => SAMPLE_AUDIT });
  assert.equal(report.tradelines.length, 1);
  const tl = report.tradelines[0];
  assert.equal(tl.per_bureau.TransUnion.date_opened, '01/01/2020');
  assert.equal(tl.meta.account_numbers.TransUnion, '1234');
  assert.equal(report.personalInformation.length, 1);
});

test('enrichTradeline copies data between bureaus', () => {
  const tl = {
    meta: { creditor: 'Copy Creditor' },
    per_bureau: {
      TransUnion: { balance: '$100' },
      Experian: {},
      Equifax: {},
    },
    violations: [],
    violations_grouped: {},
  };
  enrichTradeline(tl, { past_due: '$0' });
  assert.equal(tl.per_bureau.Experian.balance, '$100');
  assert.equal(tl.per_bureau.Equifax.past_due, '$0');
});
