import test from 'node:test';
import assert from 'node:assert/strict';

import { writeKey, readKey, deleteKey } from '../kvdb.js';
import { listEvents, freeBusy, clearCalendarCache } from '../googleCalendar.js';

const ORIGINAL_SETTINGS = await readKey('settings', null);
const ORIGINAL_FETCH = global.fetch;

async function seedGoogleSettings() {
  await writeKey('settings', {
    googleCalendarToken: 'test-token',
    googleCalendarId: 'calendar@example.com',
  });
  await clearCalendarCache();
}

test('listEvents memoizes Google responses within the TTL', { concurrency: false }, async () => {
  await seedGoogleSettings();
  let calls = 0;
  const payload = {
    items: [
      {
        id: 'evt_1',
        summary: 'Discovery Call',
        start: { dateTime: '2024-01-01T10:00:00Z' },
        end: { dateTime: '2024-01-01T11:00:00Z' },
      },
    ],
  };
  const prevFetch = global.fetch;
  global.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  };

  try {
    const first = await listEvents(5);
    assert.equal(first.mode, 'google');
    assert.equal(first.events.length, 1);
    assert.equal(calls, 1);

    const second = await listEvents(5);
    assert.equal(second.events.length, 1);
    assert.equal(calls, 1, 'should reuse cached calendar events');
  } finally {
    global.fetch = prevFetch;
  }
});

test('listEvents falls back to cached copy when Google is unavailable', { concurrency: false }, async () => {
  await seedGoogleSettings();
  const payload = {
    items: [
      {
        id: 'evt_cached',
        summary: 'Follow-up',
        start: { dateTime: '2024-01-02T10:00:00Z' },
        end: { dateTime: '2024-01-02T11:00:00Z' },
      },
    ],
  };

  let call = 0;
  const prevFetch = global.fetch;
  global.fetch = async () => {
    call += 1;
    if (call === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      };
    }
    throw new Error('network down');
  };

  try {
    await listEvents(10);

    // Force the cached entry to appear stale to exercise the fallback branch.
    await writeKey('calendar_cache_events', {
      '10': { cachedAt: Date.now() - 90_000, value: payload.items },
    });

    const cachedResponse = await listEvents(10);
    assert.equal(cachedResponse.events[0].id, 'evt_cached');
    assert.match(cachedResponse.notice, /cached/i);
  } finally {
    global.fetch = prevFetch;
  }
});

test('freeBusy caches responses per range and reuses them', { concurrency: false }, async () => {
  await seedGoogleSettings();
  let calls = 0;
  const fbPayload = {
    calendars: {
      'calendar@example.com': {
        busy: [
          { start: '2024-01-01T10:00:00Z', end: '2024-01-01T11:00:00Z' },
        ],
      },
    },
  };
  const prevFetch = global.fetch;
  global.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => fbPayload,
      text: async () => JSON.stringify(fbPayload),
    };
  };

  try {
    const range = { timeMin: '2024-01-01T00:00:00Z', timeMax: '2024-01-01T23:59:59Z' };
    const first = await freeBusy(range.timeMin, range.timeMax);
    assert.equal(first.fb.calendars['calendar@example.com'].busy.length, 1);
    assert.equal(calls, 1);

    const second = await freeBusy(range.timeMin, range.timeMax);
    assert.equal(second.fb.calendars['calendar@example.com'].busy.length, 1);
    assert.equal(calls, 1, 'freeBusy should reuse cached availability');
  } finally {
    global.fetch = prevFetch;
  }
});

test.after(async () => {
  if (ORIGINAL_SETTINGS === null) {
    await deleteKey('settings');
  } else {
    await writeKey('settings', ORIGINAL_SETTINGS);
  }
  await clearCalendarCache();
  global.fetch = ORIGINAL_FETCH;
});
