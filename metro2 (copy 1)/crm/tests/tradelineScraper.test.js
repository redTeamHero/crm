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
            data-statementdate="15th"
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

test('scrapeTradelines extracts bank names from nested markup with statement ranges', async () => {
  const html = `
    <table>
      <tr>
        <td class="product_data"
            data-bankname="Nov 7th - Nov 14th"
            data-creditlimit="$7,500"
            data-seasoning="18 months"
            data-statementdate="Nov 7th - Nov 14th"
            data-reportingperiod="TransUnion, Equifax">
          <div class="tradeline-card">
            <strong class="bank-name">Discover</strong>
            <div class="dates">Nov 7th - Nov 14th</div>
          </div>
        </td>
        <td class="product_price">$480</td>
      </tr>
    </table>
  `;

  const results = await scrapeTradelines(async () => createResponse(html));
  assert.equal(results.length, 1);
  const [row] = results;
  assert.equal(row.bank, 'Discover');
  assert.equal(row.statement_date, 'Nov 7th - Nov 14th');
  // $480 + $100 markup
  assert.equal(row.price, 580);
  assert.equal(row.limit, 7500);
  assert.equal(row.age, '18 months');
  assert.equal(row.reporting, 'TransUnion, Equifax');
});

test('scrapeTradelines does not treat purchase-by date as statement', async () => {
  const html = `
    <table>
      <tr>
        <td class="product_data"
            data-bankname="Delta Bank"
            data-creditlimit="$5,500"
            data-dateopened="2 years"
            data-purchasebydate="12th"
            data-reportingperiod="TransUnion"></td>
        <td class="product_price">$400</td>
      </tr>
    </table>
  `;

  const results = await scrapeTradelines(async () => createResponse(html));
  assert.equal(results.length, 1);
  const [row] = results;
  assert.equal(row.statement_date, '');
  assert.equal(row.reporting, 'TransUnion');
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

test('scrapeTradelines drops placeholder statement text in tables', async () => {
  const html = `
    <table>
      <thead>
        <tr>
          <th>Card</th>
          <th>Statement</th>
          <th>Client Price</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Epsilon Card</td>
          <td>TBD</td>
          <td>$650</td>
        </tr>
      </tbody>
    </table>
  `;

  const results = await scrapeTradelines(async () => createResponse(html));
  assert.equal(results.length, 1);
  const [row] = results;
  assert.equal(row.statement_date, '');
});

test('scrapeTradelines retains duplicate-looking rows without statement dates', async () => {
  const html = `
    <table>
      <thead>
        <tr>
          <th>Bank</th>
          <th>Limit</th>
          <th>Age</th>
          <th>Client Price</th>
          <th>Reporting</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Zeta Financial</td>
          <td>$10,000</td>
          <td>5 years</td>
          <td>$899</td>
          <td>Experian</td>
        </tr>
        <tr>
          <td>Zeta Financial</td>
          <td>$10,000</td>
          <td>5 years</td>
          <td>$899</td>
          <td>Experian</td>
        </tr>
      </tbody>
    </table>
  `;

  const results = await scrapeTradelines(async () => createResponse(html));
  assert.equal(results.length, 2);
});



test('scrapeTradelines prioritizes explicit bank labels over noisy attribute aliases', async () => {
  const html = `
    <table>
      <tr>
        <td class="product_data"
            data-bankname="Barclays Barc"
            data-clientprice="$510">
          <div class="tradeline-card">
            <strong class="bank-name">Barclays</strong><br>
            Credit Limit: $15,000<br>
            Statement: Jul 2024
          </div>
        </td>
        <td class="product_price">$310</td>
      </tr>
      <tr>
        <td class="product_data"
            data-bankname="CP1 CP1"
            data-clientprice="$610">
          <div class="tradeline-card">
            <strong class="bank-name">CP1</strong><br>
            High Limit: $8,000
          </div>
        </td>
        <td class="product_price">$410</td>
      </tr>
    </table>
  `;

  const results = await scrapeTradelines(async () => createResponse(html));
  assert.equal(results.length, 2);

  assert.equal(results[0].bank, 'Barclays');
  assert.equal(results[0].limit, 15000);
  assert.equal(results[0].price, 510);
  assert.equal(results[0].statement_date, 'Jul 2024');

  assert.equal(results[1].bank, 'CP1');
  assert.equal(results[1].limit, 8000);
  assert.equal(results[1].price, 610);
});

test('scrapeTradelines throws when fetch fails', async () => {
  const fetchStub = async () => createResponse('nope', false, 500);
  await assert.rejects(() => scrapeTradelines(fetchStub), /Failed to fetch tradelines/);
});
