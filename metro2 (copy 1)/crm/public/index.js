/* public/index.js */

import { PLAYBOOKS } from './playbooks.js';
import { authHeader, api, escapeHtml, formatCurrency } from './common.js';
import { clearClientLocationsCache } from './client-map.js';
import { setupPageTour } from './tour-guide.js';
import { hasStateLawAddendum, resolveStateInfo } from './state-utils.js';

const $ = (s) => document.querySelector(s);

setupPageTour('clients', {
  steps: [
    {
      id: 'clients-nav',
      title: 'Navigate the command center',
      text: `<p class="font-semibold">Keep revenue workspaces one tap away.</p>
             <p class="mt-1 text-xs text-slate-600">Bounce between Dashboard, Leads, Billing, and Marketing to monitor Lead→Consult% and upsell paths.</p>`,
      attachTo: { element: '#primaryNav', on: 'bottom' }
    },
    {
      id: 'clients-metrics',
      title: 'Snapshot KPIs',
      text: `<p class="font-semibold">Scan active clients, revenue collected, and pipeline gaps.</p>
             <p class="mt-1 text-xs text-slate-600">Use these numbers to anchor consults and forecast automation upgrades.</p>`,
      attachTo: { element: '#clientsMetrics', on: 'top' }
    },
    {
      id: 'clients-journey',
      title: 'Map the client journey',
      text: `<p class="font-semibold">Document every promise to keep fulfillment airtight.</p>
             <p class="mt-1 text-xs text-slate-600">Drop NEPQ notes and next steps so advisors, analysts, and attorneys stay aligned.</p>`,
      attachTo: { element: '#clientsJourneyTracker', on: 'top' }
    },
    {
      id: 'clients-sidebar',
      title: 'Control your roster',
      text: `<p class="font-semibold">Search, filter, and open any client in seconds.</p>
             <p class="mt-1 text-xs text-slate-600">Upload reports, tag statuses, and prep every review before a consult starts.</p>`,
      attachTo: { element: '#clientsSidebar', on: 'right' }
    },
    {
      id: 'clients-tradelines',
      title: 'Build dispute packs',
      text: `<p class="font-semibold">Select negative items and trigger premium letters.</p>
             <p class="mt-1 text-xs text-slate-600">Layer AI, OCR, and certified mail upsells before generating the batch.</p>`,
      attachTo: { element: '#clientsNegativePanel', on: 'top' }
    }
  ]
});

if (typeof window !== 'undefined') {
  window.__crm_hotkeyActions = window.__crm_hotkeyActions || {};
  if (typeof window.__crm_hotkeyActions.newClient !== 'function') {
    window.__crm_hotkeyActions.newClient = () => {
      const button = document.getElementById('btnCreateClient');
      if (!button) return false;
      button.click();
      return true;
    };
  }
}

const resolvePortalBaseUrl = () => {
  if (typeof window === 'undefined') return '';
  if (window.CLIENT_PORTAL_BASE_URL) return window.CLIENT_PORTAL_BASE_URL;
  const origin = window.location?.origin;
  if (origin) return `${origin.replace(/\/$/, '')}/portal`;
  return '';
};
const portalBaseUrl = resolvePortalBaseUrl();
const buildPortalUrl = (id) => id ? `${portalBaseUrl}/${id}` : portalBaseUrl;

const role = typeof window !== 'undefined' ? (window.userRole || 'host') : 'host';
if (typeof window !== 'undefined' && role === 'client') {
  window.location.href = buildPortalUrl(window.clientId || window.consumerId);
}
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('DOMContentLoaded', () => {
    if (role !== 'host') {
      ['btnInvite', 'btnNewConsumer', 'btnEditConsumer'].forEach(id => {

        document.getElementById(id)?.classList.add('hidden');
      });
    }
  });
}

let DB = [];
let currentConsumerId = null;
let currentReportId = null;
let CURRENT_REPORT = null;
let tlPageSize = 6;
let tlPage = 1;
let tlTotalPages = 1;
let CURRENT_COLLECTORS = [];
const collectorSelection = {};
let trackerData = {};
const PARSE_MODE_STORAGE_KEY = "reportParseMode";
const parseModeButton = document.getElementById("btnToggleParseMode");
const normalizeParseMode = (value) => (value === "legacy" ? "legacy" : "llm");
let reportParseMode = normalizeParseMode(localStorage.getItem(PARSE_MODE_STORAGE_KEY));

function updateParseModeButton() {
  if (!parseModeButton) return;
  const isLlm = reportParseMode === "llm";
  parseModeButton.textContent = isLlm ? "Parse: LLM" : "Parse: Legacy";
  parseModeButton.setAttribute("data-tip", isLlm ? "LLM parsing enabled" : "Legacy parsing enabled");
  parseModeButton.setAttribute("aria-pressed", String(isLlm));
}

if (parseModeButton) {
  updateParseModeButton();
  parseModeButton.addEventListener("click", () => {
    reportParseMode = reportParseMode === "llm" ? "legacy" : "llm";
    localStorage.setItem(PARSE_MODE_STORAGE_KEY, reportParseMode);
    updateParseModeButton();
  });
}

