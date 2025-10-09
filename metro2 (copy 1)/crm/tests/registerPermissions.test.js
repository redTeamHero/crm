import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { default: app } = await import('../server.js');

test('registered members receive default permissions for core CRM access', async () => {
  const username = `member_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
  const password = 'pass1234!';

  const registerRes = await request(app)
    .post('/api/register')
    .send({ username, password });

  assert.equal(registerRes.status, 200);
  assert.equal(registerRes.body.ok, true);
  assert.ok(registerRes.body.token, 'token should be returned');

  const authHeader = { Authorization: `Bearer ${registerRes.body.token}` };

  const meRes = await request(app)
    .get('/api/me')
    .set(authHeader);

  assert.equal(meRes.status, 200);
  assert.equal(meRes.body.ok, true);
  assert.deepEqual(
    new Set(meRes.body.user.permissions),
    new Set(['consumers', 'contacts', 'tasks', 'reports'])
  );

  const consumersRes = await request(app)
    .get('/api/consumers')
    .set(authHeader);

  assert.equal(consumersRes.status, 200);
  assert.equal(consumersRes.body.ok, true);
});
