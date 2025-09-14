import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs/promises';

process.env.NODE_ENV = 'test';
const { default: app } = await import('../server.js');

const reportPath = new URL('../data/report.html', import.meta.url);

test('editing a tradeline updates stored report', async () => {
  const reportHtml = await fs.readFile(reportPath);
  const login = await request(app).post('/api/login').send({ username: 'ducky', password: 'duck' });
  assert.equal(login.status, 200);
  const token = login.body.token;
  const auth = { Authorization: `Bearer ${token}` };

  const create = await request(app).post('/api/consumers').set(auth).send({ name: 'Edit TL' });
  assert.equal(create.status, 200);
  const id = create.body.consumer.id;

  const upload = await request(app)
    .post(`/api/consumers/${id}/upload`)
    .set(auth)
    .attach('file', reportHtml, 'report.html');
  assert.equal(upload.status, 200);
  const rid = upload.body.reportId;

  const newCreditor = 'Edited Creditor';
  const put = await request(app)
    .put(`/api/consumers/${id}/report/${rid}/tradeline/0`)
    .set(auth)
    .send({ creditor: newCreditor, per_bureau: { TransUnion: { account_number: '0000' } } });
  assert.equal(put.status, 200);
  assert.equal(put.body.ok, true);
  assert.equal(put.body.tradeline.meta.creditor, newCreditor);
  assert.equal(put.body.tradeline.per_bureau.TransUnion.account_number, '0000');

  const fetched = await request(app).get(`/api/consumers/${id}/report/${rid}`).set(auth);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.report.tradelines[0].meta.creditor, newCreditor);
  assert.equal(fetched.body.report.tradelines[0].per_bureau.TransUnion.account_number, '0000');
});
