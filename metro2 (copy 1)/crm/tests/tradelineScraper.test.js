import test from 'node:test';
import assert from 'node:assert/strict';
import { scrapeTradelines, SOURCE_URL } from '../tradelineScraper.js';

function createResponse(html, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'ERR',
    text: async () => html,
  };
}

test('scrapeTradelines parses legacy data-attribute rows', async () => {
  const html = `
    <table>
      <tr>
        <td class="product_data"
            data-bankname="Alpha Bank"
            data-creditlimit="$7,500"
            data-dateopened="3 years"
            data-purchasebydate="15th"
            data-reportingperiod="TransUnion, Equifax"></td>
        <td class="product_price">$450</td>
      </tr>
    </table>
  `;

  const fetchStub = async (url) => {
    assert.equal(url, SOURCE_URL);
    return createResponse(html);
  };

  const results = await scrapeTradelines(fetchStub);
  assert.equal(results.length, 1);
  const [row] = results;
  assert.equal(row.bank, 'Alpha Bank');
  // $450 + $100 markup
  assert.equal(row.price, 550);
  assert.equal(row.limit, 7500);
  assert.equal(row.age, '3 years');
  assert.equal(row.statement_date, '15th');
  assert.equal(row.reporting, 'TransUnion, Equifax');
  assert.match(row.buy_link, /Alpha%20Bank/);
});

test('scrapeTradelines parses modern table layout with explicit client price', async () => {
  const html = `
    <table>
      <thead>
        <tr>
          <th>Bank</th>
          <th>Age</th>
          <th>Credit Limit</th>
          <th>Wholesale Price</th>
          <th>Client Price</th>
          <th>Statement Date</th>
          <th>Reporting</th>
          <th>Buy Link</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Beta Bank</td>
          <td>1 year</td>
          <td>$12,000</td>
          <td>$500</td>
          <td>$799</td>
          <td>10th</td>
          <td>All Bureaus</td>
          <td><a href="https://checkout.example.com/beta">Buy</a></td>
        </tr>
      </tbody>
    </table>
  `;

  const fetchStub = async () => createResponse(html);
  const results = await scrapeTradelines(fetchStub);
  assert.equal(results.length, 1);
  const [row] = results;
  assert.equal(row.bank, 'Beta Bank');
  assert.equal(row.price, 799);
  assert.equal(row.limit, 12000);
  assert.equal(row.age, '1 year');
  assert.equal(row.statement_date, '10th');
  assert.equal(row.reporting, 'All Bureaus');
  assert.equal(row.buy_link, 'https://checkout.example.com/beta');
});

test('scrapeTradelines applies markup when only wholesale price exists', async () => {
  const html = `
    <table>
      <thead>
        <tr>
          <th>Tradeline</th>
          <th>Seasoning</th>
          <th>Limit</th>
          <th>Wholesale Price</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Gamma Credit Union</td>
          <td>9 months</td>
          <td>$4,000</td>
          <td>$350</td>
        </tr>
      </tbody>
    </table>
  `;

  const fetchStub = async () => createResponse(html);
  const results = await scrapeTradelines(fetchStub);
  assert.equal(results.length, 1);
  const [row] = results;
  // $350 + $100 markup
  assert.equal(row.price, 450);
  assert.equal(row.limit, 4000);
  assert.equal(row.age, '9 months');
  assert.match(row.buy_link, /Gamma%20Credit%20Union/);
});

test('scrapeTradelines throws when fetch fails', async () => {
  const fetchStub = async () => createResponse('nope', false, 500);
  await assert.rejects(() => scrapeTradelines(fetchStub), /Failed to fetch tradelines/);
});
