import assert from 'node:assert/strict';
import { test } from 'node:test';
import supertest from 'supertest';

process.env.NODE_ENV = 'test';

test('GET /api/tradelines scenarios', async (t) => {
  const app = (await import('../server.js')).default;
  const agent = supertest(app);

  t.afterEach(() => {
    app.set('scrapeTradelinesOverride', undefined);
  });

  await t.test('returns range summary and filtered results', async () => {
    const sample = [
      { bank: 'Alpha Bank', price: 120, limit: 5000, buy_link: '/buy?bank=Alpha&price=120', age: '2 years', reporting: 'Experian' },
      { bank: 'Bravo Bank', price: 275, limit: 8000, buy_link: '/buy?bank=Bravo&price=275', age: '3 years', reporting: 'Equifax' },
      { bank: 'Alpha Bank', price: 520, limit: 12000, buy_link: '/buy?bank=Alpha&price=520', age: '5 years', reporting: 'All bureaus' },
    ];

    app.set('scrapeTradelinesOverride', async () => sample);

    const summaryRes = await agent.get('/api/tradelines');
    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.body.ok, true);
    assert.ok(Array.isArray(summaryRes.body.ranges));
    const zeroBucket = summaryRes.body.ranges.find((range) => range.id === '0-150');
    assert.equal(zeroBucket.count, 1);

    const rangeRes = await agent.get('/api/tradelines').query({ range: '0-150' });
    assert.equal(rangeRes.status, 200);
    assert.equal(rangeRes.body.tradelines.length, 1);
    assert.equal(rangeRes.body.banks.length, 1);
    assert.equal(rangeRes.body.totalItems, 1);

    const bankRes = await agent
      .get('/api/tradelines')
      .query({ range: '151-300', bank: 'Bravo Bank', perPage: 10 });
    assert.equal(bankRes.status, 200);
    assert.equal(bankRes.body.tradelines.length, 1);
    assert.equal(bankRes.body.tradelines[0].bank, 'Bravo Bank');
    assert.equal(bankRes.body.selectedBank, 'Bravo Bank');

    const invalidRes = await agent.get('/api/tradelines').query({ range: 'bad' });
    assert.equal(invalidRes.status, 400);
    assert.equal(invalidRes.body.ok, false);
  });

  await t.test('reports capped perPage and pagination metadata when request exceeds limit', async () => {
    const largeSample = Array.from({ length: 550 }, (_, idx) => ({
      bank: `Bank ${idx % 3}`,
      price: 520 + idx,
      limit: 10000,
      buy_link: `/buy?bank=${idx}`,
      age: '2 years',
      reporting: 'All bureaus',
    }));

    app.set('scrapeTradelinesOverride', async () => largeSample);

    const res = await agent.get('/api/tradelines').query({ range: '501+', perPage: 9999 });
    assert.equal(res.status, 200);
    assert.equal(res.body.totalItems, 550);
    assert.equal(res.body.perPage, 500);
    assert.equal(res.body.totalPages, 2);
    assert.equal(res.body.tradelines.length, 500);
  });
});
