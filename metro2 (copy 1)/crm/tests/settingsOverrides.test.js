import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { readKey, writeKey, deleteKey } from '../kvdb.js';

const originalSettings = await readKey('settings', null);
const originalNodeEnv = process.env.NODE_ENV;
const originalEnv = {
  SCM_API_KEY: process.env.SCM_API_KEY,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  MARKETING_API_BASE_URL: process.env.MARKETING_API_BASE_URL,
  MARKETING_API_KEY: process.env.MARKETING_API_KEY,
  GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN,
};

await writeKey('settings', {
  hibpApiKey: '',
  rssFeedUrl: 'https://example.com/rss',
  googleCalendarToken: '',
  googleCalendarId: '',
  stripeApiKey: '',
  marketingApiBaseUrl: 'https://marketing.local',
  marketingApiKey: 'seed-marketing-key',
  sendCertifiedMailApiKey: 'boot-scm-key',
  gmailClientId: 'seed-client-id',
  gmailClientSecret: 'seed-client-secret',
  gmailRefreshToken: 'seed-refresh',
  envOverrides: { SCM_API_KEY: 'boot-seeded-key' },
});

delete process.env.SCM_API_KEY;
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.MARKETING_API_BASE_URL;
delete process.env.MARKETING_API_KEY;
delete process.env.GMAIL_CLIENT_ID;
delete process.env.GMAIL_CLIENT_SECRET;
delete process.env.GMAIL_REFRESH_TOKEN;
process.env.NODE_ENV = 'test';

const { default: app } = await import('../server.js');

test('hydrates stored env overrides on startup', () => {
  assert.equal(process.env.SCM_API_KEY, 'boot-seeded-key');
  assert.equal(process.env.MARKETING_API_BASE_URL, 'https://marketing.local');
  assert.equal(process.env.MARKETING_API_KEY, 'seed-marketing-key');
  assert.equal(process.env.GMAIL_CLIENT_ID, 'seed-client-id');
  assert.equal(process.env.GMAIL_CLIENT_SECRET, 'seed-client-secret');
  assert.equal(process.env.GMAIL_REFRESH_TOKEN, 'seed-refresh');
});

test('saving env overrides normalizes keys and hydrates process.env', async () => {
  const res = await request(app)
    .post('/api/settings')
    .send({
      envOverrides: {
        'scm api key': 'runtime-key',
        'twilio.auth-token': 'abc123',
      },
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.settings.envOverrides.SCM_API_KEY, 'runtime-key');
  assert.equal(res.body.settings.envOverrides.TWILIO_AUTH_TOKEN, 'abc123');
  assert.equal(process.env.SCM_API_KEY, 'runtime-key');
  assert.equal(process.env.TWILIO_AUTH_TOKEN, 'abc123');
});

test('saving integration keys trims whitespace and hydrates process.env', async () => {
  const res = await request(app)
    .post('/api/settings')
    .send({
      marketingApiBaseUrl: ' https://api.marketing.local ',
      marketingApiKey: '\tworker-key\n',
      sendCertifiedMailApiKey: ' live-scm ',
      gmailClientId: ' client-id ',
      gmailClientSecret: ' client-secret ',
      gmailRefreshToken: ' refresh-token ',
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.settings.marketingApiBaseUrl, 'https://api.marketing.local');
  assert.equal(res.body.settings.marketingApiKey, 'worker-key');
  assert.equal(res.body.settings.sendCertifiedMailApiKey, 'live-scm');
  assert.equal(res.body.settings.gmailClientId, 'client-id');
  assert.equal(res.body.settings.gmailClientSecret, 'client-secret');
  assert.equal(res.body.settings.gmailRefreshToken, 'refresh-token');

  assert.equal(process.env.MARKETING_API_BASE_URL, 'https://api.marketing.local');
  assert.equal(process.env.MARKETING_API_KEY, 'worker-key');
  assert.equal(process.env.SCM_API_KEY, 'live-scm');
  assert.equal(process.env.GMAIL_CLIENT_ID, 'client-id');
  assert.equal(process.env.GMAIL_CLIENT_SECRET, 'client-secret');
  assert.equal(process.env.GMAIL_REFRESH_TOKEN, 'refresh-token');
});

test.after(async () => {
  if (originalSettings === null) await deleteKey('settings');
  else await writeKey('settings', originalSettings);

  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalEnv.SCM_API_KEY === undefined) delete process.env.SCM_API_KEY;
  else process.env.SCM_API_KEY = originalEnv.SCM_API_KEY;

  if (originalEnv.TWILIO_AUTH_TOKEN === undefined) delete process.env.TWILIO_AUTH_TOKEN;
  else process.env.TWILIO_AUTH_TOKEN = originalEnv.TWILIO_AUTH_TOKEN;

  if (originalEnv.MARKETING_API_BASE_URL === undefined) delete process.env.MARKETING_API_BASE_URL;
  else process.env.MARKETING_API_BASE_URL = originalEnv.MARKETING_API_BASE_URL;

  if (originalEnv.MARKETING_API_KEY === undefined) delete process.env.MARKETING_API_KEY;
  else process.env.MARKETING_API_KEY = originalEnv.MARKETING_API_KEY;

  if (originalEnv.GMAIL_CLIENT_ID === undefined) delete process.env.GMAIL_CLIENT_ID;
  else process.env.GMAIL_CLIENT_ID = originalEnv.GMAIL_CLIENT_ID;

  if (originalEnv.GMAIL_CLIENT_SECRET === undefined) delete process.env.GMAIL_CLIENT_SECRET;
  else process.env.GMAIL_CLIENT_SECRET = originalEnv.GMAIL_CLIENT_SECRET;

  if (originalEnv.GMAIL_REFRESH_TOKEN === undefined) delete process.env.GMAIL_REFRESH_TOKEN;
  else process.env.GMAIL_REFRESH_TOKEN = originalEnv.GMAIL_REFRESH_TOKEN;
});
