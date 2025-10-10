// pullTradelineData.js
// Purpose: fetch a credit report HTML page, parse it in JS, then enrich each tradeline
// with violations produced by a Python Metro 2 audit script. Designed for Node ESM.
//
// Requires: jsdom, a local Python file metro2_audit_multi.py on PATH or alongside this file.

import { JSDOM } from 'jsdom';
import parseCreditReportHTML from './parser.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import os from 'node:os';

const ALL_BUREAUS = ['TransUnion', 'Experian', 'Equifax'];
const UNKNOWN_CREDITOR_PLACEHOLDER = 'Unknown Creditor';

const PLACEHOLDER_CREDITOR_NAMES = new Set([
  '',
  'unknown',
  'unknown creditor',
  'unknowncreditor',
  'n/a',
  'na',
  'not available',
  'not provided',
  'not reported',
  'no creditor',
  'no creditor name provided',
  'unspecified',
  'none',
]);

// Fields we try to fill by copying from another bureau when missing
const ENRICH_FIELDS = [
  'account_number',
  'account_type',
  'account_status',
  'payment_status',
  'monthly_payment',
  'balance',
  'credit_limit',
  'high_credit',
  'past_due',
  'date_opened',
  'last_reported',
  'date_last_payment',
  'comments',
];

/**
 * Lightly fill missing per-bureau fields by borrowing values from other bureaus
 * (or an override map you supply per creditor). This helps downstream rules that
 * need a value present on each bureau’s cell.
 */
function enrichTradeline(tl, override = {}) {
  for (const bureau of ALL_BUREAUS) {
    const pb = (tl.per_bureau[bureau] ||= {});
    for (const field of ENRICH_FIELDS) {
      // If field missing/empty, try override first, else copy from another bureau that has it
      if (pb[field] == null || pb[field] === '') {
        if (override[field] != null) {
          pb[field] = override[field];
          continue;
        }
        for (const b2 of ALL_BUREAUS) {
          const v = tl.per_bureau?.[b2]?.[field];
          if (v != null && v !== '') {
            pb[field] = v;
            break;
          }
        }
      }
    }
  }
  return tl;
}

/**
 * Create a stable key for aligning JS and Python tradelines.
 * We combine creditor + all known account numbers across bureaus.
 * If nothing exists, we fall back to creditor only (less reliable but better than index matching).
 */
function canonicalizeCreditorKey(name) {
  let normalized = (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return 'unknown';

  const stripped = normalized.replace(/\s*creditor$/, '').trim();
  const candidates = [normalized, stripped];
  for (const candidate of candidates) {
    const cleaned = candidate.replace(/[^a-z0-9\s]/g, '').trim();
    if (PLACEHOLDER_CREDITOR_NAMES.has(cleaned)) {
      return 'unknown';
    }
  }

  return stripped || normalized;
}

function makeTLKey(tl) {
  const creditor = canonicalizeCreditorKey(tl?.meta?.creditor || UNKNOWN_CREDITOR_PLACEHOLDER);
  const acctNums = Array.from(
    new Set(
      ALL_BUREAUS
        .map((b) => tl?.per_bureau?.[b]?.account_number || '')
        .filter(Boolean)
        .map((s) => s.trim().toLowerCase())
    )
  );
  return `${creditor}::${acctNums.sort().join('|')}`;
}

/**
 * Map Python audit results to JS tradelines by key instead of by array index.
 * Expects the Python JSON to have the same shape you’re already reading:
 * { tradelines: [{ meta:{creditor,...}, per_bureau:{...}, violations, violations_grouped }, ...] }
 */
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([key, val]) => [key, stableStringify(val)])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${val}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeViolation(item) {
  if (!item || typeof item !== 'object') return item;
  if (Array.isArray(item)) return item.map((entry) => normalizeViolation(entry));

  const { source, ...rest } = item;
  const normalized = {};
  for (const [key, value] of Object.entries(rest)) {
    normalized[key] = normalizeViolation(value);
  }
  return normalized;
}

