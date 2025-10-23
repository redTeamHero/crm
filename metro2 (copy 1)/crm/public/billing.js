// public/billing.js
import { api, escapeHtml, formatCurrency, getTranslation, getCurrentLanguage } from './common.js';
import { setupPageTour } from './tour-guide.js';

function restoreBillingTour(context) {
  if (!context || context.restored) return;
  const contentEl = document.getElementById('billingContent');
  const noClientEl = document.getElementById('noClient');
  if (context.showContent && contentEl) {
    contentEl.classList.add('hidden');
  }
  if (context.hideNoClient && noClientEl) {
    noClientEl.classList.remove('hidden');
  }
  context.restored = true;
}

setupPageTour('billing', {
  onBeforeStart: () => {
    const contentEl = document.getElementById('billingContent');
    const noClientEl = document.getElementById('noClient');
    const state = { showContent: false, hideNoClient: false };
    if (contentEl && contentEl.classList.contains('hidden')) {
      contentEl.classList.remove('hidden');
      state.showContent = true;
    }
    if (noClientEl && !noClientEl.classList.contains('hidden')) {
      noClientEl.classList.add('hidden');
      state.hideNoClient = true;
    }
    return state;
  },
  onAfterComplete: ({ context }) => restoreBillingTour(context),
  onAfterCancel: ({ context }) => restoreBillingTour(context),
  steps: [
    {
      id: 'billing-nav',
      title: 'Navigate revenue ops',
      text: `<p class="font-semibold">Use the nav to jump from fulfillment to cashflow.</p>
             <p class="mt-1 text-xs text-slate-600">Check Dashboard KPIs, revisit Clients, then collect payment links here.</p>`,
      attachTo: { element: '#primaryNav', on: 'bottom' }
    },
    {
      id: 'billing-hero',
      title: 'Position the billing story',
      text: `<p class="font-semibold">Frame subscriptions and offers with premium copy.</p>
             <p class="mt-1 text-xs text-slate-600">Use this hero to remind teams about concierge payment experiences.</p>`,
      attachTo: { element: '#billingHero', on: 'top' }
    },
    {
      id: 'billing-metrics',
      title: 'Watch the money metrics',
      text: `<p class="font-semibold">Track outstanding balances, next due, and collected revenue.</p>
             <p class="mt-1 text-xs text-slate-600">Review these before every weekly finance sync.</p>`,
      attachTo: { element: '#billingMetrics', on: 'top' }
    },
    {
      id: 'billing-invoices',
      title: 'Invoice history',
      text: `<p class="font-semibold">Log every charge, refund, and PDF in one place.</p>
             <p class="mt-1 text-xs text-slate-600">Mark payments as collected and trigger portal uploads instantly.</p>`,
      attachTo: { element: '#invoiceTable', on: 'top' }
    },
    {
      id: 'billing-plans',
      title: 'Automate recurring plans',
      text: `<p class="font-semibold">Bundle services into productized offers.</p>
             <p class="mt-1 text-xs text-slate-600">Track reminders, notes, and upsell concierge upgrades inside the plan builder.</p>`,
      attachTo: { element: '#planBuilder', on: 'left' }
    },
    {
      id: 'billing-autopay',
      title: 'Control autopay',
      text: `<p class="font-semibold">Flip autopay on when clients are ready.</p>
             <p class="mt-1 text-xs text-slate-600">Keep receipts synced and ensure Metro-2 compliance on every draft.</p>`,
      attachTo: { element: '#billingAutopayCard', on: 'top' }
    }
  ]
});
const $ = (s) => document.querySelector(s);

const consumerId = getSelectedConsumerId();

