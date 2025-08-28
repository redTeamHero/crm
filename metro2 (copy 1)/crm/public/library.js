let templates = [];
let sequences = [];
let mainTemplates = [];
let currentTemplateId = null;
let currentSequenceId = null;

async function loadLibrary(){
  const res = await fetch('/api/templates');
  const data = await res.json().catch(()=>({}));
  templates = data.templates || [];
  sequences = data.sequences || [];
  renderTemplates();
  renderSequences();
  const defRes = await fetch('/api/templates/defaults');
  const defData = await defRes.json().catch(()=>({}));
  mainTemplates = defData.templates || [];
  renderMainTemplates();
}

function renderTemplates(){
  const list = document.getElementById('templateList');
  list.innerHTML = '';
  const sorted = [...templates].sort((a,b)=>(a.heading||'').localeCompare(b.heading||''));
  sorted.forEach(t => {
    const div = document.createElement('div');
    div.textContent = t.heading || '(no heading)';
    div.className = 'chip';
    div.onclick = () => editTemplate(t.id);
    list.appendChild(div);
  });
}

function renderMainTemplates(){
  const list = document.getElementById('mainList');
  if(!list) return;
  list.innerHTML = '';
  const sorted = [...mainTemplates].sort((a,b)=>(a.heading||'').localeCompare(b.heading||''));
  sorted.forEach(t => {
    const div = document.createElement('div');
    div.textContent = t.heading || '(no heading)';
    div.className = 'chip';
    div.onclick = () => useMainTemplate(t.id);
    list.appendChild(div);
  });
}

function editTemplate(id){
  const tpl = templates.find(t => t.id === id) || {};
  currentTemplateId = id;
  document.getElementById('tplHeading').value = tpl.heading || '';
  document.getElementById('tplIntro').value = tpl.intro || '';
  document.getElementById('tplAsk').value = tpl.ask || '';
  document.getElementById('tplAfter').value = tpl.afterIssues || '';
  document.getElementById('tplEvidence').value = tpl.evidence || '';
  updatePreview();
}

function useMainTemplate(id){
  const tpl = mainTemplates.find(t => t.id === id);
  if(!tpl) return;
  currentTemplateId = id;
  document.getElementById('tplHeading').value = tpl.heading || '';
  document.getElementById('tplIntro').value = tpl.intro || '';
  document.getElementById('tplAsk').value = tpl.ask || '';
  document.getElementById('tplAfter').value = tpl.afterIssues || '';
  document.getElementById('tplEvidence').value = tpl.evidence || '';
  updatePreview();
}

function newTemplate(){
  currentTemplateId = null;
  document.getElementById('tplHeading').value = '';
  document.getElementById('tplIntro').value = '';
  document.getElementById('tplAsk').value = '';
  document.getElementById('tplAfter').value = '';
  document.getElementById('tplEvidence').value = '';
  updatePreview();
}

async function saveTemplate(){
  const payload = {
    id: currentTemplateId,
    heading: document.getElementById('tplHeading').value,
    intro: document.getElementById('tplIntro').value,
    ask: document.getElementById('tplAsk').value,
    afterIssues: document.getElementById('tplAfter').value,
    evidence: document.getElementById('tplEvidence').value
  };
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
    editTemplate(data.template.id);
  }
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

function editSequence(id){
  const seq = sequences.find(s => s.id === id) || {};
  currentSequenceId = id;
  document.getElementById('seqName').value = seq.name || '';
  document.getElementById('seqTemplates').value = (seq.templates || []).join(', ');
}

function newSequence(){
  currentSequenceId = null;
  document.getElementById('seqName').value = '';
  document.getElementById('seqTemplates').value = '';
}

async function saveSequence(){
  const payload = {
    id: currentSequenceId,
    name: document.getElementById('seqName').value,
    templates: document.getElementById('seqTemplates').value.split(',').map(s=>s.trim()).filter(Boolean)
  };
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
document.getElementById('newTemplate').onclick = newTemplate;
document.getElementById('saveSequence').onclick = saveSequence;
document.getElementById('newSequence').onclick = newSequence;

['tplHeading','tplIntro','tplAsk','tplAfter','tplEvidence'].forEach(id => {
  document.getElementById(id).addEventListener('input', updatePreview);
});

loadLibrary();

