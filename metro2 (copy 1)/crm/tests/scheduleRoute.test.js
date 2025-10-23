import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { readKey, writeKey, deleteKey } from '../kvdb.js';
import { clearCalendarCache } from '../googleCalendar.js';

process.env.NODE_ENV = 'test';
const { default: app } = await import('../server.js');

const originalSettings = await readKey('settings', null);
const originalFallbackEvents = await readKey('calendar_events', null);

test('schedule page renders without Google Calendar credentials', { concurrency: false }, async () => {
  const sanitizedSettings = { ...(originalSettings || {}) };
  sanitizedSettings.googleCalendarToken = '';
  sanitizedSettings.googleCalendarId = '';
  await writeKey('settings', sanitizedSettings);
  await writeKey('calendar_events', []);
  await clearCalendarCache();

  const scheduleRes = await request(app).get('/schedule');
  assert.equal(scheduleRes.status, 200);
  assert.equal(scheduleRes.headers['x-calendar-mode'], 'local');
  assert.match(scheduleRes.text, /Schedule/);

  const base = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  base.setHours(15, 0, 0, 0);
  const end = new Date(base.getTime() + 45 * 60 * 1000);
  const startIso = base.toISOString();
  const endIso = end.toISOString();

  const createRes = await request(app)
    .post('/api/calendar/events')
    .send({
      summary: 'Test local consult',
      description: 'Consult',
      start: { dateTime: startIso },
      end: { dateTime: endIso },
    });
  assert.equal(createRes.status, 200);
  assert.equal(createRes.body.mode, 'local');

  const eventsRes = await request(app).get('/api/calendar/events');
  assert.equal(eventsRes.status, 200);
  assert.equal(eventsRes.body.mode, 'local');
  assert.ok(Array.isArray(eventsRes.body.events));
  assert.equal(eventsRes.body.events.length, 1);
  assert.equal(eventsRes.body.events[0].summary, 'Test local consult');
  assert.equal(eventsRes.body.events[0].start?.dateTime, startIso);
});

test.after(async () => {
  if (originalSettings === null) {
    await deleteKey('settings');
  } else {
    await writeKey('settings', originalSettings);
  }

  if (originalFallbackEvents === null) {
    await deleteKey('calendar_events');
  } else {
    await writeKey('calendar_events', originalFallbackEvents);
  }

  await clearCalendarCache();
});