function mergeViolationLists(existing = [], incoming = []) {
  const merged = [];
  const seen = new Set();

  for (const item of [
    ...(Array.isArray(existing) ? existing : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ]) {
    if (!item || typeof item !== 'object') continue;

    const keyParts = [];
    if (item.id) keyParts.push(`id:${item.id}`);
    if (item.code) keyParts.push(`code:${item.code}`);
    if (!keyParts.length) {
      keyParts.push(`hash:${stableStringify(normalizeViolation(item))}`);
    }

    const uniqueKey = keyParts.join('|');
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);
    merged.push(item);
  }

  return merged;
}

function mergeGroupedViolations(existing = {}, incoming = {}) {
  const result = { ...existing };
  Object.entries(incoming || {}).forEach(([group, list]) => {
    const prev = Array.isArray(result[group]) ? result[group] : [];
    result[group] = mergeViolationLists(prev, list);
  });
  return result;
}

function mapAuditedViolations(report, audit) {
  if (!audit?.tradelines || !report?.tradelines) return;

  // Build a lookup from Python results
  const pyMap = new Map();
  for (const pyTL of audit.tradelines) {
    const key = makeTLKey(pyTL).toLowerCase();
    if (!pyMap.has(key)) pyMap.set(key, []);
    pyMap.get(key).push(pyTL); // allow duplicates; we’ll shift() as we assign
  }

  for (const tl of report.tradelines) {
    const key = makeTLKey(tl).toLowerCase();
    const bucket = pyMap.get(key);
    const match = bucket?.length ? bucket.shift() : null;

    if (!match) continue;

    // If we found a matching Python tradeline, merge its violations with any pre-existing ones
    tl.violations = mergeViolationLists(tl.violations, match.violations);
    tl.violations_grouped = mergeGroupedViolations(tl.violations_grouped, match.violations_grouped);
  }
}

/**
 * Fetch helper: protects against obviously wrong content and oversized responses.
 */
