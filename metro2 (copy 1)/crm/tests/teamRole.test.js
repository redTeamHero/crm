import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { JSDOM } from 'jsdom';
import { readKey, writeKey } from '../kvdb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMMON_JS_PATH = path.join(__dirname, '..', 'public', 'common.js');

function extractFunction(name) {
  const src = fs.readFileSync(COMMON_JS_PATH, 'utf8');
  const match = src.match(new RegExp(`function ${name}\\(([^)]*)\\)\\s*\\{([\\s\\S]*?)\n\\}`));
  if (!match) throw new Error(`Function ${name} not found`);
  return new Function(match[1], match[2]);
}

test('team member lifecycle issues team role token and updates roster', async () => {
  const original = await readKey('users', null);
  await writeKey('users', { users: [] });
  process.env.NODE_ENV = 'test';
  const { default: app } = await import('../server.js');

  const adminLogin = await request(app).post('/api/login').send({ username: 'ducky', password: 'duck' });
  const adminToken = adminLogin.body.token;

  const created = await request(app)
    .post('/api/team-members')
    .set('Authorization', 'Bearer ' + adminToken)
    .send({ username: 't1@example.com', name: 'T1', password: 'pw1' });
  assert.equal(created.status, 200);
  assert.equal(created.body.ok, true);
  assert.ok(created.body.member.token);
  assert.equal(created.body.member.email, 't1@example.com');
  assert.equal(created.body.member.name, 'T1');
  assert.equal(created.body.member.lastLoginAt, null);
  assert.ok(created.body.member.createdAt);
  const loginToken = created.body.member.token;

  const loginRes = await request(app).post(`/api/team/${loginToken}/login`).send({ password: 'pw1' });
  assert.equal(loginRes.body.ok, true);
  const payload = jwt.decode(loginRes.body.token);
  assert.equal(payload.role, 'team');

  const listRes = await request(app)
    .get('/api/team-members')
    .set('Authorization', 'Bearer ' + adminToken);
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.ok, true);
  assert.equal(listRes.body.members.length, 1);
  assert.equal(listRes.body.members[0].email, 't1@example.com');
  assert.equal(listRes.body.members[0].name, 'T1');
  assert.ok(listRes.body.members[0].lastLoginAt);

  const removeRes = await request(app)
    .delete(`/api/team-members/${listRes.body.members[0].id}`)
    .set('Authorization', 'Bearer ' + adminToken);
  assert.equal(removeRes.status, 200);
  assert.equal(removeRes.body.ok, true);

  const afterRemove = await request(app)
    .get('/api/team-members')
    .set('Authorization', 'Bearer ' + adminToken);
  assert.equal(afterRemove.body.members.length, 0);

  if (original) await writeKey('users', original);
  else await writeKey('users', { users: [] });
});

test('restrictRoutes redirects unauthorized paths for team', () => {
  const restrictRoutes = extractFunction('restrictRoutes');
  const loc = { pathname: '/dashboard', set href(v){ this.pathname = v; } };
  global.location = loc;
  restrictRoutes('team');
  assert.equal(loc.pathname, '/dashboard');
  delete global.location;
});

test('applyRoleNav removes disallowed nav items for team', () => {
  const applyRoleNav = extractFunction('applyRoleNav');
  const dom = new JSDOM(`<header>
    <div class="nav-shell">
      <div class="nav-brand-row">
        <div class="text-xl font-semibold">Metro 2 CRM</div>
        <button id="navToggle"></button>
      </div>
      <nav id="primaryNav">
        <div id="primaryNavLinks">
          <a href="/dashboard"></a>
          <a href="/clients"></a>
          <a href="/leads"></a>
          <a href="/marketing/sms"></a>
          <a href="/marketing/email"></a>
          <a href="/schedule"></a>
          <a href="/billing"></a>
          <a href="/admin"></a>
          <button id="btnInvite"></button>
          <button id="btnHelp"></button>
          <div id="tierBadge"></div>
        </div>
      </nav>
    </div>
  </header>`);
  global.document = dom.window.document;
  applyRoleNav('team');
  const nav = dom.window.document.getElementById('primaryNavLinks');
  const items = [...nav.children].map(el => el.tagName === 'A' ? el.getAttribute('href') : el.id);
  assert.deepEqual(items, ['/dashboard','/clients','/leads','/marketing/sms','/marketing/email','/schedule','/billing']);
  delete global.document;
});

test('applyRoleNav hides navigation for client role while preserving responsive state', () => {
  const applyRoleNav = extractFunction('applyRoleNav');
  const dom = new JSDOM(`<header>
    <div class="nav-shell">
      <div class="nav-brand-row">
        <div class="text-xl font-semibold">Metro 2 CRM</div>
        <button id="navToggle" class="btn"></button>
      </div>
      <nav id="primaryNav" class="flex">
        <div id="primaryNavLinks"></div>
      </nav>
    </div>
  </header>`);
  global.document = dom.window.document;
  const nav = dom.window.document.getElementById('primaryNav');
  const toggle = dom.window.document.getElementById('navToggle');

  applyRoleNav('client');
  assert.equal(nav.classList.contains('hidden'), true);
  assert.equal(nav.dataset.roleHidden, 'true');
  assert.equal(nav.getAttribute('aria-hidden'), 'true');
  assert.equal(toggle.classList.contains('hidden'), true);
  assert.equal(toggle.dataset.roleHidden, 'true');
  assert.equal(toggle.getAttribute('aria-hidden'), 'true');

  applyRoleNav('host');
  assert.equal(nav.classList.contains('hidden'), false);
  assert.equal(nav.dataset.roleHidden, undefined);
  assert.equal(nav.getAttribute('aria-hidden'), null);
  assert.equal(toggle.classList.contains('hidden'), false);
  assert.equal(toggle.dataset.roleHidden, undefined);
  assert.equal(toggle.getAttribute('aria-hidden'), null);

  delete global.document;
});

test('initResponsiveNav respects roleHidden flags on resize', () => {
  const initResponsiveNav = extractFunction('initResponsiveNav');
  const applyRoleNav = extractFunction('applyRoleNav');
  const dom = new JSDOM(`<header>
    <div class="nav-shell">
      <div class="nav-brand-row">
        <div class="text-xl font-semibold">Metro 2 CRM</div>
        <button id="navToggle" class="btn"></button>
      </div>
      <nav id="primaryNav" class="hidden flex" aria-label="Primary">
        <div id="primaryNavLinks"></div>
      </nav>
    </div>
  </header>`, { pretendToBeVisual: true });

  global.window = dom.window;
  global.document = dom.window.document;

  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, writable: true, value: 1024 });

  initResponsiveNav();
  applyRoleNav('client');

  const nav = dom.window.document.getElementById('primaryNav');
  const toggle = dom.window.document.getElementById('navToggle');

  assert.equal(nav.classList.contains('hidden'), true);
  assert.equal(nav.dataset.roleHidden, 'true');
  assert.equal(toggle.classList.contains('hidden'), true);
  assert.equal(toggle.dataset.roleHidden, 'true');

  dom.window.innerWidth = 1200;
  dom.window.dispatchEvent(new dom.window.Event('resize'));

  assert.equal(nav.classList.contains('hidden'), true);
  assert.equal(nav.dataset.roleHidden, 'true');
  assert.equal(toggle.classList.contains('hidden'), true);
  assert.equal(toggle.dataset.roleHidden, 'true');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');

  delete global.window;
  delete global.document;
});
