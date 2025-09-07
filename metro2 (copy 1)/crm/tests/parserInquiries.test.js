import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseCreditReportHTML } from '../parser.js';

test('parses inquiries and summarizes counts', () => {
  const html = `
    <table>
      <tr ng-repeat="inqPartition in data">
        <td class="info">Capital One</td>
        <td class="info">Bank</td>
        <td class="info">01/05/2024</td>
        <td class="info">TransUnion</td>
      </tr>
    </table>
  `;
  const dom = new JSDOM(html);
  const { inquiries, inquiry_summary } = parseCreditReportHTML(dom.window.document);
  assert.equal(inquiries.length, 1);
  assert.equal(inquiries[0].creditor, 'Capital One');
  assert.equal(inquiries[0].bureau, 'TransUnion');
  assert.equal(inquiry_summary.byBureau.TransUnion, 1);
  assert.equal(inquiry_summary.total, 1);
});
