// public/library.js
const $ = (s) => document.querySelector(s);
const api = (u,o={}) => fetch(u,o).then(r=>r.json());

function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }

async function loadAll(){
  const data = await api('/api/templates');
  renderTemplates(data.templates||[]);
  renderSequences(data.sequences||[]);
  renderContracts(data.contracts||[]);
}

function renderTemplates(list){
  const wrap = $('#tplList');
  wrap.innerHTML = '';
  list.forEach(t=>{
    const div = document.createElement('div');
    div.className = 'glass card';
    div.innerHTML = `<div class="font-medium">${escapeHtml(t.name)}</div>`;
    wrap.appendChild(div);
  });
}
function renderSequences(list){
  const wrap = $('#seqList');
  wrap.innerHTML = '';
  list.forEach(s=>{
    const div = document.createElement('div');
    div.className = 'glass card';
    div.innerHTML = `<div class="font-medium">${escapeHtml(s.name)}</div><div class="text-sm muted">${s.templates.join(', ')}</div>`;
    wrap.appendChild(div);
  });
}
function renderContracts(list){
  const wrap = $('#contractList');
  wrap.innerHTML='';
  list.forEach(c=>{
    const div = document.createElement('div');
    div.className='glass card';
    div.innerHTML=`<div class="font-medium">${escapeHtml(c.name)}</div>`;
    wrap.appendChild(div);
  });
}

$('#tplForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const name = $('#tplName').value.trim();
  const body = $('#tplBody').value.trim();
  if(!name || !body) return;
  await api('/api/templates', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, body }) });
  $('#tplName').value=''; $('#tplBody').value='';
  loadAll();
});

$('#seqForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const name = $('#seqName').value.trim();
  const templates = $('#seqTemplates').value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!name) return;
  await api('/api/sequences', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, templates }) });
  $('#seqName').value=''; $('#seqTemplates').value='';
  loadAll();
});

$('#contractForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const name = $('#contractName').value.trim();
  const body = $('#contractBody').value.trim();
  if(!name || !body) return;
  await api('/api/contracts', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, body }) });
  $('#contractName').value=''; $('#contractBody').value='';
  loadAll();
});

loadAll();
