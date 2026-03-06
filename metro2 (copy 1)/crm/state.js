// state.js
// Lightweight per-consumer activity + files persistence

import fs from "fs";
import path from "path";
import { createEvent as createCalendarEvent } from "./googleCalendar.js";
import { readKey, writeKey } from "./kvdb.js";

const DATA_DIR = path.resolve("./data");
const STATE_PATH = path.join(DATA_DIR, "state.json");

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class AsyncMutex {
  constructor() { this._queue = []; this._locked = false; }
  acquire() {
    return new Promise(resolve => {
      if (!this._locked) { this._locked = true; resolve(); }
      else this._queue.push(resolve);
    });
  }
  release() {
    if (this._queue.length > 0) this._queue.shift()();
    else this._locked = false;
  }
}

const stateMutex = new AsyncMutex();

async function loadState() {
  ensureDirs();
  let st = await readKey("consumer_state", null);
  if (st) return st;

  await new Promise(r => setTimeout(r, 500));
  st = await readKey("consumer_state", null);
  if (st) return st;

  if (fs.existsSync(STATE_PATH)) {
    try {
      const raw = fs.readFileSync(STATE_PATH, "utf-8");
      st = JSON.parse(raw);
      await writeKey("consumer_state", st);
      return st;
    } catch {}
  }

  const sentinel = await readKey("_state_seeded", null);
  if (sentinel) {
    console.warn("[state] DB was previously seeded but consumer_state is missing — returning empty state without overwriting");
    return { consumers: {}, trackerSteps: [] };
  }

  console.warn("[state] Initializing fresh consumer_state (first-time setup)");
  st = { consumers: {}, trackerSteps: [] };
  await writeKey("consumer_state", st);
  await writeKey("_state_seeded", { at: new Date().toISOString() });
  return st;
}

async function saveState(st) {
  await writeKey("consumer_state", st);
}

const stateEventListeners = new Set();

function registerStateEventListener(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  stateEventListeners.add(listener);
  return () => {
    stateEventListeners.delete(listener);
  };
}

async function emitStateEvent(consumerId, event) {
  if (!stateEventListeners.size) return;
  const payload = { consumerId, event };
  const tasks = [];
  for (const listener of stateEventListeners) {
    try {
      const result = listener(payload);
      if (result && typeof result.then === "function") {
        tasks.push(result.catch((err) => {
          console.warn("State event listener failed", err?.message || err);
        }));
      }
    } catch (err) {
      console.warn("State event listener threw", err?.message || err);
    }
  }
  if (tasks.length) {
    await Promise.allSettled(tasks);
  }
}
function ensureConsumer(st, consumerId) {
  st.consumers[consumerId] ??= { events: [], files: [], reminders: [], tracker: {} };
  // normalize older records missing reminders
  const c = st.consumers[consumerId];
  c.events ??= [];
  c.files ??= [];
  c.reminders ??= [];
  c.tracker ??= {};
  if (c.creditScore === undefined) {
    c.creditScore = null;
  }
  return c;
}

function processReminders(st) {
  const now = Date.now();
  for (const c of Object.values(st.consumers)) {
    if (!c.reminders?.length) continue;
    const remaining = [];
    for (const r of c.reminders) {
      const due = Date.parse(r.due);
      if (!isNaN(due) && due <= now) {
        c.events.unshift({
          id: r.id || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
          type: "letter_reminder",
          payload: { ...r.payload, due: r.due },
          at: new Date().toISOString(),
        });
      } else {
        remaining.push(r);
      }
    }
    c.reminders = remaining;
  }
}

// ---- Public API ----
async function withStateLock(fn) {
  await stateMutex.acquire();
  try { return await fn(); }
  finally { stateMutex.release(); }
}

export async function listConsumerState(consumerId) {
  return withStateLock(async () => {
    const st = await loadState();
    const c = ensureConsumer(st, consumerId);
    processReminders(st);
    await saveState(st);
    return c;
  });
}

export async function addEvent(consumerId, type, payload = {}) {
  const ev = await withStateLock(async () => {
    const st = await loadState();
    const c = ensureConsumer(st, consumerId);
    const ev = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type,
      payload,
      at: new Date().toISOString(),
    };
    c.events.unshift(ev);
    await saveState(st);
    return ev;
  });
  await emitStateEvent(consumerId, ev);
  if (payload?.calendar) {
    createCalendarEvent(payload.calendar).catch(() => {});
  }
}

export async function updateEventPayload(consumerId, eventType, matchFn, updater) {
  return withStateLock(async () => {
    const st = await loadState();
    const c = ensureConsumer(st, consumerId);
    const ev = c.events.find(e => e.type === eventType && (!matchFn || matchFn(e)));
    if (!ev) return null;
    if (typeof updater === "function") {
      updater(ev.payload);
    } else if (updater && typeof updater === "object") {
      Object.assign(ev.payload, updater);
    }
    await saveState(st);
    return ev;
  });
}

