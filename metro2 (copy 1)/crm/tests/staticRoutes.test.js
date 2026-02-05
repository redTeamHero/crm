import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { default: app } = await import('../server.js');

test('login route alias returns the same document as root', async () => {
  const [rootRes, loginRes] = await Promise.all([
    request(app).get('/'),
    request(app).get('/login'),
  ]);
  assert.equal(rootRes.status, 200);
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.headers['content-type']?.includes('text/html'), true);
  assert.equal(rootRes.text, loginRes.text);
  assert.match(loginRes.text, /Metro 2 CRM/);
});

test('client portal alias serves the legacy portal template', async () => {
  const [portalRes, legacyRes] = await Promise.all([
    request(app).get('/client-portal'),
    request(app).get('/client-portal.html'),
  ]);
  assert.equal(portalRes.status, 200);
  assert.equal(legacyRes.status, 200);
  assert.equal(portalRes.headers['content-type']?.includes('text/html'), true);
  assert.equal(portalRes.text, legacyRes.text);
  assert.match(portalRes.text, /Your Client Portal/i);
});
