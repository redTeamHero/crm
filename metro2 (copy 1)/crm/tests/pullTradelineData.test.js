import test from 'node:test';
import assert from 'node:assert/strict';
import pullTradelineData, { mapAuditedViolations } from '../pullTradelineData.js';

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

test('mapAuditedViolations preserves JS violations when Python match lacks issues', () => {
  const report = {
    tradelines: [
      {
        meta: { creditor: 'Status Creditor' },
        per_bureau: {
          TransUnion: { account_number: 'ACCT-321' },
          Experian: { account_number: 'ACCT-321' },
          Equifax: { account_number: 'ACCT-321' },
        },
        violations: [
          {
            id: 'X_BUREAU_FIELD_MISMATCH',
            title: 'Balances differ across bureaus',
            detail: 'Balance mismatch',
            evidence: { field: 'balance', bureau: 'TransUnion' },
          },
          {
            id: 'X_BUREAU_FIELD_MISMATCH',
            title: 'Past-due amounts differ across bureaus',
            detail: 'Past due mismatch',
            evidence: { field: 'past_due', bureau: 'TransUnion' },
          },
        ],
        violations_grouped: {
          Basic: [
            {
              id: 'X_BUREAU_FIELD_MISMATCH',
              title: 'Balances differ across bureaus',
              detail: 'Balance mismatch',
              evidence: { field: 'balance', bureau: 'TransUnion' },
            },
            {
              id: 'X_BUREAU_FIELD_MISMATCH',
              title: 'Past-due amounts differ across bureaus',
              detail: 'Past due mismatch',
              evidence: { field: 'past_due', bureau: 'TransUnion' },
            },
          ],
        },
      }
    ]
  };
  const audit = {
    tradelines: [
      {
        meta: { creditor: 'Status Creditor' },
        per_bureau: {
          TransUnion: { account_number: 'ACCT-321' },
          Experian: { account_number: 'ACCT-321' },
          Equifax: { account_number: 'ACCT-321' },
        },
        violations: [],
        violations_grouped: {},
      }
    ]
  };
  mapAuditedViolations(report, audit);
  const tl = report.tradelines[0];
  assert.equal(tl.violations.length, 2);
  assert.equal(tl.violations_grouped.Basic.length, 2);
  assert.equal(tl.violations[0].title, 'Balances differ across bureaus');
  assert.equal(tl.violations[1].title, 'Past-due amounts differ across bureaus');
});

test('mapAuditedViolations merges Python violations with existing ones without duplicates', () => {
  const report = {
    tradelines: [
      {
        meta: { creditor: 'Status Creditor' },
        per_bureau: {
          TransUnion: { account_number: 'ACCT-321' },
          Experian: { account_number: 'ACCT-321' },
          Equifax: { account_number: 'ACCT-321' },
        },
        violations: [{ id: 'CURRENT_BUT_PASTDUE', title: 'JS Rule' }],
        violations_grouped: { Basic: [{ id: 'CURRENT_BUT_PASTDUE', title: 'JS Rule' }] },
      }
    ]
  };
  const audit = {
    tradelines: [
      {
        meta: { creditor: 'Status Creditor' },
        per_bureau: {
          TransUnion: { account_number: 'ACCT-321' },
          Experian: { account_number: 'ACCT-321' },
          Equifax: { account_number: 'ACCT-321' },
        },
        violations: [
          { id: 'CURRENT_BUT_PASTDUE', title: 'JS Rule' },
          { id: 'PY-NEW', title: 'Python Extra' }
        ],
        violations_grouped: {
          Python: [
            { id: 'PY-NEW', title: 'Python Extra' }
          ]
        }
      }
    ]
  };
  mapAuditedViolations(report, audit);
  const tl = report.tradelines[0];
  const ids = tl.violations.map(v => v.id).sort();
  assert.deepEqual(ids, ['CURRENT_BUT_PASTDUE', 'PY-NEW']);
  assert.deepEqual(tl.violations_grouped, {
    Basic: [{ id: 'CURRENT_BUT_PASTDUE', title: 'JS Rule' }],
    Python: [{ id: 'PY-NEW', title: 'Python Extra' }]
  });
});

test('mapAuditedViolations dedupes identical violations even when Python adds source metadata', () => {
  const report = {
    tradelines: [
      {
        meta: { creditor: 'Duplicate Creditor' },
        per_bureau: {
          TransUnion: { account_number: 'ACCT-999' },
          Experian: { account_number: 'ACCT-999' },
          Equifax: { account_number: 'ACCT-999' },
        },
        violations: [
          {
            id: 'CURRENT_BUT_PASTDUE',
            title: "Past-due reported with 'Current' status (TransUnion)",
            detail: "Past-due > 0 conflicts with 'Current' status.",
            evidence: { bureau: 'TransUnion', past_due: 100, payment_status: 'Current' },
            source: 'js',
          },
        ],
        violations_grouped: { Basic: [] },
      }
    ]
  };
  const audit = {
    tradelines: [
      {
        meta: { creditor: 'Duplicate Creditor' },
        per_bureau: {
          TransUnion: { account_number: 'ACCT-999' },
          Experian: { account_number: 'ACCT-999' },
          Equifax: { account_number: 'ACCT-999' },
        },
        violations: [
          {
            id: 'CURRENT_BUT_PASTDUE',
            title: "Past-due reported with 'Current' status (TransUnion)",
            detail: "Past-due > 0 conflicts with 'Current' status.",
            evidence: { bureau: 'TransUnion', past_due: 100, payment_status: 'Current' },
            source: 'python',
          }
        ],
        violations_grouped: {},
      }
    ]
  };
  mapAuditedViolations(report, audit);
  const tl = report.tradelines[0];
  assert.equal(tl.violations.length, 1);
  assert.equal(tl.violations[0].source, 'js');
});
