// state.js
// Lightweight per-consumer activity + files persistence

import fs from "fs";
import path from "path";
import { createEvent as createCalendarEvent } from "./googleCalendar.js";

const DATA_DIR = path.resolve("./data");
const STATE_PATH = path.join(DATA_DIR, "state.json");

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STATE_PATH)) {
    fs.writeFileSync(STATE_PATH, JSON.stringify({ consumers: {}, trackerSteps: [] }, null, 2));
  }
}
function loadState() {
  ensureDirs();
  try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")); }
  catch { return { consumers: {}, trackerSteps: [] }; }
}
function saveState(st) {
  ensureDirs();
  fs.writeFileSync(STATE_PATH, JSON.stringify(st, null, 2));
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
export function listConsumerState(consumerId) {
  const st = loadState();
  const c = ensureConsumer(st, consumerId);
  processReminders(st);
  saveState(st);
  return c;
}

export function addEvent(consumerId, type, payload = {}) {
  const st = loadState();
  const c = ensureConsumer(st, consumerId);
  const ev = {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type,
    payload,
    at: new Date().toISOString(),
  };
  c.events.unshift(ev);
  saveState(st);
  if (payload?.calendar) {
    createCalendarEvent(payload.calendar).catch(() => {});
  }
}

export function addFileMeta(consumerId, fileRec) {
  const st = loadState();
  const c = ensureConsumer(st, consumerId);
  c.files.unshift(fileRec); // newest first
  saveState(st);
}

export function addReminder(consumerId, reminder) {
  const st = loadState();
  const c = ensureConsumer(st, consumerId);
  c.reminders.push(reminder);
  saveState(st);
}

export function processAllReminders() {
  const st = loadState();
  processReminders(st);
  saveState(st);
}

export function listTracker(consumerId) {
  const st = loadState();
  const steps = st.trackerSteps || [];
  const c = ensureConsumer(st, consumerId);
  saveState(st);
  return { steps, completed: c.tracker || {} };
}

export function getTrackerSteps() {
  const st = loadState();
  return st.trackerSteps || [];
}

export function setTrackerSteps(steps = []) {
  const st = loadState();
  st.trackerSteps = steps;
  saveState(st);
}

export function markTrackerStep(consumerId, step, done = true) {
  const st = loadState();
  const c = ensureConsumer(st, consumerId);
  c.tracker ??= {};
  if (done) c.tracker[step] = true; else delete c.tracker[step];
  saveState(st);
}

// Paths for storing/serving files for a consumer
export function consumerUploadsDir(consumerId) {
  const dir = path.join(DATA_DIR, "consumers", consumerId, "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
