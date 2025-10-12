import fieldMap from './fieldMap.js';
import { validateTradeline, enrich } from './validators.js';

export { fieldMap, validateTradeline, enrich };

const NORMALIZED_FIELD_MAP = Object.fromEntries(
  Object.entries(fieldMap).map(([label, config]) => [normalizeFieldLabel(label), config])
);

const NON_CREDITOR_HEADERS = new Set([
  'risk factors',
  'risk factor',
  'key factors',
  'score factors',
]);

const BUREAU_PRIORITY = ['TransUnion', 'Experian', 'Equifax'];

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
      label: adapter.text(row, 'td.label'),
      values: adapter.find(row, 'td.info').map(cell => adapter.text(cell))
    }));

    const tradeline = buildTradeline(bureaus, dataRows, meta);
    const dedupeKey = buildTradelineKey(tradeline);
    if(seenTradelines.has(dedupeKey)) continue;
    seenTradelines.add(dedupeKey);

    tradelines.push(tradeline);
  }

  const history = parseHistory(context);
  const { list: inquiries, summary: inquirySummary } = parseInquiries(context);

  return { tradelines, history, inquiries, inquiry_summary: inquirySummary };
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
      const norm = rule.normalizer ? rule.normalizer(raw) : raw;
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
  if(NON_CREDITOR_HEADERS.has(name.toLowerCase())){
    return { meta, skip: true };
  }
  meta.creditor = name;
  return { meta };
}

function findNearestHeader(adapter, node){
  let current = node;
  while(current){
    let sibling = adapter.previous(current);
    while(sibling){
      if(adapter.matches(sibling, 'div.sub_header')){
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
