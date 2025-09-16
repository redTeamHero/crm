/* public/dashboard.js */

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

const BUREAUS = ['TransUnion','Experian','Equifax'];
const SCORE_BUCKETS = [
  { min: 760, label: 'Excellent · Excelente' },
  { min: 720, label: 'Very good · Muy bueno' },
  { min: 680, label: 'Good · Bueno' },
  { min: 620, label: 'Fair · Regular' },
  { min: 0, label: 'Needs attention · Necesita atención' }
];

function bilingual(en, es){
  return `${en} · ${es}`;
}

const DEFAULT_FALLBACK = bilingual('Not reported', 'No informado');
let cachedSnapshotRaw = null;
let cachedSnapshot = null;

function getStoredScores(){
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem('creditScore');
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('Invalid creditScore payload', err);
    return {};
  }
}

function getReportSnapshot(){
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem('reportSnapshot');
  if (!raw) {
    cachedSnapshotRaw = null;
    cachedSnapshot = null;
    return null;
  }
  if (raw === cachedSnapshotRaw) return cachedSnapshot;
  try {
    const parsed = JSON.parse(raw);
    cachedSnapshotRaw = raw;
    cachedSnapshot = parsed && typeof parsed === 'object' ? parsed : null;
    return cachedSnapshot;
  } catch (err) {
    console.warn('Invalid report snapshot', err);
    cachedSnapshotRaw = raw;
    cachedSnapshot = null;
    return null;
  }
}

function categorizeScore(score){
  if (!Number.isFinite(score)) return bilingual('No data', 'Sin datos');
  for (const bucket of SCORE_BUCKETS){
    if (score >= bucket.min) return bucket.label;
  }
  return SCORE_BUCKETS[SCORE_BUCKETS.length - 1].label;
}

function valueOrFallback(value, fallback = DEFAULT_FALLBACK){
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  return String(value);
}