function buildIdempotencyKey(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function waitForJobCompletion(jobId, { timeoutMs = 120000, intervalMs = 1500 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const jobResp = await api(`/api/jobs/${encodeURIComponent(jobId)}`);
    const status = jobResp?.job?.status;
    if (status === 'completed') {
      return jobResp.job;
    }
    if (status === 'failed') {
      const message = jobResp.job?.error?.message || 'Background job failed.';
      throw new Error(message);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Background job timed out.');
}

function updateToplineMetrics() {
  const metric = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  const totalConsumers = DB.length;
  const activeConsumers = DB.filter(c => {
    const status = (c.status || '').toLowerCase();
    if (!status) return true;
    return ['active', 'in-progress', 'open', 'pending'].includes(status);
  }).length;

  const totals = DB.reduce((acc, consumer) => {
    const sale = Number(consumer.sale) || 0;
    const paid = Number(consumer.paid) || 0;
    const reports = Array.isArray(consumer.reports) ? consumer.reports.length : 0;
    acc.sale += sale;
    acc.paid += paid;
    acc.reports += reports;
    return acc;
  }, { sale: 0, paid: 0, reports: 0 });

  const pipeline = Math.max(0, totals.sale - totals.paid);
  const progress = totals.sale > 0 ? Math.round((totals.paid / totals.sale) * 100) : (totals.paid > 0 ? 100 : 0);
  const boundedProgress = Math.min(Math.max(progress, 0), 100);

  metric('metricActiveConsumers', String(activeConsumers));
  metric('metricTotalConsumers', String(totalConsumers));
  metric('metricReportsUploaded', String(totals.reports));
  metric('metricRevenue', formatCurrency(totals.paid));
  metric('metricPipeline', formatCurrency(pipeline));
  metric('metricProgress', `${boundedProgress}%`);

  const progressBar = document.getElementById('metricProgressBar');
  if (progressBar) {
    progressBar.style.setProperty('--progress', `${boundedProgress}%`);
  }
}

let trackerSteps = [];
let trackerSaveTimer = null;

let consumerFiles = [];

let metro2Violations = [];
function renderReasonOptions(filter=""){
  const sel = $("#tlReasonSelect");
  if(!sel) return;
  const f = filter.toLowerCase();
  const opts = metro2Violations.filter(r => r.toLowerCase().includes(f));
  sel.innerHTML = '<option value="">Select reason</option>' +
    opts.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
}
async function loadMetro2Violations(){
  try{
    const res = await fetch('metro2Violations.json');
    const data = await res.json();
    metro2Violations = Object.values(data).map(v=>v.violation);
  }catch(err){
    console.error('Failed to load Metro-2 violations', err);
  }
}


const ocrCb = $("#cbUseOcr");

let CUSTOM_TEMPLATES = [];
async function loadTemplates(){
  try{
    const res = await fetch('/api/templates', { cache: 'no-store' });
    const data = await res.json().catch(()=>({}));
    CUSTOM_TEMPLATES = data.templates || [];
    document.querySelectorAll('.tl-letter-select').forEach(sel=>populateLetterSelectOptions(sel));
  }catch{}
}
loadTemplates();



document.addEventListener('DOMContentLoaded', async () => {
  const sel = $("#tlReasonSelect");
  if(sel){
    await loadMetro2Violations();
    renderReasonOptions();

    sel.addEventListener('change', e => {
      const txt = $("#tlReasonText");
      if(txt) txt.value = e.target.value;
    });
    $("#tlReasonSearch")?.addEventListener('input', e => {
      renderReasonOptions(e.target.value);
    });

  }
});


function updatePortalLink(){
  const links = ["#clientPortalLink", "#activityPortalLink"].map(sel => $(sel));
  links.forEach(a => {
    if(!a) return;
    if(currentConsumerId){
      a.href = buildPortalUrl(currentConsumerId);
      a.classList.remove("hidden");
    } else {
      a.href = "#";
      a.classList.add("hidden");
    }
  });
  const inviteBtn = $("#btnPortalInvite");
  if(inviteBtn){
    if(currentConsumerId) inviteBtn.classList.remove("hidden");
    else inviteBtn.classList.add("hidden");
  }
  const auditBtn = $("#btnRunClientAudit");
  if(auditBtn){
    const c = currentConsumerId ? DB.find(x=>x.id===currentConsumerId) : null;
    if(c && Array.isArray(c.reports) && c.reports.length > 0) auditBtn.classList.remove("hidden");
    else auditBtn.classList.add("hidden");
  }
}

// ----- UI helpers -----
function showErr(msg){
  const e = $("#err");
  if (!e) { alert(msg); return; }
  e.textContent = msg || "Something went wrong.";
  e.classList.remove("hidden");
  console.error("[UI][ERR]", msg);
}
function clearErr(){
  const e = $("#err");
  if (e) { e.textContent = ""; e.classList.add("hidden"); }
}
function showWorkflowNotice(message){
  const el = $("#workflowNotice");
  if (!el) return;
  if (!message) {
    el.textContent = "";
    el.classList.add("hidden");
    return;
  }
  el.textContent = message;
  el.classList.remove("hidden");
}
function buildMinIntervalNotice(validation){
  const result = validation?.results?.find((rule) => rule.ruleId === "letters-min-interval" && !rule.ok);
  const blocked = result?.metadata?.blocked;
  if (!Array.isArray(blocked) || blocked.length === 0) return null;
  const messages = blocked.map((entry) => {
    const days = Number(entry.remainingDays ?? result?.metadata?.intervalDays ?? 0);
    const dayLabel = days === 1 ? "day" : "days";
    const bureau = entry.bureau || "bureau";
    return `You have ${days} ${dayLabel} until next round with ${bureau}.`;
  });
  return messages.join(" ");
}
let breachSaveTimer = null;
let pendingBreachSave = {};
function queueBreachSave(update){
  pendingBreachSave = { ...pendingBreachSave, ...update };
  if (breachSaveTimer) clearTimeout(breachSaveTimer);
  breachSaveTimer = setTimeout(async ()=>{
    if (!currentConsumerId) return;
    const payload = { ...pendingBreachSave };
    pendingBreachSave = {};
    breachSaveTimer = null;
    const res = await api(`/api/consumers/${currentConsumerId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if(!res?.ok) return showErr(res?.error || "Failed to save breach details.");
    const updated = DB.find(x=>x.id===currentConsumerId);
    if (updated) Object.assign(updated, payload);
  }, 500);
}
async function flushBreachSave(){
  if (!currentConsumerId) return;
  if (!breachSaveTimer) return;
  clearTimeout(breachSaveTimer);
  breachSaveTimer = null;
  const payload = { ...pendingBreachSave };
  pendingBreachSave = {};
  if (!Object.keys(payload).length) return;
  const res = await api(`/api/consumers/${currentConsumerId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if(!res?.ok) return showErr(res?.error || "Failed to save breach details.");
  const updated = DB.find(x=>x.id===currentConsumerId);
  if (updated) Object.assign(updated, payload);
}
function updateBreachStatus(consumer){
  const el = $("#breachStatus");
  if (!el) return;
  if (!consumer){
    el.textContent = "Breaches: —";
    el.disabled = true;
    return;
  }
  const count = Array.isArray(consumer.breaches) ? consumer.breaches.length : 0;
  el.textContent = `Breaches: ${count}`;
  el.disabled = false;
}
function renderBreachCard(consumer){
  const card = $("#breachSection");
  const body = $("#breachCardBody");
  const subtitle = $("#breachCardSubtitle");
  if(!card || !body) return;
  if(!consumer){
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  const breaches = Array.isArray(consumer.breaches) ? consumer.breaches : [];
  if(!breaches.length){
    subtitle.textContent = "No breaches found yet. Click 'Check Breaches' to scan.";
    body.innerHTML = `<div style="padding:14px; border:1px dashed rgba(212,168,83,0.2); border-radius:10px; background:rgba(212,168,83,0.03);">
      <div style="text-align:center; margin-bottom:10px;">
        <div style="font-size:24px; margin-bottom:6px;">🔒</div>
        <div style="color:#ccc; font-weight:600;">No breach records on file</div>
      </div>
      <div style="font-size:11px; color:#888; line-height:1.5; border-top:1px solid rgba(212,168,83,0.1); padding-top:10px; margin-top:6px;">
        <strong style="color:#d4a853;">What is a data breach check?</strong><br/>
        A data breach occurs when personal information (names, SSNs, account numbers) is exposed in a security incident. If your client's data was compromised, it may affect the accuracy of their credit file — giving you strong grounds to dispute inaccurate items under the FCRA.
      </div>
      <div style="font-size:11px; color:#888; line-height:1.5; margin-top:8px;">
        <strong style="color:#d4a853;">How to use in disputes:</strong><br/>
        Click "Check Breaches" to scan. If breaches are found, you can reference them in dispute letters to challenge data accuracy, request method of verification, and argue that compromised data cannot be reliably used to verify reported information.
      </div>
    </div>`;
    return;
  }
  subtitle.textContent = `${breaches.length} breach${breaches.length!==1?'es':''} detected`;
  subtitle.style.color = "#ef4444";
  let html = '';
  breaches.forEach((name, i) => {
    html += `<div style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.15); border-radius:10px;">
      <div style="width:32px; height:32px; border-radius:8px; background:rgba(239,68,68,0.12); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
        <span style="color:#ef4444; font-size:14px;">⚠</span>
      </div>
      <div style="flex:1; min-width:0;">
        <div style="font-weight:600; color:#fff; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(name)}</div>
        <div style="font-size:11px; color:#888;">Data breach exposure detected</div>
      </div>
    </div>`;
  });
  const selected = Array.isArray(consumer.breachSelections) ? consumer.breachSelections : [];
  if(selected.length > 0){
    html += `<div style="margin-top:8px; padding:8px 12px; background:rgba(212,168,83,0.06); border:1px solid rgba(212,168,83,0.15); border-radius:8px; font-size:12px; color:#d4a853;">
      ${selected.length} breach${selected.length!==1?'es':''} selected for dispute letters
    </div>`;
  }
  html += `<div style="margin-top:10px; padding:10px 12px; background:rgba(212,168,83,0.04); border:1px solid rgba(212,168,83,0.12); border-radius:8px; font-size:11px; color:#999; line-height:1.5;">
    <strong style="color:#d4a853;">Dispute Strategy:</strong> These breaches indicate your client's personal data was compromised. Use this in dispute letters to:
    <span style="color:#bbb;">challenge data accuracy, demand method of verification under FCRA Section 611, and argue that breached data cannot reliably verify reported information.</span>
    Generate a Breach Audit report for full details and documentation.
  </div>`;
  body.innerHTML = html;
}

function renderBreachSelectionList(consumer, list){
  const wrap = $("#breachSelectionList");
  if (!wrap) return;
  wrap.innerHTML = "";
  const email = consumer?.email || "";
  if (!list.length){
    wrap.innerHTML = `<div class="muted">No breaches found for ${escapeHtml(email)}.</div>`;
    return;
  }
  const saved = Array.isArray(consumer?.breachSelections) && consumer.breachSelections.length
    ? consumer.breachSelections
    : list;
  const selectedSet = new Set(saved);
  list.forEach((breach)=>{
    const label = document.createElement("label");
    label.className = "flex items-start gap-2";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "breach-select";
    input.value = breach;
    input.checked = selectedSet.has(breach);
    const span = document.createElement("span");
    span.textContent = breach || "Unknown breach";
    label.appendChild(input);
    label.appendChild(span);
    wrap.appendChild(label);
  });
}
function getBreachSelectionsFromUI(){
  return Array.from(document.querySelectorAll("#breachSelectionList input.breach-select"))
    .filter(cb => cb.checked)
    .map(cb => cb.value);
}
function renderBreachEvidenceFiles(consumer){
  const wrap = $("#breachEvidenceFiles");
  if (!wrap) return;
  const files = Array.isArray(consumer?.breachEvidenceFiles) ? consumer.breachEvidenceFiles : [];
  if (!files.length){
    wrap.innerHTML = `<div class="muted text-xs">No evidence files uploaded yet.</div>`;
    return;
  }
  wrap.innerHTML = files.map(file=>{
    const name = escapeHtml(file.name || file.originalName || "Evidence file");
    const url = escapeHtml(file.url || "#");
    const date = file.uploadedAt ? ` • ${new Date(file.uploadedAt).toLocaleString()}` : "";
    return `<div class="flex items-center justify-between text-xs">
      <div class="wrap-anywhere">${name}${date}</div>
      <a class="text-accent underline" href="${url}" target="_blank">Open</a>
    </div>`;
  }).join("");
}
function openBreachModal(consumer){
  const list = Array.isArray(consumer?.breaches) ? consumer.breaches : [];
  const summary = $("#breachSummary");
  const email = consumer?.email || "";
  if (summary){
    summary.innerHTML = list.length
      ? `<p>${escapeHtml(email)} found in ${list.length} breach${list.length===1?"":"es"}.</p>`
      : `<p>No breaches found for ${escapeHtml(email)}.</p>`;
  }
  renderBreachSelectionList(consumer, list);
  const notes = $("#breachEvidenceNotes");
  if (notes) notes.value = consumer?.breachEvidenceNotes || "";
  renderBreachEvidenceFiles(consumer);
  const modal = $("#breachModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}
function formatEvent(ev){
  const when = new Date(ev.at).toLocaleString();
  let title = escapeHtml(ev.type);
  let body = "";
  if(ev.type === "letters_generated"){
    const { count, requestType, tradelines, inquiries = 0, collectors = 0 } = ev.payload || {};
    title = "Letters generated";
    const inqPart = inquiries ? ` and ${escapeHtml(inquiries)} inquiry${inquiries===1?"":"s"}` : "";
    const colPart = collectors ? ` and ${escapeHtml(collectors)} collector${collectors===1?"":"s"}` : "";
    body = `<div class="text-xs mt-1">Generated ${escapeHtml(count)} letter${count===1?"":"s"} (${escapeHtml(requestType||"")}) for ${escapeHtml(tradelines)} negative item${tradelines===1?"":"s"}${inqPart}${colPart}.</div>`;

  } else if(ev.type === "audit_generated"){
    const { reportId, file } = ev.payload || {};
    title = "Audit generated";
    const link = file ? `<a href="${escapeHtml(file)}" target="_blank" class="text-accent underline">open</a>` : "";
    body = `<div class="text-xs mt-1">Report ${escapeHtml(reportId||"")} ${link}</div>`;
  } else if(ev.type === "breach_audit_generated"){
    const { file } = ev.payload || {};
    title = "Data breach audit generated";
    const link = file ? `<a href="${escapeHtml(file)}" target="_blank" class="text-accent underline">open</a>` : "";
    body = `<div class="text-xs mt-1">${link}</div>`;
  } else if(ev.type === "breach_lookup"){
    const { count, email } = ev.payload || {};
    title = "Data breach lookup";
    const total = Number.isFinite(Number(count)) ? Number(count) : 0;
    const label = total === 1 ? "breach" : "breaches";
    const emailPart = email ? ` for ${escapeHtml(email)}` : "";
    body = `<div class="text-xs mt-1">${escapeHtml(total)} ${label} found${emailPart}.</div>`;
  } else if(ev.type === "contract_signed"){
    const { contractName, signedBy, contractId, signedAt } = ev.payload || {};
    title = "Contract signed";
    const signerPart = signedBy ? ` by ${escapeHtml(signedBy)}` : "";
    const namePart = contractName ? `"${escapeHtml(contractName)}"` : "Contract";
    const printLink = contractId && currentConsumerId
      ? `<a href="/api/consumers/${encodeURIComponent(currentConsumerId)}/contracts/${encodeURIComponent(contractId)}/print" target="_blank" class="text-accent underline ml-2">View</a>`
      : "";
    body = `<div class="text-xs mt-1">${namePart} signed${signerPart}.${printLink}</div>`;
  } else if(ev.type === "letters_portal_sent"){
    const { file } = ev.payload || {};
    title = "Letters sent to portal";
    const link = file ? `<a href="${escapeHtml(file)}" target="_blank" class="text-accent underline">open</a>` : "";
    body = `<div class="text-xs mt-1">${link}</div>`;

  } else if(ev.type === "consumer_created"){
    const { name } = ev.payload || {};
    title = "Consumer created";
    if(name){
      body = `<div class="text-xs mt-1">${escapeHtml(name)}</div>`;
    }
  } else if(ev.type === "consumer_updated"){
    const { fields = [] } = ev.payload || {};
    title = "Consumer updated";
    if(fields.length){
      body = `<div class="text-xs mt-1">Updated ${escapeHtml(fields.join(", "))}</div>`;
    }
  } else if(ev.type === "consumer_deleted"){
    title = "Consumer deleted";
  } else if(ev.type === "report_uploaded"){
    const { filename, size } = ev.payload || {};
    title = "Report uploaded";
    const sizeKb = typeof size === "number" ? ` ${(size/1024).toFixed(1)} KB` : "";
    if(filename){
      body = `<div class="text-xs mt-1">${escapeHtml(filename)}${sizeKb}</div>`;
    }
  } else if(ev.type === "letter_reminder"){
    const { step, playbook, tradelineIndex, due } = ev.payload || {};
    title = "Letter reminder";
    let desc = step ? `Send "${escapeHtml(step)}"` : "Send next letter";
    if (playbook) desc += ` from ${escapeHtml(playbook)}`;
    if (tradelineIndex !== undefined) desc += ` for TL #${escapeHtml(tradelineIndex)}`;
    if (due) desc += ` (due ${new Date(due).toLocaleDateString()})`;
    body = `<div class="text-xs mt-1">${desc}</div>`;
  } else if(ev.payload){
    body = `<pre class="text-xs mt-1 overflow-auto">${escapeHtml(JSON.stringify(ev.payload, null, 2))}</pre>`;
  }
  return `
    <div class="glass card p-2">
      <div class="flex items-center justify-between">
        <div class="font-medium">${title}</div>
        <div class="text-xs muted">${when}</div>
      </div>
      ${body}
    </div>
  `;
}
function formatBreachHistoryEntry(ev){
  const when = new Date(ev.at).toLocaleString();
  if (ev.type === "breach_lookup"){
    const total = Number.isFinite(Number(ev.payload?.count)) ? Number(ev.payload.count) : 0;
    const label = total === 1 ? "breach" : "breaches";
    const emailPart = ev.payload?.email ? ` for ${escapeHtml(ev.payload.email)}` : "";
    return `
      <div class="glass card p-2">
        <div class="flex items-center justify-between">
          <div class="font-medium">Lookup completed</div>
          <div class="text-xs muted">${when}</div>
        </div>
        <div class="text-xs mt-1">${escapeHtml(total)} ${label} found${emailPart}.</div>
      </div>
    `;
  }
  if (ev.type === "breach_audit_generated"){
    const count = Number.isFinite(Number(ev.payload?.count)) ? Number(ev.payload.count) : 0;
    const selected = Number.isFinite(Number(ev.payload?.selected)) ? Number(ev.payload.selected) : 0;
    const link = ev.payload?.file ? `<a href="${escapeHtml(ev.payload.file)}" target="_blank" class="text-accent underline">Open audit PDF</a>` : "";
    const selectionNote = count || selected ? `Selected ${escapeHtml(selected)} of ${escapeHtml(count)} breaches.` : "";
    return `
      <div class="glass card p-2">
        <div class="flex items-center justify-between">
          <div class="font-medium">Audit generated</div>
          <div class="text-xs muted">${when}</div>
        </div>
        <div class="text-xs mt-1 flex flex-col gap-1">
          ${selectionNote ? `<span>${selectionNote}</span>` : ""}
          ${link ? `<span>${link}</span>` : ""}
        </div>
      </div>
    `;
  }
  return formatEvent(ev);
}

// ===================== Consumers (search + pagination) =====================
const PAGE_SIZE = 10;
let consQuery = "";
let consPage = 1;

function filteredConsumers(){
  const q = consQuery.trim().toLowerCase();
  if (!q) return DB.slice();
  return DB.filter(c=>{
    return [c.name,c.email,c.phone,c.addr1,c.city,c.state,c.zip].some(v=> (v||"").toLowerCase().includes(q));
  });
}
function totalPages(){ return Math.max(1, Math.ceil(filteredConsumers().length / PAGE_SIZE)); }
function currentPageItems(){
  const items = filteredConsumers();
  const tp = totalPages();
  if (consPage > tp) consPage = tp;
  const start = (consPage-1)*PAGE_SIZE;
  return items.slice(start, start+PAGE_SIZE);
}

async function loadConsumers(restore = true, invalidateGeo = false, _attempt = 1){
  clearErr();
  const loadingEl = document.getElementById('consumerLoadingState');
  if (loadingEl) loadingEl.style.display = 'block';
  const data = await api("/api/consumers");
  if (loadingEl) loadingEl.style.display = 'none';
  if (data.status === 401 || data.status === 403 || data.error === 'Forbidden') {
    localStorage.removeItem('token');
    localStorage.removeItem('auth');
    location.href = '/login.html';
    return;
  }
  if (data.ok === false || !Array.isArray(data.consumers)) {
    if (_attempt < 3) {
      await new Promise(r => setTimeout(r, 1000 * _attempt));
      return loadConsumers(restore, invalidateGeo, _attempt + 1);
    }
    const errMsg = data.error || 'Could not load clients. Please refresh the page.';
    showErr(errMsg);
    const listEl = document.getElementById('consumerList');
    if (listEl) {
      listEl.innerHTML = `<div style="text-align:center;padding:1.5rem 1rem;font-size:0.78rem;line-height:1.6;">
        <div style="color:#f87171;margin-bottom:0.3rem;">Failed to load clients</div>
        <div style="color:rgba(255,255,255,0.3);">${errMsg}</div>
        <div style="margin-top:0.8rem;"><a href="javascript:location.reload()" style="color:#d4a853;text-decoration:underline;font-size:0.75rem;">Tap to refresh</a></div>
      </div>`;
    }
    return;
  }
  DB = data.consumers;
  if(invalidateGeo){
    clearClientLocationsCache();
  }
  updateToplineMetrics();
  renderConsumers();
  if (restore) restoreSelectedConsumer();
}
function renderConsumers(){
  const wrap = $("#consumerList");
  wrap.innerHTML = "";

  if (DB.length === 0) {
    let _diagUser = '';
    try {
      const _t = localStorage.getItem('token');
      if (_t) { const _p = JSON.parse(atob(_t.split('.')[1])); _diagUser = _p.username || ''; }
    } catch(e) {}
    wrap.innerHTML = `<div style="text-align:center;padding:2rem 1rem;color:rgba(255,255,255,0.35);font-size:0.8rem;line-height:1.6;">
      <div style="margin-bottom:0.4rem;">No clients found.</div>
      ${_diagUser ? `<div style="color:rgba(255,255,255,0.22);font-size:0.72rem;">Logged in as <span style="color:rgba(212,168,83,0.7);font-weight:600;">@${escapeHtml(_diagUser)}</span> — if this looks wrong, sign out and log back in.</div>` : ''}
    </div>`;
    return;
  }

  const tpl = $("#consumerItem").content;

  currentPageItems().forEach(c=>{
    const n = tpl.cloneNode(true);
    n.querySelector(".name").textContent = c.name || "(no name)";
    n.querySelector(".email").textContent = c.email || "";
    const badgeSlot = n.querySelector(".state-law-badge");
    if (badgeSlot && c.state && hasStateLawAddendum(c.state)) {
      const info = resolveStateInfo(c.state);
      const label = info.name || info.code;
      badgeSlot.innerHTML = `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:9999px;font-size:10px;font-weight:600;background:rgba(212,168,83,0.12);color:#d4a853;border:1px solid rgba(212,168,83,0.3);" title="${escapeHtml(label)} consumer-protection law addendum included in generated letters">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        ${escapeHtml(info.code)} Law
      </span>`;
    }
    const card = n.querySelector(".consumer-card");
    if (c.id === currentConsumerId) {
      card.classList.add("active");
      card.setAttribute("aria-current", "true");
    } else {
      card.classList.remove("active");
      card.removeAttribute("aria-current");
    }
    card.addEventListener("click", ()=> selectConsumer(c.id));
    n.querySelector(".delete").addEventListener("click", async (e)=>{
      e.stopPropagation();
      if(!confirm(`Delete ${c.name}?`)) return;
      const res = await api(`/api/consumers/${c.id}`, { method:"DELETE" });
      if(!res?.ok) return showErr(res?.error || "Failed to delete consumer.");
      if(currentConsumerId === c.id){
        currentConsumerId = null;
        currentReportId = null;
        CURRENT_REPORT = null;
        $("#reportPicker").innerHTML = "";
        $("#tlList").innerHTML = "";
        $("#selConsumer").textContent = "—";
        $("#activityList").innerHTML = "";
        updateBreachStatus(null);
        updatePortalLink();
        setSelectedConsumerId(null);

      }
      loadConsumers(true, true);
    });
    wrap.appendChild(n);
  });
  $("#consPage").textContent = String(consPage);
  $("#consPages").textContent = String(totalPages());
}
$("#consumerSearch").addEventListener("input", (e)=>{
  consQuery = e.target.value || "";
  consPage = 1;
  renderConsumers();
});
$("#consPrev").addEventListener("click", ()=>{
  if (consPage>1){ consPage--; renderConsumers(); }
});
$("#consNext").addEventListener("click", ()=>{
  if (consPage<totalPages()){ consPage++; renderConsumers(); }
});

$("#tlPrev").addEventListener("click", ()=>{
  if (tlPage>1){ tlPage--; renderTradelines(CURRENT_REPORT?.tradelines || []); }
});
$("#tlNext").addEventListener("click", ()=>{
  if (tlPage<tlTotalPages){ tlPage++; renderTradelines(CURRENT_REPORT?.tradelines || []); }
});
$("#tlPageSize").addEventListener("change", (e)=>{
  const val = e.target.value;
  tlPageSize = val === "all" ? Infinity : parseInt(val, 10) || 6;
  tlPage = 1;
  renderTradelines(CURRENT_REPORT?.tradelines || []);
});
$("#creditorSearch").addEventListener("input", (e)=>{
  creditorSearchText = e.target.value.trim();
  tlPage = 1;
  renderTradelines(CURRENT_REPORT?.tradelines || []);
});

document.querySelectorAll(".ni-dropdown-trigger").forEach(btn => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const dd = btn.closest(".ni-dropdown");
    const wasOpen = dd.classList.contains("open");
    document.querySelectorAll(".ni-dropdown.open").forEach(d => d.classList.remove("open"));
    if (!wasOpen) dd.classList.add("open");
  });
});
document.addEventListener("click", () => {
  document.querySelectorAll(".ni-dropdown.open").forEach(d => d.classList.remove("open"));
});
document.querySelectorAll(".ni-dropdown-menu").forEach(menu => {
  menu.addEventListener("click", (e) => e.stopPropagation());
});
document.querySelectorAll(".ni-dropdown-action").forEach(btn => {
  btn.addEventListener("click", () => {
    btn.closest(".ni-dropdown")?.classList.remove("open");
  });
});

$("#btnSelectAll").addEventListener("click", ()=>{
  const cards = Array.from(document.querySelectorAll(".tl-card"));
  if (!cards.length) return;
  const allSelected = cards.every(c => c.classList.contains("selected"));
  cards.forEach(c => {
    setCardSelected(c, !allSelected);
    if (!allSelected) autoSelectBestViolation(c);
  });
  updateSelectAllButton();
});

$("#btnSelectNegative")?.addEventListener("click", ()=>{
  const cards = Array.from(document.querySelectorAll(".tl-card.negative"));
  if (!cards.length) return;
  const allSelected = cards.every(c => c.classList.contains("selected"));
  cards.forEach(c => {
    setCardSelected(c, !allSelected);
    if (!allSelected) autoSelectBestViolation(c);
  });
  updateSelectAllButton();
});

async function selectConsumer(id){
  currentConsumerId = id;
  const c = DB.find(x=>x.id===id);
  $("#selConsumer").textContent = c ? c.name : "—";
  updateBreachStatus(c);
  renderBreachCard(c);
  setSelectedConsumerId(id);
  renderConsumers();

  const negPanel = $("#clientsNegativePanel");
  if(negPanel){
    if(id) negPanel.classList.remove("hidden");
    else negPanel.classList.add("hidden");
  }

  updatePortalLink();
  await refreshReports();
  await Promise.all([
    loadConsumerState(),
    loadMessages(),
    loadTracker(),
    loadDisputeTracker(),
    loadClientContracts(),
  ]);
}

function restoreSelectedConsumer(){
  const stored = getSelectedConsumerId();
  if(stored && DB.find(c=>c.id===stored)){
    selectConsumer(stored);
  }
}

// ===================== Reports =====================
async function refreshReports(){
  clearErr();
  if(!currentConsumerId){ $("#reportPicker").innerHTML = ""; return; }
  const data = await api(`/api/consumers/${currentConsumerId}/reports`);
  if(!data?.ok) return showErr(data?.error || "Could not load reports.");

  const sel = $("#reportPicker");
  sel.innerHTML = "";
  (data.reports || []).forEach(r=>{
    const opt = document.createElement("option");
    opt.value = r.id;
    const negCount = r.summary?.negative_items ?? r.summary?.tradelines ?? 0;
    const label = negCount === 1 ? 'Negative Item' : 'Negative Items';
    opt.textContent = `${r.filename} (${negCount} ${label}) • ${new Date(r.uploadedAt).toLocaleString()}`;
    sel.appendChild(opt);
  });

  if (data.reports?.length) {
    currentReportId = data.reports[0].id;
    sel.value = currentReportId;
    await loadReportJSON();
  } else {
    currentReportId = null;
    CURRENT_REPORT = null;
    $("#tlList").innerHTML = `<div class="muted">No reports uploaded yet.</div>`;
  }
}
$("#reportPicker").addEventListener("change", async (e)=>{
  currentReportId = e.target.value || null;
  await loadReportJSON();
});

async function loadTracker(){
  clearErr();
  const url = currentConsumerId ? `/api/consumers/${currentConsumerId}/tracker` : '/api/tracker/steps';
  const data = await api(url);
  if(!data || !data.steps){ showErr('Could not load tracker.'); return; }
  trackerSteps = data.steps || [];
  if(currentConsumerId){
    trackerData[currentConsumerId] = data.completed || {};
  }
  renderTrackerSteps();
}
async function saveTracker(){
  if(!currentConsumerId) return;
  const completed = trackerData[currentConsumerId] || {};
  try{
    const resp = await fetch(`/api/consumers/${currentConsumerId}/tracker`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ completed })
    });
    const d = await resp.json().catch(()=>({}));
    if(!d?.ok) throw new Error(d?.error || 'Failed to sync tracker');
  }catch(e){
    showErr(e.message || 'Failed to sync tracker');
  }
}

function toggleTracker(){
  if(!currentConsumerId) return;
  if(trackerSaveTimer){
    clearTimeout(trackerSaveTimer);
  }
  trackerSaveTimer = setTimeout(()=>{
    trackerSaveTimer = null;
    saveTracker();
  }, 300);
}
async function syncTrackerSteps(){
  try{
    const resp = await fetch('/api/tracker/steps', {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ steps: trackerSteps })
    });
    const d = await resp.json().catch(()=>({}));
    if(!d?.ok) throw new Error(d?.error || 'Failed to save steps');
  }catch(e){
    showErr(e.message || 'Failed to save steps');
  }

}
function renderTrackerSteps(){
  const wrap = document.querySelector("#trackerSteps");
  if(!wrap) return;
  wrap.innerHTML = "";
  const existingProgEarly = document.querySelector("#trackerProgressWrap");
  if(existingProgEarly) existingProgEarly.remove();
  if(trackerSteps.length === 0){
    wrap.innerHTML = '<div style="color:rgba(255,255,255,0.35);font-size:0.85rem;padding:8px 0;">No steps yet — click + to add one.</div>';
    return;
  }

  const completed = currentConsumerId ? (trackerData[currentConsumerId] || {}) : {};
  const completedCount = trackerSteps.filter(s => completed[s]).length;
  const pct = Math.round((completedCount / trackerSteps.length) * 100);
  const progressHtml = `<div class="tracker-progress-label">${completedCount} of ${trackerSteps.length} completed</div><div class="tracker-progress-bar"><div class="tracker-progress-fill" style="width:${pct}%"></div></div>`;
  wrap.insertAdjacentHTML("beforebegin", "");
  const progWrap = document.createElement("div");
  progWrap.id = "trackerProgressWrap";
  progWrap.innerHTML = progressHtml;
  const existingProg = document.querySelector("#trackerProgressWrap");
  if(existingProg) existingProg.remove();
  wrap.parentNode.insertBefore(progWrap, wrap);

  let foundCurrent = false;
  trackerSteps.forEach((step, i) => {
    const isCompleted = !!completed[step];
    const isCurrent = !isCompleted && !foundCurrent;
    if(isCurrent) foundCurrent = true;

    const div = document.createElement("div");
    div.className = "tracker-step" + (isCompleted ? " completed" : "") + (isCurrent ? " current" : "");
    div.dataset.index = i;

    const checkSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

    div.innerHTML =
      '<div class="tracker-step-rail">' +
        '<div class="tracker-step-circle" data-step="' + escapeHtml(step) + '">' +
          (isCompleted ? checkSvg : (i + 1)) +
        '</div>' +
        '<div class="tracker-step-line"></div>' +
      '</div>' +
      '<div class="tracker-step-content">' +
        '<span class="tracker-step-name" data-index="' + i + '" title="Double-click to edit">' + escapeHtml(step) + '</span>' +
        '<button class="tracker-step-remove" data-index="' + i + '" aria-label="Remove step">&times;</button>' +
      '</div>';
    wrap.appendChild(div);
  });

  wrap.querySelectorAll(".tracker-step-circle").forEach(circle => {
    circle.addEventListener("click", () => {
      const stepName = circle.dataset.step;
      if(!stepName || !currentConsumerId) return;
      const cur = completed[stepName];
      completed[stepName] = !cur;
      trackerData[currentConsumerId] = completed;
      renderTrackerSteps();
      toggleTracker();
    });
  });

  wrap.querySelectorAll(".tracker-step-name").forEach(span => {
    span.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = parseInt(span.dataset.index);
      const oldName = trackerSteps[idx];
      const inp = document.createElement("input");
      inp.type = "text";
      inp.value = oldName;
      inp.style.cssText = "width:100%;font-size:inherit;background:#1a1a1e;color:#fff;border:1px solid rgba(212,168,83,0.3);border-radius:6px;padding:3px 8px;outline:none;";
      span.replaceWith(inp);
      inp.focus();
      inp.select();
      let saved = false;
      const finish = () => {
        if(saved) return;
        saved = true;
        const newName = (inp.value || "").trim();
        if(newName && newName !== oldName){
          Object.values(trackerData).forEach(obj => {
            if(obj[oldName] !== undefined){
              obj[newName] = obj[oldName];
              delete obj[oldName];
            }
          });
          trackerSteps[idx] = newName;
          syncTrackerSteps();
          if(currentConsumerId) saveTracker();
        }
        renderTrackerSteps();
        loadTracker();
      };
      inp.addEventListener("keydown", ev => {
        if(ev.key === "Enter"){ ev.preventDefault(); finish(); }
        if(ev.key === "Escape"){ saved = true; renderTrackerSteps(); loadTracker(); }
      });
      inp.addEventListener("blur", finish);
    });
  });

  wrap.querySelectorAll(".tracker-step-remove").forEach(btn => {
    btn.addEventListener("click", async e => {
      const idx = parseInt(e.target.dataset.index);
      const removed = trackerSteps.splice(idx, 1)[0];
      Object.values(trackerData).forEach(obj => { delete obj[removed]; });
      syncTrackerSteps();
      renderTrackerSteps();
      loadTracker();
    });
  });
}
  const addStepBtn = document.querySelector("#addStep");
  if(addStepBtn){
    addStepBtn.addEventListener("click", ()=>{
      // If an input already exists, ignore
      if(document.querySelector("#newStepName")) return;
      const wrap = document.querySelector("#stepControls");
      const inp = document.createElement("input");
      inp.id = "newStepName";
      inp.placeholder = "New step name";
      inp.className = "border rounded px-2 py-1 flex-1";
      wrap.insertBefore(inp, addStepBtn);
      inp.focus();
      const finish = async ()=>{
        let name = (inp.value || "").trim();
        if(!name) name = `Step ${trackerSteps.length + 1}`;
        trackerSteps.push(name);
        syncTrackerSteps();

        inp.remove();
        await api("/api/tracker/steps", {
          method: "POST",
          headers: { "Content-Type":"application/json", ...authHeader() },
          body: JSON.stringify({ steps: trackerSteps })
        });
        renderTrackerSteps();
        loadTracker();
      };
      inp.addEventListener("keydown", e=>{
        if(e.key === "Enter"){ e.preventDefault(); finish(); }
        if(e.key === "Escape"){ inp.remove(); }
      });
    });
  }
 

