import test from 'node:test';
import assert from 'node:assert/strict';
import pullTradelineData from '../pullTradelineData.js';

const SAMPLE_HTML = `<html><body><td class="ng-binding"><div class="sub_header">Test Creditor</div><table class="rpt_content_table rpt_content_header rpt_table4column"><tr><th></th><th>TransUnion</th><th>Experian</th><th>Equifax</th></tr><tr><td class="label">Account #:</td><td class="info">1234</td><td class="info">1234</td><td class="info">1234</td></tr></table></td></body></html>`;
const SAMPLE_HTML_NO_HEADER = `<html><body><td class="ng-binding"><table class="rpt_content_table rpt_content_header rpt_table4column"><tr><th></th><th>TransUnion</th><th>Experian</th><th>Equifax</th></tr><tr><td class="label">Account #:</td><td class="info">5678</td><td class="info">5678</td><td class="info">5678</td></tr></table></td></body></html>`;
const SAMPLE_HTML_NO_COLON = `<html><body><td class="ng-binding"><div class="sub_header">Test Creditor</div><table class="rpt_content_table rpt_content_header rpt_table4column"><tr><th></th><th>TransUnion</th><th>Experian</th><th>Equifax</th></tr><tr><td class="label">Account #</td><td class="info">ACCT-999</td><td class="info">ACCT-999</td><td class="info">ACCT-999</td></tr></table></td></body></html>`;
const SAMPLE_HTML_SPLIT_COLON = `<html><body><td class="ng-binding"><div class="sub_header">Split Colon Creditor</div><table class="rpt_content_table rpt_content_header rpt_table4column"><tr><th></th><th>TransUnion</th><th>Experian</th><th>Equifax</th></tr><tr><td class="label"><span>Account #</span><span>:</span></td><td class="info">SPLIT-222</td><td class="info">SPLIT-222</td><td class="info">SPLIT-222</td></tr></table></td></body></html>`;

function makeFakeFetch(html) {
  return async () => ({
    ok: true,
    headers: new Map([['content-type', 'text/html']]),
    text: async () => html,
  });
}

test('pullTradelineData parses and enriches tradelines', async () => {
  const fakeFetch = makeFakeFetch(SAMPLE_HTML);
  const overrides = { 'Test Creditor': { date_opened: '01/01/2020' } };
  const fakeAudit = async () => ({
    tradelines: [
      {
        meta: { creditor: 'Test Creditor' },
        per_bureau: {
          TransUnion: { account_number: '1234' },
          Experian: { account_number: '1234' },
          Equifax: { account_number: '1234' },
        },
        violations: [{ id: 'V1', title: 'Fake Violation' }],
        violations_grouped: { Test: [{ id: 'V1', title: 'Fake Violation' }] },
      }
    ]
  });
  const report = await pullTradelineData({ apiUrl: 'http://example.com', fetchImpl: fakeFetch, overrides, auditImpl: fakeAudit });
  const tl = report.tradelines[0];
  assert.equal(tl.meta.creditor, 'Test Creditor');
  assert.equal(tl.per_bureau.TransUnion.account_number, '1234');
  assert.equal(tl.per_bureau.Experian.date_opened, '01/01/2020');
  assert.equal(tl.per_bureau.Equifax.date_opened, '01/01/2020');
  assert.deepEqual(tl.violations, [{ id: 'V1', title: 'Fake Violation' }]);
  assert.deepEqual(tl.violations_grouped, { Test: [{ id: 'V1', title: 'Fake Violation' }] });
});

test('pullTradelineData merges Python violations without creditor header', async () => {
  const fakeFetch = makeFakeFetch(SAMPLE_HTML_NO_HEADER);
  const fakeAudit = async () => ({
    tradelines: [
      {
        meta: { creditor: 'Unknown Creditor' },
        per_bureau: {
          TransUnion: { account_number: '5678' },
          Experian: { account_number: '5678' },
          Equifax: { account_number: '5678' },
        },
        violations: [{ id: 'V2', title: 'Missing Creditor Header' }],
        violations_grouped: { Missing: [{ id: 'V2', title: 'Missing Creditor Header' }] },
      }
    ]
  });
  const report = await pullTradelineData({ apiUrl: 'http://example.com/no-header', fetchImpl: fakeFetch, auditImpl: fakeAudit });
  const tl = report.tradelines[0];
  assert.equal(tl.meta.creditor, 'Unknown Creditor');
  assert.deepEqual(tl.violations, [{ id: 'V2', title: 'Missing Creditor Header' }]);
  assert.deepEqual(tl.violations_grouped, { Missing: [{ id: 'V2', title: 'Missing Creditor Header' }] });
});

test('pullTradelineData merges Python violations when Account # lacks colon', async () => {
  const fakeFetch = makeFakeFetch(SAMPLE_HTML_NO_COLON);
  const fakeAudit = async () => ({
    tradelines: [
      {
        meta: {
          creditor: 'Test Creditor',
          account_numbers: {
            TransUnion: 'ACCT-999',
            Experian: 'ACCT-999',
            Equifax: 'ACCT-999',
          },
        },
        per_bureau: {
          TransUnion: { account_number: 'ACCT-999' },
          Experian: { account_number: 'ACCT-999' },
          Equifax: { account_number: 'ACCT-999' },
        },
        violations: [{ id: 'PY1', title: 'Python Flag' }],
        violations_grouped: { Python: [{ id: 'PY1', title: 'Python Flag' }] },
      }
    ]
  });
  const report = await pullTradelineData({ apiUrl: 'http://example.com/colonless', fetchImpl: fakeFetch, auditImpl: fakeAudit });
  const tl = report.tradelines[0];
  assert.equal(tl.per_bureau.TransUnion.account_number, 'ACCT-999');
  assert.equal(tl.meta.account_numbers.TransUnion, 'ACCT-999');
  assert.deepEqual(tl.violations, [{ id: 'PY1', title: 'Python Flag' }]);
  assert.deepEqual(tl.violations_grouped, { Python: [{ id: 'PY1', title: 'Python Flag' }] });
});

test('pullTradelineData merges Python violations when Account # colon rendered separately', async () => {
  const fakeFetch = makeFakeFetch(SAMPLE_HTML_SPLIT_COLON);
  const fakeAudit = async () => ({
    tradelines: [
      {
        meta: {
          creditor: 'Split Colon Creditor',
          account_numbers: {
            TransUnion: 'SPLIT-222',
            Experian: 'SPLIT-222',
            Equifax: 'SPLIT-222',
          },
        },
        per_bureau: {
          TransUnion: { account_number: 'SPLIT-222' },
          Experian: { account_number: 'SPLIT-222' },
          Equifax: { account_number: 'SPLIT-222' },
        },
        violations: [{ id: 'PY2', title: 'Python Flag Split Colon' }],
        violations_grouped: { Python: [{ id: 'PY2', title: 'Python Flag Split Colon' }] },
      }
    ]
  });
  const report = await pullTradelineData({ apiUrl: 'http://example.com/split-colon', fetchImpl: fakeFetch, auditImpl: fakeAudit });
  const tl = report.tradelines[0];
  assert.equal(tl.per_bureau.TransUnion.account_number, 'SPLIT-222');
  assert.equal(tl.meta.account_numbers.TransUnion, 'SPLIT-222');
  assert.deepEqual(tl.violations, [{ id: 'PY2', title: 'Python Flag Split Colon' }]);
  assert.deepEqual(tl.violations_grouped, { Python: [{ id: 'PY2', title: 'Python Flag Split Colon' }] });
});
