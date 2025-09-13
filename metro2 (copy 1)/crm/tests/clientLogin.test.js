import test from 'node:test';
import assert from 'node:assert/strict';
import { readKey, writeKey } from '../kvdb.js';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import jwt from 'jsonwebtoken';
const client = {
  id: 'c1',
  name: 'Test Client',
  email: 'client@example.com',
  password: bcrypt.hashSync('secret', 10),
  portalToken: 'tok123',
  reports: []
};

const original = await readKey('consumers', null);
await writeKey('consumers', { consumers: [client] });

process.env.NODE_ENV = 'test';
const { default: app } = await import('../server.js');

test('client login via token issues client role', async () => {
  const res = await request(app).post('/api/client/login').send({ token: 'tok123' });
  assert.equal(res.body.ok, true);
  const payload = jwt.decode(res.body.token);
  assert.equal(payload.role, 'client');
  assert.equal(payload.id, 'c1');
});

test('client login via email/password', async () => {
  const res = await request(app).post('/api/client/login').send({ email: 'client@example.com', password: 'secret' });
  assert.equal(res.body.ok, true);
});

test.after(async () => {
  if (original) await writeKey('consumers', original);
  else await writeKey('consumers', { consumers: [] });
});
