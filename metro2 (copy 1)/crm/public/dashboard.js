/* public/dashboard.js */

import { escapeHtml, api, formatCurrency } from './common.js';

const TOUR_STEP_KEY = 'dashboard.tour.step';
const TOUR_COMPLETE_KEY = 'dashboard.tour.complete';
let tourInstance = null;
let activeTourStepId = null;
let confettiTarget = null;
let tourWidgetButton = null;
let tourWidgetLabel = null;
let tourWidgetStatus = null;
let latestGuideState = { mode: 'start', completed: false };
const chatState = {
  panel: null,
  toggle: null,
  close: null,
  tour: null,
  messages: null,
  form: null,
  input: null,
  quickButtons: [],
  isOpen: false,
  seeded: false
};
let pendingChatOpen = false;
const pendingChatMessages = [];

function burstConfetti(){
  if(!confettiTarget) return;
  for(let i=0;i<24;i++){
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    const tx = (Math.random()-0.5)*220;
    const ty = (-Math.random()*160-60);
    piece.style.setProperty('--tx', `${tx}px`);
    piece.style.setProperty('--ty', `${ty}px`);
    piece.style.backgroundColor = `hsl(${Math.random()*360},80%,62%)`;
    confettiTarget.appendChild(piece);
    setTimeout(()=>piece.remove(), 1200);
  }
}

function syncTourWidget(){
  if(!tourWidgetButton) return;
  const { mode, completed } = latestGuideState;
  let label;
  if(mode === 'resume') label = 'Resume tour / Reanudar recorrido';
  else if(mode === 'replay') label = 'Replay tour / Repetir recorrido';
  else label = 'Start tour / Iniciar recorrido';
  if(tourWidgetLabel){
    tourWidgetLabel.textContent = label;
  }
  if(tourWidgetStatus){
    if(completed){
      tourWidgetStatus.textContent = 'Completed • Celebrate the win / ¡Logro completado!';
    } else if(mode === 'resume'){
      tourWidgetStatus.textContent = 'Pick up where you left off / Continúa donde pausaste';
    } else {
      tourWidgetStatus.textContent = '4 steps • Revenue-first / 4 pasos enfocados en ingresos';
    }
    tourWidgetStatus.classList.toggle('text-emerald-600', completed);
    tourWidgetStatus.classList.toggle('text-slate-500', !completed);
  }
  tourWidgetButton.dataset.mode = mode;
  tourWidgetButton.classList.toggle('ring-emerald-400', completed);
  tourWidgetButton.classList.toggle('ring-[var(--accent)]', !completed);
}

function refreshHelpGuideState(){
  const storedStep = localStorage.getItem(TOUR_STEP_KEY);
  const completed = localStorage.getItem(TOUR_COMPLETE_KEY) === 'true';
  let mode = 'start';
  if(storedStep) mode = 'resume';
  else if(completed) mode = 'replay';
  latestGuideState = { mode, completed };
  if(typeof window.setHelpGuideState === 'function'){
    window.setHelpGuideState(latestGuideState);
  }
  syncTourWidget();
}

