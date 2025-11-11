import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { parseReport as parseCheerio } from '../src/index.js';
import { parseReport as parseDOM } from '../../metro2-browser/src/index.js';
import { enrich, validateTradeline } from '../../metro2-core/src/index.js';

test('adapters produce identical output and flag past-due inconsistency', () => {
  const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'report.html');
  const html = fs.readFileSync(fixturePath,'utf8');
  const realNow = Date.now;
  Date.now = () => new Date('2024-02-01T00:00:00Z').valueOf();
  try {
    const nodeResult = parseCheerio(html);

    const dom = new JSDOM(html);
    const browserResult = parseDOM(dom.window.document);
    assert.deepStrictEqual(browserResult, nodeResult);

    const v = nodeResult.tradelines[0].violations.find(v => v.code === 'CURRENT_BUT_PASTDUE' && v.bureau === 'TransUnion');
    assert.ok(v, 'should flag past-due inconsistency for TransUnion');

    assert.equal(nodeResult.history.byBureau.TransUnion.length, 3);
    assert.equal(nodeResult.history.summary.TransUnion.late, 1);
    assert.equal(nodeResult.history.summary.Experian.unknown, 1);

    assert.equal(nodeResult.inquiries.length, 2);
    assert.equal(nodeResult.inquiries[0].creditor, 'Capital One');
    assert.equal(nodeResult.inquiries[1].creditor, 'Amex');
    assert.deepStrictEqual(nodeResult.inquiry_summary.byBureau, {
      TransUnion: 1,
      Experian: 1,
      Equifax: 0,
    });
    assert.equal(nodeResult.inquiry_summary.total, 2);
    assert.equal(nodeResult.inquiry_summary.last12mo, 2);
    assert.equal(nodeResult.inquiry_summary.last24mo, 2);
  } finally {
    Date.now = realNow;
  }
});

