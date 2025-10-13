import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PRICE_BUCKETS,
  resolveBucketId,
  groupTradelinesByPrice,
  buildRangeSummary,
  listBanks,
  paginate,
} from '../tradelineBuckets.js';

test('resolveBucketId maps prices into configured buckets', () => {
  assert.equal(resolveBucketId(75), '0-150');
  assert.equal(resolveBucketId(151), '151-300');
  assert.equal(resolveBucketId(450), '301-500');
  assert.equal(resolveBucketId(750), '501+');
  assert.equal(resolveBucketId(undefined), null);
});

test('groupTradelinesByPrice organizes and sorts tradelines', () => {
  const sample = [
    { bank: 'Bank A', price: 250 },
    { bank: 'Bank B', price: 140 },
    { bank: 'Bank C', price: 520 },
    { bank: 'Bank D', price: 140 },
  ];
  const grouped = groupTradelinesByPrice(sample);
  assert.equal(grouped['0-150'].length, 2);
  assert.equal(grouped['151-300'].length, 1);
  assert.equal(grouped['501+'].length, 1);
  assert.equal(grouped['301-500'].length, 0);
  const prices = grouped['0-150'].map((item) => item.price);
  assert.deepEqual(prices, [140, 140]);
});

test('buildRangeSummary returns counts for each configured bucket', () => {
  const grouped = {
    '0-150': [{}, {}],
    '151-300': [{ bank: 'X' }],
    '301-500': [],
    '501+': [],
  };
  const summary = buildRangeSummary(grouped);
  const ids = summary.map((item) => item.id);
  assert.deepEqual(ids, PRICE_BUCKETS.map((b) => b.id));
  const target = summary.find((item) => item.id === '0-150');
  assert.equal(target.count, 2);
});

test('listBanks returns alphabetized bank counts', () => {
  const banks = listBanks([
    { bank: 'C Bank' },
    { bank: 'A Bank' },
    { bank: 'A Bank' },
    { bank: 'B Bank' },
    { bank: '  ' },
  ]);
  assert.deepEqual(banks, [
    { bank: 'A Bank', count: 2 },
    { bank: 'B Bank', count: 1 },
    { bank: 'C Bank', count: 1 },
  ]);
});

test('paginate constrains page boundaries', () => {
  const items = Array.from({ length: 25 }, (_, idx) => ({ id: idx }));
  const { items: pageItems, page, totalPages, totalItems } = paginate(items, 3, 10);
  assert.equal(pageItems.length, 5);
  assert.equal(page, 3);
  assert.equal(totalPages, 3);
  assert.equal(totalItems, 25);
});

test('paginate allows higher caps when configured', () => {
  const items = Array.from({ length: 150 }, (_, idx) => ({ id: idx }));
  const { items: pageItems, totalPages, perPage } = paginate(items, 1, 200, { maxPerPage: 250 });
  assert.equal(pageItems.length, 150);
  assert.equal(totalPages, 1);
  assert.equal(perPage, 200);
});