function createTour(){
  if(tourInstance) return tourInstance;
  if(!window.Shepherd){
    console.warn('Shepherd.js is not available for the guided walkthrough.');
    return null;
  }
  const Shepherd = window.Shepherd;
  tourInstance = new Shepherd.Tour({
    useModalOverlay: true,
    defaultStepOptions: {
      cancelIcon: { enabled: true },
      classes: 'glass card text-sm leading-relaxed shadow-xl max-w-md',
      scrollTo: { behavior: 'smooth', block: 'center' }
    }
  });
  const tour = tourInstance;

  const makeButtons = (step) => {
    const buttons = [];
    if(step !== 'first'){
      buttons.push({
        text: 'Back / Atrás',
        action(){ tour.back(); }
      });
    }
    buttons.push({
      text: 'Skip / Saltar',
      action(){ tour.cancel(); },
      classes: 'shepherd-button-secondary'
    });
    if(step === 'last'){
      buttons.push({
        text: 'Done / Listo',
        action(){ tour.complete(); }
      });
    } else {
      buttons.push({
        text: 'Next / Siguiente',
        action(){ tour.next(); }
      });
    }
    return buttons;
  };

  tour.addStep({
    id: 'nav',
    title: 'Navigation / Navegación',
    text: `<p class="font-semibold">Drive clients to the right workflow fast.</p>
           <p class="mt-1 text-xs text-slate-600">Use Dashboard, Leads, and Billing to monitor Lead→Consult% y pagos en tiempo real.</p>`,
    attachTo: { element: '#primaryNav', on: 'bottom' },
    buttons: makeButtons('first')
  });

  tour.addStep({
    id: 'kpis',
    title: 'KPIs / Indicadores',
    text: `<p class="font-semibold">Watch conversion and retention instantly.</p>
           <p class="mt-1 text-xs text-slate-600">Anchor your consult pitch with live data. / Usa estos KPIs para respaldar tu oferta.</p>`,
    attachTo: { element: '#tourKpiSection', on: 'top' },
    buttons: makeButtons()
  });

  tour.addStep({
    id: 'notes',
    title: 'Playbooks & Notes / Notas',
    text: `<p class="font-semibold">Capture next steps while you speak.</p>
           <p class="mt-1 text-xs text-slate-600">Turn every call into tasks & NEPQ follow-ups. / Convierte cada llamada en acciones.</p>`,
    attachTo: { element: '#tourNotepadCard', on: 'left' },
    buttons: makeButtons()
  });

  tour.addStep({
    id: 'map',
    title: 'Client Map / Mapa de clientes',
    text: `<p class="font-semibold">Spot regional wins and partnership gaps.</p>
           <p class="mt-1 text-xs text-slate-600">Segment your offers por estado y dispara campañas.</p>`,
    attachTo: { element: '#tourMapCard', on: 'top' },
    buttons: makeButtons()
  });

  tour.addStep({
    id: 'coach',
    title: 'Guided Coach / Coach asistente',
    text: `<p class="font-semibold">Need more help?</p>
           <p class="mt-1 text-xs text-slate-600">Launch the chat coach for scripts, KPIs, and upsell ideas. / Abre el chat para guiones y experimentos.</p>`,
    attachTo: { element: '#guideChatToggle', on: 'top' },
    buttons: makeButtons('last')
  });

  tour.on('show', () => {
    const current = tour.currentStep;
    activeTourStepId = current?.id || null;
    if(activeTourStepId){
      localStorage.setItem(TOUR_STEP_KEY, activeTourStepId);
      localStorage.removeItem(TOUR_COMPLETE_KEY);
    }
    refreshHelpGuideState();
  });

  tour.on('complete', () => {
    activeTourStepId = null;
    localStorage.removeItem(TOUR_STEP_KEY);
    localStorage.setItem(TOUR_COMPLETE_KEY, 'true');
    refreshHelpGuideState();
    burstConfetti();
  });

  tour.on('cancel', () => {
    if(activeTourStepId){
      localStorage.setItem(TOUR_STEP_KEY, activeTourStepId);
    }
    refreshHelpGuideState();
  });

  tour.on('inactive', () => {
    activeTourStepId = null;
  });

  return tourInstance;
}

function startTour({ resume = false } = {}){
  const tour = createTour();
  if(!tour){
    pendingChatOpen = true;
    openChatCoach({ focusInput: false });
    appendChatMessage('assistant', `<p class="font-semibold text-slate-800">Loading tour…</p><p class="text-xs text-slate-600">The guided walkthrough is still preparing. / El recorrido guiado está cargando.</p>`, { html: true });
    return;
  }
  if(typeof tour.isActive === 'function' && tour.isActive()){
    tour.cancel();
  }
  if(resume){
    const stepId = localStorage.getItem(TOUR_STEP_KEY);
    localStorage.removeItem(TOUR_COMPLETE_KEY);
    refreshHelpGuideState();
    tour.start();
    if(stepId && tour.getById(stepId)){
      tour.show(stepId);
    }
  } else {
    activeTourStepId = null;
    localStorage.removeItem(TOUR_STEP_KEY);
    localStorage.removeItem(TOUR_COMPLETE_KEY);
    refreshHelpGuideState();
    tour.start();
  }
}

function handleTutorialReset(){
  if(tourInstance && typeof tourInstance.cancel === 'function'){
    tourInstance.cancel();
  }
  activeTourStepId = null;
  localStorage.removeItem(TOUR_STEP_KEY);
  localStorage.removeItem(TOUR_COMPLETE_KEY);
  refreshHelpGuideState();
}