function formatDateDisplay(value){
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  let dt = new Date(raw);
  if (Number.isNaN(dt) && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    dt = new Date(`${raw}T00:00:00`);
  }
  if (!Number.isNaN(dt)) {
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return raw;
}

function formatMoneyDisplay(raw, numeric){
  if (raw !== undefined && raw !== null){
    const txt = String(raw).trim();
    if (txt) return txt;
  }
  if (typeof numeric === 'number' && !Number.isNaN(numeric)) {
    return formatCurrency(numeric);
  }
  return '';
}

function readScore(scores, bureau){
  if (!scores) return null;
  const keyMap = {
    TransUnion: ['transunion','tu','current'],
    Experian: ['experian','exp'],
    Equifax: ['equifax','eq','eqf']
  }[bureau];
  for (const key of keyMap || []){
    if (scores[key] !== undefined && scores[key] !== null){
      const val = Number(scores[key]);
      if (!Number.isNaN(val) && val > 0) return Math.round(val);
    }
  }
  return null;
}

function renderCreditScores(){
  const grid = document.getElementById('creditScoreGrid');
  if (!grid) return;
  const meta = document.getElementById('creditScoreMeta');
  const scores = getStoredScores();
  const baseline = Number(scores.start || scores.baseline || 0) || null;
  const data = BUREAUS.map(bureau => {
    const value = readScore(scores, bureau);
    const delta = baseline && value ? value - baseline : null;
    return { bureau, value, delta, label: categorizeScore(value ?? NaN) };
  });
  const available = data.filter(item => Number.isFinite(item.value));
  if (!available.length){
    grid.innerHTML = `<div class="text-sm text-blue-700/80">${escapeHtml(bilingual('No credit scores saved yet. Upload a report to sync them.', 'Aún no hay puntajes guardados. Sube un reporte para sincronizarlos.'))}</div>`;
    if (meta) meta.textContent = '';
    return;
  }
  grid.innerHTML = data.map(item => {
    const valueTxt = Number.isFinite(item.value) ? String(item.value) : '—';
    const deltaTxt = Number.isFinite(item.delta) && item.delta !== 0
      ? `<span class="text-xs font-semibold ${item.delta > 0 ? 'text-emerald-600' : 'text-red-600'}">${item.delta > 0 ? '+' : ''}${item.delta}</span>`
      : '';
    return `<div class="rounded-xl border border-blue-200 bg-white/80 p-4 shadow-inner flex flex-col gap-1">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wide text-blue-500">${escapeHtml(item.bureau)}</span>
          ${deltaTxt}
        </div>
        <div class="text-3xl font-bold text-slate-900">${escapeHtml(valueTxt)}</div>
        <div class="text-[11px] text-blue-600">${escapeHtml(item.label)}</div>
      </div>`;
  }).join('');
  if (meta){
    const avg = Math.round(available.reduce((sum, item) => sum + item.value, 0) / available.length);
    const snapshot = getReportSnapshot();
    const updated = snapshot?.capturedAt ? new Date(snapshot.capturedAt) : null;
    const updatedTxt = updated && !Number.isNaN(updated)
      ? `Updated ${updated.toLocaleString()}`
      : bilingual('Awaiting latest report', 'Esperando último reporte');
    meta.textContent = `Avg ${avg} • ${categorizeScore(avg)} • ${updatedTxt}`;
  }
}

function renderPersonalInfoSection(){
  const grid = document.getElementById('personalInfoGrid');
  if (!grid) return;
  const snapshot = getReportSnapshot();
  const info = snapshot?.personalInfo || {};
  const hasAny = BUREAUS.some(b => info[b]);
  if (!hasAny){
    grid.innerHTML = `<div class="text-sm text-green-700/80">${escapeHtml(bilingual('No personal data synced yet. Generate a report to populate this section.', 'Aún no se sincroniza información personal. Genera un reporte para ver datos aquí.'))}</div>`;
    return;
  }
  grid.innerHTML = BUREAUS.map(bureau => {
    const data = info[bureau];
    if (!data){
      return `<div class="rounded-xl border border-green-200 bg-white/70 p-4 text-sm text-green-700/80 shadow-inner">
        <div class="font-semibold">${escapeHtml(bureau)}</div>
        <p class="mt-2 text-xs text-green-600/80">${escapeHtml(bilingual('No data reported by this bureau.', 'Este buró no reportó datos.'))}</p>
      </div>`;
    }
    const addresses = Array.isArray(data.addresses) && data.addresses.length
      ? data.addresses.map(addr => `<li class="leading-tight">${escapeHtml(addr)}</li>`).join('')
      : `<li class="text-xs text-green-600/80">${escapeHtml(bilingual('No address reported', 'Sin dirección reportada'))}</li>`;
    const nameTxt = valueOrFallback(data.name);
    const dobTxt = valueOrFallback(formatDateDisplay(data.dob));
    const addressBadge = data.addresses && data.addresses.length
      ? `<span class="text-[11px] text-green-500">${escapeHtml(String(data.addresses.length))} ${data.addresses.length === 1 ? 'address' : 'addresses'}</span>`
      : '';
    return `<div class="rounded-xl border border-green-200 bg-white/70 p-4 space-y-2 shadow-inner">
      <div class="flex items-center justify-between text-sm font-semibold text-green-700">
        <span>${escapeHtml(bureau)}</span>
        ${addressBadge}
      </div>
      <div class="text-xs text-green-900"><span class="font-semibold uppercase tracking-wide text-green-500">Name</span> <span class="ml-1">${escapeHtml(nameTxt)}</span></div>
      <div class="text-xs text-green-900"><span class="font-semibold uppercase tracking-wide text-green-500">DOB</span> <span class="ml-1">${escapeHtml(dobTxt)}</span></div>
      <div>
        <div class="text-[11px] font-semibold uppercase tracking-wide text-green-500 mb-1">Addresses</div>
        <ul class="space-y-1 text-xs text-green-900">${addresses}</ul>
      </div>
    </div>`;
  }).join('');
}

function normalizeHistoryEntries(entries){
  if (!Array.isArray(entries)) return [];
  return entries.map(entry => {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object'){
      return entry.status_class || entry.status_text || '';
    }
    return '';
  }).filter(Boolean);
}

