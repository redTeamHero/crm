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

function initPipelineBoard(){
  if(!pipelineBoard) return;
  pipelineBoard.innerHTML = '';
  columnRefs.clear();
  PIPELINE_STAGES.forEach(stage => {
    const column = document.createElement('div');
    column.className = 'glass card min-h-[260px] border border-slate-200/60 bg-white/70 shadow-sm flex flex-col';
    column.dataset.stage = stage.id;
    column.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-sm font-semibold text-slate-900">${stage.label}</div>
          <p class="text-xs text-slate-500 leading-snug">${stage.description}</p>
        </div>
        <span class="shrink-0 text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-600" data-stage-count="${stage.id}">0</span>
      </div>
      <div class="mt-4 flex-1 space-y-3" data-stage-list="${stage.id}"></div>
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
  const createdAt = parseDate(raw.createdAt)?.toISOString() ?? new Date().toISOString();
  const updatedAt = parseDate(raw.updatedAt)?.toISOString() ?? createdAt;
  return {
    ...raw,
    name,
    email,
    phone,
    notes,
    source,
    sourceLabel: source || 'Unknown',
    displayName: name || 'Unnamed Lead',
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

  setText('leadTotalCount', total);
  setText('leadNewCount', newThisWeek);
  setText('leadActiveCount', active);
  setText('leadWinRate', `${winRate}%`);
}

function renderSourceFilter(){
  const select = document.getElementById('leadSourceFilter');
  if(!select) return;
  const sources = Array.from(new Set(state.leads.map(lead => lead.sourceLabel))).filter(Boolean).sort((a,b)=>a.localeCompare(b));
  const previous = state.filterSource;
  select.innerHTML = '<option value="all">All sources / Todas</option>' + sources.map(src => `<option value="${src}">${src}</option>`).join('');
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
    const span = document.createElement('span');
    span.className = 'text-xs text-slate-500';
    span.textContent = 'No leads yet. / Aún sin leads.';
    container.appendChild(span);
    return;
  }
  const counts = new Map();
  leadsForBreakdown.forEach(lead => {
    const key = lead.sourceLabel || 'Unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  Array.from(counts.entries())
    .sort((a,b)=>b[1]-a[1])
    .slice(0,6)
    .forEach(([source, count]) => {
      const chip = document.createElement('span');
      chip.className = 'px-3 py-1 rounded-full bg-white/70 border border-slate-200 text-xs text-slate-600 shadow-sm';
      chip.textContent = `${source} • ${count}`;
      container.appendChild(chip);
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
    li.className = 'text-xs text-slate-500 bg-white/60 border border-slate-200 rounded-md px-3 py-2';
    li.innerHTML = 'No stalled leads. Keep nurturing daily.<br><span class="text-[10px] text-slate-400">Sin leads estancados. Sigue nutriendo diariamente.</span>';
    list.appendChild(li);
    return;
  }

  stale.forEach(({ lead, idleDays }) => {
    const stageInfo = STAGE_META[lead.status] || STAGE_META.nurture;
    const li = document.createElement('li');
    li.className = 'space-y-1 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-3';
    li.innerHTML = `
      <div class="flex items-center justify-between text-xs font-medium text-amber-700">
        <span>${lead.displayName}</span>
        <span>${idleDays}d idle</span>
      </div>
      <div class="text-[11px] text-amber-700/80">Stage: ${stageInfo.label}</div>
      <div class="text-[11px] text-amber-700/80">Last touch: ${formatRelativeTime(lead.updatedAt)}</div>
      <div class="text-[11px] text-amber-700/80">Next step: ${stageInfo.nextAction}</div>
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
  card.className = 'rounded-xl border border-slate-200/60 bg-white/80 shadow-sm p-4 space-y-3 text-slate-700';
  card.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <div>
        <div class="text-sm font-semibold text-slate-900">${lead.displayName}</div>
        <div class="text-[11px] text-slate-500">${lead.sourceLabel} • Added ${formatDateDisplay(lead.createdAt)}</div>
      </div>
      <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${stageInfo.badgeClass}">${stageInfo.label}</span>
    </div>
    <div class="space-y-1 text-xs text-slate-600">
      ${lead.email ? `<div class="flex items-center gap-2"><span class="text-slate-500">Email</span><span>${lead.email}</span></div>` : ''}
      ${lead.phone ? `<div class="flex items-center gap-2"><span class="text-slate-500">Phone</span><span>${lead.phone}</span></div>` : ''}
    </div>
    ${lead.notes ? `<div class="text-xs text-slate-600 bg-slate-50/80 border border-slate-200 rounded-md px-3 py-2">${lead.notes}</div>` : ''}
    <div class="text-[11px] text-slate-500 flex items-center justify-between">
      <span>Last touch: ${formatRelativeTime(lead.updatedAt)}</span>
      <span class="text-slate-400">ID • ${lead.id.slice(-4).toUpperCase()}</span>
    </div>
    <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60">
      <select data-stage-selector class="text-xs border border-slate-200 rounded-md bg-white/80 px-2 py-1 shadow-sm">
        ${stageSelectMarkup(lead.status)}
      </select>
      ${lead.status !== 'won' ? '<button data-action="convert" class="btn text-xs px-3 py-1">Convert</button>' : ''}
      ${lead.status !== 'lost' ? '<button data-action="drop" class="btn-outline text-xs px-3 py-1">Drop</button>' : ''}
      <button data-action="delete" class="btn-destructive text-xs">Delete</button>
    </div>
    <div class="text-[11px] text-slate-500">Next step: ${stageInfo.nextAction}</div>
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
      empty.className = 'text-xs text-slate-500 italic border border-dashed border-slate-200/70 rounded-lg px-3 py-4 bg-white/40';
      empty.textContent = stage.empty;
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
    body: JSON.stringify({ name: lead.name, email: lead.email, phone: lead.phone })
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
if(leadForm){
  leadForm.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(leadForm);
    const payload = {
      name: (formData.get('name') || '').toString().trim(),
      email: (formData.get('email') || '').toString().trim(),
      phone: (formData.get('phone') || '').toString().trim(),
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
      await refreshLeads();
    } catch (error){
      console.error('Unable to save lead', error);
      window.alert('Unable to save lead. Please try again.');
    } finally {
      if(submitButton){
        submitButton.disabled = false;
        submitButton.textContent = originalLabel || 'Save Lead / Guardar lead';
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
