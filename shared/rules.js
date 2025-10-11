import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveRulesPath() {
  const envPath = process.env.METRO2_RULES_PATH;
  if (envPath) {
    const absoluteEnvPath = path.resolve(envPath);
    if (fs.existsSync(absoluteEnvPath)) {
      return absoluteEnvPath;
    }
    throw new Error(`METRO2_RULES_PATH not found at ${absoluteEnvPath}`);
  }

  const bundled = path.join(__dirname, 'data', 'metro2_rules.json');
  if (fs.existsSync(bundled)) {
    return bundled;
  }

  const rootDir = path.resolve(__dirname, '..');
  for (const entry of fs.readdirSync(rootDir)) {
    const candidate = path.join(rootDir, entry, 'crm', 'data', 'metro2_rules.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'metro2_rules.json not found. Set METRO2_RULES_PATH to override the default search.'
  );
}

const METRO2_RULES_PATH = resolveRulesPath();

export function loadMetro2Rules() {
  if (!fs.existsSync(METRO2_RULES_PATH)) {
    throw new Error(`metro2_rules.json missing at ${METRO2_RULES_PATH}`);
  }
  const raw = fs.readFileSync(METRO2_RULES_PATH, 'utf-8');
  const json = JSON.parse(raw);
  if (!json || typeof json !== 'object') {
    throw new Error('metro2_rules.json must export an object or array of rules');
  }
  return json;
}

export function getMetro2RulesPath() {
  return METRO2_RULES_PATH;
}
