import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseCreditReportHTML } from '../parser.js';

test('parses Date of Last Payment label', () => {
  const html = `
    <table class="rpt_content_table rpt_content_header rpt_table4column">
      <tbody>
        <tr><th></th><th>TransUnion</th></tr>
        <tr>
          <td class="label">Date of Last Payment:</td>
          <td class="info">01/02/2023</td>
        </tr>
      </tbody>
    </table>
  `;
  const dom = new JSDOM(html);
  const { tradelines } = parseCreditReportHTML(dom.window.document);
  assert.equal(tradelines[0].per_bureau.TransUnion.date_last_payment, '01/02/2023');
});
