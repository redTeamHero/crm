import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_DB_PATH = path.join(__dirname, '..', 'users-db.json');
const original = fs.existsSync(USERS_DB_PATH) ? fs.readFileSync(USERS_DB_PATH) : null;

const admin = { id: 'a1', username: 'admin', password: bcrypt.hashSync('secret', 10), role: 'admin', permissions: [] };
const member = { id: 'm1', username: 'member', password: bcrypt.hashSync('secret', 10), role: 'member', permissions: [] };
fs.writeFileSync(USERS_DB_PATH, JSON.stringify({ users: [admin, member] }, null, 2));

process.env.NODE_ENV = 'test';
const { default: app } = await import('../server.js');

function token(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role, permissions: user.permissions }, 'dev-secret', { expiresIn: '1h' });
}

test('member cannot list users', async () => {
  const res = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${token(member)}`);
  assert.equal(res.status, 403);
});

test('member cannot create team member', async () => {
  const res = await request(app)
    .post('/api/team-members')
    .set('Authorization', `Bearer ${token(member)}`)
    .send({ username: 'newbie' });
  assert.equal(res.status, 403);
});

test.after(() => {
  if (original) fs.writeFileSync(USERS_DB_PATH, original);
  else fs.unlinkSync(USERS_DB_PATH);
});
