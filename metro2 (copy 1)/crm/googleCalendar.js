import path from 'path';
import { fileURLToPath } from 'url';
import { readJson } from './utils.js';
import { fetchFn } from './fetchUtil.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_PATH = path.join(__dirname, 'settings.json');

async function getConfig() {
  const settings = await readJson(SETTINGS_PATH, {});
  return {
    token: settings.googleCalendarToken || '',
    calendarId: settings.googleCalendarId || ''
  };
}

async function apiRequest(url, options = {}) {
  const { token } = await getConfig();
  if (!token) {
    throw new Error('Missing Google Calendar token');
  }
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    'Authorization': `Bearer ${token}`
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
  const { calendarId } = await getConfig();
  if (!calendarId) throw new Error('Missing Google Calendar ID');
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(new Date().toISOString())}&maxResults=${maxResults}`;
  const data = await apiRequest(url, { method: 'GET' });
  return data.items || [];
}

export async function createEvent(event) {
  const { calendarId } = await getConfig();
  if (!calendarId) throw new Error('Missing Google Calendar ID');
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  return apiRequest(url, { method: 'POST', body: JSON.stringify(event) });
}

export async function updateEvent(eventId, event) {
  const { calendarId } = await getConfig();
  if (!calendarId) throw new Error('Missing Google Calendar ID');
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  return apiRequest(url, { method: 'PATCH', body: JSON.stringify(event) });
}

export async function deleteEvent(eventId) {
  const { calendarId } = await getConfig();
  if (!calendarId) throw new Error('Missing Google Calendar ID');
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  await apiRequest(url, { method: 'DELETE' });
}

export async function freeBusy(timeMin, timeMax) {
  const { calendarId } = await getConfig();
  if (!calendarId) throw new Error('Missing Google Calendar ID');
  const url = 'https://www.googleapis.com/calendar/v3/freeBusy';
  const body = {
    timeMin,
    timeMax,
    items: [{ id: calendarId }]
  };
  return apiRequest(url, { method: 'POST', body: JSON.stringify(body) });
}

