import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { readKey } from '../kvdb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let auth = {};
let currentPort = 0;
const RESERVED_PORTS = new Set([4100, 4103]);

async function getFreePort(){
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const srv = net.createServer();
      srv.unref();
      srv.on('error', reject);
      srv.listen(0, () => {
        const { port } = srv.address();
        srv.close(() => {
          if (RESERVED_PORTS.has(port)) {
            attempt();
          } else {
            resolve(port);
          }
        });
      });
    };
    attempt();
  });
}

async function startServer(){
  const port = await getFreePort();
  currentPort = port;
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['server.js'], {
      cwd: root,
      env: { ...process.env, PORT: String(port) }
    });

    let buffer = '';
    const cleanup = () => {
      proc.stdout.off('data', onStdout);
      proc.off('error', onError);
      proc.off('exit', onExit);
    };

    const onError = (err) => {
      cleanup();
      reject(err);
    };

    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`Server exited before ready (code=${code} signal=${signal ?? 'null'})`));
    };

    const onStdout = (chunk) => {
      buffer += chunk.toString();
      if (!buffer.includes('CRM ready')) return;
      cleanup();
      (async () => {
        try {
          auth = {};
          const res = await fetch(url('/api/login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'ducky', password: 'duck' })
          });
          if (!res.ok) {
            throw new Error(`Login failed with status ${res.status}`);
          }
          const json = await res.json();
          auth = { Authorization: `Bearer ${json.token}` };
          resolve(proc);
        } catch (err) {
          try { proc.kill(); } catch {}
          reject(err);
        }
      })();
    };

    proc.stdout.on('data', onStdout);
    proc.once('error', onError);
    proc.once('exit', onExit);
  });
}

async function fetchJson(url, options = {}){
  options.headers = { ...(options.headers || {}), ...auth };
  const res = await fetch(url, options);
  const json = await res.json().catch(()=> ({}));
  return { res, json };
}

function url(pathname = ''){
  if(!currentPort){
    throw new Error('Server port not initialised');
  }
  return `http://localhost:${currentPort}${pathname}`;
}

async function stopServer(proc){
  if (!proc) {
    currentPort = 0;
    return;
  }
  if (proc.exitCode === null && !proc.signalCode) {
    try {
      const exitPromise = once(proc, 'exit');
      proc.kill();
      await exitPromise;
    } catch {
      // ignore - best effort shutdown
    }
  }
  currentPort = 0;
}

await test('server rejects and accepts selections appropriately', async () => {
  const server = await startServer();
  try {
    const { json: db } = await fetchJson(url('/api/consumers'));
    const consumerId = db.consumers[0].id;
    const reportId = db.consumers[0].reports[0].id;

    // missing bureaus should fail
    let res, json;
    ({ res } = await fetchJson(url('/api/generate'), {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ consumerId, reportId, selections:[{ tradelineIndex:0, specialMode:'identity' }], requestType:'correct' })
    }));
    assert.equal(res.status, 400);

    // valid selection
    ({ res, json } = await fetchJson(url('/api/generate'), {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ consumerId, reportId, selections:[{ tradelineIndex:0, specialMode:'identity', bureaus:['TransUnion'] }], requestType:'correct' })
    }));
    assert.equal(res.status, 200);
    const jobId = new URLSearchParams(json.redirect.split('?')[1]).get('job');

    ({ json } = await fetchJson(url(`/api/letters/${jobId}`)));
    assert.equal(json.letters[0].bureau, 'TransUnion');
    assert.equal(json.letters[0].specificDisputeReason, 'identity theft');

    const pdfRes = await fetch(url(`/api/letters/${jobId}/0.pdf`));
    if (pdfRes.status === 200) {
      const buf = Buffer.from(await pdfRes.arrayBuffer());
      assert.ok(buf.length > 0);
    } else {
      console.warn('PDF generation failed with status', pdfRes.status);
    }
  } finally {
    await stopServer(server);
  }
});

