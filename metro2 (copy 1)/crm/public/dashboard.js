/* public/dashboard.js */
function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }

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
  const map = L.map(mapEl).setView([37.8,-96],4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© OpenStreetMap contributors'
  }).addTo(map);
  setTimeout(()=>map.invalidateSize(),0);
  consumers.forEach(c=>{
    const code = getStateCode(c.state);
    const coords = stateCenters[code];
    if(coords){
      L.circleMarker(coords,{ radius:6, color:'#059669', fillColor:'#10b981', fillOpacity:0.7 })
        .addTo(map)
        .bindPopup(c.name || '');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const feedEl = document.getElementById('newsFeed');
  if (feedEl) {
    const rssUrl = 'https://hnrss.org/frontpage';
    const apiUrl = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(rssUrl);
    fetch(apiUrl)
      .then(r => r.json())
      .then(data => {
        const items = data.items || [];
        if (!items.length) {
          feedEl.textContent = 'No news available.';
          return;
        }
        feedEl.innerHTML = items.slice(0,5).map(item => {
          return `<div class="news-item"><a href="${item.link}" target="_blank" class="text-blue-600 underline">${item.title}</a></div>`;
        }).join('');
      })
      .catch(err => {
        console.error('Failed to load news feed', err);
        feedEl.textContent = 'Failed to load news.';
      });
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

  const goalBtn = document.getElementById('btnGoal');
  if(goalBtn){
    const confettiEl = document.getElementById('confetti');
    goalBtn.addEventListener('click', () => {
      if(!confettiEl) return;
      for(let i=0;i<20;i++){
        const s=document.createElement('span');
        s.className='confetti-piece';
        const tx=(Math.random()-0.5)*200;
        const ty=(-Math.random()*150-50);
        s.style.setProperty('--tx', tx+'px');
        s.style.setProperty('--ty', ty+'px');
        s.style.backgroundColor=`hsl(${Math.random()*360},80%,60%)`;
        confettiEl.appendChild(s);
        setTimeout(()=>s.remove(),1200);
      }
    });
  }

  Promise.all([
    fetch('/api/consumers').then(r => r.json()),
    fetch('/api/leads').then(r => r.json())
  ])
    .then(([cData, lData]) => {
      const consumers = cData.consumers || [];
      const leads = lData.leads || [];
      const totalSales = consumers.reduce((s,c)=> s + Number(c.sale || 0), 0);
      const totalPaid = consumers.reduce((s,c)=> s + Number(c.paid || 0), 0);
      const fmt = (n)=> `$${n.toFixed(2)}`;
      const set = (id, val)=>{ const el=document.getElementById(id); if(el) el.textContent = val; };
      set('dashLeads', leads.filter(l=>l.status==='new').length);
      set('dashClients', consumers.length);
      set('dashSales', fmt(totalSales));
      set('dashPayments', fmt(totalPaid));

      const completedLeads = leads.filter(l=>l.status==='completed').length;
      const droppedLeads = leads.filter(l=>l.status==='dropped').length;
      const completedClients = consumers.filter(c=>c.status==='completed').length;
      const droppedClients = consumers.filter(c=>c.status==='dropped').length;
      const retDen = completedLeads + completedClients + droppedLeads + droppedClients;
      const retention = retDen ? ((completedLeads + completedClients)/retDen*100) : 0;
      const convDen = leads.length;
      const conversion = convDen ? (completedLeads/convDen*100) : 0;
      set('dashRetention', retention.toFixed(1)+"%");
      const convEl = document.getElementById('dashConversion');
      if(convEl) convEl.textContent = conversion.toFixed(1)+"%";
      renderClientMap(consumers);
    })
    .catch(err=> console.error('Failed to load dashboard stats', err));
});
