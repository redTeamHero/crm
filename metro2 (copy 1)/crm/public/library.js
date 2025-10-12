let templates = [];
let sequences = [];
let currentTemplateId = null;
let currentSequenceId = null;
let currentRequestType = 'correct';
let defaultPack = [];
let contracts = [];

const defaultPackGrid = document.getElementById('defaultPackGrid');
const defaultPackEmpty = document.getElementById('defaultPackEmpty');
const defaultPackStatus = document.getElementById('defaultPackStatus');
const refreshDefaultsBtn = document.getElementById('refreshDefaults');

const contractList = document.getElementById('contractList');
const contractEmpty = document.getElementById('contractEmpty');
const contractStatus = document.getElementById('contractStatus');
const contractModal = document.getElementById('contractModal');
const contractForm = document.getElementById('contractForm');
const btnNewContract = document.getElementById('btnNewContract');

function templateLabel(t){
  return t?.heading || t?.name || '(no heading)';
}

function snippet(text, limit = 180){
  const value = (text || '').replace(/\s+/g, ' ').trim();
  if(!value) return '';
  return value.length > limit ? `${value.slice(0, limit).trim()}…` : value;
}

function normalizeTemplateShape(t){
  if(!t) return null;
  return {
    id: t.id,
    heading: t.heading || t.name || '',
    intro: t.intro || '',
    ask: t.ask || '',
    afterIssues: t.afterIssues || '',
    evidence: t.evidence || '',
    requestType: t.requestType || 'correct'
  };
}

function normalizeContractShape(contract){
  if(!contract) return null;
  return {
    ...contract,
    english: contract.english || contract.body || '',
    spanish: contract.spanish || ''
  };
}

function showStatus(el, message, tone = 'success'){
  if(!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  if(tone === 'error'){
    el.classList.remove('bg-emerald-100','text-emerald-700');
    el.classList.add('bg-rose-100','text-rose-700');
  } else {
    el.classList.remove('bg-rose-100','text-rose-700');
    el.classList.add('bg-emerald-100','text-emerald-700');
  }
  window.setTimeout(()=>{ el.classList.add('hidden'); }, 4000);
}

function renderDefaultPack(){
  if(!defaultPackGrid) return;
  defaultPackGrid.innerHTML = '';
  const normalized = defaultPack.map(normalizeTemplateShape).filter(Boolean);
  if(!normalized.length){
    if(defaultPackEmpty) defaultPackEmpty.classList.remove('hidden');
    return;
  }
  if(defaultPackEmpty) defaultPackEmpty.classList.add('hidden');
  const sortedOptions = [...templates.map(normalizeTemplateShape).filter(Boolean)].sort((a,b)=> templateLabel(a).localeCompare(templateLabel(b)));
  normalized.forEach((tpl, idx)=>{
    const card = document.createElement('article');
    card.className = 'library-pack-card';
    const header = document.createElement('div');
    header.className = 'library-pack-card__header';
    const title = document.createElement('h3');
    title.className = 'library-pack-card__title';
    title.textContent = `${idx+1}. ${templateLabel(tpl)}`;
    const badge = document.createElement('span');
    badge.className = 'library-tag';
    badge.textContent = tpl.requestType === 'delete' ? 'Delete' : 'Correct';
    header.appendChild(title);
    header.appendChild(badge);

    const body = document.createElement('p');
    body.className = 'library-pack-card__body';
    body.textContent = snippet(tpl.intro || tpl.ask || tpl.afterIssues, 160) || 'Draft ready for copy.';

    const selectWrapper = document.createElement('div');
    selectWrapper.className = 'library-pack-card__control';
    const label = document.createElement('label');
    label.className = 'library-pack-card__label';
    label.textContent = 'Swap Template / Cambiar plantilla';
    const select = document.createElement('select');
    select.className = 'input text-sm library-select';
    sortedOptions.forEach(option => {
      const opt = document.createElement('option');
      opt.value = option.id;
      opt.textContent = templateLabel(option);
      if(option.id === tpl.id) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', async (event)=>{
      const newId = event.target.value;
      if(!newId || newId === tpl.id) return;
      event.target.disabled = true;
      try{
        const res = await fetch('/api/templates/defaults', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slotId: tpl.id, templateId: newId })
        });
        const data = await res.json().catch(()=>({}));
        if(!data.ok){
          throw new Error(data.error || 'Failed to update default pack.');
        }
        defaultPack = data.templates || [];
        renderDefaultPack();
        showStatus(defaultPackStatus, 'Default pack updated • Pack actualizado');
      } catch(err){
        window.alert(err.message || String(err));
        event.target.value = tpl.id;
        showStatus(defaultPackStatus, err.message || 'Update failed', 'error');
      } finally {
        event.target.disabled = false;
      }
    });
    selectWrapper.appendChild(label);
    selectWrapper.appendChild(select);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(selectWrapper);
    defaultPackGrid.appendChild(card);
  });
}

