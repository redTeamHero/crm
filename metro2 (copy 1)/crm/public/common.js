/* public/common.js */
const THEMES = {
  blue:   { accent: '#007AFF', hover: '#005bb5', bg: 'rgba(0,122,255,0.12)', glassBg: 'rgba(0,122,255,0.15)', glassBrd: 'rgba(0,122,255,0.3)' },
  green:  { accent: '#34C759', hover: '#248a3d', bg: 'rgba(52,199,89,0.12)', glassBg: 'rgba(52,199,89,0.15)', glassBrd: 'rgba(52,199,89,0.3)' },
  orange: { accent: '#FF9500', hover: '#cc7600', bg: 'rgba(255,149,0,0.12)', glassBg: 'rgba(255,149,0,0.15)', glassBrd: 'rgba(255,149,0,0.3)' },
  red:    { accent: '#FF3B30', hover: '#c82d24', bg: 'rgba(255,59,48,0.12)', glassBg: 'rgba(255,59,48,0.15)', glassBrd: 'rgba(255,59,48,0.3)' },
  purple: { accent: '#AF52DE', hover: '#893dba', bg: 'rgba(175,82,222,0.12)', glassBg: 'rgba(175,82,222,0.15)', glassBrd: 'rgba(175,82,222,0.3)' }
};

function applyTheme(name){
  const t = THEMES[name] || THEMES.purple;
  const root = document.documentElement.style;
  root.setProperty('--accent', t.accent);
  root.setProperty('--accent-hover', t.hover);
  root.setProperty('--accent-bg', t.bg);
  root.setProperty('--glass-bg', t.glassBg);
  root.setProperty('--glass-brd', t.glassBrd);
  localStorage.setItem('theme', name);
}

function initPalette(){
  if(document.getElementById('themePalette')) return;
  const wrap = document.createElement('div');
  wrap.id = 'themePalette';
  wrap.className = 'collapsed';
  wrap.innerHTML = `
    <button class="toggle">▶</button>
    <div class="palette-bubbles">
      <div class="bubble" data-theme="blue" style="background:#007AFF"></div>
      <div class="bubble" data-theme="green" style="background:#34C759"></div>
      <div class="bubble" data-theme="orange" style="background:#FF9500"></div>
      <div class="bubble" data-theme="red" style="background:#FF3B30"></div>
      <div class="bubble" data-theme="purple" style="background:#AF52DE"></div>
    </div>
    <button id="voiceMic" class="mic">🎤</button>`;
  document.body.appendChild(wrap);
  const toggle = wrap.querySelector('.toggle');
  toggle.addEventListener('click', ()=>{
    wrap.classList.toggle('collapsed');
    toggle.textContent = wrap.classList.contains('collapsed') ? '▶' : '◀';
  });
  wrap.addEventListener('click', (e)=>{
    const b = e.target.closest('.bubble');
    if(!b) return;
    applyTheme(b.dataset.theme);
  });
  const saved = localStorage.getItem('theme') || 'purple';
  applyTheme(saved);
}

function ensureHelpModal(){
  if(document.getElementById('helpModal')) return;
  const div = document.createElement('div');
  div.id = 'helpModal';
  div.className = 'fixed inset-0 hidden items-center justify-center bg-[rgba(0,0,0,.45)] z-50';
  div.innerHTML = `
    <div class="glass card w-[min(720px,92vw)]">
      <div class="flex items-center justify-between mb-2">
        <div class="font-semibold">Hotkeys & Tips</div>
        <button id="helpClose" class="btn">×</button>
      </div>
      <div class="text-sm space-y-2">
        <div class="grid grid-cols-2 gap-3">
          <div class="glass card p-2">
            <div class="font-medium mb-1">Global</div>
            <ul class="list-disc list-inside">
              <li><b>N</b> – New consumer</li>
              <li><b>U</b> – Upload HTML</li>
              <li><b>E</b> – Edit consumer</li>
              <li><b>G</b> – Generate letters</li>
              <li><b>C</b> – Clear (context-aware)</li>
              <li><b>H</b> – Help overlay</li>
              <li><b>R</b> – Remove focused tradeline card</li>
            </ul>
          </div>
          <div class="glass card p-2">
            <div class="font-medium mb-1">Modes / Cards</div>
            <ul class="list-disc list-inside">
              <li>Modes: <b>I</b>=Identity Theft, <b>D</b>=Data Breach, <b>S</b>=Sexual Assault</li>
              <li>Click a card to zoom; press <b>A</b> to toggle all bureaus on that card.</li>
              <li>Press <b>Esc</b> to exit a mode.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div);
}

function openHelp(){
  ensureHelpModal();
  const modal = document.getElementById('helpModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = 'hidden';
  bindHelp();
}
function closeHelp(){
  const modal = document.getElementById('helpModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.style.overflow = '';
}

function bindHelp(){
  document.getElementById('btnHelp')?.addEventListener('click', openHelp);
  document.getElementById('helpClose')?.addEventListener('click', closeHelp);
  document.getElementById('helpModal')?.addEventListener('click', (e)=>{ if(e.target.id==='helpModal') closeHelp(); });
}

window.selectedConsumerId = localStorage.getItem('selectedConsumerId') || null;

document.addEventListener('DOMContentLoaded', ()=>{
  ensureHelpModal();
  bindHelp();
  initPalette();
  initVoiceNotes();
});

window.openHelp = openHelp;

window.getSelectedConsumerId = function(){
  return window.selectedConsumerId;
};
window.setSelectedConsumerId = function(id){
  window.selectedConsumerId = id;
  if(id) localStorage.setItem('selectedConsumerId', id);
  else localStorage.removeItem('selectedConsumerId');
};


function initVoiceNotes(){
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognition) return;
  if(document.getElementById('voiceOverlay')) return;
  const mic = document.getElementById('voiceMic');
  if(!mic) return;
  const overlay = document.createElement('div');
  overlay.id = 'voiceOverlay';
  document.body.appendChild(overlay);
  const notes = document.createElement('div');
  notes.id = 'voiceNotes';
  notes.className = 'glass card relative';
  notes.innerHTML = '<button class="close btn">×</button><textarea class="w-full h-full p-2"></textarea>';
  document.body.appendChild(notes);
  const textarea = notes.querySelector('textarea');
  const closeBtn = notes.querySelector('.close');
  let active = false;
  const keyword = (localStorage.getItem('voiceKeyword') || 'open notes').toLowerCase();
  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  function startRec(){
    try { rec.start(); } catch {}
  }
  function openNotes(){
    active = true;
    textarea.value = '';
    document.body.classList.add('voice-active');
    startRec();
  }
  function closeNotes(){
    active = false;
    document.body.classList.remove('voice-active');
    try{ rec.stop(); }catch{}
  }
  rec.onresult = (e)=>{
    const txt = Array.from(e.results).map(r=>r[0].transcript).join('');
    if(!active){
      if(txt.toLowerCase().includes(keyword)) openNotes();
    } else {
      textarea.value = txt;
    }
  };
  rec.onend = startRec;
  mic.addEventListener('click', openNotes);
  closeBtn.addEventListener('click', ()=>{ closeNotes(); });
  startRec();
}
