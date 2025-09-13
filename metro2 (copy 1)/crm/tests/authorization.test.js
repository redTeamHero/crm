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
const DB_PATH = path.join(__dirname, '..', 'db.json');
let consumerId = 'c1';
try {
  const dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  consumerId = dbData.consumers?.[0]?.id || 'c1';
} catch {}

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

test('member cannot list consumers', async () => {
  const res = await request(app)
    .get('/api/consumers')
    .set('Authorization', `Bearer ${token(member)}`);
  assert.equal(res.status, 403);
});

test('member cannot create consumer', async () => {
  const res = await request(app)
    .post('/api/consumers')
    .set('Authorization', `Bearer ${token(member)}`)
    .send({ name: 'Test' });
  assert.equal(res.status, 403);
});

test('member cannot update consumer', async () => {
  const res = await request(app)
    .put(`/api/consumers/${consumerId}`)
    .set('Authorization', `Bearer ${token(member)}`)
    .send({ name: 'Nope' });
  assert.equal(res.status, 403);
});

test('member cannot delete consumer', async () => {
  const res = await request(app)
    .delete(`/api/consumers/${consumerId}`)
    .set('Authorization', `Bearer ${token(member)}`);
  assert.equal(res.status, 403);
});

test('registration stores user name', async () => {
  const reg = await request(app)
    .post('/api/register')
    .send({ username: 'alice', password: 'pw', name: 'Alice' });
  assert.equal(reg.body.ok, true);
  const me = await request(app)
    .get('/api/me')
    .set('Authorization', 'Bearer ' + reg.body.token);
  assert.equal(me.body.user.name, 'Alice');
});

test.after(() => {
  if (original) fs.writeFileSync(USERS_DB_PATH, original);
  else fs.unlinkSync(USERS_DB_PATH);
});
