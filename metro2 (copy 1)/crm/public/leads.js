import { setupPageTour } from './tour-guide.js';

setupPageTour('leads', {
  steps: [
    {
      id: 'leads-nav',
      title: 'Route every lead fast',
      text: `<p class="font-semibold">Use the global nav to bounce between revenue tabs.</p>
             <p class="mt-1 text-xs text-slate-600">Dashboard shows KPIs, Billing closes payments, and Marketing keeps nurture sequences tight.</p>`,
      attachTo: { element: '#primaryNav', on: 'bottom' }
    },
    {
      id: 'leads-metrics',
      title: 'Monitor lead health',
      text: `<p class="font-semibold">Watch totals, win rate, and pipeline momentum.</p>
             <p class="mt-1 text-xs text-slate-600">Share these stats on morning huddles to align sales and fulfillment.</p>`,
      attachTo: { element: '#leadMetrics', on: 'top' }
    },
    {
      id: 'leads-pipeline',
      title: 'Work the pipeline board',
      text: `<p class="font-semibold">Drag every conversation through NEPQ stages.</p>
             <p class="mt-1 text-xs text-slate-600">Use the Refresh button after campaigns to sync new activity.</p>`,
      attachTo: { element: '#pipelineBoard', on: 'top' }
    },
    {
      id: 'leads-intake',
      title: 'Intake with compliance first',
      text: `<p class="font-semibold">Capture source, stage, and address before the consult.</p>
             <p class="mt-1 text-xs text-slate-600">Log facts only—no promises of score jumps or timelines.</p>`,
      attachTo: { element: '#leadForm', on: 'left' }
    },
    {
      id: 'leads-followup',
      title: 'Prioritize follow-ups',
      text: `<p class="font-semibold">Lean on the radar to call hot leads first.</p>
             <p class="mt-1 text-xs text-slate-600">Pair it with Source Mix to decide which campaigns deserve more ad spend.</p>`,
      attachTo: { element: '#leadFollowupCard', on: 'left' }
    }
  ]
});
const PIPELINE_STAGES = [
  {
    id: 'new',
    label: 'New',
    description: 'Inbound leads awaiting first touch.',
    empty: 'No new leads. Launch a promo or import a list to fill the top of funnel.'
  },
  {
    id: 'working',
    label: 'Working',
    description: 'Discovery underway and touchpoints scheduled.',
    empty: 'Move hot conversations here after the first NEPQ call.'
  },
  {
    id: 'qualified',
    label: 'Qualified',
    description: 'Ready for proposal, docs, and payment link.',
    empty: 'Qualify prospects before sending dispute workflows.'
  },
  {
    id: 'nurture',
    label: 'Nurture',
    description: 'Long-term follow up or cooling-off period.',
    empty: 'Drop stalled prospects into nurture automations.'
  },
  {
    id: 'won',
    label: 'Won',
    description: 'Signed clients—kick off onboarding immediately.',
    empty: 'Celebrate wins and drop in onboarding sequences.'
  },
  {
    id: 'lost',
    label: 'Lost',
    description: 'Not a fit or unresponsive—log the reason.',
    empty: 'Keep this clean to measure reactivation wins.'
  }
];

const STAGE_META = {
  new: {
    label: 'New',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-700',
    nextAction: 'Send welcome SMS and book the consult.',
    highlightThreshold: 1
  },
  working: {
    label: 'Working',
    badgeClass: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    nextAction: 'Confirm docs, recap pain, and schedule the close.',
    highlightThreshold: 2
  },
  qualified: {
    label: 'Qualified',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
    nextAction: 'Deliver proposal + Stripe Checkout link.',
    highlightThreshold: 3
  },
  nurture: {
    label: 'Nurture',
    badgeClass: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    nextAction: 'Drip value emails and invite to webinar.',
    highlightThreshold: 5
  },
  won: {
    label: 'Won',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    nextAction: 'Kick off onboarding tasks + welcome kit.',
    highlightThreshold: Number.POSITIVE_INFINITY
  },
  lost: {
    label: 'Lost',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
    nextAction: 'Tag loss reason and drop into reactivation sequence.',
    highlightThreshold: Number.POSITIVE_INFINITY
  }
};

const VALID_STAGE_IDS = new Set(PIPELINE_STAGES.map(stage => stage.id));

const state = {
  leads: [],
  filterSource: 'all'
};

const pipelineBoard = document.getElementById('pipelineBoard');
const columnRefs = new Map();

