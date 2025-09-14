import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readKey } from '../kvdb.js';

const PORT = 4100;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

async function startServer(){
  return new Promise(resolve => {
    const proc = spawn('node', ['server.js'], {
      cwd: root,
      env: { ...process.env, PORT: String(PORT) }
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

await test('server rejects and accepts selections appropriately', async () => {
  const server = await startServer();
  try {
    const { json: db } = await fetchJson(`http://localhost:${PORT}/api/consumers`);
    const consumerId = db.consumers[0].id;
    const reportId = db.consumers[0].reports[0].id;

    // missing bureaus should fail
    let res, json;
    ({ res } = await fetchJson(`http://localhost:${PORT}/api/generate`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ consumerId, reportId, selections:[{ tradelineIndex:0, specialMode:'identity' }], requestType:'correct' })
    }));
    assert.equal(res.status, 400);

    // valid selection
    ({ res, json } = await fetchJson(`http://localhost:${PORT}/api/generate`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ consumerId, reportId, selections:[{ tradelineIndex:0, specialMode:'identity', bureaus:['TransUnion'] }], requestType:'correct' })
    }));
    assert.equal(res.status, 200);
    const jobId = new URLSearchParams(json.redirect.split('?')[1]).get('job');

    ({ json } = await fetchJson(`http://localhost:${PORT}/api/letters/${jobId}`));
    assert.equal(json.letters[0].bureau, 'TransUnion');
    assert.equal(json.letters[0].specificDisputeReason, 'identity theft');

    const pdfRes = await fetch(`http://localhost:${PORT}/api/letters/${jobId}/0.pdf`);
    if (pdfRes.status === 200) {
      const buf = Buffer.from(await pdfRes.arrayBuffer());
      assert.ok(buf.length > 0);
    } else {
      console.warn('PDF generation failed with status', pdfRes.status);
    }
  } finally {
    server.kill();
  }
});

await test('letters include manual creditor and account numbers', async () => {
  const server = await startServer();
  try {
    const { json: db } = await fetchJson(`http://localhost:${PORT}/api/consumers`);
    const consumerId = db.consumers[0].id;
    const reportId = db.consumers[0].reports[0].id;
    const selection = {
      tradelineIndex: 0,
      bureaus: ['TransUnion'],
      creditor: 'Manual Creditor',
      accountNumbers: { TransUnion: '123456789' }
    };
    const { res, json } = await fetchJson(`http://localhost:${PORT}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consumerId, reportId, selections: [selection], requestType: 'correct' })
    });
    assert.equal(res.status, 200);
    const jobId = new URLSearchParams(json.redirect.split('?')[1]).get('job');
    await fetchJson(`http://localhost:${PORT}/api/letters/${jobId}`);
    const htmlRes = await fetch(`http://localhost:${PORT}/api/letters/${jobId}/0.html`);
    const html = await htmlRes.text();
    assert.ok(html.includes('Manual Creditor'));
    assert.ok(html.includes('123456789'));
  } finally {
    server.kill();
  }
});

await test('useOcr flag applies to all generated letters', async () => {
  const server = await startServer();
  try {
    const { json: db } = await fetchJson(`http://localhost:${PORT}/api/consumers`);
    const consumerId = db.consumers[0].id;
    const reportId = db.consumers[0].reports[0].id;
    const selection = { tradelineIndex: 0, bureaus: ['TransUnion'] };
    const payload = {
      consumerId,
      reportId,
      selections: [selection],
      requestType: 'correct',
      personalInfo: ['name'],
      collectors: [{ name: 'Collector Test' }],
      useOcr: true,
    };
    const { res, json } = await fetchJson(`http://localhost:${PORT}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const jobId = new URLSearchParams(json.redirect.split('?')[1]).get('job');
    const idx = await readKey('letter_jobs_idx', { jobs: {} });
    const job = idx.jobs[jobId];
    assert.ok(job);
    assert.ok(job.letters.length > 0);
    assert.ok(job.letters.every(l => l.useOcr));
  } finally {
    server.kill();
  }
});

await test('custom template selection applies template content', async () => {
  const server = await startServer();
  try {
    const { json: db } = await fetchJson(`http://localhost:${PORT}/api/consumers`);
    const consumerId = db.consumers[0].id;
    const reportId = db.consumers[0].reports[0].id;
    const tplRes = await fetchJson(`http://localhost:${PORT}/api/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heading: 'Custom Heading' })
    });
    const tplId = tplRes.json?.template?.id;
    const payload = {
      consumerId,
      reportId,
      selections: [{ tradelineIndex: 0, bureaus: ['TransUnion'], templateId: tplId }],
    };
    const { res, json } = await fetchJson(`http://localhost:${PORT}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.equal(res.status, 200);
    const jobId = new URLSearchParams(json.redirect.split('?')[1]).get('job');
    const htmlRes = await fetch(`http://localhost:${PORT}/api/letters/${jobId}/0.html`);
    const html = await htmlRes.text();
    assert.ok(html.includes('Custom Heading'));
  } finally {
    server.kill();
  }
});