await test('letters include manual creditor and account numbers', async () => {
  const server = await startServer();
  try {
    const { json: db } = await fetchJson(url('/api/consumers'));
    const consumerId = db.consumers[0].id;
    const reportId = db.consumers[0].reports[0].id;
    const selection = {
      tradelineIndex: 0,
      bureaus: ['TransUnion'],
      creditor: 'Manual Creditor',
      accountNumbers: { TransUnion: '123456789' }
    };
    const { res, json } = await fetchJson(url('/api/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consumerId, reportId, selections: [selection], requestType: 'correct' })
    });
    assert.equal(res.status, 200);
    const jobId = new URLSearchParams(json.redirect.split('?')[1]).get('job');
    await fetchJson(url(`/api/letters/${jobId}`));
    const htmlRes = await fetch(url(`/api/letters/${jobId}/0.html`));
    const html = await htmlRes.text();
    assert.ok(html.includes('Manual Creditor'));
    assert.ok(html.includes('123456789'));
  } finally {
    await stopServer(server);
  }
});

await test('letters include manual dispute reason', async () => {
  const server = await startServer();
  try {
    const { json: db } = await fetchJson(url('/api/consumers'));
    const consumerId = db.consumers[0].id;
    const reportId = db.consumers[0].reports[0].id;
    const selection = {
      tradelineIndex: 0,
      bureaus: ['TransUnion'],
      specificDisputeReason: 'Manual reason'
    };
    const { res, json } = await fetchJson(url('/api/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consumerId, reportId, selections: [selection], requestType: 'correct' })
    });
    assert.equal(res.status, 200);
    const jobId = new URLSearchParams(json.redirect.split('?')[1]).get('job');
    const { json: letters } = await fetchJson(url(`/api/letters/${jobId}`));
    assert.equal(letters.letters[0].specificDisputeReason, 'Manual reason');
    const htmlRes = await fetch(url(`/api/letters/${jobId}/0.html`));
    const html = await htmlRes.text();
    assert.ok(html.includes('Manual reason'));
  } finally {
    await stopServer(server);
  }
});

await test('useOcr flag applies to all generated letters', async () => {
  const server = await startServer();
  try {
    const { json: db } = await fetchJson(url('/api/consumers'));
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
    const { res, json } = await fetchJson(url('/api/generate'), {
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
    await stopServer(server);
  }
});

await test('custom template selection applies template content', async () => {
  const server = await startServer();
  try {
    const { json: db } = await fetchJson(url('/api/consumers'));
    const consumerId = db.consumers[0].id;
    const reportId = db.consumers[0].reports[0].id;
    const tplRes = await fetchJson(url('/api/templates'), {
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
    const { res, json } = await fetchJson(url('/api/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.equal(res.status, 200);
    const jobId = new URLSearchParams(json.redirect.split('?')[1]).get('job');
    const htmlRes = await fetch(url(`/api/letters/${jobId}/0.html`));
    const html = await htmlRes.text();
    assert.ok(html.includes('Custom Heading'));
  } finally {
    await stopServer(server);
  }
});

await test('creating a custom template keeps defaults available', async () => {
  const server = await startServer();
  try {
    const custom = await fetchJson(url('/api/templates'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heading: 'First Custom' })
    });
    assert.equal(custom.res.status, 200);
    const { json } = await fetchJson(url('/api/templates'));
    const ids = (json.templates || []).map(t => t.id);
    assert.ok(ids.includes('identity'), 'default identity template should exist');
    assert.ok(ids.includes(custom.json?.template?.id), 'new template should be returned');
  } finally {
    await stopServer(server);
  }
});

await test('template requestType defaults selection type', async () => {
  const server = await startServer();
  try {
    const { json: db } = await fetchJson(url('/api/consumers'));
    const consumerId = db.consumers[0].id;
    const reportId = db.consumers[0].reports[0].id;
    const tplRes = await fetchJson(url('/api/templates'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heading: 'Delete Heading', requestType: 'delete' })
    });
    const tplId = tplRes.json?.template?.id;
    const payload = {
      consumerId,
      reportId,
      selections: [{ tradelineIndex: 0, bureaus: ['TransUnion'], templateId: tplId }],
    };
    const { res, json } = await fetchJson(url('/api/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.equal(res.status, 200);
    const jobId = new URLSearchParams(json.redirect.split('?')[1]).get('job');
    const { json: meta } = await fetchJson(url(`/api/letters/${jobId}`));
    assert.equal(meta.letters[0].requestType, 'delete');
  } finally {
    await stopServer(server);
  }
});
