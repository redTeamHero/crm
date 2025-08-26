// public/library.js
const $ = (s) => document.querySelector(s);
const api = (u,o={}) => fetch(u,o).then(r=>r.json());

function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }

async function loadAll(){
  const [tplData, jobData] = await Promise.all([
    api('/api/templates'),
    api('/api/letters')
  ]);
  renderLetterJobs(jobData.jobs || []);
  renderTemplates(tplData.templates||[]);
  renderSequences(tplData.sequences||[]);
  renderContracts(tplData.contracts||[]);
}

function renderLetterJobs(list){
  let card = document.getElementById('jobCard');
  if(!card){
    card = document.createElement('div');
    card.id = 'jobCard';
    card.className = 'glass card';
    card.innerHTML = '<div class="font-medium mb-2">Generated Letters</div><div id="jobList" class="space-y-1 text-sm"></div>';
    document.querySelector('main').prepend(card);
  }
  const wrap = card.querySelector('#jobList');
  wrap.innerHTML = '';
  list.forEach(j=>{
    const div = document.createElement('div');
    div.innerHTML = `<a href="/letters?job=${encodeURIComponent(j.jobId)}" class="text-blue-600 underline">Job ${j.jobId} (${j.count}) ${escapeHtml(j.consumerName||'')}</a>`;
    wrap.appendChild(div);
  });
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