async function loadReportJSON(){
  clearErr();
  if(!currentConsumerId || !currentReportId) return;
  const data = await api(`/api/consumers/${currentConsumerId}/report/${currentReportId}`);
  if(!data?.ok) return showErr(data?.error || "Failed to load report JSON.");
  CURRENT_REPORT = data.report;
  CURRENT_REPORT.tradelines = dedupeTradelines(CURRENT_REPORT.tradelines || []);
  tlPage = 1;
  hiddenTradelines.clear();
  Object.keys(selectionState).forEach(k=> delete selectionState[k]);
  activeFilters.clear();
  activeStatusFilters.clear();
  activeBureaus.clear();
  creditorSearchText = "";
  const creditorSearchEl = $("#creditorSearch");
  if (creditorSearchEl) creditorSearchEl.value = "";
  renderFilterBar();
  renderTradelines(CURRENT_REPORT.tradelines);
  renderCollectors(CURRENT_REPORT.creditor_contacts || []);
  loadReportDiff();
}

async function loadReportDiff() {
  const panel = document.getElementById("reportDiffPanel");
  if (!panel) return;
  panel.classList.add("hidden");
  if (!currentConsumerId || !currentReportId) return;
  try {
    const data = await api(`/api/consumers/${currentConsumerId}/report/${currentReportId}/diff`);
    if (!data?.ok || !data.diff) return;
    renderReportDiff(data.diff);
  } catch (e) {
    console.warn("Failed to load report diff:", e);
  }
}

function renderReportDiff(diff) {
  const panel = document.getElementById("reportDiffPanel");
  if (!panel || !diff) return;

  const { deleted = [], added = [], changed = [], summary = {} } = diff;
  const { deletedCount = 0, addedCount = 0, changedCount = 0 } = summary;

  if (deletedCount === 0 && addedCount === 0 && changedCount === 0) return;

  panel.classList.remove("hidden");

  const subtitleEl = document.getElementById("diffSummaryText");
  if (subtitleEl) {
    const parts = [];
    if (deletedCount > 0) parts.push(`${deletedCount} deletion${deletedCount !== 1 ? "s" : ""}`);
    if (addedCount > 0) parts.push(`${addedCount} new item${addedCount !== 1 ? "s" : ""}`);
    if (changedCount > 0) parts.push(`${changedCount} change${changedCount !== 1 ? "s" : ""}`);
    subtitleEl.textContent = parts.join(" · ");
  }

  const banner = document.getElementById("diffBanner");
  if (banner) {
    banner.innerHTML = "";
    if (deletedCount > 0) banner.insertAdjacentHTML("beforeend",
      `<span style="background:#064e3b;color:#4ade80;padding:4px 12px;border-radius:6px;font-weight:600;">✓ ${Number(deletedCount) || 0} Deleted</span>`);
    if (addedCount > 0) banner.insertAdjacentHTML("beforeend",
      `<span style="background:#7f1d1d;color:#f87171;padding:4px 12px;border-radius:6px;font-weight:600;">+ ${Number(addedCount) || 0} New</span>`);
    if (changedCount > 0) banner.insertAdjacentHTML("beforeend",
      `<span style="background:#78350f;color:#fbbf24;padding:4px 12px;border-radius:6px;font-weight:600;">⟳ ${Number(changedCount) || 0} Changed</span>`);
  }

  const deletedSection = document.getElementById("diffDeleted");
  const deletedList = document.getElementById("diffDeletedList");
  if (deletedSection && deletedList) {
    if (deletedCount > 0) {
      deletedSection.classList.remove("hidden");
      deletedList.innerHTML = deleted.map(d => `
        <div class="glass" style="padding:8px 12px;border-radius:8px;border-left:3px solid #4ade80;">
          <div style="font-weight:600;">${esc(d.creditor)}</div>
          <div style="color:var(--muted);font-size:.8rem;">
            Removed from: ${(d.removedFromBureaus || d.bureaus || []).map(b => esc(b)).join(", ")}
            ${Object.values(d.accountNumbers || {}).filter(Boolean).length ? ` · Acct: ${esc(Object.values(d.accountNumbers)[0])}` : ""}
          </div>
        </div>`).join("");
    } else {
      deletedSection.classList.add("hidden");
    }
  }

  const addedSection = document.getElementById("diffAdded");
  const addedListEl = document.getElementById("diffAddedList");
  if (addedSection && addedListEl) {
    if (addedCount > 0) {
      addedSection.classList.remove("hidden");
      addedListEl.innerHTML = added.map(a => `
        <div class="glass" style="padding:8px 12px;border-radius:8px;border-left:3px solid #f87171;">
          <div style="font-weight:600;">${esc(a.creditor)}</div>
          <div style="color:var(--muted);font-size:.8rem;">
            Bureaus: ${(a.addedOnBureaus || a.bureaus || []).map(b => esc(b)).join(", ")}
            · ${Number(a.violationCount) || 0} violation${(Number(a.violationCount) || 0) !== 1 ? "s" : ""}
          </div>
        </div>`).join("");
    } else {
      addedSection.classList.add("hidden");
    }
  }

  const changedSection = document.getElementById("diffChanged");
  const changedListEl = document.getElementById("diffChangedList");
  if (changedSection && changedListEl) {
    if (changedCount > 0) {
      changedSection.classList.remove("hidden");
      changedListEl.innerHTML = changed.map(c => {
        const fieldRows = (c.fieldChanges || []).slice(0, 5).map(fc =>
          `<div style="display:flex;gap:8px;font-size:.75rem;color:var(--muted);">
            <span style="min-width:80px;">${esc(fc.bureau)}</span>
            <span style="min-width:100px;">${esc(fc.field)}</span>
            <span style="color:#f87171;">${esc(fc.oldValue)}</span>
            <span>→</span>
            <span style="color:#4ade80;">${esc(fc.newValue)}</span>
          </div>`
        ).join("");
        const extra = (c.fieldChanges || []).length > 5
          ? `<div style="font-size:.75rem;color:var(--muted);">+ ${c.fieldChanges.length - 5} more changes</div>` : "";
        const bureauInfo = [];
        if (c.bureausRemoved?.length) bureauInfo.push(`Removed from: ${c.bureausRemoved.map(b => esc(b)).join(", ")}`);
        if (c.bureausAdded?.length) bureauInfo.push(`Added to: ${c.bureausAdded.map(b => esc(b)).join(", ")}`);
        return `
          <div class="glass" style="padding:8px 12px;border-radius:8px;border-left:3px solid #fbbf24;">
            <div style="font-weight:600;">${esc(c.creditor)}</div>
            ${bureauInfo.length ? `<div style="color:var(--muted);font-size:.8rem;">${bureauInfo.join(" · ")}</div>` : ""}
            ${fieldRows ? `<div style="margin-top:4px;">${fieldRows}${extra}</div>` : ""}
          </div>`;
      }).join("");
    } else {
      changedSection.classList.add("hidden");
    }
  }

  const toggle = document.getElementById("diffPanelToggle");
  const body = document.getElementById("diffPanelBody");
  const chevron = document.getElementById("diffChevron");
  if (toggle && body && chevron) {
    toggle.onclick = () => {
      const isHidden = body.style.display === "none";
      body.style.display = isHidden ? "" : "none";
      chevron.style.transform = isHidden ? "" : "rotate(-90deg)";
    };
  }

  const dc = document.getElementById("diffDeletedCount");
  if (dc) dc.textContent = deletedCount > 0 ? `(${deletedCount})` : "";
  const ac = document.getElementById("diffAddedCount");
  if (ac) ac.textContent = addedCount > 0 ? `(${addedCount})` : "";
  const cc = document.getElementById("diffChangedCount");
  if (cc) cc.textContent = changedCount > 0 ? `(${changedCount})` : "";

  panel.querySelectorAll(".diff-section-header").forEach(header => {
    const targetId = header.dataset.target;
    const list = document.getElementById(targetId);
    const chev = header.querySelector(".diff-chevron");
    if (list) list.style.display = "";
    if (chev) chev.textContent = "▼";
  });

  panel.querySelectorAll(".diff-section-header").forEach(header => {
    header.onclick = () => {
      const targetId = header.dataset.target;
      const list = document.getElementById(targetId);
      const chev = header.querySelector(".diff-chevron");
      if (!list) return;
      const isHidden = list.style.display === "none";
      list.style.display = isHidden ? "" : "none";
      if (chev) chev.textContent = isHidden ? "▼" : "▶";
    };
  });
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ===================== Filters =====================
const ALL_TAGS = ["Collections","Late Payments","Charge-Off","Student Loans","Medical Bills","Other"];
const STATUS_TAGS = ["Open","Closed"];
const BUREAU_OPTIONS = ["TransUnion","Experian","Equifax"];
const activeFilters = new Set();       // category filters (Collections, Late Payments, etc.)
const activeStatusFilters = new Set(); // status filters (Open, Closed)
const activeBureaus = new Set();
let creditorSearchText = "";
const hiddenTradelines = new Set();
const selectionState = {};

function hasWord(s, w){ return (s||"").toLowerCase().includes(w.toLowerCase()); }
function maybeNum(x){ return typeof x === "number" ? x : null; }
function isPlainObject(value){
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isBlankValue(value){
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function mergeArraysUnique(a = [], b = []){
  const merged = [];
  const seen = new Set();
  [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].forEach(item => {
    if (item === undefined || item === null) return;
    const key = typeof item === 'object' && item !== null
      ? JSON.stringify(item)
      : `primitive:${typeof item === 'string' ? item.trim() : item}`;
    if (!seen.has(key)){
      seen.add(key);
      merged.push(item);
    }
  });
  return merged;
}

function mergePlainObject(existing = {}, incoming = {}){
  const merged = { ...existing };
  Object.keys(incoming || {}).forEach(key => {
    const incomingVal = incoming[key];
    if (incomingVal === undefined || incomingVal === null) return;
    const existingVal = merged[key];
    if (existingVal === undefined){
      if (Array.isArray(incomingVal)){
        merged[key] = [...incomingVal];
      } else if (isPlainObject(incomingVal)){
        merged[key] = mergePlainObject({}, incomingVal);
      } else {
        merged[key] = incomingVal;
      }
      return;
    }
    if (isPlainObject(existingVal) && isPlainObject(incomingVal)){
      merged[key] = mergePlainObject(existingVal, incomingVal);
      return;
    }
    if (Array.isArray(existingVal) && Array.isArray(incomingVal)){
      merged[key] = mergeArraysUnique(existingVal, incomingVal);
      return;
    }
    if (typeof existingVal === 'string' && typeof incomingVal === 'string'){
      const trimmedExisting = existingVal.trim();
      const trimmedIncoming = incomingVal.trim();
      if (!trimmedExisting && trimmedIncoming){
        merged[key] = incomingVal;
      } else if (trimmedIncoming.length > trimmedExisting.length){
        merged[key] = incomingVal;
      }
      return;
    }
    if (isBlankValue(existingVal) && !isBlankValue(incomingVal)){
      merged[key] = incomingVal;
    }
  });
  return merged;
}

function normalizeAccountNumberValues(val){
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)){
    return val
      .map(v => typeof v === 'string' ? v.trim() : v)
      .filter(v => !(typeof v === 'string' && v.length === 0));
  }
  if (isPlainObject(val)){
    return Object.values(val)
      .map(v => typeof v === 'string' ? v.trim() : v)
      .filter(v => !(typeof v === 'string' && v.length === 0));
  }
  if (typeof val === 'string'){
    const trimmed = val.trim();
    return trimmed ? [trimmed] : [];
  }
  return [val];
}

function mergeAccountNumbers(existingValue, incomingValue){
  const hasExisting = existingValue !== undefined && existingValue !== null;
  const hasIncoming = incomingValue !== undefined && incomingValue !== null;
  if (!hasExisting && !hasIncoming) return undefined;

  if (isPlainObject(existingValue) || isPlainObject(incomingValue)){
    const merged = {
      ...(isPlainObject(existingValue) ? existingValue : {}),
      ...(isPlainObject(incomingValue) ? incomingValue : {})
    };
    const seen = new Set(
      Object.values(merged)
        .map(v => typeof v === 'string' ? v.trim().toUpperCase() : v)
        .filter(Boolean)
    );
    [...normalizeAccountNumberValues(existingValue), ...normalizeAccountNumberValues(incomingValue)].forEach(val => {
      const keyVal = typeof val === 'string' ? val.trim().toUpperCase() : val;
      if (!keyVal || seen.has(keyVal)) return;
      let idx = 1;
      let candidate = `additional_${idx}`;
      while (Object.prototype.hasOwnProperty.call(merged, candidate)){
        idx += 1;
        candidate = `additional_${idx}`;
      }
      merged[candidate] = typeof val === 'string' ? val.trim() : val;
      seen.add(keyVal);
    });
    return merged;
  }

  if (Array.isArray(existingValue) || Array.isArray(incomingValue)){
    const combined = [
      ...(Array.isArray(existingValue) ? existingValue : hasExisting ? [existingValue] : []),
      ...(Array.isArray(incomingValue) ? incomingValue : hasIncoming ? [incomingValue] : [])
    ];
    const seen = new Set();
    const result = [];
    combined.forEach(val => {
      if (val === undefined || val === null) return;
      const trimmed = typeof val === 'string' ? val.trim() : val;
      if (typeof trimmed === 'string' && trimmed.length === 0) return;
      const keyVal = typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed;
      if (seen.has(keyVal)) return;
      seen.add(keyVal);
      result.push(trimmed);
    });
    return result;
  }

  const values = [...normalizeAccountNumberValues(existingValue), ...normalizeAccountNumberValues(incomingValue)];
  const seen = new Set();
  const unique = [];
  values.forEach(val => {
    if (val === undefined || val === null) return;
    const trimmed = typeof val === 'string' ? val.trim() : val;
    if (typeof trimmed === 'string' && trimmed.length === 0) return;
    const keyVal = typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed;
    if (seen.has(keyVal)) return;
    seen.add(keyVal);
    unique.push(trimmed);
  });
  if (!unique.length) return undefined;
  return unique.length === 1 ? unique[0] : unique;
}

function mergeMeta(existingMeta = {}, incomingMeta = {}){
  const merged = mergePlainObject(existingMeta || {}, incomingMeta || {});
  if ((existingMeta && existingMeta.account_numbers !== undefined) || (incomingMeta && incomingMeta.account_numbers !== undefined)){
    const accountNumbers = mergeAccountNumbers(existingMeta?.account_numbers, incomingMeta?.account_numbers);
    if (accountNumbers !== undefined){
      merged.account_numbers = accountNumbers;
    } else {
      delete merged.account_numbers;
    }
  }
  return merged;
}

function mergeViolations(existingViolations, incomingViolations){
  const existingList = Array.isArray(existingViolations) ? existingViolations : [];
  const incomingList = Array.isArray(incomingViolations) ? incomingViolations : [];
  return mergeArraysUnique(existingList, incomingList);
}

function mergeTradeline(existing, incoming){
  if (!existing) return incoming;
  if (!incoming) return existing;
  const merged = { ...existing };

  merged.per_bureau = mergePlainObject(existing.per_bureau || {}, incoming.per_bureau || {});
  merged.violations = mergeViolations(existing.violations, incoming.violations);
  merged.meta = mergeMeta(existing.meta || {}, incoming.meta || {});

  const keys = new Set([...(Object.keys(incoming || {})), ...(Object.keys(existing || {}))]);
  keys.forEach(key => {
    if (key === 'per_bureau' || key === 'violations' || key === 'meta') return;
    const incomingVal = incoming[key];
    if (incomingVal === undefined || incomingVal === null) return;
    const existingVal = existing[key];
    if (existingVal === undefined){
      if (Array.isArray(incomingVal)){
        merged[key] = [...incomingVal];
      } else if (isPlainObject(incomingVal)){
        merged[key] = mergePlainObject({}, incomingVal);
      } else {
        merged[key] = incomingVal;
      }
      return;
    }
    if (isPlainObject(existingVal) && isPlainObject(incomingVal)){
      merged[key] = mergePlainObject(existingVal, incomingVal);
      return;
    }
    if (Array.isArray(existingVal) && Array.isArray(incomingVal)){
      merged[key] = mergeArraysUnique(existingVal, incomingVal);
      return;
    }
    if (typeof existingVal === 'string' && typeof incomingVal === 'string'){
      const trimmedExisting = existingVal.trim();
      const trimmedIncoming = incomingVal.trim();
      if (!trimmedExisting && trimmedIncoming){
        merged[key] = incomingVal;
      } else if (trimmedIncoming.length > trimmedExisting.length){
        merged[key] = incomingVal;
      }
      return;
    }
    if (isBlankValue(existingVal) && !isBlankValue(incomingVal)){
      merged[key] = incomingVal;
    }
  });

  return merged;
}

function extractAcctNumbers(tl) {
  const per = tl.per_bureau || {};
  const bureauNumbers = [
    per.TransUnion?.account_number,
    per.Experian?.account_number,
    per.Equifax?.account_number
  ].filter(n => n !== undefined && n !== null);
  const metaNumbersRaw = tl.meta?.account_numbers;
  const metaNumbers = Array.isArray(metaNumbersRaw)
    ? metaNumbersRaw
    : metaNumbersRaw && typeof metaNumbersRaw === 'object'
      ? Object.values(metaNumbersRaw)
      : metaNumbersRaw
        ? [metaNumbersRaw]
        : [];
  const normalizeAcct = s => {
    let v = String(s).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const m = v.match(/^[A-Z]+0{4,}(\d+)$/);
    if (m) return m[1];
    return v;
  };
  return [...new Set(
    [...bureauNumbers, ...metaNumbers].map(normalizeAcct).filter(n => n.length > 0)
  )];
}

function acctNumbersOverlap(numsA, numsB) {
  if (!numsA.length || !numsB.length) return false;
  for (const a of numsA) {
    for (const b of numsB) {
      if (a === b) return true;
      if (a.length >= 4 && b.length >= 4) {
        if (a.includes(b) || b.includes(a)) return true;
      }
    }
  }
  return false;
}

export function dedupeTradelines(lines){
  const seen = new Map();
  const result = [];
  const resultNumbers = [];
  (lines || []).forEach(tl => {
    const name = (tl.meta?.creditor || "").trim();
    if (!name) return;
    const per = tl.per_bureau || {};
    const hasData = ["TransUnion","Experian","Equifax"].some(b => Object.keys(per[b] || {}).length);
    const hasViolations = (tl.violations || []).length > 0;
    if (!hasData && !hasViolations) return;
    const uniqueNumbers = extractAcctNumbers(tl);

    if (!uniqueNumbers.length) {
      result.push(tl);
      resultNumbers.push([]);
      return;
    }

    const key = `${name}|${uniqueNumbers.sort().join('|')}`;
    if (seen.has(key)) {
      const idx = seen.get(key);
      result[idx] = mergeTradeline(result[idx], tl);
      uniqueNumbers.forEach(n => { if (!resultNumbers[idx].includes(n)) resultNumbers[idx].push(n); });
    } else {
      seen.set(key, result.length);
      result.push(tl);
      resultNumbers.push([...uniqueNumbers]);
    }
  });

  const creditorIndices = new Map();
  result.forEach((tl, idx) => {
    if (!tl) return;
    const cred = (tl.meta?.creditor || '').trim().toLowerCase();
    if (!cred || !resultNumbers[idx].length) return;
    if (!creditorIndices.has(cred)) creditorIndices.set(cred, []);
    creditorIndices.get(cred).push(idx);
  });

  for (const [, indices] of creditorIndices) {
    if (indices.length < 2) continue;
    const parent = indices.map((_, i) => i);
    const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const union = (a, b) => { parent[find(b)] = find(a); };
    const allNums = indices.map(idx => resultNumbers[idx]);
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const ri = find(i);
        const combined = [...new Set([...allNums[i], ...allNums.filter((_, k) => find(k) === ri).flat()])];
        if (acctNumbersOverlap(combined, allNums[j])) {
          union(i, j);
        }
      }
    }
    const groups = new Map();
    for (let i = 0; i < indices.length; i++) {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(indices[i]);
    }
    for (const [, members] of groups) {
      if (members.length < 2) continue;
      const keep = members[0];
      for (let m = 1; m < members.length; m++) {
        result[keep] = mergeTradeline(result[keep], result[members[m]]);
        resultNumbers[members[m]].forEach(n => { if (!resultNumbers[keep].includes(n)) resultNumbers[keep].push(n); });
        result[members[m]] = null;
      }
    }
  }

  return result.filter(Boolean);
}


