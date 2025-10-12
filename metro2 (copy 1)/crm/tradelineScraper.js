import * as cheerio from 'cheerio';
import { fetchFn } from './fetchUtil.js';

const SOURCE_URL = 'https://tradelinesupply.com/pricing/';

function applyMarkup(basePrice) {
  if (basePrice == null || Number.isNaN(basePrice)) return null;
  if (basePrice < 500) return basePrice + 100;
  if (basePrice <= 1000) return basePrice + 200;
  return basePrice + 300;
}

function parseCurrency(raw) {
  if (!raw && raw !== 0) return null;
  const cleaned = raw.toString().replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '');
  if (!cleaned) return null;
  const normalized = cleaned.replace(/,/g, '');
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

function normalizeHeader(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tidyText(str) {
  return (str || '')
    .toString()
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeDateField(value) {
  const cleaned = tidyText(value);
  if (!cleaned) return '';
  if (/^(?:n\/?a|none|tbd|to be determined|on hold)$/i.test(cleaned)) {
    return '';
  }
  return cleaned;
}

function buildRecord(base) {
  return {
    buy_link: base.buy_link || null,
    bank: base.bank || '',
    price: base.price ?? null,
    limit: base.limit ?? 0,
    age: base.age || '',
    statement_date: base.statement_date || '',
    reporting: base.reporting || '',
  };
}

function dedupe(records) {
  const seen = new Set();
  const result = [];
  for (const rec of records) {
    if (!rec.bank || rec.price == null) continue;
    const key = [
      rec.bank.toLowerCase(),
      rec.limit ?? '',
      rec.age ?? '',
      rec.statement_date ?? '',
      rec.reporting ?? '',
      rec.price ?? '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(buildRecord(rec));
  }
  return result;
}

function parseDataAttributeRows($) {
  const items = [];
  $('tr').each((_, row) => {
    const productTd = $(row).find('td.product_data');
    const priceTd = $(row).find('td.product_price');
    if (!productTd.length || !priceTd.length) return;

    const bankName = tidyText(productTd.data('bankname'));
    const creditLimit = parseCurrency(productTd.data('creditlimit')) || 0;
    const dateOpened = tidyText(productTd.data('dateopened'));
    const statementDate = sanitizeDateField(
      productTd.data('statementdate') ?? productTd.data('statementday') ?? ''
    );
    const reportingPeriod = tidyText(productTd.data('reportingperiod'));

    const match = /\$\s?(\d+(?:,\d{3})*(?:\.\d{2})?)/.exec(priceTd.text());
    if (!match) return;

    const basePrice = parseCurrency(match[1]);
    const finalPrice = applyMarkup(basePrice);
    if (finalPrice == null) return;

    items.push({
      buy_link: `/buy?bank=${encodeURIComponent(bankName)}&price=${Math.round(finalPrice * 100) / 100}`,
      bank: bankName,
      price: Math.round(finalPrice * 100) / 100,
      limit: creditLimit,
      age: dateOpened,
      statement_date: statementDate,
      reporting: reportingPeriod,
    });
  });
  return items;
}

function parseTableLayouts($) {
  const records = [];
  $('table').each((_, table) => {
    const $table = $(table);
    const headerCells = $table.find('thead tr').first().find('th');
    if (!headerCells.length) return;

    const headers = headerCells
      .map((__, th) => normalizeHeader($(th).text()))
      .get();

    const hasBankColumn = headers.some((h) => h.includes('bank') || h.includes('tradeline') || h.includes('card'));
    const hasPriceColumn = headers.some((h) => h.includes('price') || h.includes('investment'));
    if (!hasBankColumn || !hasPriceColumn) return;

    $table.find('tbody tr').each((__, tr) => {
      const cells = $(tr).find('td');
      if (!cells.length) return;

      const record = {};
      let wholesalePrice = null;
      let explicitClientPrice = null;

      cells.each((idx, td) => {
        const header = headers[idx];
        if (!header) return;
        const text = tidyText($(td).text());

        if (!text && !$(td).find('a[href]').length) return;

        if (header.includes('bank') || header.includes('tradeline') || header.includes('card')) {
          record.bank = text;
          return;
        }
        if (header.includes('age') || header.includes('seasoning')) {
          record.age = text;
          return;
        }
        if (header.includes('limit') || header.includes('credit')) {
          const limit = parseCurrency(text);
          if (limit != null) record.limit = limit;
          return;
        }
        if (header.includes('wholesale')) {
          wholesalePrice = parseCurrency(text);
          return;
        }
        if (header.includes('client') || header.includes('price') || header.includes('investment')) {
          const value = parseCurrency(text);
          if (value != null) explicitClientPrice = value;
          return;
        }
        if (header.includes('statement') && !header.includes('purchase')) {
          const sanitized = sanitizeDateField(text);
          if (sanitized) {
            record.statement_date = sanitized;
          }
          return;
        }
        if (header.includes('report')) {
          record.reporting = text;
          return;
        }
        if (header.includes('buy') || header.includes('link') || header.includes('checkout')) {
          const href = $(td).find('a[href]').attr('href');
          if (href) record.buy_link = href;
        }
      });

      const chosenPrice =
        explicitClientPrice != null
          ? explicitClientPrice
          : wholesalePrice != null
            ? applyMarkup(wholesalePrice)
            : null;

      if (chosenPrice == null || !record.bank) return;
      record.price = Math.round(chosenPrice * 100) / 100;

      if (!record.buy_link) {
        record.buy_link = `/buy?bank=${encodeURIComponent(record.bank)}&price=${record.price}`;
      }

      records.push(record);
    });
  });
  return records;
}

export async function scrapeTradelines(fetchImpl = fetchFn) {
  if (!fetchImpl) {
    throw new Error('No fetch implementation available for scraping tradelines');
  }
  const response = await fetchImpl(SOURCE_URL);
  if (!response || !response.ok) {
    const status = response?.status ?? 'unknown';
    const statusText = response?.statusText ?? '';
    throw new Error(`Failed to fetch tradelines (status ${status}${statusText ? ` ${statusText}` : ''})`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);
  const parsed = [...parseDataAttributeRows($), ...parseTableLayouts($)];
  return dedupe(parsed);
}

export { SOURCE_URL };
