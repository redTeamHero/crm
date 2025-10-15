import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeReport } from '../creditAuditTool.js';

const SAMPLE_TRADELINE = {
  meta: {
    creditor: 'Capital One Bank',
    account_numbers: {
      TransUnion: '1234',
      Experian: '1234',
    },
  },
  per_bureau: {
    TransUnion: {
      account_number: '1234',
      payment_status: 'Current',
      account_status: 'Open',
      balance: '$1,200',
      balance_raw: '$1,200',
      past_due: '$0',
      past_due_raw: '$0',
      credit_limit: '$2,000',
      credit_limit_raw: '$2,000',
      date_opened: '2020-01-01',
      date_opened_raw: '01/01/2020',
    },
    Experian: {
      account_number: '1234',
      payment_status: 'Late',
      account_status: 'Open',
      balance: '$1,400',
      balance_raw: '$1,400',
      past_due: '$200',
      past_due_raw: '$200',
      credit_limit: '$2,000',
      credit_limit_raw: '$2,000',
      date_opened: '2020-01-01',
      date_opened_raw: '01/01/2020',
    },
  },
  violations: [
    {
      id: 'BALANCE_MISMATCH',
      title: 'Balances differ across bureaus',
      detail: 'Balance is inconsistent across bureaus.',
      severity: 2,
    },
    {
      id: 'PAST_DUE_INCONSISTENT',
      title: 'Past due reported with current status',
      detail: 'Past due but showing current.',
      severity: 4,
      evidence: { bureau: 'Experian' },
    },
  ],
};

test('normalizeReport falls back to tradelines and filters selected bureaus', () => {
  const report = {
    tradelines: [sampleTradelineClone()],
    personal_information: [{ Name: { TransUnion: 'Test User' } }],
    personal_mismatches: [{ field: 'address', value: 'Old Address' }],
    inquiries: [{ bureau: 'TransUnion', company: 'Bank' }],
    inquiry_violations: [{ id: 'OLD_INQUIRY' }],
  };

  const normalized = normalizeReport(report);
  assert.equal(normalized.accounts.length, 1);
  const account = normalized.accounts[0];
  assert.deepEqual(Object.keys(account.bureaus).sort(), ['Experian', 'TransUnion']);
  assert.equal(account.issues.length, 2);
  assert.equal(normalized.personalInformation.length, 1);
  assert.equal(normalized.inquiries.length, 1);
  assert.equal(normalized.inquiryViolations.length, 1);
});

test('normalizeReport respects selected bureaus and violation indexes', () => {
  const report = { tradelines: [sampleTradelineClone()] };
  const selections = [{
    tradelineIndex: 0,
    bureaus: ['Experian'],
    violationIdxs: [1],
  }];

  const normalized = normalizeReport(report, selections);
  assert.equal(normalized.accounts.length, 1);
  const account = normalized.accounts[0];
  assert.deepEqual(Object.keys(account.bureaus), ['Experian']);
  assert.equal(account.issues.length, 1);
  assert.equal(account.issues[0].id, 'PAST_DUE_INCONSISTENT');
  assert.equal(account.issues[0].originalIndex, 1);
});

function sampleTradelineClone() {
  return JSON.parse(JSON.stringify(SAMPLE_TRADELINE));
}