export function normalizeViolations(vs){
  return (vs || []).map((v, idx) => {
    const rawTitle = v?.title ?? "";
    const fallbackTitle = rawTitle || v?.violation || "";
    const cleanedTitle = fallbackTitle.replace(/\s*\((TransUnion|Experian|Equifax)\)/g, "").trim();
    const title = cleanedTitle || fallbackTitle;

    const baseDetail = v?.detail ?? (rawTitle ? "" : (v?.violation || ""));
    const cleanedDetail = baseDetail.replace(/\s*\((TransUnion|Experian|Equifax)\)/g, "").trim();
    const detail = cleanedDetail || baseDetail;

    const bureauCandidates = [
      ...(Array.isArray(v?.bureaus) ? v.bureaus : []),
      v?.bureau,
      v?.evidence?.bureau
    ].filter(Boolean);
    const bureaus = Array.from(new Set(bureauCandidates));

    return {
      ...v,
      title,
      detail,
      bureaus,
      idx: v?.idx ?? idx
    };
  }).sort((a, b) => {
    const severityDelta = (b.severity ?? 0) - (a.severity ?? 0);
    if (severityDelta !== 0) return severityDelta;
    return (a.code || "").localeCompare(b.code || "");
  });
}

function deriveTags(tl){
  const tags = new Set();
  const name = (tl.meta?.creditor || "");
  const per = tl.per_bureau || {};
  const bureaus = ["TransUnion","Experian","Equifax"];

  if (bureaus.some(b => hasWord(per[b]?.payment_status, "collection") || hasWord(per[b]?.account_status, "collection"))
      || hasWord(name, "collection")) tags.add("Collections");


  if (bureaus.some(b => hasWord(per[b]?.payment_status, "late") || hasWord(per[b]?.payment_status, "delinquent"))
      || bureaus.some(b => (maybeNum(per[b]?.past_due) || 0) > 0)) tags.add("Late Payments");

  if (bureaus.some(b => hasWord(per[b]?.payment_status, "charge") && hasWord(per[b]?.payment_status, "off"))) tags.add("Charge-Off");

  const student = ["navient","nelnet","mohela","sallie","aidvantage","department of education","dept of education","edfinancial","fedloan","great lakes","student"];
  if (student.some(k => hasWord(name, k))
      || bureaus.some(b => hasWord(per[b]?.account_type_detail, "student"))) tags.add("Student Loans");

  const medical = ["medical","hospital","clinic","physician","health","radiology","anesthesia","ambulance"];
  if (medical.some(k => hasWord(name, k))) tags.add("Medical Bills");

  if (tags.size === 0) tags.add("Other");

  // Derived status tags
  const isClosed = bureaus.some(b =>
    hasWord(per[b]?.account_status, "closed") ||
    hasWord(per[b]?.payment_status, "closed")
  );
  if (isClosed) tags.add("Closed"); else tags.add("Open");

  return Array.from(tags).map(t => t.trim());
}

function _computeTagCounts(tradelines){
  const counts = {};
  [...ALL_TAGS, ...STATUS_TAGS].forEach(t => { counts[t] = 0; });
  (tradelines || []).forEach(tl => {
    const pb = tl.per_bureau || {};
    const hasBureauData = BUREAU_OPTIONS.some(b => Object.keys(pb[b] || {}).length);
    const hasAcct = Object.values(pb).some(b => b?.account_number);
    const hasVios = (tl.violations || []).length > 0;
    if (!hasBureauData && !hasAcct && !hasVios) return;
    deriveTags(tl).forEach(t => {
      if (t in counts) counts[t]++;
    });
  });
  return counts;
}

function renderFilterBar(){
  const bar = $("#filterBar");
  bar.innerHTML = "";
  const tradelines = CURRENT_REPORT?.tradelines || [];
  const counts = _computeTagCounts(tradelines);

  // ---- Section: Bureau toggle pills ----
  const bureauSection = document.createElement("div");
  bureauSection.className = "filter-section";
  const bureauLabel = document.createElement("div");
  bureauLabel.className = "filter-section-label";
  bureauLabel.textContent = "Bureau";
  bureauSection.appendChild(bureauLabel);
  const bureauRow = document.createElement("div");
  bureauRow.className = "bureau-pill-row";
  BUREAU_OPTIONS.forEach(bureau => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "bureau-pill" + (activeBureaus.has(bureau) ? " active" : "");
    pill.textContent = bureau;
    pill.addEventListener("click", () => {
      if (activeBureaus.has(bureau)) activeBureaus.delete(bureau); else activeBureaus.add(bureau);
      tlPage = 1;
      renderTradelines(CURRENT_REPORT?.tradelines || []);
      updateFilterTrigger();
      pill.classList.toggle("active", activeBureaus.has(bureau));
    });
    bureauRow.appendChild(pill);
  });
  bureauSection.appendChild(bureauRow);
  bar.appendChild(bureauSection);

  // ---- Divider ----
  const div1 = document.createElement("div");
  div1.className = "filter-section-divider";
  bar.appendChild(div1);

  // ---- Section: Category checkboxes ----
  const catLabel = document.createElement("div");
  catLabel.className = "filter-section-label";
  catLabel.style.padding = "2px 12px 0";
  catLabel.textContent = "Category";
  bar.appendChild(catLabel);
  ALL_TAGS.forEach(tag => {
    const count = counts[tag] || 0;
    const label = document.createElement("label");
    label.className = "ni-dropdown-item" + (count === 0 ? " filter-tag-zero" : "");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = activeFilters.has(tag);
    cb.disabled = count === 0;
    cb.style.cssText = "accent-color:#d4a853;width:14px;height:14px;cursor:pointer;";
    cb.addEventListener("change", () => {
      if (cb.checked) activeFilters.add(tag); else activeFilters.delete(tag);
      tlPage = 1;
      renderTradelines(CURRENT_REPORT?.tradelines || []);
      updateFilterTrigger();
    });
    const span = document.createElement("span");
    span.style.flex = "1";
    span.textContent = tag;
    const badge = document.createElement("span");
    badge.className = "filter-count-badge";
    badge.textContent = `(${count})`;
    label.appendChild(cb);
    label.appendChild(span);
    label.appendChild(badge);
    bar.appendChild(label);
  });

  // ---- Divider ----
  const div2 = document.createElement("div");
  div2.className = "filter-section-divider";
  bar.appendChild(div2);

  // ---- Section: Status checkboxes ----
  const statusLabel = document.createElement("div");
  statusLabel.className = "filter-section-label";
  statusLabel.style.padding = "2px 12px 0";
  statusLabel.textContent = "Status";
  bar.appendChild(statusLabel);
  STATUS_TAGS.forEach(tag => {
    const count = counts[tag] || 0;
    const label = document.createElement("label");
    label.className = "ni-dropdown-item" + (count === 0 ? " filter-tag-zero" : "");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = activeStatusFilters.has(tag);
    cb.disabled = count === 0;
    cb.style.cssText = "accent-color:#d4a853;width:14px;height:14px;cursor:pointer;";
    cb.addEventListener("change", () => {
      if (cb.checked) activeStatusFilters.add(tag); else activeStatusFilters.delete(tag);
      tlPage = 1;
      renderTradelines(CURRENT_REPORT?.tradelines || []);
      updateFilterTrigger();
    });
    const span = document.createElement("span");
    span.style.flex = "1";
    span.textContent = tag;
    const badge = document.createElement("span");
    badge.className = "filter-count-badge";
    badge.textContent = `(${count})`;
    label.appendChild(cb);
    label.appendChild(span);
    label.appendChild(badge);
    bar.appendChild(label);
  });

  $("#btnClearFilters").onclick = () => {
    activeFilters.clear();
    activeStatusFilters.clear();
    activeBureaus.clear();
    creditorSearchText = "";
    const searchEl = $("#creditorSearch");
    if (searchEl) searchEl.value = "";
    tlPage = 1;
    renderFilterBar();
    renderTradelines(CURRENT_REPORT?.tradelines || []);
    updateFilterTrigger();
  };
  updateFilterTrigger();
}

function updateFilterTrigger(){
  const totalActive = activeFilters.size + activeStatusFilters.size + activeBureaus.size;
  const triggers = document.querySelectorAll(".ni-dropdown-trigger");
  triggers.forEach(t => {
    if (t.textContent.startsWith("Filters")) {
      if (totalActive > 0) {
        t.textContent = `Filters (${totalActive}) ▾`;
        t.classList.add("filter-active");
      } else {
        t.textContent = "Filters ▾";
        t.classList.remove("filter-active");
      }
    }
  });
}

function passesFilter(tags, tl){
  // Category filter — tradeline must match at least one selected category
  if (activeFilters.size > 0 && !tags.some(t => activeFilters.has(t))) return false;
  // Status filter — tradeline must match at least one selected status (AND with category)
  if (activeStatusFilters.size > 0 && !tags.some(t => activeStatusFilters.has(t))) return false;
  // Bureau filter (AND logic — tradeline must be reported by ALL selected bureaus)
  if (activeBureaus.size > 0){
    const per = tl?.per_bureau || {};
    const reportedBureaus = BUREAU_OPTIONS.filter(b => Object.keys(per[b] || {}).length > 0);
    if (!Array.from(activeBureaus).every(b => reportedBureaus.includes(b))) return false;
  }
  // Creditor search filter
  if (creditorSearchText){
    const name = (tl?.meta?.creditor || "").toLowerCase();
    if (!name.includes(creditorSearchText.toLowerCase())) return false;
  }
  return true;
}

// ===================== Tradelines + Zoom =====================
function updateSelectAllButton(){
  const btnAll = $("#btnSelectAll");
  const btnNeg = $("#btnSelectNegative");
  const cards = Array.from(document.querySelectorAll(".tl-card"));
  if (btnAll){
    const allSelected = cards.length > 0 && cards.every(c => c.classList.contains("selected"));
    btnAll.textContent = allSelected ? "Deselect All" : "Select All";
  }
  if (btnNeg){
    const negatives = cards.filter(c => c.classList.contains("negative"));
    const allNegSelected = negatives.length > 0 && negatives.every(c => c.classList.contains("selected"));
    btnNeg.textContent = allNegSelected ? "Deselect Negative Items" : "Select Negative Items";
  }
}

function setCardSelected(card, on){
  card.classList.toggle("selected", !!on);
  card.querySelectorAll('input.bureau').forEach(cb => { cb.checked = !!on; });
  updateSelectionStateFromCard(card);
}

function populateLetterSelectOptions(sel, saved){
  if(!sel) return;
  const prev = saved || sel.value;
  sel.innerHTML = '';
  [
    { value:'correct', label:'Correct' },
    { value:'delete', label:'Delete' }
  ].forEach(o=>{
    const opt = document.createElement('option');
    opt.value = o.value; opt.textContent = o.label; sel.appendChild(opt);
  });
  CUSTOM_TEMPLATES.forEach(t=>{
    const opt = document.createElement('option');
    opt.value = `tpl:${t.id}`;
    opt.textContent = t.heading || '(no heading)';
    sel.appendChild(opt);
  });
  if(prev) sel.value = prev;
}

function updateSelectionStateFromCard(card){
  const idx = Number(card.dataset.index);
  const bureaus = Array.from(card.querySelectorAll('.bureau:checked')).map(cb=>cb.value);
  if (!bureaus.length) { delete selectionState[idx]; updateSelectAllButton(); return; }

  // Preserve previously selected violations that may not be rendered
  const existing = selectionState[idx]?.violationIdxs || [];
  const visible = Array.from(card.querySelectorAll('.violation'));
  const visibleVals = visible.map(cb => Number(cb.value));
  const visibleChecked = visible.filter(cb => cb.checked).map(cb => Number(cb.value));
  const preserved = existing.filter(v => !visibleVals.includes(v));
  const violationIdxs = preserved.concat(visibleChecked);
  const specialMode = getSpecialModeForCard(card);
  const playbook = card.querySelector('.tl-playbook-select')?.value || null;
  const letterType = card.querySelector('.tl-letter-select')?.value || 'correct';
  selectionState[idx] = { bureaus, violationIdxs, specialMode, playbook, letterType };
  updateSelectAllButton();
}

