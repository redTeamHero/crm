// state.js
// Lightweight per-consumer activity + files persistence

import fs from "fs";
import path from "path";
import { createEvent as createCalendarEvent } from "./googleCalendar.js";
import { readKey, writeKey } from "./kvdb.js";

const DATA_DIR = path.resolve("./data");
// Old JSON state path (kept for migration only)
const STATE_PATH = path.join(DATA_DIR, "state.json");

function ensureDirs() {
  // Ensure base data dir exists for uploads; state is kept in SQLite
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function loadState() {
  ensureDirs();
  // Try loading from SQLite first
  let st = await readKey("consumer_state", null);
  if (st) return st;

  // Fallback: migrate from legacy JSON file if present
  if (fs.existsSync(STATE_PATH)) {
    try {
      const raw = fs.readFileSync(STATE_PATH, "utf-8");
      st = JSON.parse(raw);
      await writeKey("consumer_state", st);
      return st;
    } catch {}
  }

  st = { consumers: {}, trackerSteps: [] };
  await writeKey("consumer_state", st);
  return st;
}

async function saveState(st) {
  await writeKey("consumer_state", st);
}
function ensureConsumer(st, consumerId) {
  st.consumers[consumerId] ??= { events: [], files: [], reminders: [], tracker: {} };
  // normalize older records missing reminders
  const c = st.consumers[consumerId];
  c.events ??= [];
  c.files ??= [];
  c.reminders ??= [];
  c.tracker ??= {};
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
export async function listConsumerState(consumerId) {
  const st = await loadState();
  const c = ensureConsumer(st, consumerId);
  processReminders(st);
  await saveState(st);
  return c;
}

export async function addEvent(consumerId, type, payload = {}) {
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
  if (payload?.calendar) {
    createCalendarEvent(payload.calendar).catch(() => {});
  }
}

export async function addFileMeta(consumerId, fileRec) {
  const st = await loadState();
  const c = ensureConsumer(st, consumerId);
  c.files.unshift(fileRec); // newest first
  await saveState(st);
}

export async function addReminder(consumerId, reminder) {
  const st = await loadState();
  const c = ensureConsumer(st, consumerId);
  c.reminders.push(reminder);
  await saveState(st);
}

export async function processAllReminders() {
  const st = await loadState();
  processReminders(st);
  await saveState(st);
}

export async function listTracker(consumerId) {
  const st = await loadState();
  const steps = st.trackerSteps || [];
  const c = ensureConsumer(st, consumerId);
  await saveState(st);
  return { steps, completed: c.tracker || {} };
}

export async function getTrackerSteps() {
  const st = await loadState();
  return st.trackerSteps || [];
}

export async function setTrackerSteps(steps = []) {
  const st = await loadState();
  st.trackerSteps = steps;
  await saveState(st);
}

export async function markTrackerStep(consumerId, step, done = true) {
  const st = await loadState();
  const c = ensureConsumer(st, consumerId);
  c.tracker ??= {};
  if (done) c.tracker[step] = true; else delete c.tracker[step];
  await saveState(st);
}

// Paths for storing/serving files for a consumer
export function consumerUploadsDir(consumerId) {
  const dir = path.join(DATA_DIR, "consumers", consumerId, "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