if(!consumerId){
  document.getElementById('noClient').classList.remove('hidden');
} else {
  document.getElementById('billingContent').classList.remove('hidden');
  loadInvoices();
  loadPlans();
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const autopaySwitch = document.getElementById('autopaySwitch');
const autopayStatusEl = document.getElementById('autopayStatus');
const autopayCopyEl = document.getElementById('autopayCopy');
const autopaySwitchLabel = document.getElementById('autopaySwitchLabel');
const autopayStorageKey = consumerId ? `autopay:${consumerId}` : null;

const planState = { editingId: null, plans: [] };
const planNameInput = $('#planName');
const planAmountInput = $('#planAmount');
const planStartInput = $('#planStart');
const planNextInput = $('#planNext');
const planFrequencySelect = $('#planFrequency');
const planIntervalInput = $('#planInterval');
const planIntervalWrap = document.getElementById('planIntervalWrap');
const planReminderInput = $('#planReminderLead');
const planNotesInput = $('#planNotes');
const planActiveInput = document.getElementById('planActive');
const planFormTitle = document.getElementById('planFormTitle');
const planEmptyState = document.getElementById('planEmpty');
const plansList = document.getElementById('plansList');
const planSaveBtn = document.getElementById('planSave');
const planSendBtn = document.getElementById('planSend');
const planNewBtn = document.getElementById('planNew');
const planSummaryValueEl = document.getElementById('planSummaryValue');
const planSummaryDescriptionEl = document.getElementById('planSummaryDescription');
const planSummaryCta = document.getElementById('planSummaryCta');

let lastInvoices = [];

function translate(key, replacements = {}) {
  const template = getTranslation(key, getCurrentLanguage());
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, (_, token) => {
    const replacement = replacements[token];
    return replacement === undefined ? '' : String(replacement);
  });
}

if(consumerId && autopaySwitch && autopayStatusEl){
  const stored = localStorage.getItem(autopayStorageKey);
  const enabled = stored === 'true';
  autopaySwitch.checked = enabled;
  setAutopayUI(enabled);
  autopaySwitch.addEventListener('change', (event)=>{
    const next = Boolean(event.target.checked);
    localStorage.setItem(autopayStorageKey, next);
    setAutopayUI(next);
    trackEvent('autopay_toggle', { enabled: next });
  });
} else if(autopaySwitch) {
  autopaySwitch.disabled = true;
}

if(planNameInput){
  resetPlanForm();
}
if(planFrequencySelect){
  planFrequencySelect.addEventListener('change', handlePlanFrequencyChange);
  handlePlanFrequencyChange();
}
planSaveBtn?.addEventListener('click', handlePlanSave);
planSendBtn?.addEventListener('click', handlePlanSend);
planNewBtn?.addEventListener('click', ()=>{
  planState.editingId = null;
  resetPlanForm();
});
planSummaryCta?.addEventListener('click', ()=>{
  const planId = planSummaryCta?.dataset?.planId;
  if(planId){
    handlePlanTriggerSend(planId);
  } else {
    handlePlanSend();
  }
});

async function loadInvoices(options = {}){
  if(!consumerId) return;
  if(!options.reRenderOnly){
    const data = await api(`/api/invoices/${consumerId}`);
    lastInvoices = data.invoices || [];
  }
  renderInvoices(lastInvoices);
}

