import { setupPageTour } from './tour-guide.js';

setupPageTour('settings-library', {
  steps: [
    {
      id: 'library-nav',
      title: 'Navigation',
      text: `<p class="font-semibold">Jump between Library, Letters, Workflows, and Billing.</p>
             <p class="mt-1 text-xs text-slate-600">Keep playbooks, templates, and contracts in lockstep.</p>`,
      attachTo: { element: '#primaryNav', on: 'bottom' }
    },
    {
      id: 'library-hero',
      title: 'Template hero',
      text: `<p class="font-semibold">Showcase your premium content strategy.</p>
             <p class="mt-1 text-xs text-slate-600">Use these metrics to anchor marketing and fulfillment conversations.</p>`,
      attachTo: { element: '#libraryHero', on: 'top' }
    },
    {
      id: 'library-contracts',
      title: 'Contracts',
      text: `<p class="font-semibold">Draft compliance-ready agreements.</p>
             <p class="mt-1 text-xs text-slate-600">Use them to upsell retainers and document deliverables.</p>`,
      attachTo: { element: '#libraryContracts', on: 'top' }
    },
    {
      id: 'library-playbooks',
      title: 'Playbooks',
      text: `<p class="font-semibold">Package Metro-2 workflows step-by-step.</p>
             <p class="mt-1 text-xs text-slate-600">Drag letter templates into repeatable revenue sequences.</p>`,
      attachTo: { element: '#libraryPlaybooks', on: 'top' }
    },
    {
      id: 'library-templates',
      title: 'Letter templates',
      text: `<p class="font-semibold">Manage reusable dispute content.</p>
             <p class="mt-1 text-xs text-slate-600">Edit, tag, and copy templates before exporting to automations.</p>`,
      attachTo: { element: '#templatePanel', on: 'left' }
    }
  ]
});

let templates = [];
let sequences = [];
let currentTemplateId = null;
let currentRequestType = 'correct';
let defaultPack = [];
let contracts = [];
let sequenceEditorState = { id: null, name: '', templates: [] };

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

const sequenceList = document.getElementById('sequenceList');
const sequenceEmpty = document.getElementById('sequenceEmpty');
const sequenceModal = document.getElementById('sequenceModal');
const sequenceStatus = document.getElementById('sequenceStatus');
const sequenceListStatus = document.getElementById('sequenceListStatus');
const seqNameInput = document.getElementById('seqName');
const seqTemplatePicker = document.getElementById('seqTemplatePicker');
const seqSelectedList = document.getElementById('seqSelectedList');
const addSeqTemplateBtn = document.getElementById('addSeqTemplate');
const closeSequenceBtn = document.getElementById('closeSequence');
const saveSequenceBtn = document.getElementById('saveSequence');
const newSequenceBtn = document.getElementById('newSequence');

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
    english: contract.english || contract.body || ''
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
    label.textContent = 'Swap Template';
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
        showStatus(defaultPackStatus, 'Default pack updated');
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
    badge.textContent = 'EN';
    header.appendChild(title);
    header.appendChild(badge);

    const english = document.createElement('p');
    english.className = 'library-contract-card__copy text-slate-600 whitespace-pre-wrap';
    english.textContent = snippet(contract.english, 260) || '—';

    const actions = document.createElement('div');
    actions.className = 'library-contract-card__actions';
    const copyEn = document.createElement('button');
    copyEn.type = 'button';
    copyEn.className = 'btn text-xs';
    copyEn.textContent = 'Copy EN';
    copyEn.addEventListener('click', async ()=>{
      try{
        await navigator.clipboard.writeText(contract.english || '');
        showStatus(contractStatus, 'Copied contract copy');
      } catch(err){
        showStatus(contractStatus, 'Clipboard blocked', 'error');
      }
    });
    actions.appendChild(copyEn);

    li.appendChild(header);
    li.appendChild(english);
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
    english: formData.get('english')?.toString().trim() || ''
  };
  if(!payload.name || !payload.english){
    showStatus(contractStatus, 'Name and body required', 'error');
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
    showStatus(contractStatus, 'Contract saved');
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
  renderSequenceTemplatePicker();
  renderSequenceSteps();
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
    renderSequenceTemplatePicker();
    renderSequenceSteps();
    renderSequences();
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
  if(!sequenceList) return;
  sequenceList.innerHTML = '';
  const items = sequences.slice().sort((a,b)=> (a.name||'').localeCompare(b.name||''));
  if(!items.length){
    if(sequenceEmpty) sequenceEmpty.classList.remove('hidden');
    return;
  }
  if(sequenceEmpty) sequenceEmpty.classList.add('hidden');

  items.forEach(seq => {
    const card = document.createElement('article');
    card.className = 'library-sequence-card';

    const header = document.createElement('div');
    header.className = 'library-sequence-card__header';

    const info = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'library-sequence-card__title';
    title.textContent = seq.name || 'Untitled playbook';
    const meta = document.createElement('p');
    meta.className = 'library-sequence-card__meta';
    const count = Array.isArray(seq.templates) ? seq.templates.length : 0;
    meta.textContent = count === 1 ? '1 step' : `${count} steps`;
    info.appendChild(title);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'library-sequence-card__actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn text-xs';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', ()=> openSequenceEditor(seq));
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn text-xs';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', ()=> handleSequenceDelete(seq.id));
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    header.appendChild(info);
    header.appendChild(actions);
    card.appendChild(header);

    const stepList = document.createElement('ul');
    stepList.className = 'text-xs text-slate-600 space-y-1';
    const labels = (seq.templates || []).map((id, idx) => {
      const tpl = templates.find(t => t.id === id);
      return `${idx + 1}. ${templateLabel(tpl)}`;
    }).filter(Boolean);
    if(labels.length){
      labels.slice(0, 4).forEach(label => {
        const li = document.createElement('li');
        li.textContent = label;
        stepList.appendChild(li);
      });
      if(labels.length > 4){
        const li = document.createElement('li');
        li.textContent = `+${labels.length - 4} more steps`;
        stepList.appendChild(li);
      }
    } else {
      const empty = document.createElement('li');
      empty.textContent = 'No steps selected yet.';
      stepList.appendChild(empty);
    }
    card.appendChild(stepList);

    sequenceList.appendChild(card);
  });
}