export function resolveBestViolationIdx(violations = []){
  if (!Array.isArray(violations) || !violations.length) return null;
  let best = null;
  let bestSeverity = -Infinity;
  violations.forEach(v => {
    if (!v) return;
    const severity = Number.isFinite(v.severity) ? v.severity : Number(v.severity) || 0;
    if (severity > bestSeverity){
      bestSeverity = severity;
      best = v;
    }
  });
  if (!best) return null;
  if (best.idx !== undefined && best.idx !== null) return best.idx;
  if (best.originalIndex !== undefined && best.originalIndex !== null) return best.originalIndex;
  return violations.indexOf(best);
}

function autoSelectBestViolation(card){
  const idx = Number(card.dataset.index);
  const tl = CURRENT_REPORT?.tradelines?.[idx];
  if (!tl) return;
  const vs = normalizeViolations(tl.violations || []);
  if (!vs.length) return;
  const targetIdx = resolveBestViolationIdx(vs);
  if (targetIdx === null || targetIdx === undefined) return;
  const targetNum = Number(targetIdx);
  const hasNumericTarget = Number.isFinite(targetNum);
  const targetStr = String(targetIdx);
  card.querySelectorAll('.violation').forEach(cb => {
    const raw = cb.value;
    const numVal = Number(raw);
    const isNumericValue = !Number.isNaN(numVal);
    const matches = hasNumericTarget && isNumericValue
      ? numVal === targetNum
      : String(raw) === targetStr;
    cb.checked = matches;
  });
  updateSelectionStateFromCard(card);
}

function renderTradelines(tradelines){
  const container = $("#tlList");
  container.innerHTML = "";
  const tpl = $("#tlTemplate").content;

  const visible = [];
  tradelines.forEach((tl, idx)=>{
    if (hiddenTradelines.has(idx)) return;

    // Skip tradelines with no meaningful bureau data or account numbers.
    // Some parsed reports include placeholder entries with empty `per_bureau`
    // sections and no account numbers, which resulted in blank cards that only
    // displayed generic violations like "Missing Date of Last Payment".
    // Filtering these out up front keeps the visible list focused on usable
    // tradelines.
    const pb = tl.per_bureau || {};
    const hasBureauData = ["TransUnion","Experian","Equifax"]
      .some(b => Object.keys(pb[b] || {}).length);
    const hasAcct = Object.values(pb).some(b => b?.account_number);
    const hasVios = (tl.violations || []).length > 0;
    if (!hasBureauData && !hasAcct && !hasVios) return;


    const tags = deriveTags(tl);
    if (!passesFilter(tags, tl)) return;
    visible.push({ tl, idx, tags });
  });

  const pageSize = tlPageSize === Infinity ? (visible.length || 1) : tlPageSize;
  tlTotalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  if (tlPage > tlTotalPages) tlPage = tlTotalPages;
  const start = (tlPage - 1) * pageSize;
  const pageItems = visible.slice(start, start + pageSize);

  pageItems.forEach(({ tl, idx, tags }) => {
    const node = tpl.cloneNode(true);
    const card = node.querySelector(".tl-card");
    card.dataset.index = idx;

    const negativeTags = ["Collections","Late Payments","Charge-Off"];
    if (tags.some(t=>negativeTags.includes(t))) card.classList.add("negative");

    node.querySelector(".tl-creditor").textContent = tl.meta?.creditor || "Unknown Creditor";
    node.querySelector(".tl-idx").textContent = idx;

    node.querySelector(".tl-tu-acct").textContent  = tl.per_bureau?.TransUnion?.account_number || "";
    node.querySelector(".tl-exp-acct").textContent = tl.per_bureau?.Experian?.account_number || "";
    node.querySelector(".tl-eqf-acct").textContent = tl.per_bureau?.Equifax?.account_number || "";
    node.querySelector(".tl-manual-reason").textContent = tl.meta?.manual_reason || "";

    const letterSel = node.querySelector('.tl-letter-select');
    populateLetterSelectOptions(letterSel, selectionState[idx]?.letterType);
    letterSel?.addEventListener('change', ()=> updateSelectionStateFromCard(card));

    const tagWrap = node.querySelector(".tl-tags");
    tagWrap.innerHTML = "";
    tags.forEach(t=>{
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = t;
      tagWrap.appendChild(chip);
    });

    const vWrap = node.querySelector(".tl-violations");
    const prevBtn = node.querySelector(".tl-reason-prev");
    const nextBtn = node.querySelector(".tl-reason-next");
    const vs = normalizeViolations(tl.violations || []);
    const maxSeverity = vs.reduce((m, v) => Math.max(m, v.severity || 0), 0);
    if (maxSeverity) card.classList.add(`severity-${maxSeverity}`);
    const pageSize = vs.length > 5 ? 3 : vs.length;
    let vStart = 0;
    let countEl = node.querySelector('.tl-violations-count');
    if(!countEl){
      countEl = document.createElement('div');
      countEl.className = 'tl-violations-count';
      countEl.setAttribute('aria-live','polite');
      countEl.setAttribute('aria-atomic','true');
      vWrap.parentNode.insertBefore(countEl, vWrap);
    }
    function renderViolations(){
      if(!vs.length){
        vWrap.innerHTML = `<div class="text-sm muted">No auto-detected validations for this negative item.</div>`;
        countEl.textContent = '0 violations';
        prevBtn.classList.add("hidden");
        nextBtn.classList.add("hidden");
        return;
      }
      const end = Math.min(vStart + pageSize, vs.length);
      vWrap.innerHTML = vs.slice(vStart, end).map(v => `
        <label class="violation-item flex items-start gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer severity-${v.severity || 1}">
          <input type="checkbox" class="violation" value="${v.idx}"/>
          <div>
            <div class="font-medium text-sm wrap-anywhere">${escapeHtml(v.category || "")} – ${escapeHtml(v.title || v.violation || "")}${v.severity ? `<span class="severity-tag severity-${v.severity}">S${v.severity}</span>` : ""}</div>
            ${v.bureaus && v.bureaus.length ? `<div class="text-xs mt-1">${v.bureaus.map(b=>'<span class="badge badge-bureau">'+escapeHtml(b)+'</span>').join(' ')}</div>` : ""}
            ${v.detail ? `<div class="text-sm text-gray-600 wrap-anywhere">${escapeHtml(v.detail)}</div>` : ""}
            ${v.debug ? `<pre class="debug">${escapeHtml(v.debug)}</pre>` : ""}
          </div>
        </label>`).join("");

      // Restore previously checked violations and hook change events
      const saved = selectionState[idx]?.violationIdxs || [];
      vWrap.querySelectorAll('.violation').forEach(cb => {
        const val = Number(cb.value);
        if (saved.includes(val)) cb.checked = true;
        cb.addEventListener('change', () => updateSelectionStateFromCard(card));
      });
      const isListView = $("#tlList")?.classList.contains("list-view");
      const verboseText = `Showing ${vStart + 1}-${end} of ${vs.length} violation${vs.length===1?"":"s"}`;
      countEl.dataset.violationCount = vs.length;
      countEl.dataset.verboseText = verboseText;
      countEl.textContent = isListView
        ? `${vs.length} violation${vs.length===1?"":"s"}`
        : verboseText;
      if(vs.length > pageSize){
        prevBtn.classList.remove('hidden');
        nextBtn.classList.remove('hidden');
        prevBtn.disabled = vStart <= 0;
        nextBtn.disabled = end >= vs.length;
      } else {
        prevBtn.classList.add('hidden');
        nextBtn.classList.add('hidden');
      }
    }
    renderViolations();
    countEl.addEventListener("click", (e) => {
      e.stopPropagation();
      const grid = $("#tlList");
      if (grid && grid.classList.contains("list-view")) {
        card.classList.toggle("lv-violations-open");
      }
    });
    prevBtn.addEventListener("click", ()=>{ if(vStart>0){ vStart -= pageSize; renderViolations(); }});
    nextBtn.addEventListener("click", ()=>{ if(vStart + pageSize < vs.length){ vStart += pageSize; renderViolations(); }});

    node.querySelector(".tl-remove").addEventListener("click",(e)=>{
      e.stopPropagation();
      hiddenTradelines.add(idx);
      delete selectionState[idx];
      renderTradelines(tradelines);
    });

    node.querySelector(".tl-edit").addEventListener("click", (e) => {
      e.stopPropagation();
      openTlEdit(idx);
    });

    const nameEl = node.querySelector(".tl-creditor");
    if (nameEl) {
      nameEl.classList.add("cursor-pointer");
      nameEl.addEventListener("click", (e) => {
        e.stopPropagation();
        openZoomModal(tl, idx);
      });
    }

    // restore saved selections
    const saved = selectionState[idx];
    if (saved) {
      saved.bureaus?.forEach(b => {
        const cb = node.querySelector(`.bureau[value="${b}"]`);
        if (cb) cb.checked = true;
      });
      if (saved.playbook){
        const sel = node.querySelector('.tl-playbook-select');
        if (sel) sel.value = saved.playbook;
      }
      const ls = node.querySelector('.tl-letter-select');
      if (ls && saved.letterType) ls.value = saved.letterType;
      if (saved.bureaus?.length) card.classList.add("selected");
      if (saved.specialMode){
        const info = MODES.find(m => m.key === saved.specialMode);
        if (info) card.classList.add(info.cardClass);
      }
      updateCardBadges(card);
    }

    card.querySelectorAll('input.bureau').forEach(cb=>{
      cb.addEventListener("change", ()=>{
        const any = Array.from(card.querySelectorAll('input.bureau')).some(x=>x.checked);
        card.classList.toggle("selected", any);
        updateSelectionStateFromCard(card);
      });
    });
    container.appendChild(node);
  });

  if (!container.children.length){
    container.innerHTML = `<div class="muted">No negative items match the current filters.</div>`;
  }

  updateSelectAllButton();

  $("#tlPage").textContent = String(tlPage);
  $("#tlPages").textContent = String(tlTotalPages);

  // Let special-modes hook new cards
  window.__crm_helpers?.attachCardHandlers?.(container);
}

function renderCollectors(collectors){
  const wrap = $("#collectorList");
  if(!wrap) return;
  wrap.innerHTML = "";
  CURRENT_COLLECTORS = collectors || [];
  Object.keys(collectorSelection).forEach(k=> delete collectorSelection[k]);
    const tpl = $("#collectorTemplate")?.content;
    CURRENT_COLLECTORS.forEach((col, idx)=>{
      const node = tpl.cloneNode(true);
      node.querySelector(".collector-name").textContent = col.name || "Unknown";
      node.querySelector(".collector-address").textContent = col.address || "";
      node.querySelector(".collector-phone").textContent = col.phone || "";
      const cb = node.querySelector(".collector-pick");
      cb.checked = col.type === "debt_collector";
      collectorSelection[idx] = cb.checked;
      cb.addEventListener("change", ()=>{ collectorSelection[idx] = cb.checked; });
      wrap.appendChild(node);
    });
  }

function collectCollectorSelections(){
  return CURRENT_COLLECTORS.filter((_, idx)=> collectorSelection[idx]);
}


// Zoom modal builders
function renderPB(pb){
  if (!pb) return "<div class='text-sm muted'>No data.</div>";
  const currencyFields = new Set(["balance","past_due","credit_limit","high_credit"]);
  const get = (k) => {
    let val = pb?.[k] ?? pb?.[`${k}_raw`];
    if ((val === null || val === undefined || val === "") && k === "date_last_payment") {
      val = pb?.last_payment ?? pb?.date_of_last_payment ?? pb?.dateLastPayment ?? null;
    }
    return val;
  };
  const row = (k,l) => {
    let val = get(k);
    val = currencyFields.has(k) ? formatCurrency(val) : escapeHtml(val ?? "—");
    return `<tr><td class="bg-gray-50 border px-2 py-1">${l}</td><td class="border px-2 py-1">${val}</td></tr>`;
  };
  return `
    <table class="w-full text-sm border-collapse">
      <tbody class="[&_td]:border [&_th]:border">
        ${row("account_number","Account #")}
        ${row("account_status","Account Status")}
        ${row("payment_status","Payment Status")}
        ${row("balance","Balance")}
        ${row("past_due","Past Due")}
        ${row("credit_limit","Credit Limit")}
        ${row("high_credit","High Credit")}
        ${row("date_opened","Date Opened")}
        ${row("last_reported","Last Reported")}
        ${row("date_last_payment","Date of Last Payment")}
        ${row("comments","Comments")}
      </tbody>
    </table>`;
}
function buildZoomHTML(tl){
  const per = tl.per_bureau || {};
  const vlist = normalizeViolations(tl.violations||[]).map(v=>`
    <li class="mb-2">
      <div class="font-medium">${escapeHtml(v.category||"")} – ${escapeHtml(v.title||"")}${v.bureaus && v.bureaus.length ? ' '+v.bureaus.map(b=>'<span class="badge badge-bureau">'+escapeHtml(b)+'</span>').join(' ') : ''}</div>
      ${v.detail? `<div class="text-gray-600">${escapeHtml(v.detail)}</div>` : ""}
      ${v.debug ? `<pre class="debug">${escapeHtml(v.debug)}</pre>` : ""}
    </li>`).join("") || "<div class='text-sm muted'>No violations detected.</div>";

  return `
    <div class="space-y-3">
      <div class="text-lg font-semibold">${escapeHtml(tl.meta?.creditor || "Unknown Creditor")}</div>
      <div class="grid md:grid-cols-3 gap-3">
        <div class="glass card"><div class="font-medium mb-1">TransUnion</div>${renderPB(per.TransUnion)}</div>
        <div class="glass card"><div class="font-medium mb-1">Experian</div>${renderPB(per.Experian)}</div>
        <div class="glass card"><div class="font-medium mb-1">Equifax</div>${renderPB(per.Equifax)}</div>
      </div>
      <div class="glass card">
        <div class="font-medium mb-1">Violations</div>
        <ol class="list-decimal list-inside">${vlist}</ol>
      </div>
    </div>`;
}
function openZoomModal(tl, idx){
  const m = $("#zoomModal");
  $("#zoomBody").innerHTML = buildZoomHTML(tl);
  m.classList.remove("hidden"); m.classList.add("flex");
  document.body.style.overflow = "hidden";
}
function closeZoomModal(){
  const m = $("#zoomModal");
  m.classList.add("hidden"); m.classList.remove("flex");
  document.body.style.overflow = "";
}
$("#zoomClose").addEventListener("click", closeZoomModal);
$("#zoomModal").addEventListener("click", (e)=>{ if(e.target.id==="zoomModal") closeZoomModal(); });

// ===================== Selection → Generate =====================
function getSpecialModeForCard(card){
  if (card.classList.contains("mode-identity")) return "identity";
  if (card.classList.contains("mode-breach"))   return "breach";
  if (card.classList.contains("mode-assault"))  return "assault";
  return null;
}
function collectSelections(){

  const useOcr = ocrCb?.checked || false;
  const incomplete = [];
  const selections = [];
  for (const [tradelineIndex, data] of Object.entries(selectionState)){
    if (data.specialMode && (!data.bureaus || data.bureaus.length === 0)){
      incomplete.push(tradelineIndex);
      continue;
    }
    const sel = {
      tradelineIndex: Number(tradelineIndex),
      bureaus: data.bureaus,
      specialMode: data.specialMode,
      playbook: data.playbook || undefined
    };
    const reasonMap = {
      identity: 'identity theft',
      breach: 'data breach',
      assault: 'sexual assault'
    };
    const tl = CURRENT_REPORT?.tradelines?.[Number(tradelineIndex)];
    const card = document.querySelector(`.tl-card[data-index="${tradelineIndex}"]`);
    const cardReason = card?.querySelector('.tl-manual-reason')?.textContent?.trim();
    const manualReason = cardReason || tl?.meta?.manual_reason;
    if (manualReason) {
      sel.specificDisputeReason = manualReason;
    } else if (data.specialMode && reasonMap[data.specialMode]) {
      sel.specificDisputeReason = reasonMap[data.specialMode];
    }
    if (data.violationIdxs && data.violationIdxs.length){
      sel.violationIdxs = data.violationIdxs;
    }
    if (!sel.specificDisputeReason && (!sel.violationIdxs || !sel.violationIdxs.length)) {
      const creditorName = tl?.meta?.creditor || '';
      let acctStatus = '';
      let pmtStatus = '';
      const bureaus = data.bureaus || [];
      for (let bi = 0; bi < bureaus.length; bi++) {
        const bd = tl?.per_bureau?.[bureaus[bi]];
        if (!acctStatus) acctStatus = String(bd?.account_status || '').trim();
        if (!pmtStatus) pmtStatus = String(bd?.payment_status || '').trim();
        if (acctStatus && pmtStatus) break;
      }
      if (!acctStatus) acctStatus = String(tl?.meta?.account_status || '').trim();
      if (!pmtStatus) pmtStatus = String(tl?.meta?.payment_status || '').trim();
      const negIndicators = [];
      if (pmtStatus && pmtStatus.toLowerCase() !== 'current') negIndicators.push(pmtStatus);
      if (acctStatus && /collection|charge.?off|derog/i.test(acctStatus)) negIndicators.push(acctStatus);
      if (negIndicators.length && creditorName) {
        sel.specificDisputeReason = `The reporting on my ${creditorName} account is inaccurate — ${negIndicators.join(', ')} does not reflect my records. I request a full investigation under FCRA §611.`;
      } else if (creditorName) {
        sel.specificDisputeReason = `The information reported on my ${creditorName} account is inaccurate and does not correspond to my records. I request a full reinvestigation under FCRA §611.`;
      }
    }
    if (card){
      const creditor = card.querySelector('.tl-creditor')?.textContent?.trim();
      const accountNumbers = {
        TransUnion: card.querySelector('.tl-tu-acct')?.textContent?.trim(),
        Experian: card.querySelector('.tl-exp-acct')?.textContent?.trim(),
        Equifax: card.querySelector('.tl-eqf-acct')?.textContent?.trim()
      };
      if (creditor) sel.creditor = creditor;
      const acctClean = Object.fromEntries(Object.entries(accountNumbers).filter(([,v])=>v));
      if (Object.keys(acctClean).length) sel.accountNumbers = acctClean;
    }
    if (data.letterType){
      if (data.letterType.startsWith('tpl:')) sel.templateId = data.letterType.slice(4);
      else sel.requestType = data.letterType;
    }
    if (useOcr){
      sel.useOcr = true;
    }
    selections.push(sel);
  }
  if (incomplete.length){
    showErr(`Select at least one bureau for special mode card${incomplete.length>1?'s':''}: ${incomplete.join(', ')}. Incomplete selections were skipped.`);
  }
  return selections;
}
export { collectSelections, selectionState, showErr };

