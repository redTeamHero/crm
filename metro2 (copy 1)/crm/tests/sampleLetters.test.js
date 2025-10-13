import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';

const PORT = 4100;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let auth = {};

async function startServer(){
  return new Promise(resolve => {
    const proc = spawn('node', ['server.js'], {
      cwd: root,
      env: { ...process.env, PORT: String(PORT), START_SERVER_IN_TEST: 'true' }
    });
    proc.stdout.on('data', async d => {
      if (d.toString().includes('CRM ready')) {
        const login = await fetchJson(`http://localhost:${PORT}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'ducky', password: 'duck' })
        });
        auth = { Authorization: `Bearer ${login.json.token}` };
        resolve(proc);
      }
    });
  });
}

async function fetchJson(url, options = {}){
  options.headers = { ...(options.headers || {}), ...auth };
  const res = await fetch(url, options);
  const json = await res.json().catch(()=> ({}));
  return { res, json };
}

await test('sample letter templates are served', async () => {
  const server = await startServer();
  try {
    const { json } = await fetchJson(`http://localhost:${PORT}/api/sample-letters`);
    assert.ok(Array.isArray(json.templates) && json.templates.length >= 13);
    const tpl = json.templates.find(t => t.id === 'bankruptcy-misreporting');
    assert.equal(tpl.name, 'Bankruptcy Misreporting Letter');
  } finally {
    server.kill();
  }
});

