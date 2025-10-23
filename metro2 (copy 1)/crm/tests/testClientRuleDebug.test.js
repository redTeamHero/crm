import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { readKey, writeKey, deleteKey } from '../kvdb.js';
import { listRuleDebugViolationCodes } from '../ruleDebugGenerator.js';

process.env.NODE_ENV = 'test';

const { default: app } = await import('../server.js');

const originalConsumers = await readKey('consumers', null);

test.after(async () => {
  if (originalConsumers) {
    await writeKey('consumers', originalConsumers);
  } else {
    await deleteKey('consumers');
  }
});

test('creating a test client seeds every Metro-2 rule card', async () => {
  const response = await request(app)
    .post('/api/consumers')
    .send({ name: 'Rule Debug Demo', testClient: true, id: 'demo-client' });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);

  const consumer = response.body.consumer;
  assert.ok(consumer, 'response should include consumer payload');
  assert.equal(consumer.id, 'demo-client');
  assert.equal(consumer.testClient, true);

  const seededReport = Array.isArray(consumer.reports) ? consumer.reports[0] : null;
  assert.ok(seededReport, 'expected seeded rule-debug report');

  const expectedCodes = listRuleDebugViolationCodes();
  assert.ok(expectedCodes.length > 0, 'knowledge graph should expose violation codes');
  assert.equal(seededReport.summary?.tradelines, expectedCodes.length);

  const negativeItems = Array.isArray(seededReport.data?.negative_items)
    ? seededReport.data.negative_items
    : [];
  assert.ok(negativeItems.length > 0, 'expected negative items generated for portal');

  const triggeredCodes = new Set();
  for (const item of negativeItems) {
    for (const violation of item.violations || []) {
      if (violation && violation.code) {
        triggeredCodes.add(violation.code);
      }
    }
  }

  for (const code of expectedCodes) {
    assert.ok(triggeredCodes.has(code), `Expected violation ${code} to be seeded`);
  }
});
