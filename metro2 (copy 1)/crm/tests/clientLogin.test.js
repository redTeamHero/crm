import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'db.json');

const original = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
const client = {
  id: 'c1',
  name: 'Test Client',
  email: 'client@example.com',
  password: bcrypt.hashSync('secret', 10),
  portalToken: 'tok123',
  reports: []
};
fs.writeFileSync(DB_PATH, JSON.stringify({ consumers: [client] }, null, 2));

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

test.after(() => {
  if (original) fs.writeFileSync(DB_PATH, original);
  else fs.unlinkSync(DB_PATH);
});