function appendChatMessage(role, content, { html = false } = {}){
  if(!chatState.messages){
    pendingChatMessages.push({ role, content, html });
    return;
  }
  const bubble = document.createElement('div');
  bubble.className = role === 'assistant'
    ? 'self-start max-w-[85%] rounded-2xl bg-slate-100 px-3 py-2 text-slate-700 shadow'
    : 'self-end max-w-[85%] rounded-2xl bg-[var(--accent)] px-3 py-2 text-white shadow';
  bubble.dataset.role = role;
  if(html) bubble.innerHTML = content;
  else bubble.textContent = content;
  chatState.messages.appendChild(bubble);
  chatState.messages.scrollTo({ top: chatState.messages.scrollHeight, behavior: 'smooth' });
}

function seedChat(){
  if(chatState.seeded) return;
  chatState.seeded = true;
  appendChatMessage('assistant', `
    <p class="font-semibold text-slate-800">Hey ducky 👋</p>
    <p class="mt-1">I can guide tours, share scripts, and flag Metro-2 pitfalls.</p>
    <ul class="mt-2 list-disc list-inside text-sm text-slate-600 space-y-1">
      <li>Ask for onboarding flows to boost Lead→Consult%.</li>
      <li>Request NEPQ prompts to keep compliance tight.</li>
      <li>Pregúntame en español cuando quieras.</li>
    </ul>
    <p class="mt-2 text-xs text-slate-500"><strong>Revenue tip:</strong> Trigger a same-day upsell after each dispute letter delivery. / <strong>Consejo:</strong> Activa un upsell el mismo día que entregas la carta.</p>
  `, { html: true });
}

function openChatCoach({ focusInput = true } = {}){
  if(!chatState.panel){
    pendingChatOpen = true;
    return;
  }
  if(chatState.isOpen){
    if(focusInput){
      chatState.input?.focus();
    }
    return;
  }
  chatState.panel.classList.remove('hidden');
  chatState.panel.setAttribute('aria-hidden', 'false');
  if(chatState.toggle){
    chatState.toggle.classList.add('hidden');
    chatState.toggle.setAttribute('aria-expanded', 'true');
  }
  chatState.isOpen = true;
  localStorage.setItem('dashboardChatOpen', '1');
  seedChat();
  if(focusInput){
    chatState.input?.focus();
  }
  pendingChatOpen = false;
}

function closeChatCoach(){
  if(!chatState.panel) return;
  chatState.panel.classList.add('hidden');
  chatState.panel.setAttribute('aria-hidden', 'true');
  if(chatState.toggle){
    chatState.toggle.classList.remove('hidden');
    chatState.toggle.setAttribute('aria-expanded', 'false');
  }
  chatState.isOpen = false;
  localStorage.removeItem('dashboardChatOpen');
  pendingChatOpen = false;
}

