import fieldMap from './fieldMap.js';
import { validateTradeline, enrich } from './validators.js';

export { fieldMap, validateTradeline, enrich };

export { coerceDateMDY, normalizeBureau, emptyHistory, emptyInquirySummary };
export { sanitizeCreditor };

const NORMALIZED_FIELD_MAP = Object.fromEntries(
  Object.entries(fieldMap).map(([label, config]) => [normalizeFieldLabel(label), config])
);

const NON_CREDITOR_HEADERS = new Set([
  'risk factors',
  'risk factor',
  'key factors',
  'score factors',
]);

const NON_CREDITOR_HEADER_PATTERNS = [
  'credit report',
  'reference #',
];

const BUREAU_PRIORITY = ['TransUnion', 'Experian', 'Equifax'];

const PERSONAL_INFO_FIELD_DEFINITIONS = {
  'credit report date': 'credit_report_date',
  'report date': 'credit_report_date',
  'name': 'name',
  'full name': 'name',
  'consumer name': 'name',
  'also known as': 'also_known_as',
  'aka': 'also_known_as',
  'former': 'former',
  'former name': 'former',
  'former names': 'former',
  'date of birth': 'date_of_birth',
  'dob': 'date_of_birth',
  'current address(es)': 'current_addresses',
  'current address': 'current_addresses',
  'current residence': 'current_addresses',
  'previous address(es)': 'previous_addresses',
  'previous address': 'previous_addresses',
  'prior address': 'previous_addresses',
  'former address': 'previous_addresses',
  'employer': 'employers',
  'employers': 'employers',
  'current employer': 'employers',
  'previous employer': 'employers',
  'former employer': 'employers',
  'employment': 'employers',
};

const PERSONAL_MULTI_VALUE_FIELDS = new Set([
  'also_known_as',
  'former',
  'current_addresses',
  'previous_addresses',
  'employers',
]);

const PERSONAL_INFO_FIELD_MAP = Object.fromEntries(
  Object.entries(PERSONAL_INFO_FIELD_DEFINITIONS).map(([label, key]) => [normalizeGenericLabel(label), key])
);

function directChildCells(adapter, row, selector){
  const nodes = adapter.find(row, selector) || [];
  if(!nodes.length) return [];
  return nodes.filter(cell => adapter.parent(cell) === row);
}

function extractRowLabel(adapter, row){
  const labeled = adapter.text(row, 'td.label');
  if(labeled) return labeled;
  const cells = directChildCells(adapter, row, 'td');
  if(!cells.length) return '';
  return adapter.text(cells[0]);
}

function extractRowValues(adapter, row){
  let cells = directChildCells(adapter, row, 'td.info');
  if(!cells.length){
    cells = directChildCells(adapter, row, 'td').slice(1);
  }
  return cells.map(cell => adapter.text(cell));
}

export function parseReport(context){
  const adapter = createDomAdapter(context);
  if(!adapter){
    return { tradelines: [], history: emptyHistory(), inquiries: [], inquiry_summary: emptyInquirySummary() };
  }

  const tradelines = [];
  const seenTradelines = new Set();
  const tables = adapter.selectAll('table.rpt_content_table.rpt_content_header.rpt_table4column');
  for(const table of tables){
    const { meta, skip } = inferTradelineMeta(adapter, table);
    if(skip) continue;

    const rows = adapter.rows(table);
    if(!rows.length) continue;

    const headerCells = adapter.find(rows[0], 'th');
    const cells = headerCells.length ? headerCells : adapter.find(rows[0], 'td');
    const bureaus = cells.slice(1).map(cell => adapter.text(cell));

  const dataRows = rows.slice(1).map(row => ({
    label: extractRowLabel(adapter, row),
    values: extractRowValues(adapter, row)
  }));

    const tradeline = buildTradeline(bureaus, dataRows, meta);
    if(!hasTradelineData(tradeline, bureaus)) continue;

    const dedupeKey = buildTradelineKey(tradeline);
    if(seenTradelines.has(dedupeKey)) continue;
    seenTradelines.add(dedupeKey);

    tradelines.push(tradeline);
  }

  const history = parseHistory(context);
  const { list: inquiries, summary: inquirySummary } = parseInquiries(context);

  const personalInformation = parsePersonalInformation(context);
  const creditScores = parseCreditScores(context);
  const accountHistory = buildAccountHistoryRecords(tradelines);
  const inquiryDetails = buildInquiryDetails(inquiries);
  const creditorContacts = parseCreditorContacts(context);

  return {
    tradelines,
    history,
    inquiries,
    inquiry_summary: inquirySummary,
    personal_information: personalInformation,
    credit_scores: creditScores,
    account_history: accountHistory,
    inquiry_details: inquiryDetails,
    creditor_contacts: creditorContacts,
  };
}

