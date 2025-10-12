import nodeFetch from 'node-fetch';
import { readKey, writeKey } from './kvdb.js';

const fetchFn = globalThis.fetch || nodeFetch;
const FALLBACK_KEY = 'calendar_events';

function normalizeString(value = '') {
  return typeof value === 'string' ? value.trim() : '';
}

async function getConfig() {
  const settings = await readKey('settings', {});
  const token = normalizeString(settings.googleCalendarToken || '');
  const calendarId = normalizeString(settings.googleCalendarId || '');
  return {
    token,
    calendarId,
    hasApi: Boolean(token && calendarId)
  };
}

async function loadFallbackEvents() {
  const stored = await readKey(FALLBACK_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored;
}

async function saveFallbackEvents(events) {
  await writeKey(FALLBACK_KEY, Array.isArray(events) ? events : []);
}

function ensureEventShape(event) {
  const id = event?.id || `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const start = event?.start && typeof event.start === 'object' ? event.start : {};
  const end = event?.end && typeof event.end === 'object' ? event.end : start;
  return {
    ...event,
    id,
    start,
    end
  };
}

function getComparableDate(event) {
  const start = event?.start || {};
  if (start.dateTime) return start.dateTime;
  if (start.date) return `${start.date}T00:00:00Z`;
  return '';
}

function buildNotice(hasApi) {
  return hasApi
    ? ''
    : 'Google Calendar not connected. Events stay inside the CRM until you add credentials.';
}

async function apiRequest(url, options = {}) {
  const { token, hasApi } = await getConfig();
  if (!hasApi) {
    throw new Error('Google Calendar not configured');
  }
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`
  };
  const resp = await fetchFn(url, { ...options, headers });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Calendar API error ${resp.status}: ${text}`);
  }
  if (resp.status === 204) return null;
  return resp.json();
}

export async function listEvents(maxResults = 10) {
  const config = await getConfig();
  const notice = buildNotice(config.hasApi);
  if (!config.hasApi) {
    const nowIso = new Date().toISOString();
    const events = (await loadFallbackEvents())
      .map(ensureEventShape)
      .filter((ev) => {
        const key = getComparableDate(ev);
        return !key || key >= nowIso;
      })
      .sort((a, b) => getComparableDate(a).localeCompare(getComparableDate(b)))
      .slice(0, maxResults);
    return { events, mode: 'local', notice };
  }
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(new Date().toISOString())}&maxResults=${maxResults}`;
  const data = await apiRequest(url, { method: 'GET' });
  return { events: data.items || [], mode: 'google', notice };
}

export async function createEvent(event) {
  const config = await getConfig();
  const notice = buildNotice(config.hasApi);
  if (!config.hasApi) {
    const events = await loadFallbackEvents();
    const shaped = ensureEventShape({ ...event });
    events.push(shaped);
    await saveFallbackEvents(events);
    return { event: shaped, mode: 'local', notice };
  }
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`;
  const created = await apiRequest(url, { method: 'POST', body: JSON.stringify(event) });
  return { event: created, mode: 'google', notice };
}

export async function updateEvent(eventId, event) {
  const config = await getConfig();
  const notice = buildNotice(config.hasApi);
  if (!config.hasApi) {
    const events = await loadFallbackEvents();
    const shaped = ensureEventShape({ ...event, id: eventId });
    const idx = events.findIndex((ev) => ev.id === eventId);
    if (idx >= 0) {
      events[idx] = shaped;
    } else {
      events.push(shaped);
    }
    await saveFallbackEvents(events);
    return { event: shaped, mode: 'local', notice };
  }
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(eventId)}`;
  const updated = await apiRequest(url, { method: 'PATCH', body: JSON.stringify(event) });
  return { event: updated, mode: 'google', notice };
}

export async function deleteEvent(eventId) {
  const config = await getConfig();
  const notice = buildNotice(config.hasApi);
  if (!config.hasApi) {
    const events = await loadFallbackEvents();
    const remaining = events.filter((ev) => ev.id !== eventId);
    await saveFallbackEvents(remaining);
    return { mode: 'local', notice };
  }
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(eventId)}`;
  await apiRequest(url, { method: 'DELETE' });
  return { mode: 'google', notice };
}

function toBusySlot(event) {
  if (!event) return null;
  const start = event.start || {};
  const end = event.end || {};
  if (start.dateTime || end.dateTime) {
    return {
      start: start.dateTime || `${start.date}T00:00:00Z`,
      end: end.dateTime || start.dateTime || `${end.date || start.date}T23:59:59Z`
    };
  }
  if (start.date) {
    const endDate = end.date || start.date;
    return {
      start: `${start.date}T00:00:00Z`,
      end: `${endDate}T23:59:59Z`
    };
  }
  return null;
}

function overlaps(slot, timeMin, timeMax) {
  if (!slot) return false;
  const start = new Date(slot.start).getTime();
  const end = new Date(slot.end || slot.start).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  const min = timeMin ? new Date(timeMin).getTime() : start;
  const max = timeMax ? new Date(timeMax).getTime() : end;
  return start <= max && end >= min;
}

export async function freeBusy(timeMin, timeMax) {
  const config = await getConfig();
  const notice = buildNotice(config.hasApi);
  if (!config.hasApi) {
    const events = await loadFallbackEvents();
    const busy = events
      .map(ensureEventShape)
      .map(toBusySlot)
      .filter((slot) => overlaps(slot, timeMin, timeMax));
    return {
      fb: {
        calendars: {
          local: {
            busy
          }
        }
      },
      mode: 'local',
      notice
    };
  }
  const url = 'https://www.googleapis.com/calendar/v3/freeBusy';
  const body = {
    timeMin,
    timeMax,
    items: [{ id: config.calendarId }]
  };
  const fb = await apiRequest(url, { method: 'POST', body: JSON.stringify(body) });
  return { fb, mode: 'google', notice };
}