function generateAssistantReply(message){
  const normalized = message.toLowerCase();
  if(normalized.includes('tour') || normalized.includes('walkthrough') || normalized.includes('recorrido')){
    const resume = normalized.includes('resume') || normalized.includes('continu');
    const intent = resume ? 'resumeTour' : 'startTour';
    return {
      html: true,
      action: intent,
      text: `<p class="font-semibold text-slate-800">Launching the guided walkthrough.</p>
             <p class="mt-1 text-xs text-slate-600">I'll highlight KPIs, notes, and the chat coach. / Te mostraré KPIs, notas y el coach.</p>
             <p class="mt-2 text-xs text-slate-500">KPI: Track completion of each tour run vs. upgrades. A/B idea: compare a "Book consult" CTA versus "Start audit" during the final step.</p>`
    };
  }
  if(normalized.includes('onboard') || normalized.includes('lead')){
    return {
      html: true,
      text: `<p class="font-semibold text-slate-800">3-step onboarding sprint:</p>
             <ol class="mt-1 list-decimal list-inside space-y-1 text-sm text-slate-700">
               <li>Dashboard ➝ Leads ➝ tag warm prospects, then auto-trigger the dispute quiz. / Etiqueta leads cálidos y lanza el quiz.</li>
               <li>Use the Notes panel to capture NEPQ answers; push them into your letter template variables. / Documenta respuestas NEPQ.</li>
               <li>Collect payment with Stripe checkout links tied to the billing widget. / Cobra con Stripe desde Billing.</li>
             </ol>
             <p class="mt-2 text-xs text-slate-500">KPI: Lead→Consult% y Consult→Purchase%. A/B test: try "Secure your audit" vs. "Start Metro-2 review" on the booking CTA.</p>`
    };
  }
  if(normalized.includes('revenue') || normalized.includes('ventas') || normalized.includes('upsell')){
    return {
      html: true,
      text: `<p class="font-semibold text-slate-800">Revenue levers to pull this week:</p>
             <ul class="mt-1 list-disc list-inside space-y-1 text-sm text-slate-700">
               <li>Bundle certified mail as a premium add-on right after letter generation. / Ofrece envío certificado como add-on.</li>
               <li>Trigger a follow-up SMS using the chat coach script when retention dips below 85%.</li>
               <li>Launch a bilingual webinar invite for truckers + attorneys with Metro-2 case studies.</li>
             </ul>
             <p class="mt-2 text-xs text-slate-500">KPI: Average Order Value & Refund%. A/B ideas: headline emphasizing "Clarity-first dispute plan" vs. "Tailored Metro-2 review"; test trust badge placement near the paywall.</p>`
    };
  }
  if(normalized.includes('español') || normalized.includes('spanish')){
    return {
      html: true,
      text: `<p class="font-semibold text-slate-800">Guía rápida en español:</p>
             <ul class="mt-1 list-disc list-inside space-y-1 text-sm text-slate-700">
               <li>Revisa los KPIs de conversión antes de cada llamada.</li>
               <li>Usa el bloc de notas para guardar objeciones y respuestas NEPQ.</li>
               <li>Abre el tour guiado cuando un nuevo asesor se una.</li>
             </ul>
             <p class="mt-2 text-xs text-slate-500">Métrica clave: Tiempo hasta valor (primer disputa enviada). Idea A/B: CTA "Programa tu revisión" vs. "Inicia tu plan Metro-2".</p>`
    };
  }
  return {
    html: true,
    text: `<p class="font-semibold text-slate-800">Here’s how to keep momentum:</p>
           <ul class="mt-1 list-disc list-inside space-y-1 text-sm text-slate-700">
             <li>Run the tour to align new reps on the Apple-like experience. / Ejecuta el tour para alinear al equipo.</li>
             <li>Log every objection in Notes and convert wins into Playbooks.</li>
             <li>Review the map weekly to target referral partners in hot states.</li>
           </ul>
           <p class="mt-2 text-xs text-slate-500">KPI: Consult→Purchase% y LTV. A/B idea: Compare "Book your dispute strategy" vs. "Schedule compliance consult" on the hero CTA.</p>`
  };
}

function respondToMessage(message){
  const reply = generateAssistantReply(message);
  const delay = reply && typeof reply.delay === 'number' ? reply.delay : 350;
  setTimeout(() => {
    appendChatMessage('assistant', reply.text, { html: reply.html });
    if(reply.action === 'startTour'){
      startTour({ resume: false });
    } else if(reply.action === 'resumeTour'){
      startTour({ resume: true });
    }
  }, delay);
}

function sendChatMessage(message){
  const value = message.trim();
  if(!value) return;
  appendChatMessage('user', value, { html: false });
  respondToMessage(value);
}