export function buildTradeline(bureaus, rows, meta = {}){
  const tl = {
    per_bureau:{},
    violations:[],
    meta:{
      creditor: sanitizeCreditor(meta.creditor) || null,
    },
  };
  for(const {label, values} of rows){
    const rule = lookupFieldRule(label);
    if(!rule) continue;
    values.forEach((raw,i)=>{
      const bureau = bureaus[i];
      if(!bureau) return;
      if(isEmptyValue(raw)) return;
      const norm = rule.normalizer ? rule.normalizer(raw) : raw;
      if(isEmptyValue(norm)) return;
      tl.per_bureau[bureau] ??= {};
      tl.per_bureau[bureau][rule.key] = norm;
      tl.per_bureau[bureau][`${rule.key}_raw`] = raw;
      if(rule.key === 'creditor_name'){
        const candidate = sanitizeCreditor(norm || raw);
        if(candidate && !tl.meta.creditor){
          tl.meta.creditor = candidate;
        }
      }
    });
  }
  for(const bureau of bureaus){
    const data = tl.per_bureau[bureau];
    if(!data) continue;
    const paymentStatus = getFieldValue(data, 'payment_status');
    const hasAccountStatus = Object.prototype.hasOwnProperty.call(data, 'account_status');
    if((!hasAccountStatus || !data.account_status) && paymentStatus){
      data.account_status = paymentStatus;
      if(Object.prototype.hasOwnProperty.call(data, 'payment_status_raw')){
        data.account_status_raw = data.payment_status_raw;
      }
    }
  }
  for(const b of bureaus){
    const v = validateTradeline(tl.per_bureau[b]||{});
    tl.violations.push(...v.map(x=>({ ...x, bureau:b })));
  }
  if(!tl.meta.creditor){
    tl.meta.creditor = inferCreditorFromPerBureau(tl.per_bureau) || 'Unknown Creditor';
  }
  return tl;
}

export function parseHistory(context){
  const adapter = createDomAdapter(context);
  if(!adapter) return emptyHistory();

  const tables = adapter.selectAll('table.addr_hsrty');
  if(!tables.length) return emptyHistory();

  const history = emptyHistory();
  for(const table of tables){
    const rows = adapter.rows(table);
    if(rows.length < 2) continue;

    const monthCells = adapter.find(rows[0], 'td.info');
    const months = monthCells.map(cell => adapter.text(cell, 'span.lg-view') || adapter.text(cell));
    const yearCells = adapter.find(rows[1], 'td.info');
    const years = yearCells.map(cell => adapter.text(cell));
    const labels = months.map((month, idx) => formatHistoryLabel(month, years[idx]));

    for(let i = 2; i < rows.length; i++){
      const row = rows[i];
      const bureau = normalizeBureau(adapter.text(row, 'td.label'));
      if(!bureau) continue;
      const cells = adapter.find(row, 'td.info');
      const statuses = cells.map((cell, idx) => {
        const classAttr = adapter.attr(cell, 'class') || '';
        const statusClass = classAttr.split(/\s+/).find(cls => cls.startsWith('hstry-')) || null;
        const statusText = adapter.text(cell) || null;
        return {
          col: labels[idx] || `col_${idx}`,
          status_class: statusClass,
          status_text: statusText
        };
      });
      history.byBureau[bureau] = statuses;
      history.summary[bureau] = summarizeHistory(statuses);
    }
  }
  return history;
}

