import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAPH_FILENAME = 'metro2_knowledge_graph.json';

function resolveKnowledgeGraphPath() {
  const envPath = process.env.METRO2_KNOWLEDGE_GRAPH_PATH;
  if (envPath) {
    const absoluteEnvPath = path.resolve(envPath);
    if (fs.existsSync(absoluteEnvPath)) {
      return absoluteEnvPath;
    }
    throw new Error(`METRO2_KNOWLEDGE_GRAPH_PATH not found at ${absoluteEnvPath}`);
  }

  const bundled = path.join(__dirname, 'data', GRAPH_FILENAME);
  if (fs.existsSync(bundled)) {
    return bundled;
  }

  const rootDir = path.resolve(__dirname, '..');
  for (const entry of fs.readdirSync(rootDir)) {
    const candidate = path.join(rootDir, entry, 'crm', 'data', GRAPH_FILENAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `${GRAPH_FILENAME} not found. Set METRO2_KNOWLEDGE_GRAPH_PATH to override the default search.`
  );
}

const METRO2_KNOWLEDGE_GRAPH_PATH = resolveKnowledgeGraphPath();

export function loadKnowledgeGraph() {
  if (!fs.existsSync(METRO2_KNOWLEDGE_GRAPH_PATH)) {
    throw new Error(`${GRAPH_FILENAME} missing at ${METRO2_KNOWLEDGE_GRAPH_PATH}`);
  }
  const raw = fs.readFileSync(METRO2_KNOWLEDGE_GRAPH_PATH, 'utf-8');
  const json = JSON.parse(raw);
  if (!json || typeof json !== 'object') {
    throw new Error(`${GRAPH_FILENAME} must export an object`);
  }
  return json;
}

export function getKnowledgeGraphPath() {
  return METRO2_KNOWLEDGE_GRAPH_PATH;
}
