import test from 'node:test';
import assert from 'node:assert/strict';
import pullTradelineData from '../pullTradelineData.js';

const SAMPLE_HTML = `<html><body><td class="ng-binding"><div class="sub_header">Test Creditor</div><table class="rpt_content_table rpt_content_header rpt_table4column"><tr><th></th><th>TransUnion</th><th>Experian</th><th>Equifax</th></tr><tr><td class="label">Account #:</td><td class="info">1234</td><td class="info">1234</td><td class="info">1234</td></tr></table></td></body></html>`;

test('pullTradelineData parses and enriches tradelines', async () => {
  const fakeFetch = async () => ({ ok: true, text: async () => SAMPLE_HTML });
  const overrides = { 'Test Creditor': { date_opened: '01/01/2020' } };
  const fakeAudit = async () => ({
    tradelines: [
      {
        violations: [{ id: 'V1', title: 'Fake Violation' }],
        violations_grouped: { Test: [{ id: 'V1', title: 'Fake Violation' }] }
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