async function loadDefaultPack(){
  if(!defaultPackGrid) return;
  try{
    const res = await fetch('/api/templates/defaults');
    const data = await res.json().catch(()=>({}));
    defaultPack = data.templates || [];
    renderDefaultPack();
  } catch(err){
    showStatus(defaultPackStatus, err.message || 'Unable to load default pack', 'error');
  }
}

function renderContracts(){
  if(!contractList) return;
  contractList.innerHTML = '';
  const items = contracts.map(normalizeContractShape).filter(Boolean);
  if(!items.length){
    if(contractEmpty) contractEmpty.classList.remove('hidden');
    return;
  }
  if(contractEmpty) contractEmpty.classList.add('hidden');
  items.forEach(contract => {
    const li = document.createElement('li');
    li.className = 'library-contract-card';
    const header = document.createElement('div');
    header.className = 'library-contract-card__header';
    const title = document.createElement('h3');
    title.className = 'text-sm font-semibold text-slate-700';
    title.textContent = contract.name || 'Contract';
    const badge = document.createElement('span');
    badge.className = 'library-tag library-tag--neutral';
    badge.textContent = 'EN / ES';
    header.appendChild(title);
    header.appendChild(badge);

    const english = document.createElement('p');
    english.className = 'library-contract-card__copy text-slate-600 whitespace-pre-wrap';
    english.textContent = snippet(contract.english, 260) || '—';

    const spanish = document.createElement('p');
    spanish.className = 'library-contract-card__copy is-spanish whitespace-pre-wrap';
    spanish.textContent = snippet(contract.spanish, 260) || 'Añade versión en español para cerrar más ventas.';

    const actions = document.createElement('div');
    actions.className = 'library-contract-card__actions';
    const copyEn = document.createElement('button');
    copyEn.type = 'button';
    copyEn.className = 'btn text-xs';
    copyEn.textContent = 'Copy EN';
    copyEn.addEventListener('click', async ()=>{
      try{
        await navigator.clipboard.writeText(contract.english || '');
        showStatus(contractStatus, 'Copied English contract • Copiado EN');
      } catch(err){
        showStatus(contractStatus, 'Clipboard blocked', 'error');
      }
    });
    const copyEs = document.createElement('button');
    copyEs.type = 'button';
    copyEs.className = 'btn text-xs';
    copyEs.textContent = 'Copy ES';
    copyEs.addEventListener('click', async ()=>{
      try{
        await navigator.clipboard.writeText(contract.spanish || '');
        showStatus(contractStatus, 'Copied Spanish contract • Copiado ES');
      } catch(err){
        showStatus(contractStatus, 'Clipboard blocked', 'error');
      }
    });
    actions.appendChild(copyEn);
    actions.appendChild(copyEs);

    li.appendChild(header);
    li.appendChild(english);
    li.appendChild(spanish);
    li.appendChild(actions);
    contractList.appendChild(li);
  });
}