function describeHistory(code){
  if (!code) return bilingual('Review history', 'Revisar historial');
  const raw = String(code).toLowerCase();
  const clean = raw.replace(/[^a-z0-9-]/g, '');
  if (clean.startsWith('hstry-')){
    const suffix = clean.slice(6);
    if (/^\d+$/.test(suffix)) return bilingual(`${suffix} days late`, `${suffix} días tarde`);
    if (suffix === 'ok') return bilingual('On time', 'Al corriente');
    if (suffix === 'unknown') return bilingual('No data reported', 'Sin datos reportados');
    if (suffix === 'late') return bilingual('Late payment reported', 'Pago tardío reportado');
    if (suffix === 'derog') return bilingual('Severe derogatory', 'Severo derogatorio');
    if (suffix === 'neg') return bilingual('Negative mark', 'Marca negativa');
    if (suffix === 'co') return bilingual('Charge-off reported', 'Cargo castigado reportado');
    if (suffix === 'collection') return bilingual('Collection reported', 'Cuenta en cobranza');
  }
  if (/^\d+$/.test(clean)) return bilingual(`${clean} days late`, `${clean} días tarde`);
  if (clean.includes('ok')) return bilingual('On time', 'Al corriente');
  if (clean.includes('unknown') || clean === '?') return bilingual('No data reported', 'Sin datos reportados');
  if (clean.includes('late') || clean.includes('delinquent')) return bilingual('Late payment reported', 'Pago tardío reportado');
  return bilingual('Review history', 'Revisar historial');
}

function renderPaymentHistory(){
  const grid = document.getElementById('paymentHistoryGrid');
  if (!grid) return;
  const snapshot = getReportSnapshot();
  const tradelines = snapshot?.tradelines || [];
  if (!tradelines.length){
    grid.innerHTML = `<div class="text-sm text-yellow-700/80">${escapeHtml(bilingual('No payment history available. Upload a report to analyze trends.', 'No hay historial de pagos disponible. Sube un reporte para analizar tendencias.'))}</div>`;
    return;
  }
  const summary = {};
  BUREAUS.forEach(b => summary[b] = new Map());
  tradelines.forEach(tl => {
    const history = tl.history || {};
    BUREAUS.forEach(bureau => {
      const entries = normalizeHistoryEntries(history[bureau]);
      if (!entries.length) return;
      const map = summary[bureau];
      entries.forEach(code => {
        const label = describeHistory(code);
        const record = map.get(label) || { count: 0 };
        record.count += 1;
        map.set(label, record);
      });
    });
  });
  grid.innerHTML = BUREAUS.map(bureau => {
    const entries = Array.from(summary[bureau].entries())
      .sort((a,b) => b[1].count - a[1].count)
      .slice(0,4);
    if (!entries.length){
      return `<div class="rounded-xl border border-yellow-200 bg-white/70 p-4 text-sm text-yellow-700/80 shadow-inner">
        <div class="font-semibold">${escapeHtml(bureau)}</div>
        <p class="mt-2 text-xs text-yellow-600/80">${escapeHtml(bilingual('No payment history captured for this bureau.', 'No se capturó historial de pagos para este buró.'))}</p>
      </div>`;
    }
    const list = entries.map(([label,data]) => `<li class="flex items-center justify-between gap-2"><span class="text-xs text-yellow-900">${escapeHtml(label)}</span><span class="text-xs font-semibold text-yellow-700">${escapeHtml(String(data.count))}</span></li>`).join('');
    return `<div class="rounded-xl border border-yellow-200 bg-white/70 p-4 shadow-inner">
      <div class="text-sm font-semibold text-yellow-700">${escapeHtml(bureau)}</div>
      <ul class="mt-2 space-y-1">${list}</ul>
      <p class="mt-3 text-[11px] text-yellow-600/80">${escapeHtml(bilingual('Most frequent marks shown above.', 'Marcas más frecuentes mostradas arriba.'))}</p>
    </div>`;
  }).join('');
}

