let templates = [];
let sequences = [];
let currentTemplateId = null;
let currentSequenceId = null;
let currentRequestType = 'correct';

async function loadLibrary(){
  const res = await fetch('/api/templates');
  const data = await res.json().catch(()=>({}));
  templates = data.templates || [];
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
}

function renderList(items, containerId, clickHandler){
  const list = document.getElementById(containerId);
  if(!list) return;
  list.innerHTML = '';
  const sorted = [...items].sort((a,b)=>(a.heading||'').localeCompare(b.heading||''));
  sorted.forEach(t => {
    const div = document.createElement('div');
    div.textContent = t.heading || '(no heading)';
    div.className = 'chip';
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
  updatePreview();
}

function editTemplate(id){
  const tpl = templates.find(t => t.id === id) || {};
  currentTemplateId = id;
  showTemplateEditor();
  document.getElementById('tplHeading').value = tpl.heading || '';
  currentRequestType = tpl.requestType || 'correct';
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
    div.className = 'chip';
    div.onclick = () => editSequence(s.id);
    list.appendChild(div);
  });
}

function renderSeqTemplateOptions(selected){
  const container = document.getElementById('seqTemplates');
  container.innerHTML = '';
  templates.forEach(t => {
    const label = document.createElement('label');
    label.className = 'flex items-center gap-2 text-xs p-1 rounded hover:bg-white/60';
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

