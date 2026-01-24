import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { prepareNegativeItems } from '../../../shared/lib/format/negativeItems.js';
import { loadKnowledgeGraph } from '../../../shared/knowledgeGraph.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, '..', 'data', 'report.json');

test('rule sample triggers every knowledge graph violation', () => {
  const raw = fs.readFileSync(REPORT_PATH, 'utf-8');
  const report = JSON.parse(raw);
  const tradelines = Array.isArray(report.tradelines) ? report.tradelines : [];

  const { items } = prepareNegativeItems(tradelines, {}, { includeLegacyRules: true });
  const triggeredCodes = new Set();
  for (const item of items) {
    for (const violation of item.violations || []) {
      if (!violation) continue;
      const code = violation.code || violation.id;
      if (code) {
        triggeredCodes.add(code);
      }
    }
  }

  const graph = loadKnowledgeGraph();
  const expectedCodes = new Set(
    (graph.relationships || [])
      .filter((rel) => rel && String(rel.type || '').toLowerCase() === 'violation_link')
      .map((rel) => rel.violation)
  );

  assert.ok(expectedCodes.size > 0, 'knowledge graph should expose at least one rule');
  for (const code of expectedCodes) {
    assert.ok(triggeredCodes.has(code), `Expected rule ${code} to be triggered by sample report`);
  }
});