async function fetchHtmlWithGuards(url, fetchImpl, maxBytes = 8 * 1024 * 1024 /* 8MB */) {
  const res = await fetchImpl(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Failed to fetch report: ${res.status} ${res.statusText}`);
  }

  // Content-Type sanity check (best-effort; some servers lie)
  const ctype = res.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml\+xml/i.test(ctype)) {
    // Not fatal; just a warning. You can choose to throw instead.
    console.warn(`Warning: Unexpected Content-Type "${ctype}". Attempting to parse as HTML.`);
  }

  // Size guard: stream and enforce cap
  const reader = res.body?.getReader?.();
  if (!reader) {
    // Some fetch impls buffer anyway
    const text = await res.text();
    if (text.length > maxBytes) {
      throw new Error(`Report too large (${text.length} bytes > ${maxBytes}).`);
    }
    return text;
  }

  let received = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      reader.cancel().catch(() => {});
      throw new Error(`Report too large (> ${maxBytes} bytes).`);
    }
    chunks.push(value);
  }
  // Merge Uint8Arrays to string
  const buf = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

/**
 * Main entry: pulls HTML, parses tradelines/inquiries, enriches missing fields,
 * runs the Python audit, and merges violations back onto the JS objects.
 *
 * @param {Object} opts
 * @param {string} opts.apiUrl - URL that returns the report HTML
 * @param {Function} [opts.fetchImpl=fetch] - Custom fetch impl (useful for testing)
 * @param {Object} [opts.overrides={}] - Optional map { creditorName: { field:value } }
 * @param {Function} [opts.auditImpl=runMetro2Audit] - For testing, pass a fake auditor
 */
async function pullTradelineData({ apiUrl, fetchImpl = fetch, overrides = {}, auditImpl = runMetro2Audit }) {
  // 1) Fetch HTML (with a few safety checks to avoid surprises)
  const html = await fetchHtmlWithGuards(apiUrl, fetchImpl);

  // 2) Parse in JS via jsdom (browser DOM in Node)
  const dom = new JSDOM(html);
  let report;
  try {
    report = parseCreditReportHTML(dom.window.document);
  } finally {
    // Free resources
    dom.window.close();
  }

  // 3) Enrich each tradeline (fill per-bureau holes + collect account numbers)
  for (const tl of report.tradelines || []) {
    const ov = overrides[tl.meta?.creditor] || {};
    enrichTradeline(tl, ov);

    // Ensure meta.account_numbers exists and is filled for convenience
    tl.meta = tl.meta || {};
    tl.meta.account_numbers = tl.meta.account_numbers || {};
    for (const b of ALL_BUREAUS) {
      const acct = tl.per_bureau?.[b]?.account_number;
      if (acct && !tl.meta.account_numbers[b]) {
        tl.meta.account_numbers[b] = acct;
      }
    }
  }

  // 4) Run Python audit (optional) and merge violations in a key-stable way
  try {
    const audit = auditImpl ? await auditImpl(html) : null;
    if (audit) mapAuditedViolations(report, audit);
  } catch (err) {
    // We log a warning, but we don’t fail the whole pipeline
    console.warn('metro2_audit_multi.py failed:', err?.message || err);
  }

  return report;
}

export { enrichTradeline, mergeViolationLists, mergeGroupedViolations, mapAuditedViolations };
export default pullTradelineData;

/**
 * Spawn Python to run metro2_audit_multi.py with temp input/output files.
 * Adds:
 *  - cross-platform python executable detection
 *  - timeout (default 60s)
 *  - stderr capture for easier debugging
 *  - robust temp cleanup
 */
async function runMetro2Audit(html, { timeoutMs = 60_000 } = {}) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  // Pick a python executable that works on the host OS
  const pythonCandidates = process.platform === 'win32'
    ? ['python', 'python3'] // Windows typically "python"
    : ['python3', 'python']; // *nix typically "python3" first

  let pythonExe = null;
  for (const cand of pythonCandidates) {
    try {
      await new Promise((resolve, reject) => {
        const p = spawn(cand, ['--version']);
        p.on('error', reject);
        p.on('close', (code) => (code === 0 ? resolve() : resolve())); // don't block on non-zero
      });
      pythonExe = cand;
      break;
    } catch {
      // try next
    }
  }
  if (!pythonExe) {
    throw new Error('No Python executable found on PATH (tried python3, python).');
  }

  // Use a per-run unique prefix in the system temp directory
  const prefix = `tl-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpHtml = path.join(os.tmpdir(), `${prefix}.html`);
  const tmpJson = path.join(os.tmpdir(), `${prefix}.json`);

  // Write HTML to temp file for the Python script
  await fs.writeFile(tmpHtml, html, 'utf-8');

  const scriptPath = path.join(__dirname, 'metro2_audit_multi.py');

  // Run Python with a timeout + capture stderr for debugging
  await new Promise((resolve, reject) => {
    const py = spawn(
      pythonExe,
      [scriptPath, '-i', tmpHtml, '-o', tmpJson],
      { stdio: ['ignore', 'ignore', 'pipe'] } // capture stderr only
    );

    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      py.kill('SIGKILL');
    }, timeoutMs);

    let stderr = '';
    py.stderr.on('data', (buf) => {
      stderr += buf.toString();
    });

    py.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    py.on('close', (code) => {
      clearTimeout(timer);
      if (killed) {
        reject(new Error(`metro2_audit_multi.py timed out after ${timeoutMs}ms`));
      } else if (code !== 0) {
        reject(new Error(`metro2_audit_multi.py exited with code ${code}${stderr ? `\nstderr:\n${stderr}` : ''}`));
      } else {
        resolve();
      }
    });
  });

  try {
    const raw = await fs.readFile(tmpJson, 'utf-8');
    return JSON.parse(raw);
  } finally {
    // Best-effort cleanup
    await Promise.allSettled([
      fs.unlink(tmpHtml),
      fs.unlink(tmpJson),
    ]);
  }
}
