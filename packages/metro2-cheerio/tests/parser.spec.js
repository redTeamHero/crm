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

