/* public/dashboard.js */

import { escapeHtml, api, formatCurrency } from './common.js';
import { renderClientLocations } from './client-map.js';
import { resolveStateInfo, toTitleCase } from './state-utils.js';

const TOUR_STEP_KEY = 'dashboard.tour.step';
const TOUR_COMPLETE_KEY = 'dashboard.tour.complete';
let tourInstance = null;

if (typeof window !== 'undefined' && typeof window.registerTourAvailability === 'function') {
  window.registerTourAvailability({ pageKey: 'dashboard', available: true });
}
let activeTourStepId = null;
let confettiTarget = null;
const chatState = {
  panel: null,
  toggle: null,
  close: null,
  tour: null,
  messages: null,
  form: null,
  input: null,
  quickButtons: [],
  categories: null,
  prompts: null,
  isOpen: false,
  seeded: false
};
const CHAT_PROMPT_CATEGORIES = [
  {
    id: 'tour',
    label: 'Program Tour',
    prompts: [
      { label: 'Start Program Tour', message: 'Start the guided program tour.' },
      { label: 'Resume Tour', message: 'Resume the guided tour where I left off.' },
      { label: 'Tour Talking Points', message: 'Share the NEPQ script to introduce the platform.' }
    ]
  },
  {
    id: 'onboarding',
    label: 'Onboarding & Sales',
    prompts: [
      { label: 'Onboard a Lead', message: 'How do I onboard a lead?' },
      { label: 'Consult Script', message: 'Give me an NEPQ consult script.' },
      { label: 'Revenue Tips', message: 'Show me revenue tips' }
    ]
  },
  {
    id: 'compliance',
    label: 'Compliance & Metro-2',
    prompts: [
      { label: 'Metro-2 Checklist', message: 'Share a Metro-2 compliance checklist.' },
      { label: 'FCRA/FDCPA Guardrails', message: 'How do we keep FCRA/FDCPA tight?' },
      { label: 'Client Compliance FAQ', message: 'Share a compliance FAQ I can send to clients.' }
    ]
  },
  {
    id: 'automation',
    label: 'Automation & Ops',
    prompts: [
      { label: 'Automation Ideas', message: 'Suggest automation workflows.' },
      { label: 'Certified Mail Upsell', message: 'How do I upsell certified mail?' },
      { label: 'Analytics KPIs', message: 'Which KPIs should I track weekly?' }
    ]
  }
];
let pendingChatOpen = false;
const pendingChatMessages = [];
let activeChatCategoryId = CHAT_PROMPT_CATEGORIES[0]?.id || null;
let shepherdCheckPromise = null;
let tourLoadingMessageShown = false;