export function parseInquiries(context){
  const adapter = createDomAdapter(context);
  if(!adapter) return { list: [], summary: emptyInquirySummary() };

  const primaryRows = adapter.selectAll("tr[ng-repeat*='inqPartition']");
  const heuristicRows = adapter.selectAll('tr').filter(tr => {
    if(adapter.hasAttr(tr, 'ng-repeat')) return false;
    const tds = adapter.find(tr, 'td.info');
    if(tds.length !== 4) return false;
    const bureauText = adapter.text(tds[3]);
    const dateText = adapter.text(tds[2]);
    const hasBureau = /\b(transunion|experian|equifax|tu|tuc|exp|eqf)\b/i.test(bureauText);
    return hasBureau && looksLikeDate(dateText);
  });

  const rows = primaryRows.length
    ? mergeUnique(primaryRows, heuristicRows)
    : heuristicRows;

  const list = rows.map(row => {
    const tds = adapter.find(row, 'td.info');
    if(tds.length < 4) return null;

    const creditorRaw = adapter.text(tds[0]);
    const industryRaw = adapter.text(tds[1]);
    const dateRaw = adapter.text(tds[2]);
    const bureauRaw = adapter.text(tds[3]);

    const bureau = normalizeBureau(bureauRaw) || (bureauRaw || '');
    const normalizedDate = coerceDateMDY(dateRaw) || (dateRaw || '');

    return {
      creditor: creditorRaw || '',
      industry: industryRaw || '',
      date: normalizedDate,
      bureau,
      raw: {
        creditor: creditorRaw || '',
        industry: industryRaw || '',
        date: dateRaw || '',
        bureau: bureauRaw || ''
      }
    };
  }).filter(Boolean);

  list.sort((a, b) => {
    const da = parseInquiryDate(a);
    const db = parseInquiryDate(b);
    if(da === null && db === null) return 0;
    if(da === null) return 1;
    if(db === null) return -1;
    return db - da;
  });

  const summary = emptyInquirySummary();
  summary.total = list.length;

  const now = Date.now();
  const MS_12MO = 365 * 24 * 60 * 60 * 1000;
  const MS_24MO = 2 * MS_12MO;

  for(const inquiry of list){
    if(inquiry.bureau && summary.byBureau[inquiry.bureau] != null){
      summary.byBureau[inquiry.bureau] += 1;
    }
    const d = new Date(inquiry.date || inquiry.raw.date);
    if(!Number.isNaN(+d)){
      const delta = now - +d;
      if(delta <= MS_12MO) summary.last12mo += 1;
      if(delta <= MS_24MO) summary.last24mo += 1;
    }
  }

  return { list, summary };
}

export function parsePersonalInformation(context){
  const adapter = createDomAdapter(context);
  if(!adapter) return {};

  const info = {};
  const bureauInfo = {};
  const tables = adapter.selectAll('table');
  for(const table of tables){
    const header = findNearestHeader(adapter, table);
    if(!header) continue;
    const headerText = adapter.text(header) || '';
    if(!/personal information/i.test(headerText)) continue;

    const rows = adapter.rows(table);
    let bureauHeaders = [];
    let headerIndex = -1;
    for(let i = 0; i < rows.length; i++){
      const row = rows[i];
      const headerCells = adapter.find(row, 'th');
      const candidates = headerCells.map(cell => normalizeBureau(adapter.text(cell))).filter(Boolean);
      if(candidates.length){
        bureauHeaders = candidates;
        headerIndex = i;
        break;
      }
    }
    if(!bureauHeaders.length && rows.length){
      const firstRowCells = adapter.find(rows[0], 'td').slice(1);
      const candidates = firstRowCells.map(cell => normalizeBureau(adapter.text(cell))).filter(Boolean);
      if(candidates.length){
        bureauHeaders = candidates;
        headerIndex = 0;
      }
    }

    for(const row of rows){
      if(headerIndex >= 0 && row === rows[headerIndex]) continue;
      if(adapter.find(row, 'th').length) continue;
      const cells = adapter.find(row, 'td');
      if(cells.length < 2) continue;
      const label = adapter.text(cells[0]);
      const key = mapPersonalInfoKey(label);
      if(!key) continue;
      if(bureauHeaders.length){
        bureauHeaders.forEach((bureau, idx) => {
          if(!bureau) return;
          const cell = cells[idx + 1];
          if(!cell) return;
          const rawValue = adapter.text(cell);
          if(isEmptyValue(rawValue)) return;

          if(PERSONAL_MULTI_VALUE_FIELDS.has(key)){
            const values = extractValuesFromCell(adapter, cell, rawValue)
              .filter(value => !isEmptyValue(value));
            if(!values.length) return;
            bureauInfo[bureau] ??= {};
            const existing = new Set(bureauInfo[bureau][key] || []);
            for(const value of values){
              if(value) existing.add(value);
            }
            bureauInfo[bureau][key] = Array.from(existing);
          } else {
            bureauInfo[bureau] ??= {};
            if(!bureauInfo[bureau][key]) {
              bureauInfo[bureau][key] = rawValue;
            }
          }
        });
        continue;
      }

      const rawValue = adapter.text(cells[1]);
      if(isEmptyValue(rawValue)) continue;

      if(PERSONAL_MULTI_VALUE_FIELDS.has(key)){
        const values = extractValuesFromCell(adapter, cells[1], rawValue)
          .filter(value => !isEmptyValue(value));
        if(!values.length) continue;
        const existing = new Set(info[key] || []);
        for(const value of values){
          if(value) existing.add(value);
        }
        info[key] = Array.from(existing);
      } else if(!info[key]){
        info[key] = rawValue;
      }
    }
  }

  if(Object.keys(bureauInfo).length){
    return bureauInfo;
  }
  return info;
}

