import nodeFetch from 'node-fetch';
import { readKey, writeKey } from './kvdb.js';

const FALLBACK_KEY = 'calendar_events';
const EVENT_CACHE_KEY = 'calendar_cache_events';
const FREEBUSY_CACHE_KEY = 'calendar_cache_freebusy';
const EVENT_CACHE_TTL_MS = 60 * 1000; // 1 minute
const FREEBUSY_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

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

function toEventCacheKey(maxResults) {
  return String(Number.isFinite(maxResults) ? maxResults : 10);
}

function toFreeBusyCacheKey(timeMin, timeMax) {
  return `${timeMin || 'null'}::${timeMax || 'null'}`;
}

function pruneCacheMap(cacheMap, ttlMs) {
  if (!cacheMap || typeof cacheMap !== 'object') return {};
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(cacheMap).filter(([, value]) => {
      if (!value || typeof value !== 'object') return false;
      const storedAt = value.cachedAt || 0;
      return now - storedAt <= ttlMs;
    }),
  );
}

function buildCacheEnvelope(value) {
  return { value, cachedAt: Date.now() };
}

function cacheIsFresh(entry, ttlMs) {
  if (!entry || typeof entry !== 'object') return false;
  const storedAt = entry.cachedAt || 0;
  return Date.now() - storedAt <= ttlMs;
}

function appendNotice(base, addition) {
  if (!addition) return base;
  return base ? `${base} ${addition}` : addition;
}

async function readEventCache(maxResults) {
  const key = toEventCacheKey(maxResults);
  const cached = await readKey(EVENT_CACHE_KEY, {});
  return cached?.[key] || null;
}

async function writeEventCache(maxResults, events) {
  const key = toEventCacheKey(maxResults);
  const cacheMap = await readKey(EVENT_CACHE_KEY, {});
  const trimmed = pruneCacheMap(cacheMap, EVENT_CACHE_TTL_MS);
  trimmed[key] = buildCacheEnvelope(events);
  await writeKey(EVENT_CACHE_KEY, trimmed);
}

async function clearEventCache() {
  await writeKey(EVENT_CACHE_KEY, {});
}

async function readFreeBusyCache(timeMin, timeMax) {
  const key = toFreeBusyCacheKey(timeMin, timeMax);
  const cached = await readKey(FREEBUSY_CACHE_KEY, {});
  return cached?.[key] || null;
}

async function writeFreeBusyCache(timeMin, timeMax, fb) {
  const key = toFreeBusyCacheKey(timeMin, timeMax);
  const cacheMap = await readKey(FREEBUSY_CACHE_KEY, {});
  const trimmed = pruneCacheMap(cacheMap, FREEBUSY_CACHE_TTL_MS);
  trimmed[key] = buildCacheEnvelope(fb);
  await writeKey(FREEBUSY_CACHE_KEY, trimmed);
}

async function clearFreeBusyCache() {
  await writeKey(FREEBUSY_CACHE_KEY, {});
}

async function invalidateCalendarCaches() {
  await Promise.all([clearEventCache(), clearFreeBusyCache()]);
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
  const fetchImpl = getFetch();
  const resp = await fetchImpl(url, { ...options, headers });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Calendar API error ${resp.status}: ${text}`);
  }
  if (resp.status === 204) return null;
  return resp.json();
}

export async function listEvents(maxResults = 10) {
  const config = await getConfig();
  let notice = buildNotice(config.hasApi);
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

  const cached = await readEventCache(maxResults);
  if (cacheIsFresh(cached, EVENT_CACHE_TTL_MS)) {
    return { events: cached.value, mode: 'google', notice };
  }

  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: new Date().toISOString(),
    maxResults: String(maxResults),
    fields:
      'items(id,summary,description,location,start,end,hangoutLink,htmlLink,status,updated,organizer(displayName,email),attendees(email,responseStatus))',
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events?${params.toString()}`;
  try {
    const data = await apiRequest(url, { method: 'GET' });
    const events = data.items || [];
    await writeEventCache(maxResults, events);
    return { events, mode: 'google', notice };
  } catch (error) {
    if (cached) {
      notice = appendNotice(
        notice,
        'Calendar API unreachable — showing the last cached events.',
      );
      return { events: cached.value || [], mode: 'google', notice };
    }
    throw error;
  }
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
  await invalidateCalendarCaches();
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
  await invalidateCalendarCaches();
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
  await invalidateCalendarCaches();
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
  let notice = buildNotice(config.hasApi);
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
  const cached = await readFreeBusyCache(timeMin, timeMax);
  if (cacheIsFresh(cached, FREEBUSY_CACHE_TTL_MS)) {
    return { fb: cached.value, mode: 'google', notice };
  }

  const url = 'https://www.googleapis.com/calendar/v3/freeBusy';
  const body = {
    timeMin,
    timeMax,
    items: [{ id: config.calendarId }]
  };
  try {
    const fb = await apiRequest(`${url}?fields=calendars`, { method: 'POST', body: JSON.stringify(body) });
    await writeFreeBusyCache(timeMin, timeMax, fb);
    return { fb, mode: 'google', notice };
  } catch (error) {
    if (cached) {
      notice = appendNotice(
        notice,
        'Calendar API unreachable — showing the last cached availability.',
      );
      return { fb: cached.value, mode: 'google', notice };
    }
    throw error;
  }
}

export async function clearCalendarCache() {
  await invalidateCalendarCaches();
}

function getFetch() {
  return typeof globalThis.fetch === 'function' ? globalThis.fetch : nodeFetch;
}