const LOCATION_COLORS = ['#0ea5e9', '#6366f1', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#facc15'];
const locationChartState = {
  chart: null,
  mode: 'state',
  total: 0,
  data: { state: [], city: [] }
};

const clientLocationElements = {
  initialized: false,
  chart: null,
  empty: null,
  legend: null,
  buttons: { state: null, city: null }
};

const focusDateFormatterEn = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const focusDateFormatterEs = new Intl.DateTimeFormat('es-MX', { month: 'short', day: 'numeric' });

const DEFAULT_DASHBOARD_GOALS = Object.freeze({
  leadToConsultTarget: 32,
  retentionTarget: 92,
  monthlyRecurringTarget: 84000,
});

const DEFAULT_LADDER_CONFIG = Object.freeze({
  title: 'Revenue Ladder to 7 Figures',
  subtitle: 'Premium dispute services roadmap. No guaranteed timelines or deletions.',
  goalLabel: 'Goal / Meta',
  goalAmountLabel: '$84k mo',
  goalCaption: 'Objetivo mensual',
  mrrCaption: 'Keep churn < 5% and auto-schedule retention consults.',
  pipelineValue: 'Load CRM',
  pipelineCaption: 'Daily KPI: Consult → Purchase 35%.',
  aovValue: 'Link Stripe',
  aovCaption: 'Bundle certified mail credits for premium feel.',
  milestone: 'Next milestone: $25k/mo unlocks concierge onboarding.',
  milestoneCaption: 'Próximo objetivo intermedio',
  progressBaselineLabel: '$0',
  progressGoalLabel: 'Meta $84k',
  upsellHeading: 'Upsell idea:',
  upsellBody: 'Automation bundle at $249/mo with certified mail credits + NEPQ scripts.',
  playbookLabel: 'View Playbook',
  playbookUrl: '#',
  spanishSummaryLabel: 'Ver resumen en español',
  spanishSummaryUrl: '#',
});

let currentDashboardGoals = { ...DEFAULT_DASHBOARD_GOALS };
let currentLadderConfig = { ...DEFAULT_LADDER_CONFIG };
let currentMonthlyRecurringRevenue = null;
let currentSummarySnapshot = null;

function mergeConfig(base = {}, override = {}) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeConfig(result[key] && typeof result[key] === 'object' ? result[key] : {}, value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function sanitizeLink(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function applyLadderConfig(ladder, goals) {
  if (typeof document === 'undefined') return;
  const mergedGoals = { ...DEFAULT_DASHBOARD_GOALS, ...(goals && typeof goals === 'object' ? goals : {}) };
  const mergedLadder = mergeConfig(DEFAULT_LADDER_CONFIG, ladder && typeof ladder === 'object' ? ladder : {});

  currentDashboardGoals = mergedGoals;
  currentLadderConfig = mergedLadder;

  setTextContent('ladderTitle', mergedLadder.title);
  setTextContent('ladderSubtitle', mergedLadder.subtitle);
  setTextContent('ladderGoalLabel', mergedLadder.goalLabel);
  const amountLabel = mergedLadder.goalAmountLabel || (
    Number.isFinite(mergedGoals.monthlyRecurringTarget)
      ? `${formatCurrency(mergedGoals.monthlyRecurringTarget)} / mo`
      : DEFAULT_LADDER_CONFIG.goalAmountLabel
  );
  setTextContent('ladderGoalAmount', amountLabel);
  setTextContent('ladderGoalCaption', mergedLadder.goalCaption);
  setTextContent('ladderMrrCaption', mergedLadder.mrrCaption);
  setTextContent('ladderPipeline', mergedLadder.pipelineValue);
  setTextContent('ladderPipelineCaption', mergedLadder.pipelineCaption);
  setTextContent('ladderAov', mergedLadder.aovValue);
  setTextContent('ladderAovCaption', mergedLadder.aovCaption);
  setTextContent('ladderMilestone', mergedLadder.milestone);
  setTextContent('ladderMilestoneCaption', mergedLadder.milestoneCaption);
  setTextContent('ladderProgressBaseline', mergedLadder.progressBaselineLabel);
  setTextContent('ladderProgressGoal', mergedLadder.progressGoalLabel);

  const upsellEl = document.getElementById('ladderUpsellCopy');
  if (upsellEl) {
    upsellEl.innerHTML = `<span class="font-semibold text-slate-900">${escapeHtml(mergedLadder.upsellHeading)}</span> ${escapeHtml(mergedLadder.upsellBody)}`;
  }

  const playbookBtn = document.getElementById('ladderPlaybookButton');
  if (playbookBtn) {
    playbookBtn.textContent = mergedLadder.playbookLabel || DEFAULT_LADDER_CONFIG.playbookLabel;
    const playbookUrl = sanitizeLink(mergedLadder.playbookUrl);
    playbookBtn.href = playbookUrl || '#';
    if (/^https?:/i.test(playbookUrl)) {
      playbookBtn.target = '_blank';
      playbookBtn.rel = 'noopener';
    } else {
      playbookBtn.removeAttribute('target');
      playbookBtn.removeAttribute('rel');
    }
  }

  const spanishLink = document.getElementById('ladderSpanishLink');
  if (spanishLink) {
    const spanishLabel = mergedLadder.spanishSummaryLabel || DEFAULT_LADDER_CONFIG.spanishSummaryLabel;
    const spanishUrl = sanitizeLink(mergedLadder.spanishSummaryUrl);
    spanishLink.textContent = spanishLabel;
    if (spanishUrl) {
      spanishLink.href = spanishUrl;
      if (/^https?:/i.test(spanishUrl)) {
        spanishLink.target = '_blank';
        spanishLink.rel = 'noopener';
      } else {
        spanishLink.removeAttribute('target');
        spanishLink.removeAttribute('rel');
      }
      spanishLink.classList.remove('hidden');
    } else {
      spanishLink.href = '#';
      spanishLink.classList.add('hidden');
    }
  }
}

function hydrateLadderStateFromDom() {
  if (typeof document === 'undefined') return;

  const readText = (id) => {
    const el = document.getElementById(id);
    if (!el || typeof el.textContent !== 'string') return null;
    return el.textContent.trim();
  };

  const config = { ...currentLadderConfig };
  const textMappings = [
    ['title', 'ladderTitle'],
    ['subtitle', 'ladderSubtitle'],
    ['goalLabel', 'ladderGoalLabel'],
    ['goalAmountLabel', 'ladderGoalAmount'],
    ['goalCaption', 'ladderGoalCaption'],
    ['mrrCaption', 'ladderMrrCaption'],
    ['pipelineValue', 'ladderPipeline'],
    ['pipelineCaption', 'ladderPipelineCaption'],
    ['aovValue', 'ladderAov'],
    ['aovCaption', 'ladderAovCaption'],
    ['milestone', 'ladderMilestone'],
    ['milestoneCaption', 'ladderMilestoneCaption'],
    ['progressBaselineLabel', 'ladderProgressBaseline'],
    ['progressGoalLabel', 'ladderProgressGoal'],
  ];

  for (const [key, id] of textMappings) {
    const value = readText(id);
    if (value !== null) {
      config[key] = value;
    }
  }

  const upsellEl = document.getElementById('ladderUpsellCopy');
  if (upsellEl) {
    const headingEl = upsellEl.querySelector('span');
    const heading = headingEl?.textContent?.trim() || '';
    const bodyText = (upsellEl.textContent || '').replace(heading, '').trim();
    if (heading) config.upsellHeading = heading;
    if (bodyText) config.upsellBody = bodyText;
  }

  const playbookBtn = document.getElementById('ladderPlaybookButton');
  if (playbookBtn) {
    const label = playbookBtn.textContent?.trim();
    const href = playbookBtn.getAttribute('href') || '';
    if (label) config.playbookLabel = label;
    config.playbookUrl = href === '#' ? '' : href;
  }

  const spanishLink = document.getElementById('ladderSpanishLink');
  if (spanishLink) {
    const label = spanishLink.textContent?.trim();
    const href = spanishLink.getAttribute('href') || '';
    if (label) config.spanishSummaryLabel = label;
    config.spanishSummaryUrl = href === '#' ? '' : href;
  }

  currentLadderConfig = mergeConfig(DEFAULT_LADDER_CONFIG, config);
  currentDashboardGoals = {
    ...currentDashboardGoals,
    monthlyRecurringTarget: Number.NaN,
  };
}

function setTextContent(id, value) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value, fallback = '0.0%') {
  if (!Number.isFinite(value)) return fallback;
  return `${value.toFixed(1)}%`;
}

function formatFocusDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'soon / pronto';
  return `${focusDateFormatterEn.format(date)} / ${focusDateFormatterEs.format(date)}`;
}

function updateRevenueLadder(value, goal) {
  const labelEl = document.getElementById('ladderMrr');
  const barEl = document.getElementById('ladderProgressBar');
  if (labelEl) {
    if (Number.isFinite(value)) {
      const base = formatCurrency(value);
      const goalLabel = Number.isFinite(goal) ? ` / Meta ${formatCurrency(goal)}` : '';
      labelEl.textContent = `${base}${goalLabel}`;
    } else {
      labelEl.textContent = 'Sync billing';
    }
  }
  if (barEl) {
    if (Number.isFinite(goal) && goal > 0 && Number.isFinite(value)) {
      const pct = clamp((value / goal) * 100, 0, 100);
      barEl.style.width = `${pct}%`;
    } else if (Number.isFinite(value)) {
      barEl.style.width = `${clamp(value, 0, 100)}%`;
    } else {
      barEl.style.width = '0%';
    }
  }
}

function updateGoalKpiLabel(summary) {
  const el = document.getElementById('goalKpiLabel');
  if (!el) return;
  const target = summary?.goals?.leadToConsultTarget;
  const current = summary?.kpis?.leadToConsultRate;
  if (Number.isFinite(target) && Number.isFinite(current)) {
    el.textContent = `Goal KPI: Lead → Consult ≥ ${target.toFixed(0)}% · Current ${current.toFixed(1)}% / Seguimiento Lead→Consulta.`;
  } else if (Number.isFinite(target)) {
    el.textContent = `Goal KPI: Lead → Consult ≥ ${target.toFixed(0)}% · Track consult follow-ups.`;
  } else {
    el.textContent = 'Goal KPI: Lead → Consult ≥ 32% · Track consult follow-ups.';
  }
}

function updateNextRevenueWin(copy) {
  const el = document.getElementById('nextRevenueWin');
  if (!el) return;
  if (copy) {
    el.textContent = copy;
  } else {
    el.textContent = 'Next revenue win: bundle report parsing + dispute letter automation at $149 setup. Use Stripe Checkout link in Billing.';
  }
}

function renderFocusList(summary) {
  const container = document.getElementById('focusList');
  if (!container) return;
  const items = [];
  const upcoming = Array.isArray(summary?.reminders?.upcoming) ? summary.reminders.upcoming : [];
  if (upcoming.length) {
    const first = upcoming[0];
    const name = escapeHtml(first.consumerName || 'Client');
    const due = escapeHtml(formatFocusDate(first.due));
    items.push({
      badge: 'bg-emerald-100 text-emerald-600',
      text: `Prep ${name} consult by ${due}. Confirm docs before letters. / Prepara la consulta de ${name} antes de ${due}.`
    });
  }

  const leadRate = summary?.kpis?.leadToConsultRate;
  const leadTarget = summary?.goals?.leadToConsultTarget;
  if (Number.isFinite(leadRate) && Number.isFinite(leadTarget)) {
    const rateText = escapeHtml(formatPercent(leadRate));
    const targetText = escapeHtml(`${leadTarget.toFixed(0)}%`);
    items.push({
      badge: 'bg-sky-100 text-sky-600',
      text: `Lead → Consult at ${rateText} vs goal ${targetText}. Drop NEPQ close in nurture drip. / Lead → Consulta en ${rateText} vs meta ${targetText}. Añade cierre NEPQ.`
    });
  }

  const outstanding = summary?.revenue?.outstanding;
  if (Number.isFinite(outstanding) && outstanding > 0) {
    const invoice = summary?.revenue?.topOutstanding;
    if (invoice) {
      const amount = escapeHtml(formatCurrency(invoice.amount));
      const name = escapeHtml(invoice.consumerName || 'client');
      const due = escapeHtml(formatFocusDate(invoice.due));
      items.push({
        badge: 'bg-amber-100 text-amber-600',
        text: `Check-in with ${name} about ${amount} due ${due}. Bundle certified mail tracking. / Contacta a ${name} sobre ${amount} vence ${due}. Incluye seguimiento por correo certificado.`
      });
    } else {
      const amount = escapeHtml(formatCurrency(outstanding));
      items.push({
        badge: 'bg-amber-100 text-amber-600',
        text: `Collect ${amount} outstanding with concierge CTA. Offer certified mail credits. / Cobra ${amount} pendiente con CTA concierge. Ofrece créditos de correo certificado.`
      });
    }
  }

  if (!items.length) {
    items.push({
      badge: 'bg-emerald-100 text-emerald-600',
      text: 'Document the next consult follow-up and sync reminders. / Documenta el siguiente seguimiento y sincroniza recordatorios.'
    });
  }

  const filler = [
    {
      badge: 'bg-emerald-100 text-emerald-600',
      text: 'Launch the 7-Day Credit Momentum email sequence. / Lanza la secuencia Momentum de 7 días.'
    },
    {
      badge: 'bg-sky-100 text-sky-600',
      text: 'Review Metro-2 evidence before your next letter batch. / Revisa evidencias Metro-2 antes del siguiente envío.'
    },
    {
      badge: 'bg-amber-100 text-amber-600',
      text: 'Promote the automation bundle during consult recap. / Promueve el paquete de automatización en el recap.'
    }
  ];

  while (items.length < 3) {
    items.push(filler[items.length % filler.length]);
  }

  container.innerHTML = items.slice(0, 3).map((item, index) => `
    <li class="flex items-start gap-3">
      <span class="mt-1 flex h-6 w-6 items-center justify-center rounded-full ${item.badge} font-semibold">${index + 1}</span>
      <span>${item.text}</span>
    </li>
  `).join('');
}

function updateHeroCards(summary) {
  const consults = Number(summary?.leads?.consultsLast7d ?? 0);
  setTextContent('heroConsultMetric', `${consults} consults this week`);
  const consultTarget = 5;
  const consultGap = Math.max(consultTarget - consults, 0);
  setTextContent('heroConsultCaption', consultGap > 0
    ? `Book ${consultGap} more to hit weekly pacing.`
    : 'Great pace—route extra slots to concierge upsells.');

  const followUps = Number(summary?.reminders?.upcoming?.length ?? 0);
  setTextContent('heroAutomationMetric', `${followUps} follow-ups queued`);
  const overdue = Number(summary?.reminders?.overdueCount ?? 0);
  setTextContent('heroAutomationCaption', overdue > 0
    ? `${overdue} overdue—sync automations or reassign.`
    : 'Automations are on pace. Keep certified mail trigger warm.');

  const outstanding = Number(summary?.revenue?.outstanding ?? 0);
  const collected = Number(summary?.revenue?.totalCollected ?? 0);
  if (outstanding > 0) {
    setTextContent('heroUpsellMetric', `${formatCurrency(outstanding)} pending`);
  } else {
    setTextContent('heroUpsellMetric', `${formatCurrency(collected)} collected`);
  }
  const topOutstanding = summary?.revenue?.topOutstanding;
  if (topOutstanding?.consumerName) {
    setTextContent('heroUpsellCaption', `Focus on ${topOutstanding.consumerName} for premium follow-up.`);
  } else {
    setTextContent('heroUpsellCaption', 'Pitch monitoring + automation bundle on today’s calls.');
  }
}

function initClientLocationElements(){
  if(clientLocationElements.initialized){
    return;
  }
  clientLocationElements.chart = document.getElementById('clientLocationChart');
  clientLocationElements.empty = document.getElementById('clientLocationEmpty');
  clientLocationElements.legend = document.getElementById('clientLocationLegend');
  clientLocationElements.buttons.state = document.getElementById('clientLocationModeState');
  clientLocationElements.buttons.city = document.getElementById('clientLocationModeCity');
  clientLocationElements.initialized = true;

  Object.entries(clientLocationElements.buttons).forEach(([mode, btn]) => {
    if(!btn) return;
    btn.addEventListener('click', () => updateClientLocationMode(mode));
  });
}

function setClientLocationButtonState(button, isActive){
  if(!button) return;
  const activeClasses = ['bg-emerald-500', 'text-white', 'shadow-sm', 'border', 'border-emerald-400'];
  const inactiveClasses = ['bg-white', 'border', 'border-slate-200', 'text-slate-600'];
  if(isActive){
    button.classList.add(...activeClasses);
    button.classList.remove(...inactiveClasses);
  } else {
    button.classList.remove(...activeClasses);
    button.classList.add(...inactiveClasses);
  }
}

function refreshClientLocationButtons(){
  const { state, city } = clientLocationElements.buttons;
  setClientLocationButtonState(state, locationChartState.mode === 'state');
  setClientLocationButtonState(city, locationChartState.mode === 'city');
}

function buildLocationEntries(map, { limit = 6, otherLabel = 'Other Territories' } = {}){
  const entries = Array.from(map.entries()).filter(([, count]) => Number.isFinite(count) && count > 0);
  entries.sort((a, b) => b[1] - a[1]);
  if(!entries.length){
    return [];
  }
  const top = entries.slice(0, limit);
  const remainder = entries.slice(limit);
  const otherTotal = remainder.reduce((sum, [, count]) => sum + count, 0);
  if(otherTotal > 0){
    top.push([otherLabel, otherTotal]);
  }
  return top.map(([label, count]) => ({ label, count }));
}

function prepareClientLocationBreakdown(consumers){
  initClientLocationElements();
  const clients = Array.isArray(consumers) ? consumers : [];
  const stateCounts = new Map();
  const cityCounts = new Map();
  let unknownStates = 0;

  for(const consumer of clients){
    const info = resolveStateInfo(consumer?.state);
    if(info.name){
      stateCounts.set(info.name, (stateCounts.get(info.name) || 0) + 1);
    } else if(consumer?.state){
      unknownStates += 1;
    }

    const cityRaw = typeof consumer?.city === 'string' ? consumer.city.trim() : '';
    if(cityRaw){
      const cityName = toTitleCase(cityRaw);
      const suffix = info.code || info.name;
      const label = suffix ? `${cityName}, ${suffix}` : cityName;
      cityCounts.set(label, (cityCounts.get(label) || 0) + 1);
    }
  }

  if(unknownStates > 0){
    stateCounts.set('Unknown', (stateCounts.get('Unknown') || 0) + unknownStates);
  }

  locationChartState.total = clients.length;
  locationChartState.data.state = buildLocationEntries(stateCounts, { limit: 6, otherLabel: 'Other States' });
  locationChartState.data.city = buildLocationEntries(cityCounts, { limit: 6, otherLabel: 'Other Cities' });
  updateClientLocationMode(locationChartState.mode, { force: true });
}

function updateClientLocationMode(mode, { force = false } = {}){
  initClientLocationElements();
  const normalizedMode = mode === 'city' ? 'city' : 'state';
  if(!force && locationChartState.mode === normalizedMode){
    renderClientLocationChart(locationChartState.data[normalizedMode]);
    return;
  }
  locationChartState.mode = normalizedMode;
  refreshClientLocationButtons();
  renderClientLocationChart(locationChartState.data[normalizedMode]);
}

function renderClientLocationLegend(entries, colors){
  const legendEl = clientLocationElements.legend;
  if(!legendEl) return;
  const total = locationChartState.total || 0;
  if(!Array.isArray(entries) || !entries.length){
    legendEl.innerHTML = `<div class="rounded-lg border border-dashed border-slate-200 bg-white/70 px-3 py-2 text-[11px] text-slate-500">Add client city/state data to see the ${locationChartState.mode === 'state' ? 'state mix' : 'top cities'}.</div>`;
    return;
  }

  const items = entries.map((entry, idx) => {
    const percent = total ? (entry.count / total * 100) : 0;
    const color = colors[idx % colors.length];
    return `<div class="flex items-center gap-2 rounded-lg border border-slate-100 bg-white/70 px-3 py-2">
      <span class="inline-flex h-2.5 w-2.5 rounded-full" style="background:${color};"></span>
      <span class="flex-1 font-medium text-slate-700">${escapeHtml(entry.label)}</span>
      <span class="font-semibold text-slate-900">${percent.toFixed(1)}%</span>
      <span class="text-[11px] text-slate-400">${entry.count}</span>
    </div>`;
  });
  legendEl.innerHTML = items.join('');
}

function renderClientLocationChart(entries){
  initClientLocationElements();
  const chartEl = clientLocationElements.chart;
  const emptyEl = clientLocationElements.empty;
  if(!chartEl) return;

  if(!Array.isArray(entries) || !entries.length){
    if(locationChartState.chart){
      locationChartState.chart.destroy();
      locationChartState.chart = null;
    }
    if(emptyEl){
      emptyEl.classList.remove('hidden');
      emptyEl.classList.add('flex');
    }
    renderClientLocationLegend([], []);
    return;
  }

  if(emptyEl){
    emptyEl.classList.add('hidden');
    emptyEl.classList.remove('flex');
  }

  const labels = entries.map(entry => entry.label);
  const data = entries.map(entry => entry.count);
  const colors = entries.map((_, idx) => LOCATION_COLORS[idx % LOCATION_COLORS.length]);

  if(locationChartState.chart){
    locationChartState.chart.destroy();
    locationChartState.chart = null;
  }

  if(typeof window.Chart === 'undefined'){
    console.warn('Chart.js is not available for the client location breakdown.');
    renderClientLocationLegend(entries, colors);
    return;
  }

  const ctx = chartEl.getContext('2d');
  if(!ctx){
    console.warn('Unable to access drawing context for the client location chart.');
    renderClientLocationLegend(entries, colors);
    return;
  }

  locationChartState.chart = new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 1,
          hoverOffset: 8
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      cutout: '58%',
      layout: { padding: 8 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(context){
              const label = context.label || '';
              const value = Number(context.raw) || 0;
              const total = locationChartState.total || 0;
              const percent = total ? (value / total * 100) : 0;
              return `${label}: ${value} (${percent.toFixed(1)}%)`;
            }
          }
        }
      }
    }
  });

  renderClientLocationLegend(entries, colors);
}

