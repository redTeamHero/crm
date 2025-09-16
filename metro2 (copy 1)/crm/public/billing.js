// public/billing.js
import { api, escapeHtml } from './common.js';
const $ = (s) => document.querySelector(s);

const consumerId = getSelectedConsumerId();

if(!consumerId){
  document.getElementById('noClient').classList.remove('hidden');
} else {
  document.getElementById('billingContent').classList.remove('hidden');
  loadInvoices();
}

async function loadInvoices(){
  const data = await api(`/api/invoices/${consumerId}`);
  const body = $('#invoiceBody');
  const newRow = document.getElementById('invNewRow');
  body.innerHTML = '';
  if(newRow) body.appendChild(newRow);
  (data.invoices||[]).forEach(inv=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(inv.desc)}</td>
      <td>$${inv.amount.toFixed(2)}</td>
      <td>${inv.due || ''}</td>
      <td><span class="badge ${inv.paid ? 'badge-paid' : 'badge-unpaid'}">${inv.paid ? 'Paid' : 'Unpaid'}</span></td>
      <td class="flex gap-2 items-center">
        ${inv.pdf ? `<a class="btn text-sm" target="_blank" href="/api/consumers/${consumerId}/state/files/${inv.pdf}">PDF</a>` : ''}
        ${inv.paid ? '' : `<button class="btn text-sm mark-paid" data-id="${inv.id}">Mark Paid</button>`}
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
}

document.getElementById('invAdd')?.addEventListener('click', async ()=>{
  const desc = $('#invDesc').value.trim();
  const amount = parseFloat($('#invAmount').value) || 0;
  const due = $('#invDue').value;
  if(!desc || !amount) return;
  const company = JSON.parse(localStorage.getItem('companyInfo')||'{}');
  await api('/api/invoices', { method:'POST', body: JSON.stringify({ consumerId, desc, amount, due, company }) });
  $('#invDesc').value='';
  $('#invAmount').value='';
  $('#invDue').value='';
  loadInvoices();
});
