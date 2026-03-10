/* public/client-portal.js */
function esc(str){ return String(str ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

const productTiers = [
  { deletions:150, score:780, name:'Wealth Builder', icon:'👑', class:'bg-gradient-to-r from-purple-400 to-pink-500 text-white', message:'Legendary status — mortgages, lines, and cards all bend in your favor. You’ve built true financial freedom.' },
  { deletions:125, score:760, name:'Elite Borrower', icon:'🦸', class:'bg-red-100 text-red-700', message:'You’ve achieved elite borrower status — lenders see you as top-tier.' },
  { deletions:100, score:750, name:'Funding Power', icon:'🏆', class:'bg-yellow-200 text-yellow-800', message:'You’ve become a funding champion — major approvals are within reach.' },
  { deletions:75, score:740, name:'Travel & Rewards', icon:'✈️', class:'bg-indigo-100 text-indigo-700', message:'You now qualify for premium travel rewards and lifestyle cards.' },
  { deletions:50, score:720, name:'Credit Line Access', icon:'💼', class:'bg-accent-subtle', message:'Business and personal credit lines are opening up.' },
  { deletions:40, score:700, name:'Mortgage Ready', icon:'🏡', class:'bg-green-100 text-green-700', message:'You’re building toward homeownership — mortgage approvals are now within reach.' },
  { deletions:30, score:680, name:'Loan Lever', icon:'🏦', class:'bg-lime-100 text-lime-700', message:'Personal loan doors are opening — leverage your clean report.' },
  { deletions:20, score:650, name:'Prime Plastic', icon:'💳', class:'bg-cyan-100 text-cyan-700', message:'You’re climbing into prime cards with real rewards.' },
  { deletions:10, score:0, name:'Auto Access', icon:'🚗', class:'bg-orange-100 text-orange-700', message:'Now you’re positioned for auto financing approvals.' },
  { deletions:5, score:0, name:'Retail Ready', icon:'🛍️', class:'bg-emerald-100 text-emerald-700', message:'You’re ready for retail cards — momentum is building.' },
  { deletions:1, score:0, name:'Approval Spark', icon:'✅', class:'bg-emerald-100 text-emerald-700', message:'Your first approval spark — you’re clearing the way for credit opportunities.' },
  { deletions:0, score:0, name:'Secured Start', icon:'🔒', class:'bg-emerald-100 text-emerald-700', message:'You’ve planted the seed — secured cards are your first step to building credit.' },
];

const DEFAULT_PORTAL_BACKGROUND = 'radial-gradient(circle at top, rgba(0, 122, 255, 0.08), rgba(255, 255, 255, 0.96) 55%), linear-gradient(180deg, rgba(245, 245, 247, 0.95), rgba(237, 242, 247, 0.9))';

const DEFAULT_PORTAL_THEME = Object.freeze({
  backgroundColor: '',
  logoUrl: '',
  taglinePrimary: 'Track disputes, uploads, and approvals in one place.',
  taglineSecondary: 'Stay on top of disputes, uploads, and approvals from one hub.',
});

const PORTAL_MODULE_CONFIG = Object.freeze({
  creditScore: { sections: ['#creditScoreWidget'] },
  negativeItems: { nav: '#navNegativeItems', sections: ['#negativeItemsCard', '#negativeItemsSection'] },
  reportSnapshot: { sections: ['#reportSnapshotCard'] },
  milestones: { sections: ['#milestonesCard'] },
  team: { sections: ['#teamCard'] },
  news: { sections: ['#newsCard'] },
  debtCalc: { sections: ['#debtCalculatorCard'] },
  messages: { nav: '#navMessages', sections: ['#messageSection'] },
  education: { nav: '#navEducation', sections: ['#educationSection'] },
  documents: { nav: '#navDocuments', sections: ['#documentsCard', '#documentSection'] },
  mail: { nav: '#navMail', sections: ['#mailSection'] },
  payments: { nav: '#navPayments', sections: ['#paymentSection'] },
  tradelines: { nav: '#navTradelines', sections: ['#tradelinesSection'] },
  primaries: { nav: '#navPrimaries', sections: ['#primariesSection'] },
  uploads: { nav: '#navUploads', sections: ['#uploadSection'] },
  disputes: { nav: '#navDisputes', sections: ['#disputeSection'] },
  affiliate: { nav: '#navAffiliate', sections: ['#affiliateSection'] },
});

const HASH_TO_PORTAL_MODULE = Object.freeze({
  '#uploads': 'uploads',
  '#messages': 'messages',
  '#educationSection': 'education',
  '#documentSection': 'documents',
  '#mailSection': 'mail',
  '#payments': 'payments',
  '#tradelines': 'tradelines',
  '#primaries': 'primaries',
  '#negative-items': 'negativeItems',
  '#disputes': 'disputes',
  '#affiliate': 'affiliate',
});

const DATA_REGION_EXPERIMENT_KEY = 'portal-data-region';
let dataRegionVariant = 'control';
let dataRegionConversionLocked = false;

function applyDataRegionBanner(variant){
  const banner = document.getElementById('dataRegionBanner');
  if(!banner) return;
  if(variant === 'dedicated'){
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

async function bootstrapDataRegionExperiment(consumerId){
  const params = new URLSearchParams();
  if(consumerId) params.set('consumerId', consumerId);
  const query = params.toString();
  try {
    const resp = await fetch(`/api/experiments/${DATA_REGION_EXPERIMENT_KEY}${query ? `?${query}` : ''}`);
    if(!resp.ok) throw new Error('Experiment assignment failed');
    const payload = await resp.json();
    dataRegionVariant = payload?.variant || 'control';
    applyDataRegionBanner(dataRegionVariant);
    if(window.trackEvent){
      trackEvent('portal_data_region_variant', { variant: dataRegionVariant });
    }
  } catch (err) {
    console.warn('Experiment fetch failed', err);
    dataRegionVariant = 'control';
    applyDataRegionBanner(dataRegionVariant);
  }
}

function recordDataRegionConversion(consumerId, action = 'cta_click'){
  if(dataRegionVariant !== 'dedicated' || dataRegionConversionLocked) return;
  dataRegionConversionLocked = true;
  const body = { action };
  if(consumerId) body.consumerId = consumerId;
  fetch(`/api/experiments/${DATA_REGION_EXPERIMENT_KEY}/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
  if(window.trackEvent){
    trackEvent('portal_data_region_conversion', { action });
  }
}

function safeParseScore(value){
  if(!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function getPortalSettings(){
  const bootstrap = window.__PORTAL_BOOTSTRAP__;
  if (bootstrap && typeof bootstrap === 'object' && bootstrap.portalSettings) {
    return bootstrap.portalSettings;
  }
  return {};
}

function getPortalEnhanced(){
  const enhanced = window.__PORTAL_ENHANCED__;
  if (enhanced && typeof enhanced === 'object') {
    return enhanced;
  }
  return {};
}

function formatReminderDate(due){
  if(!due) return '';
  const date = new Date(due);
  if(Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function applyNextSteps(reminders = []){
  const card = document.getElementById('nextStepCard');
  const title = document.getElementById('nextStepTitle');
  const due = document.getElementById('nextStepDue');
  const note = document.getElementById('nextStepNote');
  const action = document.getElementById('nextStepAction');
  if (!card || !title) return;
  const next = Array.isArray(reminders)
    ? reminders.find(reminder => reminder && (reminder.title || reminder.due || reminder.note))
    : null;
  if (!next) {
    title.textContent = 'No upcoming steps yet.';
    if (due) due.textContent = '';
    if (note) note.textContent = '';
    if (action) action.classList.add('hidden');
    return;
  }
  title.textContent = next.title || 'Next step';
  if (due) {
    const dateText = formatReminderDate(next.due);
    due.textContent = dateText ? dateText : '';
  }
  if (note) {
    note.textContent = next.note || '';
  }
  if (action) {
    action.classList.remove('hidden');
  }
}

function applyPortalTheme(theme = {}){
  const config = { ...DEFAULT_PORTAL_THEME, ...(theme || {}) };
  const root = document.documentElement;
  if (root) {
    const background = config.backgroundColor || DEFAULT_PORTAL_BACKGROUND;
    root.style.setProperty('--portal-background', background);
  }
  if (document.body) {
    document.body.style.background = config.backgroundColor ? config.backgroundColor : '';
  }

  const taglinePrimaryEl = document.getElementById('companyTaglinePrimary');
  if (taglinePrimaryEl) {
    taglinePrimaryEl.textContent = config.taglinePrimary || DEFAULT_PORTAL_THEME.taglinePrimary;
  }
  const taglineSecondaryEl = document.getElementById('companyTaglineSecondary');
  if (taglineSecondaryEl) {
    if (config.taglineSecondary) {
      taglineSecondaryEl.textContent = config.taglineSecondary;
      taglineSecondaryEl.classList.remove('hidden');
    } else {
      taglineSecondaryEl.textContent = '';
      taglineSecondaryEl.classList.add('hidden');
    }
  }

  const mascotEl = document.getElementById('mascot');
  if (mascotEl) {
    if (config.logoUrl) {
      mascotEl.innerHTML = '';
      mascotEl.dataset.customLogo = '1';
      mascotEl.classList.add('bg-white/80', 'rounded-xl', 'p-1', 'shadow');
      const img = document.createElement('img');
      img.src = config.logoUrl;
      img.alt = 'Company logo';
      img.className = 'h-12 w-12 object-contain';
      mascotEl.appendChild(img);
    } else {
      mascotEl.dataset.customLogo = '';
      mascotEl.classList.remove('bg-white/80', 'rounded-xl', 'p-1', 'shadow');
      mascotEl.innerHTML = '';
    }
  }
}

function applyPortalModules(modules = {}){
  for (const [key, config] of Object.entries(PORTAL_MODULE_CONFIG)) {
    const enabled = Object.prototype.hasOwnProperty.call(modules, key) ? modules[key] !== false : true;
    if (config.nav) {
      document.querySelectorAll(config.nav).forEach(el => {
        if (!enabled) {
          el.classList.add('hidden');
          el.setAttribute('aria-hidden', 'true');
          el.tabIndex = -1;
        } else {
          el.classList.remove('hidden');
          el.removeAttribute('aria-hidden');
          el.tabIndex = 0;
        }
      });
    }
    (config.sections || []).forEach(selector => {
      document.querySelectorAll(selector).forEach(section => {
        if (!section.dataset.portalInitialHidden) {
          section.dataset.portalInitialHidden = section.classList.contains('hidden') ? '1' : '0';
        }
        if (!enabled) {
          section.classList.add('hidden');
          section.setAttribute('aria-hidden', 'true');
        } else {
          if (section.dataset.portalInitialHidden === '1') {
            section.classList.add('hidden');
          } else {
            section.classList.remove('hidden');
          }
          section.removeAttribute('aria-hidden');
        }
      });
    });
  }
}

function isPortalModuleEnabled(modules = {}, key){
  if (!key) return true;
  if (!modules || typeof modules !== 'object') return true;
  if (!Object.prototype.hasOwnProperty.call(modules, key)) return true;
  return modules[key] !== false;
}

function hasScoreData(score){
  if(!score || typeof score !== 'object') return false;
  const keys = ['transunion', 'tu', 'experian', 'exp', 'equifax', 'eq', 'current'];
  return keys.some(key => {
    const val = Number(score[key]);
    return Number.isFinite(val) && val > 0;
  });
}

function getBootstrapScore(){
  const bootstrap = window.__PORTAL_BOOTSTRAP__;
  if(bootstrap && typeof bootstrap === 'object' && bootstrap.creditScore){
    return bootstrap.creditScore;
  }
  return null;
}

function getLocalScore(){
  return safeParseScore(localStorage.getItem('creditScore'));
}

function formatScoreValue(value){
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.round(num) : '—';
}

function applyCreditScore(score, { persist = true } = {}){
  if(!hasScoreData(score)) return;
  if(!window.__PORTAL_BOOTSTRAP__) window.__PORTAL_BOOTSTRAP__ = {};
  window.__PORTAL_BOOTSTRAP__.creditScore = score;
  if(persist){
    try {
      const serialized = JSON.stringify(score);
      if(localStorage.getItem('creditScore') !== serialized){
        localStorage.setItem('creditScore', serialized);
        return; // loadScores will re-render
      }
    } catch {
      // fall through to direct render
    }
  }
  renderScore(score);
}

function getProductTier(deletions, score){
  for(const tier of productTiers){
    if(deletions >= tier.deletions && (!tier.score || score >= tier.score)) return tier;
  }
  return productTiers[productTiers.length-1];
}

function renderProductTier(score){
  const el = document.getElementById('tierBadge');
  if(!el) return;
  const deletions = Number(localStorage.getItem('deletions') || 0);
  let scoreVal;
  if(score !== undefined){
    if(typeof score === 'object'){
      const source = score || {};
      scoreVal = Number(source.current ?? source.transunion ?? source.tu ?? 0);
    } else {
      scoreVal = Number(score);
    }
  } else {
    const scoreData = getBootstrapScore() || getLocalScore() || {};
    scoreVal = Number(scoreData.current ?? scoreData.transunion ?? scoreData.tu ?? 0);
  }
  const tier = getProductTier(deletions, scoreVal);

  el.className = `order-3 sm:order-2 flex w-full sm:w-auto items-center gap-2 rounded-full px-4 py-2 shadow-sm animate-fadeInUp ${tier.class}`;
  el.innerHTML = `<span class="text-xl">${esc(tier.icon)}</span><span class="font-semibold text-sm">${esc(tier.name)}</span>`;
  el.title = tier.message;
}

function renderScore(score){
  const widget = document.getElementById('creditScoreWidget');
  if (!widget) return;
  const tuEl = widget.querySelector('.tu');
  const exEl = widget.querySelector('.ex');
  const eqEl = widget.querySelector('.eq');
  const scoreConfetti = document.getElementById('scoreConfetti');
  const data = (score && typeof score === 'object')
    ? score
    : (score !== undefined ? { current: score } : (getBootstrapScore() || getLocalScore() || {}));
  const tu = Number(data.transunion ?? data.tu ?? data.current ?? 0);
  const ex = Number(data.experian ?? data.exp ?? 0);
  const eq = Number(data.equifax ?? data.eq ?? 0);
  if (tuEl) tuEl.textContent = formatScoreValue(tu);
  if (exEl) exEl.textContent = formatScoreValue(ex);
  if (eqEl) eqEl.textContent = formatScoreValue(eq);
  const scores = [tu, ex, eq].filter(n => Number.isFinite(n) && n > 0);
  const avg = scores.length ? scores.reduce((a,b)=>a+b,0) / scores.length : 0;
  const start = Number(data.start || 0);
  if (avg > start && scoreConfetti && window.lottie) {
    lottie.loadAnimation({
      container: scoreConfetti,
      renderer: 'svg',
      loop: false,
      autoplay: true,
      path: 'https://assets10.lottiefiles.com/packages/lf20_j1adxtyb.json'
    });
    setTimeout(() => { scoreConfetti.innerHTML = ''; }, 1500);
    const ms = document.getElementById('milestones');
    if (ms) ms.innerHTML = `<div class="news-item">🎉 Score increased by ${Math.round(avg - start)} points!</div>`;
  }
  const updatedAtEl = document.getElementById('creditScoreUpdated');
  if (updatedAtEl) {
    const stamp = data.updatedAt;
    if (stamp) {
      const date = new Date(stamp);
      if (!Number.isNaN(date.getTime())) {
        updatedAtEl.textContent = `Updated: ${date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;
        updatedAtEl.classList.remove('hidden');
      } else {
        updatedAtEl.classList.add('hidden');
        updatedAtEl.textContent = '';
      }
    } else {
      updatedAtEl.classList.add('hidden');
      updatedAtEl.textContent = '';
    }
  }
  renderProductTier(data);
}

function loadScores(){
  const bootstrapScore = getBootstrapScore();
  if (hasScoreData(bootstrapScore)) {
    renderScore(bootstrapScore);
    return;
  }
  const stored = getLocalScore();
  if (hasScoreData(stored)) {
    renderScore(stored);
  } else {
    renderScore({});
  }
}

function renderTeamList(){
  const teamList = document.getElementById('teamList');
  if (!teamList) return;
  const team = JSON.parse(localStorage.getItem('teamMembers') || '[]');
  if (!team.length) {
    teamList.textContent = 'No team members added.';
  } else {
    teamList.innerHTML = team.map(m => {
      const role = m.role ? `<div class="text-xs muted">${esc(m.role)}${m.email? ' - ' + esc(m.email) : ''}</div>` : (m.email ? `<div class="text-xs muted">${esc(m.email)}</div>` : '');
      return `<div class="news-item"><div class="font-medium">${esc(m.name)}</div>${role}</div>`;
    }).join('');
  }
}

function initClientPortalNav(){
  const nav = document.getElementById('primaryNav');
  const toggle = document.getElementById('navToggle');
  if (!nav || !toggle) return;

  const updateLayout = () => {
    if (window.innerWidth >= 768) {
      nav.classList.remove('hidden');
      toggle.setAttribute('aria-expanded', 'true');
    } else {
      const hidden = nav.classList.contains('hidden');
      toggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    }
  };

  toggle.addEventListener('click', () => {
    const nowHidden = nav.classList.toggle('hidden');
    toggle.setAttribute('aria-expanded', nowHidden ? 'false' : 'true');
  });

  nav.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth < 768) {
        nav.classList.add('hidden');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  });

  window.addEventListener('resize', updateLayout);
  updateLayout();
}

document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('portal-layout');
  const portalSettings = getPortalSettings();
  applyPortalTheme(portalSettings.theme);
  const enhanced = getPortalEnhanced();

  const idMatch = location.pathname.match(/\/portal\/(.+)$/);

  const consumerId = idMatch ? decodeURIComponent(idMatch[1]) : null;
  if(!consumerId){
    const storedId = localStorage.getItem('clientId');
    if(storedId){
      location.replace(`/portal/${encodeURIComponent(storedId)}`);
      return;
    }
  } else {
    try {
      localStorage.setItem('clientId', consumerId);
    } catch {}
  }
  initClientPortalNav();
  applyPortalModules(portalSettings.modules || {});
  loadScores();
  applyNextSteps(enhanced.reminders);
  applyDataRegionBanner(dataRegionVariant);
  bootstrapDataRegionExperiment(consumerId);
  const dash = document.getElementById('navDashboard');
  if (dash) dash.href = location.pathname;

  const bookCallButton = document.getElementById('bookCall');
  const htmlRoot = document.documentElement;

  if (htmlRoot) {
    htmlRoot.setAttribute('lang', 'en');
  }

  if (bookCallButton) {
    bookCallButton.addEventListener('click', () => {
      recordDataRegionConversion(consumerId, 'book_call');
      openBookingModal();
    });
  }

  var signOutBtn = document.getElementById('portalSignOut');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', function () {
      ['token','auth','clientId','teamMembers','companyInfo','cta_variant','creditScore','negativeItems','creditSnapshot','itemsInDispute','disputeTimeline','mailedLetters','educationItems','deletions','portal_user'].forEach(function(k){ localStorage.removeItem(k); });
      location.href = '/login.html';
    });
  }

  // ---------- Booking Modal ----------
  (function initBookingModal() {
    const modal = document.getElementById('bookingModal');
    if (!modal) return;

    const step1 = document.getElementById('bookingStep1');
    const step2 = document.getElementById('bookingStep2');
    const step3 = document.getElementById('bookingStep3');
    const calDays = document.getElementById('calDays');
    const calMonth = document.getElementById('calMonth');
    const slotsWrapper = document.getElementById('timeSlotsWrapper');
    const slotsContainer = document.getElementById('bookingSlots');
    const noSlotsMsg = document.getElementById('noSlotsMsg');
    const slotsLoading = document.getElementById('slotsLoading');
    const selectedDateLabel = document.getElementById('selectedDateLabel');

    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();
    let selectedDate = null;
    let selectedTime = null;
    let availabilityCache = null;

    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    function showStep(n) {
      [step1, step2, step3].forEach((s, i) => {
        if (s) s.classList.toggle('hidden', i !== n);
      });
    }

    function formatTime12(t) {
      const [h, m] = t.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return h12 + ':' + String(m).padStart(2, '0') + ' ' + ampm;
    }

    function formatDateNice(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      return DAYS_SHORT[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    }

    function padDate(y, m, d) {
      return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }

    async function loadAvailability() {
      if (availabilityCache) return availabilityCache;
      try {
        const r = await fetch('/api/booking/availability');
        const data = await r.json();
        if (data.ok) availabilityCache = data.availability;
        return availabilityCache || {};
      } catch { return {}; }
    }

    function renderCalendar() {
      calMonth.textContent = MONTHS[currentMonth] + ' ' + currentYear;
      calDays.innerHTML = '';

      const firstDay = new Date(currentYear, currentMonth, 1).getDay();
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      const today = new Date();
      const todayStr = padDate(today.getFullYear(), today.getMonth(), today.getDate());

      for (let i = 0; i < firstDay; i++) {
        const el = document.createElement('div');
        el.className = 'cal-day cal-day-empty';
        calDays.appendChild(el);
      }

      loadAvailability().then(avail => {
        const slots = avail.slots || {};
        for (let d = 1; d <= daysInMonth; d++) {
          const el = document.createElement('button');
          el.type = 'button';
          const dateStr = padDate(currentYear, currentMonth, d);
          const dayDate = new Date(currentYear, currentMonth, d);
          const dow = dayDate.getDay();
          const dayAvail = slots[dow] || [];

          el.className = 'cal-day';
          el.textContent = d;

          if (dateStr < todayStr) {
            el.classList.add('cal-day-disabled');
          } else if (!dayAvail.length) {
            el.classList.add('cal-day-no-slots');
          } else {
            el.addEventListener('click', () => selectDate(dateStr, el));
          }

          if (dateStr === todayStr) el.classList.add('cal-day-today');
          if (dateStr === selectedDate) el.classList.add('cal-day-selected');

          calDays.appendChild(el);
        }
      });
    }

    async function selectDate(dateStr, el) {
      selectedDate = dateStr;
      selectedTime = null;
      calDays.querySelectorAll('.cal-day').forEach(d => d.classList.remove('cal-day-selected'));
      if (el) el.classList.add('cal-day-selected');

      selectedDateLabel.textContent = formatDateNice(dateStr);
      slotsWrapper.classList.remove('hidden');
      slotsContainer.innerHTML = '';
      noSlotsMsg.classList.add('hidden');
      slotsLoading.classList.remove('hidden');

      try {
        const r = await fetch('/api/booking/slots?date=' + dateStr);
        const data = await r.json();
        slotsLoading.classList.add('hidden');

        if (!data.ok || !data.slots.length) {
          noSlotsMsg.classList.remove('hidden');
          return;
        }

        data.slots.forEach(time => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'time-slot-btn';
          btn.textContent = formatTime12(time);
          btn.addEventListener('click', () => {
            selectedTime = time;
            slotsContainer.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            setTimeout(() => goToStep2(), 300);
          });
          slotsContainer.appendChild(btn);
        });
      } catch {
        slotsLoading.classList.add('hidden');
        noSlotsMsg.classList.remove('hidden');
      }
    }

    function goToStep2() {
      const summaryLine = document.getElementById('bookingSummaryLine');
      if (summaryLine) {
        summaryLine.textContent = formatDateNice(selectedDate) + ' at ' + formatTime12(selectedTime);
      }
      showStep(1);
    }

    document.getElementById('calPrev')?.addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) { currentMonth = 11; currentYear--; }
      renderCalendar();
    });

    document.getElementById('calNext')?.addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      renderCalendar();
    });

    document.getElementById('bookingBack')?.addEventListener('click', () => showStep(0));

    document.getElementById('bookingConfirm')?.addEventListener('click', async () => {
      const nameVal = document.getElementById('bookingName')?.value?.trim();
      const emailVal = document.getElementById('bookingEmail')?.value?.trim();
      const phoneVal = document.getElementById('bookingPhone')?.value?.trim();
      const notesVal = document.getElementById('bookingNotes')?.value?.trim();
      const errEl = document.getElementById('bookingError');

      if (!nameVal) {
        if (errEl) { errEl.textContent = 'Please enter your name.'; errEl.classList.remove('hidden'); }
        return;
      }
      if (errEl) errEl.classList.add('hidden');

      const confirmBtn = document.getElementById('bookingConfirm');
      if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Booking...'; }

      try {
        const r = await fetch('/api/booking/book', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: selectedDate,
            time: selectedTime,
            name: nameVal,
            email: emailVal,
            phone: phoneVal,
            consumerId: consumerId || '',
            notes: notesVal,
          })
        });
        const data = await r.json();
        if (data.ok) {
          const confirmText = document.getElementById('bookingConfirmText');
          if (confirmText) {
            confirmText.textContent = 'Your call is booked for ' + formatDateNice(selectedDate) + ' at ' + formatTime12(selectedTime) + '. We look forward to speaking with you!';
          }
          showStep(2);
        } else {
          if (errEl) { errEl.textContent = data.error || 'Booking failed. Please try again.'; errEl.classList.remove('hidden'); }
        }
      } catch {
        if (errEl) { errEl.textContent = 'Something went wrong. Please try again.'; errEl.classList.remove('hidden'); }
      } finally {
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Booking'; }
      }
    });

    [document.getElementById('closeBooking'), document.getElementById('closeBooking2'), document.getElementById('bookingDone')].forEach(btn => {
      btn?.addEventListener('click', closeBookingModal);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target === modal.firstElementChild) closeBookingModal();
    });

    function closeBookingModal() {
      modal.classList.add('hidden');
      showStep(0);
      selectedDate = null;
      selectedTime = null;
      slotsWrapper.classList.add('hidden');
      ['bookingName','bookingEmail','bookingPhone'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.value = ''; el.readOnly = false; el.classList.remove('booking-autofilled'); }
      });
      document.getElementById('bookingNotes').value = '';
      document.getElementById('bookingError')?.classList.add('hidden');
    }

    function autofillBookingFields() {
      var c = (window.__PORTAL_BOOTSTRAP__ || {}).consumer;
      if (!c) return;
      var nameEl = document.getElementById('bookingName');
      var emailEl = document.getElementById('bookingEmail');
      var phoneEl = document.getElementById('bookingPhone');
      var notesEl = document.getElementById('bookingNotes');
      var fullName = [c.firstName, c.lastName].filter(Boolean).join(' ');
      function fillField(el, val) {
        if (!el || !val) return;
        el.value = val;
        el.readOnly = true;
        el.classList.add('booking-autofilled');
      }
      fillField(nameEl, fullName);
      fillField(emailEl, c.email);
      fillField(phoneEl, c.phone);
      if (notesEl) notesEl.focus();
    }

    window.openBookingModal = function() {
      currentMonth = new Date().getMonth();
      currentYear = new Date().getFullYear();
      availabilityCache = null;
      modal.classList.remove('hidden');
      showStep(0);
      renderCalendar();
      autofillBookingFields();
    };
  })();

  const mascotEl = document.getElementById('mascot');
  if (mascotEl && window.lottie && !mascotEl.dataset.customLogo) {
    lottie.loadAnimation({
      container: mascotEl,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: 'https://assets2.lottiefiles.com/packages/lf20_tusxd6ku.json'
    });
  }

  document.querySelectorAll('button, .btn').forEach(btn=>{
    btn.addEventListener('click',e=>{
      const circle=document.createElement('span');
      circle.className='ripple';
      const rect=btn.getBoundingClientRect();
      const size=Math.max(rect.width,rect.height);
      circle.style.width=circle.style.height=size+'px';
      circle.style.left=e.clientX-rect.left-size/2+'px';
      circle.style.top=e.clientY-rect.top-size/2+'px';
      btn.appendChild(circle);
      setTimeout(()=>circle.remove(),700);
    });
  });

  const company = JSON.parse(localStorage.getItem('companyInfo') || '{}');
  if (company.name) {
    const cn = document.getElementById('companyName');
    if (cn) cn.textContent = company.name;
  }

  renderTeamList();

  const stepEl = document.getElementById('currentStep');
  if (consumerId && stepEl) {
    const fetchStep = () => {
      fetch(`/api/consumers/${consumerId}/tracker`)
        .then(r => r.json())
        .then(({ steps = [], completed = {} }) => {
          if (!Array.isArray(steps) || !steps.length) {
            stepEl.textContent = 'No steps assigned yet.';
            renderPortalJourney([], {});
            return;
          }
          const idx = steps.findIndex(s => !completed[s]);
          if (idx === -1) {
            stepEl.textContent = `Completed • ${steps.length} step${steps.length === 1 ? '' : 's'}`;
          } else {
            stepEl.textContent = `Step ${idx + 1} of ${steps.length}: ${steps[idx]}`;
          }
          renderPortalJourney(steps, completed);
        })
        .catch(() => { stepEl.textContent = 'Unknown'; });
    };
    fetchStep();
    setInterval(fetchStep, 30000);
  }

  function renderPortalJourney(steps, completed) {
    var stepsEl = document.getElementById('portalJourneySteps');
    var barEl = document.getElementById('portalJourneyBar');
    var progEl = document.getElementById('portalJourneyProgress');
    var cardEl = document.getElementById('portalJourneyCard');
    if (!stepsEl) return;
    if (!steps.length) {
      if (cardEl) cardEl.style.display = 'none';
      return;
    }
    if (cardEl) cardEl.style.display = '';
    var doneCount = 0;
    steps.forEach(function(s) { if (completed[s]) doneCount++; });
    var pct = Math.round((doneCount / steps.length) * 100);
    if (progEl) progEl.textContent = doneCount + ' of ' + steps.length + ' completed';
    if (barEl) {
      var fill = barEl.querySelector('.tracker-progress-fill');
      if (fill) fill.style.width = pct + '%';
    }
    stepsEl.innerHTML = '';
    var foundCurrent = false;
    var checkSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
    steps.forEach(function(step, i) {
      var isDone = !!completed[step];
      var isCur = !isDone && !foundCurrent;
      if (isCur) foundCurrent = true;
      var cls = 'tracker-step' + (isDone ? ' completed' : '') + (isCur ? ' current' : '');
      var html =
        '<div class="' + cls + '">' +
          '<div class="tracker-step-rail">' +
            '<div class="tracker-step-circle">' + (isDone ? checkSvg : (i + 1)) + '</div>' +
            '<div class="tracker-step-line"></div>' +
          '</div>' +
          '<div class="tracker-step-content">' +
            '<span class="tracker-step-name">' + step.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</span>' +
          '</div>' +
        '</div>';
      stepsEl.insertAdjacentHTML('beforeend', html);
    });
  }

  const feedEl = document.getElementById('newsFeed');
  if (feedEl) {
    fetch('/api/news')
      .then(r => r.json())
      .then(data => {
        const items = data.items || [];
        if (!items.length) {
          feedEl.textContent = 'No news available.';
          return;
        }
        feedEl.innerHTML = items.slice(0,5).map(item => `
          <div class="news-item"><a href="${esc(item.link)}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-1">${esc(item.title)}<span class="wiggle-arrow">↗</span></a></div>
        `).join('');
      })
      .catch(err => {
        console.error('Failed to load news feed', err);
        feedEl.textContent = 'Failed to load news.';
      });
  }

  window.addEventListener('storage', e => {
    if (e.key === 'creditScore') {
      if (e.newValue) {
        const parsed = safeParseScore(e.newValue);
        if (parsed) {
          if (!window.__PORTAL_BOOTSTRAP__) window.__PORTAL_BOOTSTRAP__ = {};
          window.__PORTAL_BOOTSTRAP__.creditScore = parsed;
        }
      }
      loadScores();
    }
    if (e.key === 'teamMembers') renderTeamList();
  });
  const _setItem = localStorage.setItem;
  localStorage.setItem = function(key, value) {
    _setItem.apply(this, arguments);
    if (key === 'creditScore') {
      const parsed = safeParseScore(value);
      if (parsed) {
        if (!window.__PORTAL_BOOTSTRAP__) window.__PORTAL_BOOTSTRAP__ = {};
        window.__PORTAL_BOOTSTRAP__.creditScore = parsed;
      }
      loadScores();
    }
    if (key === 'teamMembers') renderTeamList();
  };

  const escape = window.escapeHtml || esc;

  const items = JSON.parse(localStorage.getItem('itemsInDispute') || localStorage.getItem('disputeTimeline') || '[]');
  const itemsEl = document.getElementById('itemsInDispute');
  let negativeItems = [];
  try {
    if (Array.isArray(window.__NEGATIVE_ITEMS__)) {
      negativeItems = window.__NEGATIVE_ITEMS__;
    } else {
      negativeItems = JSON.parse(localStorage.getItem('negativeItems') || '[]');
    }
  } catch {
    negativeItems = [];
  }
  const disputeList = items.length ? items : negativeItems.map(item => ({
    account: item?.creditor || 'Negative Item',
    stage: `${(item?.violations || []).length} issue${(item?.violations || []).length === 1 ? '' : 's'} • S${item?.severity || 0}`,
  }));
  if (itemsEl) {
    if (!disputeList.length) {
      const empty = document.getElementById('itemsInDisputeEmpty');
      if (empty && window.lottie) {
        lottie.loadAnimation({
          container: empty,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: 'https://assets2.lottiefiles.com/packages/lf20_fyye8suv.json'
        });
      }
    } else {
      const tt = document.getElementById('itemsInDisputeText');
      if (tt) tt.remove();
      const te = document.getElementById('itemsInDisputeEmpty');
      if (te) te.remove();
      itemsEl.innerHTML = disputeList.map(t => `<div class="timeline-item"><span class="font-medium">${escape(t.account)}</span> - ${escape(t.stage)}</div>`).join('');
    }
  }

  const summaryEl = document.getElementById('itemsSummary');
  if(summaryEl){
    const perRound = 10;
    const sourceLength = disputeList.length;
    if(sourceLength){
      const rounds = Math.ceil(sourceLength / perRound);
      summaryEl.textContent = `${sourceLength} item${sourceLength === 1 ? '' : 's'} across ${rounds} round${rounds===1?'':'s'} (${perRound} per round)`;
    } else {
      summaryEl.textContent = 'No items in dispute.';
    }
  }

  const snapEl = document.getElementById('reportSnapshot');
  if (snapEl) {
    let snap = {};
    try {
      if (window.__PORTAL_BOOTSTRAP__?.snapshot) {
        snap = window.__PORTAL_BOOTSTRAP__.snapshot;
      } else {
        snap = JSON.parse(localStorage.getItem('creditSnapshot') || '{}');
      }
    } catch { snap = {}; }
    const summary = Array.isArray(snap.summary) ? snap.summary : [];
    const totalIssues = Number.isFinite(snap.totalIssues) ? snap.totalIssues : 0;
    if(summary.length){
      const total = totalIssues || summary.reduce((sum, item) => sum + (item.issues || 0), 0);
      const headline = `<div class="text-xs muted">Tracking ${total} issue${total === 1 ? '' : 's'}</div>`;
      const list = summary.map(item => {
        const bureauText = (item.bureaus || []).length ? item.bureaus.join(', ') : 'Bureaus pending';
        const issues = item.issues || 0;
        return `<div class="news-item"><div class="font-medium">${escape(item.creditor)}</div><div class="text-xs muted">S${item.severity || 0} • ${issues} issue${issues === 1 ? '' : 's'} • ${escape(bureauText)}</div></div>`;
      }).join('');
      snapEl.innerHTML = headline + list;
    } else {
      snapEl.innerHTML = 'No negative items detected.';
    }
  }

  const eduEl = document.getElementById('education');
  if (eduEl) {
    const edu = JSON.parse(localStorage.getItem('educationItems') || '[]');
    if (!edu.length) eduEl.textContent = 'No educational items.';
    else eduEl.innerHTML = edu.map(e => `<div class="news-item"><div class="font-medium">${esc(e.account)}</div><div>${esc(e.text)}</div></div>`).join('');
  }

  const docEl = document.getElementById('docList');
  const docPreviewEl = document.getElementById('docListPreview');
  const messageBanner = document.getElementById('messageBanner');
  const messageSection = document.getElementById('messageSection');
  const messageList = document.getElementById('messageList');
  const messageForm = document.getElementById('messageForm');
  const mailSection = document.getElementById('mailSection');
  const mailWaiting = document.getElementById('mailWaiting');
  const mailMailed = document.getElementById('mailMailed');
  const mailTabWaiting = document.getElementById('mailTabWaiting');
  const mailTabMailed = document.getElementById('mailTabMailed');
  const negativeItemsSection = document.getElementById('negativeItemsSection');
  const negativeItemList = document.getElementById('negativeItemList');
  const negativeItemSearch = document.getElementById('negativeItemSearch');
  const negativeItemSort = document.getElementById('negativeItemSort');
  const NEGATIVE_BUREAU_LABELS = {
    account_number: 'Account #',
    payment_status: 'Payment status',
    account_status: 'Account status',
    past_due: 'Past due',
    balance: 'Balance',
    credit_limit: 'Credit limit',
    high_credit: 'High credit',
    date_opened: 'Opened',
    last_reported: 'Last reported',
    date_last_payment: 'Date of Last Payment',
    date_of_last_payment: 'Date of Last Payment',
  };

  function maskAccountDisplay(value){
    if(value === undefined || value === null) return '';
    const str = String(value).trim();
    if(!str) return '';
    const redactedMatch = str.match(/REDACTED[_\s-]*SSN/i);
    if(redactedMatch){
      const suffixMatch = str.match(/(\*{4,}|•{4,}|\d{4})\s*$/);
      const suffix = suffixMatch ? suffixMatch[1].replace(/\*/g, '•') : '••••';
      return `REDACTED SSN ${suffix}`;
    }
    if(str.startsWith('••••')) return str;
    if(/\*{4,}/.test(str)) return str.replace(/\*/g, '•');
    const clean = str.replace(/[^0-9a-z]/gi, '');
    if(clean.length <= 4) return clean;
    return `•••• ${clean.slice(-4)}`;
  }

  const paymentSection = document.getElementById('paymentSection');
  const paymentList = document.getElementById('paymentList');
  const paymentEmpty = document.getElementById('paymentEmpty');
  const paymentTotal = document.getElementById('paymentTotal');
  const paymentError = document.getElementById('paymentError');
  const tradelineSection = document.getElementById('tradelinesSection');
  const tradelineRangeSelect = document.getElementById('tradelineRange');
  const tradelineBankSelect = document.getElementById('tradelineBank');
  const tradelineSearchInput = document.getElementById('tradelineSearch');
  const tradelineList = document.getElementById('tradelineList');
  const tradelineMeta = document.getElementById('tradelineMeta');
  const tradelineEmpty = document.getElementById('tradelineEmpty');
  const tradelineCartList = document.getElementById('tradelineCartList');
  const tradelineCartEmpty = document.getElementById('tradelineCartEmpty');
  const tradelineCartTotal = document.getElementById('tradelineCartTotal');
  const tradelineCartCount = document.getElementById('tradelineCartCount');
  const tradelineCartClear = document.getElementById('tradelineCartClear');
  const portalMain = document.getElementById('portalMain');
  const uploadSection = document.getElementById('uploadSection');
  const educationSection = document.getElementById('educationSection');
  const documentSection = document.getElementById('documentSection');
  const disputeSection = document.getElementById('disputeSection');

  if (isPortalModuleEnabled(portalSettings.modules, 'tradelines')) {
    initTradelineStorefront(consumerId);
  }

  function formatCurrency(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return '$0.00';
    return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function getPriceValue(val) {
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  }
  function formatTradelineMeta(item) {
    const parts = [];
    parts.push('Limit: ' + (item.limit ? formatCurrency(item.limit) : 'N/A'));
    parts.push('Age: ' + (item.age || 'N/A'));
    if (item.statement_date) parts.push('Statement: ' + item.statement_date);
    if (item.reporting) parts.push(item.reporting);
    return parts.join(' · ');
  }
  function buildTradelineId(item) {
    return (item.id || [item.bank, item.limit, item.age, item.price].filter(Boolean).join('-'));
  }
  function formatDue(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return String(d); }
  }
  function loadCart(cid) {
    try { return JSON.parse(localStorage.getItem('tl_cart_' + cid) || '[]'); } catch { return []; }
  }
  function saveCart(cid, items) {
    try { localStorage.setItem('tl_cart_' + cid, JSON.stringify(items)); } catch {}
  }

  function initTradelineStorefront(id){
    if (!tradelineSection) return;
    const cartState = { items: loadCart(id) };
    const tradelineState = {
      ranges: [],
      banks: [],
      selectedRange: '',
      selectedBank: '',
      items: [],
      filtered: [],
      loading: false,
    };

    const updateCartSummary = () => {
      if (tradelineCartCount) {
        const count = cartState.items.reduce((sum, item) => sum + (item.qty || 0), 0);
        tradelineCartCount.textContent = String(count);
      }
    };

    const renderCart = () => {
      if (!tradelineCartList || !tradelineCartEmpty || !tradelineCartTotal) return;
      tradelineCartList.innerHTML = '';
      if (!cartState.items.length) {
        tradelineCartEmpty.textContent = 'Cart is empty. Add tradelines to reserve seats.';
        tradelineCartTotal.textContent = formatCurrency(0);
        updateCartSummary();
        return;
      }
      tradelineCartEmpty.textContent = '';
      let total = 0;
      cartState.items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'flex flex-col gap-1 rounded border border-slate-200 bg-white/80 p-2 text-xs';

        const header = document.createElement('div');
        header.className = 'flex items-center justify-between gap-2';
        const name = document.createElement('div');
        name.className = 'font-medium';
        name.textContent = item.bank || 'Tradeline';
        const price = document.createElement('div');
        price.className = 'text-slate-600';
        price.textContent = formatCurrency(item.price);
        header.appendChild(name);
        header.appendChild(price);

        const meta = document.createElement('div');
        meta.className = 'text-slate-500';
        meta.textContent = formatTradelineMeta(item);

        const actions = document.createElement('div');
        actions.className = 'flex items-center justify-between gap-2';
        const qtyWrap = document.createElement('div');
        qtyWrap.className = 'flex items-center gap-1';
        const decBtn = document.createElement('button');
        decBtn.type = 'button';
        decBtn.className = 'btn text-[10px] px-2 py-1';
        decBtn.textContent = '−';
        const qtyText = document.createElement('span');
        qtyText.className = 'text-xs';
        qtyText.textContent = `Qty ${item.qty}`;
        const incBtn = document.createElement('button');
        incBtn.type = 'button';
        incBtn.className = 'btn text-[10px] px-2 py-1';
        incBtn.textContent = '+';
        qtyWrap.appendChild(decBtn);
        qtyWrap.appendChild(qtyText);
        qtyWrap.appendChild(incBtn);

        const checkout = document.createElement('a');
        checkout.className = 'btn text-[10px] px-2 py-1';
        checkout.textContent = 'Checkout';
        checkout.target = '_blank';
        checkout.rel = 'noreferrer';
        checkout.href = item.buy_link || '#';
        if (!item.buy_link) checkout.classList.add('opacity-50', 'pointer-events-none');

        actions.appendChild(qtyWrap);
        actions.appendChild(checkout);

        decBtn.addEventListener('click', () => {
          updateCartQty(item.id, (item.qty || 0) - 1);
        });
        incBtn.addEventListener('click', () => {
          updateCartQty(item.id, (item.qty || 0) + 1);
        });

        row.appendChild(header);
        row.appendChild(meta);
        row.appendChild(actions);
        tradelineCartList.appendChild(row);
        total += getPriceValue(item.price) * (item.qty || 0);
      });
      tradelineCartTotal.textContent = formatCurrency(total);
      updateCartSummary();
    };

    const updateCartQty = (itemId, qty) => {
      const nextQty = Math.max(0, qty);
      const idx = cartState.items.findIndex(item => item.id === itemId);
      if (idx === -1) return;
      if (nextQty === 0) {
        cartState.items.splice(idx, 1);
      } else {
        cartState.items[idx].qty = nextQty;
      }
      saveCart(id, cartState.items);
      renderCart();
    };

    const addToCart = (item) => {
      const idValue = buildTradelineId(item);
      const existing = cartState.items.find(entry => entry.id === idValue);
      if (existing) {
        existing.qty += 1;
      } else {
        cartState.items.push({
          id: idValue,
          bank: item.bank || '',
          price: item.price,
          limit: item.limit,
          age: item.age,
          statement_date: item.statement_date,
          reporting: item.reporting,
          buy_link: item.buy_link,
          qty: 1,
        });
      }
      saveCart(id, cartState.items);
      renderCart();
    };

    const filterTradelines = () => {
      const term = (tradelineSearchInput?.value || '').toLowerCase().trim();
      if (!term) {
        tradelineState.filtered = [...tradelineState.items];
        return;
      }
      tradelineState.filtered = tradelineState.items.filter(item => {
        const haystack = [
          item.bank,
          item.reporting,
          item.statement_date,
          item.age,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(term);
      });
    };

    const renderTradelines = () => {
      if (!tradelineList || !tradelineMeta || !tradelineEmpty) return;
      tradelineList.innerHTML = '';
      tradelineEmpty.textContent = '';
      if (tradelineState.loading) {
        tradelineMeta.textContent = 'Loading tradelines...';
        return;
      }
      filterTradelines();
      const items = tradelineState.filtered;
      tradelineMeta.textContent = tradelineState.selectedRange
        ? `${items.length} tradeline${items.length === 1 ? '' : 's'} available.`
        : 'Select a price range to load inventory.';

      if (!tradelineState.selectedRange) {
        tradelineEmpty.textContent = 'Pick a price range to see availability.';
        return;
      }
      if (!items.length) {
        tradelineEmpty.textContent = 'No tradelines found. Try another range or bank.';
        return;
      }
      items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm';
        const title = document.createElement('div');
        title.className = 'text-sm font-semibold';
        title.textContent = item.bank || 'Tradeline';
        const meta = document.createElement('div');
        meta.className = 'text-xs text-slate-500';
        meta.textContent = formatTradelineMeta(item);
        const price = document.createElement('div');
        price.className = 'text-sm font-semibold text-emerald-600';
        price.textContent = formatCurrency(item.price);

        const actions = document.createElement('div');
        actions.className = 'mt-2 flex flex-wrap gap-2';
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn text-xs';
        addBtn.textContent = 'Add to cart';
        addBtn.addEventListener('click', () => addToCart(item));

        const checkout = document.createElement('a');
        checkout.className = 'btn text-xs';
        checkout.textContent = 'View checkout';
        checkout.target = '_blank';
        checkout.rel = 'noreferrer';
        checkout.href = item.buy_link || '#';
        if (!item.buy_link) checkout.classList.add('opacity-50', 'pointer-events-none');

        actions.appendChild(addBtn);
        actions.appendChild(checkout);

        card.appendChild(title);
        card.appendChild(meta);
        card.appendChild(price);
        card.appendChild(actions);
        tradelineList.appendChild(card);
      });
    };

    const renderRangeOptions = () => {
      if (!tradelineRangeSelect) return;
      tradelineRangeSelect.innerHTML = '<option value="">Select price range</option>';
      tradelineState.ranges.forEach(range => {
        const option = document.createElement('option');
        option.value = range.id;
        option.textContent = `${range.label} (${range.count})`;
        tradelineRangeSelect.appendChild(option);
      });
    };

    const renderBankOptions = () => {
      if (!tradelineBankSelect) return;
      tradelineBankSelect.innerHTML = '<option value="">All banks</option>';
      tradelineState.banks.forEach(bank => {
        const option = document.createElement('option');
        option.value = bank.bank;
        option.textContent = `${bank.bank} (${bank.count})`;
        tradelineBankSelect.appendChild(option);
      });
    };

    const fetchJson = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Request failed');
      return data;
    };

    const loadRanges = async () => {
      if (!tradelineRangeSelect) return;
      tradelineState.loading = true;
      renderTradelines();
      try {
        const data = await fetchJson('/api/tradelines');
        tradelineState.ranges = data.ranges || [];
        renderRangeOptions();
        const firstRange = tradelineState.ranges.find(range => range.count > 0) || tradelineState.ranges[0];
        if (firstRange && !tradelineState.selectedRange) {
          tradelineState.selectedRange = firstRange.id;
          tradelineRangeSelect.value = firstRange.id;
          await loadTradelines();
        } else {
          tradelineState.loading = false;
          renderTradelines();
        }
      } catch (err) {
        console.error('Failed to load tradeline ranges', err);
        tradelineState.loading = false;
        if (tradelineMeta) tradelineMeta.textContent = 'Unable to load tradelines.';
      }
    };

    const loadTradelines = async () => {
      if (!tradelineState.selectedRange) {
        tradelineState.items = [];
        tradelineState.filtered = [];
        tradelineState.banks = [];
        renderBankOptions();
        renderTradelines();
        return;
      }
      tradelineState.loading = true;
      renderTradelines();
      try {
        const params = new URLSearchParams({
          range: tradelineState.selectedRange,
          perPage: '200',
        });
        if (tradelineState.selectedBank) {
          params.set('bank', tradelineState.selectedBank);
        }
        const data = await fetchJson(`/api/tradelines?${params.toString()}`);
        tradelineState.items = Array.isArray(data.tradelines) ? data.tradelines : [];
        tradelineState.banks = data.banks || [];
        tradelineState.loading = false;
        renderBankOptions();
        renderTradelines();
      } catch (err) {
        console.error('Failed to load tradelines', err);
        tradelineState.items = [];
        tradelineState.banks = [];
        tradelineState.loading = false;
        renderBankOptions();
        renderTradelines();
      }
    };

    if (tradelineRangeSelect) {
      tradelineRangeSelect.addEventListener('change', async (event) => {
        tradelineState.selectedRange = event.target.value;
        tradelineState.selectedBank = '';
        if (tradelineBankSelect) tradelineBankSelect.value = '';
        await loadTradelines();
      });
    }

    if (tradelineBankSelect) {
      tradelineBankSelect.addEventListener('change', async (event) => {
        tradelineState.selectedBank = event.target.value;
        await loadTradelines();
      });
    }

    if (tradelineSearchInput) {
      tradelineSearchInput.addEventListener('input', () => renderTradelines());
    }

    if (tradelineCartClear) {
      tradelineCartClear.addEventListener('click', () => {
        cartState.items = [];
        saveCart(id, cartState.items);
        renderCart();
      });
    }

    renderCart();
    loadRanges();
  }
  let invoiceCache = [];
  let invoicesLoaded = false;
  let invoiceLoading = false;
  let invoiceRefreshTimer = null;

  function isDueSoon(inv){
    if(inv.paid || !inv?.due) return false;
    const date = new Date(inv.due);
    if(Number.isNaN(date.getTime())) return false;
    const diff = date.getTime() - Date.now();
    return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
  }
  function isOverdue(inv){
    if(inv.paid || !inv?.due) return false;
    const date = new Date(inv.due);
    if(Number.isNaN(date.getTime())) return false;
    return date.getTime() < Date.now();
  }
  function isStripeCheckoutLink(link){
    if(!link) return false;
    try {
      const url = new URL(link, window.location.origin);
      const hostname = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();
      const isStripeDomain = hostname === 'checkout.stripe.com' || hostname.endsWith('.stripe.com');
      if(!isStripeDomain) return false;
      return path.includes('/checkout') || path.includes('/pay/');
    } catch {
      return false;
    }
  }

  function navigateTo(link){
    if(!link) return;
    try {
      window.location.assign(link);
    } catch {
      window.location.href = link;
    }
  }

  function attachPayHandlers(){
    if(!paymentList) return;
    paymentList.querySelectorAll('.pay-invoice').forEach(btn => {
      btn.addEventListener('click', async () => {
        const link = btn.getAttribute('data-pay-link');
        const provider = (btn.getAttribute('data-provider') || '').toLowerCase();
        const invoiceId = btn.getAttribute('data-id');
        const originalText = btn.dataset.label || btn.textContent;
        const shouldTryStripe = provider === 'stripe' || (typeof link === 'string' && link.includes('/pay/'));

        if(shouldTryStripe){
          btn.disabled = true;
          btn.textContent = 'Redirecting…';
          let stripeOk = false;
          try {
            const resp = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/checkout`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ consumerId }),
            });
            const data = await resp.json().catch(() => ({}));
            if(resp.ok && data?.url){
              stripeOk = true;
              window.location.href = data.url;
              return;
            }
            if(!link){
              alert(data?.error || 'Unable to start Stripe checkout. Please contact support.');
            } else {
              console.warn('Stripe checkout fallback triggered', data?.error || resp.statusText);
            }
          } catch (err) {
            console.error('Stripe checkout failed', err);
            if(!link){
              alert('Unable to start Stripe checkout. Please contact support.');
            }
          } finally {
            if(!stripeOk){
              btn.disabled = false;
              btn.textContent = originalText;
            }
          }
          if(stripeOk){
            return;
          }
        }

        if(link){
          navigateTo(link);
          return;
        }
        alert('Payment link unavailable. Please contact support.');
      });
    });
  }
  function renderInvoices(invoices = []){
    invoiceCache = Array.isArray(invoices) ? invoices : [];
    invoicesLoaded = true;
    if(paymentTotal){
      const total = invoiceCache.filter(inv => !inv.paid).reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);
      paymentTotal.textContent = formatCurrency(total);
    }
    if(!paymentList) return;
    if(!invoiceCache.length){
      paymentList.innerHTML = '';
      if(paymentEmpty) paymentEmpty.classList.remove('hidden');
      if(paymentError) paymentError.classList.add('hidden');
      return;
    }
    if(paymentEmpty) paymentEmpty.classList.add('hidden');
    const cards = invoiceCache.map(inv => {
      const amountText = formatCurrency(inv.amount);
      const dueText = formatDue(inv.due);
      const overdue = isOverdue(inv);
      const dueSoon = isDueSoon(inv);
      const statusIcon = inv.paid
        ? '<div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#34d399,#10b981)"><svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>'
        : overdue
        ? '<div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#f87171,#ef4444)"><svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>'
        : '<div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#818cf8,#6366f1)"><svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>';
      const badges = [
        inv.paid ? '<span class="badge badge-paid">Paid</span>' : '<span class="badge badge-unpaid">Open</span>',
        overdue ? '<span class="badge badge-unpaid">Overdue</span>' : (dueSoon ? '<span class="badge badge-unpaid">Due soon</span>' : '')
      ].filter(Boolean).join(' ');
      const canCheckout = !inv.paid && (inv.payLink || (inv.paymentProvider || '').toLowerCase() === 'stripe');
      const providerAttr = inv.paymentProvider ? ` data-provider="${esc(inv.paymentProvider)}"` : '';
      const linkAttr = inv.payLink ? ` data-pay-link="${esc(inv.payLink)}"` : '';
      const buttonLabel = 'Pay now';
      const payButton = inv.paid ? '' : (canCheckout
        ? `<button type="button" class="btn text-sm pay-invoice" data-id="${esc(inv.id)}" data-label="${esc(buttonLabel)}"${linkAttr}${providerAttr}>${buttonLabel}</button>`
        : '<span class="text-xs muted">Contact support to add a payment link.</span>');
      const pdfUrl = inv.pdf ? `/api/consumers/${encodeURIComponent(consumerId)}/state/files/${encodeURIComponent(inv.pdf)}` : '';
      const pdfButton = inv.pdf ? `<a class="btn text-xs" target="_blank" rel="noopener" href="${pdfUrl}">Invoice PDF</a>` : '';
      return `
        <div class="invoice-card flex flex-col gap-3">
          <div class="flex items-center gap-3">
            ${statusIcon}
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-sm text-slate-800">${esc(inv.desc || 'Invoice')}</div>
              <div class="text-xs text-slate-400">${esc(dueText)}</div>
            </div>
            <div class="text-right">
              <div class="text-lg font-bold text-slate-800">${amountText}</div>
              <div class="flex flex-wrap gap-1 justify-end mt-1">${badges}</div>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            ${payButton}
            ${pdfButton}
          </div>
        </div>
      `;
    }).join('');
    paymentList.innerHTML = cards;
    if(paymentError) paymentError.classList.add('hidden');
    attachPayHandlers();
  }
  function showInvoiceError(message){
    if(paymentList) paymentList.innerHTML = '';
    if(paymentEmpty) paymentEmpty.classList.add('hidden');
    if(paymentError){
      paymentError.innerHTML = '<strong>Error:</strong> ' + esc(message || 'Failed to load invoices. Please retry.');
      paymentError.classList.remove('hidden');
    }
  }
  function loadInvoices(options = {}){
    if(!(consumerId && paymentSection)) return;
    if(invoicesLoaded && !options.force){
      renderInvoices(invoiceCache);
      return;
    }
    if(invoiceLoading) return;
    invoiceLoading = true;
    fetch(`/api/invoices/${consumerId}`)
      .then(r => r.json())
      .then(data => {
        renderInvoices(Array.isArray(data.invoices) ? data.invoices : []);
      })
      .catch(() => {
        showInvoiceError('Could not load invoices. Refresh or contact support.');
      })
      .finally(() => {
        invoiceLoading = false;
      });
  }
  let allDocs = [];
  function getFileExt(name) {
    const m = (name || '').match(/\.(\w+)$/);
    return m ? m[1].toLowerCase() : '';
  }
  function getDocIconClass(ext) {
    if (ext === 'pdf') return 'doc-icon-pdf';
    if (ext === 'html' || ext === 'htm') return 'doc-icon-html';
    if (ext === 'doc' || ext === 'docx' || ext === 'txt' || ext === 'rtf') return 'doc-icon-doc';
    if (['png','jpg','jpeg','gif','webp','svg','bmp'].includes(ext)) return 'doc-icon-img';
    return 'doc-icon-default';
  }
  function getDocIconLabel(ext) {
    if (ext === 'pdf') return 'PDF';
    if (ext === 'html' || ext === 'htm') return 'HTML';
    if (ext === 'doc' || ext === 'docx') return 'DOC';
    if (ext === 'txt') return 'TXT';
    if (['png','jpg','jpeg','gif','webp','svg','bmp'].includes(ext)) return 'IMG';
    return 'FILE';
  }
  function friendlyFileName(raw) {
    if (!raw) return 'Document';
    var n = raw;
    var dateMatch = n.match(/(\d{4})-(\d{2})-(\d{2})/);
    var dateStr = '';
    if (dateMatch) {
      var d = new Date(dateMatch[1] + '-' + dateMatch[2] + '-' + dateMatch[3] + 'T12:00:00');
      if (!isNaN(d.getTime())) dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    var lower = n.toLowerCase();
    var label = '';
    var category = '';
    if (lower.includes('breach_audit')) {
      label = 'Data Breach Audit Report';
      category = 'Audit';
    } else if (lower.includes('_audit')) {
      label = 'Credit Report Audit';
      category = 'Audit';
    } else if (lower.includes('_letters.zip') || lower.includes('letters_')) {
      label = 'Dispute Letters Package';
      category = 'Letters';
    } else if (lower.includes('_personal_info_dispute_')) {
      var pBureau = extractBureau(n);
      label = pBureau ? pBureau + ' Personal Info Dispute' : 'Personal Info Dispute';
      category = 'Dispute';
    } else if (lower.includes('_inquiry_dispute_')) {
      var iBureau = extractBureau(n);
      label = iBureau ? iBureau + ' Inquiry Dispute' : 'Inquiry Dispute';
      category = 'Dispute';
    } else if (lower.includes('_collector_letter_')) {
      label = 'Debt Collector Letter';
      category = 'Letter';
    } else if (lower.includes('_dispute_') || lower.includes('dispute')) {
      var dBureau = extractBureau(n);
      var creditor = extractCreditor(n);
      if (dBureau && creditor) {
        label = dBureau + ' Dispute – ' + creditor;
      } else if (dBureau) {
        label = dBureau + ' Dispute Letter';
      } else {
        label = 'Dispute Letter';
      }
      category = 'Dispute';
    } else if (/\.(html?)$/i.test(n) && (lower.includes('report') || lower.includes('ldreport') || /^m\d+/i.test(n))) {
      label = 'Credit Report';
      category = 'Report';
    } else {
      label = cleanupFallback(n);
      category = '';
    }
    return { label: label, date: dateStr, category: category, full: label + (dateStr ? ' · ' + dateStr : '') };
  }
  function extractBureau(name) {
    if (/experian/i.test(name)) return 'Experian';
    if (/transunion/i.test(name)) return 'TransUnion';
    if (/equifax/i.test(name)) return 'Equifax';
    return '';
  }
  function extractCreditor(name) {
    var m = name.match(/(?:Experian|TransUnion|Equifax)[_\s]+(.+?)(?:_dispute_|_\d{4})/i);
    if (!m) return '';
    var raw = m[1].replace(/_/g, ' ').trim();
    if (raw.length > 30) raw = raw.substring(0, 27) + '...';
    return raw;
  }
  function cleanupFallback(name) {
    var s = name.replace(/\.\w+$/, '');
    s = s.replace(/^[a-z_]+__\d{4}-\d{2}-\d{2}_?/i, '');
    s = s.replace(/^[a-z_]+__/i, '');
    s = s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.length > 40) s = s.substring(0, 37) + '...';
    return s || 'Document';
  }
  function getDocCategory(name) {
    var info = friendlyFileName(name);
    return info.category || '';
  }
  var docSelectMode = false;
  function renderDocCard(d) {
    const ext = getFileExt(d.originalName);
    const iconClass = getDocIconClass(ext);
    const iconLabel = getDocIconLabel(ext);
    const friendly = friendlyFileName(d.originalName);
    const categoryBadge = friendly.category ? `<span class="doc-card-badge doc-badge-${friendly.category.toLowerCase()}">${friendly.category}</span>` : '';
    const metaParts = [ext.toUpperCase(), friendly.date].filter(Boolean).join(' · ');
    const safeName = esc(d.originalName);
    const fileUrl = `/api/consumers/${encodeURIComponent(consumerId)}/state/files/${encodeURIComponent(d.storedName)}`;
    return `<a class="doc-card" href="${fileUrl}" target="_blank" title="${safeName}" data-file-url="${esc(fileUrl)}">
      <input type="checkbox" class="batch-cb" tabindex="-1">
      <div class="doc-card-icon ${iconClass}">${iconLabel}</div>
      <div class="doc-card-info">
        <div class="doc-card-name">${esc(friendly.label)}</div>
        <div class="doc-card-meta">${categoryBadge}${metaParts}</div>
      </div>
      <div class="doc-card-action"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></div>
    </a>`;
  }
  function renderDocList(docs) {
    const docCountLabel = document.getElementById('docCountLabel');
    const docEmpty = document.getElementById('docEmpty');
    if (docCountLabel) docCountLabel.textContent = docs.length ? `${docs.length} file${docs.length !== 1 ? 's' : ''} in your vault` : 'Your uploaded files';
    if (docEl) {
      if (!docs.length) {
        docEl.innerHTML = '';
        if (docEmpty) docEmpty.classList.remove('hidden');
      } else {
        if (docEmpty) docEmpty.classList.add('hidden');
        const groups = {};
        const groupOrder = [];
        for (const d of docs) {
          const friendly = friendlyFileName(d.originalName);
          const cat = (friendly.category || '').toLowerCase();
          const isReport = cat === 'audit' || cat === 'report';
          const groupKey = isReport ? '__reports__' : (friendly.date || 'Other');
          if (!groups[groupKey]) {
            groups[groupKey] = { label: isReport ? 'Reports & Audits' : friendly.date || 'Other Files', items: [], isReport, dateSort: '' };
            if (!isReport && friendly.date) {
              try {
                const match = (d.originalName || '').match(/(\d{4}-\d{2}-\d{2})/);
                groups[groupKey].dateSort = match ? match[1] : '';
              } catch {}
            }
            groupOrder.push(groupKey);
          }
          groups[groupKey].items.push(d);
        }
        groupOrder.sort((a, b) => {
          if (a === '__reports__') return -1;
          if (b === '__reports__') return 1;
          return (groups[b].dateSort || '').localeCompare(groups[a].dateSort || '');
        });
        if (groupOrder.length <= 1) {
          docEl.innerHTML = `<div class="doc-vault-grid">${docs.map(renderDocCard).join('')}</div>`;
        } else {
          let html = '';
          groupOrder.forEach((key, gi) => {
            const g = groups[key];
            const isFirst = gi === 0;
            const count = g.items.length;
            const chevronSvg = '<svg class="doc-group-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
            html += `<div class="doc-date-group${isFirst ? ' open' : ''}">`;
            html += `<div class="doc-group-header" role="button" tabindex="0">`;
            html += `<div class="doc-group-header-info"><span class="doc-group-label">${esc(g.label)}</span>`;
            html += `<span class="doc-group-count">${count} file${count !== 1 ? 's' : ''}</span>`;
            html += `</div>${chevronSvg}</div>`;
            html += `<div class="doc-group-body"${isFirst ? '' : ' style="display:none"'}>`;
            html += `<div class="doc-vault-grid">${g.items.map(renderDocCard).join('')}</div>`;
            html += `</div></div>`;
          });
          docEl.innerHTML = html;
          docEl.querySelectorAll('.doc-group-header').forEach(hdr => {
            hdr.addEventListener('click', () => {
              const group = hdr.closest('.doc-date-group');
              const body = group.querySelector('.doc-group-body');
              const isOpen = group.classList.contains('open');
              if (isOpen) {
                group.classList.remove('open');
                body.style.display = 'none';
              } else {
                group.classList.add('open');
                body.style.display = '';
              }
            });
          });
        }
      }
    }
  }
  function loadDocs(){
    if (!(consumerId && (docEl || docPreviewEl))) return;
    fetch(`/api/consumers/${consumerId}/state`)
      .then(r => r.json())
      .then(data => {
        allDocs = data.state?.files || [];
        if (data.state?.creditScore) {
          applyCreditScore(data.state.creditScore);
        }
        renderDocList(allDocs);
        if (docPreviewEl) {
          if (!allDocs.length) {
            docPreviewEl.textContent = 'No documents uploaded.';
          } else {
            const previewDocs = allDocs.slice(0, 3).map(d => {
              const ext = getFileExt(d.originalName);
              const iconClass = getDocIconClass(ext);
              const iconLabel = getDocIconLabel(ext);
              const friendly = friendlyFileName(d.originalName);
              const timestamp = friendly.date || 'Ready to view';
              return `<div class="doc-card" style="cursor:default;" title="${esc(d.originalName)}"><div class="doc-card-icon ${iconClass}">${iconLabel}</div><div class="doc-card-info"><div class="doc-card-name">${esc(friendly.label)}</div><div class="doc-card-meta">${timestamp}</div></div></div>`;
            }).join('');
            const overflow = allDocs.length > 3 ? `<div class="text-xs text-slate-500 mt-2">+${allDocs.length - 3} more in your library</div>` : '';
            docPreviewEl.innerHTML = previewDocs + overflow;
          }
        }
      })
      .catch(() => {
        if (docEl) docEl.innerHTML = '<p class="text-sm text-red-500">Failed to load documents.</p>';
        if (docPreviewEl) docPreviewEl.textContent = 'Failed to load documents.';
      });
  }
  const docSearchInput = document.getElementById('docSearchInput');
  if (docSearchInput) {
    docSearchInput.addEventListener('input', () => {
      const q = docSearchInput.value.toLowerCase().trim();
      if (!q) { renderDocList(allDocs); return; }
      renderDocList(allDocs.filter(d => {
        var raw = (d.originalName || '').toLowerCase();
        var friendly = friendlyFileName(d.originalName);
        return raw.includes(q) || friendly.label.toLowerCase().includes(q) || friendly.full.toLowerCase().includes(q);
      }));
    });
  }
  loadDocs();
  loadMessages();
  initNegativeItems();
  if (consumerId && paymentSection) {
    loadInvoices();
  }

  function loadMail(){
    if (!(mailWaiting && mailMailed && consumerId)) return;
    fetch(`/api/consumers/${consumerId}/state`)
      .then(r=>r.json())
      .then(data=>{
        const events = data.state?.events || [];
        const files = data.state?.files || [];
        const roundEvents = events.filter(e=>e.type==='dispute_round');
        const roundMap = {};
        for(const re of roundEvents){
          const p = re.payload || {};
          roundMap[p.jobId] = { round: p.round || 0, sentAt: p.sentAt || '', items: p.letters || p.items || [] };
        }
        const mailEvents = events.filter(e=>e.type==='letters_portal_sent');
        const mailedSet = new Set(JSON.parse(localStorage.getItem('mailedLetters')||'[]'));
        const waiting=[], mailed=[];
        for(const ev of mailEvents){
          const jobId = ev.payload?.jobId || '';
          const stored = (ev.payload?.file||'').split('/').pop();
          const meta = files.find(f=>f.storedName===stored);
          const rawName = meta?.originalName || `Letters ${jobId}`;
          const friendly = friendlyFileName(rawName);
          const name = friendly.full || friendly.label;
          const roundInfo = roundMap[jobId];
          const rec = { jobId, name, rawName, url: ev.payload?.file || '#', file: stored, round: roundInfo?.round || 0, sentAt: roundInfo?.sentAt || '' };
          if(mailedSet.has(stored)) mailed.push(rec); else waiting.push(rec);
        }
        renderMailList(mailWaiting, waiting, true);
        renderMailList(mailMailed, mailed, false);
      })
      .catch(()=>{
        mailWaiting.textContent='Failed to load letters.';
        mailMailed.textContent='Failed to load letters.';
      });
  }

  function renderEducation(){
    var container = document.getElementById('education');
    if(!container) return;
    var activeTier = typeof window.getActiveTier === 'function' ? window.getActiveTier() : 'beginner';

    var tiers = {
      beginner: { data: window.EDUCATION_LESSONS || [], label: 'Beginner', icon: '📗', xpEach: 100, desc: 'Credit fundamentals', color: '#22c55e' },
      intermediate: { data: window.EDUCATION_INTERMEDIATE || [], label: 'Intermediate', icon: '📙', xpEach: 150, desc: 'FCRA, FDCPA, CFPB', color: '#f59e0b' },
      expert: { data: window.EDUCATION_EXPERT || [], label: 'Expert', icon: '📕', xpEach: 200, desc: 'Legal & regulatory', color: '#ef4444' }
    };

    var currentTier = tiers[activeTier] || tiers.beginner;
    var lessonData = currentTier.data;
    var statuses = typeof window.resolveStatuses === 'function' ? window.resolveStatuses(lessonData) : [];
    var lessons = lessonData.map(function(l, i){
      return { id: l.id, title: l.title, subtitle: l.subtitle, icon: l.icon, status: statuses[i] || 'locked' };
    });

    var allLessons = typeof window.getAllLessons === 'function' ? window.getAllLessons() : lessonData;
    var completedCount = typeof window.getCompletedCount === 'function' ? window.getCompletedCount() : 0;
    var totalXP = typeof window.getTotalXP === 'function' ? window.getTotalXP() : 0;
    var streak = typeof window.getStreak === 'function' ? window.getStreak() : { days: 0 };
    var level = Math.floor(totalXP / 800) + 1;
    var xpInLevel = totalXP % 800;
    var xpNeeded = 800;
    var xpPct = Math.min((xpInLevel / xpNeeded) * 100, 100);

    var header = document.querySelector('.edu-header');
    if(header){
      var levelBadge = header.querySelector('.edu-level-badge');
      if(levelBadge) levelBadge.textContent = 'Level ' + level;
      var xpLabel = header.querySelector('.edu-xp-label .text-xs');
      if(xpLabel) xpLabel.textContent = totalXP + ' / ' + (level * xpNeeded) + ' XP';
      var xpFill = header.querySelector('.edu-xp-fill');
      if(xpFill) xpFill.style.width = xpPct + '%';
      var statsLine = header.querySelector('.edu-xp-bar .flex');
      if(statsLine) statsLine.innerHTML = '<span>\uD83D\uDD25 ' + (streak.days || 0) + ' day streak</span><span>\u2705 ' + completedCount + ' of ' + allLessons.length + ' complete</span>';
    }

    var tierCompleted = typeof window.getCompletedCountForTier === 'function' ? window.getCompletedCountForTier(lessonData) : 0;
    var tabsHtml = '<div class="edu-tier-tabs">';
    ['beginner','intermediate','expert'].forEach(function(key){
      var t = tiers[key];
      var isActive = key === activeTier;
      var tc = typeof window.getCompletedCountForTier === 'function' ? window.getCompletedCountForTier(t.data) : 0;
      tabsHtml += '<button class="edu-tier-tab' + (isActive ? ' active' : '') + '" data-tier="' + key + '" type="button" style="--tier-color:' + t.color + '">';
      tabsHtml += '<span class="edu-tier-tab-icon">' + t.icon + '</span>';
      tabsHtml += '<span class="edu-tier-tab-info">';
      tabsHtml += '<span class="edu-tier-tab-label">' + t.label + '</span>';
      tabsHtml += '<span class="edu-tier-tab-desc">' + t.desc + '</span>';
      tabsHtml += '</span>';
      tabsHtml += '<span class="edu-tier-tab-progress">' + tc + '/' + t.data.length + '</span>';
      tabsHtml += '</button>';
    });
    tabsHtml += '</div>';

    var tierInfoHtml = '<div class="edu-tier-info">';
    tierInfoHtml += '<span class="edu-tier-xp-badge" style="background:' + currentTier.color + '20;color:' + currentTier.color + '">' + currentTier.xpEach + ' XP per lesson</span>';
    tierInfoHtml += '<span class="edu-tier-count">' + tierCompleted + ' of ' + lessonData.length + ' complete</span>';
    tierInfoHtml += '</div>';

    var mapHtml = '';
    lessons.forEach(function(lesson, i){
      var align = i % 2 === 0 ? 'align-left' : 'align-right';
      var nodeClass = 'edu-node ' + lesson.status;
      var stepClass = 'edu-step ' + align + (lesson.status === 'locked' ? ' locked' : '');
      var inner = '';
      if(lesson.status === 'completed'){
        inner = '<span class="edu-check">\u2713</span>';
      } else if(lesson.status === 'current'){
        inner = lesson.icon;
      } else {
        inner = '<span class="edu-lock">\uD83D\uDD12</span>';
      }
      var clickable = lesson.status !== 'locked';
      var tag = clickable ? 'button' : 'div';
      var extra = clickable ? ' data-lesson-id="' + lesson.id + '" type="button"' : '';
      mapHtml += '<' + tag + ' class="' + stepClass + '"' + extra + '>' +
        '<div class="' + nodeClass + '">' + inner + '</div>' +
        '<div class="edu-lesson-info">' +
          '<div class="edu-lesson-title">' + esc(lesson.title) + '</div>' +
          '<div class="edu-lesson-subtitle">' + esc(lesson.subtitle) + '</div>' +
        '</div>' +
      '</' + tag + '>';
      if(i < lessons.length - 1){
        var connClass = 'edu-connector';
        if(lesson.status === 'completed' && (statuses[i+1] === 'completed' || statuses[i+1] === 'current')) connClass += ' completed';
        mapHtml += '<div class="' + connClass + '"></div>';
      }
    });

    var testsHtml = '';
    if(activeTier === 'beginner' && window.BEGINNER_TESTS){
      var testProgress = typeof window.getBeginnerTestProgress === 'function' ? window.getBeginnerTestProgress() : null;
      testsHtml += '<div class="edu-beginner-tests">';
      testsHtml += '<div class="edu-tests-header">Beginner Tests</div>';
      testsHtml += '<div class="edu-tests-grid">';
      window.BEGINNER_TESTS.forEach(function(t){
        var lessonsReady = typeof window.areTestLessonsComplete === 'function' && window.areTestLessonsComplete(t.subjects);
        var passed = testProgress && testProgress.isTestPassed(t.index);
        var cardClass = 'edu-test-card';
        if(passed) cardClass += ' passed';
        else if(!lessonsReady) cardClass += ' locked';
        testsHtml += '<div class="' + cardClass + '">';
        testsHtml += '<div class="edu-test-card-header">';
        testsHtml += '<span class="edu-test-label">' + t.label + '</span>';
        if(passed) testsHtml += '<span class="edu-test-passed-badge">\u2713 Passed</span>';
        else if(!lessonsReady) testsHtml += '<span class="edu-test-locked-badge">\uD83D\uDD12</span>';
        testsHtml += '</div>';
        testsHtml += '<div class="edu-test-subjects">';
        t.names.forEach(function(n){ testsHtml += '<div class="edu-test-subject">' + esc(n) + '</div>'; });
        testsHtml += '</div>';
        testsHtml += '<div class="edu-test-meta">' + t.count + ' questions \u00B7 15 min \u00B7 70% to pass</div>';
        if(lessonsReady && !passed){
          testsHtml += '<button class="edu-test-btn" data-test-index="' + t.index + '" type="button">Take Test</button>';
        } else if(passed){
          testsHtml += '<button class="edu-test-btn retake" data-test-index="' + t.index + '" type="button">Retake</button>';
        } else {
          testsHtml += '<button class="edu-test-btn disabled" disabled type="button">Complete Lessons First</button>';
        }
        testsHtml += '</div>';
      });
      testsHtml += '</div></div>';
    }

    var quizHtml = '';
    var tierAllComplete = typeof window.isTierComplete === 'function' && window.isTierComplete(activeTier);
    var tierQuizPassed = typeof window.isTierQuizPassed === 'function' && window.isTierQuizPassed(activeTier);

    quizHtml += '<div class="edu-tier-quiz-section' + (!tierAllComplete ? ' locked' : '') + '">';
    if(tierQuizPassed){
      quizHtml += '<div class="edu-quiz-passed">';
      quizHtml += '<span class="edu-quiz-passed-icon">🎓</span>';
      quizHtml += '<span class="edu-quiz-passed-text">' + currentTier.label + ' Tier Complete — Exam Passed!</span>';
      quizHtml += '</div>';
      quizHtml += '<button class="edu-cert-btn" data-cert-tier="' + activeTier + '" type="button">Download Certificate 📜</button>';
    } else if(tierAllComplete){
      quizHtml += '<div class="edu-quiz-available">';
      quizHtml += '<span class="edu-quiz-icon">📝</span>';
      quizHtml += '<div class="edu-quiz-info">';
      quizHtml += '<div class="edu-quiz-title">' + currentTier.label + ' Final Exam Available!</div>';
      quizHtml += '<div class="edu-quiz-desc">Pass the timed exam to earn bonus XP and your graduation certificate.</div>';
      quizHtml += '</div>';
      quizHtml += '</div>';
      quizHtml += '<button class="edu-quiz-btn" data-quiz-tier="' + activeTier + '" type="button">Take Final Exam</button>';
    } else {
      var remaining = lessonData.length - tierCompleted;
      quizHtml += '<div class="edu-quiz-locked">';
      quizHtml += '<span class="edu-quiz-locked-icon">🔒</span>';
      quizHtml += '<div class="edu-quiz-info">';
      quizHtml += '<div class="edu-quiz-title">' + currentTier.label + ' Final Exam</div>';
      quizHtml += '<div class="edu-quiz-desc">Complete all ' + lessonData.length + ' lessons to unlock the final exam. ' + remaining + ' lesson' + (remaining !== 1 ? 's' : '') + ' remaining.</div>';
      quizHtml += '</div>';
      quizHtml += '</div>';
      quizHtml += '<button class="edu-quiz-btn disabled" disabled type="button">Take Final Exam</button>';
    }
    quizHtml += '</div>';

    container.innerHTML = tabsHtml + tierInfoHtml + mapHtml + testsHtml + quizHtml;

    container.querySelectorAll('.edu-tier-tab').forEach(function(tab){
      tab.addEventListener('click', function(){
        var tier = tab.getAttribute('data-tier');
        if(typeof window.setActiveTier === 'function') window.setActiveTier(tier);
        renderEducation();
      });
    });

    container.querySelectorAll('[data-lesson-id]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var lid = btn.getAttribute('data-lesson-id');
        if(typeof window.openLesson === 'function') window.openLesson(lid);
      });
    });

    container.querySelectorAll('[data-quiz-tier]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var tier = btn.getAttribute('data-quiz-tier');
        if(typeof window.openTierQuiz === 'function') window.openTierQuiz(tier);
      });
    });

    container.querySelectorAll('[data-cert-tier]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var tier = btn.getAttribute('data-cert-tier');
        if(typeof window.generateCertificate === 'function') window.generateCertificate(tier);
      });
    });

    container.querySelectorAll('[data-test-index]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var idx = parseInt(btn.getAttribute('data-test-index'), 10);
        if(typeof window.openBeginnerTest === 'function') window.openBeginnerTest(idx);
      });
    });
  }
  window.refreshEducation = renderEducation;
  renderEducation();

  function updateMailEmptyState(){
    const emptyEl = document.getElementById('mailEmptyState');
    if(!emptyEl) return;
    const waitingVisible = mailWaiting && !mailWaiting.classList.contains('hidden');
    const mailedVisible = mailMailed && !mailMailed.classList.contains('hidden');
    const activeEl = waitingVisible ? mailWaiting : (mailedVisible ? mailMailed : null);
    if(activeEl && activeEl.children.length > 0){
      emptyEl.classList.add('hidden');
    } else {
      emptyEl.classList.remove('hidden');
    }
  }

  function formatRoundDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return ''; }
  }

  var mailSelectMode = false;
  function renderMailCard(it, iconClass, statusText, svgIcon, allowMail) {
    return `<div class="mail-card mail-card-${iconClass}" data-file-url="${esc(it.url)}"><input type="checkbox" class="batch-cb" tabindex="-1"><div class="mail-card-icon ${iconClass}">${svgIcon}</div><div class="mail-card-info"><div class="mail-card-name">${esc(it.name)}</div><div class="mail-card-status"><span class="mail-status-dot ${iconClass}"></span>${statusText}</div></div><div class="mail-card-actions"><a class="mail-btn mail-btn-view" href="${esc(it.url)}" target="_blank"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> View</a>${allowMail?`<button class="mail-btn mail-btn-send mail-act" data-job="${esc(it.jobId)}" data-file="${esc(it.file)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9z"/></svg> Mail</button>`:''}</div></div>`;
  }

  function renderMailList(el, items, allowMail){
    if(!el) return;
    if(!items.length){
      el.innerHTML='';
      updateMailEmptyState();
      return;
    }
    const iconClass = allowMail ? 'waiting' : 'mailed';
    const statusText = allowMail ? 'Pending' : 'Sent';
    const svgIcon = allowMail
      ? '<svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
      : '<svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
    const groups = {};
    const groupOrder = [];
    for (const it of items) {
      const key = it.jobId || 'ungrouped';
      if (!groups[key]) {
        groups[key] = { round: it.round, sentAt: it.sentAt, items: [] };
        groupOrder.push(key);
      }
      groups[key].items.push(it);
    }
    groupOrder.sort((a, b) => (groups[b].round || 0) - (groups[a].round || 0));
    let html = '';
    groupOrder.forEach((key, gi) => {
      const g = groups[key];
      const isFirst = gi === 0;
      const roundLabel = g.round ? `Round ${g.round}` : 'Letters';
      const dateLabel = formatRoundDate(g.sentAt);
      const count = g.items.length;
      const chevronSvg = '<svg class="mail-round-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
      html += `<div class="mail-round-group${isFirst ? ' open' : ''}">`;
      html += `<div class="mail-round-header" role="button" tabindex="0">`;
      html += `<div class="mail-round-header-info"><span class="mail-round-label">${esc(roundLabel)}</span>`;
      if (dateLabel) html += `<span class="mail-round-date">${esc(dateLabel)}</span>`;
      html += `<span class="mail-round-count">${count} letter${count !== 1 ? 's' : ''}</span>`;
      html += `</div>${chevronSvg}</div>`;
      html += `<div class="mail-round-body"${isFirst ? '' : ' style="display:none"'}>`;
      html += g.items.map(it => renderMailCard(it, iconClass, statusText, svgIcon, allowMail)).join('');
      html += `</div></div>`;
    });
    el.innerHTML = html;
    el.querySelectorAll('.mail-round-header').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const group = hdr.closest('.mail-round-group');
        const body = group.querySelector('.mail-round-body');
        const isOpen = group.classList.contains('open');
        if (isOpen) {
          group.classList.remove('open');
          body.style.display = 'none';
        } else {
          group.classList.add('open');
          body.style.display = '';
        }
      });
    });
    updateMailEmptyState();
    if(allowMail){
      el.querySelectorAll('.mail-act').forEach(btn=>{
        btn.addEventListener('click',async ()=>{
          const jobId = btn.getAttribute('data-job');
          const file = btn.getAttribute('data-file');
          btn.disabled = true;
          try{
            const resp = await fetch(`/api/portal/${encodeURIComponent(consumerId)}/mail`, {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ jobId, file })
            });
            const data = await resp.json().catch(()=>({}));
            if(!data?.ok) throw new Error(data?.error || 'Failed to mail letters');
            const mailed = JSON.parse(localStorage.getItem('mailedLetters')||'[]');
            if(!mailed.includes(file)) mailed.push(file);
            localStorage.setItem('mailedLetters', JSON.stringify(mailed));
            loadMail();
          }catch(e){
            alert(e.message || 'Failed to mail letters.');
            btn.disabled = false;
          }
        });
      });
    }
  }

  if(mailTabWaiting && mailTabMailed){
    mailTabWaiting.addEventListener('click',()=>{
      mailTabWaiting.classList.add('active');
      mailTabMailed.classList.remove('active');
      if(mailWaiting) mailWaiting.classList.remove('hidden');
      if(mailMailed) mailMailed.classList.add('hidden');
      updateMailEmptyState();
    });
    mailTabMailed.addEventListener('click',()=>{
      mailTabMailed.classList.add('active');
      mailTabWaiting.classList.remove('active');
      if(mailMailed) mailMailed.classList.remove('hidden');
      if(mailWaiting) mailWaiting.classList.add('hidden');
      updateMailEmptyState();
    });
  }

  (function initBatchSelect() {
    var docToolbar = null;
    var mailToolbar = null;

    function createToolbar(id) {
      var tb = document.createElement('div');
      tb.className = 'batch-toolbar';
      tb.id = id;
      tb.innerHTML = '<label class="select-all-label"><input type="checkbox" class="batch-select-all"> Select All</label><span class="batch-count">0 selected</span><button class="batch-download-btn" disabled><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download Selected</button>';
      document.body.appendChild(tb);
      return tb;
    }

    function getVisibleCards(container, selector) {
      if (!container) return [];
      return Array.from(container.querySelectorAll(selector)).filter(function(card) {
        return card.offsetWidth > 0 || card.offsetHeight > 0;
      });
    }

    function updateToolbarCount(toolbar, container, selector) {
      if (!toolbar || !container) return;
      var cards = getVisibleCards(container, selector);
      var checked = cards.filter(function(c) { return c.querySelector('.batch-cb')?.checked; });
      var countEl = toolbar.querySelector('.batch-count');
      var dlBtn = toolbar.querySelector('.batch-download-btn');
      var allCb = toolbar.querySelector('.batch-select-all');
      if (countEl) countEl.textContent = checked.length + ' selected';
      if (dlBtn) dlBtn.disabled = checked.length === 0;
      if (allCb) allCb.checked = cards.length > 0 && checked.length === cards.length;
    }

    function batchDownload(urls) {
      var i = 0;
      function next() {
        if (i >= urls.length) return;
        var a = document.createElement('a');
        a.href = urls[i];
        a.download = '';
        a.target = '_blank';
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        i++;
        setTimeout(next, 350);
      }
      next();
    }

    function wireCardClicks(container, selector, toolbar) {
      if (!container) return;
      container.addEventListener('click', function(e) {
        var card = e.target.closest(selector);
        if (!card) return;
        var isDocCard = selector === '.doc-card';
        var selectActive = isDocCard ? docSelectMode : mailSelectMode;
        if (!selectActive) return;
        e.preventDefault();
        e.stopPropagation();
        var cb = card.querySelector('.batch-cb');
        if (!cb) return;
        cb.checked = !cb.checked;
        card.classList.toggle('batch-selected', cb.checked);
        updateToolbarCount(toolbar, container, selector);
      }, true);
    }

    var docSection = document.getElementById('documentSection');
    var docSelectBtn = document.getElementById('docSelectToggle');
    if (docSelectBtn && docSection) {
      docToolbar = createToolbar('docBatchToolbar');
      wireCardClicks(docSection, '.doc-card', docToolbar);

      docSelectBtn.addEventListener('click', function() {
        docSelectMode = !docSelectMode;
        docSelectBtn.classList.toggle('active', docSelectMode);
        docSection.classList.toggle('select-mode', docSelectMode);
        if (docSelectMode) {
          docToolbar.classList.add('visible');
        } else {
          docToolbar.classList.remove('visible');
          docSection.querySelectorAll('.doc-card .batch-cb').forEach(function(cb) { cb.checked = false; });
          docSection.querySelectorAll('.doc-card.batch-selected').forEach(function(c) { c.classList.remove('batch-selected'); });
        }
        updateToolbarCount(docToolbar, docSection, '.doc-card');
      });

      docToolbar.querySelector('.batch-select-all').addEventListener('change', function(e) {
        var checked = e.target.checked;
        getVisibleCards(docSection, '.doc-card').forEach(function(card) {
          var cb = card.querySelector('.batch-cb');
          if (cb) cb.checked = checked;
          card.classList.toggle('batch-selected', checked);
        });
        updateToolbarCount(docToolbar, docSection, '.doc-card');
      });

      docToolbar.querySelector('.batch-download-btn').addEventListener('click', function() {
        var urls = [];
        getVisibleCards(docSection, '.doc-card.batch-selected').forEach(function(c) {
          var u = c.getAttribute('data-file-url');
          if (u) urls.push(u);
        });
        if (urls.length) batchDownload(urls);
      });
    }

    var mailSection = document.getElementById('mailSection');
    var mailSelectBtn = document.getElementById('mailSelectToggle');
    if (mailSelectBtn && mailSection) {
      mailToolbar = createToolbar('mailBatchToolbar');

      function getActiveMailContainer() {
        var waitingEl = document.getElementById('mailWaiting');
        var mailedEl = document.getElementById('mailMailed');
        if (waitingEl && !waitingEl.classList.contains('hidden')) return waitingEl;
        if (mailedEl && !mailedEl.classList.contains('hidden')) return mailedEl;
        return waitingEl;
      }

      wireCardClicks(mailSection, '.mail-card', mailToolbar);

      mailSelectBtn.addEventListener('click', function() {
        mailSelectMode = !mailSelectMode;
        mailSelectBtn.classList.toggle('active', mailSelectMode);
        mailSection.classList.toggle('select-mode', mailSelectMode);
        if (mailSelectMode) {
          mailToolbar.classList.add('visible');
        } else {
          mailToolbar.classList.remove('visible');
          mailSection.querySelectorAll('.mail-card .batch-cb').forEach(function(cb) { cb.checked = false; });
          mailSection.querySelectorAll('.mail-card.batch-selected').forEach(function(c) { c.classList.remove('batch-selected'); });
        }
        updateToolbarCount(mailToolbar, getActiveMailContainer(), '.mail-card');
      });

      mailToolbar.querySelector('.batch-select-all').addEventListener('change', function(e) {
        var checked = e.target.checked;
        var container = getActiveMailContainer();
        if (!container) return;
        getVisibleCards(container, '.mail-card').forEach(function(card) {
          var cb = card.querySelector('.batch-cb');
          if (cb) cb.checked = checked;
          card.classList.toggle('batch-selected', checked);
        });
        updateToolbarCount(mailToolbar, container, '.mail-card');
      });

      mailToolbar.querySelector('.batch-download-btn').addEventListener('click', function() {
        var container = getActiveMailContainer();
        if (!container) return;
        var urls = [];
        getVisibleCards(container, '.mail-card.batch-selected').forEach(function(c) {
          var u = c.getAttribute('data-file-url');
          if (u) urls.push(u);
        });
        if (urls.length) batchDownload(urls);
      });

      if (mailTabWaiting) {
        mailTabWaiting.addEventListener('click', function() {
          if (mailSelectMode) {
            mailSection.querySelectorAll('.mail-card .batch-cb').forEach(function(cb) { cb.checked = false; });
            mailSection.querySelectorAll('.mail-card.batch-selected').forEach(function(c) { c.classList.remove('batch-selected'); });
            updateToolbarCount(mailToolbar, getActiveMailContainer(), '.mail-card');
          }
        });
      }
      if (mailTabMailed) {
        mailTabMailed.addEventListener('click', function() {
          if (mailSelectMode) {
            mailSection.querySelectorAll('.mail-card .batch-cb').forEach(function(cb) { cb.checked = false; });
            mailSection.querySelectorAll('.mail-card.batch-selected').forEach(function(c) { c.classList.remove('batch-selected'); });
            updateToolbarCount(mailToolbar, getActiveMailContainer(), '.mail-card');
          }
        });
      }
    }
  })();

  function pickHeadline(item){
    if (!item) return null;
    const hl = item.headline;
    if (hl && (hl.text || hl.title)) {
      const text = hl.text || [hl.category, hl.title].filter(Boolean).join(' – ');
      return {
        text,
        detail: hl.detail || '',
        severity: hl.severity || 0,
      };
    }
    const violations = Array.isArray(item.violations) ? [...item.violations] : [];
    violations.sort((a, b) => {
      const sev = (b.severity || 0) - (a.severity || 0);
      if (sev !== 0) return sev;
      return (a.title || '').localeCompare(b.title || '');
    });
    const top = violations.find(v => (v.title || '').trim());
    if (!top) return null;
    const text = [top.category, top.title].filter(Boolean).join(' – ');
    return {
      text,
      detail: top.detail || '',
      severity: top.severity || 0,
    };
  }

  function renderNegativeItems(data){
    if(!negativeItemList) return;
    if(!data.length){
      negativeItemList.innerHTML = '<div class="muted text-sm">No negative items detected yet.</div>';
      return;
    }
    negativeItemList.innerHTML = data.map(item => {
      const bureaus = (item.bureaus || []).map(b => `<span class="badge badge-bureau">${escape(b)}</span>`).join(' ');
      const accounts = Object.entries(item.account_numbers || {})
        .map(([bureau, number]) => {
          const masked = maskAccountDisplay(number);
          return `<span class="text-xs muted inline-block mr-2">${escape(bureau)} • ${escape(masked)}</span>`;
        })
        .join('');
      const severity = item.severity || 0;
      const headline = pickHeadline(item);
      const violationList = (item.violations || []).map(v => `
        <li class="flex gap-2 items-start">
          <span class="severity-tag severity-${v.severity || 0}">S${v.severity || 0}</span>
          <div>
            <div class="font-medium text-sm">${escape([v.category, v.title].filter(Boolean).join(' – ') || '')}</div>
            ${v.detail ? `<div class="text-xs muted">${escape(v.detail)}</div>` : ''}
            ${v.bureaus && v.bureaus.length ? `<div class="text-xs muted">${v.bureaus.map(b => escape(b)).join(', ')}</div>` : ''}
          </div>
        </li>
      `).join('');
      const violationContent = violationList
        ? `<ul class="mt-3 space-y-2">${violationList}</ul>`
        : '<div class="text-sm muted mt-3">No Metro 2 violations detected.</div>';
      const accountMarkup = accounts ? `<div class="mt-2 flex flex-wrap gap-2">${accounts}</div>` : '';
      const headlineMarkup = headline ? `
        <div class="mt-3 p-2 rounded bg-slate-50 text-sm">
          <div class="font-medium">${escape(headline.text)}</div>
          ${headline.detail ? `<div class="text-xs muted mt-1">${escape(headline.detail)}</div>` : ''}
        </div>
      ` : '';
      const bureauDetails = item.bureau_details && typeof item.bureau_details === 'object'
        ? Object.entries(item.bureau_details)
          .map(([bureau, info]) => {
            if(!info || typeof info !== 'object') return '';
            const rows = Object.entries(NEGATIVE_BUREAU_LABELS)
              .map(([key, label]) => {
                let value = info[key];
                if(!value) return '';
                if(key === 'account_number'){
                  value = maskAccountDisplay(value);
                }
                return `<div class="negative-bureau-row"><span class="negative-bureau-label">${escape(label)}</span><span class="negative-bureau-value">${escape(value)}</span></div>`;
              })
              .filter(Boolean)
              .join('');
            if(!rows) return '';
            return `<div class="negative-bureau-card"><div class="negative-bureau-title">${escape(bureau)}</div>${rows}</div>`;
          })
          .filter(Boolean)
          .join('')
        : '';
      const bureauSection = bureauDetails
        ? `<div class="negative-bureau-grid" aria-label="Bureau breakdown">${bureauDetails}</div>`
        : '';
      const remainderMarkup = '';
      const violationCount = (item.violations || []).length;
      return `
        <div class="glass card negative-item-card">
          <div class="negative-item-header p-3" role="button" tabindex="0" aria-expanded="false">
            <div class="flex items-start justify-between gap-3 w-full">
              <div>
                <div class="font-semibold text-base text-slate-800">${escape(item.creditor || 'Unknown Creditor')}</div>
                <div class="text-xs muted mt-1">${bureaus || '—'}</div>
              </div>
              <div class="flex flex-col items-end gap-1 text-right">
                <div class="severity-tag severity-${severity}">S${severity}</div>
                <div class="text-xs muted">${violationCount} violation${violationCount === 1 ? '' : 's'}</div>
                <span class="negative-item-chevron" aria-hidden="true">⌄</span>
              </div>
            </div>
          </div>
          <div class="negative-item-details px-3 pb-3" aria-hidden="true">
            ${accountMarkup}
            ${headlineMarkup}
            ${bureauSection}
            ${violationContent}
            ${remainderMarkup}
          </div>
        </div>
      `;
    }).join('');
  }

  function toggleNegativeItemCard(header, force){
    if(!(header && negativeItemList)) return;
    const card = header.closest('.negative-item-card');
    if(!card) return;
    const details = card.querySelector('.negative-item-details');
    const shouldOpen = force !== undefined ? !!force : !card.classList.contains('open');
    card.classList.toggle('open', shouldOpen);
    header.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    if(details){
      details.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    }
  }

  function filterNegativeItems(){
    if(!negativeItemList) return;
    let data = Array.isArray(negativeItems) ? [...negativeItems] : [];
    const query = (negativeItemSearch?.value || '').toLowerCase();
    if(query){
      data = data.filter(item => {
        const creditor = (item.creditor || '').toLowerCase();
        const bureauMatch = (item.bureaus || []).some(b => (b || '').toLowerCase().includes(query));
        const violationMatch = (item.violations || []).some(v => (v.title || '').toLowerCase().includes(query));
        return creditor.includes(query) || bureauMatch || violationMatch;
      });
    }
    const sort = negativeItemSort?.value || 'severity-desc';
    if(sort === 'severity-asc'){
      data.sort((a,b)=> (a.severity || 0) - (b.severity || 0) || (a.creditor || '').localeCompare(b.creditor || ''));
    } else if(sort === 'creditor-asc'){
      data.sort((a,b)=> (a.creditor || '').localeCompare(b.creditor || ''));
    } else if(sort === 'creditor-desc'){
      data.sort((a,b)=> (b.creditor || '').localeCompare(a.creditor || ''));
    } else {
      data.sort((a,b)=> (b.severity || 0) - (a.severity || 0) || (a.creditor || '').localeCompare(b.creditor || ''));
    }
    renderNegativeItems(data);
  }

  function initNegativeItems(){
    if(!negativeItemList) return;
    filterNegativeItems();
  }

  if(negativeItemSearch) negativeItemSearch.addEventListener('input', filterNegativeItems);
  if(negativeItemSort) negativeItemSort.addEventListener('change', filterNegativeItems);
  if(negativeItemList){
    negativeItemList.addEventListener('click', e => {
      const header = e.target.closest('.negative-item-header');
      if(!header || !negativeItemList.contains(header)) return;
      e.preventDefault();
      toggleNegativeItemCard(header);
    });
    negativeItemList.addEventListener('keydown', e => {
      if(e.key !== 'Enter' && e.key !== ' ') return;
      const header = e.target.closest('.negative-item-header');
      if(!header || !negativeItemList.contains(header)) return;
      e.preventDefault();
      toggleNegativeItemCard(header);
    });
  }

  const goalBtn = document.getElementById('btnGoal');
  if(goalBtn){
    const confettiEl = document.getElementById('confetti');
    const burstEl = document.getElementById('goalBurst');
    goalBtn.addEventListener('click', () => {
      if(confettiEl){
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
      }
      if(burstEl && window.lottie){
        lottie.loadAnimation({
          container: burstEl,
          renderer: 'svg',
          loop: false,
          autoplay: true,
          path: 'https://assets7.lottiefiles.com/packages/lf20_jei1c95b.json'
        }).addEventListener('complete',()=>{burstEl.innerHTML='';});

      }
    });
  }

  const debtForm = document.getElementById('debtForm');
  if (debtForm) {
    debtForm.addEventListener('submit', e => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('debtAmount').value);
      const rate = parseFloat(document.getElementById('debtRate').value) / 100 / 12;
      const months = parseFloat(document.getElementById('debtMonths').value);
      const result = document.getElementById('debtResult');
      const payment = amount * rate / (1 - Math.pow(1 + rate, -months));
      if (isFinite(payment) && payment > 0) result.textContent = `Monthly payment approx $${payment.toFixed(2)}`;
      else result.textContent = 'Invalid values.';
    });
  }

  function formatMsgTime(dateStr){
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    if(mins < 1) return 'Just now';
    if(mins < 60) return mins + 'm ago';
    return d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
  }
  function formatMsgDate(dateStr){
    const d = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = today - msgDay;
    if(diff === 0) return 'Today';
    if(diff <= 86400000) return 'Yesterday';
    return d.toLocaleDateString([], {month:'short', day:'numeric'});
  }

  function loadMessages(){
    if (!(consumerId && messageList)) return;
    fetch(`/api/messages/${consumerId}`)
      .then(r => {
        if (!r.ok) throw new Error('Network response was not ok');
        return r.text();
      })
      .then(text => {
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error('Invalid JSON');
        }
        const msgs = data.messages || [];
        if (messageBanner) {
          const hostMsg = msgs.find(m => m.payload?.from && m.payload.from !== 'client');
          if (hostMsg) {
            const prefix = hostMsg.payload?.from ? hostMsg.payload.from + ': ' : '';
            messageBanner.textContent = prefix + (hostMsg.payload?.text || '');
            messageBanner.classList.remove('hidden');
          } else {
            messageBanner.classList.add('hidden');
          }
        }
        if (!msgs.length) {
          messageList.innerHTML = '<div class="imsg-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>No messages yet</p><p class="imsg-empty-sub">Send a message to start the conversation.</p></div>';
        } else {
          let html = '';
          let lastDate = '';
          msgs.forEach(m => {
            const dateLabel = formatMsgDate(m.at);
            if(dateLabel !== lastDate){
              html += `<div class="imsg-date-divider">${esc(dateLabel)}</div>`;
              lastDate = dateLabel;
            }
            const fromUser = m.payload?.from;
            const isClient = fromUser === 'client';
            const rowClass = isClient ? 'sent' : 'received';
            const timeText = formatMsgTime(m.at);
            const senderLabel = isClient ? '' : `<div class="imsg-bubble-sender">${esc(fromUser || 'Credit Team')}</div>`;
            html += `<div class="imsg-bubble-row ${rowClass}"><div class="imsg-bubble">${senderLabel}${esc(m.payload?.text || '')}<div class="imsg-bubble-time">${esc(timeText)}</div></div></div>`;
          });
          messageList.innerHTML = html;
          messageList.scrollTop = messageList.scrollHeight;
        }
      })
      .catch(err => {
        console.error('Failed to load messages', err);
        messageList.innerHTML = '<div class="imsg-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4.99c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"/></svg><p>Failed to load messages</p><p class="imsg-empty-sub"><a href="#" id="retryMessages" style="color:#007aff">Tap to retry</a></p></div>';
        const retry = document.getElementById('retryMessages');
        if (retry) retry.addEventListener('click', e => { e.preventDefault(); loadMessages(); });
      });
  }

  if (messageForm && consumerId) {
    messageForm.addEventListener('submit', e => {
      e.preventDefault();
      const input = document.getElementById('messageInput');
      const text = input.value.trim();
      if (!text) return;
      fetch(`/api/messages/${consumerId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'client', text }) })
        .then(r => r.json())
        .then(() => { input.value = ''; loadMessages(); });
    });
  }

  function isPortalModuleEnabled(modules, key){
    if(!key) return true;
    if(!modules || typeof modules !== 'object') return true;
    return modules[key] !== false;
  }

  function showSection(hash){
    if (portalMain) portalMain.classList.add('hidden');
    if (uploadSection) uploadSection.classList.add('hidden');
    if (messageSection) messageSection.classList.add('hidden');
    if (educationSection) educationSection.classList.add('hidden');
    if (documentSection) documentSection.classList.add('hidden');
    if (mailSection) mailSection.classList.add('hidden');
    if (negativeItemsSection) negativeItemsSection.classList.add('hidden');
    if (paymentSection) paymentSection.classList.add('hidden');
    if (tradelineSection) tradelineSection.classList.add('hidden');
    if (disputeSection) disputeSection.classList.add('hidden');
    var affiliateSec = document.getElementById('affiliateSection');
    if (affiliateSec) affiliateSec.classList.add('hidden');
    const primariesSec = document.getElementById('primariesSection');
    if (primariesSec) primariesSec.classList.add('hidden');

    const moduleKey = HASH_TO_PORTAL_MODULE[hash] || 'overview';
    
    // Overview is always enabled or fallback
    if (hash && hash !== '#' && hash !== '#overview') {
      if (!isPortalModuleEnabled(portalSettings.modules, moduleKey)) {
        if (portalMain) portalMain.classList.remove('hidden');
        return;
      }
    }

    if (hash === '#uploads' && uploadSection) {
      uploadSection.classList.remove('hidden');
    } else if (hash === '#messages' && messageSection) {
      messageSection.classList.remove('hidden');
      loadMessages();
    } else if (hash === '#educationSection' && educationSection) {
      educationSection.classList.remove('hidden');
    } else if (hash === '#documentSection' && documentSection) {
      documentSection.classList.remove('hidden');
      loadDocs();
    } else if (hash === '#mailSection' && mailSection) {
      mailSection.classList.remove('hidden');
      loadMail();
    } else if (hash === '#payments' && paymentSection) {
      paymentSection.classList.remove('hidden');
      loadInvoices({ force: true });
    } else if (hash === '#tradelines' && tradelineSection) {
      tradelineSection.classList.remove('hidden');
    } else if (hash === '#primaries' && primariesSec) {
      primariesSec.classList.remove('hidden');
    } else if (hash === '#negative-items' && negativeItemsSection) {
      negativeItemsSection.classList.remove('hidden');
      initNegativeItems();
    } else if (hash === '#disputes' && disputeSection) {
      disputeSection.classList.remove('hidden');
      loadDisputes();
    } else if (hash === '#affiliate' && affiliateSec) {
      affiliateSec.classList.remove('hidden');
      loadPortalAffiliate();
    } else if (portalMain) {
      portalMain.classList.remove('hidden');
    }
  }
  // --- Sidebar active state ---
  function updateSidebarActive(hash) {
    const normalizedHash = hash || '#overview';
    document.querySelectorAll('.sidebar-nav-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === normalizedHash || (!hash || hash === '#') && link.getAttribute('href') === '#overview');
    });
    document.querySelectorAll('.mobile-tab[data-hash]').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.hash === normalizedHash || (!hash || hash === '#') && tab.dataset.hash === '#overview');
    });
    document.querySelectorAll('.mobile-more-menu a').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === normalizedHash);
    });
  }

  // --- Mobile sidebar toggle ---
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const portalSidebar = document.getElementById('portalSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  function openSidebar() {
    if (portalSidebar) portalSidebar.classList.add('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
  }
  function closeSidebar() {
    if (portalSidebar) portalSidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.add('hidden');
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
  }
  if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => {
    if (portalSidebar && portalSidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
  });
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

  window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
      closeSidebar();
    }
  });

  // --- Desktop sidebar collapse toggle ---
  var collapseBtn = document.getElementById('sidebarCollapseBtn');
  function applySidebarCollapsed(collapsed) {
    if (!portalSidebar) return;
    portalSidebar.classList.toggle('collapsed', collapsed);
    try { localStorage.setItem('portal.sidebar.collapsed', collapsed ? '1' : '0'); } catch(e) {}
  }
  (function restoreSidebarState() {
    if (window.innerWidth <= 768) return;
    try {
      var saved = localStorage.getItem('portal.sidebar.collapsed');
      if (saved === '1') applySidebarCollapsed(true);
    } catch(e) {}
  })();
  if (collapseBtn) {
    collapseBtn.addEventListener('click', function() {
      var isCollapsed = portalSidebar && portalSidebar.classList.contains('collapsed');
      applySidebarCollapsed(!isCollapsed);
    });
  }

  // --- Mobile more menu ---
  const mobileMoreBtn = document.getElementById('mobileMoreBtn');
  const mobileMoreMenu = document.getElementById('mobileMoreMenu');
  if (mobileMoreBtn && mobileMoreMenu) {
    mobileMoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      mobileMoreMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!mobileMoreMenu.contains(e.target) && e.target !== mobileMoreBtn) {
        mobileMoreMenu.classList.add('hidden');
      }
    });
  }

  // --- Nav link handlers (sidebar + mobile tabs + more menu) ---
  const allNavLinks = document.querySelectorAll('.sidebar-nav-link, .mobile-tab[data-hash], .mobile-more-menu a');
  allNavLinks.forEach(link => {
    link.addEventListener('click', event => {
      const targetHash = link.getAttribute('href') || link.dataset.hash;
      if (!targetHash) return;
      event.preventDefault();
      event.stopPropagation();
      closeSidebar();
      if (mobileMoreMenu) mobileMoreMenu.classList.add('hidden');
      if (link.dataset.hash) {
        location.hash = targetHash;
      } else if (location.hash !== targetHash) {
        location.hash = targetHash;
      } else {
        showSection(targetHash);
      }
    });
  });

  showSection(location.hash);
  updateSidebarActive(location.hash);
  window.addEventListener('hashchange', () => {
    showSection(location.hash);
    updateSidebarActive(location.hash);
  });
  window.addEventListener('beforeunload', () => {
    if (invoiceRefreshTimer) {
      clearInterval(invoiceRefreshTimer);
      invoiceRefreshTimer = null;
    }
  });

  let disputeData = null;
  let disputeLoading = false;

  function getDisputeStatusBadge(status) {
    const map = {
      awaiting: { cls: 'badge-awaiting', label: 'Awaiting' },
      awaiting_response: { cls: 'badge-awaiting', label: 'Awaiting Response' },
      response_received: { cls: 'badge-response-received', label: 'Response Received' },
      removed: { cls: 'badge-removed', label: 'Removed' },
      deleted: { cls: 'badge-removed', label: 'Deleted' },
      verified: { cls: 'badge-verified', label: 'Verified' },
      no_response: { cls: 'badge-no-response', label: 'No Response' },
      stalled: { cls: 'badge-no-response', label: 'Stalled' },
      partial: { cls: 'badge-verified', label: 'Partial' },
      resolved: { cls: 'badge-removed', label: 'Resolved' },
      escalated: { cls: 'badge-escalated', label: 'Escalated' },
    };
    const info = map[status] || { cls: 'badge-awaiting', label: status || 'Unknown' };
    return `<span class="dispute-badge ${info.cls}">${esc(info.label)}</span>`;
  }

  function formatDisputeDate(d) {
    if (!d) return '';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function buildFollowupHTML(round, recommendations) {
    const isActive = round.status !== 'resolved' && round.status !== 'completed' && round.status !== 'response_received';
    if (!isActive) return '';
    const items = round.items || [];
    if (!items.length) return '';
    const roundLetters = round.letters || [];
    let dueText = 'You can respond at any time';
    if (round.followUpDate) {
      const due = new Date(round.followUpDate);
      const isPast = due.getTime() <= Date.now();
      dueText = isPast
        ? 'Follow-up was due ' + formatDisputeDate(round.followUpDate) + ' \u2014 please respond'
        : 'You can respond now, or follow-up recommended by ' + formatDisputeDate(round.followUpDate);
    }
    const grouped = [];
    const groupMap = {};
    items.forEach((item, idx) => {
      const rawCreditor = item.creditor || 'Unknown';
      const bureau = item.bureau || '';
      let creditorIsUseful = rawCreditor !== bureau && rawCreditor !== 'Unknown';
      let resolvedCreditor = rawCreditor;
      if (!creditorIsUseful) {
        const matchLetter = roundLetters.find(l => l.bureau === bureau && l.creditor && l.creditor !== l.bureau && l.creditor !== 'Unknown');
        if (matchLetter) { resolvedCreditor = matchLetter.creditor; creditorIsUseful = true; }
      }
      const acctKey = (rawCreditor || '') + '||' + (item.accountNumber || '');
      const acctLabel = item.accountNumber ? ` (\u2022\u2022\u2022\u2022${esc(item.accountNumber)})` : '';
      const displayName = creditorIsUseful ? esc(resolvedCreditor) + acctLabel : (bureau ? esc(bureau) + acctLabel : 'Unknown Item');
      if (!groupMap[acctKey]) {
        groupMap[acctKey] = { displayName, bureaus: [] };
        grouped.push(groupMap[acctKey]);
      }
      groupMap[acctKey].bureaus.push({ rawCreditor, bureau, idx, item });
    });

    const recs = recommendations || [];

    const itemsHTML = grouped.map(group => {
      const bureauRows = group.bureaus.map(b => {
        const creditor = esc(b.rawCreditor);
        const bureau = esc(b.bureau);
        const rec = recs.find(r => r.creditor === b.rawCreditor && r.bureau === b.bureau);
        let recHint = '';
        if (rec) {
          const urgClass = rec.urgency === 'high' ? 'text-rose-600 bg-rose-50 border-rose-200' : rec.urgency === 'medium' ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-gray-600 bg-gray-50 border-gray-200';
          recHint = `<div class="mt-1 mb-1.5 px-2 py-1.5 rounded-md border text-xs ${urgClass}">
            <span class="font-medium">${rec.urgency ? esc(rec.urgency) + ' priority' : 'Suggested'}:</span> ${esc(rec.recommendedTemplate || rec.recommended || '')}
            ${rec.reason ? `<span class="opacity-75">\u2014 ${esc(rec.reason)}</span>` : ''}
          </div>`;
        }
        return `<div class="dispute-questionnaire-item border-t border-gray-100 pt-2 first:border-0 first:pt-0" data-idx="${b.idx}">
          <div class="text-xs font-medium text-slate-600 mb-1">${bureau || 'Bureau'}</div>
          ${recHint}
          <select class="dispute-outcome-select input text-sm w-full" data-creditor="${creditor}" data-bureau="${bureau}">
            <option value="">Select outcome...</option>
            <option value="removed">Removed / Deleted</option>
            <option value="verified">Verified (still reporting)</option>
            <option value="no_response">No Response</option>
            <option value="partial">Partially corrected</option>
            <option value="stalled">Stalled / No progress</option>
          </select>
          <div class="flex items-center gap-3 mt-1.5">
            <input type="file" class="dispute-evidence-input text-xs flex-1" data-creditor="${creditor}" data-bureau="${bureau}" accept="image/*,.pdf,.html,.htm">
          </div>
          <textarea class="dispute-notes-input input text-xs w-full mt-1 border border-gray-200 rounded-lg" rows="1" data-creditor="${creditor}" data-bureau="${bureau}" placeholder="Notes (optional)"></textarea>
        </div>`;
      }).join('');

      const bureauList = group.bureaus.map(b => esc(b.bureau)).join(', ');

      return `<div class="bg-gray-50 rounded-lg border border-gray-100 dispute-questionnaire-group">
        <div class="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none dispute-accordion-header" onclick="(function(el){var body=el.parentElement.querySelector('.dispute-accordion-body');var chev=el.querySelector('.dispute-accordion-chevron');var isOpen=body.style.display!=='none';if(!isOpen){el.parentElement.parentElement.querySelectorAll('.dispute-accordion-body').forEach(function(b){b.style.display='none';});el.parentElement.parentElement.querySelectorAll('.dispute-accordion-chevron').forEach(function(c){c.style.transform='rotate(0deg)';});body.style.display='block';chev.style.transform='rotate(180deg)';}else{body.style.display='none';chev.style.transform='rotate(0deg)';}})(this)">
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium text-slate-800 truncate">${group.displayName}</div>
            <div class="text-xs text-gray-400">${bureauList}</div>
          </div>
          <svg class="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 dispute-accordion-chevron" style="transform:rotate(0deg)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="dispute-accordion-body px-3 pb-3 space-y-2" style="display:none">
          ${bureauRows}
        </div>
      </div>`;
    }).join('');
    return `<div class="border-t border-amber-200 mt-3 pt-3 space-y-3 dispute-followup-section" data-job-id="${esc(round.jobId || '')}">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center flex-shrink-0">
          <svg class="w-3.5 h-3.5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div>
          <div class="text-xs font-semibold text-slate-800">Report Your Results</div>
          <div class="text-xs text-gray-500">${esc(dueText)}</div>
        </div>
      </div>
      <p class="text-xs text-gray-500">Tap an item to report its outcome.</p>
      <div class="space-y-1.5">${itemsHTML}</div>
      <div class="flex items-center gap-3">
        <button class="btn text-sm dispute-submit-btn" type="button">Submit Responses</button>
        <div class="dispute-submit-status hidden text-sm"></div>
      </div>
    </div>`;
  }

  function buildResponseSummaryHTML(round) {
    const hasResponses = round.status === 'response_received' || round.status === 'resolved' || round.status === 'completed';
    if (!hasResponses) return '';
    const items = round.items || [];
    if (!items.length) return '';

    const outcomeLabels = {
      removed: { label: 'Removed', cls: 'text-emerald-700 bg-emerald-50' },
      deleted: { label: 'Deleted', cls: 'text-emerald-700 bg-emerald-50' },
      corrected: { label: 'Corrected', cls: 'text-emerald-700 bg-emerald-50' },
      verified: { label: 'Verified', cls: 'text-rose-700 bg-rose-50' },
      no_response: { label: 'No Response', cls: 'text-amber-700 bg-amber-50' },
      awaiting: { label: 'No Response', cls: 'text-amber-700 bg-amber-50' },
      awaiting_response: { label: 'No Response', cls: 'text-amber-700 bg-amber-50' },
      partial: { label: 'Partial Correction', cls: 'text-slate-700 bg-slate-100' },
      stalled: { label: 'Stalled', cls: 'text-slate-700 bg-slate-100' },
      updated: { label: 'Updated', cls: 'text-blue-700 bg-blue-50' },
    };

    const roundLetters = round.letters || [];
    const grouped = [];
    const groupMap = {};
    items.forEach(item => {
      const rawCreditor = item.creditor || 'Unknown';
      const bureau = item.bureau || '';
      let resolvedCreditor = rawCreditor;
      if (rawCreditor === bureau || rawCreditor === 'Unknown') {
        const matchLetter = roundLetters.find(l => l.bureau === bureau && l.creditor && l.creditor !== l.bureau && l.creditor !== 'Unknown');
        if (matchLetter) resolvedCreditor = matchLetter.creditor;
      }
      const acctKey = (rawCreditor || '') + '||' + (item.accountNumber || '');
      const acctLabel = item.accountNumber ? ` (\u2022\u2022\u2022\u2022${esc(item.accountNumber)})` : '';
      const displayName = (resolvedCreditor !== bureau && resolvedCreditor !== 'Unknown') ? esc(resolvedCreditor) + acctLabel : (bureau ? esc(bureau) + acctLabel : 'Unknown');
      if (!groupMap[acctKey]) {
        groupMap[acctKey] = { displayName, bureaus: [] };
        grouped.push(groupMap[acctKey]);
      }
      groupMap[acctKey].bureaus.push({ bureau, status: item.outcome || item.status });
    });

    const groupsHTML = grouped.map(group => {
      const rows = group.bureaus.map(b => {
        const info = outcomeLabels[b.status] || { label: b.status || 'Unknown', cls: 'text-gray-700 bg-gray-100' };
        return `<div class="flex items-center justify-between py-1">
          <span class="text-xs text-slate-600">${esc(b.bureau)}</span>
          <span class="text-xs font-medium px-1.5 py-0.5 rounded ${info.cls}">${info.label}</span>
        </div>`;
      }).join('');
      return `<div class="bg-gray-50 rounded-lg border border-gray-100 px-3 py-2">
        <div class="text-xs font-medium text-slate-800 mb-1">${group.displayName}</div>
        ${rows}
      </div>`;
    }).join('');

    return `<div class="border-t border-gray-200 mt-3 pt-3 space-y-2">
      <div class="text-xs font-semibold text-slate-700">Your Responses</div>
      <div class="space-y-1.5">${groupsHTML}</div>
    </div>`;
  }

  function renderDisputeRounds(rounds, activeRoundRecs) {
    const roundList = document.getElementById('disputeRoundList');
    const emptyEl = document.getElementById('disputeEmpty');
    if (!roundList) return;
    activeRoundRecs = activeRoundRecs || [];

    if (!rounds || !rounds.length) {
      roundList.innerHTML = '';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    const activeRound = [...rounds].reverse().find(r =>
      r.status !== 'resolved' && r.status !== 'completed' && r.status !== 'response_received'
    );
    const activeJobId = activeRound ? activeRound.jobId : null;

    roundList.innerHTML = rounds.map(round => {
      const sentDate = formatDisputeDate(round.sentAt);
      const followUp = formatDisputeDate(round.followUpDate);
      const statusBadge = getDisputeStatusBadge(round.status);
      const roundLetters = round.letters || [];
      const itemCount = (round.items || []).length;
      const letterCount = roundLetters.length;
      const uniqueBureaus = [...new Set(roundLetters.map(l => l.bureau).filter(Boolean))];
      const bureauSummary = uniqueBureaus.length ? uniqueBureaus.map(b => esc(b)).join(', ') : '';

      const isActive = round.status !== 'resolved' && round.status !== 'completed' && round.status !== 'response_received';
      const borderClass = isActive ? 'border-amber-300' : 'border-gray-200';

      const followupSection = (round.jobId === activeJobId) ? buildFollowupHTML(round, activeRoundRecs) : '';
      const responseSummary = !isActive ? buildResponseSummaryHTML(round) : '';

      return `<div class="bg-white rounded-xl shadow-sm border ${borderClass} p-4 space-y-2">
        <div class="flex items-center justify-between gap-2">
          <div>
            <div class="text-sm font-semibold text-slate-800">Round ${round.round || '\u2014'}</div>
            <div class="text-xs text-gray-500">${sentDate ? 'Sent ' + sentDate : 'Pending'}</div>
          </div>
          <div class="flex items-center gap-2">
            ${statusBadge}
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dispute-round-meta">
          ${letterCount > 0 ? `<span>${letterCount} letter${letterCount !== 1 ? 's' : ''} sent${bureauSummary ? ' to ' + bureauSummary : ''}</span>` : ''}
          ${itemCount > 0 ? `<span>${itemCount} item${itemCount !== 1 ? 's' : ''} disputed</span>` : ''}
          ${followUp && !isActive ? `<span>Follow-up: ${followUp}</span>` : ''}
        </div>
        ${followupSection}
        ${responseSummary}
      </div>`;
    }).join('');

    roundList.querySelectorAll('.dispute-submit-btn').forEach(btn => {
      btn.addEventListener('click', handleDisputeSubmit);
    });
  }

  async function handleDisputeSubmit(e) {
    const btn = e.currentTarget;
    const section = btn.closest('.dispute-followup-section');
    if (!section) return;
    const jobId = section.dataset.jobId;
    const statusEl = section.querySelector('.dispute-submit-status');
    if (!jobId || !consumerId) return;

    const itemEls = section.querySelectorAll('.dispute-questionnaire-item');
    const items = [];
    const evidenceFiles = [];
    let unanswered = 0;

    itemEls.forEach(el => {
      const select = el.querySelector('.dispute-outcome-select');
      const notes = el.querySelector('.dispute-notes-input');
      const fileInput = el.querySelector('.dispute-evidence-input');
      if (!select?.value) unanswered++;
      items.push({
        creditor: select?.dataset.creditor || '',
        bureau: select?.dataset.bureau || '',
        outcome: select?.value || 'no_response',
        notes: notes?.value || '',
      });
      if (fileInput?.files?.length) {
        evidenceFiles.push({
          file: fileInput.files[0],
          creditor: select?.dataset.creditor || '',
          bureau: select?.dataset.bureau || '',
        });
      }
    });

    if (unanswered === itemEls.length) {
      if (statusEl) {
        statusEl.classList.remove('hidden');
        statusEl.className = 'dispute-submit-status text-sm text-amber-600';
        statusEl.textContent = 'Please select an outcome for at least one item before submitting.';
      }
      return;
    }
    if (unanswered > 0) {
      if (!confirm(`${unanswered} item${unanswered !== 1 ? 's have' : ' has'} no outcome selected and will be marked as "No Response". Continue?`)) return;
    }

    btn.disabled = true;
    btn.textContent = 'Submitting...';
    if (statusEl) { statusEl.classList.add('hidden'); }

    try {
      const respResp = await fetch(`/api/consumers/${encodeURIComponent(consumerId)}/disputes/${encodeURIComponent(jobId)}/response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!respResp.ok) throw new Error('Failed to submit responses');

      for (const ev of evidenceFiles) {
        const fd = new FormData();
        fd.append('file', ev.file);
        fd.append('creditor', ev.creditor);
        fd.append('bureau', ev.bureau);
        await fetch(`/api/consumers/${encodeURIComponent(consumerId)}/disputes/${encodeURIComponent(jobId)}/evidence`, {
          method: 'POST',
          body: fd,
        });
      }

      if (statusEl) {
        statusEl.textContent = 'Responses submitted successfully!';
        statusEl.className = 'dispute-submit-status text-sm p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200';
        statusEl.classList.remove('hidden');
      }

      await loadDisputes();
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = 'Failed to submit responses. Please try again.';
        statusEl.className = 'dispute-submit-status text-sm p-2 rounded-lg bg-rose-50 text-rose-700 border border-rose-200';
        statusEl.classList.remove('hidden');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit Responses';
    }
  }

  async function loadDisputes() {
    if (!consumerId || disputeLoading) return;
    disputeLoading = true;
    try {
      const resp = await fetch(`/api/consumers/${encodeURIComponent(consumerId)}/disputes`);
      if (!resp.ok) throw new Error('Failed to load disputes');
      const data = await resp.json();
      disputeData = data;
      const rounds = data.rounds || [];

      let activeRoundRecs = [];
      if (rounds.length) {
        const latestWithResponses = [...rounds].reverse().find(r => r.status !== 'awaiting_response' && r.status !== 'awaiting');
        if (latestWithResponses) {
          try {
            const recResp = await fetch(`/api/consumers/${encodeURIComponent(consumerId)}/disputes/${encodeURIComponent(latestWithResponses.jobId)}/recommendation`);
            if (recResp.ok) {
              const recData = await recResp.json();
              activeRoundRecs = recData.recommendations || [];
            }
          } catch {}
        }
      }

      renderDisputeRounds(rounds, activeRoundRecs);
    } catch (err) {
      console.error('Failed to load disputes', err);
      const roundList = document.getElementById('disputeRoundList');
      if (roundList) roundList.innerHTML = '<div class="text-sm text-rose-500">Failed to load dispute data. Please try again.</div>';
    } finally {
      disputeLoading = false;
    }
  }

  document.querySelectorAll('.upload-file-input').forEach(input => {
    if (!consumerId) return;
    input.addEventListener('change', function() {
      if (!this.files.length) return;
      const file = this.files[0];
      const docType = this.getAttribute('data-type') || 'other';
      const card = this.closest('.upload-card');
      const statusEl = document.getElementById('uploadStatus');
      const cardStatus = document.getElementById('status-' + docType);

      if (cardStatus) {
        cardStatus.textContent = 'Uploading...';
        cardStatus.className = 'upload-card-status pending';
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', docType);

      fetch(`/api/consumers/${consumerId}/state/upload`, { method: 'POST', body: formData })
        .then(r => r.json())
        .then(data => {
          if (data.ok) {
            if (cardStatus) {
              cardStatus.textContent = 'Uploaded';
              cardStatus.className = 'upload-card-status uploaded';
            }
            if (card) card.classList.add('has-file');
            if (statusEl) {
              statusEl.textContent = file.name + ' uploaded successfully.';
              statusEl.className = 'text-sm p-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200';
              statusEl.classList.remove('hidden');
              setTimeout(() => statusEl.classList.add('hidden'), 4000);
            }
            loadDocs();
          } else {
            if (cardStatus) {
              cardStatus.textContent = 'Upload Failed';
              cardStatus.className = 'upload-card-status pending';
            }
            if (statusEl) {
              statusEl.textContent = 'Upload failed. Please try again.';
              statusEl.className = 'text-sm p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200';
              statusEl.classList.remove('hidden');
            }
          }
        })
        .catch(() => {
          if (cardStatus) {
            cardStatus.textContent = 'Upload Failed';
            cardStatus.className = 'upload-card-status pending';
          }
          if (statusEl) {
            statusEl.textContent = 'Upload failed. Please try again.';
            statusEl.className = 'text-sm p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200';
            statusEl.classList.remove('hidden');
          }
        });
      this.value = '';
    });
  });

  function getPortalToken() {
    return localStorage.getItem('token') || localStorage.getItem('auth') || '';
  }

  var portalAffLoaded = false;
  var portalAffAvailableBalance = 0;
  var portalAffJoinBound = false;

  function showPortalAffNotJoined() {
    var notJoined = document.getElementById('portalAffNotJoined');
    var dashboard = document.getElementById('portalAffDashboard');
    if (notJoined) notJoined.classList.remove('hidden');
    if (dashboard) dashboard.classList.add('hidden');
  }

  function getPortalConsumerId() {
    var m = location.pathname.match(/\/portal\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : (localStorage.getItem('clientId') || '');
  }

  function loadPortalAffiliate() {
    if (portalAffLoaded) return;
    var token = getPortalToken();
    if (!token) {
      showPortalAffNotJoined();
      return;
    }
    portalAffLoaded = true;
    var hdrs = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
    var portalCid = getPortalConsumerId();
    var cidQuery = portalCid ? '?consumerId=' + encodeURIComponent(portalCid) : '';

    function reloadPortalAff() {
      showPortalAffNotJoined();
      fetch('/api/affiliate/me' + cidQuery, { headers: hdrs })
        .then(function(r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function(data) {
          if (data.ok && data.affiliate) {
            renderPortalAffDashboard(data.affiliate, data.stats);
            loadPortalPayoutHistory();
          } else {
            portalAffLoaded = false;
            showPortalAffNotJoined();
          }
        }).catch(function(err) {
          console.warn('[Portal Affiliate] Failed to load:', err.message || err);
          portalAffLoaded = false;
          showPortalAffNotJoined();
        });
    }

    reloadPortalAff();

    if (!portalAffJoinBound) {
      portalAffJoinBound = true;
      var joinBtn = document.getElementById('portalJoinAffiliate');
      if (joinBtn) {
        joinBtn.addEventListener('click', function() {
          joinBtn.disabled = true;
          joinBtn.textContent = 'Joining...';
          fetch('/api/affiliate/join', { method: 'POST', headers: hdrs, body: JSON.stringify({ consumerId: portalCid }) })
            .then(function(r) {
              if (!r.ok) throw new Error('HTTP ' + r.status);
              return r.json();
            })
            .then(function(data) {
              if (data.ok && data.affiliate) {
                portalAffLoaded = false;
                reloadPortalAff();
              }
            }).catch(function(err) {
              console.warn('[Portal Affiliate] Join failed:', err.message || err);
            }).finally(function() {
              joinBtn.disabled = false;
              joinBtn.textContent = 'Join Affiliate Program';
            });
        });
      }
    }

    var copyBtn = document.getElementById('portalAffCopy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function() {
        var input = document.getElementById('portalAffLink');
        if (input) {
          navigator.clipboard.writeText(input.value).then(function() {
            copyBtn.textContent = 'Copied!';
            setTimeout(function() { copyBtn.textContent = 'Copy'; }, 2000);
          });
        }
      });
    }

    function loadPortalPayoutHistory() {
      fetch('/api/affiliate/payouts' + cidQuery, { headers: hdrs })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var tbody = document.getElementById('portalPayoutTable');
          if (!tbody) return;
          if (data.ok && data.payouts && data.payouts.length > 0) {
            tbody.innerHTML = data.payouts.slice().reverse().map(function(p) {
              var date = new Date(p.requestedAt).toLocaleDateString();
              var statusColors = {
                pending: 'background:rgba(250,204,21,0.15);color:#facc15',
                approved: 'background:rgba(96,165,250,0.15);color:#60a5fa',
                paid: 'background:rgba(74,222,128,0.15);color:#4ade80',
                rejected: 'background:rgba(248,113,113,0.15);color:#f87171',
                cancelled: 'background:rgba(156,163,175,0.15);color:#9ca3af'
              };
              var badgeStyle = statusColors[p.status] || statusColors.cancelled;
              var cancelBtn = p.status === 'pending'
                ? '<button class="portal-btn-cancel-payout text-xs px-2 py-1 rounded" style="background:rgba(248,113,113,0.15);color:#f87171;" data-id="' + p.id + '">Cancel</button>'
                : '';
              return '<tr class="border-b border-white/5"><td class="p-2">' + date + '</td><td class="p-2" style="color:#4ade80">$' + (p.amount || 0).toFixed(2) + '</td><td class="p-2" style="text-transform:capitalize">' + (p.method || '-') + '</td><td class="p-2"><span style="padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;' + badgeStyle + '">' + p.status + '</span></td><td class="p-2">' + cancelBtn + '</td></tr>';
            }).join('');
            tbody.querySelectorAll('.portal-btn-cancel-payout').forEach(function(btn) {
              btn.addEventListener('click', function() {
                var payoutId = btn.getAttribute('data-id');
                fetch('/api/affiliate/payout/' + payoutId + '/cancel' + cidQuery, { method: 'POST', headers: hdrs })
                  .then(function(r) { return r.json(); })
                  .then(function(d) {
                    if (d.ok) {
                      reloadPortalAff();
                    } else {
                      alert(d.error || 'Failed to cancel payout');
                    }
                  }).catch(function() { alert('Failed to cancel payout'); });
              });
            });
          } else {
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">No payout requests yet.</td></tr>';
          }
        }).catch(function() {});
    }

    var portalPayoutModal = document.getElementById('portalPayoutModal');
    var portalPayoutMethodSelect = document.getElementById('portalPayoutMethod');
    var portalPayoutEmailLabel = document.getElementById('portalPayoutEmailLabel');
    var portalPayoutEmailInput = document.getElementById('portalPayoutEmail');
    var portalPayoutEmailGroup = document.getElementById('portalPayoutEmailGroup');
    var portalPayoutError = document.getElementById('portalPayoutError');

    function openPortalPayoutModal() {
      var balEl = document.getElementById('portalPayoutModalBalance');
      if (balEl) balEl.textContent = '$' + portalAffAvailableBalance.toFixed(2);
      if (portalPayoutMethodSelect) portalPayoutMethodSelect.value = 'paypal';
      if (portalPayoutEmailInput) portalPayoutEmailInput.value = '';
      if (portalPayoutError) portalPayoutError.classList.add('hidden');
      updatePortalPayoutMethodLabel();
      if (portalPayoutModal) {
        portalPayoutModal.style.display = 'flex';
        portalPayoutModal.classList.remove('hidden');
      }
    }

    function closePortalPayoutModal() {
      if (portalPayoutModal) {
        portalPayoutModal.style.display = 'none';
        portalPayoutModal.classList.add('hidden');
      }
    }

    function updatePortalPayoutMethodLabel() {
      if (!portalPayoutMethodSelect) return;
      var method = portalPayoutMethodSelect.value;
      if (method === 'paypal') {
        if (portalPayoutEmailLabel) portalPayoutEmailLabel.textContent = 'PayPal Email';
        if (portalPayoutEmailInput) portalPayoutEmailInput.placeholder = 'you@example.com';
      } else if (method === 'venmo') {
        if (portalPayoutEmailLabel) portalPayoutEmailLabel.textContent = 'Venmo Username or Phone';
        if (portalPayoutEmailInput) portalPayoutEmailInput.placeholder = '@username or phone number';
      } else if (method === 'check') {
        if (portalPayoutEmailLabel) portalPayoutEmailLabel.textContent = 'Mailing Address';
        if (portalPayoutEmailInput) portalPayoutEmailInput.placeholder = '123 Main St, City, State ZIP';
      }
      if (portalPayoutEmailGroup) portalPayoutEmailGroup.classList.remove('hidden');
    }

    var reqPayoutBtn = document.getElementById('portalBtnRequestPayout');
    if (reqPayoutBtn) reqPayoutBtn.addEventListener('click', openPortalPayoutModal);
    var closePayoutBtn = document.getElementById('portalPayoutModalClose');
    if (closePayoutBtn) closePayoutBtn.addEventListener('click', closePortalPayoutModal);
    if (portalPayoutModal) {
      portalPayoutModal.addEventListener('click', function(e) { if (e.target === portalPayoutModal) closePortalPayoutModal(); });
    }
    if (portalPayoutMethodSelect) portalPayoutMethodSelect.addEventListener('change', updatePortalPayoutMethodLabel);

    var submitPayoutBtn = document.getElementById('portalPayoutSubmit');
    if (submitPayoutBtn) {
      submitPayoutBtn.addEventListener('click', function() {
        if (portalPayoutError) portalPayoutError.classList.add('hidden');
        var method = portalPayoutMethodSelect ? portalPayoutMethodSelect.value : 'paypal';
        var payoutEmail = portalPayoutEmailInput ? portalPayoutEmailInput.value.trim() : '';
        if (!payoutEmail) {
          if (portalPayoutError) { portalPayoutError.textContent = 'Please enter your payout details.'; portalPayoutError.classList.remove('hidden'); }
          return;
        }
        if (portalAffAvailableBalance <= 0) {
          if (portalPayoutError) { portalPayoutError.textContent = 'No available balance to request a payout.'; portalPayoutError.classList.remove('hidden'); }
          return;
        }
        fetch('/api/affiliate/payout', {
          method: 'POST',
          headers: hdrs,
          body: JSON.stringify({ method: method, payoutEmail: payoutEmail, consumerId: portalCid })
        })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.ok) {
              closePortalPayoutModal();
              reloadPortalAff();
            } else {
              if (portalPayoutError) { portalPayoutError.textContent = data.error || 'Failed to submit payout request.'; portalPayoutError.classList.remove('hidden'); }
            }
          }).catch(function() {
            if (portalPayoutError) { portalPayoutError.textContent = 'Failed to submit payout request.'; portalPayoutError.classList.remove('hidden'); }
          });
      });
    }
  }

  function renderPortalAffDashboard(aff, stats) {
    var notJoined = document.getElementById('portalAffNotJoined');
    var dashboard = document.getElementById('portalAffDashboard');
    if (notJoined) notJoined.classList.add('hidden');
    if (dashboard) dashboard.classList.remove('hidden');

    var link = location.origin + '/api/affiliate/track/' + aff.refCode;
    var linkInput = document.getElementById('portalAffLink');
    if (linkInput) linkInput.value = link;

    var el = function(id) { return document.getElementById(id); };
    if (el('portalStatClicks')) el('portalStatClicks').textContent = stats.clicks || 0;
    if (el('portalStatSignups')) el('portalStatSignups').textContent = stats.conversions || 0;
    if (el('portalStatEarned')) el('portalStatEarned').textContent = '$' + (stats.totalEarned || 0).toFixed(2);
    if (el('portalStatRate')) el('portalStatRate').textContent = (stats.conversionRate || '0.0') + '%';

    var totalEarned = stats.totalEarned || 0;
    var totalPaid = stats.totalPaid || 0;
    var pendingPayouts = stats.pendingPayoutTotal || 0;
    var availableBalance = stats.availableBalance != null ? stats.availableBalance : (totalEarned - totalPaid - pendingPayouts);
    portalAffAvailableBalance = availableBalance;

    if (el('portalEarningsTotalEarned')) el('portalEarningsTotalEarned').textContent = '$' + totalEarned.toFixed(2);
    if (el('portalEarningsPaidOut')) el('portalEarningsPaidOut').textContent = '$' + totalPaid.toFixed(2);
    if (el('portalEarningsPending')) el('portalEarningsPending').textContent = '$' + pendingPayouts.toFixed(2);
    if (el('portalEarningsAvailable')) el('portalEarningsAvailable').textContent = '$' + availableBalance.toFixed(2);

    var tbody = document.getElementById('portalAffTable');
    if (tbody && aff.referrals && aff.referrals.length > 0) {
      tbody.innerHTML = aff.referrals.slice().reverse().map(function(r) {
        var date = new Date(r.date).toLocaleDateString();
        var sc = r.status === 'paid' ? 'color:#4ade80' : 'color:#facc15';
        return '<tr class="border-b border-white/5"><td class="p-2">' + date + '</td><td class="p-2 uppercase font-semibold">' + (r.type || 'diy') + '</td><td class="p-2">' + (r.plan || '-') + '</td><td class="p-2" style="color:#4ade80">$' + (r.earned || 0).toFixed(2) + '</td><td class="p-2" style="' + sc + '">' + (r.status || 'pending') + '</td></tr>';
      }).join('');
    }
  }

});