async function doGenerateLetters(collectorsPayload, { selections, personalInfo, useOcr }) {
  const resp = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-idempotency-key": buildIdempotencyKey('letters-generate'), ...authHeader() },
    body: JSON.stringify({
      consumerId: currentConsumerId,
      reportId: currentReportId,
      selections,
      personalInfo,
      collectors: collectorsPayload,
      useOcr,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status} ${txt || ""}`.trim());
  }
  const data = await resp.json().catch(() => ({}));
  if (!data?.ok || !data?.redirect) throw new Error(data?.error || "Server did not return a redirect.");
  const notice = buildMinIntervalNotice(data.validation);
  if (notice) {
    showWorkflowNotice(notice);
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem("lettersMinIntervalNotice", notice);
  } else if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem("lettersMinIntervalNotice");
  }
  window.location.assign(data.redirect);
  setTimeout(() => { if (!/\/letters(\?|$)/.test(location.href)) window.location.href = data.redirect; }, 120);
}

$("#btnGenerate").addEventListener("click", async () => {
  clearErr();
  const btn = $("#btnGenerate");
  try {
    if (!currentConsumerId || !currentReportId) throw new Error("Select a consumer and a report first.");
    const selections = collectSelections();
    const includePI = $("#cbPersonalInfo").checked;
    const includeCol = $("#cbCollectors").checked;
    const colSelections = includeCol ? collectCollectorSelections() : [];
    if (!selections.length && !includePI && !colSelections.length) throw new Error("Pick at least one negative item, collector, or select Personal Info.");
    const useOcr = ocrCb?.checked || false;

    if (colSelections.length) {
      btn.disabled = true;
      btn.textContent = "Checking addresses…";
      let preflightData;
      try {
        const pf = await api("/api/generate/preflight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consumerId: currentConsumerId, collectors: colSelections }),
        });
        if (!pf.ok) throw new Error(pf.error || "Preflight check failed");
        preflightData = pf;
      } finally {
        btn.disabled = false;
        btn.textContent = "Generate Letters";
      }

      if (preflightData.flagged && preflightData.flagged.length > 0) {
        openAddrPreflightModal(preflightData.flagged, preflightData.enriched, { selections, personalInfo: includePI, useOcr });
        return;
      }
      await doGenerateLetters(preflightData.enriched || colSelections, { selections, personalInfo: includePI, useOcr });
    } else {
      await doGenerateLetters([], { selections, personalInfo: includePI, useOcr });
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "Generate Letters";
    showErr(e.message || String(e));
  }
});

// ===================== Toolbar =====================
$("#btnCreateClient").addEventListener("click", ()=>{
  const m = $("#newModal");
  $("#newForm").reset();
  m.classList.remove("hidden");
  document.body.style.overflow = "hidden";
});
$("#newClose").addEventListener("click", ()=> closeNew());
$("#newCancel").addEventListener("click", ()=> closeNew());
function closeNew(){
  $("#newModal").classList.add("hidden");
  document.body.style.overflow = "";
}
$("#newForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
  const res = await api("/api/consumers", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  if(!res?.ok) return showErr(res?.error || "Failed to create consumer.");
  closeNew();
  await loadConsumers(false, true);
  await selectConsumer(res.consumer.id);
});

$("#btnEditClient").addEventListener("click", ()=>{
  const m = $("#editModal");
  if(!currentConsumerId){ showErr("Select a consumer first."); return; }
  const c = DB.find(x=>x.id===currentConsumerId);
  if(!c){ showErr("Consumer not found."); return; }
  const f = $("#editForm");
  f.name.value = c.name || "";
  f.email.value = c.email || "";
  f.phone.value = c.phone || "";
  f.addr1.value = c.addr1 || "";
  f.addr2.value = c.addr2 || "";
  f.city.value = c.city || "";
  f.state.value = c.state || "";
  f.zip.value = c.zip || "";
  f.ssn_last4.value = c.ssn_last4 || "";
  f.dob.value = c.dob || "";
  f.sale.value = c.sale ?? "";
  f.paid.value = c.paid ?? "";
  f.status.value = c.status || "active";

  m.classList.remove("hidden");
  document.body.style.overflow = "hidden";
});
$("#editClose").addEventListener("click", ()=> closeEdit());
$("#editCancel").addEventListener("click", ()=> closeEdit());
function closeEdit(){
  $("#editModal").classList.add("hidden");
  document.body.style.overflow = "";
}
$("#editForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const f = e.currentTarget;
  const payload = Object.fromEntries(new FormData(f).entries());
  const res = await api(`/api/consumers/${currentConsumerId}`, {
    method:"PUT",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  if(!res?.ok) return showErr(res?.error || "Failed to save.");
  closeEdit();
  await loadConsumers(false, true);
  const c = DB.find(x=>x.id===currentConsumerId);
  $("#selConsumer").textContent = c ? c.name : "—";
});

function openTlEdit(idx){
  const tl = CURRENT_REPORT?.tradelines?.[idx];
  if(!tl) return;
  const f = $("#tlEditForm");
  const reasonSearch = $("#tlReasonSearch");
  if(reasonSearch){
    reasonSearch.value = "";
    renderReasonOptions();
  }
  f.dataset.idx = idx;
  f.creditor.value = tl.meta?.creditor || "";
  f.tu_account_number.value = tl.per_bureau?.TransUnion?.account_number || "";
  f.exp_account_number.value = tl.per_bureau?.Experian?.account_number || "";
  f.eqf_account_number.value = tl.per_bureau?.Equifax?.account_number || "";
  f.manual_reason.value = tl.meta?.manual_reason || "";

  const reasonSel = $("#tlReasonSelect");
  const reasonText = $("#tlReasonText");
  if(reasonSel){
    reasonSel.value = metro2Violations.includes(f.manual_reason.value) ? f.manual_reason.value : "";
    if(reasonSel.value && reasonText) reasonText.value = reasonSel.value;
  }

  const fileRec = consumerFiles.find(f => f.id === currentReportId);

  if(fileRec){
    const url = `/api/consumers/${currentConsumerId}/state/files/${encodeURIComponent(fileRec.storedName)}`;
    const iframe = $("#tlHtmlPreview");
    iframe.onload = () => {
      try{
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        const nums = [f.tu_account_number.value, f.exp_account_number.value, f.eqf_account_number.value]
          .map(s => s.trim()).filter(Boolean);
        let target;
        const els = Array.from(doc.body?.getElementsByTagName('*') || []);
        for(const num of nums){
          for(const el of els){
            if(el.textContent?.includes(num)){ target = el; break; }
          }
          if(target) break;
        }
        if(target) target.scrollIntoView({behavior:'smooth', block:'center'});
      }catch{}
    };
    iframe.src = url;

    $("#tlHtmlContainer").classList.remove("hidden");
  }else{
    $("#tlHtmlPreview").src = "";
    $("#tlHtmlContainer").classList.add("hidden");
  }

  $("#tlEditModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeTlEdit(){
  $("#tlEditModal").classList.add("hidden");
  document.body.style.overflow = "";
  $("#tlHtmlPreview").src = "";
  $("#tlHtmlContainer").classList.add("hidden");
  const sel = $("#tlReasonSelect");
  if(sel) sel.value = "";
  const search = $("#tlReasonSearch");
  if(search){
    search.value = "";
    renderReasonOptions();
  }

}
$("#tlHtmlInput")?.addEventListener("change", e=>{
  const file = e.target.files?.[0];
  if(!file) return;
  if(tlHtmlUrl){ URL.revokeObjectURL(tlHtmlUrl); }
  tlHtmlUrl = URL.createObjectURL(file);
  $("#tlHtmlPreview").src = tlHtmlUrl;
  $("#tlHtmlContainer").classList.remove("hidden");

});
$("#tlEditCancel").addEventListener("click", ()=> closeTlEdit());
$("#tlEditForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const f = e.currentTarget;
  const idx = Number(f.dataset.idx);
  const tl = CURRENT_REPORT?.tradelines?.[idx];
  if(!tl) return;
  tl.meta = tl.meta || {};
  tl.per_bureau = tl.per_bureau || {};
  tl.meta.creditor = f.creditor.value.trim();
  tl.meta.manual_reason = f.manual_reason.value.trim();

  const map = { TransUnion: 'tu_account_number', Experian: 'exp_account_number', Equifax: 'eqf_account_number' };
  for (const [bureau, field] of Object.entries(map)) {
    const val = f[field].value.trim();
    tl.per_bureau[bureau] = { ...(tl.per_bureau[bureau] || {}), account_number: val };
  }
  if(currentConsumerId && currentReportId){
    const payload = {
      creditor: tl.meta.creditor,
      manual_reason: tl.meta.manual_reason,

      per_bureau: {
        TransUnion: { account_number: f.tu_account_number.value.trim() },
        Experian: { account_number: f.exp_account_number.value.trim() },
        Equifax: { account_number: f.eqf_account_number.value.trim() }
      }
    };
    const res = await api(`/api/consumers/${currentConsumerId}/report/${currentReportId}/tradeline/${idx}`, {
      method:'PUT',
      body: JSON.stringify(payload)
    });
    if(!res?.ok) return showErr(res?.error || 'Failed to save.');
  }
  renderTradelines(CURRENT_REPORT.tradelines);
  closeTlEdit();
});

// Upload report
let lastUploadButton = null;
function triggerReportUpload(btn){
  if(!currentConsumerId) return showErr("Select a consumer first.");
  lastUploadButton = btn;
  $("#fileInput").value = "";
  $("#fileInput").click();
}

$("#btnUpload").addEventListener("click", ()=>{
  triggerReportUpload($("#btnUpload"));
});

const uploadPdfButton = document.getElementById("btnUploadPdf");
if (uploadPdfButton) {
  uploadPdfButton.addEventListener("click", ()=>{
    triggerReportUpload(uploadPdfButton);
  });
}
$("#fileInput").addEventListener("change", async (e)=>{
  clearErr();
  const file = e.target.files?.[0];
  if(!file) return;
  const btn = lastUploadButton || $("#btnUpload");
  const old = btn.textContent;
  btn.textContent = "Uploading…";
  btn.disabled = true;
  const otherBtn = btn === $("#btnUpload") ? document.getElementById("btnUploadPdf") : $("#btnUpload");
  if (otherBtn) {
    otherBtn.disabled = true;
  }

  try{
    const fd = new FormData();
    fd.append("file", file, file.name);
    const uploadUrl = `/api/consumers/${currentConsumerId}/upload?parseMode=${encodeURIComponent(reportParseMode)}`;
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: authHeader(),
      body: fd
    });
    const data = await res.json().catch(()=> ({}));
    if(!data?.ok) throw new Error(data?.error || `Upload failed (HTTP ${res.status})`);
    if (Array.isArray(data.errors) && data.errors.length) {
      console.warn('Upload completed with errors:', data.errors);
      const pyErr = data.errors.find(e => e.step === 'python_analyzer');
      if (pyErr) {
        alert(`Python analyzer failed: ${pyErr.message}`);
      }
    }
    if (data.creditScore) {
      localStorage.setItem("creditScore", JSON.stringify(data.creditScore));
      window.dispatchEvent(new StorageEvent("storage", { key: "creditScore" }));
    }
    currentReportId = data.reportId;
    CURRENT_REPORT = null;
    tlPage = 1;
    tlTotalPages = 1;
    CURRENT_COLLECTORS = [];
    Object.keys(collectorSelection).forEach(k=> delete collectorSelection[k]);
    hiddenTradelines.clear();
    Object.keys(selectionState).forEach(k=> delete selectionState[k]);
    trackerData = {};
    trackerSteps = [];
    await loadReportJSON();
    await refreshReports();
    await loadConsumerState();
    await loadDisputeTracker();
  }catch(err){
    showErr(String(err));
  }finally{
    btn.textContent = old;
    btn.disabled = false;
    if (otherBtn) {
      otherBtn.disabled = false;
    }
    lastUploadButton = null;
  }
});

// Data breach lookup
$("#btnDataBreach").addEventListener("click", async ()=>{
  if(!currentConsumerId) return showErr("Select a consumer first.");
  try {
    const freshData = await api("/api/consumers");
    if (freshData?.consumers) {
      const fresh = freshData.consumers.find(x => x.id === currentConsumerId);
      if (fresh) {
        const idx = DB.findIndex(x => x.id === currentConsumerId);
        if (idx !== -1) Object.assign(DB[idx], fresh);
      }
    }
  } catch(_){}
  const c = DB.find(x=>x.id===currentConsumerId);
  if(!c?.email) return showErr("This client has no email address. Add one in the client details to run a breach check.");
  const btn = $("#btnDataBreach");
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Checking...";
  try{
    const res = await api(`/api/databreach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: c.email, consumerId: c.id })
    });
    if(!res?.ok) return showErr(res?.error || "Breach check failed.");
    const list = res.breaches || [];
    c.breaches = list.map(b=>b.Name || b.name || "");
    const filteredSelections = Array.isArray(c.breachSelections)
      ? c.breachSelections.filter((item)=> c.breaches.includes(item))
      : [];
    if (c.breaches.length && !filteredSelections.length) {
      c.breachSelections = [...c.breaches];
      queueBreachSave({ breachSelections: c.breachSelections });
    } else if (filteredSelections.length !== (c.breachSelections || []).length) {
      c.breachSelections = filteredSelections;
      queueBreachSave({ breachSelections: c.breachSelections });
    }
    updateBreachStatus(c);
    renderBreachCard(c);
    openBreachModal(c);
  }catch(err){
    showErr(String(err));
  }finally{
    btn.textContent = old;
    btn.disabled = false;
  }
});

$("#btnBreachLookup")?.addEventListener("click", ()=>{
  $("#btnDataBreach")?.click();
});

$("#breachStatus").addEventListener("click", ()=>{
  if(!currentConsumerId) return showErr("Select a consumer first.");
  const c = DB.find(x=>x.id===currentConsumerId);
  if (!c) return;
  openBreachModal(c);
});

// Data breach modal handlers
$("#breachClose").addEventListener("click", ()=>{
  const m = $("#breachModal");
  m.classList.add("hidden");
  m.classList.remove("flex");
});

$("#breachBody").addEventListener("change", (e)=>{
  if (!e.target.classList.contains("breach-select")) return;
  const selections = getBreachSelectionsFromUI();
  queueBreachSave({ breachSelections: selections });
});

$("#breachEvidenceNotes").addEventListener("input", (e)=>{
  queueBreachSave({ breachEvidenceNotes: e.target.value });
});

$("#breachEvidenceUpload").addEventListener("click", ()=>{
  if(!currentConsumerId) return showErr("Select a consumer first.");
  $("#breachEvidenceFile").value = "";
  $("#breachEvidenceFile").click();
});

$("#breachEvidenceFile").addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  try{
    const fd = new FormData();
    fd.append("file", file, file.name);
    fd.append("type", "breach_evidence");
    const res = await fetch(`/api/consumers/${currentConsumerId}/state/upload`, {
      method: "POST",
      headers: authHeader(),
      body: fd
    });
    const data = await res.json().catch(()=> ({}));
    if(!data?.ok) throw new Error(data?.error || `Upload failed`);
    const c = DB.find(x=>x.id===currentConsumerId);
    if (c){
      const files = Array.isArray(c.breachEvidenceFiles) ? c.breachEvidenceFiles : [];
      const entry = {
        name: data.file?.originalName || file.name,
        url: data.file?.url,
        uploadedAt: data.file?.uploadedAt || new Date().toISOString()
      };
      c.breachEvidenceFiles = files.concat(entry);
      queueBreachSave({ breachEvidenceFiles: c.breachEvidenceFiles });
      renderBreachEvidenceFiles(c);
    }
  }catch(err){
    showErr(String(err));
  }
});

$("#breachUseInDispute").addEventListener("click", ()=>{
  if (!currentConsumerId) return showErr("Select a consumer first.");
  const cards = Array.from(document.querySelectorAll(".tl-card.selected"));
  if (!cards.length) return showErr("Select tradelines to apply breach mode.");
  if (activeMode !== "breach") {
    setMode("breach");
  } else {
    updateModeButtons();
  }
  cards.forEach(card => {
    if (!card.classList.contains("mode-breach")) {
      toggleCardMode(card, "breach");
    }
  });
});

$("#breachSend").addEventListener("click", async ()=>{
  if(!currentConsumerId) return showErr("Select a consumer first.");
  const btn = $("#breachSend");
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Generating...";
  try{
    const c = DB.find(x=>x.id===currentConsumerId);
    if (c){
      const payload = {
        breachSelections: getBreachSelectionsFromUI(),
        breachEvidenceNotes: $("#breachEvidenceNotes").value,
        breachEvidenceFiles: Array.isArray(c.breachEvidenceFiles) ? c.breachEvidenceFiles : []
      };
      queueBreachSave(payload);
      await flushBreachSave();
    }
    const res = await fetch(`/api/consumers/${currentConsumerId}/databreach/audit`, { method:"POST" }).then(r=>r.json());
    if(!res?.ok) return showErr(res?.error || "Failed to generate audit.");
    if(res.url) window.open(res.url, "_blank");
    if(res.warning) showErr(res.warning);
    await loadConsumerState();

  }catch(err){
    showErr(String(err));
  }finally{
    btn.textContent = old;
    btn.disabled = false;
  }
});

// Audit report
$("#btnAuditReport").addEventListener("click", async ()=>{
  if(!currentConsumerId || !currentReportId) return showErr("Select a report first.");
  const selections = collectSelections();
  const btn = $("#btnAuditReport");
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Auditing...";
  try{
    const payload = selections.length ? { selections } : {};
    const response = await api(`/api/consumers/${currentConsumerId}/report/${currentReportId}/audit`, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "x-idempotency-key": buildIdempotencyKey('audit-report') },
      body: JSON.stringify(payload)
    });
    if(response.status === 202 && response.jobId){
      const job = await waitForJobCompletion(response.jobId);
      const target = job?.result?.storedFile?.url || job?.result?.url;
      if(target) window.open(target, "_blank");
      if(job?.result?.warning) showErr(job.result.warning);
      await loadConsumerState();
      return;
    }
    if(!response?.ok) return showErr(response?.error || "Failed to run audit.");
    if(response.url) window.open(response.url, "_blank");
    if(response.warning) showErr(response.warning);
  }catch(err){
    showErr(String(err));
  }finally{
    btn.textContent = old;
    btn.disabled = false;
  }
});