function openContractModal(){
  if(!contractModal) return;
  contractModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeContractModal(){
  if(!contractModal) return;
  contractModal.style.display = 'none';
  document.body.style.overflow = '';
  if(contractForm) contractForm.reset();
}

async function handleContractSubmit(event){
  event.preventDefault();
  if(!contractForm) return;
  const formData = new FormData(contractForm);
  const payload = {
    name: formData.get('name')?.toString().trim() || '',
    english: formData.get('english')?.toString().trim() || '',
    spanish: formData.get('spanish')?.toString().trim() || ''
  };
  if(!payload.name || !payload.english){
    showStatus(contractStatus, 'Name and English body required • Completa nombre y versión EN', 'error');
    return;
  }
  try{
    const res = await fetch('/api/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(()=>({}));
    if(!data.ok){
      throw new Error(data.error || 'Failed to save contract');
    }
    contracts.unshift(data.contract);
    renderContracts();
    showStatus(contractStatus, 'Contract saved • Contrato guardado');
    closeContractModal();
  } catch(err){
    showStatus(contractStatus, err.message || 'Failed to save contract', 'error');
  }
}

async function loadLibrary(){
  const res = await fetch('/api/templates');
  const data = await res.json().catch(()=>({}));
  templates = data.templates || [];
  contracts = data.contracts || [];
  const sampleRes = await fetch('/api/sample-letters');
  const sampleData = await sampleRes.json().catch(()=>({}));
  const sampleTemplates = (sampleData.templates || []).map(t => ({
    id: t.id,
    heading: t.name,
    intro: t.english,
    spanish: t.spanish
  }));
  templates = [...templates, ...sampleTemplates];
  const seenIds = new Set();
  templates = templates.filter(t => {
    if(seenIds.has(t.id)) return false;
    seenIds.add(t.id);
    return true;
  });
  sequences = data.sequences || [];
  renderTemplates();
  renderSequences();
  renderContracts();
  loadDefaultPack();
}

function renderList(items, containerId, clickHandler){
  const list = document.getElementById(containerId);
  if(!list) return;
  list.innerHTML = '';
  const sorted = [...items].sort((a,b)=>(a.heading||'').localeCompare(b.heading||''));
  sorted.forEach(t => {
    const div = document.createElement('div');
    div.textContent = t.heading || '(no heading)';
    div.className = 'library-pill';
    div.draggable = true;
    div.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', t.id);
    });
    div.onclick = () => clickHandler(t.id);
    list.appendChild(div);
  });
}

function renderTemplates(){
  renderList(templates, 'templateList', editTemplate);
  renderDefaultPack();
}

