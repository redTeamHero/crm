import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { readKey, writeKey } from '../kvdb.js';

test('member with consumers permission can access /api/consumers', async () => {
  const original = await readKey('users', null);
  await writeKey('users', { users: [] });
  process.env.NODE_ENV = 'test';
  const { default: app } = await import('../server.js');

  const adminLogin = await request(app).post('/api/login').send({ username: 'ducky', password: 'duck' });
  const adminToken = adminLogin.body.token;

  const memberRes = await request(app)
    .post('/api/users')
    .set('Authorization', 'Bearer ' + adminToken)
    .send({ username: 'member', password: 'pw' });
  const memberId = memberRes.body.user.id;

  await request(app)
    .put(`/api/users/${memberId}`)
    .set('Authorization', 'Bearer ' + adminToken)
    .send({ permissions: ['consumers'] });

  const memberLogin = await request(app).post('/api/login').send({ username: 'member', password: 'pw' });
  const memberToken = memberLogin.body.token;

  const res = await request(app).get('/api/consumers').set('Authorization', 'Bearer ' + memberToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(Array.isArray(res.body.consumers), true);

  if (original) await writeKey('users', original); else await writeKey('users', { users: [] });
});