export async function addFileMeta(consumerId, fileRec) {
  return withStateLock(async () => {
    const st = await loadState();
    const c = ensureConsumer(st, consumerId);
    c.files.unshift(fileRec);
    await saveState(st);
  });
}

export async function removeEventsByMatch(consumerId, type, matchFn) {
  return withStateLock(async () => {
    const st = await loadState();
    const c = ensureConsumer(st, consumerId);
    const before = c.events.length;
    c.events = c.events.filter(e => !(e.type === type && (!matchFn || matchFn(e))));
    if (c.events.length < before) await saveState(st);
    return before - c.events.length;
  });
}

export async function removeFileMetaByMatch(consumerId, matchFn) {
  return withStateLock(async () => {
    const st = await loadState();
    const c = ensureConsumer(st, consumerId);
    const removed = [];
    c.files = c.files.filter(f => {
      if (matchFn(f)) { removed.push(f); return false; }
      return true;
    });
    if (removed.length) await saveState(st);
    return removed;
  });
}

export async function addReminder(consumerId, reminder) {
  return withStateLock(async () => {
    const st = await loadState();
    const c = ensureConsumer(st, consumerId);
    c.reminders.push(reminder);
    await saveState(st);
  });
}

export async function removeReminder(consumerId, reminderId) {
  if (!consumerId || !reminderId) return;
  return withStateLock(async () => {
    const st = await loadState();
    const c = ensureConsumer(st, consumerId);
    if (!Array.isArray(c.reminders) || !c.reminders.length) return;
    const next = c.reminders.filter((reminder) => reminder?.id !== reminderId);
    if (next.length === c.reminders.length) return;
    c.reminders = next;
    await saveState(st);
  });
}

export async function setCreditScore(consumerId, score) {
  return withStateLock(async () => {
    const st = await loadState();
    const c = ensureConsumer(st, consumerId);
    if (score && typeof score === "object" && Object.keys(score).length) {
      c.creditScore = score;
    } else {
      c.creditScore = null;
    }
    await saveState(st);
  });
}

export async function processAllReminders() {
  return withStateLock(async () => {
    const st = await loadState();
    processReminders(st);
    await saveState(st);
  });
}

export async function listTracker(consumerId) {
  return withStateLock(async () => {
    const st = await loadState();
    const steps = st.trackerSteps || [];
    const c = ensureConsumer(st, consumerId);
    await saveState(st);
    return { steps, completed: c.tracker || {} };
  });
}

export async function getTrackerSteps() {
  const st = await loadState();
  return st.trackerSteps || [];
}

export async function setTrackerSteps(steps = []) {
  return withStateLock(async () => {
    const st = await loadState();
    st.trackerSteps = steps;
    await saveState(st);
  });
}

export async function markTrackerStep(consumerId, step, done = true) {
  return withStateLock(async () => {
    const st = await loadState();
    const c = ensureConsumer(st, consumerId);
    c.tracker ??= {};
    if (done) c.tracker[step] = true; else delete c.tracker[step];
    await saveState(st);
  });
}

export async function listAllConsumerStates({ includeEvents = true } = {}) {
  return withStateLock(async () => {
    const st = await loadState();
    const now = Date.now();
    const entries = [];
    for (const [consumerId] of Object.entries(st.consumers || {})) {
      const consumer = ensureConsumer(st, consumerId);
      const reminders = Array.isArray(consumer.reminders)
        ? consumer.reminders.map((reminder) => {
            const dueRaw = reminder?.due || reminder?.payload?.due || null;
            const dueTs = dueRaw ? Date.parse(dueRaw) : NaN;
            const status = Number.isFinite(dueTs)
              ? (dueTs < now ? "overdue" : "upcoming")
              : "unscheduled";
            return {
              id: reminder.id || `${consumerId}_${Math.random().toString(16).slice(2)}`,
              due: dueRaw,
              status,
              payload: reminder.payload ? { ...reminder.payload } : {},
              notes: reminder.notes || "",
              dueTs: Number.isFinite(dueTs) ? dueTs : null,
            };
          })
        : [];
      entries.push({
        id: consumerId,
        creditScore: consumer.creditScore ?? null,
        reminders,
        events: [],
      });
    }

    processReminders(st);
    await saveState(st);

    if (includeEvents) {
      for (const entry of entries) {
        const consumer = ensureConsumer(st, entry.id);
        entry.events = Array.isArray(consumer.events)
          ? consumer.events.slice(0, 50).map((event) => ({
              id: event.id || `${entry.id}_${Math.random().toString(16).slice(2)}`,
              type: event.type || "event",
              at: event.at || null,
              payload: event.payload ? { ...event.payload } : {},
            }))
          : [];
      }
    }

    return entries.map((entry) => ({
      ...entry,
      overdueCount: entry.reminders.filter((r) => r.status === "overdue").length,
    }));
  });
}

export { registerStateEventListener, AsyncMutex };

// Paths for storing/serving files for a consumer
export function consumerUploadsDir(consumerId) {
  const dir = path.join(DATA_DIR, "consumers", consumerId, "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
