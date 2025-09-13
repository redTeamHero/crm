import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DB_FILE = path.join(__dirname, 'crm.sqlite');

sqlite3.verbose();
const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)');
});

export function readKey(key, fallback) {
  return new Promise((resolve) => {
    db.get('SELECT value FROM kv WHERE key = ?', [key], (err, row) => {
      if (err || !row) return resolve(fallback);
      try {
        resolve(JSON.parse(row.value));
      } catch {
        resolve(fallback);
      }
    });
  });
}

export function writeKey(key, value) {
  return new Promise((resolve, reject) => {
    const val = JSON.stringify(value);
    db.run(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      [key, val],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}
