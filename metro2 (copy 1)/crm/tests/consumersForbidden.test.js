import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { default: app } = await import('../server.js');

test('unauthenticated access to /api/consumers returns forbidden json', async () => {
  const res = await request(app).get('/api/consumers');
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { ok: false, error: 'Forbidden' });
});
