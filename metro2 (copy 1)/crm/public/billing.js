// public/billing.js
const $ = (s) => document.querySelector(s);
const api = (u,o={}) => fetch(u,o).then(r=>r.json());
function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }

const consumerId = getSelectedConsumerId();

if(!consumerId){
  document.getElementById('noClient').classList.remove('hidden');
} else {
  document.getElementById('billingContent').classList.remove('hidden');
  loadInvoices();
}

async function loadInvoices(){
  const data = await api(`/api/invoices/${consumerId}`);
  const list = $('#invoiceList');
  list.innerHTML = '';
  (data.invoices||[]).forEach(inv=>{
    const div = document.createElement('div');
    div.className = 'glass card flex items-center justify-between';
    div.innerHTML = `
      <div>
        <div class="font-medium">${escapeHtml(inv.desc)}</div>
        <div class="text-sm muted">$${inv.amount.toFixed(2)}${inv.due?` • due ${inv.due}`:''}</div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-sm">${inv.paid? 'Paid' : 'Unpaid'}</span>
        ${inv.paid? '' : `<button class="btn text-sm" data-id="${inv.id}">Mark Paid</button>`}
      </div>`;
    const btn = div.querySelector('button');
    if(btn){
      btn.addEventListener('click', async ()=>{
        await api(`/api/invoices/${inv.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({paid:true}) });
        loadInvoices();
      });
    }
    list.appendChild(div);
  });
}

$('#invoiceForm')?.addEventListener('submit', async e=>{
  e.preventDefault();
  const desc = $('#invDesc').value.trim();
  const amount = parseFloat($('#invAmount').value) || 0;
  const due = $('#invDue').value;
  if(!desc || !amount){ return; }
  await api('/api/invoices', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ consumerId, desc, amount, due }) });
  $('#invDesc').value='';
  $('#invAmount').value='';
  $('#invDue').value='';
  loadInvoices();
});
