import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs/promises';

process.env.NODE_ENV = 'test';
const { default: app } = await import('../server.js');

const reportPath = new URL('../data/report.html', import.meta.url);

test('uploading a report populates violations', async () => {
  const reportHtml = await fs.readFile(reportPath);
  const create = await request(app).post('/api/consumers').send({ name: 'Test User' });
  assert.equal(create.status, 200);
  const id = create.body.consumer.id;

  const upload = await request(app)
    .post(`/api/consumers/${id}/upload`)
    .attach('file', reportHtml, 'report.html');
  assert.equal(upload.status, 200);
  const rid = upload.body.reportId;
  assert.ok(rid);

  const fetched = await request(app).get(`/api/consumers/${id}/report/${rid}`);
  assert.equal(fetched.status, 200);
  const tlines = fetched.body.report.tradelines || [];
  const has = tlines.some(tl => (tl.violations || []).length > 0);
  assert.equal(has, true);
});

test('uploading two reports stores both with violations', async () => {
  const reportHtml = await fs.readFile(reportPath);
  const create = await request(app).post('/api/consumers').send({ name: 'Repeat User' });
  assert.equal(create.status, 200);
  const id = create.body.consumer.id;

  const upload1 = await request(app)
    .post(`/api/consumers/${id}/upload`)
    .attach('file', reportHtml, 'report.html');
  assert.equal(upload1.status, 200);
  const rid1 = upload1.body.reportId;
  assert.ok(rid1);

  const upload2 = await request(app)
    .post(`/api/consumers/${id}/upload`)
    .attach('file', reportHtml, 'report.html');
  assert.equal(upload2.status, 200);
  const rid2 = upload2.body.reportId;
  assert.ok(rid2);

  const fetched1 = await request(app).get(`/api/consumers/${id}/report/${rid1}`);
  assert.equal(fetched1.status, 200);
  const tlines1 = fetched1.body.report.tradelines || [];
  const has1 = tlines1.some(tl => (tl.violations || []).length > 0);
  assert.equal(has1, true);

  const fetched2 = await request(app).get(`/api/consumers/${id}/report/${rid2}`);
  assert.equal(fetched2.status, 200);
  const tlines2 = fetched2.body.report.tradelines || [];
  const has2 = tlines2.some(tl => (tl.violations || []).length > 0);
  assert.equal(has2, true);
});
