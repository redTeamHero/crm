import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { readKey, writeKey } from '../kvdb.js';

const originalUsers = await readKey('users', null);

const adminUser = {
  id: 'me-admin',
  username: 'me-admin',
  password: bcrypt.hashSync('secret', 10),
  role: 'admin',
  permissions: ['consumers']
};

await writeKey('users', { users: [adminUser] });

process.env.NODE_ENV = 'test';
const { default: app } = await import('../server.js');

function tokenFor(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions || []
    },
    'dev-secret',
    { expiresIn: '1h' }
  );
}

test('GET /api/me without credentials returns 401', async () => {
  const res = await request(app).get('/api/me');
  assert.equal(res.status, 401);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /unauthorized/i);
});

test('GET /api/me with valid token returns the current user', async () => {
  const res = await request(app)
    .get('/api/me')
    .set('Authorization', `Bearer ${tokenFor(adminUser)}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.user.id, adminUser.id);
  assert.equal(res.body.user.username, adminUser.username);
});

test.after(async () => {
  if (originalUsers) {
    await writeKey('users', originalUsers);
  } else {
    await writeKey('users', { users: [] });
  }
});