function resolveCoachAnchor(){
  const toggleEl = document.getElementById('guideChatToggle');
  if(toggleEl && !toggleEl.classList.contains('hidden')){
    return toggleEl;
  }
  const panelEl = document.getElementById('guideChatPanel');
  if(panelEl){
    return panelEl;
  }
  return toggleEl || null;
}

function burstConfetti(){
  if(!confettiTarget) return;
  for(let i=0;i<24;i++){
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    const tx = (Math.random()-0.5)*220;
    const ty = (-Math.random()*160-60);
    piece.style.setProperty('--tx', `${tx}px`);
    piece.style.setProperty('--ty', `${ty}px`);
    piece.style.backgroundColor = `hsl(${Math.random()*360},80%,62%)`;
    confettiTarget.appendChild(piece);
    setTimeout(()=>piece.remove(), 1200);
  }
}

function refreshHelpGuideState(){
  if(typeof window.setHelpGuideState !== 'function') return;
  const storedStep = localStorage.getItem(TOUR_STEP_KEY);
  const completed = localStorage.getItem(TOUR_COMPLETE_KEY) === 'true';
  let mode = 'start';
  if(storedStep) mode = 'resume';
  else if(completed) mode = 'replay';
  window.setHelpGuideState({ mode, completed });
}

function waitForShepherd({ attempts = 40, interval = 150 } = {}){
  if(window.Shepherd) return Promise.resolve(window.Shepherd);
  if(shepherdCheckPromise) return shepherdCheckPromise;
  shepherdCheckPromise = new Promise(resolve => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if(window.Shepherd){
        clearInterval(timer);
        shepherdCheckPromise = null;
        resolve(window.Shepherd);
        return;
      }
      if(tries >= attempts){
        clearInterval(timer);
        shepherdCheckPromise = null;
        resolve(null);
      }
    }, interval);
  });
  return shepherdCheckPromise;
}