export function parseCreditScores(context){
  const adapter = createDomAdapter(context);
  if(!adapter) return {};

  const scores = {};
  const tables = adapter.selectAll('table');
  for(const table of tables){
    const header = findNearestHeader(adapter, table);
    if(!header) continue;
    const headerText = adapter.text(header) || '';
    if(!/credit score/i.test(headerText)) continue;

    const rows = adapter.rows(table);
    if(!rows.length) continue;

    const headerCells = adapter.find(rows[0], 'th');
    const bureaus = headerCells.length > 1
      ? headerCells.slice(1).map(cell => normalizeScoreBureau(adapter.text(cell))).filter(Boolean)
      : [];

    for(const row of rows){
      const label = adapter.text(row, 'td.label') || adapter.text(row, 'th.label') || getCellText(adapter, row, 0);
      if(!/credit score/i.test(label)) continue;

      if(bureaus.length){
        const valueCells = adapter.find(row, 'td.info');
        bureaus.forEach((bureau, idx) => {
          if(!bureau) return;
          const value = adapter.text(valueCells[idx]);
          if(value) scores[bureau] = value;
        });
      } else {
        const cells = adapter.find(row, 'td');
        const value = cells.length > 1 ? adapter.text(cells[1]) : adapter.text(row);
        if(value) scores.overall = value;
      }
    }
  }

  return scores;
}

export function buildAccountHistoryRecords(tradelines = []){
  const records = [];
  for(const tradeline of tradelines){
    const creditorName = sanitizeCreditor(tradeline?.meta?.creditor || '');
    const perBureau = tradeline?.per_bureau || {};
    for(const [bureau, data] of Object.entries(perBureau)){
      if(!data || typeof data !== 'object') continue;
      const explicitCreditor = sanitizeCreditor(getFieldValue(data, 'creditor_name')) || sanitizeCreditor(getFieldValue(data, 'company_name'));
      const record = {
        bureau,
        name_of_account: explicitCreditor || creditorName,
        account_number: getFieldValue(data, 'account_number'),
        account_type: getFieldValue(data, 'account_type'),
        account_type_detail: getFieldValue(data, 'account_type_detail'),
        bureau_code: getFieldValue(data, 'bureau_code'),
        account_status: getFieldValue(data, 'account_status'),
        monthly_payment: getFieldValue(data, 'monthly_payment'),
        date_opened: getFieldValue(data, 'date_opened'),
        balance: getFieldValue(data, 'balance'),
        no_of_months_terms: getFieldValue(data, 'months_terms'),
        high_credit: getFieldValue(data, 'high_credit'),
        credit_limit: getFieldValue(data, 'credit_limit'),
        past_due: getFieldValue(data, 'past_due'),
        payment_status: getFieldValue(data, 'payment_status') || getFieldValue(data, 'account_status'),
        last_reported: getFieldValue(data, 'last_reported'),
        date_last_active: getFieldValue(data, 'date_last_active'),
        comments: getFieldValue(data, 'comments'),
        date_of_last_payment: getFieldValue(data, 'date_last_payment'),
        two_year_payment_history: getFieldValue(data, 'two_year_payment_history'),
      };
      if(!record.name_of_account && creditorName){
        record.name_of_account = creditorName;
      }

      const hasContent = Object.entries(record).some(([key, value]) => {
        if(key === 'bureau') return false;
        if(value == null) return false;
        if(typeof value === 'string') return value.trim() !== '';
        return true;
      });
      if(hasContent){
        record.name_of_account = record.name_of_account || '';
        records.push(record);
      }
    }
  }
  return records;
}

