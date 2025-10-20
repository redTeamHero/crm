import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readKey, writeKey } from '../kvdb.js';

process.env.NODE_ENV = 'test';

const PORT = 4103;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
async function startServer(){
  return new Promise(resolve => {
    const proc = spawn('node', ['server.js'], {
      cwd: root,
      env: { ...process.env, PORT: String(PORT), START_SERVER_IN_TEST: 'true' }
    });
    proc.stdout.on('data', d => {
      if (d.toString().includes('CRM ready')) resolve(proc);
    });
  });
}

async function fetchJson(url, options){
  const res = await fetch(url, options);
  const json = await res.json().catch(()=> ({}));
  return { res, json };
}

function buildIdempotencyKey(prefix = 'job'){ return `iso-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

async function waitForJob(jobId, timeoutMs = 60000){
  const start = Date.now();
  while(Date.now() - start < timeoutMs){
    const { res, json } = await fetchJson(`http://localhost:${PORT}/api/jobs/${jobId}`);
    if (res.status === 404) throw new Error('Job not found');
    const status = json?.job?.status;
    if(status === 'completed') return json.job;
    if(status === 'failed') throw new Error(json.job?.error?.message || 'Job failed');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Timed out waiting for job completion');
}

await test('jobs with identical filenames are isolated', async () => {
  const originalDb = await readKey('consumers', { consumers: [] });
  const db = JSON.parse(JSON.stringify(originalDb));
  const base = db.consumers[0];
  const clone = { ...base, id: 'clone123', name: 'Second Consumer' };
  db.consumers.push(clone);
  await writeKey('consumers', db);

  const server = await startServer();
  try {
    const reportId = base.reports[0].id;
    const selection = { tradelineIndex: 0, bureaus: ['TransUnion'] };

    let res, json;
    ({ res, json } = await fetchJson(`http://localhost:${PORT}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-idempotency-key': buildIdempotencyKey('base') },
      body: JSON.stringify({ consumerId: base.id, reportId, selections: [selection], requestType: 'correct' })
    }));
    assert.equal(res.status, 202);
    const job1 = json.jobId;
    await waitForJob(job1);

    ({ res, json } = await fetchJson(`http://localhost:${PORT}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-idempotency-key': buildIdempotencyKey('clone') },
      body: JSON.stringify({ consumerId: clone.id, reportId: clone.reports[0].id, selections: [selection], requestType: 'correct' })
    }));
    assert.equal(res.status, 202);
    const job2 = json.jobId;
    await waitForJob(job2);

    const html1 = await (await fetch(`http://localhost:${PORT}/api/letters/${job1}/0.html`)).text();
    const html2 = await (await fetch(`http://localhost:${PORT}/api/letters/${job2}/0.html`)).text();
    assert.ok(html1.includes(base.name));
    assert.ok(html2.includes(clone.name));
    assert.notEqual(html1, html2);

    const zipRes1 = await fetch(`http://localhost:${PORT}/api/letters/${job1}/all.zip`);
    const buf1 = Buffer.from(await zipRes1.arrayBuffer());
    if(zipRes1.status === 200) assert.ok(buf1.length > 0);

    const zipRes2 = await fetch(`http://localhost:${PORT}/api/letters/${job2}/all.zip`);
    const buf2 = Buffer.from(await zipRes2.arrayBuffer());
    if(zipRes2.status === 200) assert.ok(buf2.length > 0);
  } finally {
    server.kill();
    await writeKey('consumers', originalDb);
  }
});
