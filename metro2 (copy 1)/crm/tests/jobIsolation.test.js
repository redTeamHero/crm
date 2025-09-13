import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = 4103;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const DB_PATH = path.join(root, 'db.json');

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

await test('jobs with identical filenames are isolated', async () => {
  const originalDb = fs.readFileSync(DB_PATH, 'utf8');
  const db = JSON.parse(originalDb);
  const base = db.consumers[0];
  const clone = JSON.parse(JSON.stringify(base));
  clone.id = 'clone123';
  clone.name = 'Second Consumer';
  db.consumers.push(clone);
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

  const server = await startServer();
  try {
    const reportId = base.reports[0].id;
    const selection = { tradelineIndex: 0, bureaus: ['TransUnion'] };

    let res, json;
    ({ res, json } = await fetchJson(`http://localhost:${PORT}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consumerId: base.id, reportId, selections: [selection], requestType: 'correct' })
    }));
    assert.equal(res.status, 200);
    const job1 = new URLSearchParams(json.redirect.split('?')[1]).get('job');

    ({ res, json } = await fetchJson(`http://localhost:${PORT}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consumerId: clone.id, reportId: clone.reports[0].id, selections: [selection], requestType: 'correct' })
    }));
    assert.equal(res.status, 200);
    const job2 = new URLSearchParams(json.redirect.split('?')[1]).get('job');

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
    fs.writeFileSync(DB_PATH, originalDb);
  }
});