test('parseReport extracts structured personal info, scores, accounts, inquiries, and contacts', () => {
  const html = `
    <div>
      <div class="sub_header">Personal Information</div>
      <table>
        <tr><td>Name</td><td>Jane Doe</td></tr>
        <tr><td>Also Known As</td><td><ul><li>J. Doe</li><li>Janet Doe</li></ul></td></tr>
        <tr><td>Credit Report Date</td><td>01/15/2024</td></tr>
        <tr><td>Current Address(es)</td><td>123 Main St<br/>Unit 5</td></tr>
        <tr><td>Employers</td><td>Acme Corp</td></tr>
      </table>
      <div class="sub_header">Credit Score</div>
      <table class="rpt_content_table rpt_content_header rpt_table4column">
        <tr><th></th><th>TransUnion</th><th>Experian</th><th>Equifax</th></tr>
        <tr>
          <td class="label">Credit Score</td>
          <td class="info">710</td>
          <td class="info">720</td>
          <td class="info">730</td>
        </tr>
      </table>
      <div class="sub_header">Account History</div>
      <table class="rpt_content_table rpt_content_header rpt_table4column">
        <tr><th></th><th>TransUnion</th><th>Experian</th><th>Equifax</th></tr>
        <tr><td class="label">Creditor</td><td class="info">Acme Card</td><td class="info">Acme Card</td><td class="info">Acme Card</td></tr>
        <tr><td class="label">Account #</td><td class="info">1111</td><td class="info">2222</td><td class="info">3333</td></tr>
        <tr><td class="label">Account Type</td><td class="info">Revolving</td><td class="info">Revolving</td><td class="info">Revolving</td></tr>
        <tr><td class="label">Account Type - Detail</td><td class="info">Credit Card</td><td class="info">Credit Card</td><td class="info">Credit Card</td></tr>
        <tr><td class="label">Bureau Code</td><td class="info">R1</td><td class="info">R1</td><td class="info">R1</td></tr>
        <tr><td class="label">Monthly Payment</td><td class="info">$75</td><td class="info">$75</td><td class="info">$75</td></tr>
        <tr><td class="label">Balance</td><td class="info">$500</td><td class="info">$400</td><td class="info">$300</td></tr>
        <tr><td class="label">No. of Months (terms)</td><td class="info">36</td><td class="info">36</td><td class="info">36</td></tr>
        <tr><td class="label">High Credit</td><td class="info">$1,000</td><td class="info">$1,000</td><td class="info">$1,000</td></tr>
        <tr><td class="label">Credit Limit</td><td class="info">$1,200</td><td class="info">$1,200</td><td class="info">$1,200</td></tr>
        <tr><td class="label">Past Due</td><td class="info">$0</td><td class="info">$0</td><td class="info">$0</td></tr>
        <tr><td class="label">Account Status</td><td class="info">Open</td><td class="info">Open</td><td class="info">Open</td></tr>
        <tr><td class="label">Payment Status</td><td class="info">Pays As Agreed</td><td class="info">Pays As Agreed</td><td class="info">Pays As Agreed</td></tr>
        <tr><td class="label">Date Opened</td><td class="info">01/01/2020</td><td class="info">01/01/2020</td><td class="info">01/01/2020</td></tr>
        <tr><td class="label">Last Reported</td><td class="info">01/01/2024</td><td class="info">01/01/2024</td><td class="info">01/01/2024</td></tr>
        <tr><td class="label">Date Last Active</td><td class="info">12/15/2023</td><td class="info">12/15/2023</td><td class="info">12/15/2023</td></tr>
        <tr><td class="label">Comments</td><td class="info">On-time payer</td><td class="info">On-time payer</td><td class="info">On-time payer</td></tr>
        <tr><td class="label">Date of Last Payment</td><td class="info">12/01/2023</td><td class="info">12/01/2023</td><td class="info">12/01/2023</td></tr>
        <tr><td class="label">Two-Year Payment History</td><td class="info">OK OK</td><td class="info">OK OK</td><td class="info">OK OK</td></tr>
      </table>
      <div class="sub_header">Inquiries</div>
      <table>
        <tr><th>Creditor Name</th><th>Type of Business</th><th>Date of Inquiry</th><th>Credit Bureau</th></tr>
        <tr><td class="info">Capital One</td><td class="info">Bank</td><td class="info">01/05/2024</td><td class="info">TransUnion</td></tr>
      </table>
      <div class="sub_header">Creditor Contacts</div>
      <table>
        <tr><th>Creditor</th><th>Address</th><th>Phone</th></tr>
        <tr><td>Acme Bank</td><td>123 Finance Way, NY</td><td>800-555-1212</td></tr>
      </table>
    </div>
  `;

  const result = parseCheerio(html);

  assert.deepStrictEqual(result.personal_information, {
    name: 'Jane Doe',
    also_known_as: ['J. Doe', 'Janet Doe'],
    credit_report_date: '01/15/2024',
    current_addresses: ['123 Main St', 'Unit 5'],
    employers: ['Acme Corp'],
  });

  assert.deepStrictEqual(result.credit_scores, {
    TransUnion: '710',
    Experian: '720',
    Equifax: '730',
  });

  const tuAccount = result.account_history.find(entry => entry.bureau === 'TransUnion');
  assert.ok(tuAccount);
  assert.equal(tuAccount.name_of_account, 'Acme Card');
  assert.equal(tuAccount.account_number, '1111');
  assert.equal(tuAccount.account_type_detail, 'Credit Card');
  assert.equal(tuAccount.payment_status, 'Pays As Agreed');
  assert.equal(tuAccount.last_reported, '01/01/2024');
  assert.equal(tuAccount.two_year_payment_history, 'OK OK');

  assert.deepStrictEqual(result.inquiry_details, [
    {
      creditor_name: 'Capital One',
      type_of_business: 'Bank',
      date_of_inquiry: '01/05/2024',
      credit_bureau: 'TransUnion',
    }
  ]);

  assert.deepStrictEqual(result.creditor_contacts, [
    {
      creditor_name: 'Acme Bank',
      address: '123 Finance Way, NY',
      phone: '800-555-1212',
    }
  ]);
});

test('parseReport derives creditor from surrounding header and skips duplicate tables', () => {
  const html = `
    <div>
      <div class="sub_header">Risk Factors</div>
      <table class="rpt_content_table rpt_content_header rpt_table4column">
        <tr><th></th><th>TransUnion</th><th>Experian</th><th>Equifax</th></tr>
        <tr><td class="label">Account #</td><td class="info">0000</td><td class="info"></td><td class="info"></td></tr>
      </table>
    </div>
    <div>
      <div class="sub_header">Acme Bank</div>
      <table class="rpt_content_table rpt_content_header rpt_table4column">
        <tr><th></th><th>TransUnion</th><th>Experian</th><th>Equifax</th></tr>
        <tr><td class="label">Account #</td><td class="info">12345</td><td class="info">12345</td><td class="info">12345</td></tr>
        <tr><td class="label">Creditor</td><td class="info">Acme Bank</td><td class="info">Acme Bank</td><td class="info">Acme Bank</td></tr>
      </table>
      <table class="rpt_content_table rpt_content_header rpt_table4column">
        <tr><th></th><th>TransUnion</th><th>Experian</th><th>Equifax</th></tr>
        <tr><td class="label">Account #</td><td class="info">12345</td><td class="info">12345</td><td class="info">12345</td></tr>
      </table>
    </div>
  `;
  const dom = new JSDOM(html);
  const { tradelines } = parseDOM(dom.window.document);
  assert.equal(tradelines.length, 1);
  const tl = tradelines[0];
  assert.equal(tl.meta.creditor, 'Acme Bank');
  assert.equal(tl.per_bureau.TransUnion.account_number, '12345');
});