function setLeadFormDirtyState(form, value){
  if(!form) return;
  form.dataset.dirty = value ? 'true' : 'false';
}

function isLeadFormDirty(form){
  return form?.dataset?.dirty === 'true';
}

function highlightLeadForm(form){
  if(!form) return;
  form.classList.add('ring-2', 'ring-offset-2', 'ring-emerald-400');
  if(form.__hotkeyHighlightTimer){
    clearTimeout(form.__hotkeyHighlightTimer);
  }
  form.__hotkeyHighlightTimer = setTimeout(() => {
    form.classList.remove('ring-2', 'ring-offset-2', 'ring-emerald-400');
    form.__hotkeyHighlightTimer = undefined;
  }, 1500);
}

function initPipelineBoard(){
  if(!pipelineBoard) return;
  pipelineBoard.innerHTML = '';
  columnRefs.clear();
  PIPELINE_STAGES.forEach(stage => {
    const column = document.createElement('div');
    column.className = 'lead-column glass card';
    column.dataset.stage = stage.id;
    column.innerHTML = `
      <div class="lead-column__header">
        <div>
          <span class="lead-column__eyebrow">Stage</span>
          <h3 class="lead-column__title">${stage.label}</h3>
          <p class="lead-column__subtitle">${stage.description}</p>
        </div>
        <span class="lead-column__count" data-stage-count="${stage.id}">0</span>
      </div>
      <div class="lead-column__body" data-stage-list="${stage.id}"></div>
    `;
    const list = column.querySelector('[data-stage-list]');
    pipelineBoard.appendChild(column);
    columnRefs.set(stage.id, list);
  });
}

initPipelineBoard();

function mapStatus(value){
  const normalized = (value ?? '').toString().trim().toLowerCase();
  if(VALID_STAGE_IDS.has(normalized)) return normalized;
  if(normalized === 'completed' || normalized === 'converted') return 'won';
  if(normalized === 'dropped' || normalized === 'abandoned' || normalized === 'lost') return 'lost';
  if(normalized === 'active') return 'working';
  if(normalized === 'followup' || normalized === 'follow-up') return 'nurture';
  if(normalized === 'prospect') return 'qualified';
  return 'new';
}