function createTour(){
  if(tourInstance) return tourInstance;
  if(!window.Shepherd){
    console.warn('Shepherd.js is not available for the guided walkthrough.');
    return null;
  }
  const Shepherd = window.Shepherd;
  tourInstance = new Shepherd.Tour({
    useModalOverlay: true,
    defaultStepOptions: {
      cancelIcon: { enabled: true },
      classes: 'glass card text-sm leading-relaxed shadow-xl max-w-md',
      scrollTo: { behavior: 'smooth', block: 'center' }
    }
  });
  const tour = tourInstance;

  const makeButtons = (step) => {
    const buttons = [];
    if(step !== 'first'){
      buttons.push({
        text: 'Back',
        action(){ tour.back(); }
      });
    }
    buttons.push({
      text: 'Skip',
      action(){ tour.cancel(); },
      classes: 'shepherd-button-secondary'
    });
    if(step === 'last'){
      buttons.push({
        text: 'Done',
        action(){ tour.complete(); }
      });
    } else {
      buttons.push({
        text: 'Next',
        action(){ tour.next(); }
      });
    }
    return buttons;
  };

  tour.addStep({
    id: 'nav',
    title: 'Navigation',
    text: `<p class="font-semibold">Drive clients to the right workflow fast.</p>
           <p class="mt-1 text-xs text-slate-600">Use Dashboard, Leads, and Billing to monitor Lead→Consult% and real-time payments.</p>`,
    attachTo: { element: '#primaryNav', on: 'bottom' },
    buttons: makeButtons('first')
  });

  tour.addStep({
    id: 'kpis',
    title: 'KPIs',
    text: `<p class="font-semibold">Watch conversion and retention instantly.</p>
           <p class="mt-1 text-xs text-slate-600">Anchor your consult pitch with live data and highlight quick wins.</p>`,
    attachTo: { element: '#tourKpiSection', on: 'top' },
    buttons: makeButtons()
  });

  tour.addStep({
    id: 'notes',
    title: 'Playbooks & Notes',
    text: `<p class="font-semibold">Capture next steps while you speak.</p>
           <p class="mt-1 text-xs text-slate-600">Turn every call into tasks and NEPQ follow-ups.</p>`,
    attachTo: { element: '#tourNotepadCard', on: 'left' },
    buttons: makeButtons()
  });

  tour.addStep({
    id: 'map',
    title: 'Client Map',
    text: `<p class="font-semibold">Spot regional wins and partnership gaps.</p>
           <p class="mt-1 text-xs text-slate-600">Segment your offers by state and trigger campaigns.</p>`,
    attachTo: { element: '#tourMapCard', on: 'top' },
    buttons: makeButtons()
  });

  tour.addStep({
    id: 'coach',
    title: 'Guided Coach',
    text: `<p class="font-semibold">Need more help?</p>
           <p class="mt-1 text-xs text-slate-600">Launch the chat coach for scripts, KPIs, and upsell ideas.</p>`,
    attachTo: { element: '#guideChatToggle', on: 'top' },
    beforeShowPromise(){
      return new Promise(resolve => {
        closeChatCoach();
        requestAnimationFrame(() => {
          const anchorEl = resolveCoachAnchor();
          if(anchorEl){
            const step = tour.getById('coach');
            if(step && typeof step.updateStepOptions === 'function'){
              step.updateStepOptions({
                attachTo: { element: anchorEl, on: 'top' }
              });
            }
          }
          resolve();
        });
      });
    },
    buttons: makeButtons('last')
  });

  tour.on('show', () => {
    const current = tour.currentStep;
    activeTourStepId = current?.id || null;
    if(activeTourStepId){
      localStorage.setItem(TOUR_STEP_KEY, activeTourStepId);
      localStorage.removeItem(TOUR_COMPLETE_KEY);
    }
    refreshHelpGuideState();
  });

  tour.on('complete', () => {
    activeTourStepId = null;
    localStorage.removeItem(TOUR_STEP_KEY);
    localStorage.setItem(TOUR_COMPLETE_KEY, 'true');
    refreshHelpGuideState();
    burstConfetti();
  });

  tour.on('cancel', () => {
    if(activeTourStepId){
      localStorage.setItem(TOUR_STEP_KEY, activeTourStepId);
    }
    refreshHelpGuideState();
  });

  tour.on('inactive', () => {
    activeTourStepId = null;
  });

  return tourInstance;
}

async function startTour({ resume = false } = {}){
  if(!window.Shepherd && !tourLoadingMessageShown){
    pendingChatOpen = true;
    openChatCoach({ focusInput: false });
    appendChatMessage('assistant', `<p class="font-semibold text-slate-800">Loading tour…</p><p class="text-xs text-slate-600">The guided walkthrough is preparing.</p>`, { html: true });
    tourLoadingMessageShown = true;
  }

  const shepherd = await waitForShepherd();
  if(!shepherd){
    pendingChatOpen = true;
    openChatCoach({ focusInput: false });
    appendChatMessage('assistant', `<p class="font-semibold text-slate-800">We couldn’t load the tour.</p><p class="text-xs text-slate-600">Refresh or check your connection, then try again.</p>`, { html: true });
    return;
  }

  const tour = createTour();
  if(!tour){
    pendingChatOpen = true;
    openChatCoach({ focusInput: false });
    appendChatMessage('assistant', `<p class="font-semibold text-slate-800">The guided tour is unavailable right now.</p><p class="text-xs text-slate-600">Try again in a moment.</p>`, { html: true });
    return;
  }

  if(tourLoadingMessageShown){
    appendChatMessage('assistant', `<p class="font-semibold text-slate-800">Tour ready.</p><p class="text-xs text-slate-600">Starting the guided walkthrough now.</p>`, { html: true });
    tourLoadingMessageShown = false;
  }

  if(typeof tour.isActive === 'function' && tour.isActive()){
    tour.cancel();
  }
  if(resume){
    const stepId = localStorage.getItem(TOUR_STEP_KEY);
    localStorage.removeItem(TOUR_COMPLETE_KEY);
    refreshHelpGuideState();
    tour.start();
    if(stepId && tour.getById(stepId)){
      tour.show(stepId);
    }
  } else {
    activeTourStepId = null;
    localStorage.removeItem(TOUR_STEP_KEY);
    localStorage.removeItem(TOUR_COMPLETE_KEY);
    refreshHelpGuideState();
    tour.start();
  }
}

function handleTutorialReset(){
  if(tourInstance && typeof tourInstance.cancel === 'function'){
    tourInstance.cancel();
  }
  activeTourStepId = null;
  localStorage.removeItem(TOUR_STEP_KEY);
  localStorage.removeItem(TOUR_COMPLETE_KEY);
  refreshHelpGuideState();
}

function appendChatMessage(role, content, { html = false } = {}){
  if(!chatState.messages){
    pendingChatMessages.push({ role, content, html });
    return;
  }
  const bubble = document.createElement('div');
  bubble.className = role === 'assistant'
    ? 'self-start max-w-[85%] rounded-2xl bg-slate-100 px-3 py-2 text-slate-700 shadow'
    : 'self-end max-w-[85%] rounded-2xl bg-[var(--accent)] px-3 py-2 text-white shadow';
  bubble.dataset.role = role;
  if(html) bubble.innerHTML = content;
  else bubble.textContent = content;
  chatState.messages.appendChild(bubble);
  chatState.messages.scrollTo({ top: chatState.messages.scrollHeight, behavior: 'smooth' });
}

function renderChatCategories(){
  if(!chatState.categories) return;
  chatState.categories.innerHTML = '';
  CHAT_PROMPT_CATEGORIES.forEach(category => {
    const isActive = category.id === activeChatCategoryId;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = isActive
      ? 'btn text-xs bg-[var(--accent)] text-white shadow'
      : 'btn text-xs bg-slate-100 text-slate-700';
    btn.textContent = category.label;
    btn.setAttribute('data-category', category.id);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    btn.addEventListener('click', () => {
      if(activeChatCategoryId === category.id) return;
      activeChatCategoryId = category.id;
      renderChatCategories();
      renderChatPrompts();
    });
    chatState.categories.appendChild(btn);
  });
}

function renderChatPrompts(){
  if(!chatState.prompts) return;
  chatState.prompts.innerHTML = '';
  const activeCategory = CHAT_PROMPT_CATEGORIES.find(cat => cat.id === activeChatCategoryId);
  if(!activeCategory) return;
  activeCategory.prompts.forEach(prompt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn text-xs bg-slate-100 text-slate-700';
    btn.textContent = prompt.label;
    btn.dataset.chatMessage = prompt.message;
    chatState.prompts.appendChild(btn);
  });
  chatState.quickButtons = Array.from(chatState.prompts.querySelectorAll('[data-chat-message]'));
  chatState.quickButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      openChatCoach({ focusInput: false });
      sendChatMessage(btn.dataset.chatMessage || '');
    });
  });
}