function showTemplateEditor(){
  const modal = document.getElementById('templateModal');
  if(modal) modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function hideTemplateEditor(){
  const modal = document.getElementById('templateModal');
  if(modal) modal.style.display = 'none';
  document.body.style.overflow = '';
  currentTemplateId = null;
  ['tplHeading','tplIntro','tplAsk','tplAfter','tplEvidence'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  currentRequestType = 'correct';
  const typeSelect = document.getElementById('tplType');
  if(typeSelect){
    typeSelect.value = currentRequestType;
  }
  updatePreview();
}

function editTemplate(id){
  const tpl = templates.find(t => t.id === id) || {};
  currentTemplateId = id;
  showTemplateEditor();
  document.getElementById('tplHeading').value = tpl.heading || '';
  currentRequestType = tpl.requestType || 'correct';
  const typeSelect = document.getElementById('tplType');
  if(typeSelect){
    typeSelect.value = currentRequestType;
  }
  document.getElementById('tplIntro').value = tpl.intro || '';
  document.getElementById('tplAsk').value = tpl.ask || '';
  document.getElementById('tplAfter').value = tpl.afterIssues || '';
  document.getElementById('tplEvidence').value = tpl.evidence || '';
  updatePreview();
}

function openTemplateEditor(){
  currentTemplateId = null;
  showTemplateEditor();
  ['tplHeading','tplIntro','tplAsk','tplAfter','tplEvidence'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.value='';
  });
  currentRequestType = 'correct';
  const typeSelect = document.getElementById('tplType');
  if(typeSelect){
    typeSelect.value = currentRequestType;
  }
  updatePreview();
}

async function upsertTemplate(payload){
  const res = await fetch('/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(()=>({}));
  if(data.template){
    const existing = templates.find(t => t.id === data.template.id);
    if(existing){ Object.assign(existing, data.template); }
    else { templates.push(data.template); }
    renderTemplates();
    const selected = Array.from(document.querySelectorAll('#seqTemplates input[type="checkbox"]:checked')).map(cb => cb.value);
    renderSeqTemplateOptions(selected);
    return data.template.id;
  }
}

async function saveTemplate(){
  const payload = {
    heading: document.getElementById('tplHeading').value,
    requestType: currentRequestType,
    intro: document.getElementById('tplIntro').value,
    ask: document.getElementById('tplAsk').value,
    afterIssues: document.getElementById('tplAfter').value,
    evidence: document.getElementById('tplEvidence').value
  };
  if(currentTemplateId) payload.id = currentTemplateId;
  const id = await upsertTemplate(payload);
  if(id) editTemplate(id);
}

function saveTemplateAsNew(){
  currentTemplateId = null;
  saveTemplate();
}

function updatePreview(){
  const heading = document.getElementById('tplHeading').value;
  const intro = document.getElementById('tplIntro').value;
  const ask = document.getElementById('tplAsk').value;
  const after = document.getElementById('tplAfter').value;
  const evidence = document.getElementById('tplEvidence').value;
  const preview = [heading, intro, ask, after, evidence].filter(Boolean).join('\n\n');
  document.getElementById('tplPreview').textContent = preview;
}

function renderSequences(){
  const list = document.getElementById('sequenceList');
  list.innerHTML = '';
  sequences.forEach(s => {
    const div = document.createElement('div');
    div.textContent = s.name || '(no name)';
    div.className = 'library-pill library-pill--ghost';
    div.onclick = () => editSequence(s.id);
    list.appendChild(div);
  });
}

function renderSeqTemplateOptions(selected){
  const container = document.getElementById('seqTemplates');
  container.innerHTML = '';
  templates.forEach(t => {
    const label = document.createElement('label');
    label.className = 'library-seq-option';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = t.id;
    cb.checked = selected.includes(t.id);
    label.appendChild(cb);
    label.append(t.heading || '(no heading)');
    container.appendChild(label);
  });
}

function editSequence(id){
  const seq = sequences.find(s => s.id === id) || {};
  currentSequenceId = id;
  document.getElementById('seqName').value = seq.name || '';
  renderSeqTemplateOptions(seq.templates || []);
}

function newSequence(){
  currentSequenceId = null;
  document.getElementById('seqName').value = '';
  renderSeqTemplateOptions([]);
}

async function saveSequence(){
  const selected = Array.from(document.querySelectorAll('#seqTemplates input[type="checkbox"]:checked')).map(cb => cb.value);
  const payload = {
    name: document.getElementById('seqName').value,
    templates: selected
  };
  if (currentSequenceId != null) payload.id = currentSequenceId;

  const res = await fetch('/api/sequences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(()=>({}));
  if(data.sequence){
    const existing = sequences.find(s => s.id === data.sequence.id);
    if(existing){ Object.assign(existing, data.sequence); }
    else { sequences.push(data.sequence); }
    renderSequences();
    editSequence(data.sequence.id);
  }
}

document.getElementById('saveTemplate').onclick = saveTemplate;
document.getElementById('saveTemplateCopy').onclick = saveTemplateAsNew;
document.getElementById('newTemplate').onclick = openTemplateEditor;
document.getElementById('cancelTemplate').onclick = hideTemplateEditor;
document.getElementById('saveSequence').onclick = saveSequence;
document.getElementById('newSequence').onclick = newSequence;

const templateModal = document.getElementById('templateModal');
if(templateModal){
  templateModal.addEventListener('click', e => {
    if(e.target.id === 'templateModal') hideTemplateEditor();
  });
}

const tplTypeSelect = document.getElementById('tplType');
if(tplTypeSelect){
  tplTypeSelect.addEventListener('change', e => {
    currentRequestType = e.target.value || 'correct';
  });
}

if(btnNewContract){
  btnNewContract.addEventListener('click', openContractModal);
}
if(contractForm){
  contractForm.addEventListener('submit', handleContractSubmit);
}
document.querySelectorAll('[data-close-contract]').forEach(btn => btn.addEventListener('click', closeContractModal));
if(contractModal){
  contractModal.addEventListener('click', e => {
    if(e.target.id === 'contractModal') closeContractModal();
  });
}
if(refreshDefaultsBtn){
  refreshDefaultsBtn.addEventListener('click', () => loadDefaultPack());
}

['tplHeading','tplIntro','tplAsk','tplAfter','tplEvidence'].forEach(id => {
  document.getElementById(id).addEventListener('input', updatePreview);
});

const preview = document.getElementById('tplPreview');
if(preview){
  preview.addEventListener('dragover', e=> e.preventDefault());
  preview.addEventListener('drop', e=> {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if(id) editTemplate(id);
  });
}

loadLibrary();

