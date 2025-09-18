import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { readKey, writeKey, deleteKey } from '../kvdb.js';

const originalSettings = await readKey('settings', null);
const originalNodeEnv = process.env.NODE_ENV;
const originalEnv = {
  SCM_API_KEY: process.env.SCM_API_KEY,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
};

await writeKey('settings', {
  hibpApiKey: '',
  rssFeedUrl: 'https://example.com/rss',
  googleCalendarToken: '',
  googleCalendarId: '',
  stripeApiKey: '',
  envOverrides: { SCM_API_KEY: 'boot-seeded-key' },
});

delete process.env.SCM_API_KEY;
delete process.env.TWILIO_AUTH_TOKEN;
process.env.NODE_ENV = 'test';

const { default: app } = await import('../server.js');

test('hydrates stored env overrides on startup', () => {
  assert.equal(process.env.SCM_API_KEY, 'boot-seeded-key');
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

test.after(async () => {
  if (originalSettings === null) await deleteKey('settings');
  else await writeKey('settings', originalSettings);

  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalEnv.SCM_API_KEY === undefined) delete process.env.SCM_API_KEY;
  else process.env.SCM_API_KEY = originalEnv.SCM_API_KEY;

  if (originalEnv.TWILIO_AUTH_TOKEN === undefined) delete process.env.TWILIO_AUTH_TOKEN;
  else process.env.TWILIO_AUTH_TOKEN = originalEnv.TWILIO_AUTH_TOKEN;
});
