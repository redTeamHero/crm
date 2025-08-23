// state.js
// Lightweight per-consumer activity + files persistence

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("./data");
const STATE_PATH = path.join(DATA_DIR, "state.json");

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STATE_PATH)) {
    fs.writeFileSync(STATE_PATH, JSON.stringify({ consumers: {} }, null, 2));
  }
}
function loadState() {
  ensureDirs();
  try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")); }
  catch { return { consumers: {} }; }
}
function saveState(st) {
  ensureDirs();
  fs.writeFileSync(STATE_PATH, JSON.stringify(st, null, 2));
}
function ensureConsumer(st, consumerId) {
  st.consumers[consumerId] ??= { events: [], files: [] };
  return st.consumers[consumerId];
}

// ---- Public API ----
export function listConsumerState(consumerId) {
  const st = loadState();
  return ensureConsumer(st, consumerId);
}

export function addEvent(consumerId, type, payload = {}) {
  const st = loadState();
  const c = ensureConsumer(st, consumerId);
  c.events.unshift({
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type,
    payload,
    at: new Date().toISOString(),
  });
  saveState(st);
}

export function addFileMeta(consumerId, fileRec) {
  const st = loadState();
  const c = ensureConsumer(st, consumerId);
  c.files.unshift(fileRec); // newest first
  saveState(st);
}

// Paths for storing/serving files for a consumer
export function consumerUploadsDir(consumerId) {
  const dir = path.join(DATA_DIR, "consumers", consumerId, "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
