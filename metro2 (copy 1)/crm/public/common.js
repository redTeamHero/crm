/* public/common.js */
// Allow ?auth=BASE64 credentials links to set local auth state
const _authParam = new URLSearchParams(location.search).get('auth');
if (_authParam) {
  localStorage.setItem('auth', _authParam);
}
const THEMES = {
  blue:   { accent: '#007AFF', hover: '#005bb5', bg: 'rgba(0,122,255,0.12)', glassBg: 'rgba(0,122,255,0.15)', glassBrd: 'rgba(0,122,255,0.3)' },
  green:  { accent: '#34C759', hover: '#248a3d', bg: 'rgba(52,199,89,0.12)', glassBg: 'rgba(52,199,89,0.15)', glassBrd: 'rgba(52,199,89,0.3)' },
  orange: { accent: '#FF9500', hover: '#cc7600', bg: 'rgba(255,149,0,0.12)', glassBg: 'rgba(255,149,0,0.15)', glassBrd: 'rgba(255,149,0,0.3)' },
  red:    { accent: '#FF3B30', hover: '#c82d24', bg: 'rgba(255,59,48,0.12)', glassBg: 'rgba(255,59,48,0.15)', glassBrd: 'rgba(255,59,48,0.3)' },
  purple: { accent: '#AF52DE', hover: '#893dba', bg: 'rgba(175,82,222,0.12)', glassBg: 'rgba(175,82,222,0.15)', glassBrd: 'rgba(175,82,222,0.3)' },
  teal:   { accent: '#14B8A6', hover: '#0d9488', bg: 'rgba(20,184,166,0.12)', glassBg: 'rgba(20,184,166,0.15)', glassBrd: 'rgba(20,184,166,0.3)' },
  pink:   { accent: '#EC4899', hover: '#c0347a', bg: 'rgba(236,72,153,0.12)', glassBg: 'rgba(236,72,153,0.15)', glassBrd: 'rgba(236,72,153,0.3)' },
  spacegray: { accent: '#1C1C1E', hover: '#0d0d0d', bg: 'rgba(28,28,30,0.12)', glassBg: 'rgba(28,28,30,0.15)', glassBrd: 'rgba(28,28,30,0.3)' },
  metallicgrey: { accent: '#9FA2A4', hover: '#7e8082', bg: 'rgba(159,162,164,0.12)', glassBg: 'rgba(159,162,164,0.15)', glassBrd: 'rgba(159,162,164,0.3)' },
  glass: { accent: 'rgba(255,255,255,0.7)', hover: 'rgba(255,255,255,0.5)', bg: 'rgba(255,255,255,0.12)', glassBg: 'rgba(255,255,255,0.25)', glassBrd: 'rgba(255,255,255,0.4)', btnText: '#000' }

};

function applyTheme(name){
  const t = THEMES[name] || THEMES.purple;
  const root = document.documentElement.style;
  root.setProperty('--accent', t.accent);
  root.setProperty('--accent-hover', t.hover);
  root.setProperty('--accent-bg', t.bg);
  root.setProperty('--glass-bg', t.glassBg);
  root.setProperty('--glass-brd', t.glassBrd);
  root.setProperty('--btn-text', t.btnText || '#fff');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.accent);
  localStorage.setItem('theme', name);
}