function initChatPromptMenu(){
  if(!chatState.categories || !chatState.prompts) return;
  if(!activeChatCategoryId){
    activeChatCategoryId = CHAT_PROMPT_CATEGORIES[0]?.id || null;
  }
  renderChatCategories();
  renderChatPrompts();
}

function seedChat(){
  if(chatState.seeded) return;
  chatState.seeded = true;
  appendChatMessage('assistant', `
    <p class="font-semibold text-slate-800">Hey ducky 👋</p>
    <p class="mt-1">I can guide tours, share scripts, and flag Metro-2 pitfalls.</p>
    <ul class="mt-2 list-disc list-inside text-sm text-slate-600 space-y-1">
      <li>Ask for onboarding flows to boost Lead→Consult%.</li>
      <li>Request NEPQ prompts to keep compliance tight.</li>
      <li>Ask for follow-up scripts to reinforce conversions.</li>
    </ul>
    <p class="mt-2 text-xs text-slate-500"><strong>Revenue tip:</strong> Trigger a same-day upsell after each dispute letter delivery.</p>
  `, { html: true });
}

function openChatCoach({ focusInput = true } = {}){
  if(!chatState.panel){
    pendingChatOpen = true;
    return;
  }
  if(chatState.isOpen){
    if(focusInput){
      chatState.input?.focus();
    }
    return;
  }
  chatState.panel.classList.remove('hidden');
  chatState.panel.setAttribute('aria-hidden', 'false');
  if(chatState.toggle){
    chatState.toggle.classList.add('hidden');
    chatState.toggle.setAttribute('aria-expanded', 'true');
  }
  chatState.isOpen = true;
  localStorage.setItem('dashboardChatOpen', '1');
  seedChat();
  if(focusInput){
    chatState.input?.focus();
  }
  pendingChatOpen = false;
}

function closeChatCoach(){
  if(!chatState.panel) return;
  chatState.panel.classList.add('hidden');
  chatState.panel.setAttribute('aria-hidden', 'true');
  if(chatState.toggle){
    chatState.toggle.classList.remove('hidden');
    chatState.toggle.setAttribute('aria-expanded', 'false');
  }
  chatState.isOpen = false;
  localStorage.removeItem('dashboardChatOpen');
  pendingChatOpen = false;
}

function generateAssistantReply(message){
  const normalized = message.toLowerCase();
  if(normalized.includes('tour') || normalized.includes('walkthrough')){
    const resume = normalized.includes('resume') || normalized.includes('continu');
    const intent = resume ? 'resumeTour' : 'startTour';
    return {
      html: true,
      action: intent,
      text: `<p class="font-semibold text-slate-800">Launching the guided walkthrough.</p>
             <p class="mt-1 text-xs text-slate-600">I'll highlight KPIs, notes, and the chat coach.</p>
             <p class="mt-2 text-xs text-slate-500">KPI: Track completion of each tour run vs. upgrades. A/B idea: compare a "Book consult" CTA versus "Start audit" during the final step.</p>`
    };
  }
  if(normalized.includes('certified mail')){
    return {
      html: true,
      text: `<p class="font-semibold text-slate-800">Productize certified mail as a premium upsell:</p>
             <ol class="mt-1 list-decimal list-inside space-y-1 text-sm text-slate-700">
               <li>Bundle it after each letter generation with a one-click Stripe checkout add-on.</li>
               <li>Auto-trigger tracking SMS/email updates to prove delivery—no PII in logs.</li>
               <li>Report monthly on delivery success vs. dispute outcomes for social proof.</li>
             </ol>
             <p class="mt-2 text-xs text-slate-500">KPI: Attach Rate & Certified Mail Margin. A/B idea: test "Secure delivery" vs. "Certified compliance mailing" copy on the upsell modal.</p>`
    };
  }
    if(normalized.includes('onboard') || normalized.includes('lead')){
      return {
        html: true,
        text: `<p class="font-semibold text-slate-800">3-step onboarding sprint:</p>
               <ol class="mt-1 list-decimal list-inside space-y-1 text-sm text-slate-700">
               <li>Dashboard ➝ Leads ➝ tag warm prospects, then auto-trigger the dispute quiz.</li>
                <li>Use the Notes panel to capture NEPQ answers and sync them into your letter template variables.</li>
                <li>Collect payment with Stripe checkout links tied to the billing widget.</li>
               </ol>
               <p class="mt-2 text-xs text-slate-500">KPI: Lead→Consult% and Consult→Purchase%. A/B test: try "Secure your audit" vs. "Start Metro-2 review" on the booking CTA.</p>`
      };
    }
  if(normalized.includes('script') || normalized.includes('nepq')){
    return {
      html: true,
      text: `<p class="font-semibold text-slate-800">NEPQ consult script beats pushy sales:</p>
             <ol class="mt-1 list-decimal list-inside space-y-1 text-sm text-slate-700">
               <li><strong>Problem:</strong> "Walk me through what triggered you to fix your credit now?"</li>
              <li><strong>Consequences:</strong> "What happens if we do nothing this quarter?"</li>
               <li><strong>Vision:</strong> "Imagine trucking contracts approved because Metro-2 data is spotless—how does that change cash flow?"</li>
             </ol>
             <p class="mt-2 text-xs text-slate-500">KPI: Consult→Purchase%. A/B idea: test video vs. audio delivery of this script in the Guided Coach.</p>`
    };
  }
  if(normalized.includes('compliance') || normalized.includes('fcra') || normalized.includes('fdcpa') || normalized.includes('checklist') || normalized.includes('metro-2')){
    return {
      html: true,
      text: `<p class="font-semibold text-slate-800">Metro-2 + FCRA compliance guardrails:</p>
             <ul class="mt-1 list-disc list-inside space-y-1 text-sm text-slate-700">
               <li>Validate DOFD on every charge-off/collection before letters—no DOFD, no send.</li>
               <li>Match account status to balance logic (current = $0 past due, installment vs. revolving limits).</li>
               <li>Redact SSN to last4 in all logs and force TLS + rate limiting on auth endpoints.</li>
             </ul>
             <p class="mt-2 text-xs text-slate-500">KPI: Disputes sent with complete Metro-2 data. A/B idea: compare compliance checklist gating vs. inline warnings to reduce rework.</p>`
    };
  }
  if(normalized.includes('automation') || normalized.includes('workflow') || normalized.includes('ops')){
    return {
      html: true,
      text: `<p class="font-semibold text-slate-800">Automation sprint for the week:</p>
             <ul class="mt-1 list-disc list-inside space-y-1 text-sm text-slate-700">
               <li>Webhook → Discord alert when Experian updates arrive to prompt follow-up calls.</li>
               <li>Auto-generate dispute drafts, gate the final PDF behind Stripe checkout, then trigger the mail API.</li>
               <li>Schedule retention nudges via calendar sync when payments slip past 3 days.</li>
             </ul>
             <p class="mt-2 text-xs text-slate-500">KPI: Time-to-Value & Task Completion Rate. A/B idea: test "Automate delivery" vs. "Keep it manual" upsell copy.</p>`
    };
  }
  if(normalized.includes('kpi') || normalized.includes('metrics') || normalized.includes('track weekly')){
    return {
      html: true,
      text: `<p class="font-semibold text-slate-800">Weekly KPI dashboard checklist:</p>
             <ul class="mt-1 list-disc list-inside space-y-1 text-sm text-slate-700">
               <li>Lead→Consult% segmented by channel (ads vs. referrals).</li>
               <li>Consult→Purchase% plus certified mail attach rate.</li>
               <li>Refund% + Time-to-Value (days to first dispute sent).</li>
             </ul>
             <p class="mt-2 text-xs text-slate-500">A/B idea: experiment with CTA "Review my KPIs" vs. "Audit my funnel" in the dashboard hero.</p>`
    };
  }
  if(normalized.includes('revenue') || normalized.includes('upsell')){
    return {
      html: true,
      text: `<p class="font-semibold text-slate-800">Revenue levers to pull this week:</p>
             <ul class="mt-1 list-disc list-inside space-y-1 text-sm text-slate-700">
               <li>Bundle certified mail as a premium add-on right after letter generation.</li>
               <li>Trigger a follow-up SMS using the chat coach script when retention dips below 85%.</li>
               <li>Launch a webinar invite for truckers and attorneys with Metro-2 case studies.</li>
             </ul>
             <p class="mt-2 text-xs text-slate-500">KPI: Average Order Value & Refund%. A/B ideas: headline emphasizing "Clarity-first dispute plan" vs. "Tailored Metro-2 review"; test trust badge placement near the paywall.</p>`
    };
  }
  if(normalized.includes('spanish')){
    return {
      html: true,
      text: `<p class="font-semibold text-slate-800">We currently provide guidance in English.</p>
             <p class="mt-1 text-xs text-slate-600">Clone any template you need to localize and collaborate with your team outside the app.</p>`
    };
  }
  return {
    html: true,
    text: `<p class="font-semibold text-slate-800">Here’s how to keep momentum:</p>
           <ul class="mt-1 list-disc list-inside space-y-1 text-sm text-slate-700">
             <li>Run the tour to align new reps on the Apple-like experience.</li>
             <li>Log every objection in Notes and convert wins into Playbooks.</li>
             <li>Review the location breakdown weekly to target referral partners in hot markets.</li>
           </ul>
           <p class="mt-2 text-xs text-slate-500">KPI: Consult→Purchase% and LTV. A/B idea: Compare "Book your dispute strategy" vs. "Schedule compliance consult" on the hero CTA.</p>`
  };
}

