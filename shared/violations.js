import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METRO2_VIOLATIONS_PATH = path.join(
  __dirname,
  '..',
  'metro2 (copy 1)',
  'crm',
  'data',
  'metro2Violations.json'
);

export function loadMetro2Violations() {
  return JSON.parse(fs.readFileSync(METRO2_VIOLATIONS_PATH, 'utf-8'));
}