function buildInquiryDetails(inquiries = []){
  return inquiries.map(inquiry => ({
    creditor_name: inquiry.creditor || '',
    type_of_business: inquiry.industry || '',
    date_of_inquiry: inquiry.date || '',
    credit_bureau: inquiry.bureau || '',
  }));
}

export function parseCreditorContacts(context){
  const adapter = createDomAdapter(context);
  if(!adapter) return [];

  const contacts = [];
  const tables = adapter.selectAll('table');
  for(const table of tables){
    const header = findNearestHeader(adapter, table);
    if(!header) continue;
    const headerText = adapter.text(header) || '';
    if(!/creditor contact/i.test(headerText) && !/creditor information/i.test(headerText)) continue;

    const rows = adapter.rows(table);
    for(const row of rows){
      if(adapter.find(row, 'th').length) continue;
      const cells = adapter.find(row, 'td');
      if(!cells.length) continue;
      const values = cells.map(cell => adapter.text(cell));
      if(values.every(v => !v)) continue;
      const [name, address, phoneCandidate] = [values[0] || '', values[1] || '', values[2] || ''];
      const phone = looksLikePhone(phoneCandidate)
        ? phoneCandidate
        : (values.find(v => looksLikePhone(v)) || '');
      contacts.push({
        creditor_name: name,
        address,
        phone,
      });
    }
  }

  return dedupeContacts(contacts);
}

function mapPersonalInfoKey(label){
  const normalized = normalizeGenericLabel(label);
  return PERSONAL_INFO_FIELD_MAP[normalized] || null;
}

