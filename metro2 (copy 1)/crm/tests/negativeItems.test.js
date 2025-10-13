import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareNegativeItems } from '../negativeItems.js';

test('prepareNegativeItems keeps categories and selects highest severity headline', () => {
  const tradelines = [
    {
      meta: { creditor: 'Sample Creditor' },
      per_bureau: { TransUnion: { account_number: '1111' } },
      violations: [
        {
          id: 'BALANCE_MISMATCH',
          code: 'BALANCE_MISMATCH',
          category: 'Basic',
          title: 'Balances differ across bureaus',
          detail: 'Balances do not match across bureaus',
          severity: 2,
        },
        {
          id: 'CURRENT_BUT_PASTDUE',
          code: 'CURRENT_BUT_PASTDUE',
          category: 'Balances & Amounts',
          title: 'Past due reported as current',
          detail: 'Past due amount conflicts with current status',
          severity: 4,
        },
      ],
    },
  ];

  const { items } = prepareNegativeItems(tradelines);
  assert.equal(items.length, 1);
  const item = items[0];
  assert.equal(item.violations.length, 2);
  assert.equal(item.violations[0].category, 'Balances & Amounts');
  assert.equal(item.violations[0].title, 'Past due reported as current');
  assert.equal(item.violations[1].category, 'Basic');
  assert.ok(item.headline);
  assert.equal(item.headline.title, 'Past due reported as current');
  assert.equal(item.headline.category, 'Balances & Amounts');
  assert.equal(item.headline.text, 'Balances & Amounts – Past due reported as current');
});

test('prepareNegativeItems builds masked bureau details with formatted values', () => {
  const tradelines = [
    {
      meta: { creditor: 'Another Creditor' },
      per_bureau: {
        TransUnion: {
          account_number: '1234567890',
          payment_status: 'Late 30',
          balance: 1234.5,
          past_due_raw: '$75',
          credit_limit: 4000,
          date_opened: '2021-05-17T00:00:00Z',
          last_reported_raw: '05/2023',
          date_first_delinquency: '2022-02-01',
        },
        Experian: {
          accountNumber: 'ABCD6789',
          payment_status: 'Current',
          balance: 0,
        },
      },
    },
  ];

  const { items } = prepareNegativeItems(tradelines);
  assert.equal(items.length, 1);
  const item = items[0];
  assert.ok(item.account_numbers.TransUnion.includes('67890') === false);
  assert.equal(item.account_numbers.TransUnion, '•••• 7890');
  assert.ok(item.bureau_details);
  assert.equal(item.bureau_details.TransUnion.payment_status, 'Late 30');
  assert.equal(item.bureau_details.TransUnion.balance, '$1,234.50');
  assert.equal(item.bureau_details.TransUnion.past_due, '$75');
  assert.equal(item.bureau_details.TransUnion.credit_limit, '$4,000.00');
  assert.equal(item.bureau_details.TransUnion.date_opened, '2021-05-17');
  assert.equal(item.bureau_details.TransUnion.last_reported, '05/2023');
  assert.equal(item.bureau_details.TransUnion.date_first_delinquency, '2022-02-01');
  assert.equal(item.bureau_details.Experian.account_number, '•••• 6789');
  assert.equal(item.bureau_details.Experian.balance, '$0.00');
});

