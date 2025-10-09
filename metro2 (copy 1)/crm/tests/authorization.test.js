import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { readKey, writeKey } from '../kvdb.js';

const originalUsers = await readKey('users', null);
let consumerId;
const consumersDb = await readKey('consumers', null);
if (consumersDb?.consumers?.length) {
  consumerId = consumersDb.consumers[0].id;
} else {
  consumerId = 'test-consumer';
  await writeKey('consumers', { consumers: [{ id: consumerId, name: 'Test', reports: [] }] });
}


const admin = { id: 'a1', username: 'admin', password: bcrypt.hashSync('secret', 10), role: 'admin', permissions: [] };
const member = { id: 'm1', username: 'member', password: bcrypt.hashSync('secret', 10), role: 'member', permissions: ['letters'] };
await writeKey('users', { users: [admin, member] });

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

test.after(async () => {
  if (originalUsers) await writeKey('users', originalUsers);
  else await writeKey('users', { users: [] });

});
