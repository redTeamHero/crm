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

const MONTH_KEYWORDS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const STATEMENT_KEYWORDS = ['statement', 'cycle', 'closing', 'closes', 'cut', 'billing'];
const STATEMENT_PLACEHOLDER_SUBSTRINGS = ['tbd', 'rolling', 'varies', 'upon request', 'call', 'available now', 'asap', 'see notes'];
const STATEMENT_PLACEHOLDER_PATTERNS = [
  /\bn[-\s\/.]?a\b/,
  /\bnone\b/,
];

function containsStatementPlaceholder(lower) {
  if (!lower) return false;
  if (STATEMENT_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(lower))) return true;
  return STATEMENT_PLACEHOLDER_SUBSTRINGS.some((placeholder) => lower.includes(placeholder));
}

function hasContent(value) {
  if (value == null) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim().length > 0;
  return String(value).trim().length > 0;
}

function normalizeStatement(raw) {
  const value = tidyText(raw);
  if (!value) return '';
  const lower = value.toLowerCase();
  if (containsStatementPlaceholder(lower)) return '';
  if (/^available$/.test(lower)) return '';
  if (/^\d{1,2}(st|nd|rd|th)$/.test(lower)) return value;
  if (/^\d{1,2}(st|nd|rd|th)?\s*[-–]\s*\d{1,2}(st|nd|rd|th)?$/.test(lower)) return value;
  if (/^\d{1,2}\/\d{1,2}$/.test(lower)) return value;
  const hasMonth = MONTH_KEYWORDS.some((month) => lower.includes(month));
  if (hasMonth && /\d/.test(lower)) return value;
  if (STATEMENT_KEYWORDS.some((keyword) => lower.includes(keyword))) return value;
  return '';
}

function isLikelyStatement(raw) {
  return Boolean(normalizeStatement(raw));
}

function isLikelyBank(raw) {
  const value = tidyText(raw);
  if (!value) return false;
  if (isLikelyStatement(value)) return false;
  const lower = value.toLowerCase();
  if (containsStatementPlaceholder(lower)) return false;
  if (/\$/.test(lower)) return false;
  if (/(?:limit|season|price|range|spots?|seats?|available|reporting|statement|cycle|closing)/.test(lower)) return false;
  if (!/[a-z]/i.test(value)) return false;
  return true;
}

function expandAttributeNames(name) {
  const variants = new Set();
  if (!name) return variants;
  variants.add(name);
  const lower = name.toLowerCase();
  variants.add(lower);
  const hyphen = lower.replace(/[_.\s]+/g, '-');
  variants.add(hyphen);
  if (!hyphen.startsWith('data-')) {
    variants.add(`data-${hyphen}`);
  }
  if (!lower.startsWith('data-')) {
    variants.add(`data-${lower}`);
  }
  const camel = hyphen.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  if (camel) {
    variants.add(camel);
    const lowerCamel = camel.charAt(0).toLowerCase() + camel.slice(1);
    variants.add(lowerCamel);
  }
  return variants;
}

function getAttribute($el, names = []) {
  if (!$el || !$el.length) return '';
  for (const name of names) {
    const variants = expandAttributeNames(name);
    for (const variant of variants) {
      if (!variant) continue;
      const attr = $el.attr(variant);
      if (hasContent(attr)) return attr;
    }
    for (const variant of variants) {
      if (!variant) continue;
      const dataValue = $el.data(variant);
      if (hasContent(dataValue)) return dataValue;
    }
  }
  return '';
}

function getTextSegments($el) {
  if (!$el || !$el.length) return [];
  const clone = $el.clone();
  clone.find('script, style').remove();
  clone.find('br').replaceWith('\n');
  const raw = tidyText(clone.text());
  if (!raw) return [];
  return raw
    .split(/\n+/)
    .map((segment) => tidyText(segment))
    .filter(Boolean);
}

const BANK_ATTR_NAMES = [
  'bankname',
  'bank-name',
  'bank',
  'tradeline',
  'tradeline-name',
  'productname',
  'product-name',
  'issuer',
  'card-name',
  'name',
];

const STATEMENT_ATTR_NAMES = [
  'statementdate',
  'statement-date',
  'statement',
  'statementrange',
  'statement-range',
  'statementwindow',
  'statement-window',
];

