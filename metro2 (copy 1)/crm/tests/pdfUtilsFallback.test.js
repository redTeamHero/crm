import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToPdfBuffer } from '../pdfUtils.js';

await test('htmlToPdfBuffer falls back to PDFKit when forced', async () => {
  const html = '<html><body><h1>Fallback Letter</h1><p>Chromium unavailable</p></body></html>';
  process.env.FORCE_PDF_FALLBACK = 'true';
  const buffer = await htmlToPdfBuffer(html);
  delete process.env.FORCE_PDF_FALLBACK;

  assert.ok(buffer.length > 800, `Expected fallback PDF to be non-trivial, got ${buffer.length}`);
  assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
});
