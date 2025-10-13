import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { nanoid } from 'nanoid';
import { readKey, writeKey, deleteKey } from '../kvdb.js';
import { clearWorkflowConfigCache } from '../workflowEngine.js';

process.env.NODE_ENV = 'test';
const { default: app } = await import('../server.js');

const originalWorkflowConfig = await readKey('workflow_config_v1', null);
const originalConsumers = await readKey('consumers', null);
const originalState = await readKey('consumer_state', null);

async function login() {
  const res = await request(app).post('/api/login').send({ username: 'ducky', password: 'duck' });
  assert.equal(res.status, 200);
  return res.body.token;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

await test('workflow engine enforces dispute cadence and supports config overrides', async () => {
  const token = await login();
  const headers = authHeaders(token);

  const baseDb = await readKey('consumers', null);
  const baseConsumer = baseDb.consumers?.[0];
  assert.ok(baseConsumer, 'expected a base consumer to clone');
  const cloned = JSON.parse(JSON.stringify(baseConsumer));
  cloned.id = `wf_${nanoid(8)}`;
  cloned.name = 'Workflow Engine Test';
  cloned.reports = (cloned.reports || []).map((report) => ({
    ...report,
    id: `${report.id}_wf`,
  }));
  const dbClone = JSON.parse(JSON.stringify(baseDb));
  dbClone.consumers.push(cloned);
  await writeKey('consumers', dbClone);

  const stateSnapshot = (await readKey('consumer_state', null)) || { consumers: {}, trackerSteps: [] };
  stateSnapshot.consumers = stateSnapshot.consumers || {};
  stateSnapshot.consumers[cloned.id] = { events: [], files: [], reminders: [], tracker: {}, creditScore: null };
  await writeKey('consumer_state', stateSnapshot);

  const consumer = cloned;
  const report = consumer.reports[0];
  assert.ok(report, 'expected cloned report');

  const selection = { tradelineIndex: 0, bureaus: ['TransUnion'], specialMode: 'identity' };

  let res = await request(app)
    .post('/api/generate')
    .set(headers)
    .send({
      consumerId: consumer.id,
      reportId: report.id,
      selections: [selection],
      requestType: 'correct',
      workflow: { forceEnforce: true },
    });
  assert.equal(res.status, 200);

  res = await request(app)
    .post('/api/generate')
    .set(headers)
    .send({
      consumerId: consumer.id,
      reportId: report.id,
      selections: [selection],
      requestType: 'correct',
      workflow: { forceEnforce: true },
    });
  assert.equal(res.status, 409, 'second round should be blocked by cadence rule');
  assert.equal(res.body.validation.ok, false);
  const blockingRule = res.body.validation.results.find((rule) => !rule.ok);
  assert.ok(blockingRule?.metadata?.blocked?.some((entry) => entry.bureau === 'TransUnion'));

  const configRes = await request(app).get('/api/workflows/config').set(headers);
  assert.equal(configRes.status, 200);
  const config = configRes.body.config;
  assert.ok(config);
  const operations = config.operations || {};
  const lettersOp = operations['letters.generate'] || { rules: [] };
  lettersOp.rules = (lettersOp.rules || []).map((rule) =>
    rule.type === 'minInterval' ? { ...rule, intervalDays: 0 } : rule
  );
  operations['letters.generate'] = lettersOp;
  config.operations = operations;

  const updateRes = await request(app).put('/api/workflows/config').set(headers).send(config);
  assert.equal(updateRes.status, 200);

  res = await request(app)
    .post('/api/generate')
    .set(headers)
    .send({
      consumerId: consumer.id,
      reportId: report.id,
      selections: [selection],
      requestType: 'correct',
      workflow: { forceEnforce: true },
    });
  assert.equal(res.status, 200, 'cadence override should allow immediate rerun');
});

test.after(async () => {
  if (originalConsumers) {
    await writeKey('consumers', originalConsumers);
  } else {
    try {
      await deleteKey('consumers');
    } catch {}
  }
  if (originalState) {
    await writeKey('consumer_state', originalState);
  } else {
    try {
      await deleteKey('consumer_state');
    } catch {}
  }
  if (originalWorkflowConfig) {
    await writeKey('workflow_config_v1', originalWorkflowConfig);
  } else {
    try {
      await deleteKey('workflow_config_v1');
    } catch {}
  }
  clearWorkflowConfigCache();
});