const BANK_SELECTORS = [
  '[data-bank-name]',
  '[data-field="bank"]',
  '.bank-name',
  '.bank',
  '.tradeline-name',
  '.tradeline__bank',
  '.product_title',
  '.woocommerce-loop-product__title',
  '.elementor-heading-title',
  'strong',
  'h2',
  'h3',
  'h4',
];

function extractBankAndStatement($cell, segments = []) {
  const candidateSet = new Set();
  const pushCandidate = (value) => {
    const text = tidyText(value);
    if (text) candidateSet.add(text);
  };

  BANK_ATTR_NAMES.forEach((name) => pushCandidate(getAttribute($cell, [name])));
  BANK_SELECTORS.forEach((selector) => pushCandidate($cell.find(selector).first().text()));
  segments.forEach((segment) => pushCandidate(segment));

  const bankCandidates = Array.from(candidateSet);

  const statementCandidates = [];
  const attrStatement = normalizeStatement(getAttribute($cell, STATEMENT_ATTR_NAMES));
  if (attrStatement) statementCandidates.push(attrStatement);
  bankCandidates.forEach((candidate) => {
    const normalized = normalizeStatement(candidate);
    if (normalized) statementCandidates.push(normalized);
  });

  const statement = statementCandidates.find(Boolean) || '';
  const bank = bankCandidates.find((candidate) => isLikelyBank(candidate))
    || bankCandidates.find((candidate) => !isLikelyStatement(candidate))
    || '';

  return { bank, statement, bankCandidates };
}

function inferBankFromBuyLink(link) {
  if (!link || typeof link !== 'string') return '';
  try {
    const url = new URL(link, 'https://example.com');
    const param = url.searchParams.get('bank')
      || url.searchParams.get('tradeline')
      || url.searchParams.get('name');
    const decoded = tidyText(param);
    if (decoded) return decoded;
    const slug = tidyText(url.pathname.split('/').filter(Boolean).pop());
    if (!slug) return '';
    const candidate = tidyText(slug.replace(/[-_]+/g, ' '));
    return isLikelyBank(candidate) ? candidate : '';
  } catch (err) {
    return '';
  }
}

function pickFallbackByPattern(values = [], pattern) {
  for (const value of values) {
    const text = tidyText(value);
    if (text && pattern.test(text)) return text;
  }
  return '';
}

function buildRecord(base) {
  const statement = normalizeStatement(base.statement_date);
  let bank = tidyText(base.bank);
  if (isLikelyStatement(bank)) bank = '';
  const price = Number.isFinite(base.price) ? Math.round(base.price * 100) / 100 : base.price;
  const limit = Number.isFinite(base.limit) ? base.limit : 0;
  return {
    buy_link: base.buy_link || null,
    bank,
    price: price ?? null,
    limit,
    age: tidyText(base.age),
    statement_date: statement,
    reporting: tidyText(base.reporting),
  };
}