function parseDate(value){
  if(!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRelativeTime(value){
  const date = parseDate(value);
  if(!date) return 'No activity yet';
  const diffMs = Date.now() - date.getTime();
  if(diffMs < 0) return 'Scheduled';
  const minutes = Math.floor(diffMs / 60000);
  if(minutes < 1) return 'Just now';
  if(minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if(hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if(days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if(months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function formatDateDisplay(value){
  const date = parseDate(value);
  if(!date) return 'Unknown';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function differenceInDaysFromNow(value){
  const date = parseDate(value);
  if(!date) return 0;
  const diffMs = Date.now() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function normalizeLead(raw){
  const name = (raw.name || '').trim();
  const email = (raw.email || '').trim();
  const phone = (raw.phone || '').trim();
  const source = (raw.source || '').trim();
  const notes = (raw.notes || '').trim();
  const addr1 = (raw.addr1 || '').trim();
  const addr2 = (raw.addr2 || '').trim();
  const city = (raw.city || '').trim();
  const state = (raw.state || '').trim();
  const zip = (raw.zip || '').trim();
  const createdAt = parseDate(raw.createdAt)?.toISOString() ?? new Date().toISOString();
  const updatedAt = parseDate(raw.updatedAt)?.toISOString() ?? createdAt;
  const locationSummary = [city, state].filter(Boolean).join(', ');
  const addressLines = [addr1, addr2].filter(Boolean).join(', ');
  const addressSummary = [addressLines, locationSummary, zip].filter(Boolean).join(' • ');
  return {
    ...raw,
    name,
    email,
    phone,
    notes,
    source,
    sourceLabel: source || 'Unknown',
    displayName: name || 'Unnamed Lead',
    addr1,
    addr2,
    city,
    state,
    zip,
    locationSummary,
    addressSummary,
    status: mapStatus(raw.status),
    createdAt,
    updatedAt
  };
}

function setText(id, value){
  const el = document.getElementById(id);
  if(el) el.textContent = value;
}

function getFilteredLeads(){
  if(state.filterSource === 'all') return [...state.leads];
  return state.leads.filter(lead => lead.sourceLabel === state.filterSource);
}

function renderMetrics(){
  const total = state.leads.length;
  const newThisWeek = state.leads.filter(lead => differenceInDaysFromNow(lead.createdAt) <= 7).length;
  const active = state.leads.filter(lead => !['won', 'lost'].includes(lead.status)).length;
  const won = state.leads.filter(lead => lead.status === 'won').length;
  const winRate = total > 0 ? Math.round((won / total) * 100) : 0;

  const formatNumber = value => (Number.isFinite(value) ? value.toLocaleString() : '0');

  setText('leadTotalCount', formatNumber(total));
  setText('leadNewCount', formatNumber(newThisWeek));
  setText('leadActiveCount', formatNumber(active));
  setText('leadWinRate', `${winRate}%`);
  setText('leadActiveBadge', formatNumber(active));
  setText('leadNewBadge', formatNumber(newThisWeek));
  setText('leadWinRateBadge', `${winRate}%`);
  setText('leadWinRateBadgeSecondary', `${winRate}%`);
}

function renderSourceFilter(){
  const select = document.getElementById('leadSourceFilter');
  if(!select) return;
  const sources = Array.from(new Set(state.leads.map(lead => lead.sourceLabel))).filter(Boolean).sort((a,b)=>a.localeCompare(b));
  const previous = state.filterSource;
  select.innerHTML = '<option value="all">All sources</option>' + sources.map(src => `<option value="${src}">${src}</option>`).join('');
  if(previous !== 'all' && !sources.includes(previous)){
    state.filterSource = 'all';
  }
  select.value = state.filterSource;
}

function renderSourceBreakdown(){
  const container = document.getElementById('leadSourceBreakdown');
  if(!container) return;
  container.innerHTML = '';
  const leadsForBreakdown = state.filterSource === 'all' ? state.leads : getFilteredLeads();
  if(leadsForBreakdown.length === 0){
    const empty = document.createElement('div');
    empty.className = 'lead-source-empty';
    empty.innerHTML = 'No leads yet.<br><span class="lead-source-empty__hint">Sin datos todavía.</span>';
    container.appendChild(empty);
    return;
  }
  const counts = new Map();
  leadsForBreakdown.forEach(lead => {
    const key = lead.sourceLabel || 'Unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const total = leadsForBreakdown.length;
  Array.from(counts.entries())
    .sort((a,b)=>b[1]-a[1])
    .slice(0,6)
    .forEach(([source, count], index) => {
      const percent = Math.round((count / total) * 100);
      const row = document.createElement('div');
      row.className = 'lead-source-row';
      row.innerHTML = `
        <div class="lead-source-row__meta">
          <span>${index === 0 ? '⭐ ' : ''}${source}</span>
          <span>${count} • ${percent}%</span>
        </div>
        <div class="lead-source-row__bar">
          <span style="width:${Math.max(percent, 6)}%;"></span>
        </div>
      `;
      container.appendChild(row);
    });
}

function renderHighlights(){
  const list = document.getElementById('leadHighlights');
  if(!list) return;
  list.innerHTML = '';
  const active = state.leads.filter(lead => !['won','lost'].includes(lead.status));
  const stale = active
    .map(lead => ({
      lead,
      idleDays: differenceInDaysFromNow(lead.updatedAt)
    }))
    .filter(item => item.idleDays >= (STAGE_META[item.lead.status]?.highlightThreshold ?? 2))
    .sort((a,b)=>b.idleDays - a.idleDays)
    .slice(0,3);

  if(stale.length === 0){
    const li = document.createElement('li');
    li.className = 'lead-highlight lead-highlight--empty';
    li.innerHTML = `
      <p>No stalled leads. Keep nurturing daily.</p>
      <p class="lead-highlight__hint">Sin leads estancados. Sigue nutriendo diariamente.</p>
    `;
    list.appendChild(li);
    return;
  }

  stale.forEach(({ lead, idleDays }) => {
    const stageInfo = STAGE_META[lead.status] || STAGE_META.nurture;
    const li = document.createElement('li');
    li.className = 'lead-highlight';
    li.innerHTML = `
      <div class="lead-highlight__row">
        <span class="lead-highlight__name">${lead.displayName}</span>
        <span class="lead-highlight__idle">${idleDays}d idle</span>
      </div>
      <div class="lead-highlight__stage">Stage: ${stageInfo.label}</div>
      <div class="lead-highlight__time">Last touch: ${formatRelativeTime(lead.updatedAt)}</div>
      <div class="lead-highlight__next">Next step: ${stageInfo.nextAction}</div>
    `;
    list.appendChild(li);
  });
}

function stageSelectMarkup(current){
  return PIPELINE_STAGES.map(stage => `<option value="${stage.id}" ${current === stage.id ? 'selected' : ''}>${stage.label}</option>`).join('');
}

function createLeadCard(lead){
  const stageInfo = STAGE_META[lead.status] || STAGE_META.nurture;
  const card = document.createElement('article');
  card.className = 'lead-card';
  card.innerHTML = `
    <header class="lead-card__header">
      <div>
        <h3 class="lead-card__name">${lead.displayName}</h3>
        <p class="lead-card__meta">${lead.sourceLabel} • Added ${formatDateDisplay(lead.createdAt)}</p>
      </div>
      <span class="lead-card__badge ${stageInfo.badgeClass}">${stageInfo.label}</span>
    </header>
    <div class="lead-card__details">
      ${lead.email ? `<div class="lead-card__detail"><span>Email</span><span>${lead.email}</span></div>` : ''}
      ${lead.phone ? `<div class="lead-card__detail"><span>Phone</span><span>${lead.phone}</span></div>` : ''}
      ${(lead.locationSummary || lead.zip) ? `<div class="lead-card__detail"><span>Location</span><span>${[lead.locationSummary, lead.zip].filter(Boolean).join(' ')}</span></div>` : ''}
    </div>
    ${lead.notes ? `<div class="lead-card__notes">${lead.notes}</div>` : ''}
    <div class="lead-card__status">
      <span>Last touch: ${formatRelativeTime(lead.updatedAt)}</span>
      <span>ID • ${lead.id.slice(-4).toUpperCase()}</span>
    </div>
    <div class="lead-card__actions">
      <label class="lead-card__stage">
        <span class="sr-only">Stage</span>
        <select data-stage-selector class="lead-card__stage-select">
          ${stageSelectMarkup(lead.status)}
        </select>
      </label>
      ${lead.status !== 'won' ? '<button data-action="convert" class="btn text-xs px-3 py-1">Convert</button>' : ''}
      ${lead.status !== 'lost' ? '<button data-action="drop" class="btn-outline text-xs px-3 py-1">Drop</button>' : ''}
      <button data-action="delete" class="btn-destructive text-xs">Delete</button>
    </div>
    <div class="lead-card__next">Next step: ${stageInfo.nextAction}</div>
  `;

  const stageSelector = card.querySelector('[data-stage-selector]');
  stageSelector.addEventListener('change', async event => {
    const nextStatus = event.target.value;
    if(nextStatus === lead.status) return;
    await updateLead(lead.id, { status: nextStatus });
    await refreshLeads();
  });

  const convertBtn = card.querySelector('[data-action="convert"]');
  if(convertBtn){
    convertBtn.addEventListener('click', async () => {
      await convertLead(lead);
    });
  }

  const dropBtn = card.querySelector('[data-action="drop"]');
  if(dropBtn){
    dropBtn.addEventListener('click', async () => {
      await updateLead(lead.id, { status: 'lost' });
      await refreshLeads();
    });
  }

  const deleteBtn = card.querySelector('[data-action="delete"]');
  deleteBtn.addEventListener('click', async () => {
    const confirmDelete = window.confirm('Delete this lead? This cannot be undone.');
    if(!confirmDelete) return;
    await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
    await refreshLeads();
  });

  return card;
}

function renderPipeline(){
  columnRefs.forEach(list => { list.innerHTML = ''; });
  const counts = Object.create(null);
  const leads = getFilteredLeads();
  const fallback = columnRefs.get('nurture') || columnRefs.get('new');

  leads.forEach(lead => {
    const stageId = columnRefs.has(lead.status) ? lead.status : 'nurture';
    const list = columnRefs.get(stageId) || fallback;
    if(!list) return;
    counts[stageId] = (counts[stageId] || 0) + 1;
    list.appendChild(createLeadCard(lead));
  });

  PIPELINE_STAGES.forEach(stage => {
    const badge = pipelineBoard?.querySelector(`[data-stage-count="${stage.id}"]`);
    if(badge) badge.textContent = counts[stage.id] || 0;
    const list = columnRefs.get(stage.id);
    if(list && list.children.length === 0){
      const empty = document.createElement('div');
      empty.className = 'lead-column__empty';
      empty.innerHTML = `<p>${stage.empty}</p><p class="lead-column__empty-hint">Sin leads en esta etapa.</p>`;
      list.appendChild(empty);
    }
  });
}

async function fetchLeads(){
  const res = await fetch('/api/leads');
  if(!res.ok) throw new Error('Failed to load leads');
  return res.json();
}

async function refreshLeads(){
  try {
    const data = await fetchLeads();
    state.leads = (data.leads || []).map(normalizeLead);
    renderAll();
  } catch (error){
    console.error('Failed to refresh leads', error);
  }
}

async function updateLead(id, payload){
  await fetch(`/api/leads/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function convertLead(lead){
  await fetch('/api/consumers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      addr1: lead.addr1,
      addr2: lead.addr2,
      city: lead.city,
      state: lead.state,
      zip: lead.zip
    })
  });
  await updateLead(lead.id, { status: 'won' });
  window.location.href = '/clients';
}

function renderAll(){
  renderMetrics();
  renderSourceFilter();
  renderPipeline();
  renderHighlights();
  renderSourceBreakdown();
}

const leadForm = document.getElementById('leadForm');
const leadNameInput = document.getElementById('leadName');
if(leadForm){
  setLeadFormDirtyState(leadForm, false);

  const focusLeadName = () => {
    if(!leadNameInput) return;
    leadNameInput.focus();
    if(typeof leadNameInput.select === 'function'){
      leadNameInput.select();
    }
  };

  const startNewLeadEntry = () => {
    if(isLeadFormDirty(leadForm)){
      const proceed = window.confirm('Clear the current lead form and start a new lead?');
      if(!proceed) return false;
    }
    leadForm.reset();
    const stageSelect = leadForm.querySelector('#leadStage, [name="status"]');
    if(stageSelect) stageSelect.value = 'new';
    setLeadFormDirtyState(leadForm, false);
    highlightLeadForm(leadForm);
    if(typeof leadForm.scrollIntoView === 'function'){
      leadForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if(typeof window?.requestAnimationFrame === 'function'){
      window.requestAnimationFrame(focusLeadName);
    } else {
      setTimeout(focusLeadName, 0);
    }
    return true;
  };

  window.__crm_hotkeyActions = window.__crm_hotkeyActions || {};
  window.__crm_hotkeyActions.newLead = startNewLeadEntry;

  const markLeadFormDirty = () => {
    setLeadFormDirtyState(leadForm, true);
  };
  leadForm.addEventListener('input', markLeadFormDirty, { capture: true });
  leadForm.addEventListener('change', markLeadFormDirty, { capture: true });

  leadForm.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(leadForm);
    const payload = {
      name: (formData.get('name') || '').toString().trim(),
      email: (formData.get('email') || '').toString().trim(),
      phone: (formData.get('phone') || '').toString().trim(),
      addr1: (formData.get('addr1') || '').toString().trim(),
      addr2: (formData.get('addr2') || '').toString().trim(),
      city: (formData.get('city') || '').toString().trim(),
      state: (formData.get('state') || '').toString().trim(),
      zip: (formData.get('zip') || '').toString().trim(),
      source: (formData.get('source') || '').toString().trim(),
      notes: (formData.get('notes') || '').toString().trim(),
      status: mapStatus(formData.get('status'))
    };

    const submitButton = leadForm.querySelector('button[type="submit"]');
    const originalLabel = submitButton?.textContent;
    if(submitButton){
      submitButton.disabled = true;
      submitButton.textContent = 'Saving...';
    }

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if(!res.ok) throw new Error('Failed to save lead');
      if(typeof trackEvent === 'function'){
        trackEvent('lead_submission', { source: payload.source || 'unknown' });
      }
      leadForm.reset();
      const stageSelect = document.getElementById('leadStage');
      if(stageSelect) stageSelect.value = payload.status;
      setLeadFormDirtyState(leadForm, false);
      highlightLeadForm(leadForm);
      if(typeof window?.requestAnimationFrame === 'function'){
        window.requestAnimationFrame(focusLeadName);
      } else {
        setTimeout(focusLeadName, 0);
      }
      await refreshLeads();
    } catch (error){
      console.error('Unable to save lead', error);
      window.alert('Unable to save lead. Please try again.');
    } finally {
      if(submitButton){
        submitButton.disabled = false;
        submitButton.textContent = originalLabel || 'Save Lead';
      }
    }
  });
}

const sourceFilter = document.getElementById('leadSourceFilter');
if(sourceFilter){
  sourceFilter.addEventListener('change', event => {
    state.filterSource = event.target.value;
    renderAll();
  });
}

const refreshButton = document.getElementById('leadRefresh');
if(refreshButton){
  refreshButton.addEventListener('click', () => refreshLeads());
}

refreshLeads();
