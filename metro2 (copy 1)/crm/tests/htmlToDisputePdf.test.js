import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlReportToDisputePdfs } from '../htmlToDisputePdf.js';
import { detectChromium } from '../pdfUtils.js';

await test('html report converts to dispute PDF', async (t) => {
  const execPath = await detectChromium();
  if(!execPath){
    t.skip('chromium not installed');
    return;
  }
  const html = `<!DOCTYPE html><html><body>
  <div class="sub_header">Test Creditor</div>
  <table class="rpt_content_table rpt_content_header rpt_table4column">
    <tr><th></th><th>TransUnion</th><th>Experian</th><th>Equifax</th></tr>
    <tr><td class="label">Account #</td><td class="info">123</td><td class="info">456</td><td class="info">789</td></tr>
    <tr><td class="label">Account Status</td><td class="info">Open</td><td class="info">Open</td><td class="info">Open</td></tr>
  </table>
  </body></html>`;
  const consumer = { firstName:'Ana', lastName:'Lopez', address1:'123 Main', city:'Phoenix', state:'AZ', zip:'85001' };
  const pdfs = await htmlReportToDisputePdfs(html, consumer);
  assert.ok(pdfs.length > 0);
  assert.ok(pdfs[0].pdf.length > 1000);
});