function resetSequenceEditor(){
  sequenceEditorState = { id: null, name: '', templates: [] };
  if(seqNameInput) seqNameInput.value = '';
}

function openSequenceEditor(seq){
  const source = seq && typeof seq === 'object' ? seq : sequences.find(s => s.id === seq);
  sequenceEditorState = {
    id: source?.id || null,
    name: source?.name || '',
    templates: Array.isArray(source?.templates) ? [...source.templates] : []
  };
  if(seqNameInput){
    seqNameInput.value = sequenceEditorState.name;
  }
  renderSequenceTemplatePicker();
  renderSequenceSteps();
  if(sequenceStatus) sequenceStatus.classList.add('hidden');
  if(sequenceModal){
    sequenceModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

function closeSequenceEditor(){
  if(sequenceModal){
    sequenceModal.style.display = 'none';
  }
  document.body.style.overflow = '';
  if(sequenceStatus){
    sequenceStatus.classList.add('hidden');
  }
  resetSequenceEditor();
}

function renderSequenceTemplatePicker(){
  if(!seqTemplatePicker) return;
  const sorted = templates.map(normalizeTemplateShape).filter(Boolean).sort((a,b)=> templateLabel(a).localeCompare(templateLabel(b)));
  seqTemplatePicker.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select template';
  seqTemplatePicker.appendChild(placeholder);
  sorted.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = templateLabel(t);
    if(sequenceEditorState.templates.includes(t.id)){
      opt.disabled = true;
      opt.textContent += ' • Added';
    }
    seqTemplatePicker.appendChild(opt);
  });
}

function renderSequenceSteps(){
  if(!seqSelectedList) return;
  seqSelectedList.innerHTML = '';
  const selected = sequenceEditorState.templates || [];
  if(!selected.length){
    const li = document.createElement('li');
    li.className = 'text-xs text-slate-500';
    li.textContent = 'No steps yet. Add a template to start the playbook.';
    seqSelectedList.appendChild(li);
    return;
  }
  selected.forEach((id, idx) => {
    const tpl = templates.find(t => t.id === id);
    const li = document.createElement('li');
    li.className = 'library-seq-step';
    const label = document.createElement('span');
    const badge = document.createElement('span');
    badge.className = 'font-semibold text-emerald-700';
    badge.textContent = `${idx + 1}.`;
    label.appendChild(badge);
    label.appendChild(document.createTextNode(` ${templateLabel(tpl)}`));
    const actions = document.createElement('div');
    actions.className = 'library-seq-step__actions';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'btn text-xs';
    upBtn.textContent = 'Up';
    upBtn.disabled = idx === 0;
    upBtn.addEventListener('click', ()=> moveSequenceStep(idx, -1));

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'btn text-xs';
    downBtn.textContent = 'Down';
    downBtn.disabled = idx === selected.length - 1;
    downBtn.addEventListener('click', ()=> moveSequenceStep(idx, 1));

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn text-xs';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', ()=> removeSequenceStep(idx));

    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    actions.appendChild(removeBtn);

    li.appendChild(label);
    li.appendChild(actions);
    seqSelectedList.appendChild(li);
  });
}