// Client-level audit (audits latest report, stores PDF for portal)
$("#btnRunClientAudit")?.addEventListener("click", async ()=>{
  if(!currentConsumerId) return showErr("Select a client first.");
  const c = DB.find(x=>x.id===currentConsumerId);
  if(!c || !Array.isArray(c.reports) || !c.reports.length) return showErr("This client has no uploaded credit reports to audit.");
  const latestReport = c.reports.reduce((a, b) => new Date(b.uploadedAt || 0) > new Date(a.uploadedAt || 0) ? b : a, c.reports[0]);
  if(!latestReport?.id) return showErr("Could not find the latest report.");
  const btn = $("#btnRunClientAudit");
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Auditing...";
  try{
    const response = await api(`/api/consumers/${currentConsumerId}/report/${latestReport.id}/audit`, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "x-idempotency-key": buildIdempotencyKey('client-audit') },
      body: JSON.stringify({})
    });
    if(response.status === 202 && response.jobId){
      const job = await waitForJobCompletion(response.jobId);
      const target = job?.result?.storedFile?.url || job?.result?.url;
      if(target) window.open(target, "_blank");
      if(job?.result?.warning) showErr(job.result.warning);
      await loadConsumerState();
      return;
    }
    if(!response?.ok) return showErr(response?.error || "Failed to generate audit.");
    if(response.url) window.open(response.url, "_blank");
    if(response.warning) showErr(response.warning);
    await loadConsumerState();
  }catch(err){
    showErr(String(err));
  }finally{
    btn.textContent = old;
    btn.disabled = false;
  }
});

// Delete report
$("#btnDeleteReport").addEventListener("click", async ()=>{
  if(!currentConsumerId || !currentReportId) return showErr("Select a report first.");
  if(!confirm("Delete this report?")) return;
  const res = await api(`/api/consumers/${currentConsumerId}/report/${currentReportId}`, { method:"DELETE" });
  if(!res?.ok) return showErr(res?.error || "Failed to delete report.");
  await refreshReports();
  await loadConsumerState();
});

// ===================== Files & Activity =====================
async function loadConsumerState(){
  if (!currentConsumerId){ $("#activityList").innerHTML = ""; return; }
  const resp = await api(`/api/consumers/${currentConsumerId}/state`);
  if (!resp?.ok){ $("#activityList").innerHTML = `<div class="muted">No activity.</div>`; return; }
  const allEvents = resp.state?.events || [];
  const events = allEvents.filter(ev => ev.type !== "message");
  const breachEvents = events.filter(ev => ev.type === "breach_lookup" || ev.type === "breach_audit_generated");
  const activityEvents = events.filter(ev => !breachEvents.includes(ev));
  const files = resp.state?.files || [];
  consumerFiles = files;

  const list = [];

  list.push(`<div class="font-medium mb-1">Breach History</div>`);
  if (!breachEvents.length){
    list.push(`<div class="muted text-sm">No breach history yet.</div>`);
  } else {
    breachEvents.forEach(ev=>{ list.push(formatBreachHistoryEntry(ev)); });
  }

  if (files.length){
    list.push(`<div class="font-medium mb-1">Files</div>`);
    files.forEach(f=>{
      list.push(`
        <div class="glass card flex items-center justify-between p-2" data-stored="${escapeHtml(f.storedName)}">
          <div class="wrap-anywhere">
            <div>${escapeHtml(f.originalName)}</div>
            <div class="text-xs muted">${escapeHtml((f.mimetype||"").split("/").pop() || "")} • ${(f.size/1024).toFixed(1)} KB • ${new Date(f.uploadedAt).toLocaleString()}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <a class="btn text-sm" href="/api/consumers/${currentConsumerId}/state/files/${encodeURIComponent(f.storedName)}" target="_blank">Open</a>
            <button class="btn text-sm btn-delete-file" data-stored="${escapeHtml(f.storedName)}" data-name="${escapeHtml(f.originalName)}" style="color:#f87171;border-color:#f87171;">Delete</button>
          </div>
        </div>
      `);
    });
  }

  list.push(`<div class="font-medium mt-2 mb-1">Activity</div>`);
  if (!activityEvents.length){
    list.push(`<div class="muted">No recent events.</div>`);
  } else {
    activityEvents.forEach(ev=>{ list.push(formatEvent(ev)); });
  }
  $("#activityList").innerHTML = list.join("");
}

$("#activityList").addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn-delete-file");
  if (!btn) return;
  if (!currentConsumerId) return;
  const stored = btn.dataset.stored;
  const name = btn.dataset.name || stored;
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  btn.disabled = true;
  btn.textContent = "Deleting…";
  try {
    const res = await fetch(`/api/consumers/${currentConsumerId}/state/files/${encodeURIComponent(stored)}`, {
      method: "DELETE",
      headers: authHeader()
    });
    const data = await res.json().catch(() => ({}));
    if (!data?.ok) throw new Error(data?.error || "Failed to delete file");
    await loadConsumerActivity();
  } catch (err) {
    showErr(err.message);
    btn.disabled = false;
    btn.textContent = "Delete";
  }
});

$("#btnAddFile").addEventListener("click", ()=>{
  if(!currentConsumerId) return showErr("Select a consumer first.");
  $("#activityFile").value = "";
  $("#activityFile").click();
});
$("#activityFile").addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  try{
    const fd = new FormData();
    fd.append("file", file, file.name);
    const res = await fetch(`/api/consumers/${currentConsumerId}/state/upload`, {
      method: "POST",
      headers: authHeader(),
      body: fd
    });
    const data = await res.json().catch(()=> ({}));
    if(!data?.ok) throw new Error(data?.error || `Upload failed`);
    await loadConsumerState();
  }catch(err){
    showErr(String(err));
  }
});

async function loadMessages(){
  if(!currentConsumerId){ $("#msgList").innerHTML = ""; return; }
  const resp = await api(`/api/messages/${currentConsumerId}`);
  if(!resp?.ok){ $("#msgList").innerHTML = `<div class="muted">No messages.</div>`; return; }
  const msgs = resp.messages || [];
  if(!msgs.length){ $("#msgList").innerHTML = `<div class="muted">No messages.</div>`; return; }
  $("#msgList").innerHTML = msgs.map(m=>{
    const fromUser = m.payload?.from;
    const isClient = fromUser === 'client';
    const cls = isClient ? 'msg-client' : 'msg-host';
    const label = isClient ? 'Client' : escapeHtml(fromUser || 'Host');
    const when = new Date(m.at).toLocaleString();
    return `<div class="message ${cls}"><div class="text-xs muted">${label} • ${when}</div><div>${escapeHtml(m.payload?.text||'')}</div></div>`;
  }).join('');
}

