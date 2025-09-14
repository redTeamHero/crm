import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveViolationsPath() {
  const envPath = process.env.METRO2_VIOLATIONS_PATH;
  if (envPath) {
    const absoluteEnvPath = path.resolve(envPath);
    if (fs.existsSync(absoluteEnvPath)) {
      return absoluteEnvPath;
    }
    throw new Error(`METRO2_VIOLATIONS_PATH not found at ${absoluteEnvPath}`);
  }

  const rootDir = path.resolve(__dirname, '..');
  for (const entry of fs.readdirSync(rootDir)) {
    const candidate = path.join(rootDir, entry, 'crm', 'data', 'metro2Violations.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    'metro2Violations.json not found. Set METRO2_VIOLATIONS_PATH to override the default search.'
  );
}

const METRO2_VIOLATIONS_PATH = resolveViolationsPath();

export function loadMetro2Violations() {
  if (!fs.existsSync(METRO2_VIOLATIONS_PATH)) {
    throw new Error(`metro2Violations.json missing at ${METRO2_VIOLATIONS_PATH}`);
  }
  return JSON.parse(fs.readFileSync(METRO2_VIOLATIONS_PATH, 'utf-8'));
}