function renderAccountBureau(bureau, data, accountNumber){
  if (!data || !Object.keys(data).length){
    return `<div class="rounded-lg border border-purple-100 bg-purple-50/60 p-3 text-xs text-purple-600/80 shadow-inner">${escapeHtml(bilingual('No data reported', 'Sin datos reportados'))}</div>`;
  }
  const fields = [
    { label: 'Account Status', value: data.account_status },
    { label: 'Payment Status', value: data.payment_status },
    { label: 'Balance', value: formatMoneyDisplay(data.balance_raw, data.balance) },
    { label: 'Credit Limit', value: formatMoneyDisplay(data.credit_limit_raw, data.credit_limit) },
    { label: 'Monthly Payment', value: formatMoneyDisplay(data.monthly_payment_raw, data.monthly_payment) },
    { label: 'Past Due', value: formatMoneyDisplay(data.past_due_raw, data.past_due) },
    { label: 'Opened', value: formatDateDisplay(data.date_opened_raw || data.date_opened) },
    { label: 'Closed', value: formatDateDisplay(data.date_closed_raw || data.date_closed), optional: true },
    { label: 'Last Reported', value: formatDateDisplay(data.last_reported_raw || data.last_reported) }
  ];
  const rows = fields.map(field => {
    if ((!field.value || field.value === '') && field.optional) return '';
    const display = valueOrFallback(field.value);
    return `<div class="flex justify-between gap-2 text-xs text-purple-900"><span class="font-semibold uppercase tracking-wide text-[11px] text-purple-500">${escapeHtml(field.label)}</span><span class="text-right">${escapeHtml(display)}</span></div>`;
  }).join('');
  const acct = accountNumber || data.account_number;
  return `<div class="rounded-lg border border-purple-200 bg-white/80 p-3 shadow-sm">
    <div class="mb-2 flex items-center justify-between">
      <span class="text-sm font-semibold text-purple-600">${escapeHtml(bureau)}</span>
      ${acct ? `<span class="text-[11px] text-purple-400">#${escapeHtml(String(acct))}</span>` : ''}
    </div>
    ${rows || `<p class="text-xs text-purple-500/80">${escapeHtml(bilingual('No details reported', 'Sin detalles reportados'))}</p>`}
  </div>`;
}

function renderAccountDetailsSection(){
  const list = document.getElementById('accountDetailsList');
  if (!list) return;
  const snapshot = getReportSnapshot();
  const tradelines = snapshot?.tradelines || [];
  if (!tradelines.length){
    list.innerHTML = `<p class="text-sm text-purple-700/80">${escapeHtml(bilingual('No accounts available yet. Upload a report to review balances and limits.', 'No hay cuentas disponibles. Sube un reporte para revisar saldos y límites.'))}</p>`;
    return;
  }
  const displayed = tradelines.slice(0, 3);
  const cards = displayed.map((tl, idx) => {
    const title = tl.meta?.creditor ? tl.meta.creditor : `Account ${idx + 1}`;
    const accountNumbers = tl.meta?.accountNumbers || {};
    const utilization = tl.metrics?.avg_utilization ?? tl.metrics?.avgUtilization;
    const utilText = typeof utilization === 'number' && !Number.isNaN(utilization)
      ? `Utilization ${utilization.toFixed(1)}%`
      : '';
    const sections = BUREAUS.map(bureau => renderAccountBureau(bureau, tl.per_bureau?.[bureau], accountNumbers[bureau])).join('');
    return `<article class="rounded-xl bg-white/70 p-4 shadow-inner border border-purple-200">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h4 class="text-base font-semibold text-purple-700">${escapeHtml(title)}</h4>
        ${utilText ? `<span class="text-xs text-purple-500">${escapeHtml(utilText)}</span>` : ''}
      </div>
      <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${sections}</div>
    </article>`;
  }).join('');
  const extra = tradelines.length > displayed.length
    ? `<p class="text-[11px] text-purple-500/80">${escapeHtml(bilingual(`Showing ${displayed.length} of ${tradelines.length} tradelines`, `Mostrando ${displayed.length} de ${tradelines.length} cuentas`))}</p>`
    : '';
  list.innerHTML = cards + extra;
}

function canonicalBureau(name){
  const key = String(name || '').toLowerCase().replace(/[^a-z]/g,'');
  const map = {
    transunion: 'TransUnion',
    tu: 'TransUnion',
    experian: 'Experian',
    exp: 'Experian',
    equifax: 'Equifax',
    eq: 'Equifax',
    eqf: 'Equifax'
  };
  return map[key] || (name ? String(name) : '');
}

function formatInquiryDate(value){
  if (!value) return '';
  const dt = new Date(value);
  if (!Number.isNaN(dt)) {
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (typeof value === 'string') return value;
  return '';
}

function renderRecentInquiries(){
  const list = document.getElementById('recentInquiriesList');
  if (!list) return;
  const snapshot = getReportSnapshot();
  const inquiries = Array.isArray(snapshot?.inquiries) ? snapshot.inquiries : [];
  if (!inquiries.length){
    list.innerHTML = `<p class="text-sm text-red-700/80">${escapeHtml(bilingual('No hard pulls captured in the last report.', 'No se capturaron consultas duras en el último reporte.'))}</p>`;
    return;
  }
  const sorted = inquiries.slice().sort((a,b) => {
    const aTime = Date.parse(a?.date || '') || 0;
    const bTime = Date.parse(b?.date || '') || 0;
    return bTime - aTime;
  });
  const limited = sorted.slice(0, 5);
  const cards = limited.map(inq => {
    const creditor = valueOrFallback(inq.creditor, bilingual('Unknown creditor', 'Acreedor desconocido'));
    const bureau = canonicalBureau(inq.bureau) || bilingual('Unknown bureau', 'Buró desconocido');
    const dateTxt = valueOrFallback(formatInquiryDate(inq.date), bilingual('Date unavailable', 'Fecha no disponible'));
    return `<div class="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-white/80 px-3 py-2 shadow-sm">
      <div>
        <div class="font-semibold text-sm text-red-700">${escapeHtml(creditor)}</div>
        <div class="text-[11px] text-red-500">${escapeHtml(bureau)}</div>
      </div>
      <div class="text-xs text-red-600">${escapeHtml(dateTxt)}</div>
    </div>`;
  }).join('');
  const extra = inquiries.length > limited.length
    ? `<p class="text-[11px] text-red-500/80">${escapeHtml(bilingual(`Showing ${limited.length} of ${inquiries.length} inquiries`, `Mostrando ${limited.length} de ${inquiries.length} consultas`))}</p>`
    : '';
  list.innerHTML = cards + extra;
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

  renderCreditScores();
  renderPersonalInfoSection();
  renderPaymentHistory();
  renderAccountDetailsSection();
  renderRecentInquiries();

  window.addEventListener('storage', (evt) => {
    if (evt.key === 'creditScore') renderCreditScores();
    if (evt.key === 'reportSnapshot') {
      cachedSnapshotRaw = null;
      cachedSnapshot = null;
      renderPersonalInfoSection();
      renderPaymentHistory();
      renderAccountDetailsSection();
      renderRecentInquiries();
    }
  });

  try {
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key, value){
      originalSetItem.apply(this, arguments);
      if (key === 'creditScore') renderCreditScores();
      if (key === 'reportSnapshot') {
        cachedSnapshotRaw = null;
        cachedSnapshot = null;
        renderPersonalInfoSection();
        renderPaymentHistory();
        renderAccountDetailsSection();
        renderRecentInquiries();
      }
    };
  } catch (err) {
    console.warn('Unable to hook localStorage updates', err);
  }
});
