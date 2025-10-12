/* public/dashboard.js */

import { escapeHtml, api, formatCurrency } from './common.js';

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

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short' });
const timelineDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

function parseDateSafe(value){
  if(!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function resolveItemDate(item){
  if(!item || typeof item !== 'object') return new Date();
  const candidates = [
    item.createdAt,
    item.updatedAt,
    item.created,
    item.updated,
    item.timestamp,
    item.date
  ];
  for(const val of candidates){
    const parsed = parseDateSafe(val);
    if(parsed) return parsed;
  }
  return new Date();
}

function buildMetricDataset({
  title,
  subtitle,
  label,
  color,
  items,
  getValue = () => 1,
  getDate = resolveItemDate,
  timelineFormatter = () => ({ title: '', subtitle: '', meta: '', value: '' }),
  filter,
  formatValue
}){
  const source = Array.isArray(items) ? items.slice() : [];
  const filtered = typeof filter === 'function' ? source.filter(filter) : source;
  const now = new Date();
  const monthAnchors = [];
  for(let i=5;i>=0;i--){
    monthAnchors.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }

  const labels = monthAnchors.map(anchor => monthFormatter.format(anchor));
  const data = monthAnchors.map(anchor => {
    return filtered.reduce((sum, item) => {
      const date = getDate(item);
      if(!(date instanceof Date)) return sum;
      if(date.getFullYear() === anchor.getFullYear() && date.getMonth() === anchor.getMonth()){
        const raw = getValue(item);
        const num = typeof raw === 'number' ? raw : Number.parseFloat(raw ?? '0');
        return sum + (Number.isFinite(num) ? num : 0);
      }
      return sum;
    }, 0);
  });

  const timeline = filtered
    .map(item => ({ item, date: getDate(item) }))
    .filter(entry => entry.date instanceof Date)
    .sort((a,b) => b.date - a.date)
    .slice(0, 8)
    .map(({ item, date }) => timelineFormatter(item, date));

  return {
    title,
    subtitle,
    dataset: { labels, data, label, color, formatValue },
    timeline
  };
}

function createDetailModal(){
  const modal = document.getElementById('detailModal');
  const chartCanvas = document.getElementById('detailChart');
  const titleEl = document.getElementById('detailModalTitle');
  const subtitleEl = document.getElementById('detailModalSubtitle');
  const timelineEl = document.getElementById('detailTimeline');
  const closeBtn = document.getElementById('detailModalClose');
  const triggers = document.querySelectorAll('.detail-trigger');
  if(!modal || !chartCanvas || !timelineEl){
    return { setGenerators: () => {} };
  }
  let chartInstance = null;
  let generators = {};

  function close(){
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.classList.remove('overflow-hidden');
  }

  function open(type){
    const generator = generators[type];
    if(!generator){
      console.warn('No generator configured for metric', type);
      return;
    }
    const details = generator();
    if(!details) return;
    const { dataset, timeline, title, subtitle } = details;
    if(titleEl && title) titleEl.textContent = title;
    if(subtitleEl) subtitleEl.textContent = subtitle || '';
    if(typeof window.Chart === 'undefined'){
      console.warn('Chart.js is not available');
    } else {
      const ctx = chartCanvas.getContext('2d');
      if(ctx){
        if(chartInstance){
          chartInstance.destroy();
        }
        const formatter = dataset.formatValue || (val => Number.isFinite(val) ? val.toLocaleString() : String(val));
        chartInstance = new window.Chart(ctx, {
          type: 'line',
          data: {
            labels: dataset.labels,
            datasets: [{
              label: dataset.label,
              data: dataset.data,
              borderColor: dataset.color,
              backgroundColor: dataset.color,
              tension: 0.35,
              fill: false,
              pointRadius: 4,
              pointHoverRadius: 5
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: (value) => formatter(value)
                }
              }
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (context) => `${dataset.label}: ${formatter(context.parsed.y)}`
                }
              }
            }
          }
        });
      }
    }

    if(timeline.length){
      timelineEl.innerHTML = timeline.map(entry => {
        const title = escapeHtml(entry.title || '');
        const subtitle = entry.subtitle ? `<div class="text-xs muted mt-1">${escapeHtml(entry.subtitle)}</div>` : '';
        const meta = entry.meta ? `<div class="text-xs muted mt-2">${escapeHtml(entry.meta)}</div>` : '';
        const value = entry.value ? `<div class="text-sm font-semibold">${escapeHtml(entry.value)}</div>` : '';
        return `<li class="glass card p-3">` +
          `<div class="flex items-start justify-between gap-3">` +
            `<div><div class="font-medium">${title}</div>${subtitle}</div>` +
            `${value}` +
          `</div>` +
          `${meta}` +
        `</li>`;
      }).join('');
    } else {
      timelineEl.innerHTML = '<li class="muted">No recent activity.</li>';
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');
  }

  modal.addEventListener('click', (evt) => {
    if(evt.target === modal){
      close();
    }
  });
  if(closeBtn){
    closeBtn.addEventListener('click', close);
  }
  document.addEventListener('keydown', (evt) => {
    if(evt.key === 'Escape' && !modal.classList.contains('hidden')){
      close();
    }
  });
  triggers.forEach(btn => {
    btn.addEventListener('click', (evt) => {
      evt.preventDefault();
      const type = btn.dataset.detail;
      if(type){
        open(type);
      }
    });
  });

  return {
    setGenerators(map){
      generators = map || {};
    }
  };
}
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
  const detailModalController = createDetailModal();
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
      detailModalController.setGenerators({
        leads: () => buildMetricDataset({
          title: 'Lead Intake',
          subtitle: 'Monthly snapshot of new leads captured.',
          label: 'Leads per month',
          color: '#a855f7',
          items: leads,
          getValue: () => 1,
          timelineFormatter: (lead, date) => ({
            title: lead.name || 'Lead',
            subtitle: lead.status ? `Status: ${lead.status}` : 'Status not set',
            meta: timelineDateFormatter.format(date),
            value: lead.source ? `Source: ${lead.source}` : ''
          })
        }),
        clients: () => buildMetricDataset({
          title: 'Client Growth',
          subtitle: 'Clients activated in the last six months.',
          label: 'Clients per month',
          color: '#38bdf8',
          items: consumers,
          getValue: () => 1,
          timelineFormatter: (client, date) => ({
            title: client.name || 'Client',
            subtitle: `Status: ${client.status || 'active'}`,
            meta: timelineDateFormatter.format(date),
            value: client.sale ? formatCurrency(client.sale) : ''
          })
        }),
        sales: () => buildMetricDataset({
          title: 'Sales Revenue',
          subtitle: 'Signed contract value by month.',
          label: 'Sales ($)',
          color: '#22c55e',
          items: consumers,
          getValue: (consumer) => Number(consumer.sale) || 0,
          formatValue: (value) => formatCurrency(value || 0),
          timelineFormatter: (consumer, date) => ({
            title: consumer.name || 'Client',
            subtitle: 'Sale recorded',
            meta: timelineDateFormatter.format(date),
            value: formatCurrency(Number(consumer.sale) || 0)
          }),
          filter: (consumer) => Number(consumer.sale) > 0
        }),
        payments: () => buildMetricDataset({
          title: 'Payments Collected',
          subtitle: 'Cash collected from clients.',
          label: 'Payments ($)',
          color: '#f97316',
          items: consumers,
          getValue: (consumer) => Number(consumer.paid) || 0,
          formatValue: (value) => formatCurrency(value || 0),
          timelineFormatter: (consumer, date) => ({
            title: consumer.name || 'Client',
            subtitle: 'Latest payment captured',
            meta: timelineDateFormatter.format(date),
            value: formatCurrency(Number(consumer.paid) || 0)
          }),
          filter: (consumer) => Number(consumer.paid) > 0
        })
      });
    } catch (err) {
      console.error('Failed to load dashboard stats', err);
    }
  })();
});
