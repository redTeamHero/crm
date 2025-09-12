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
