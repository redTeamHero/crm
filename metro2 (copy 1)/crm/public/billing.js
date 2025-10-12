// public/billing.js
import { api, escapeHtml, formatCurrency } from './common.js';
const $ = (s) => document.querySelector(s);

const consumerId = getSelectedConsumerId();

if(!consumerId){
  document.getElementById('noClient').classList.remove('hidden');
} else {
  document.getElementById('billingContent').classList.remove('hidden');
  loadInvoices();
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const autopaySwitch = document.getElementById('autopaySwitch');
const autopayStatusEl = document.getElementById('autopayStatus');
const autopayCopyEl = document.getElementById('autopayCopy');
const autopaySwitchLabel = document.getElementById('autopaySwitchLabel');
const autopayStorageKey = consumerId ? `autopay:${consumerId}` : null;

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

async function loadInvoices(){
  const data = await api(`/api/invoices/${consumerId}`);
  const body = $('#invoiceBody');
  body.innerHTML = '';
  const invoices = data.invoices || [];
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
    const statusBadge = `<span class="badge ${inv.paid ? 'badge-paid' : 'badge-unpaid'}">${inv.paid ? 'Paid · Pagado' : 'Unpaid · Pendiente'}</span>`;
    const dueBadge = dueSoon ? '<span class="badge badge-unpaid ml-2">Due soon · Vence pronto</span>' : '';

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
          ${inv.pdf ? `<a class="btn text-sm" target="_blank" href="/api/consumers/${consumerId}/state/files/${inv.pdf}">PDF</a>` : ''}
          ${inv.paid ? '' : `<button class="btn text-sm mark-paid" data-id="${inv.id}">Mark paid · Marcar pagado</button>`}
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
      nextDescEl.textContent = `Invoice: ${nextDue.desc}`;
    }
  } else {
    nextDueEl && (nextDueEl.textContent = '—');
    nextAmountEl && (nextAmountEl.textContent = '—');
    nextDescEl && (nextDescEl.textContent = 'No open invoices · No hay facturas abiertas.');
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
    autopayStatusEl.textContent = enabled ? 'Autopay on · Cargo automático activado' : 'Autopay off · Cargo automático desactivado';
  }
  if(autopayCopyEl){
    autopayCopyEl.textContent = enabled
      ? 'We will process nightly drafts and email receipts automatically. Procesaremos cargos nocturnos y enviaremos recibos automáticos.'
      : 'Turn this on to draft recurring invoices and stay Metro-2 compliant. Activa esta opción para automatizar facturas recurrentes con cumplimiento Metro-2.';
  }
  if(autopaySwitchLabel){
    autopaySwitchLabel.textContent = enabled ? 'Pause autopay · Pausar cargo automático' : 'Enable autopay · Activar cargo automático';
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
