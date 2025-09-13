import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadMetro2Violations } from '../utils.js';

test('loadMetro2Violations returns violations matching sample CSV', async () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const csvPath = path.join(__dirname, 'fixtures', 'violations-sample.csv');
  const rows = fs.readFileSync(csvPath, 'utf-8').trim().split('\n').slice(1);
  const expected = {};
  for (const line of rows) {
    const [code, violation, severity, fcraSection] = line.split(',');
    expected[code] = {
      violation,
      severity: Number(severity),
      fcraSection
    };
  }
  const violations = await loadMetro2Violations();
  for (const code of Object.keys(expected)) {
    assert.ok(code in violations, `Missing ${code} in violations`);
    const v = violations[code];
    const e = expected[code];
    assert.equal(v.violation, e.violation);
    assert.equal(v.severity, e.severity);
    assert.equal(v.fcraSection, e.fcraSection);
  }
});
