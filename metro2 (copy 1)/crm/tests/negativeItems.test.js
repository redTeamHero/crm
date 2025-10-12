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