function dedupe(records) {
  const seen = new Set();
  const result = [];
  for (const [index, rec] of records.entries()) {
    if (!rec.bank || rec.price == null) continue;
    const bank = rec.bank.toLowerCase();
    const limit = rec.limit ?? '';
    const age = rec.age ?? '';
    const reporting = rec.reporting ?? '';
    const price = rec.price ?? '';
    const statementToken = typeof rec.statement_date === 'string' && rec.statement_date.trim()
      ? rec.statement_date.trim().toLowerCase()
      : null;
    const uniquenessToken = statementToken ?? `idx:${index}`;
    const key = [bank, limit, age, reporting, price, uniquenessToken].join('|');
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

    const segments = getTextSegments(productTd);
    const { bank: rawBank, statement, bankCandidates } = extractBankAndStatement(productTd, segments);

    const creditLimit = parseCurrency(getAttribute(productTd, ['creditlimit', 'credit-limit', 'limit', 'highlimit', 'high-limit']))
      ?? parseCurrency(getAttribute(productTd, ['availablelimit', 'available-limit']))
      ?? 0;
    let dateOpened = tidyText(getAttribute(productTd, ['dateopened', 'date-opened', 'seasoning', 'seasoningtext', 'seasoning-text', 'age']));
    let reportingPeriod = tidyText(getAttribute(productTd, ['reportingperiod', 'reporting-period', 'reporting', 'bureaus', 'bureausreported', 'bureaus-reported']));

    if (!dateOpened) {
      dateOpened = pickFallbackByPattern(segments, /(year|month|week|season)/i);
    }
    if (!reportingPeriod) {
      reportingPeriod = pickFallbackByPattern(segments, /(experian|equifax|trans)/i);
    }

    const rawClientPrice = parseCurrency(getAttribute(productTd, ['clientprice', 'client-price', 'retailprice', 'retail-price']));
    const rawWholesalePrice = parseCurrency(getAttribute(productTd, ['wholesaleprice', 'wholesale-price', 'baseprice', 'base-price']));
    const priceFromCell = parseCurrency(priceTd.text());

    let chosenPrice = null;
    if (rawClientPrice != null) {
      chosenPrice = rawClientPrice;
    } else if (rawWholesalePrice != null) {
      chosenPrice = applyMarkup(rawWholesalePrice);
    } else if (priceFromCell != null) {
      chosenPrice = applyMarkup(priceFromCell);
    }

    if (chosenPrice == null) return;

    const record = {
      bank: rawBank,
      price: Math.round(chosenPrice * 100) / 100,
      limit: creditLimit,
      age: dateOpened,
      reporting: reportingPeriod,
      statement_date: statement,
    };

    let buyLink = tidyText(getAttribute(productTd, ['checkouturl', 'checkout-url', 'checkout', 'buy', 'buy-url', 'url']));
    if (!buyLink) {
      buyLink = productTd.find('a[href]').attr('href') || priceTd.find('a[href]').attr('href') || null;
    }
    if (buyLink) {
      record.buy_link = buyLink;
    }

    if (!record.bank) {
      const fallbackBank = bankCandidates.find((candidate) => isLikelyBank(candidate))
        || bankCandidates.find((candidate) => !isLikelyStatement(candidate));
      if (fallbackBank) record.bank = fallbackBank;
    }

    if (!record.bank) {
      const inferred = inferBankFromBuyLink(record.buy_link);
      if (inferred) record.bank = inferred;
    }

    if (!record.buy_link && record.bank) {
      record.buy_link = `/buy?bank=${encodeURIComponent(record.bank)}&price=${record.price}`;
    } else if (record.buy_link && record.bank && record.buy_link.startsWith('/buy')) {
      try {
        const url = new URL(record.buy_link, 'https://example.com');
        if (!url.searchParams.get('bank')) {
          url.searchParams.set('bank', record.bank);
        }
        if (!url.searchParams.get('price')) {
          url.searchParams.set('price', String(record.price));
        }
        record.buy_link = `${url.pathname}?${url.searchParams.toString()}`;
      } catch (err) {
        // ignore malformed URLs
      }
    }

    if (!record.bank) return;

    items.push(buildRecord(record));
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
        const $td = $(td);
        const text = tidyText($td.text());
        const segments = getTextSegments($td);

        if (!text && !$td.find('a[href]').length) return;

        if (header.includes('bank') || header.includes('tradeline') || header.includes('card')) {
          const { bank, statement } = extractBankAndStatement($td, segments);
          if (bank) record.bank = bank;
          if (!record.statement_date && statement) record.statement_date = statement;
          return;
        }
        if (header.includes('age') || header.includes('seasoning')) {
          record.age = text || pickFallbackByPattern(segments, /(year|month|week|season)/i);
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
        if (header.includes('report')) {
          record.reporting = text || pickFallbackByPattern(segments, /(experian|equifax|trans)/i);
          return;
        }
        if (header.includes('statement')) {
          const normalized = normalizeStatement(text) || segments.map(normalizeStatement).find(Boolean) || '';
          if (normalized) record.statement_date = normalized;
          return;
        }
        if (header.includes('buy') || header.includes('link') || header.includes('checkout')) {
          const href = $td.find('a[href]').attr('href');
          if (href) record.buy_link = href;
        }
      });

      const chosenPrice =
        explicitClientPrice != null
          ? explicitClientPrice
          : wholesalePrice != null
            ? applyMarkup(wholesalePrice)
            : null;

      if (chosenPrice == null) return;
      if (!record.bank) {
        const inferred = inferBankFromBuyLink(record.buy_link);
        if (inferred) record.bank = inferred;
      }
      if (!record.bank) return;

      record.price = Math.round(chosenPrice * 100) / 100;

      if (!record.buy_link) {
        record.buy_link = `/buy?bank=${encodeURIComponent(record.bank)}&price=${record.price}`;
      }

      records.push(buildRecord(record));
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