function moveSequenceStep(index, delta){
  const steps = sequenceEditorState.templates || [];
  const next = index + delta;
  if(next < 0 || next >= steps.length) return;
  [steps[index], steps[next]] = [steps[next], steps[index]];
  renderSequenceSteps();
  renderSequenceTemplatePicker();
}

function removeSequenceStep(index){
  const steps = sequenceEditorState.templates || [];
  steps.splice(index, 1);
  renderSequenceSteps();
  renderSequenceTemplatePicker();
}

function handleAddSequenceStep(){
  if(!seqTemplatePicker) return;
  const value = seqTemplatePicker.value;
  if(!value) return;
  if(!sequenceEditorState.templates.includes(value)){
    sequenceEditorState.templates.push(value);
    renderSequenceSteps();
    renderSequenceTemplatePicker();
  }
  seqTemplatePicker.value = '';
}

async function handleSequenceSave(){
  if(!saveSequenceBtn) return;
  const name = (seqNameInput?.value || '').trim();
  if(!name){
    showStatus(sequenceStatus, 'Name required', 'error');
    return;
  }
  if(!sequenceEditorState.templates.length){
    showStatus(sequenceStatus, 'Add at least one step', 'error');
    return;
  }
  const payload = {
    name,
    templates: [...sequenceEditorState.templates]
  };
  if(sequenceEditorState.id){
    payload.id = sequenceEditorState.id;
  }

  saveSequenceBtn.disabled = true;
  try {
    const res = await fetch('/api/sequences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(()=>({}));
    if(!data.ok || !data.sequence){
      throw new Error(data.error || 'Failed to save playbook');
    }
    sequenceEditorState = {
      id: data.sequence.id,
      name: data.sequence.name || name,
      templates: Array.isArray(data.sequence.templates) ? [...data.sequence.templates] : [...sequenceEditorState.templates]
    };
    if(seqNameInput){
      seqNameInput.value = sequenceEditorState.name;
    }
    const existing = sequences.find(s => s.id === data.sequence.id);
    if(existing){ Object.assign(existing, data.sequence); }
    else { sequences.push(data.sequence); }
    renderSequences();
    renderSequenceTemplatePicker();
    renderSequenceSteps();
    showStatus(sequenceStatus, 'Playbook saved');
  } catch(err){
    showStatus(sequenceStatus, err.message || 'Failed to save playbook', 'error');
  } finally {
    saveSequenceBtn.disabled = false;
  }
}

async function handleSequenceDelete(id){
  if(!id) return;
  const seq = sequences.find(s => s.id === id);
  if(!seq) return;
  if(!window.confirm(`Delete playbook "${seq.name || 'Untitled'}"?`)) return;
  try {
    const res = await fetch(`/api/sequences/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json().catch(()=>({}));
    if(!data.ok){
      throw new Error(data.error || 'Failed to delete playbook');
    }
    sequences = sequences.filter(s => s.id !== id);
    renderSequences();
    showStatus(sequenceListStatus, 'Playbook deleted');
    if(sequenceEditorState.id === id){
      closeSequenceEditor();
    }
  } catch(err){
    showStatus(sequenceListStatus, err.message || 'Failed to delete playbook', 'error');
  }
}

document.getElementById('saveTemplate').onclick = saveTemplate;
document.getElementById('saveTemplateCopy').onclick = saveTemplateAsNew;
document.getElementById('newTemplate').onclick = openTemplateEditor;
document.getElementById('cancelTemplate').onclick = hideTemplateEditor;
if(saveSequenceBtn){ saveSequenceBtn.addEventListener('click', handleSequenceSave); }
if(newSequenceBtn){ newSequenceBtn.addEventListener('click', () => openSequenceEditor(null)); }
if(addSeqTemplateBtn){ addSeqTemplateBtn.addEventListener('click', handleAddSequenceStep); }
if(closeSequenceBtn){ closeSequenceBtn.addEventListener('click', closeSequenceEditor); }
if(sequenceModal){
  sequenceModal.addEventListener('click', e => {
    if(e.target.id === 'sequenceModal') closeSequenceEditor();
  });
}
if(seqNameInput){
  seqNameInput.addEventListener('input', e => {
    sequenceEditorState.name = e.target.value;
  });
}

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

