// public/letters.js
import { api, escapeHtml } from './common.js';
import { setupPageTour } from './tour-guide.js';

function restoreLettersTour(context){
  if(!context || context.restored) return;
  const jobsSection = document.getElementById('jobsSection');
  if(context.showJobs && jobsSection){
    jobsSection.classList.add('hidden');
  }
  context.restored = true;
}

setupPageTour('settings-letters', {
  onBeforeStart: () => {
    const jobsSection = document.getElementById('jobsSection');
    const state = { showJobs: false };
    if(jobsSection && jobsSection.classList.contains('hidden')){
      jobsSection.classList.remove('hidden');
      state.showJobs = true;
    }
    return state;
  },
  onAfterComplete: ({ context }) => restoreLettersTour(context),
  onAfterCancel: ({ context }) => restoreLettersTour(context),
  steps: [
    {
      id: 'letters-nav',
      title: 'Navigation',
      text: `<p class="font-semibold">Move between Letters, Clients, and Billing.</p>
             <p class="mt-1 text-xs text-slate-600">Keep dispute production synced with payments and fulfillment.</p>`,
      attachTo: { element: '#primaryNav', on: 'bottom' }
    },
    {
      id: 'letters-hero',
      title: 'Letter jobs',
      text: `<p class="font-semibold">Review batches, totals, and last run details.</p>
             <p class="mt-1 text-xs text-slate-600">Share KPIs with the team before launching new disputes.</p>`,
      attachTo: { element: '#lettersHero', on: 'top' }
    },
    {
      id: 'letters-search',
      title: 'Find jobs fast',
      text: `<p class="font-semibold">Search by client, job, or ID.</p>
             <p class="mt-1 text-xs text-slate-600">Filter batches before downloading or sending to the portal.</p>`,
      attachTo: { element: '#jobSearch', on: 'bottom' }
    },
    {
      id: 'letters-actions',
      title: 'Fulfillment actions',
      text: `<p class="font-semibold">Download, email, or push letters to the portal.</p>
             <p class="mt-1 text-xs text-slate-600">Bundle concierge mail or certified delivery as an upsell.</p>`,
      attachTo: { element: '#lettersActions', on: 'top' }
    },
    {
      id: 'letters-cards',
      title: 'Letter gallery',
      text: `<p class="font-semibold">Preview individual letters by bureau.</p>
             <p class="mt-1 text-xs text-slate-600">Open the modal to print, email, or export OCR-resistant PDFs.</p>`,
      attachTo: { element: '#cards', on: 'top' }
    }
  ]
});
const $ = (s) => document.querySelector(s);

function showErr(msg){
  const e=$("#err"); e.textContent=msg; e.classList.remove("hidden");
}
function clearErr(){ $("#err").classList.add("hidden"); $("#err").textContent=""; }
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
function hydrateWorkflowNotice(){
  if (typeof sessionStorage === "undefined") return;
  const notice = sessionStorage.getItem("lettersMinIntervalNotice");
  if (!notice) return;
  showWorkflowNotice(notice);
  sessionStorage.removeItem("lettersMinIntervalNotice");
}

hydrateWorkflowNotice();