$("#btnSendMsg").addEventListener("click", async ()=>{
  if(!currentConsumerId) return showErr("Select a consumer first.");
  const txt = $("#msgInput").value.trim();
  if(!txt) return;
  const res = await api(`/api/messages/${currentConsumerId}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text: txt }) });
  if(!res?.ok) return showErr(res.error || "Failed to send message.");
  $("#msgInput").value = "";
  await loadMessages();
});

// ===================== Modes + Global Hotkeys =====================
// Minimal re-implementation here so we don't rely on inline scripts
const MODES = [
  {
    key: "identity",
    hotkey: "i",
    cardClass: "mode-identity",
    chip: "ID Theft",
    label: "Identity Theft",
  },
  {
    key: "breach",
    hotkey: "d",
    cardClass: "mode-breach",
    chip: "Breach",
    label: "Data Breach",
  },
  {
    key: "assault",
    hotkey: "s",
    cardClass: "mode-assault",
    chip: "Assault",
    label: "Sexual Assault",
  },
];
let activeMode = null;
function setMode(key){ activeMode = (activeMode===key)? null : key; updateModeButtons(); }
function updateModeButtons(){ document.querySelectorAll(".mode-btn").forEach(b=> b.classList.toggle("active", b.dataset.mode===activeMode)); }

(function initModesBar(){
  const bar = $("#modeBar");
  if (!bar) return;
  bar.innerHTML = "";
  MODES.forEach(m => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `chip mode-btn chip-${m.key}`;
    btn.textContent = m.label;
    btn.dataset.mode = m.key;
    btn.addEventListener("click", () => setMode(m.key));
    bar.appendChild(btn);
  });
  updateModeButtons();
})();

function attachCardHandlers(root=document){
  root.querySelectorAll(".tl-card").forEach(card=>{
    if (card.__modesHooked) return;
    card.__modesHooked = true;

    // focus ring for hotkeys R/A
    card.addEventListener("pointerdown", ()=> focusCard(card));

    // main click behavior: toggle selection or special mode
    card.addEventListener("click", (e)=>{
      if (e.target.closest("input, label, button")) return;
      if (activeMode){
        toggleCardMode(card, activeMode);
      } else {
        toggleWholeCardSelection(card);
      }
    });

    const playBtn = card.querySelector('.tl-playbook');
    const playSel = card.querySelector('.tl-playbook-select');
    if (playBtn && playSel) {
      playSel.innerHTML = '<option value="">No playbook</option>' +
        Object.entries(PLAYBOOKS).map(([k,v])=>`<option value="${k}">${escapeHtml(v.name)}</option>`).join('');
      playBtn.addEventListener('click', (e)=>{
        e.stopPropagation();
        playSel.classList.toggle('hidden');
      });
      playSel.addEventListener('change', (e)=>{
        e.stopPropagation();
        playSel.classList.add('hidden');
        updateSelectionStateFromCard(card);
      });
    }

    // badge container safety
    if (!card.querySelector(".special-badges")) {
      const head = card.querySelector(".tl-head") || card.firstElementChild;
      const holder = document.createElement("div");
      holder.className = "special-badges flex gap-1";
      head.appendChild(holder);
    }

    // ensure badges match current classes
    updateCardBadges(card);
  });
}
let lastFocusedCard = null;
function focusCard(card){
  if (lastFocusedCard) lastFocusedCard.classList.remove("focus-ring");
  lastFocusedCard = card;
  card.classList.add("focus-ring");
}
function toggleWholeCardSelection(card){
  const any = Array.from(card.querySelectorAll('input.bureau')).some(cb=>cb.checked);
  setCardSelected(card, !any);
}

function toggleCardMode(card, modeKey){
  const info = MODES.find(m => m.key === modeKey);
  if (!info) return;

  // remove other mode classes before toggling desired one
  MODES.forEach(m => { if (m.cardClass !== info.cardClass) card.classList.remove(m.cardClass); });
  const added = card.classList.toggle(info.cardClass);

  if (added) {
    const bureaus = Array.from(card.querySelectorAll('input.bureau'));
    if (bureaus.length) {
      if (!bureaus.some(cb => cb.checked)) {
        // default to first available bureau
        bureaus[0].checked = true;
      }
    } else {
      console.warn('No bureaus available to select for card');
    }
  }

  updateCardBadges(card);
  updateSelectionStateFromCard(card);
}

function updateCardBadges(card){
  const wrap = card.querySelector(".special-badges");
  if (!wrap) return;
  wrap.innerHTML = "";
  MODES.forEach(m => {
    if (card.classList.contains(m.cardClass)) {
      const s = document.createElement("span");
      s.className = `chip chip-mini chip-${m.key}`;
      s.textContent = m.chip;
      wrap.appendChild(s);
    }
  });
}
window.__crm_helpers = {
  attachCardHandlers,
  focusCardRef: ()=> lastFocusedCard,
  toggleWholeCardSelection,
  clearMode: ()=>{ activeMode=null; updateModeButtons(); },
  setMode,
};

const tlList = $("#tlList");
const obs = new MutationObserver(()=> attachCardHandlers(tlList));
obs.observe(tlList, { childList:true, subtree:true });

// ===================== View Toggle =====================
const btnCardView = $("#btnCardView");
const btnListView = $("#btnListView");

function setViewMode(mode) {
  const grid = $("#tlList");
  if (mode === "list") {
    grid.classList.add("list-view");
    btnListView.classList.add("active");
    btnCardView.classList.remove("active");
    localStorage.setItem("tlViewMode", "list");
  } else {
    grid.classList.remove("list-view");
    btnCardView.classList.add("active");
    btnListView.classList.remove("active");
    localStorage.setItem("tlViewMode", "card");
  }
  grid.querySelectorAll(".tl-violations-count").forEach(el => {
    const total = el.dataset.violationCount;
    if (total !== undefined) {
      el.textContent = mode === "list"
        ? `${total} violation${total == 1 ? "" : "s"}`
        : el.dataset.verboseText || el.textContent;
    }
  });
}

if (btnCardView && btnListView) {
  btnCardView.addEventListener("click", () => setViewMode("card"));
  btnListView.addEventListener("click", () => setViewMode("list"));
  const savedView = localStorage.getItem("tlViewMode");
  if (savedView === "list") setViewMode("list");
}

// ===================== Dispute Tracker (Summary Card) =====================

async function loadDisputeTracker() {
  const panel = $("#disputeTrackerPanel");
  if (!panel) return;
  if (!currentConsumerId) {
    panel.classList.add("hidden");
    return;
  }

  try {
    const data = await api(`/api/consumers/${currentConsumerId}/disputes`);
    if (!data || data.ok === false) {
      panel.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");
    const rounds = data.rounds || [];
    const totalItems = rounds.reduce((sum, r) => sum + (r.items || []).length, 0);
    const activeRounds = rounds.filter(r => r.status !== 'resolved').length;
    const resolved = rounds.filter(r => r.status === 'resolved').length;
    const subtitle = $("#disputeTrackerSubtitle");
    const body = $("#disputeSummaryBody");
    const link = $("#disputeTrackerLink");
    if (link) link.href = `/disputes?client=${encodeURIComponent(currentConsumerId)}`;
    if (rounds.length === 0) {
      if (subtitle) subtitle.textContent = 'No active disputes.';
      if (body) body.innerHTML = '<div class="muted" style="padding:4px 0;">No dispute rounds recorded yet.</div>';
    } else {
      if (subtitle) subtitle.textContent = `${rounds.length} round${rounds.length !== 1 ? 's' : ''} • ${totalItems} item${totalItems !== 1 ? 's' : ''} tracked`;
      if (body) body.innerHTML = `<div style="display:flex;gap:16px;flex-wrap:wrap;padding:4px 0;">
        <div><span style="font-weight:600;color:#d4a853;font-size:18px;">${activeRounds}</span> <span class="muted">active</span></div>
        <div><span style="font-weight:600;color:#4ade80;font-size:18px;">${resolved}</span> <span class="muted">resolved</span></div>
        <div><span style="font-weight:600;color:#fff;font-size:18px;">${totalItems}</span> <span class="muted">items</span></div>
      </div>`;
    }
  } catch (err) {
    console.error('Failed to load dispute tracker summary', err);
    panel.classList.add("hidden");
  }
}

// ===================== Contracts Panel =====================
async function loadClientContracts() {
  const panel = $("#clientContractsPanel");
  const list = $("#clientContractsList");
  const subtitle = $("#contractsPanelSubtitle");
  if (!panel || !list) return;
  if (!currentConsumerId) {
    panel.classList.add("hidden");
    return;
  }
  try {
    const data = await api(`/api/consumers/${currentConsumerId}/contracts`);
    panel.classList.remove("hidden");
    const contracts = (data?.contracts) || [];
    if (!contracts.length) {
      if (subtitle) subtitle.textContent = "No contracts sent yet.";
      list.innerHTML = "";
      return;
    }
    const signedCount = contracts.filter(c => c.signature).length;
    if (subtitle) {
      subtitle.textContent = `${signedCount} of ${contracts.length} signed`;
    }
    list.innerHTML = "";
    contracts.forEach(ct => {
      const sig = ct.signature;
      const card = document.createElement("div");
      card.className = "glass card p-3";
      card.style.cssText = "border:1px solid " + (sig ? "rgba(74,222,128,0.25)" : "rgba(212,168,83,0.2)") + ";border-radius:12px;";

      const header = document.createElement("div");
      header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;";

      const nameEl = document.createElement("div");
      nameEl.style.cssText = "font-weight:600;font-size:13px;";
      nameEl.textContent = ct.name || "Contract";

      const badge = document.createElement("span");
      if (sig) {
        badge.style.cssText = "background:rgba(74,222,128,0.15);color:#4ade80;border:1px solid rgba(74,222,128,0.3);padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;";
        badge.textContent = "Signed";
      } else {
        badge.style.cssText = "background:rgba(212,168,83,0.12);color:#d4a853;border:1px solid rgba(212,168,83,0.25);padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;";
        badge.textContent = "Awaiting Signature";
      }

      header.appendChild(nameEl);
      header.appendChild(badge);
      card.appendChild(header);

      if (sig) {
        const meta = document.createElement("div");
        meta.style.cssText = "font-size:11px;color:#888;margin-top:6px;";
        meta.textContent = `Signed by ${sig.signedBy} on ${new Date(sig.signedAt).toLocaleString()}`;
        card.appendChild(meta);

        const viewLink = document.createElement("a");
        viewLink.href = `/api/consumers/${encodeURIComponent(currentConsumerId)}/contracts/${encodeURIComponent(ct.id)}/print`;
        viewLink.target = "_blank";
        viewLink.style.cssText = "display:inline-block;margin-top:8px;font-size:11px;color:#d4a853;text-decoration:underline;";
        viewLink.textContent = "View signed copy";
        card.appendChild(viewLink);
      }

      list.appendChild(card);
    });
  } catch (err) {
    panel.classList.add("hidden");
  }
}

// ===================== Send Contract from CRM =====================
(function initCrmSendContract(){
  const modal = $("#crmSendContractModal");
  const closeBtn = $("#crmSendContractClose");
  const openBtn = $("#btnSendContractFromCrm");
  const pickerList = $("#crmContractPickerList");
  const emptyEl = $("#crmContractPickerEmpty");
  const statusEl = $("#crmSendContractStatus");
  const clientNameEl = $("#crmSendContractClientName");
  const inviteSectionEl = $("#crmSendInviteSection");
  const inviteLinkEl = $("#crmSendInviteLink");
  const copyInviteBtn = $("#crmCopyInviteLink");
  if(!modal || !openBtn) return;

  if(copyInviteBtn && inviteLinkEl){
    copyInviteBtn.addEventListener("click", async ()=>{
      try{
        await navigator.clipboard.writeText(inviteLinkEl.value);
        copyInviteBtn.textContent = "Copied!";
        setTimeout(()=> copyInviteBtn.textContent = "Copy", 2000);
      }catch{}
    });
  }

  function closeModal(){
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    document.body.style.overflow = "";
    if(inviteSectionEl) inviteSectionEl.classList.add("hidden");
  }

  async function openModal(){
    if(!currentConsumerId) return;
    const consumer = DB.find(c => c.id === currentConsumerId);
    if(clientNameEl) clientNameEl.textContent = consumer?.name || "this client";
    if(statusEl){ statusEl.textContent = ""; statusEl.classList.add("hidden"); }
    if(inviteSectionEl) inviteSectionEl.classList.add("hidden");
    if(pickerList) pickerList.innerHTML = '<div class="text-xs muted">Loading…</div>';
    if(emptyEl) emptyEl.classList.add("hidden");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    document.body.style.overflow = "hidden";

    try {
      const data = await api("/api/templates");
      const contracts = (data.contracts || []).filter(c => c.id && c.name);
      pickerList.innerHTML = "";
      if(!contracts.length){
        emptyEl.classList.remove("hidden");
        return;
      }
      contracts.forEach(ct => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-radius:10px;border:1px solid rgba(212,168,83,0.18);background:rgba(212,168,83,0.04);";
        const name = document.createElement("span");
        name.style.cssText = "font-size:13px;font-weight:500;color:#e5e7eb;";
        name.textContent = ct.name;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn text-xs";
        btn.style.cssText = "background:rgba(212,168,83,0.15);border:1px solid rgba(212,168,83,0.3);color:#d4a853;white-space:nowrap;";
        btn.textContent = "Send";
        btn.addEventListener("click", async ()=>{
          btn.disabled = true;
          btn.textContent = "Sending…";
          try {
            const res = await api(`/api/contracts/${encodeURIComponent(ct.id)}/send`, {
              method: "POST",
              body: JSON.stringify({ consumerId: currentConsumerId })
            });
            if(!res.ok) throw new Error(res.error || "Failed to send");
            btn.textContent = "Sent ✓";
            btn.style.color = "#4ade80";
            if(statusEl){
              statusEl.textContent = `"${ct.name}" sent — the client will see it in their portal.`;
              statusEl.style.color = "#4ade80";
              statusEl.classList.remove("hidden");
            }
            const linkToShow = res.inviteLink || res.portalLink;
            if(linkToShow && inviteSectionEl && inviteLinkEl){
              inviteLinkEl.value = linkToShow;
              const titleEl = $("#crmSendInviteTitle");
              const descEl  = $("#crmSendInviteDesc");
              if(res.inviteLink){
                if(titleEl) titleEl.textContent = "Client has no portal access yet";
                if(descEl)  descEl.textContent  = "Share this one-time setup link so they can create their password and view the contract:";
              } else {
                if(titleEl) titleEl.textContent = "Client already has portal access";
                if(descEl)  descEl.textContent  = "Share this portal link so they can log in and view the contract:";
              }
              inviteSectionEl.classList.remove("hidden");
            }
            await loadClientContracts();
          } catch(err){
            btn.textContent = "Send";
            btn.disabled = false;
            if(statusEl){
              statusEl.textContent = err.message || "Failed to send contract";
              statusEl.style.color = "#f87171";
              statusEl.classList.remove("hidden");
            }
          }
        });
        row.appendChild(name);
        row.appendChild(btn);
        pickerList.appendChild(row);
      });
    } catch(err){
      pickerList.innerHTML = '<div class="text-xs" style="color:#f87171;">Failed to load contracts</div>';
    }
  }

  openBtn.addEventListener("click", openModal);
  if(closeBtn) closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if(e.target === modal) closeModal(); });
})();

// ===================== Init =====================
loadConsumers(true, true);
loadTracker();
updatePortalLink();


const companyName = localStorage.getItem("companyName");
if (companyName) {
  $("#navCompany").textContent = companyName;
}

(function initPortalInvite(){
  const btn = $("#btnPortalInvite");
  const modal = $("#portalInviteModal");
  const linkInput = $("#portalInviteLinkInput");
  const copyBtn = $("#portalInviteCopy");
  const closeBtn = $("#portalInviteClose");
  const status = $("#portalInviteStatus");
  if(!btn || !modal) return;

  btn.addEventListener("click", async ()=>{
    if(!currentConsumerId) return;
    btn.disabled = true;
    btn.textContent = "Generating...";
    try {
      const res = await api(`/api/consumers/${currentConsumerId}/portal-invite`, { method: "POST" });
      if(!res?.ok) { showErr(res?.error || "Failed to generate invite link"); return; }
      linkInput.value = res.link;
      modal.classList.remove("hidden");
      modal.classList.add("flex");
      status.style.display = "none";
    } catch(e) {
      showErr("Failed to generate invite link");
    } finally {
      btn.disabled = false;
      btn.innerHTML = "🔗 Portal Invite Link";
    }
  });

  closeBtn.addEventListener("click", ()=>{
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  });
  modal.addEventListener("click", (e)=>{
    if(e.target === modal){ modal.classList.add("hidden"); modal.classList.remove("flex"); }
  });

  copyBtn.addEventListener("click", async ()=>{
    try {
      await navigator.clipboard.writeText(linkInput.value);
      status.style.display = "block";
      copyBtn.textContent = "Copied!";
      setTimeout(()=>{ copyBtn.textContent = "Copy"; status.style.display = "none"; }, 2000);
    } catch(e) {
      linkInput.select();
      document.execCommand("copy");
      status.style.display = "block";
      setTimeout(()=>{ status.style.display = "none"; }, 2000);
    }
  });
})();

// ===================== Collector Address Pre-flight Modal =====================
let _addrLibraryCache = null;

async function loadAddrLibrary() {
  if (_addrLibraryCache) return _addrLibraryCache;
  try {
    const res = await api("/api/settings/collector-addresses");
    const builtIn = (res.builtIn || []).map(e => ({ ...e, _src: 'built-in' }));
    const custom = (res.custom || []).map(e => ({ ...e, _src: 'custom' }));
    _addrLibraryCache = [...custom, ...builtIn];
  } catch {
    _addrLibraryCache = [];
  }
  return _addrLibraryCache;
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPreflightRow(col, rowIdx) {
  return `
    <div class="pf-row" data-row="${rowIdx}" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px 16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:700;color:#e5e5e5;display:flex;align-items:center;gap:6px;">
          <span style="color:#f87171;font-size:10px;letter-spacing:.05em;font-weight:700;padding:2px 5px;background:rgba(239,68,68,0.12);border-radius:4px;">MISSING</span>
          ${escHtml(col.name || 'Unknown Collector')}
        </div>
        <span class="pf-status" data-row="${rowIdx}" style="font-size:11px;color:#888;">Not resolved</span>
      </div>

      <div style="position:relative;margin-bottom:8px;">
        <input class="pf-search" data-row="${rowIdx}" placeholder="Search address library…" autocomplete="off"
          style="width:100%;padding:7px 10px;font-size:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:7px;color:#e5e5e5;box-sizing:border-box;outline:none;" />
        <div class="pf-dropdown" data-row="${rowIdx}"
          style="display:none;position:absolute;top:calc(100% + 2px);left:0;right:0;background:#1a1a1e;border:1px solid rgba(255,255,255,0.1);border-radius:8px;z-index:200;max-height:200px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.5);"></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <input class="pf-addr1" data-row="${rowIdx}" placeholder="Address line 1 *" style="grid-column:1/-1;padding:7px 10px;font-size:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:7px;color:#e5e5e5;outline:none;" />
        <input class="pf-addr2" data-row="${rowIdx}" placeholder="Address line 2 (optional)" style="grid-column:1/-1;padding:7px 10px;font-size:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:7px;color:#e5e5e5;outline:none;" />
        <input class="pf-city" data-row="${rowIdx}" placeholder="City *" style="padding:7px 10px;font-size:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:7px;color:#e5e5e5;outline:none;" />
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <input class="pf-state" data-row="${rowIdx}" placeholder="State *" maxlength="2" style="padding:7px 10px;font-size:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:7px;color:#e5e5e5;outline:none;" />
          <input class="pf-zip" data-row="${rowIdx}" placeholder="ZIP" style="padding:7px 10px;font-size:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:7px;color:#e5e5e5;outline:none;" />
        </div>
      </div>

      <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:#aaa;cursor:pointer;">
        <input type="checkbox" class="pf-save" data-row="${rowIdx}" style="accent-color:#d4a853;" />
        Save this address for this client (auto-fills next time)
      </label>
    </div>`;
}

function updatePreflightGenerateBtn(modal) {
  const rows = [...modal.querySelectorAll('.pf-row')];
  const allResolved = rows.every(row => {
    const ri = row.dataset.row;
    return row.querySelector(`.pf-addr1[data-row="${ri}"]`)?.value?.trim() &&
           row.querySelector(`.pf-city[data-row="${ri}"]`)?.value?.trim() &&
           row.querySelector(`.pf-state[data-row="${ri}"]`)?.value?.trim();
  });
  const genBtn = document.getElementById('addrPreflightGenerate');
  if (genBtn) {
    genBtn.disabled = !allResolved;
    genBtn.style.opacity = allResolved ? '1' : '0.45';
    genBtn.style.cursor = allResolved ? 'pointer' : 'not-allowed';
  }
  const msgEl = document.getElementById('addrPreflightMsg');
  if (msgEl) {
    const done = rows.filter(row => {
      const ri = row.dataset.row;
      return row.querySelector(`.pf-addr1[data-row="${ri}"]`)?.value?.trim() &&
             row.querySelector(`.pf-city[data-row="${ri}"]`)?.value?.trim() &&
             row.querySelector(`.pf-state[data-row="${ri}"]`)?.value?.trim();
    }).length;
    msgEl.textContent = `${done} of ${rows.length} resolved`;
    msgEl.style.color = done === rows.length ? '#4ade80' : '#888';
  }
}

function bindPreflightRow(modal, rowIdx, library) {
  const row = modal.querySelector(`.pf-row[data-row="${rowIdx}"]`);
  if (!row) return;
  const searchInput = row.querySelector(`.pf-search[data-row="${rowIdx}"]`);
  const dropdown = row.querySelector(`.pf-dropdown[data-row="${rowIdx}"]`);
  const addr1 = row.querySelector(`.pf-addr1[data-row="${rowIdx}"]`);
  const addr2 = row.querySelector(`.pf-addr2[data-row="${rowIdx}"]`);
  const city = row.querySelector(`.pf-city[data-row="${rowIdx}"]`);
  const state = row.querySelector(`.pf-state[data-row="${rowIdx}"]`);
  const zip = row.querySelector(`.pf-zip[data-row="${rowIdx}"]`);
  const statusEl = row.querySelector(`.pf-status[data-row="${rowIdx}"]`);

  function fillFromEntry(entry) {
    addr1.value = entry.addr1 || '';
    addr2.value = entry.addr2 || '';
    city.value = entry.city || '';
    state.value = entry.state || '';
    zip.value = entry.zip || '';
    if (statusEl) { statusEl.textContent = '✓ Resolved'; statusEl.style.color = '#4ade80'; }
    dropdown.style.display = 'none';
    searchInput.value = entry.name || '';
    updatePreflightGenerateBtn(modal);
  }

  function onManualInput() {
    const resolved = addr1.value.trim() && city.value.trim() && state.value.trim();
    if (statusEl) { statusEl.textContent = resolved ? '✓ Resolved' : 'Not resolved'; statusEl.style.color = resolved ? '#4ade80' : '#888'; }
    updatePreflightGenerateBtn(modal);
  }

  [addr1, city, state, zip].forEach(el => el?.addEventListener('input', onManualInput));

  searchInput?.addEventListener('input', () => {
    const q = (searchInput.value || '').toLowerCase().trim();
    if (!q) { dropdown.style.display = 'none'; return; }
    const matches = library.filter(e =>
      (e.name || '').toLowerCase().includes(q) ||
      (e.addr1 || '').toLowerCase().includes(q) ||
      (e.city || '').toLowerCase().includes(q)
    ).slice(0, 12);
    if (!matches.length) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map((e, mi) => `
      <div class="pf-lib-item" data-mi="${mi}" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;transition:background .1s;">
        <div style="font-weight:600;color:#e5e5e5;">${escHtml(e.name)}${e._src === 'custom' ? ' <span style="color:#a5b4fc;font-size:10px;">[custom]</span>' : ''}</div>
        <div style="color:#888;font-size:11px;">${escHtml(e.addr1)}${e.addr2 ? ', ' + escHtml(e.addr2) : ''} · ${escHtml([e.city, e.state, e.zip].filter(Boolean).join(', '))}</div>
      </div>`).join('');
    dropdown.style.display = 'block';
    dropdown.querySelectorAll('.pf-lib-item').forEach((item, mi) => {
      item.addEventListener('mouseover', () => { item.style.background = 'rgba(212,168,83,0.08)'; });
      item.addEventListener('mouseout', () => { item.style.background = ''; });
      item.addEventListener('mousedown', ev => { ev.preventDefault(); fillFromEntry(matches[mi]); });
    });
  });

  searchInput?.addEventListener('blur', () => { setTimeout(() => { if (dropdown) dropdown.style.display = 'none'; }, 200); });
}

function openAddrPreflightModal(flagged, enrichedAll, { selections, personalInfo, useOcr }) {
  const modal = document.getElementById('addrPreflightModal');
  const listEl = document.getElementById('addrPreflightList');
  const genBtn = document.getElementById('addrPreflightGenerate');
  const cancelBtn = document.getElementById('addrPreflightCancel');
  const closeBtn = document.getElementById('addrPreflightClose');
  const msgEl = document.getElementById('addrPreflightMsg');
  if (!modal || !listEl) return;

  listEl.innerHTML = '<div style="text-align:center;color:#888;font-size:12px;padding:20px 0;">Loading address library…</div>';
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  if (genBtn) { genBtn.disabled = true; genBtn.style.opacity = '0.45'; genBtn.style.cursor = 'not-allowed'; genBtn.textContent = 'Generate Letters'; genBtn.onclick = null; }
  if (msgEl) { msgEl.textContent = ''; msgEl.style.color = '#888'; }

  let closed = false;
  function closeModal() {
    if (closed) return;
    closed = true;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.removeEventListener('click', onBgClick);
    if (closeBtn) closeBtn.onclick = null;
    if (cancelBtn) cancelBtn.onclick = null;
    if (genBtn) genBtn.onclick = null;
  }
  function onBgClick(e) { if (e.target === modal) closeModal(); }
  modal.addEventListener('click', onBgClick);
  if (closeBtn) closeBtn.onclick = closeModal;
  if (cancelBtn) cancelBtn.onclick = closeModal;

  loadAddrLibrary().then(library => {
    listEl.innerHTML = flagged.map((col, i) => buildPreflightRow(col, i)).join('');
    flagged.forEach((col, i) => {
      bindPreflightRow(modal, i, library);
      const row = listEl.querySelector(`.pf-row[data-row="${i}"]`);
      if (!row) return;
      if (col.addr1 && col.addr1 !== '[Add collector address — required before mailing]') {
        const a1 = row.querySelector(`.pf-addr1[data-row="${i}"]`); if (a1) a1.value = col.addr1;
      }
      if (col.addr2) { const a2 = row.querySelector(`.pf-addr2[data-row="${i}"]`); if (a2) a2.value = col.addr2; }
      if (col.city) { const c = row.querySelector(`.pf-city[data-row="${i}"]`); if (c) c.value = col.city; }
      if (col.state) { const s = row.querySelector(`.pf-state[data-row="${i}"]`); if (s) s.value = col.state; }
      if (col.zip) { const z = row.querySelector(`.pf-zip[data-row="${i}"]`); if (z) z.value = col.zip; }
    });
    updatePreflightGenerateBtn(modal);
  });

  if (genBtn) {
    const handleGenerate = async () => {
      genBtn.disabled = true;
      genBtn.textContent = 'Saving…';
      genBtn.onclick = null;
      if (msgEl) { msgEl.textContent = ''; msgEl.style.color = '#888'; }

      try {
        const resolvedCollectors = (enrichedAll || []).map(c => ({ ...c }));
        const saveTasks = [];
        let saveFailures = 0;

        for (let i = 0; i < flagged.length; i++) {
          const row = listEl.querySelector(`.pf-row[data-row="${i}"]`);
          if (!row) continue;
          const addr1Val = row.querySelector(`.pf-addr1[data-row="${i}"]`)?.value?.trim() || '';
          const addr2Val = row.querySelector(`.pf-addr2[data-row="${i}"]`)?.value?.trim() || '';
          const cityVal = row.querySelector(`.pf-city[data-row="${i}"]`)?.value?.trim() || '';
          const stateVal = row.querySelector(`.pf-state[data-row="${i}"]`)?.value?.trim().toUpperCase() || '';
          const zipVal = row.querySelector(`.pf-zip[data-row="${i}"]`)?.value?.trim() || '';
          const saveChecked = row.querySelector(`.pf-save[data-row="${i}"]`)?.checked;

          const origIdx = flagged[i]._originalIndex ?? i;
          if (resolvedCollectors[origIdx] !== undefined) {
            resolvedCollectors[origIdx] = { ...resolvedCollectors[origIdx], addr1: addr1Val, addr2: addr2Val, city: cityVal, state: stateVal, zip: zipVal };
          }

          if (saveChecked && currentConsumerId && addr1Val && cityVal && stateVal) {
            saveTasks.push(
              api(`/api/consumers/${currentConsumerId}/collector-addresses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: flagged[i].name, addr1: addr1Val, addr2: addr2Val, city: cityVal, state: stateVal, zip: zipVal }),
              }).then(r => { if (!r.ok) saveFailures++; }).catch(() => { saveFailures++; })
            );
          }
        }

        await Promise.all(saveTasks);
        if (saveFailures > 0 && msgEl) {
          msgEl.textContent = `Note: ${saveFailures} address save(s) failed — addresses will still be used for this generation.`;
          msgEl.style.color = '#f59e0b';
          await new Promise(r => setTimeout(r, 2200));
        }
        closeModal();
        await doGenerateLetters(resolvedCollectors, { selections, personalInfo, useOcr });
      } catch (e) {
        if (msgEl) { msgEl.textContent = e.message || String(e); msgEl.style.color = '#f87171'; }
        genBtn.disabled = false;
        genBtn.textContent = 'Generate Letters';
        genBtn.style.opacity = '1';
        genBtn.onclick = handleGenerate;
      }
    };
    genBtn.onclick = handleGenerate;
  }
}