function renderInvoices(invoices = []){
  const body = $('#invoiceBody');
  body.innerHTML = '';
  const outstandingEl = document.getElementById('metricOutstanding');
  const collectedEl = document.getElementById('metricCollected');
  const nextDueEl = document.getElementById('metricNextDue');
  const nextAmountEl = document.getElementById('metricNextAmount');
  const nextDescEl = document.getElementById('metricNextDesc');
  const invoiceCountEl = document.getElementById('invoiceCount');
  const invoiceEmpty = document.getElementById('invoiceEmpty');

  let outstanding = 0;
  let collected = 0;
  let nextDue = null;

  const now = new Date();

  invoices.forEach(inv=>{
    const tr = document.createElement('tr');
    tr.className = 'border-b border-white/40 last:border-0';
    const amount = Number(inv.amount) || 0;
    const dueDate = parseDate(inv.due);
    const dueLabel = dueDate ? formatDueDate(dueDate) : '—';
    const dueSoon = Boolean(!inv.paid && dueDate && (dueDate - now) <= 1000*60*60*24*7);
    const statusText = inv.paid ? translate('billing.invoices.status.paid') : translate('billing.invoices.status.unpaid');
    const statusBadge = `<span class="badge ${inv.paid ? 'badge-paid' : 'badge-unpaid'}">${escapeHtml(statusText) || ''}</span>`;
    const dueSoonText = translate('billing.invoices.badges.dueSoon');
    const dueBadge = dueSoon ? `<span class="badge badge-unpaid ml-2">${escapeHtml(dueSoonText) || ''}</span>` : '';

    if(inv.paid) collected += amount; else outstanding += amount;
    if(!inv.paid && dueDate){
      if(!nextDue || dueDate < nextDue.date){
        nextDue = { date: dueDate, amount, desc: inv.desc };
      }
    }

    tr.innerHTML = `
      <td class="px-4 py-4 align-top">
        <div class="font-medium text-slate-900">${escapeHtml(inv.desc)}</div>
        ${dueBadge}
      </td>
      <td class="px-4 py-4 font-semibold text-slate-900">${formatCurrency(amount)}</td>
      <td class="px-4 py-4 text-slate-700">${dueLabel}</td>
      <td class="px-4 py-4">${statusBadge}</td>
      <td class="px-4 py-4">
        <div class="flex flex-wrap gap-2">
          ${inv.pdf ? `<a class="btn text-sm" target="_blank" href="/api/consumers/${consumerId}/state/files/${inv.pdf}">${escapeHtml(translate('billing.invoices.actions.pdf') || 'PDF')}</a>` : ''}
          ${inv.paid ? '' : `<button class="btn text-sm mark-paid" data-id="${inv.id}">${escapeHtml(translate('billing.invoices.actions.markPaid'))}</button>`}
        </div>
      </td>`;
    const btn = tr.querySelector('.mark-paid');
    if(btn){
      btn.addEventListener('click', async ()=>{
        await api(`/api/invoices/${inv.id}`, { method:'PUT', body: JSON.stringify({paid:true}) });
        trackEvent('purchase', { amount: inv.amount });
        loadInvoices();
      });
    }
    body.appendChild(tr);
  });

  if(outstandingEl) outstandingEl.textContent = formatCurrency(outstanding);
  if(collectedEl) collectedEl.textContent = formatCurrency(collected);
  if(invoiceCountEl) invoiceCountEl.textContent = invoices.length;

  if(nextDue){
    nextDueEl && (nextDueEl.textContent = formatDueDate(nextDue.date));
    nextAmountEl && (nextAmountEl.textContent = formatCurrency(nextDue.amount));
    if(nextDescEl){
      const nextDescText = translate('billing.metrics.nextDescriptionTemplate', { description: nextDue.desc || '' });
      nextDescEl.textContent = nextDescText || (nextDue.desc ? `Invoice: ${nextDue.desc}` : '');
    }
  } else {
    nextDueEl && (nextDueEl.textContent = '—');
    nextAmountEl && (nextAmountEl.textContent = '—');
    if(nextDescEl){
      const emptyText = translate('billing.metrics.nextDescriptionDefault');
      nextDescEl.textContent = emptyText || 'No open invoices.';
    }
  }

  if(invoiceEmpty){
    invoiceEmpty.classList.toggle('hidden', invoices.length > 0);
  }
}

document.getElementById('invAdd')?.addEventListener('click', async ()=>{
  const desc = $('#invDesc').value.trim();
  const amount = parseFloat($('#invAmount').value) || 0;
  const due = $('#invDue').value;
  if(!desc || !amount) return;
  const company = JSON.parse(localStorage.getItem('companyInfo')||'{}');
  await api('/api/invoices', { method:'POST', body: JSON.stringify({ consumerId, desc, amount, due, company }) });
  trackEvent('invoice_created', { amount, consumerId });
  $('#invDesc').value='';
  $('#invAmount').value='';
  $('#invDue').value='';
  loadInvoices();
});