// Accept /letters?job=ID and /letters/ID
function getJobId(){
  const u = new URL(location.href);
  const qp = u.searchParams.get("job");
  if (qp) return qp;
  const m = location.pathname.match(/\/letters\/([^\/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

let LETTERS = [];          // [{ index, filename, bureau, creditor, htmlUrl }]
let page = 1;
const PER_PAGE = 10;
let lastPreview = null;    // currently previewed letter object
const TOKEN = localStorage.getItem('token');

const jobListEl = $("#jobList");
const jobEmptyEl = $("#jobsEmpty");
const jobErrorEl = $("#jobsError");
const jobSearchInput = $("#jobSearch");
const jobTotalEl = $("#jobTotal");
const jobLettersTotalEl = $("#jobLettersTotal");
const jobLastRunEl = $("#jobLastRun");
const jobSummaryNoteEl = $("#jobSummaryNote");

let JOBS = [];

function formatDateTime(date, locale){
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  } catch (err) {
    return date.toLocaleString(locale);
  }
}

function updateJobsSummary(list){
  const total = JOBS.length;
  if (jobTotalEl) jobTotalEl.textContent = String(list.length);
  if (jobLettersTotalEl) {
    const sum = list.reduce((acc, job) => acc + (Number(job.count) || 0), 0);
    jobLettersTotalEl.textContent = String(sum);
  }
  if (jobLastRunEl) {
    const source = list.length ? list : JOBS;
    const latest = source[0] ? new Date(source[0].createdAt) : null;
    jobLastRunEl.textContent = latest ? formatDateTime(latest, 'en-US') : '—';
  }
  if (jobSummaryNoteEl) {
    jobSummaryNoteEl.textContent = `Showing ${list.length} of ${total} jobs`;
  }
}

function buildJobCard(job){
  const lettersCount = Number(job.count) || 0;
  const lettersLabel = lettersCount === 1 ? 'letter' : 'letters';
  const createdDate = job.createdAt ? new Date(job.createdAt) : null;
  const createdAt = createdDate ? formatDateTime(createdDate, 'en-US') : '—';
  const consumerName = (job.consumerName || '').trim() || job.consumerId || 'Client';
  const consumerIdLine = job.consumerId ? `ID: ${escapeHtml(job.consumerId)}` : 'ID unavailable';
  const article = document.createElement('article');
  article.className = "group relative overflow-hidden rounded-2xl border border-white/40 bg-white/90 p-5 shadow-lg transition hover:-translate-y-1 hover:shadow-2xl";
  article.setAttribute('role', 'link');
  article.setAttribute('tabindex', '0');
  article.innerHTML = `
    <div class="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-indigo-500/5 to-transparent opacity-90 pointer-events-none transition-opacity duration-200 group-hover:opacity-100"></div>
    <div class="relative flex h-full flex-col gap-4">
      <div class="flex items-start justify-between gap-3">
        <div class="space-y-1">
          <p class="text-xs uppercase tracking-wide text-slate-500">Client</p>
          <h3 class="text-lg font-semibold text-slate-900">${escapeHtml(consumerName)}</h3>
          <p class="text-xs text-slate-500">${consumerIdLine}</p>
        </div>
        <span class="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 shadow-sm">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 8l9 6 9-6"></path>
            <path d="M3 16l9 6 9-6"></path>
            <path d="M3 8l9-6 9 6"></path>
          </svg>
          ${lettersCount} ${lettersLabel}
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
        <span class="inline-flex items-center gap-1 text-slate-500">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9"></circle>
            <polyline points="12 7 12 12 15 15"></polyline>
          </svg>
          ${createdAt}
        </span>
      </div>
      <div class="mt-auto flex items-center justify-between gap-3">
        <div class="flex flex-col text-xs text-slate-500">
          <span class="font-semibold text-slate-600">Job ID</span>
          <span class="font-mono text-sm text-slate-700 truncate" title="${escapeHtml(job.jobId)}">${escapeHtml(job.jobId)}</span>
        </div>
        <a class="btn text-sm px-4 py-2" href="/letters?job=${encodeURIComponent(job.jobId)}">Open</a>
      </div>
    </div>
  `;

  const openJob = () => {
    location.href = `/letters?job=${encodeURIComponent(job.jobId)}`;
  };

  article.addEventListener('click', (event)=>{
    if (event.target.closest('a,button,input')) return;
    openJob();
  });
  article.addEventListener('keydown', (event)=>{
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openJob();
    }
  });

  const openBtn = article.querySelector('a');
  if (openBtn) {
    openBtn.addEventListener('click', ()=>{
      if (typeof trackEvent === 'function') {
        trackEvent('letter_job_open', { jobId: job.jobId, letters: lettersCount });
      }
    });
  }

  return article;
}

function renderJobList(){
  if (!jobListEl) return;
  const query = (jobSearchInput?.value || '').trim().toLowerCase();
  const base = JOBS.slice();
  const filtered = query
    ? base.filter((job) => {
        const haystack = [job.consumerName, job.consumerId, job.jobId]
          .filter(Boolean)
          .map((val) => String(val).toLowerCase());
        return haystack.some((val) => val.includes(query));
      })
    : base;

  updateJobsSummary(filtered);
  jobErrorEl?.classList.add('hidden');

  if (!filtered.length) {
    jobListEl.innerHTML = '';
    jobListEl.classList.add('hidden');
    jobEmptyEl?.classList.remove('hidden');
    return;
  }

  jobEmptyEl?.classList.add('hidden');
  jobListEl.classList.remove('hidden');
  jobListEl.innerHTML = '';
  filtered.forEach((job) => {
    jobListEl.appendChild(buildJobCard(job));
  });
}

function showJobsLoading(){
  if (!jobListEl) return;
  jobErrorEl?.classList.add('hidden');
  jobEmptyEl?.classList.add('hidden');
  jobListEl.classList.remove('hidden');
  jobListEl.innerHTML = Array.from({ length: 3 }, () => `
    <div class="animate-pulse rounded-2xl border border-slate-200/70 bg-white/70 p-5 h-40"></div>
  `).join('');
  if (jobTotalEl) jobTotalEl.textContent = '—';
  if (jobLettersTotalEl) jobLettersTotalEl.textContent = '—';
  if (jobLastRunEl) jobLastRunEl.textContent = '—';
  if (jobSummaryNoteEl) jobSummaryNoteEl.textContent = 'Loading jobs…';
}

function paginate(){
  const total = Math.max(1, Math.ceil(LETTERS.length / PER_PAGE));
  if (page > total) page = total;
  const start = (page-1) * PER_PAGE;
  const slice = LETTERS.slice(start, start + PER_PAGE);
  $("#pnum").textContent = String(page);
  $("#ptotal").textContent = String(total);
  $("#count").textContent = `${LETTERS.length} letter(s) • showing ${slice.length} on this page`;
  return slice;
}

function renderCards(){
  const cont = $("#cards");
  cont.innerHTML = "";
  const items = paginate();
  if (!items.length) {
    cont.innerHTML = `<div class="muted">No letters found for this job.</div>`;
    return;
  }
  items.forEach((L) => {
    const div = document.createElement("div");
    div.className = "glass card tl-card w-full";
    div.innerHTML = `
      <div class="flex items-start justify-between">
        <div>
          <div class="font-semibold">${escapeHtml(L.creditor || "Unknown Creditor")}</div>
          <div class="text-sm muted">${escapeHtml(L.bureau)}</div>
        </div>
        <div class="flex flex-wrap gap-2 justify-end">
          <a class="btn text-xs open-html" href="${L.htmlUrl}" target="_blank" data-tip="Open HTML (H)">Open HTML</a>
          <a class="btn text-xs" href="/api/letters/${encodeURIComponent(JOB_ID)}/${L.index}.pdf${TOKEN ? `?token=${encodeURIComponent(TOKEN)}` : ''}" data-tip="Download PDF">Download PDF</a>
          <button class="btn text-xs do-print" data-tip="Print (P)">Print</button>
        </div>
      </div>
      <div class="text-xs muted mt-1">#${L.index+1}</div>
    `;

    div.querySelector(".do-print").addEventListener("click", async (e)=>{
      e.stopPropagation();
      await printLetter(L);
    });

    div.addEventListener("click", (e)=>{
      if (e.target.closest("a,button")) return;
      openPreview(L);
    });

    cont.appendChild(div);
  });
}

function openPreview(L){
  lastPreview = L;
  $("#pvTitle").textContent = L.creditor || "Letter";
  $("#pvMeta").textContent  = `${L.bureau}`;
  $("#pvOpen").href = L.htmlUrl;
  $("#pvFrame").src = L.htmlUrl;
  $("#previewModal").style.display = "flex";
  document.body.style.overflow = "hidden";
}
function closePreview(){
  $("#previewModal").style.display = "none";
  $("#pvFrame").src = "about:blank";
  document.body.style.overflow = "";
}
$("#pvClose").addEventListener("click", closePreview);
$("#previewModal").addEventListener("click", (e)=>{ if(e.target.id==="previewModal") closePreview(); });

$("#pvOpen").setAttribute("data-tip", "Open HTML (H)");
$("#pvPrint").setAttribute("data-tip", "Print (P)");
$("#btnBack").setAttribute("data-tip", "Back to CRM");

// Print from preview modal
$("#pvPrint").addEventListener("click", ()=>{
  const ifr = $("#pvFrame");
  if (!ifr || !ifr.contentWindow) return;
  ifr.contentWindow.focus();
  ifr.contentWindow.print();
});

// Direct print helper
async function printLetter(L){
  const ifr = document.createElement("iframe");
  ifr.style.position = "fixed";
  ifr.style.right = "0";
  ifr.style.bottom = "0";
  ifr.style.width = "0";
  ifr.style.height = "0";
  ifr.style.border = "0";
  document.body.appendChild(ifr);

  await new Promise((resolve) => {
    ifr.onload = resolve;
    ifr.src = L.htmlUrl;
  });

  try {
    ifr.contentWindow.focus();
    ifr.contentWindow.print();
    trackEvent('letter_generated', { jobId: JOB_ID, index: L.index });
  } finally {
    setTimeout(()=> document.body.removeChild(ifr), 1000);
  }
}

// paging
$("#prev").addEventListener("click", ()=>{ if (page>1){ page--; renderCards(); }});
$("#next").addEventListener("click", ()=>{
  const total = Math.max(1, Math.ceil(LETTERS.length / PER_PAGE));
  if (page < total){ page++; renderCards(); }
});

// back
$("#btnBack").addEventListener("click", ()=>{ location.href = "/"; });

$("#btnDownloadAll").addEventListener("click", async ()=>{
  if (!JOB_ID) return;
  const btn = $("#btnDownloadAll");
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Preparing...";
  try {
    const tokenParam = TOKEN ? `?token=${encodeURIComponent(TOKEN)}` : '';
    const resp = await fetch(`/api/letters/${encodeURIComponent(JOB_ID)}/all.zip${tokenParam}`);
    if(!resp.ok) throw new Error("Failed to download zip");
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `letters_${JOB_ID}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 1000);
    trackEvent('letters_download_all', { jobId: JOB_ID, count: LETTERS.length });
  } catch(e){ showErr(e.message || String(e)); }
  finally {
    btn.disabled = false;
    btn.textContent = old;
  }
});

$("#btnPortalAll").addEventListener("click", async ()=>{
  if(!JOB_ID) return;
  const btn = $("#btnPortalAll");
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Sending...";
  try{
    const data = await api(`/api/letters/${encodeURIComponent(JOB_ID)}/portal`, { method:"POST" });
    if(!data?.ok) throw new Error(data?.error || "Failed to send to portal.");
    alert("Letters sent to client portal.");
  }catch(e){ showErr(e.message || String(e)); }
  finally {
    btn.disabled = false;
    btn.textContent = old;
  }

});



$("#btnEmailAll").addEventListener("click", async ()=>{
  if (!JOB_ID) return;
  const to = prompt("Send to which email?");
  if (!to) return;
  const btn = $("#btnEmailAll");
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Sending...";
  try{
    const data = await api(`/api/letters/${encodeURIComponent(JOB_ID)}/email`, {
      method: 'POST',
      body: JSON.stringify({ to })
    });
    if(!data?.ok) throw new Error(data?.error || "Failed to email letters.");
    alert("Letters emailed.");
  }catch(e){ showErr(e.message || String(e)); }
  finally {
    btn.disabled = false;
    btn.textContent = old;
  }
});

async function loadJobs(){
  if (!jobListEl) return;
  showJobsLoading();
  try {
    const resp = await api('/api/letters');
    JOBS = (resp.jobs || [])
      .map((job) => ({ ...job }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    renderJobList();
    if (typeof trackEvent === 'function') {
      trackEvent('letter_jobs_loaded', { count: JOBS.length });
    }
  } catch (e) {
    JOBS = [];
    if (jobListEl) {
      jobListEl.innerHTML = '';
      jobListEl.classList.add('hidden');
    }
    jobEmptyEl?.classList.add('hidden');
    if (jobErrorEl) {
      const msg = e?.message || String(e || 'Unknown error');
      jobErrorEl.textContent = `Failed to load letter jobs. Please refresh or try again. (${msg})`;
      jobErrorEl.classList.remove('hidden');
    }
    updateJobsSummary([]);
  }
}

async function waitForJobCompletion(jobId, { timeoutMs = 120000, intervalMs = 1500 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const statusResp = await api(`/api/jobs/${encodeURIComponent(jobId)}`);
    const status = statusResp?.job?.status;
    if (status === 'completed') {
      return statusResp.job;
    }
    if (status === 'failed') {
      const message = statusResp.job?.error?.message || 'Job failed';
      throw new Error(message);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Job timed out before completion.');
}

async function loadLetters(jobId){
  clearErr();
  $("#jobId").textContent = jobId || "—";
  try {
    const resp = await api(`/api/letters/${encodeURIComponent(jobId)}`);
    if (resp?.status === 202) {
      await waitForJobCompletion(jobId);
      return loadLetters(jobId);
    }
    if (!resp?.ok) throw new Error(resp?.error || "Failed to load letters for this job.");
    const tokenParam = TOKEN ? `?token=${encodeURIComponent(TOKEN)}` : '';
    LETTERS = (resp.letters || []).map((x) => ({
      index: x.index,
      filename: x.filename,
      bureau: x.bureau,
      creditor: x.creditor,
      htmlUrl: `/api/letters/${encodeURIComponent(jobId)}/${x.index}.html${tokenParam}`
    }));
    page = 1;
    renderCards();
  } catch (e) {
    showErr(e.message || String(e));
  }
}

const JOB_ID = getJobId();
if (!JOB_ID) {
  $("#lettersSection").classList.add('hidden');
  $("#jobsSection").classList.remove('hidden');
  loadJobs();
  if (jobSearchInput){
    const handleSearch = () => {
      renderJobList();
      if (typeof trackEvent === 'function') {
        trackEvent('letter_jobs_search', { queryLength: jobSearchInput.value.trim().length });
      }
    };
    jobSearchInput.addEventListener('input', handleSearch);
    jobSearchInput.addEventListener('search', renderJobList);
    jobSearchInput.addEventListener('keydown', (e)=>{
      if (e.key === 'Escape'){
        jobSearchInput.value = '';
        renderJobList();
      }
    });
  }
} else {
  $("#jobsSection").classList.add('hidden');
  loadLetters(JOB_ID);
}

// Hotkeys on letters page: P = print (preview/first), H = open HTML (preview/first)
document.addEventListener("keydown", (e)=>{
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;

  const k = e.key.toLowerCase();

  if (k === "p"){
    e.preventDefault();
    if (lastPreview){
      const ifr = $("#pvFrame");
      if (ifr && ifr.contentWindow){
        ifr.contentWindow.focus();
        ifr.contentWindow.print();
        return;
      }
    }
    const first = paginate()[0];
    if (first) printLetter(first);
  }

  if (k === "h"){
    e.preventDefault();
    if (lastPreview){
      window.open(lastPreview.htmlUrl, "_blank");
      return;
    }
    const first = paginate()[0];
    if (first) window.open(first.htmlUrl, "_blank");
  }
});
