// pullTradelineData.js
// Simplified pipeline that relies on the Python metro2_audit_multi.py parser
// for HTML → JSON conversion and Metro-2 violation detection.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ALL_BUREAUS = ['TransUnion', 'Experian', 'Equifax'];

function makeKey(creditor, accountNumber, fallback) {
  const parts = [String(creditor || '').trim().toLowerCase()];
  if (accountNumber) {
    parts.push(String(accountNumber).trim().toLowerCase());
  }
  const key = parts.filter(Boolean).join('::');
  return key || `unknown::${fallback}`;
}

function mergeViolations(existing = [], incoming = []) {
  const merged = [];
  const seen = new Set();
  for (const item of [...(existing || []), ...(incoming || [])]) {
    if (!item || typeof item !== 'object') continue;
    const key = item.id || item.code || JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function buildViolationGroups(violations = []) {
  return violations.reduce((groups, violation) => {
    const key = violation.id || violation.code || 'General';
    if (!groups[key]) groups[key] = [];
    groups[key].push(violation);
    return groups;
  }, {});
}

function mergeGroupedViolations(existing = {}, incoming = {}) {
  const result = { ...existing };
  for (const [group, list] of Object.entries(incoming || {})) {
    const prev = Array.isArray(result[group]) ? result[group] : [];
    result[group] = mergeViolations(prev, list);
  }
  return result;
}

function convertAuditToTradelines(audit = {}) {
  const map = new Map();
  const order = [];
  let fallback = 0;

  for (const entry of audit.account_history || []) {
    if (!entry || typeof entry !== 'object') continue;
    const creditor = entry.creditor_name || 'Unknown Creditor';
    const accountNumber = entry.account_number || entry.accountnumber || '';
    const key = makeKey(creditor, accountNumber, fallback++);
    if (!map.has(key)) {
      map.set(key, {
        meta: { creditor },
        per_bureau: {},
        violations: [],
        violations_grouped: {},
      });
      order.push(key);
    }
    const bucket = map.get(key);
    const bureau = entry.bureau || 'Unknown';
    const { violations, bureau: _ignored, creditor_name, ...fields } = entry;
    bucket.per_bureau[bureau] = fields;
    if (Array.isArray(violations)) {
      const withBureau = violations.map((v) => ({ ...v, bureau }));
      bucket.violations = mergeViolations(bucket.violations, withBureau);
    }
  }

  return order.map((key) => {
    const tl = map.get(key);
    tl.violations_grouped = buildViolationGroups(tl.violations);
    tl.meta.account_numbers = tl.meta.account_numbers || {};
    for (const bureau of ALL_BUREAUS) {
      const acct = tl.per_bureau[bureau]?.account_number;
      if (acct) tl.meta.account_numbers[bureau] = acct;
    }
    return tl;
  });
}

function enrichTradeline(tl, override = {}) {
  for (const bureau of ALL_BUREAUS) {
    const pb = (tl.per_bureau[bureau] ||= {});
    for (const [field, value] of Object.entries(override || {})) {
      if (pb[field] == null || pb[field] === '') {
        pb[field] = value;
      }
    }
    for (const other of ALL_BUREAUS) {
      if (other === bureau) continue;
      for (const [field, value] of Object.entries(tl.per_bureau[other] || {})) {
        if (pb[field] == null || pb[field] === '') {
          pb[field] = value;
        }
      }
    }
  }
  return tl;
}

async function fetchHtmlWithGuards(url, fetchImpl, maxBytes = 8 * 1024 * 1024) {
  const res = await fetchImpl(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Failed to fetch report: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  if (text.length > maxBytes) {
    throw new Error(`Report too large (${text.length} bytes > ${maxBytes}).`);
  }
  return text;
}

async function runMetro2Audit(html, { timeoutMs = 60_000 } = {}) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const scriptPath = path.join(__dirname, 'metro2_audit_multi.py');
  const tmpPrefix = `metro2-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpHtml = path.join(os.tmpdir(), `${tmpPrefix}.html`);
  const tmpJson = path.join(os.tmpdir(), `${tmpPrefix}.json`);

  await fs.writeFile(tmpHtml, html, 'utf-8');

  await new Promise((resolve, reject) => {
    const pythonCandidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
    let selected = null;

    const tryNext = () => {
      if (!pythonCandidates.length) {
        reject(new Error('No Python executable found on PATH.'));
        return;
      }
      selected = pythonCandidates.shift();
      const py = spawn(selected, [scriptPath, '-i', tmpHtml, '-o', tmpJson, '--json-only']);
      let stderr = '';
      const timer = setTimeout(() => {
        py.kill('SIGKILL');
      }, timeoutMs);
      py.stderr?.on('data', (buf) => {
        stderr += buf.toString();
      });
      py.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      py.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve();
        } else if (pythonCandidates.length) {
          tryNext();
        } else {
          reject(new Error(`metro2_audit_multi.py exited with code ${code}${stderr ? `\n${stderr}` : ''}`));
        }
      });
    };

    tryNext();
  });

  try {
    const raw = await fs.readFile(tmpJson, 'utf-8');
    return JSON.parse(raw);
  } finally {
    await Promise.allSettled([fs.unlink(tmpHtml), fs.unlink(tmpJson)]);
  }
}

async function pullTradelineData({ apiUrl, fetchImpl = fetch, overrides = {}, auditImpl = runMetro2Audit }) {
  const html = await fetchHtmlWithGuards(apiUrl, fetchImpl);
  const audit = await auditImpl(html);
  const tradelines = convertAuditToTradelines(audit);
  for (const tl of tradelines) {
    const override = overrides[tl.meta.creditor] || {};
    enrichTradeline(tl, override);
  }
  return {
    tradelines,
    personalInformation: audit.personal_information || [],
    personalMismatches: audit.personal_mismatches || [],
    inquiries: audit.inquiries || [],
    inquiryViolations: audit.inquiry_violations || [],
  };
}

export { enrichTradeline, mergeViolations as mergeViolationLists, mergeGroupedViolations, convertAuditToTradelines as mapAuditedViolations };
export default pullTradelineData;