function normalizeGenericLabel(label){
  return (label || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractValuesFromCell(adapter, cell, fallback){
  const items = adapter.find(cell, 'li').map(li => adapter.text(li)).filter(Boolean);
  if(items.length) return items.map(value => value.trim()).filter(value => !isEmptyValue(value));

  const html = adapter.html ? adapter.html(cell) : '';
  if(html){
    const sanitized = decodeEntities(html)
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');
    const parts = sanitized
      .split(/\n+/)
      .map(part => part.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if(parts.length) return parts;
  }

  const text = (adapter.text(cell) || fallback || '').trim();
  return text && !isEmptyValue(text) ? [text] : [];
}

function decodeEntities(value){
  return (value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function getCellText(adapter, row, index){
  const cells = adapter.find(row, 'td');
  if(index >= cells.length) return '';
  return adapter.text(cells[index]);
}

function isEmptyValue(value){
  if(value == null) return true;
  const text = String(value).trim();
  if(!text) return true;
  if(/^[-–—]+$/.test(text)) return true;
  if(/^(n\/?a|none|not reported|not available)$/i.test(text)) return true;
  return false;
}

function normalizeScoreBureau(value){
  return normalizeBureau(value) || sanitizeCreditor(value);
}

function getFieldValue(data, key){
  if(!data || typeof data !== 'object') return '';
  const rawKey = `${key}_raw`;
  if(Object.prototype.hasOwnProperty.call(data, rawKey)){
    const rawValue = data[rawKey];
    if(rawValue != null && `${rawValue}`.trim() !== ''){
      return typeof rawValue === 'number' ? String(rawValue) : `${rawValue}`.trim();
    }
  }
  if(Object.prototype.hasOwnProperty.call(data, key)){
    const value = data[key];
    if(value == null) return '';
    if(typeof value === 'number' && Number.isFinite(value)) return String(value);
    const str = `${value}`.trim();
    return str;
  }
  return '';
}

function dedupeContacts(entries){
  const seen = new Set();
  const results = [];
  for(const entry of entries){
    const key = ['creditor_name', 'address', 'phone']
      .map(prop => sanitizeCreditor(entry[prop] || '').toLowerCase())
      .join('|');
    if(seen.has(key)) continue;
    seen.add(key);
    results.push(entry);
  }
  return results;
}

function hasTradelineData(tradeline, bureaus){
  if(!tradeline || !bureaus || !bureaus.length) return false;
  for(const bureau of bureaus){
    const data = tradeline.per_bureau?.[bureau];
    if(!data || typeof data !== 'object') continue;
    const keys = Object.keys(data).filter(key => !key.endsWith('_raw'));
    if(keys.length) return true;
  }
  return false;
}

function looksLikePhone(value){
  if(!value) return false;
  const trimmed = value.trim();
  if(!/\d{3}/.test(trimmed)) return false;
  const normalized = trimmed.replace(/ext\.?\s*\d*/gi, '').trim();
  if(!normalized) return false;
  return /^[+()0-9\s.-]+$/.test(normalized);
}

function emptyHistory(){
  return { byBureau: {}, summary: {} };
}

function emptyInquirySummary(){
  return {
    byBureau: {
      TransUnion: 0,
      Experian: 0,
      Equifax: 0,
    },
    total: 0,
    last12mo: 0,
    last24mo: 0,
  };
}

function summarizeHistory(statuses){
  const summary = { ok: 0, late: 0, unknown: 0, total: statuses.length };
  for(const entry of statuses){
    const cls = entry.status_class || '';
    const txt = (entry.status_text || '').trim().toUpperCase();
    if(cls === 'hstry-unknown'){
      summary.unknown += 1;
    } else if(cls === 'hstry-ok' || txt === 'OK'){
      summary.ok += 1;
    } else if(/hstry-(late|derog|neg)/.test(cls)){
      summary.late += 1;
    }
  }
  return summary;
}

function formatHistoryLabel(month, year){
  const monthPart = (month || '').trim();
  const yearPart = (year || '').trim().replace(/^['’]/, '');
  if(!yearPart) return monthPart;
  return `${monthPart} ’${yearPart}`.trim();
}

function parseInquiryDate(entry){
  const d = new Date(entry.date || entry.raw?.date);
  if(Number.isNaN(+d)) return null;
  return +d;
}

function looksLikeDate(value){
  const v = (value || '').trim();
  if(!v) return false;
  if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) return true;
  const d = new Date(v);
  return !Number.isNaN(+d);
}

function coerceDateMDY(value){
  const v = (value || '').trim();
  if(!v) return '';
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v;
  const d = new Date(v);
  if(Number.isNaN(+d)) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function normalizeBureau(value){
  const t = (value || '').toLowerCase();
  if(/\b(transunion|tu|tuc)\b/.test(t)) return 'TransUnion';
  if(/\b(experian|exp)\b/.test(t)) return 'Experian';
  if(/\b(equifax|eqf|eqx)\b/.test(t)) return 'Equifax';
  return null;
}

function mergeUnique(primary, fallback){
  const merged = [...primary];
  const seen = new Set(primary);
  for(const item of fallback){
    if(seen.has(item)) continue;
    merged.push(item);
    seen.add(item);
  }
  return merged;
}

function createDomAdapter(context){
  if(typeof context === 'function'){
    const $ = context;
    const root = $.root ? $.root() : null;
    const textFromCheerio = node => {
      if(!node) return '';
      return $(node).text().replace(/\s+/g, ' ').trim();
    };
    return {
      selectAll(selector){
        const scope = root || $;
        return scope.find ? scope.find(selector).toArray() : $(selector).toArray();
      },
      rows(table){
        const $table = $(table);
        const bodyRows = $table.find('tbody > tr').toArray();
        return bodyRows.length ? bodyRows : $table.find('tr').toArray();
      },
      find(node, selector){
        return $(node).find(selector).toArray();
      },
      text(node, selector){
        if(!node) return '';
        if(selector){
          const target = $(node).find(selector).get(0);
          return textFromCheerio(target);
        }
        return textFromCheerio(node);
      },
      html(node){
        if(!node) return '';
        return $(node).html() || '';
      },
      attr(node, name){
        return $(node).attr(name) || '';
      },
      hasAttr(node, name){
        return $(node).attr(name) !== undefined;
      },
      parent(node){
        const p = $(node).parent();
        return p.length ? p.get(0) : null;
      },
      previous(node){
        const prev = $(node).prev();
        return prev.length ? prev.get(0) : null;
      },
      matches(node, selector){
        return $(node).is(selector);
      }
    };
  }

  if(context && typeof context.querySelectorAll === 'function'){
    const root = context;
    return {
      selectAll(selector){
        return Array.from(root.querySelectorAll(selector));
      },
      rows(table){
        const bodyRows = table.querySelectorAll('tbody > tr');
        return bodyRows.length ? Array.from(bodyRows) : Array.from(table.querySelectorAll('tr'));
      },
      find(node, selector){
        return Array.from(node.querySelectorAll(selector));
      },
      text(node, selector){
        if(!node) return '';
        const target = selector ? node.querySelector(selector) : node;
        if(!target) return '';
        return (target.textContent || '').replace(/\s+/g, ' ').trim();
      },
      html(node){
        if(!node || typeof node.innerHTML !== 'string') return '';
        return node.innerHTML;
      },
      attr(node, name){
        return node.getAttribute ? (node.getAttribute(name) || '') : '';
      },
      hasAttr(node, name){
        return node.hasAttribute ? node.hasAttribute(name) : false;
      },
      parent(node){
        return node.parentElement || null;
      },
      previous(node){
        return node.previousElementSibling || null;
      },
      matches(node, selector){
        return node.matches ? node.matches(selector) : false;
      }
    };
  }

  return null;
}

function inferTradelineMeta(adapter, table){
  const meta = {};
  const header = findNearestHeader(adapter, table);
  if(!header) return { meta };
  const name = sanitizeCreditor(adapter.text(header));
  if(!name) return { meta };
  if(isNonCreditorHeader(name)){
    return { meta, skip: true };
  }

  if(!meta.creditor){
    const tableText = sanitizeCreditor(adapter.text(table));
    if(isNonCreditorHeader(tableText)){
      return { meta, skip: true };
    }
  }

  return { meta };
}

// Exposed for testing to validate non-creditor detection without coupling to DOM helpers
export function __test_inferTradelineMeta(adapter, table){
  return inferTradelineMeta(adapter, table);
}

function findNearestHeader(adapter, node){
  let current = node;
  const headerSelector = 'div.sub_header, div.section_header, div.section-title, div.section_header_title, h2, h3, h4';
  while(current){
    let sibling = adapter.previous(current);
    while(sibling){
      if(adapter.matches(sibling, headerSelector)){
        return sibling;
      }
      sibling = adapter.previous(sibling);
    }
    current = adapter.parent(current);
  }
  return null;
}

function lookupFieldRule(label){
  return NORMALIZED_FIELD_MAP[normalizeFieldLabel(label)];
}

function normalizeFieldLabel(label){
  return (label || '')
    .toLowerCase()
    .replace(/[:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeCreditor(value){
  if(!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  if(!text) return '';
  return text;
}

export function isNonCreditorHeader(value){
  const normalized = sanitizeCreditor(value).toLowerCase();
  if(!normalized) return false;
  if(NON_CREDITOR_HEADERS.has(normalized)) return true;
  return NON_CREDITOR_HEADER_PATTERNS.some(pattern => normalized.includes(pattern));
}

function inferCreditorFromPerBureau(perBureau = {}){
  for(const bureau of BUREAU_PRIORITY){
    const data = perBureau[bureau];
    if(!data || typeof data !== 'object') continue;
    const candidate = data.creditor_name || data.creditor || data.company_name;
    const cleaned = sanitizeCreditor(candidate);
    if(cleaned) return cleaned;
  }
  return null;
}

function buildTradelineKey(tradeline){
  const creditor = sanitizeCreditor(tradeline.meta?.creditor || '').toLowerCase();
  const parts = BUREAU_PRIORITY.map(bureau => {
    const data = tradeline.per_bureau?.[bureau] || {};
    const fields = [
      data.account_number || data.accountNumber || '',
      data.date_opened || '',
      data.date_last_payment || '',
      data.last_reported || '',
      data.date_first_delinquency || '',
      data.balance ?? data.balance_raw ?? '',
      data.past_due ?? data.past_due_raw ?? '',
    ];
    return `${bureau}:${fields.map(f => sanitizeCreditor(f).toLowerCase()).join('|')}`;
  });
  return [creditor, ...parts].join('||');
}