test('parseReport handles tables missing label/info classes', () => {
  const html = `
    <div>
      <div class="sub_header">Acme Finance</div>
      <table class="rpt_content_table rpt_content_header rpt_table4column">
        <tr><th></th><th>TransUnion</th><th>Experian</th><th>Equifax</th></tr>
        <tr><td>Account #</td><td>9876</td><td>8765</td><td>7654</td></tr>
        <tr><td>Balance</td><td>$1,200</td><td>$900</td><td>$0</td></tr>
      </table>
    </div>
  `;
  const nodeResult = parseCheerio(html);
  const dom = new JSDOM(html);
  const browserResult = parseDOM(dom.window.document);
  assert.deepStrictEqual(browserResult, nodeResult);
  assert.equal(browserResult.tradelines.length, 1);
  const tl = browserResult.tradelines[0];
  assert.equal(tl.meta.creditor, 'Acme Finance');
  assert.equal(tl.per_bureau.TransUnion.account_number, '9876');
  assert.equal(tl.per_bureau.Experian.balance, 900);
  assert.equal(tl.per_bureau.Equifax.balance, 0);
});

test('parseReport captures multi-valued comments as arrays', () => {
  const html = `
    <div>
      <div class="sub_header">Example Creditor</div>
      <table class="rpt_content_table rpt_content_header rpt_table4column">
        <tr><th></th><th>TransUnion</th><th>Experian</th><th>Equifax</th></tr>
        <tr>
          <td class="label">Account #</td>
          <td class="info">1111</td>
          <td class="info">2222</td>
          <td class="info">3333</td>
        </tr>
        <tr>
          <td class="label">Comments</td>
          <td class="info"><ng>-</ng></td>
          <td class="info"><ng>-</ng></td>
          <td class="info">
            <div>Fixed rate&nbsp;</div>
            <div>Unsecured&nbsp;</div>
          </td>
        </tr>
      </table>
    </div>
  `;

  const result = parseCheerio(html);
  assert.equal(result.tradelines.length, 1);
  const tl = result.tradelines[0];
  assert.deepStrictEqual(tl.per_bureau.TransUnion.comments, '-');
  assert.deepStrictEqual(tl.per_bureau.Experian.comments, '-');
  assert.deepStrictEqual(tl.per_bureau.Equifax.comments, ['Fixed rate', 'Unsecured']);
  assert.deepStrictEqual(tl.per_bureau.Equifax.comments_raw, ['Fixed rate', 'Unsecured']);
});

test('validateTradeline returns enriched violation objects', () => {
  const violations = validateTradeline({ account_status: 'Current', past_due: 100 });
  assert.equal(violations.length, 1);
  const violation = violations[0];
  assert.equal(violation.code, 'CURRENT_BUT_PASTDUE');
  assert.equal(violation.detail, 'Account is marked current yet shows a past-due balance.');
  assert.deepStrictEqual(violation.evidence, {
    account_status: 'Current',
    past_due: 100,
  });
});

test('validateTradeline infers account_status from payment_status strings', () => {
  const violations = validateTradeline({ payment_status: 'Current', past_due: '$250.00' });
  assert.ok(violations.some(v => v.code === 'CURRENT_BUT_PASTDUE'));
});

test('validateTradeline infers negative status from payment_status when DOFD missing', () => {
  const violations = validateTradeline({ payment_status: 'Charge-Off', date_first_delinquency: '' });
  assert.ok(violations.some(v => v.code === 'MISSING_DOFD'));
});

test('validateTradeline loads knowledge graph constraints', () => {
  const violations = validateTradeline({ account_status: 'Pays As Agreed', past_due: '$45.00' });
  assert.ok(violations.some(v => v.code === 'CURRENT_BUT_PASTDUE'));
});

test('validateTradeline flags missing DOFD for charge-offs via knowledge graph', () => {
  const violations = validateTradeline({ account_status: 'Charge-Off', date_first_delinquency: '' });
  assert.ok(violations.some(v => v.code === 'MISSING_DOFD'));
});

test('unknown violation codes fall back to default message', () => {
  assert.deepStrictEqual(
    enrich('UNKNOWN_CODE'),
    { code: 'UNKNOWN_CODE', violation: 'Unknown violation code' }
  );
});

test('lowercase violation codes return same metadata as uppercase', () => {
  const upperPastDue = enrich('CURRENT_BUT_PASTDUE');
  const lowerPastDue = enrich('current_but_pastdue');
  assert.deepStrictEqual(lowerPastDue, upperPastDue);

  const upperMissingDofd = enrich('MISSING_DOFD');
  const lowerMissingDofd = enrich('missing_dofd');
  assert.deepStrictEqual(lowerMissingDofd, upperMissingDofd);
});