function initPalette(){
  if(document.getElementById('themePalette')) return;
  const wrap = document.createElement('div');
  wrap.id = 'themePalette';
  wrap.className = 'collapsed';
  const bubbles = Object.entries(THEMES)
    .map(([name, t]) => `<div class="bubble" data-theme="${name}" style="background:${t.accent}"></div>`)
    .join('');
  wrap.innerHTML = `
    <button class="toggle">▶</button>
    <div class="palette-bubbles">${bubbles}</div>
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

async function limitNavForMembers(){
  const auth = localStorage.getItem('auth');
  if(!auth) return;
  try{
    const res = await fetch('/api/me',{ headers:{ Authorization:'Basic '+auth } });
    if(!res.ok) return;
    const data = await res.json();
    const role = (data.user?.role || '').toLowerCase();
    if(!role.includes('member')) return;
    const nav = document.querySelector('header .flex.items-center.gap-2');
    if(!nav) return;
    const allowed = new Set(['/dashboard','/schedule','/leads','/billing','/clients']);
    [...nav.children].forEach(el=>{
      if(el.tagName === 'A'){
        const href = el.getAttribute('href');
        if(allowed.has(href)) return;
        el.remove();
      } else if(el.id === 'btnHelp' || el.id === 'btnInvite' || el.id === 'tierBadge'){
        el.remove();
      }
    });
  }catch{}
}

const deletionTiers = [
  { threshold: 150, name: 'Credit Legend', icon: '👑', class: 'bg-gradient-to-r from-purple-400 to-pink-500 text-white', message: 'The ultimate, rare achievement.' },
  { threshold: 125, name: 'Credit Hero', icon: '🦸', class: 'bg-red-100 text-red-700', message: 'You’re now the hero of your credit story.' },
  { threshold: 100, name: 'Credit Champion', icon: '🏆', class: 'bg-yellow-200 text-yellow-800', message: 'Championing your credit victory.' },
  { threshold: 75, name: 'Credit Warrior', icon: '🛡️', class: 'bg-indigo-100 text-indigo-700', message: 'Battle-ready credit repair fighter.' },
  { threshold: 60, name: 'Credit Surgeon', icon: '🩺', class: 'bg-cyan-100 text-cyan-700', message: 'Precision deletions.' },
  { threshold: 50, name: 'Dispute Master', icon: '🥋', class: 'bg-purple-100 text-purple-700', message: 'Mastering the dispute process.' },
  { threshold: 40, name: 'Debt Slayer', icon: '⚔️', class: 'bg-gray-100 text-gray-700', message: 'Slaying negative accounts.' },
  { threshold: 30, name: 'Report Scrubber', icon: '🧼', class: 'bg-accent-subtle', message: 'Deep cleaning your credit.' },
  { threshold: 20, name: 'Score Shifter', icon: '📊', class: 'bg-green-100 text-green-700', message: 'Scores are improving.' },
  { threshold: 15, name: 'Credit Cleaner', icon: '🧽', class: 'bg-yellow-100 text-yellow-700', message: 'Your report is shining.' },
  { threshold: 10, name: 'Balance Buster', icon: '💥', class: 'bg-orange-100 text-orange-700', message: 'Breaking negative balances.' },
  { threshold: 5, name: 'Debt Duster', icon: '🧹', class: 'bg-emerald-100 text-emerald-700', message: 'Cleaning up the dust.' },
  { threshold: 0, name: 'Rookie', icon: '📄', class: 'bg-emerald-100 text-emerald-700', message: 'You’ve started your journey.' },
];

function getDeletionTier(count){
  for(const tier of deletionTiers){
    if(count >= tier.threshold) return tier;
  }
  return deletionTiers[deletionTiers.length-1];
}

function ensureTierBadge(){
  if(document.getElementById('tierBadge')) return;
  const nav = document.querySelector('header .flex.items-center.gap-2');
  if(!nav) return;
  const div = document.createElement('div');
  div.id = 'tierBadge';
  div.className = 'hidden sm:flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-emerald-700 shadow-sm animate-fadeInUp';
  div.title = "You've started your journey.";
  div.innerHTML = '<span class="text-xl">📄</span><span class="font-semibold text-sm">Rookie</span>';
  nav.appendChild(div);
}

function renderDeletionTier(){
  const el = document.getElementById('tierBadge');
  if(!el) return;
  const deletions = Number(localStorage.getItem('deletions') || 0);
  const tier = getDeletionTier(deletions);
  el.className = `hidden sm:flex items-center gap-2 rounded-full px-4 py-2 shadow-sm animate-fadeInUp ${tier.class}`;
  el.innerHTML = `<span class="text-xl">${tier.icon}</span><span class="font-semibold text-sm">${tier.name}</span>`;
  el.title = tier.message;
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
  ensureTierBadge();
  renderDeletionTier();
  limitNavForMembers();
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
