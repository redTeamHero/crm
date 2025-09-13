import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveViolationsPath() {
  const rootDir = path.resolve(__dirname, '..');
  for (const entry of fs.readdirSync(rootDir)) {
    const candidate = path.join(rootDir, entry, 'crm', 'data', 'metro2Violations.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('metro2Violations.json not found');
}

const METRO2_VIOLATIONS_PATH = resolveViolationsPath();

export function loadMetro2Violations() {
  return JSON.parse(fs.readFileSync(METRO2_VIOLATIONS_PATH, 'utf-8'));
}
