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
  const { inquiries, inquiry_summary, inquiry_details } = parseCreditReportHTML(dom.window.document);
  assert.equal(inquiries.length, 1);
  assert.equal(inquiries[0].creditor, 'Capital One');
  assert.equal(inquiries[0].bureau, 'TransUnion');
  assert.equal(inquiry_summary.byBureau.TransUnion, 1);
  assert.equal(inquiry_summary.total, 1);
  assert.equal(Array.isArray(inquiry_details), true);
  assert.equal(inquiry_details.length, 1);
  assert.equal(inquiry_details[0].creditor_name, 'Capital One');
});

test('parses personal information into bureau map', () => {
  const html = `
    <div>
      <div class="sub_header">Personal Information</div>
      <table>
        <tr><td>Name</td><td>Jane Doe</td></tr>
        <tr><td>Date of Birth</td><td>01/01/1990</td></tr>
        <tr><td>Current Address(es)</td><td>123 Main St<br/>Miami, FL 33101</td></tr>
      </table>
    </div>
  `;
  const dom = new JSDOM(html);
  const { personalInfo, personal_information } = parseCreditReportHTML(dom.window.document);
  assert.ok(personalInfo);
  assert.equal(personalInfo.TransUnion.name, 'Jane Doe');
  assert.equal(personalInfo.Experian.address.addr1, '123 Main St');
  assert.ok(personal_information);
  assert.equal(personal_information.name, 'Jane Doe');
});
