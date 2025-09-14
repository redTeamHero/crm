import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseCreditReportHTML } from '../parser.js';

test("skips 'Risk Factors' section when parsing tradelines", () => {
  const html = `
    <div>
      <div class="sub_header">Risk Factors</div>
      <table class="rpt_content_table rpt_content_header rpt_table4column">
        <tr>
          <th></th><th>TransUnion</th><th>Experian</th><th>Equifax</th>
        </tr>
        <tr>
          <td class="label">Account #</td>
          <td class="info">0000</td>
          <td class="info"></td>
          <td class="info"></td>
        </tr>
      </table>
    </div>
    <div>
      <div class="sub_header">Acme Bank</div>
      <table class="rpt_content_table rpt_content_header rpt_table4column">
        <tr>
          <th></th><th>TransUnion</th><th>Experian</th><th>Equifax</th>
        </tr>
        <tr>
          <td class="label">Account #</td>
          <td class="info">12345</td>
          <td class="info"></td>
          <td class="info"></td>
        </tr>
      </table>
    </div>
  `;
  const dom = new JSDOM(html);
  const { tradelines } = parseCreditReportHTML(dom.window.document);
  assert.equal(tradelines.length, 1);
  assert.equal(tradelines[0].meta.creditor, 'Acme Bank');
});