function setAutopayUI(enabled){
  if(autopayStatusEl){
    const status = enabled ? 'billing.autopay.statusOn' : 'billing.autopay.statusOff';
    const fallback = enabled ? 'Autopay on' : 'Autopay off';
    autopayStatusEl.textContent = translate(status) || fallback;
  }
  if(autopayCopyEl){
    autopayCopyEl.textContent = enabled
      ? (translate('billing.autopay.copyOn') || 'We will process nightly drafts and email receipts automatically.')
      : (translate('billing.autopay.copyOff') || 'Turn this on to draft recurring invoices and stay Metro-2 compliant.');
  }
  if(autopaySwitchLabel){
    autopaySwitchLabel.textContent = enabled
      ? (translate('billing.autopay.toggleOff') || 'Pause autopay')
      : (translate('billing.autopay.toggleOn') || 'Enable autopay');
  }
}

function parseDate(value){
  if(!value) return null;
  if(value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if(typeof value === 'string'){
    const trimmed = value.trim();
    if(!trimmed) return null;
    if(/^\d{4}-\d{2}-\d{2}$/.test(trimmed)){
      const [year, month, day] = trimmed.split('-').map(Number);
      const localDate = new Date(year, month - 1, day);
      return Number.isNaN(localDate.getTime()) ? null : localDate;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDueDate(date){
  if(!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

async function loadPlans(){
  if(!consumerId) return;
  const res = await api(`/api/billing/plans/${consumerId}`);
  if(!res.ok){
    console.error('Failed to load plans', res.error || res.data);
    planState.plans = [];
  } else {
    planState.plans = Array.isArray(res.plans) ? res.plans : [];
  }
  renderPlansList();
}

function collectPlanPayload(){
  if(!consumerId) return null;
  const payload = {
    consumerId,
    name: planNameInput?.value?.trim() || '',
    amount: Number.parseFloat(planAmountInput?.value || '0') || 0,
    startDate: planStartInput?.value || null,
    nextBillDate: planNextInput?.value || null,
    frequency: planFrequencySelect?.value || 'monthly',
    reminderLeadDays: Number.parseInt(planReminderInput?.value || '0', 10) || 0,
    notes: planNotesInput?.value?.trim() || '',
    active: planActiveInput ? !!planActiveInput.checked : true,
  };
  if(payload.frequency === 'custom'){
    payload.intervalDays = Number.parseInt(planIntervalInput?.value || '30', 10) || 30;
  }
  payload.reminderLeadDays = Math.max(0, Math.min(60, Number(payload.reminderLeadDays) || 0));
  if(payload.frequency === 'custom'){
    payload.intervalDays = Math.max(1, Math.min(365, Number(payload.intervalDays) || 30));
  }
  return payload;
}

function resetPlanForm(plan = null){
  if(!planNameInput) return;
  const todayIso = new Date().toISOString().slice(0, 10);
  planNameInput.value = plan?.name || '';
  planAmountInput && (planAmountInput.value = plan ? Number(plan.amount || 0) : '');
  planStartInput && (planStartInput.value = plan?.startDate || todayIso);
  planNextInput && (planNextInput.value = plan?.nextBillDate || todayIso);
  if(planFrequencySelect){
    planFrequencySelect.value = plan?.frequency || 'monthly';
  }
  if(planReminderInput){
    const lead = plan?.reminderLeadDays;
    planReminderInput.value = lead === 0 ? '0' : (lead || 3);
  }
  if(planNotesInput){
    planNotesInput.value = plan?.notes || '';
  }
  if(planActiveInput){
    planActiveInput.checked = plan ? plan.active !== false : true;
  }
  if(planIntervalInput){
    planIntervalInput.value = plan?.intervalDays || '';
  }
  handlePlanFrequencyChange();
  if(planFormTitle){
    if(plan){
      planFormTitle.textContent = translate('billing.plans.form.titleEdit', { name: plan.name || '' }) || `Editing ${plan.name || 'plan'}`;
    } else {
      planFormTitle.textContent = translate('billing.plans.form.titleNew') || 'New plan';
    }
  }
}

function populatePlanForm(plan){
  planState.editingId = plan?.id || null;
  resetPlanForm(plan || null);
  if(plan && planIntervalInput && plan.frequency === 'custom'){
    planIntervalInput.value = plan.intervalDays || 30;
  }
  if(planSendBtn){
    planSendBtn.disabled = !planState.editingId && !consumerId;
  }
}

function handlePlanFrequencyChange(){
  if(!planFrequencySelect || !planIntervalWrap) return;
  const show = (planFrequencySelect.value || 'monthly') === 'custom';
  planIntervalWrap.classList.toggle('hidden', !show);
  if(show && planIntervalInput && (!planIntervalInput.value || Number(planIntervalInput.value) <= 0)){
    planIntervalInput.value = 30;
  }
}

async function handlePlanSave(){
  if(!consumerId) return;
  const payload = collectPlanPayload();
  if(!payload) return;
  if(!payload.name){
    alert(translate('billing.plans.form.validationName') || 'Plan name required');
    return;
  }
  if(!Number.isFinite(payload.amount) || payload.amount <= 0){
    alert(translate('billing.plans.form.validationAmount') || 'Amount must be greater than 0');
    return;
  }
  if(planState.editingId){
    const res = await api(`/api/billing/plans/${planState.editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
    if(!res.ok){
      alert(res.error || translate('billing.plans.toast.saveError') || 'Unable to save plan');
      return;
    }
    planState.plans = planState.plans.map(plan => plan.id === res.plan.id ? res.plan : plan);
    populatePlanForm(res.plan);
    renderPlansList();
    updatePlanSummary(planState.plans);
    trackEvent('billing_plan_saved', { planId: res.plan.id, consumerId });
  } else {
    const res = await api('/api/billing/plans', { method: 'POST', body: JSON.stringify(payload) });
    if(!res.ok){
      alert(res.error || translate('billing.plans.toast.saveError') || 'Unable to save plan');
      return;
    }
    planState.editingId = res.plan.id;
    planState.plans.push(res.plan);
    populatePlanForm(res.plan);
    renderPlansList();
    updatePlanSummary(planState.plans);
    if(res.invoice){
      loadInvoices();
    }
    trackEvent('billing_plan_created', { planId: res.plan.id, consumerId });
  }
}

async function handlePlanSend(){
  if(!consumerId) return;
  const company = JSON.parse(localStorage.getItem('companyInfo') || '{}');
  if(planState.editingId){
    await handlePlanTriggerSend(planState.editingId, { company });
    return;
  }
  const payload = collectPlanPayload();
  if(!payload) return;
  if(!payload.name){
    alert(translate('billing.plans.form.validationName') || 'Plan name required');
    return;
  }
  if(!Number.isFinite(payload.amount) || payload.amount <= 0){
    alert(translate('billing.plans.form.validationAmount') || 'Amount must be greater than 0');
    return;
  }
  payload.sendNow = true;
  payload.company = company;
  const res = await api('/api/billing/plans', { method: 'POST', body: JSON.stringify(payload) });
  if(!res.ok){
    alert(res.error || translate('billing.plans.toast.sendError') || 'Unable to send plan invoice');
    return;
  }
  planState.editingId = res.plan.id;
  planState.plans.push(res.plan);
  populatePlanForm(res.plan);
  renderPlansList();
  updatePlanSummary(planState.plans);
  loadInvoices();
  trackEvent('billing_plan_sent', { planId: res.plan.id, consumerId, amount: res.invoice?.amount });
}

async function handlePlanTriggerSend(planId, options = {}){
  const company = options.company || JSON.parse(localStorage.getItem('companyInfo') || '{}');
  const res = await api(`/api/billing/plans/${planId}/send`, { method: 'POST', body: JSON.stringify({ company }) });
  if(!res.ok){
    alert(res.error || translate('billing.plans.toast.sendError') || 'Unable to send plan invoice');
    return;
  }
  planState.plans = planState.plans.map(plan => plan.id === res.plan.id ? res.plan : plan);
  if(planState.editingId === res.plan.id){
    populatePlanForm(res.plan);
  }
  renderPlansList();
  updatePlanSummary(planState.plans);
  loadInvoices();
  trackEvent('billing_plan_sent', { planId: res.plan.id, consumerId, amount: res.invoice?.amount });
}

function renderPlansList(){
  if(!plansList) return;
  plansList.innerHTML = '';
  const plans = Array.isArray(planState.plans) ? [...planState.plans] : [];
  const empty = plans.length === 0;
  if(planEmptyState){
    planEmptyState.classList.toggle('hidden', !empty);
  }
  if(empty){
    updatePlanSummary([]);
    return;
  }
  const sorted = plans.sort((a, b) => {
    if(a.active && !b.active) return -1;
    if(!a.active && b.active) return 1;
    return (a.nextBillDate || '').localeCompare(b.nextBillDate || '');
  });
  sorted.forEach(plan => {
    const card = document.createElement('div');
    card.className = 'rounded-xl border border-white/60 bg-white/70 p-4 shadow-sm space-y-3';
    const freqLabel = formatPlanFrequencyLabel(plan);
    const nextLabel = plan.nextBillDate ? formatDueDate(parseDate(plan.nextBillDate)) : (translate('billing.plans.list.unscheduled') || 'Unscheduled');
    const reminderCopy = formatReminderLead(plan.reminderLeadDays);
    const statusBadge = plan.active
      ? `<span class="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">${escapeHtml(translate('billing.plans.list.activeBadge') || 'Active')}</span>`
      : `<span class="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600">${escapeHtml(translate('billing.plans.list.inactiveBadge') || 'Paused')}</span>`;
    const lastSent = plan.lastSentAt ? formatPlanTimestamp(plan.lastSentAt) : '';
    const cycles = Number(plan.cyclesCompleted) || 0;
    const cyclesCopy = cycles > 0 ? (translate('billing.plans.list.cyclesCompleted', { count: cycles }) || `${cycles} cycles completed`) : '';
    card.innerHTML = `
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <h4 class="text-base font-semibold text-slate-900">${escapeHtml(plan.name || 'Custom plan')}</h4>
            ${statusBadge}
          </div>
          <p class="text-sm text-slate-600">${formatCurrency(plan.amount)} • ${escapeHtml(freqLabel)}</p>
          <p class="text-xs text-slate-500">${escapeHtml(translate('billing.plans.list.nextBill') || 'Next bill')}: ${escapeHtml(nextLabel)}</p>
          <p class="text-xs text-slate-500">${escapeHtml(reminderCopy)}</p>
          ${lastSent ? `<p class="text-xs text-slate-500">${escapeHtml(translate('billing.plans.list.lastSent', { date: lastSent }) || `Last sent ${lastSent}`)}</p>` : ''}
          ${cyclesCopy ? `<p class="text-xs text-slate-500">${escapeHtml(cyclesCopy)}</p>` : ''}
        </div>
        <div class="flex flex-col gap-2">
          <button type="button" class="btn text-xs font-semibold plan-edit" data-id="${plan.id}">${escapeHtml(translate('billing.plans.list.editCta') || 'Edit')}</button>
          <button type="button" class="btn text-xs font-semibold plan-send" data-id="${plan.id}" ${plan.active ? '' : 'disabled'}>${escapeHtml(translate('billing.plans.list.sendCta') || 'Send invoice')}</button>
        </div>
      </div>
    `;
    card.querySelector('.plan-edit')?.addEventListener('click', ()=>populatePlanForm(plan));
    card.querySelector('.plan-send')?.addEventListener('click', ()=>handlePlanTriggerSend(plan.id));
    plansList.appendChild(card);
  });
  updatePlanSummary(planState.plans);
}

function updatePlanSummary(plans = []){
  if(!planSummaryValueEl || !planSummaryDescriptionEl || !planSummaryCta) return;
  if(!plans.length){
    planSummaryValueEl.textContent = translate('billing.metrics.planValue') || 'Growth Suite · $297/mo';
    planSummaryDescriptionEl.textContent = translate('billing.metrics.planDescription') || 'Includes Metro-2 automation, dispute letter engine, and concierge support.';
    planSummaryCta.textContent = translate('billing.metrics.planCta') || 'View upgrades';
    planSummaryCta.dataset.planId = '';
    planSummaryCta.disabled = false;
    return;
  }
  const activeSorted = [...plans].sort((a, b) => {
    if(a.active && !b.active) return -1;
    if(!a.active && b.active) return 1;
    return (a.nextBillDate || '').localeCompare(b.nextBillDate || '');
  });
  const plan = activeSorted[0];
  const freqLabel = formatPlanFrequencyLabel(plan);
  const freqShort = freqLabel.split('•')[0].trim();
  planSummaryValueEl.textContent = `${plan.name || 'Custom plan'} · ${formatCurrency(plan.amount)} / ${freqShort}`;
  const nextLabel = plan.nextBillDate ? formatDueDate(parseDate(plan.nextBillDate)) : (translate('billing.plans.list.unscheduled') || 'Unscheduled');
  const reminderCopy = formatReminderLead(plan.reminderLeadDays);
  planSummaryDescriptionEl.textContent = `${translate('billing.plans.summary.nextBill') || 'Next bill'}: ${nextLabel} · ${reminderCopy}`;
  planSummaryCta.textContent = translate('billing.plans.list.sendCta') || 'Send invoice';
  planSummaryCta.dataset.planId = plan.id || '';
  planSummaryCta.disabled = !plan.active;
}

function formatPlanFrequencyLabel(plan = {}){
  const freq = (plan.frequency || 'monthly').toLowerCase();
  const labels = {
    monthly: translate('billing.plans.form.frequencyMonthly') || 'Monthly',
    biweekly: translate('billing.plans.form.frequencyBiweekly') || 'Biweekly',
    weekly: translate('billing.plans.form.frequencyWeekly') || 'Weekly',
    custom: translate('billing.plans.form.frequencyCustom') || 'Custom days',
  };
  if(freq === 'custom'){
    const days = Number(plan.intervalDays) || 30;
    return `${labels.custom} (${days}d)`;
  }
  return labels[freq] || freq;
}

function formatReminderLead(days){
  const value = Math.max(0, Number(days) || 0);
  if(value === 0){
    return translate('billing.plans.list.reminderSameDay') || 'Reminder day-of';
  }
  if(value === 1){
    return translate('billing.plans.list.reminderDays', { days: 1 }) || 'Reminder 1 day before';
  }
  return translate('billing.plans.list.reminderDaysPlural', { days: value }) || `Reminder ${value} days before`;
}

function formatPlanTimestamp(iso){
  const date = parseDate(iso);
  if(!date) return '';
  const dateText = formatDueDate(date);
  const timeText = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${dateText} · ${timeText}`;
}

window.addEventListener('crm:language-change', () => {
  setAutopayUI(Boolean(autopaySwitch?.checked));
  loadInvoices({ reRenderOnly: true });
  renderPlansList();
});
