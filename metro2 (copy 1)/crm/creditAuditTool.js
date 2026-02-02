import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { htmlToPdfBuffer } from './pdfUtils.js';
import { spawnPythonProcess } from './pythonEnv.js';

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
async function fetchCreditReport(srcPath) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  let reportPath = srcPath;

  if (!reportPath) {
    reportPath = path.join(__dirname, 'data', 'report.json');
  }

  if (reportPath.toLowerCase().endsWith('.html')) {
    const outPath = path.join(__dirname, 'data', 'report.json');
    await runPythonAudit(reportPath, outPath);
    reportPath = outPath;
  }

  try {
    const raw = await fs.readFile(reportPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Unable to read report JSON: ${err.message}`);
    return {};
  }
}

async function runPythonAudit(inputHtml, outputJson) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const script = path.join(__dirname, 'metro2_audit_multi.py');

  const { child: py } = await spawnPythonProcess(
    [script, '-i', inputHtml, '-o', outputJson, '--json-only'],
    { stdio: 'inherit' }
  );

  return new Promise((resolve, reject) => {
    py.once('error', reject);
    py.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`metro2_audit_multi.py exited with code ${code}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------
function statuteRefs(title = '') {
  const t = String(title).toLowerCase();
  if (t.includes('balance') || t.includes('past due')) {
    return {
      fcra: '15 U.S.C. §1681s-2(a)(1)(A) - furnishers must report accurate balance information',
      fdcpa: '15 U.S.C. §1692e(2)(A) - prohibits false representation of the amount owed',
    };
  }
  if (t.includes('late') || t.includes('delinquent')) {
    return {
      fcra: '15 U.S.C. §1681e(b) - agencies must ensure maximum possible accuracy of payment history',
      fdcpa: '15 U.S.C. §1692e(8) - bars communicating false credit information',
    };
  }
  return {
    fcra: '15 U.S.C. §1681s-2 - furnishers must provide accurate information and correct errors',
    fdcpa: '15 U.S.C. §1692e - prohibits false or misleading representations',
  };
}

function normalizePerBureauFields(fields = {}) {
  const result = { ...fields };
  FIELDS.forEach(([field]) => {
    const rawKey = `${field}_raw`;
    if (Object.prototype.hasOwnProperty.call(fields, rawKey) && fields[rawKey] !== null && fields[rawKey] !== undefined && fields[rawKey] !== '') {
      result[field] = fields[rawKey];
    }
  });
  if (Array.isArray(fields.comments)) {
    result.comments = fields.comments;
  }
  return result;
}

function convertTradelinesToAccountHistory(tradelines = []) {
  const entries = [];
  tradelines.forEach((tl, tradelineIndex) => {
    if (!tl || typeof tl !== 'object') return;
    const creditor = tl.meta?.creditor || tl.creditor || 'Unknown Creditor';
    const bureaus = tl.per_bureau || {};
    const accountNumbers = tl.meta?.account_numbers || {};
    const violationList = Array.isArray(tl.violations)
      ? tl.violations.map((v, idx) => ({ ...v, originalIndex: idx }))
      : [];
    const bureauKeys = Object.keys(bureaus);

    bureauKeys.forEach((bureau) => {
      const fields = normalizePerBureauFields(bureaus[bureau] || {});
      const targetedViolations = violationList
        .filter((v) => {
          const target = v?.evidence?.bureau || v?.bureau;
          return !target || target === bureau;
        })
        .map((v) => ({ ...v, bureau }));

      const violations = targetedViolations.length
        ? targetedViolations
        : violationList.map((v) => ({ ...v, bureau }));

      entries.push({
        creditor_name: creditor,
        account_number: accountNumbers[bureau] || fields.account_number || '',
        bureau,
        ...fields,
        violations,
        __meta: { tradelineIndex },
      });
    });
  });

  return entries;
}

function buildAccountBuckets(accountHistory = [], fallbackTradelines = []) {
  const entries = Array.isArray(accountHistory) && accountHistory.length
    ? accountHistory
    : convertTradelinesToAccountHistory(fallbackTradelines);

  const buckets = new Map();
  const order = [];
  let fallback = 0;

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const creditor = entry.creditor_name || 'Unknown Creditor';
    const acctNum = entry.account_number || entry.accountnumber || '';
    const keyParts = [creditor.trim().toLowerCase()];
    if (acctNum) keyParts.push(String(acctNum).trim().toLowerCase());
    const key = keyParts.filter(Boolean).join('::') || `${creditor.trim().toLowerCase()}::${fallback++}`;

    if (!buckets.has(key)) {
      buckets.set(key, {
        creditor,
        per_bureau: {},
        issues: [],
        issueKeys: new Set(),
      });
      order.push(key);
    }

    const bucket = buckets.get(key);
    const bureau = entry.bureau || 'Unknown';
    const { violations, bureau: _ignored, creditor_name, __meta, ...fields } = entry;
    bucket.per_bureau[bureau] = fields;

    if (Array.isArray(violations)) {
      for (const violation of violations) {
        const legal = statuteRefs(violation.title);
        const issueKey = violation.originalIndex != null
          ? `idx:${violation.originalIndex}`
          : `${violation.id || violation.code || ''}::${violation.title || ''}::${violation.bureau || ''}`;
        if (bucket.issueKeys.has(issueKey)) continue;
        bucket.issueKeys.add(issueKey);
        bucket.issues.push({
          id: violation.id,
          code: violation.id,
          title: violation.title,
          detail: violation.detail,
          severity: violation.severity,
          bureau: violation.bureau || bureau,
          fcra: legal.fcra,
          fdcpa: legal.fdcpa,
          originalIndex: violation.originalIndex,
        });
      }
    }
  }

  return order.map((key) => {
    const bucket = buckets.get(key);
    if (bucket?.issueKeys) {
      delete bucket.issueKeys;
    }
    return {
      creditor: bucket.creditor,
      per_bureau: bucket.per_bureau,
      bureaus: bucket.per_bureau,
      issues: bucket.issues,
    };
  });
}

function selectBureaus(acc, selection) {
  if (!selection) return { bureaus: acc.bureaus, issues: acc.issues };

  const wantedBureaus = new Set(selection.bureaus || []);
  const filteredBureaus = {};
  if (!wantedBureaus.size) {
    Object.assign(filteredBureaus, acc.bureaus);
  } else {
    for (const bureau of wantedBureaus) {
      if (acc.bureaus[bureau]) {
        filteredBureaus[bureau] = acc.bureaus[bureau];
      }
    }
  }

  const wantedViolations = new Set(selection.violationIdxs || []);
  const issues = !wantedViolations.size
    ? acc.issues
    : acc.issues.filter((issue, idx) => {
        const key = issue?.originalIndex != null ? issue.originalIndex : idx;
        return wantedViolations.has(key);
      });

  return { bureaus: filteredBureaus, issues };
}

export function normalizeReport(raw = {}, selections = null) {
  const accountHistory = Array.isArray(raw.account_history) ? raw.account_history : [];
  const tradelines = Array.isArray(raw.tradelines) ? raw.tradelines : [];
  const accountHistoryHasViolations = accountHistory.some(
    (entry) => Array.isArray(entry?.violations) && entry.violations.length > 0,
  );
  const useAccountHistory = accountHistory.length > 0 && (accountHistoryHasViolations || tradelines.length === 0);
  const accounts = buildAccountBuckets(useAccountHistory ? accountHistory : [], tradelines);
  const personalInformation = raw.personal_information || [];
  const personalMismatches = raw.personal_mismatches || [];
  const inquiries = raw.inquiries || [];
  const inquiryViolations = raw.inquiry_violations || [];

  if (Array.isArray(selections) && selections.length) {
    const selected = [];
    selections.forEach((selection) => {
      const acc = accounts[selection.tradelineIndex];
      if (!acc) return;
      const { bureaus, issues } = selectBureaus(acc, selection);
      selected.push({
        creditor: acc.creditor,
        bureaus,
        issues,
      });
    });
    return {
      generatedAt: new Date().toISOString(),
      accounts: selected,
      personalInformation,
      personalMismatches,
      inquiries,
      inquiryViolations,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    accounts,
    personalInformation,
    personalMismatches,
    inquiries,
    inquiryViolations,
  };
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------
const STATUS_MAP = {
  'Collection/Chargeoff': 'Past due and sent to collections',
  'Charge-off': 'Past due, more than 120 days',
  'Derogatory': 'Negative status',
  'Pays as agreed': 'Pays as agreed',
  'Open': 'Open and active',
  'Closed': 'Closed',
};

function friendlyStatus(status) {
  return STATUS_MAP[status] || status;
}

function recommendAction(issueTitle) {
  return `Consider disputing "${issueTitle}" with the credit bureau or contacting the creditor for correction.`;
}

const FIELDS = [
  ['account_number', 'Account #'],
  ['account_type', 'Account Type'],
  ['payment_status', 'Account Payment Status'],
  ['account_status', 'Account Status'],
  ['balance', 'Balance'],
  ['past_due', 'Past Due'],
  ['high_credit', 'High Credit'],
  ['credit_limit', 'Credit Limit'],
  ['monthly_payment', 'Payment'],
  ['date_opened', 'Date Opened'],
  ['date_last_active', 'Date Last Active'],
  ['date_closed', 'Date Closed'],
  ['last_reported', 'Last Reported'],
  ['date_last_payment', 'Date of Last Payment'],
  ['comments', 'Comments'],
];

function buildRowValues(info, field) {
  const value = info?.[field];
  if (field === 'comments' && Array.isArray(value)) {
    return value.join('<br>');
  }
  if (['payment_status', 'account_status'].includes(field)) {
    return friendlyStatus(value);
  }
  return value ?? '';
}

function isNegative(field, value) {
  const str = String(value || '').toLowerCase();
  if (field.includes('past') && parseFloat(str.replace(/[^0-9.-]/g, '')) > 0) return true;
  return ['collection', 'late', 'charge', 'delinquent', 'derog'].some((word) => str.includes(word));
}

export function renderHtml(report, consumerName = 'Consumer') {
  const filtered = (report.accounts || []).filter((acc) => Object.keys(acc.bureaus || {}).length);
  const accountSections = filtered.map((acc) => {
    const bureaus = Object.keys(acc.bureaus || {});
    const rows = FIELDS.map(([field, label]) => {
      const rawValues = bureaus.map((bureau) => buildRowValues(acc.bureaus[bureau], field));
      const diffValues = new Set(rawValues.filter((value) => String(value).trim() !== ''));
      const diffClass = diffValues.size > 1 ? ' diff' : '';
      const cells = rawValues
        .map((value, idx) => {
          const negative = isNegative(field.toLowerCase(), value) ? ' class="neg"' : '';
          const htmlVal = escapeHtml(value).replace(/&lt;br&gt;/g, '<br>');
          return `<td${negative}>${htmlVal}</td>`;
        })
        .join('');
      return `<tr class="row${diffClass}"><th>${escapeHtml(label)}</th>${cells}</tr>`;
    }).join('');

    const issueItems = (acc.issues || [])
      .map((issue) => {
        if (!issue || !issue.title) return '';
        const action = recommendAction(issue.title);
        const code = issue.code ? `[${escapeHtml(issue.code)}] ` : '';
        const sev = issue.severity ? ` (Severity ${escapeHtml(String(issue.severity))})` : '';
        const detail = issue.detail ? ` ${escapeHtml(issue.detail)}` : '';
        return `<li><strong>${escapeHtml(issue.bureau || 'All Bureaus')}</strong>: ${code}${escapeHtml(issue.title)}${sev}${detail}. ${escapeHtml(action)}<br/>FCRA: ${escapeHtml(issue.fcra)}<br/>FDCPA: ${escapeHtml(issue.fdcpa)}</li>`;
      })
      .filter(Boolean)
      .join('');

    const issueBlock = issueItems ? `<p><strong>Audit Reasons:</strong></p><ul>${issueItems}</ul>` : '';

    return `
      <h2>${escapeHtml(acc.creditor)}</h2>
      <h3>Comparison (All Available Bureaus)</h3>
      <table>
        <thead><tr><th>Field</th>${bureaus.map((b) => `<th class="bureau">${escapeHtml(b)}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${issueBlock}
    `;
  }).join('\n');

  const sectionsHtml = accountSections || '<p>No bureau data</p>';
  const dateStr = new Date(report.generatedAt || Date.now()).toLocaleString();

  return `<!DOCTYPE html>
  <html><head><meta charset="utf-8"/><style>
  body{font-family:Arial, sans-serif;margin:20px;}
  h1{text-align:center;}
  table{width:100%;margin-top:10px;border-collapse:collapse;}
  th,td{border:1px solid #ccc;padding:4px;}
  th.bureau{text-align:center;background:#f5f5f5;}
  tr.diff td{background:#fff3cd;}
  .neg{background:#fee2e2;color:#b91c1c;}
  footer{margin-top:40px;font-size:0.8em;color:#555;}
  </style></head>
  <body>
  <h1>${escapeHtml(dateStr)}</h1>
  <h1>${escapeHtml(consumerName)}</h1>
  <h1>Credit Repair Audit</h1>
  <h1>Your First Steps To Financial Freedom!</h1>
  ${sectionsHtml}
  <footer>
    <hr/>
    <p>This report is for informational purposes only and is not legal advice.</p>
  </footer>
  </body></html>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// PDF utilities
// ---------------------------------------------------------------------------
export async function savePdf(html) {
  if (!html || !html.trim()) {
    throw new Error('No HTML content provided');
  }
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.join(__dirname, 'public', 'reports');
  await fs.mkdir(outDir, { recursive: true });
  const filename = `credit-repair-audit-${Date.now()}.pdf`;
  const outPath = path.join(outDir, filename);
  try {
    const pdfBuffer = await htmlToPdfBuffer(html, { title: 'Credit Repair Audit' });
    await fs.writeFile(outPath, pdfBuffer);
    return { path: outPath, url: `/reports/${filename}` };
  } catch (err) {
    console.error('PDF generation failed, saving HTML instead:', err.message);
    const htmlPath = outPath.replace(/\.pdf$/, '.html');
    await fs.writeFile(htmlPath, html, 'utf-8');
    return { path: htmlPath, url: `/reports/${path.basename(htmlPath)}`, warning: err.message };
  }
}

// ---------------------------------------------------------------------------
// CLI usage
// ---------------------------------------------------------------------------
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  const src = process.argv[2];
  const raw = await fetchCreditReport(src);
  const normalized = normalizeReport(raw);
  const consumerName = raw?.personal_information?.[0]?.Name?.TransUnion || 'Consumer';
  const html = renderHtml(normalized, consumerName);
  const result = await savePdf(html);
  if (result.warning) {
    console.log('PDF generation failed:', result.warning);
    console.log('HTML saved to', result.path);
  } else {
    console.log('PDF generated at', result.path);
  }
}

export { fetchCreditReport };