const stateCenters = {
  AL:[32.806671,-86.79113], AK:[61.370716,-152.404419], AZ:[33.729759,-111.431221], AR:[34.969704,-92.373123],
  CA:[36.116203,-119.681564], CO:[39.059811,-105.311104], CT:[41.597782,-72.755371], DE:[39.318523,-75.507141],
  FL:[27.766279,-81.686783], GA:[33.040619,-83.643074], HI:[21.094318,-157.498337], ID:[44.240459,-114.478828],
  IL:[40.349457,-88.986137], IN:[39.849426,-86.258278], IA:[42.011539,-93.210526], KS:[38.5266,-96.726486],
  KY:[37.66814,-84.670067], LA:[31.169546,-91.867805], ME:[44.693947,-69.381927], MD:[39.063946,-76.802101],
  MA:[42.230171,-71.530106], MI:[43.326618,-84.536095], MN:[45.694454,-93.900192], MS:[32.741646,-89.678696],
  MO:[38.456085,-92.288368], MT:[46.921925,-110.454353], NE:[41.12537,-98.268082], NV:[38.313515,-117.055374],
  NH:[43.452492,-71.563896], NJ:[40.298904,-74.521011], NM:[34.840515,-106.248482], NY:[42.165726,-74.948051],
  NC:[35.630066,-79.806419], ND:[47.528912,-99.784012], OH:[40.388783,-82.764915], OK:[35.565342,-96.928917],
  OR:[44.572021,-122.070938], PA:[40.590752,-77.209755], RI:[41.680893,-71.51178], SC:[33.856892,-80.945007],
  SD:[44.299782,-99.438828], TN:[35.747845,-86.692345], TX:[31.054487,-97.563461], UT:[40.150032,-111.862434],
  VT:[44.045876,-72.710686], VA:[37.769337,-78.169968], WA:[47.400902,-121.490494], WV:[38.491226,-80.954453],
  WI:[44.268543,-89.616508], WY:[42.755966,-107.30249], DC:[38.897438,-77.026817]
};
const stateNames = {
  AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas", CA:"California", CO:"Colorado", CT:"Connecticut",
  DE:"Delaware", FL:"Florida", GA:"Georgia", HI:"Hawaii", ID:"Idaho", IL:"Illinois", IN:"Indiana", IA:"Iowa",
  KS:"Kansas", KY:"Kentucky", LA:"Louisiana", ME:"Maine", MD:"Maryland", MA:"Massachusetts", MI:"Michigan",
  MN:"Minnesota", MS:"Mississippi", MO:"Missouri", MT:"Montana", NE:"Nebraska", NV:"Nevada", NH:"New Hampshire",
  NJ:"New Jersey", NM:"New Mexico", NY:"New York", NC:"North Carolina", ND:"North Dakota", OH:"Ohio",
  OK:"Oklahoma", OR:"Oregon", PA:"Pennsylvania", RI:"Rhode Island", SC:"South Carolina", SD:"South Dakota",
  TN:"Tennessee", TX:"Texas", UT:"Utah", VT:"Vermont", VA:"Virginia", WA:"Washington", WV:"West Virginia",
  WI:"Wisconsin", WY:"Wyoming", DC:"District of Columbia"
};
Object.entries(stateNames).forEach(([abbr,name])=>{ stateCenters[name.toUpperCase()] = stateCenters[abbr]; });
function getStateCode(st){
  if(!st) return null;
  st = st.trim().toUpperCase();
  if(stateCenters[st]) return st;
  const entry = Object.entries(stateNames).find(([,name]) => name.toUpperCase() === st);
  return entry ? entry[0] : null;
}
function renderClientMap(consumers){
  const mapEl = document.getElementById('clientMap');
  if(!mapEl || typeof L === 'undefined') return;
  if(!mapEl.style.height) mapEl.style.height = '16rem';
  const map = L.map(mapEl, { zoomControl: true }).setView([37.8,-96],4);
  mapEl.style.background = '#e5e7eb';
  fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json')
    .then(r=>r.json())
    .then(data=>{
      L.geoJSON(data, {
        style:{ color:'#ffffff', weight:1, fillColor:'#7c3aed', fillOpacity:1 }
      }).addTo(map);
    });
  setTimeout(()=>map.invalidateSize(),0);

  const grouped = consumers.reduce((acc,c)=>{
    const code = getStateCode(c.state);
    if(!code) return acc;
    (acc[code] ||= []).push(c.name || '');
    return acc;
  },{});

  Object.entries(grouped).forEach(([code,names])=>{
    const coords = stateCenters[code];
    if(coords){
      L.circleMarker(coords,{ radius:6, color:'#059669', fillColor:'#10b981', fillOpacity:0.7 })
        .addTo(map)
        .bindPopup(names.join('<br>'));
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  confettiTarget = document.getElementById('confetti');
  const goalBtn = document.getElementById('btnGoal');
  if(goalBtn){
    goalBtn.addEventListener('click', burstConfetti);
  }

  tourWidgetButton = document.getElementById('guideTourWidget');
  tourWidgetLabel = document.getElementById('guideTourWidgetLabel');
  tourWidgetStatus = document.getElementById('guideTourWidgetStatus');
  if(tourWidgetButton){
    tourWidgetButton.addEventListener('click', () => {
      const mode = tourWidgetButton.dataset.mode || latestGuideState.mode;
      if(mode === 'resume'){
        startTour({ resume: true });
      } else {
        startTour({ resume: false });
      }
    });
  }

  chatState.panel = document.getElementById('guideChatPanel');
  chatState.toggle = document.getElementById('guideChatToggle');
  chatState.close = document.getElementById('guideChatClose');
  chatState.tour = document.getElementById('guideChatTour');
  chatState.messages = document.getElementById('guideChatMessages');
  chatState.form = document.getElementById('guideChatForm');
  chatState.input = document.getElementById('guideChatInput');
  chatState.quickButtons = Array.from(document.querySelectorAll('[data-chat-message]'));

  if(chatState.messages && pendingChatMessages.length){
    const items = pendingChatMessages.splice(0, pendingChatMessages.length);
    items.forEach(msg => appendChatMessage(msg.role, msg.content, { html: msg.html }));
  }

  chatState.toggle?.addEventListener('click', () => openChatCoach());
  chatState.close?.addEventListener('click', () => closeChatCoach());
  chatState.tour?.addEventListener('click', () => {
    openChatCoach({ focusInput: false });
    startTour({ resume: false });
  });
  chatState.form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if(!chatState.input) return;
    const value = chatState.input.value.trim();
    chatState.input.value = '';
    if(value) sendChatMessage(value);
  });
  chatState.quickButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      openChatCoach({ focusInput: false });
      sendChatMessage(btn.dataset.chatMessage || '');
    });
  });
  document.addEventListener('keydown', (event) => {
    if(event.key === 'Escape' && chatState.isOpen){
      closeChatCoach();
    }
  });

  if(pendingChatOpen || localStorage.getItem('dashboardChatOpen') === '1'){
    openChatCoach({ focusInput: false });
    pendingChatOpen = false;
  }

  const feedEl = document.getElementById('newsFeed');
  if (feedEl) {
    fetch('/api/settings')
      .then(r => r.json())
      .then(cfg => {
        const rssUrl = cfg.settings?.rssFeedUrl || 'https://hnrss.org/frontpage';
        const apiUrl = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(rssUrl);
        return fetch(apiUrl);
      })
      .then(r => r.json())
      .then(data => {
        const items = data.items || [];
        if (!items.length) {
          feedEl.textContent = 'No news available.';
          return;
        }
        feedEl.innerHTML = items.slice(0,5).map(item => {
          return `<div class="news-item"><a href="${item.link}" target="_blank" class="text-accent underline">${item.title}</a></div>`;
        }).join('');
      })
      .catch(err => {
        console.error('Failed to load news feed', err);
        feedEl.textContent = 'Failed to load news.';
      });
  }

  const msgList = document.getElementById('msgList');

  async function renderMessages(){
    if(!msgList) return;
    try{
      const resp = await fetch('/api/messages');
      if(!resp.ok) throw new Error('bad response');
      const data = await resp.json().catch(()=>({}));
      const msgs = Array.isArray(data.messages) ? data.messages : [];

      if(!msgs.length){
        msgList.textContent = 'No messages.';
        return;
      }
      msgList.innerHTML = msgs.map(m=>{
        const sender = m.payload?.from === 'client' ? 'Client' : m.payload?.from || 'Host';
        return `<div><span class="font-medium">${escapeHtml(m.consumer?.name || '')} - ${escapeHtml(sender)}:</span> ${escapeHtml(m.payload?.text || '')}</div>`;
      }).join('');
    }catch(e){
      console.error('Failed to load messages', e);
      msgList.textContent = 'Failed to load messages.';
    }
  }

  if(msgList){
    renderMessages();
  }

  const eventList = document.getElementById('eventList');

  async function renderEvents(){
    if(!eventList) return;
    try{
      const resp = await fetch('/api/calendar/events');
      if(!resp.ok) throw new Error('bad response');
      const data = await resp.json();
      const events = Array.isArray(data.events) ? data.events : [];
      if(!events.length){
        eventList.textContent = 'No events.';
        return;
      }
      eventList.innerHTML = events.map(ev => {
        const start = ev.start?.dateTime || ev.start?.date || '';
        return `<div>${escapeHtml(ev.summary || '')} - ${escapeHtml(start)}</div>`;
      }).join('');
    }catch(e){
      console.error('Failed to load events', e);
      eventList.textContent = 'Failed to load events.';
    }
  }

  if(eventList){
    renderEvents();
  }

  const noteEl = document.getElementById('dashNote');
  const titleEl = document.getElementById('dashNoteTitle');
  const selectEl = document.getElementById('noteSelect');
  const saveBtn = document.getElementById('dashSaveNote');
  if (noteEl && saveBtn && titleEl && selectEl) {
    let notes = JSON.parse(localStorage.getItem('dashNotes') || '[]');
    let selectedIdx = -1;
    function renderNotes(){
      const opts = ['<option value="">Select saved note...</option>'];
      notes.forEach((n,i)=> opts.push(`<option value="${i}">${escapeHtml(n.title)}</option>`));
      selectEl.innerHTML = opts.join('');
      if(selectedIdx >= 0) selectEl.value = String(selectedIdx);
    }
    renderNotes();
    selectEl.addEventListener('change', () => {
      selectedIdx = selectEl.value === '' ? -1 : Number(selectEl.value);
      if(selectedIdx === -1){ titleEl.value = ''; noteEl.value = ''; return; }
      const n = notes[selectedIdx];
      titleEl.value = n.title;
      noteEl.value = n.content;
    });

    function saveNote(){
      const title = titleEl.value.trim() || 'Untitled';
      const content = noteEl.value;
      if(selectedIdx >= 0){
        notes[selectedIdx] = { title, content };
      } else {
        notes.push({ title, content });
        selectedIdx = notes.length - 1;
      }
      localStorage.setItem('dashNotes', JSON.stringify(notes));
      renderNotes();
    }

    saveBtn.addEventListener('click', () => {
      saveNote();
    });

    let autoSaveTimer;
    function scheduleAutoSave(){
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(saveNote, 1000);
    }
    noteEl.addEventListener('input', scheduleAutoSave);
    titleEl.addEventListener('input', scheduleAutoSave);
  }

  const safeTotal = (items, key) => items.reduce((sum, item) => {
    const raw = item?.[key];
    const num = typeof raw === 'number' ? raw : Number.parseFloat(raw || '');
    return sum + (Number.isFinite(num) ? num : 0);
  }, 0);

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  (async () => {
    try {
      const [consumersRes, leadsRes] = await Promise.all([
        api('/api/consumers'),
        api('/api/leads')
      ]);

      const consumers = Array.isArray(consumersRes.consumers) ? consumersRes.consumers : [];
      const leads = Array.isArray(leadsRes.leads) ? leadsRes.leads : [];

      const totalSales = safeTotal(consumers, 'sale');
      const totalPaid = safeTotal(consumers, 'paid');

      setText('dashLeads', leads.length.toLocaleString());
      setText('dashClients', consumers.length.toLocaleString());
      setText('dashSales', formatCurrency(totalSales));
      setText('dashPayments', formatCurrency(totalPaid));

      const completedLeads = leads.filter(l => l.status === 'completed').length;
      const droppedLeads = leads.filter(l => l.status === 'dropped').length;
      const completedClients = consumers.filter(c => c.status === 'completed').length;
      const droppedClients = consumers.filter(c => c.status === 'dropped').length;
      const retentionDen = completedLeads + completedClients + droppedLeads + droppedClients;
      const retention = retentionDen ? ((completedLeads + completedClients) / retentionDen * 100) : 0;
      const conversionDen = leads.length;
      const conversion = conversionDen ? (completedLeads / conversionDen * 100) : 0;
      setText('dashRetention', retention.toFixed(1) + '%');
      setText('dashConversion', conversion.toFixed(1) + '%');

      renderClientMap(consumers);
    } catch (err) {
      console.error('Failed to load dashboard stats', err);
    }
  })();

  syncTourWidget();
});

window.addEventListener('crm:tutorial-request', (event) => {
  const mode = event?.detail?.mode || 'start';
  if(mode === 'resume'){
    startTour({ resume: true });
  } else {
    startTour({ resume: false });
  }
});

window.addEventListener('crm:tutorial-reset', () => {
  handleTutorialReset();
});

window.addEventListener('crm:assistant-request', () => {
  openChatCoach();
});

refreshHelpGuideState();
