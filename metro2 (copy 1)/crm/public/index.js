/* public/index.js */

import { PLAYBOOKS } from './playbooks.js';
import { authHeader, api, escapeHtml, formatCurrency } from './common.js';

const $ = (s) => document.querySelector(s);

const role = typeof window !== 'undefined' ? (window.userRole || 'host') : 'host';
if (typeof window !== 'undefined' && role === 'client') {
  window.location.href = '/client-portal-template.html';
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

let trackerSteps = [];

let consumerFiles = [];

let metro2Violations = [];
function renderReasonOptions(filter=""){
  const sel = $("#tlReasonSelect");
  if(!sel) return;
  const f = filter.toLowerCase();
  const opts = metro2Violations.filter(r => r.toLowerCase().includes(f));
  sel.innerHTML = '<option value="">Select reason</option>' +
    opts.map(r => `<option value="${r}">${r}</option>`).join('');
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
    const res = await fetch('/api/templates');
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
      a.href = `/portal/${currentConsumerId}`;
      a.classList.remove("hidden");
    } else {
      a.href = "#";
      a.classList.add("hidden");
    }
  });
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
function formatEvent(ev){
  const when = new Date(ev.at).toLocaleString();
  let title = escapeHtml(ev.type);
  let body = "";
  if(ev.type === "letters_generated"){
    const { count, requestType, tradelines, inquiries = 0, collectors = 0 } = ev.payload || {};
    title = "Letters generated";
    const inqPart = inquiries ? ` and ${escapeHtml(inquiries)} inquiry${inquiries===1?"":"s"}` : "";
    const colPart = collectors ? ` and ${escapeHtml(collectors)} collector${collectors===1?"":"s"}` : "";
    body = `<div class="text-xs mt-1">Generated ${escapeHtml(count)} letter${count===1?"":"s"} (${escapeHtml(requestType||"")}) for ${escapeHtml(tradelines)} tradeline${tradelines===1?"":"s"}${inqPart}${colPart}.</div>`;

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

async function loadConsumers(restore = true){
  clearErr();
  const data = await api("/api/consumers");
  if (data.status === 401) {
    alert('Please log in');
    localStorage.removeItem('token');
    localStorage.removeItem('auth');
    location.href = '/login.html';
    return;
  }
  if (data.status === 403 || data.error === 'Forbidden') {
    alert('Forbidden / ask admin for access');
    return;
  }
  if (data.ok === false || !data.consumers) {
    showErr(data.error || 'Could not load consumers.');
    return;
  }
  DB = data.consumers;
  renderConsumers();
  if (restore) restoreSelectedConsumer();
}
function renderConsumers(){
  const wrap = $("#consumerList");
  wrap.innerHTML = "";
  const tpl = $("#consumerItem").content;

  currentPageItems().forEach(c=>{
    const n = tpl.cloneNode(true);
    n.querySelector(".name").textContent = c.name || "(no name)";
    n.querySelector(".email").textContent = c.email || "";
    const card = n.querySelector(".consumer-card");
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
        updatePortalLink();
        setSelectedConsumerId(null);

      }
      loadConsumers();
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
   setSelectedConsumerId(id);

  updatePortalLink();
  await refreshReports();
  await loadConsumerState();
  await loadMessages();
  await loadTracker();
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
    opt.textContent = `${r.filename} (${r.summary.tradelines} TL) • ${new Date(r.uploadedAt).toLocaleString()}`;
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
  if(currentConsumerId){
    trackerSteps.forEach(step=>{
      const cb = document.querySelector(`#trackerSteps input[data-step="${step}"]`);
      if(cb) cb.checked = !!trackerData[currentConsumerId][step];
    });
  }
}
async function saveTracker(){
  if(!currentConsumerId) return;
  const completed = {};
  trackerSteps.forEach(step=>{
    const cb = document.querySelector(`#trackerSteps input[data-step="${step}"]`);
    if(cb) completed[step] = cb.checked;
  });
  trackerData[currentConsumerId] = completed;
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
  if(trackerSteps.length === 0){
    wrap.innerHTML = '<div class="muted">No steps yet. Add one below.</div>';
    return;
  }

  trackerSteps.forEach((step,i)=>{
    const div = document.createElement("div");
    div.className = "flex items-center gap-1 step-item";
    div.innerHTML = `<label class="flex items-center gap-2"><input type="checkbox" data-step="${step}" /> <span>${step}</span></label><button class="remove-step" data-index="${i}" aria-label="Remove step">&times;</button>`;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll("input[type=checkbox]").forEach(cb=>{
    cb.addEventListener("change", toggleTracker);
  });
  wrap.querySelectorAll(".remove-step").forEach(btn=>{
    btn.addEventListener("click", async e=>{
      const idx = parseInt(e.target.dataset.index);
      const removed = trackerSteps.splice(idx,1)[0];
      Object.values(trackerData).forEach(obj=>{ delete obj[removed]; });
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
  renderFilterBar();
  renderTradelines(CURRENT_REPORT.tradelines);
  renderCollectors(CURRENT_REPORT.creditor_contacts || []);

}

// ===================== Filters (unchanged) =====================
const ALL_TAGS = ["Collections","Late Payments","Charge-Off","Student Loans","Medical Bills","Other"];
const activeFilters = new Set();
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

export function dedupeTradelines(lines){
  const seen = new Map();
  const result = [];
  (lines || []).forEach(tl => {
    const name = (tl.meta?.creditor || "").trim();
    if (!name) return;
    const per = tl.per_bureau || {};
    const hasData = ["TransUnion","Experian","Equifax"].some(b => Object.keys(per[b] || {}).length);
    const hasViolations = (tl.violations || []).length > 0;
    if (!hasData && !hasViolations) return;
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
    const normalizedNumbers = [...bureauNumbers, ...metaNumbers]
      .map(n => String(n).trim().toUpperCase())
      .filter(n => n.length > 0);
    const uniqueNumbers = Array.from(new Set(normalizedNumbers)).sort();

    if (!uniqueNumbers.length) {
      result.push(tl);
      return;
    }

    const key = `${name}|${uniqueNumbers.join('|')}`;
    if (seen.has(key)) {
      const idx = seen.get(key);
      const existing = result[idx];
      result[idx] = mergeTradeline(existing, tl);
    } else {
      seen.set(key, result.length);
      result.push(tl);
    }
  });
  return result;
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
  return Array.from(tags).map(t => t.trim());
}

function renderFilterBar(){
  const bar = $("#filterBar");
  bar.innerHTML = "";
  ALL_TAGS.forEach(tag=>{
    const btn = document.createElement("button");
    btn.className = "chip" + (activeFilters.has(tag) ? " active":"");
    btn.textContent = tag;
    btn.addEventListener("click", ()=>{
      if (activeFilters.has(tag)) activeFilters.delete(tag); else activeFilters.add(tag);
      tlPage = 1;
      renderFilterBar();
      renderTradelines(CURRENT_REPORT?.tradelines || []);
    });
    bar.appendChild(btn);
  });
  $("#btnClearFilters").onclick = () => {
    activeFilters.clear();
    tlPage = 1;
    renderFilterBar();
    renderTradelines(CURRENT_REPORT?.tradelines || []);
  };
}
function passesFilter(tags){ if (activeFilters.size === 0) return true; return tags.some(t => activeFilters.has(t)); }

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
    btnNeg.textContent = allNegSelected ? "Deselect Negative" : "Select Negative";
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

function autoSelectBestViolation(card){
  const idx = Number(card.dataset.index);
  const tl = CURRENT_REPORT?.tradelines?.[idx];
  if (!tl) return;
  const vs = normalizeViolations(tl.violations || []);
  if (!vs.length) return;
  let bestIdx = 0;
  let bestSeverity = -Infinity;
  vs.forEach((v,i)=>{
    const sev = v.severity || 0;
    if (sev > bestSeverity){
      bestSeverity = sev;
      bestIdx = i;
    }
  });
  card.querySelectorAll('.violation').forEach(cb => {
    cb.checked = Number(cb.value) === bestIdx;
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
    // displayed generic violations like "Missing Date of First Delinquency".
    // Filtering these out up front keeps the visible list focused on usable
    // tradelines.
    const pb = tl.per_bureau || {};
    const hasBureauData = ["TransUnion","Experian","Equifax"]
      .some(b => Object.keys(pb[b] || {}).length);
    const hasAcct = Object.values(pb).some(b => b?.account_number);
    const hasVios = (tl.violations || []).length > 0;
    if (!hasBureauData && !hasAcct && !hasVios) return;


    const tags = deriveTags(tl);
    if (!passesFilter(tags)) return;
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
      countEl.className = 'text-xs muted mt-1';
      vWrap.parentNode.insertBefore(countEl, vWrap);
    }
    function renderViolations(){
      if(!vs.length){
        vWrap.innerHTML = `<div class="text-sm muted">No auto-detected violations for this tradeline.</div>`;
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
      countEl.textContent = `Showing ${vStart + 1}-${end} of ${vs.length} violation${vs.length===1?"":"s"}`;
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
    container.innerHTML = `<div class="muted">No tradelines match the current filters.</div>`;
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
  const get = (k) => pb?.[k] ?? pb?.[`${k}_raw`];
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
        ${row("date_last_payment","Date Last Payment")}
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

$("#btnGenerate").addEventListener("click", async ()=>{
  clearErr();
  try{
    if(!currentConsumerId || !currentReportId) throw new Error("Select a consumer and a report first.");
    const selections = collectSelections();
    const includePI = $("#cbPersonalInfo").checked;
    const includeCol = $("#cbCollectors").checked;
    const colSelections = includeCol ? collectCollectorSelections() : [];
    if(!selections.length && !includePI && !colSelections.length) throw new Error("Pick at least one tradeline, collector, or select Personal Info.");
    const resp = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type":"application/json", ...authHeader() },
      body: JSON.stringify({
        consumerId: currentConsumerId,
        reportId: currentReportId,
        selections,
        personalInfo: includePI,
        collectors: colSelections,
        useOcr: ocrCb?.checked || false,
      })

    });
    if(!resp.ok){
      const txt = await resp.text().catch(()=> "");
      throw new Error(`HTTP ${resp.status} ${txt || ""}`.trim());
    }
    const data = await resp.json().catch(()=> ({}));
    if(!data?.ok || !data?.redirect) throw new Error(data?.error || "Server did not return a redirect.");
    window.location.assign(data.redirect);
    setTimeout(()=>{
      if (!/\/letters(\?|$)/.test(location.href)) window.location.href = data.redirect;
    }, 120);
  }catch(e){
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
  await loadConsumers(false);
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
  await loadConsumers(false);
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
$("#btnUpload").addEventListener("click", ()=>{
  if(!currentConsumerId) return showErr("Select a consumer first.");
  $("#fileInput").value = "";
  $("#fileInput").click();
});
$("#fileInput").addEventListener("change", async (e)=>{
  clearErr();
  const file = e.target.files?.[0];
  if(!file) return;
  const btn = $("#btnUpload");
  const old = btn.textContent;
  btn.textContent = "Uploading…";
  btn.disabled = true;

  try{
    const fd = new FormData();
    fd.append("file", file, file.name);
    const res = await fetch(`/api/consumers/${currentConsumerId}/upload`, {
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
  }catch(err){
    showErr(String(err));
  }finally{
    btn.textContent = old;
    btn.disabled = false;
  }
});

// Data breach lookup
$("#btnDataBreach").addEventListener("click", async ()=>{
  if(!currentConsumerId) return showErr("Select a consumer first.");
  const c = DB.find(x=>x.id===currentConsumerId);
  if(!c?.email) return showErr("Selected consumer has no email.");
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
    const body = $("#breachBody");
    const content = list.length
      ? `<p>${escapeHtml(c.email)} found in:</p><ul>${list.map(b=>`<li>${escapeHtml(b.Name || b.name || "unknown")}</li>`).join("")}</ul>`
      : `<p>No breaches found for ${escapeHtml(c.email)}.</p>`;
    body.innerHTML = content;
    const modal = $("#breachModal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }catch(err){
    showErr(String(err));
  }finally{
    btn.textContent = old;
    btn.disabled = false;
  }
});

// Data breach modal handlers
$("#breachClose").addEventListener("click", ()=>{
  const m = $("#breachModal");
  m.classList.add("hidden");
  m.classList.remove("flex");
});

$("#breachSend").addEventListener("click", async ()=>{
  if(!currentConsumerId) return showErr("Select a consumer first.");
  const btn = $("#breachSend");
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Generating...";
  try{
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
    const res = await fetch(`/api/consumers/${currentConsumerId}/report/${currentReportId}/audit`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    }).then(r=>r.json());
    if(!res?.ok) return showErr(res?.error || "Failed to run audit.");
    if(res.url) window.open(res.url, "_blank");
    if(res.warning) showErr(res.warning);
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
  const files = resp.state?.files || [];
  consumerFiles = files;

  const list = [];

  if (files.length){
    list.push(`<div class="font-medium mb-1">Files</div>`);
    files.forEach(f=>{
      list.push(`
        <div class="glass card flex items-center justify-between p-2">
          <div class="wrap-anywhere">
            <div>${escapeHtml(f.originalName)}</div>
            <div class="text-xs muted">${(f.mimetype||"").split("/").pop() || ""} • ${(f.size/1024).toFixed(1)} KB • ${new Date(f.uploadedAt).toLocaleString()}</div>
          </div>
          <a class="btn text-sm" href="/api/consumers/${currentConsumerId}/state/files/${encodeURIComponent(f.storedName)}" target="_blank">Open</a>
        </div>
      `);
    });
  }

  list.push(`<div class="font-medium mt-2 mb-1">Activity</div>`);
  if (!events.length){
    list.push(`<div class="muted">No recent events.</div>`);
  } else {
    events.forEach(ev=>{ list.push(formatEvent(ev)); });
  }
  $("#activityList").innerHTML = list.join("");
}

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

// ===================== Init =====================
loadConsumers();
loadTracker();
updatePortalLink();

const companyName = localStorage.getItem("companyName");
if (companyName) {
  $("#navCompany").textContent = companyName;
}