function respondToMessage(message){
  const reply = generateAssistantReply(message);
  const delay = reply && typeof reply.delay === 'number' ? reply.delay : 350;
  setTimeout(() => {
    appendChatMessage('assistant', reply.text, { html: reply.html });
    if(reply.action === 'startTour'){
      startTour({ resume: false });
    } else if(reply.action === 'resumeTour'){
      startTour({ resume: true });
    }
  }, delay);
}

function sendChatMessage(message){
  const value = message.trim();
  if(!value) return;
  appendChatMessage('user', value, { html: false });
  respondToMessage(value);
}

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short' });
const timelineDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

function parseDateSafe(value){
  if(!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function resolveItemDate(item){
  if(!item || typeof item !== 'object') return new Date();
  const candidates = [
    item.createdAt,
    item.updatedAt,
    item.created,
    item.updated,
    item.timestamp,
    item.date
  ];
  for(const val of candidates){
    const parsed = parseDateSafe(val);
    if(parsed) return parsed;
  }
  return new Date();
}

function buildMetricDataset({
  title,
  subtitle,
  label,
  color,
  items,
  getValue = () => 1,
  getDate = resolveItemDate,
  timelineFormatter = () => ({ title: '', subtitle: '', meta: '', value: '' }),
  filter,
  formatValue
}){
  const source = Array.isArray(items) ? items.slice() : [];
  const filtered = typeof filter === 'function' ? source.filter(filter) : source;
  const now = new Date();
  const monthAnchors = [];
  for(let i=5;i>=0;i--){
    monthAnchors.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }

  const labels = monthAnchors.map(anchor => monthFormatter.format(anchor));
  const data = monthAnchors.map(anchor => {
    return filtered.reduce((sum, item) => {
      const date = getDate(item);
      if(!(date instanceof Date)) return sum;
      if(date.getFullYear() === anchor.getFullYear() && date.getMonth() === anchor.getMonth()){
        const raw = getValue(item);
        const num = typeof raw === 'number' ? raw : Number.parseFloat(raw ?? '0');
        return sum + (Number.isFinite(num) ? num : 0);
      }
      return sum;
    }, 0);
  });

  const timeline = filtered
    .map(item => ({ item, date: getDate(item) }))
    .filter(entry => entry.date instanceof Date)
    .sort((a,b) => b.date - a.date)
    .slice(0, 8)
    .map(({ item, date }) => timelineFormatter(item, date));

  return {
    title,
    subtitle,
    dataset: { labels, data, label, color, formatValue },
    timeline
  };
}

function createDetailModal(){
  const modal = document.getElementById('detailModal');
  const chartCanvas = document.getElementById('detailChart');
  const titleEl = document.getElementById('detailModalTitle');
  const subtitleEl = document.getElementById('detailModalSubtitle');
  const timelineEl = document.getElementById('detailTimeline');
  const closeBtn = document.getElementById('detailModalClose');
  const triggers = document.querySelectorAll('.detail-trigger');
  if(!modal || !chartCanvas || !timelineEl){
    return { setGenerators: () => {} };
  }
  let chartInstance = null;
  let generators = {};

  function close(){
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.classList.remove('overflow-hidden');
  }

  function open(type){
    const generator = generators[type];
    if(!generator){
      console.warn('No generator configured for metric', type);
      return;
    }
    const details = generator();
    if(!details) return;
    const { dataset, timeline, title, subtitle } = details;
    if(titleEl && title) titleEl.textContent = title;
    if(subtitleEl) subtitleEl.textContent = subtitle || '';
    if(typeof window.Chart === 'undefined'){
      console.warn('Chart.js is not available');
    } else {
      const ctx = chartCanvas.getContext('2d');
      if(ctx){
        if(chartInstance){
          chartInstance.destroy();
        }
        const formatter = dataset.formatValue || (val => Number.isFinite(val) ? val.toLocaleString() : String(val));
        chartInstance = new window.Chart(ctx, {
          type: 'line',
          data: {
            labels: dataset.labels,
            datasets: [{
              label: dataset.label,
              data: dataset.data,
              borderColor: dataset.color,
              backgroundColor: dataset.color,
              tension: 0.35,
              fill: false,
              pointRadius: 4,
              pointHoverRadius: 5
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: (value) => formatter(value)
                }
              }
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (context) => `${dataset.label}: ${formatter(context.parsed.y)}`
                }
              }
            }
          }
        });
      }
    }

    if(timeline.length){
      timelineEl.innerHTML = timeline.map(entry => {
        const title = escapeHtml(entry.title || '');
        const subtitle = entry.subtitle ? `<div class="text-xs muted mt-1">${escapeHtml(entry.subtitle)}</div>` : '';
        const meta = entry.meta ? `<div class="text-xs muted mt-2">${escapeHtml(entry.meta)}</div>` : '';
        const value = entry.value ? `<div class="text-sm font-semibold">${escapeHtml(entry.value)}</div>` : '';
        return `<li class="glass card p-3">` +
          `<div class="flex items-start justify-between gap-3">` +
            `<div><div class="font-medium">${title}</div>${subtitle}</div>` +
            `${value}` +
          `</div>` +
          `${meta}` +
        `</li>`;
      }).join('');
    } else {
      timelineEl.innerHTML = '<li class="muted">No recent activity.</li>';
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');
  }

  modal.addEventListener('click', (evt) => {
    if(evt.target === modal){
      close();
    }
  });
  if(closeBtn){
    closeBtn.addEventListener('click', close);
  }
  document.addEventListener('keydown', (evt) => {
    if(evt.key === 'Escape' && !modal.classList.contains('hidden')){
      close();
    }
  });
  triggers.forEach(btn => {
    btn.addEventListener('click', (evt) => {
      evt.preventDefault();
      const type = btn.dataset.detail;
      if(type){
        open(type);
      }
    });
  });

  return {
    setGenerators(map){
      generators = map || {};
    }
  };
}
document.addEventListener('DOMContentLoaded', () => {
  confettiTarget = document.getElementById('confetti');
  const goalBtn = document.getElementById('btnGoal');
  if(goalBtn){
    goalBtn.addEventListener('click', burstConfetti);
  }

  const detailModalController = createDetailModal();

  hydrateLadderStateFromDom();

  const ladderEditor = document.getElementById('ladderEditor');
  const ladderEditorForm = document.getElementById('ladderEditorForm');
  const ladderEditButton = document.getElementById('ladderEditButton');
  const ladderEditorClose = document.getElementById('ladderEditorClose');
  const ladderEditorCancel = document.getElementById('ladderEditorCancel');
  const ladderEditorStatus = document.getElementById('ladderEditorStatus');
  const ladderEditorSubmit = document.getElementById('ladderEditorSubmit');
  let ladderEditorOpen = false;

  function populateLadderEditorForm() {
    if (!ladderEditorForm) return;
    const values = {
      title: currentLadderConfig.title,
      subtitle: currentLadderConfig.subtitle,
      goalLabel: currentLadderConfig.goalLabel,
      goalAmountLabel: currentLadderConfig.goalAmountLabel,
      goalCaption: currentLadderConfig.goalCaption,
      monthlyRecurringTarget: Number.isFinite(currentDashboardGoals.monthlyRecurringTarget)
        ? currentDashboardGoals.monthlyRecurringTarget
        : '',
      mrrCaption: currentLadderConfig.mrrCaption,
      pipelineValue: currentLadderConfig.pipelineValue,
      pipelineCaption: currentLadderConfig.pipelineCaption,
      aovValue: currentLadderConfig.aovValue,
      aovCaption: currentLadderConfig.aovCaption,
      milestone: currentLadderConfig.milestone,
      milestoneCaption: currentLadderConfig.milestoneCaption,
      progressBaselineLabel: currentLadderConfig.progressBaselineLabel,
      progressGoalLabel: currentLadderConfig.progressGoalLabel,
      upsellHeading: currentLadderConfig.upsellHeading,
      upsellBody: currentLadderConfig.upsellBody,
      playbookLabel: currentLadderConfig.playbookLabel,
      playbookUrl: currentLadderConfig.playbookUrl,
      spanishSummaryLabel: currentLadderConfig.spanishSummaryLabel,
      spanishSummaryUrl: currentLadderConfig.spanishSummaryUrl,
    };
    Object.entries(values).forEach(([name, value]) => {
      const field = ladderEditorForm.elements.namedItem(name);
      if (field) {
        field.value = value == null ? '' : value;
      }
    });
    if (ladderEditorStatus) {
      ladderEditorStatus.textContent = '';
      ladderEditorStatus.classList.remove('text-red-600');
      ladderEditorStatus.classList.add('text-emerald-600');
    }
  }

  function openLadderEditor() {
    if (!ladderEditor) return;
    populateLadderEditorForm();
    ladderEditor.classList.remove('hidden');
    ladderEditor.classList.add('flex');
    document.body.classList.add('overflow-hidden');
    ladderEditorOpen = true;
    const firstField = ladderEditorForm?.elements.namedItem('title');
    if (firstField && typeof firstField.focus === 'function') {
      firstField.focus();
    }
  }

  function closeLadderEditor() {
    if (!ladderEditor) return;
    ladderEditor.classList.add('hidden');
    ladderEditor.classList.remove('flex');
    document.body.classList.remove('overflow-hidden');
    ladderEditorOpen = false;
  }

  if (ladderEditButton) {
    ladderEditButton.addEventListener('click', () => openLadderEditor());
  }
  if (ladderEditorClose) {
    ladderEditorClose.addEventListener('click', () => closeLadderEditor());
  }
  if (ladderEditorCancel) {
    ladderEditorCancel.addEventListener('click', () => closeLadderEditor());
  }
  if (ladderEditor) {
    ladderEditor.addEventListener('click', (event) => {
      if (event.target === ladderEditor) {
        closeLadderEditor();
      }
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && ladderEditorOpen) {
      closeLadderEditor();
    }
  });

  if (ladderEditorForm) {
    ladderEditorForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!ladderEditorSubmit) return;

      if (ladderEditorStatus) {
        ladderEditorStatus.textContent = 'Saving… / Guardando…';
        ladderEditorStatus.classList.remove('text-red-600');
        ladderEditorStatus.classList.add('text-emerald-600');
      }

      ladderEditorSubmit.disabled = true;
      ladderEditorSubmit.textContent = 'Saving…';

      try {
        const formData = new FormData(ladderEditorForm);
        const ladderPayload = {};
        const ladderFields = [
          'title',
          'subtitle',
          'goalLabel',
          'goalAmountLabel',
          'goalCaption',
          'mrrCaption',
          'pipelineValue',
          'pipelineCaption',
          'aovValue',
          'aovCaption',
          'milestone',
          'milestoneCaption',
          'progressBaselineLabel',
          'progressGoalLabel',
          'upsellHeading',
          'upsellBody',
          'playbookLabel',
          'playbookUrl',
          'spanishSummaryLabel',
          'spanishSummaryUrl',
        ];

        for (const field of ladderFields) {
          const raw = formData.get(field);
          ladderPayload[field] = typeof raw === 'string' ? raw.trim() : '';
        }

        const monthlyTargetRaw = formData.get('monthlyRecurringTarget');
        const monthlyTarget = typeof monthlyTargetRaw === 'string'
          ? Number.parseFloat(monthlyTargetRaw)
          : Number.isFinite(monthlyTargetRaw) ? Number(monthlyTargetRaw) : NaN;

        const payload = { ladder: ladderPayload };
        if (Number.isFinite(monthlyTarget) && monthlyTarget >= 0) {
          payload.goals = { monthlyRecurringTarget: monthlyTarget };
        }

        const resp = await fetch('/api/dashboard/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        let body = {};
        try {
          body = await resp.json();
        } catch {
          body = {};
        }

        if (!resp.ok || body.ok === false) {
          const message = body.error || `Request failed (${resp.status})`;
          throw new Error(message);
        }

        const config = body.config || {};
        currentSummarySnapshot = currentSummarySnapshot
          ? { ...currentSummarySnapshot, goals: config.goals || currentSummarySnapshot.goals, ladder: config.ladder || currentSummarySnapshot.ladder }
          : { goals: config.goals || {}, ladder: config.ladder || {} };
        applyLadderConfig(config.ladder, config.goals);
        updateRevenueLadder(currentMonthlyRecurringRevenue, currentDashboardGoals.monthlyRecurringTarget);
        if (currentSummarySnapshot) {
          updateGoalKpiLabel(currentSummarySnapshot);
        }

        if (ladderEditorStatus) {
          ladderEditorStatus.textContent = 'Saved • Guardado';
          ladderEditorStatus.classList.remove('text-red-600');
          ladderEditorStatus.classList.add('text-emerald-600');
        }

        setTimeout(() => {
          closeLadderEditor();
        }, 800);
      } catch (err) {
        console.error('Failed to save ladder config', err);
        if (ladderEditorStatus) {
          ladderEditorStatus.textContent = `Save failed • Error: ${err?.message || 'Unknown error'}`;
          ladderEditorStatus.classList.remove('text-emerald-600');
          ladderEditorStatus.classList.add('text-red-600');
        }
      } finally {
        ladderEditorSubmit.disabled = false;
        ladderEditorSubmit.textContent = 'Save changes';
      }
    });
  }

  chatState.panel = document.getElementById('guideChatPanel');
  chatState.toggle = document.getElementById('guideChatToggle');
  chatState.close = document.getElementById('guideChatClose');
  chatState.tour = document.getElementById('guideChatTour');
  chatState.messages = document.getElementById('guideChatMessages');
  chatState.form = document.getElementById('guideChatForm');
  chatState.input = document.getElementById('guideChatInput');
  chatState.categories = document.getElementById('guideChatCategories');
  chatState.prompts = document.getElementById('guideChatPrompts');
  initChatPromptMenu();

  if(chatState.messages && pendingChatMessages.length){
    const items = pendingChatMessages.splice(0, pendingChatMessages.length);
    items.forEach(msg => appendChatMessage(msg.role, msg.content, { html: msg.html }));
  }

  chatState.toggle?.addEventListener('click', () => openChatCoach());
  chatState.close?.addEventListener('click', () => closeChatCoach());
  chatState.tour?.addEventListener('click', () => {
    openChatCoach({ focusInput: false });
    startTour({ resume: false });
  });
  chatState.form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if(!chatState.input) return;
    const value = chatState.input.value.trim();
    chatState.input.value = '';
    if(value) sendChatMessage(value);
  });
  document.addEventListener('keydown', (event) => {
    if(event.key === 'Escape' && chatState.isOpen){
      closeChatCoach();
    }
  });

  if(pendingChatOpen || localStorage.getItem('dashboardChatOpen') === '1'){
    openChatCoach({ focusInput: false });
    pendingChatOpen = false;
  }

  const feedEl = document.getElementById('newsFeed');
  if (feedEl) {
    fetch('/api/settings')
      .then(r => r.json())
      .then(cfg => {
        const rssUrl = cfg.settings?.rssFeedUrl || 'https://hnrss.org/frontpage';
        const apiUrl = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(rssUrl);
        return fetch(apiUrl);
      })
      .then(r => r.json())
      .then(data => {
        const items = data.items || [];
        if (!items.length) {
          feedEl.textContent = 'No news available.';
          return;
        }
        feedEl.innerHTML = items.slice(0,5).map(item => {
          return `<div class="news-item"><a href="${item.link}" target="_blank" class="text-accent underline">${item.title}</a></div>`;
        }).join('');
      })
      .catch(err => {
        console.error('Failed to load news feed', err);
        feedEl.textContent = 'Failed to load news.';
      });
  }

  const msgList = document.getElementById('msgList');

  async function renderMessages(){
    if(!msgList) return;
    try{
      const resp = await fetch('/api/messages');
      if(!resp.ok) throw new Error('bad response');
      const data = await resp.json().catch(()=>({}));
      const msgs = Array.isArray(data.messages) ? data.messages : [];

      if(!msgs.length){
        msgList.textContent = 'No messages.';
        return;
      }
      msgList.innerHTML = msgs.map(m=>{
        const sender = m.payload?.from === 'client' ? 'Client' : m.payload?.from || 'Host';
        return `<div><span class="font-medium">${escapeHtml(m.consumer?.name || '')} - ${escapeHtml(sender)}:</span> ${escapeHtml(m.payload?.text || '')}</div>`;
      }).join('');
    }catch(e){
      console.error('Failed to load messages', e);
      msgList.textContent = 'Failed to load messages.';
    }
  }

  if(msgList){
    renderMessages();
  }

  const eventList = document.getElementById('eventList');

  async function renderEvents(){
    if(!eventList) return;
    try{
      const resp = await fetch('/api/calendar/events');
      if(!resp.ok) throw new Error('bad response');
      const data = await resp.json();
      const events = Array.isArray(data.events) ? data.events : [];
      if(!events.length){
        eventList.textContent = 'No events.';
        return;
      }
      eventList.innerHTML = events.map(ev => {
        const start = ev.start?.dateTime || ev.start?.date || '';
        return `<div>${escapeHtml(ev.summary || '')} - ${escapeHtml(start)}</div>`;
      }).join('');
    }catch(e){
      console.error('Failed to load events', e);
      eventList.textContent = 'Failed to load events.';
    }
  }

  if(eventList){
    renderEvents();
  }

  const noteEl = document.getElementById('dashNote');
  const titleEl = document.getElementById('dashNoteTitle');
  const selectEl = document.getElementById('noteSelect');
  const saveBtn = document.getElementById('dashSaveNote');
  if (noteEl && saveBtn && titleEl && selectEl) {
    let notes = JSON.parse(localStorage.getItem('dashNotes') || '[]');
    let selectedIdx = -1;
    function renderNotes(){
      const opts = ['<option value="">Select saved note...</option>'];
      notes.forEach((n,i)=> opts.push(`<option value="${i}">${escapeHtml(n.title)}</option>`));
      selectEl.innerHTML = opts.join('');
      if(selectedIdx >= 0) selectEl.value = String(selectedIdx);
    }
    renderNotes();
    selectEl.addEventListener('change', () => {
      selectedIdx = selectEl.value === '' ? -1 : Number(selectEl.value);
      if(selectedIdx === -1){ titleEl.value = ''; noteEl.value = ''; return; }
      const n = notes[selectedIdx];
      titleEl.value = n.title;
      noteEl.value = n.content;
    });

    function saveNote(){
      const title = titleEl.value.trim() || 'Untitled';
      const content = noteEl.value;
      if(selectedIdx >= 0){
        notes[selectedIdx] = { title, content };
      } else {
        notes.push({ title, content });
        selectedIdx = notes.length - 1;
      }
      localStorage.setItem('dashNotes', JSON.stringify(notes));
      renderNotes();
    }

    saveBtn.addEventListener('click', () => {
      saveNote();
    });

    let autoSaveTimer;
    function scheduleAutoSave(){
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(saveNote, 1000);
    }
    noteEl.addEventListener('input', scheduleAutoSave);
    titleEl.addEventListener('input', scheduleAutoSave);
  }

  const safeTotal = (items, key) => items.reduce((sum, item) => {
    const raw = item?.[key];
    const num = typeof raw === 'number' ? raw : Number.parseFloat(raw || '');
    return sum + (Number.isFinite(num) ? num : 0);
  }, 0);

  (async () => {
    try {
      const [summaryRes, consumersRes, leadsRes] = await Promise.all([
        api('/api/dashboard/summary'),
        api('/api/consumers'),
        api('/api/leads')
      ]);

      const summary = summaryRes?.ok ? (summaryRes.summary || null) : null;
      const consumers = Array.isArray(consumersRes.consumers) ? consumersRes.consumers : [];
      const leads = Array.isArray(leadsRes.leads) ? leadsRes.leads : [];

      prepareClientLocationBreakdown(consumers);

      const totalSales = safeTotal(consumers, 'sale');
      const totalPaid = safeTotal(consumers, 'paid');

      const totalLeads = Number.isFinite(summary?.totals?.leads) ? summary.totals.leads : leads.length;
      const totalConsumers = Number.isFinite(summary?.totals?.consumers) ? summary.totals.consumers : consumers.length;

      setTextContent('dashLeads', totalLeads.toLocaleString());
      setTextContent('dashClients', totalConsumers.toLocaleString());
      setTextContent('dashSales', formatCurrency(Number.isFinite(summary?.revenue?.totalBilled) ? summary.revenue.totalBilled : totalSales));
      setTextContent('dashPayments', formatCurrency(Number.isFinite(summary?.revenue?.totalCollected) ? summary.revenue.totalCollected : totalPaid));

      const completedLeads = leads.filter(l => l.status === 'completed').length;
      const droppedLeads = leads.filter(l => l.status === 'dropped').length;
      const completedClients = consumers.filter(c => c.status === 'completed').length;
      const droppedClients = consumers.filter(c => c.status === 'dropped').length;
      const retentionDen = completedLeads + completedClients + droppedLeads + droppedClients;
      const retention = retentionDen ? ((completedLeads + completedClients) / retentionDen * 100) : 0;
      const conversionDen = leads.length;
      const conversion = conversionDen ? (completedLeads / conversionDen * 100) : 0;

      if (Number.isFinite(summary?.kpis?.retentionRate)) {
        setTextContent('dashRetention', formatPercent(summary.kpis.retentionRate));
      } else {
        setTextContent('dashRetention', `${retention.toFixed(1)}%`);
      }
      if (Number.isFinite(summary?.kpis?.leadToConsultRate)) {
        setTextContent('dashConversion', formatPercent(summary.kpis.leadToConsultRate));
      } else {
        setTextContent('dashConversion', `${conversion.toFixed(1)}%`);
      }

      if (summary) {
        currentSummarySnapshot = summary;
        currentMonthlyRecurringRevenue = Number.isFinite(summary.revenue?.monthlyRecurringRevenue)
          ? summary.revenue.monthlyRecurringRevenue
          : null;
        applyLadderConfig(summary.ladder, summary.goals);
        updateRevenueLadder(currentMonthlyRecurringRevenue, summary.goals?.monthlyRecurringTarget);
        updateGoalKpiLabel(summary);
        updateNextRevenueWin(summary.focus?.nextRevenueMove);
        renderFocusList(summary);
        updateHeroCards(summary);
      } else {
        currentSummarySnapshot = null;
        currentMonthlyRecurringRevenue = null;
        applyLadderConfig(null, null);
        updateRevenueLadder(null, null);
        updateGoalKpiLabel(null);
        updateNextRevenueWin(null);
        renderFocusList({});
        updateHeroCards({});
      }

      renderClientLocations('clientMap', { forceRefresh: true });
      detailModalController.setGenerators({
        leads: () => buildMetricDataset({
          title: 'Lead Intake',
          subtitle: 'Monthly snapshot of new leads captured.',
          label: 'Leads per month',
          color: '#a855f7',
          items: leads,
          getValue: () => 1,
          timelineFormatter: (lead, date) => ({
            title: lead.name || 'Lead',
            subtitle: lead.status ? `Status: ${lead.status}` : 'Status not set',
            meta: timelineDateFormatter.format(date),
            value: lead.source ? `Source: ${lead.source}` : ''
          })
        }),
        clients: () => buildMetricDataset({
          title: 'Client Growth',
          subtitle: 'Clients activated in the last six months.',
          label: 'Clients per month',
          color: '#38bdf8',
          items: consumers,
          getValue: () => 1,
          timelineFormatter: (client, date) => ({
            title: client.name || 'Client',
            subtitle: `Status: ${client.status || 'active'}`,
            meta: timelineDateFormatter.format(date),
            value: client.sale ? formatCurrency(client.sale) : ''
          })
        }),
        sales: () => buildMetricDataset({
          title: 'Sales Revenue',
          subtitle: 'Signed contract value by month.',
          label: 'Sales ($)',
          color: '#22c55e',
          items: consumers,
          getValue: (consumer) => Number(consumer.sale) || 0,
          formatValue: (value) => formatCurrency(value || 0),
          timelineFormatter: (consumer, date) => ({
            title: consumer.name || 'Client',
            subtitle: 'Sale recorded',
            meta: timelineDateFormatter.format(date),
            value: formatCurrency(Number(consumer.sale) || 0)
          }),
          filter: (consumer) => Number(consumer.sale) > 0
        }),
        payments: () => buildMetricDataset({
          title: 'Payments Collected',
          subtitle: 'Cash collected from clients.',
          label: 'Payments ($)',
          color: '#f97316',
          items: consumers,
          getValue: (consumer) => Number(consumer.paid) || 0,
          formatValue: (value) => formatCurrency(value || 0),
          timelineFormatter: (consumer, date) => ({
            title: consumer.name || 'Client',
            subtitle: 'Latest payment captured',
            meta: timelineDateFormatter.format(date),
            value: formatCurrency(Number(consumer.paid) || 0)
          }),
          filter: (consumer) => Number(consumer.paid) > 0
        })
      });
    } catch (err) {
      console.error('Failed to load dashboard stats', err);
      renderClientLocationChart([]);
    }
  })();

  syncTourWidget();
});

window.addEventListener('crm:tutorial-request', (event) => {
  const mode = event?.detail?.mode || 'start';
  if(mode === 'resume'){
    startTour({ resume: true });
  } else {
    startTour({ resume: false });
  }
});

window.addEventListener('crm:tutorial-reset', () => {
  handleTutorialReset();
});

window.addEventListener('crm:assistant-request', () => {
  openChatCoach();
});

refreshHelpGuideState();
