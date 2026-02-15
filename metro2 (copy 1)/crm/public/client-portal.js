/* public/client-portal.js */
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
  uploads: { nav: '#navUploads', sections: ['#uploadSection'] },
});

const HASH_TO_PORTAL_MODULE = Object.freeze({
  '#uploads': 'uploads',
  '#messages': 'messages',
  '#educationSection': 'education',
  '#documentSection': 'documents',
  '#mailSection': 'mail',
  '#payments': 'payments',
  '#tradelines': 'tradelines',
  '#negative-items': 'negativeItems',
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
  el.innerHTML = `<span class="text-xl">${tier.icon}</span><span class="font-semibold text-sm">${tier.name}</span>`;
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
      const role = m.role ? `<div class="text-xs muted">${m.role}${m.email? ' - ' + m.email : ''}</div>` : (m.email ? `<div class="text-xs muted">${m.email}</div>` : '');
      return `<div class="news-item"><div class="font-medium">${m.name}</div>${role}</div>`;
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
    });
  }

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
            return;
          }
          const idx = steps.findIndex(s => !completed[s]);
          if (idx === -1) {
            stepEl.textContent = \`Completed • \${steps.length} step\${steps.length === 1 ? '' : 's'}\`;
          } else {
            stepEl.textContent = \`Step \${idx + 1} of \${steps.length}: \${steps[idx]}\`;
          }
        })
        .catch(() => { stepEl.textContent = 'Unknown'; });
    };
    fetchStep();
    setInterval(fetchStep, 30000);
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
        feedEl.innerHTML = items.slice(0,5).map(item => \`
          <div class="news-item"><a href="\${item.link}" target="_blank" class="flex items-center gap-1">\${item.title}<span class="wiggle-arrow">↗</span></a></div>
        \`).join('');
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

  const escape = window.escapeHtml || ((value) => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c] || c)));

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
    stage: \`\${(item?.violations || []).length} issue\${(item?.violations || []).length === 1 ? '' : 's'} • S\${item?.severity || 0}\`,
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
      itemsEl.innerHTML = disputeList.map(t => \`<div class="timeline-item"><span class="font-medium">\${escape(t.account)}</span> - \${escape(t.stage)}</div>\`).join('');
    }
  }

  const summaryEl = document.getElementById('itemsSummary');
  if(summaryEl){
    const perRound = 10;
    const sourceLength = disputeList.length;
    if(sourceLength){
      const rounds = Math.ceil(sourceLength / perRound);
      summaryEl.textContent = \`\${sourceLength} item\${sourceLength === 1 ? '' : 's'} across \${rounds} round\${rounds===1?'':'s'} (\${perRound} per round)\`;
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
      const headline = \`<div class="text-xs muted">Tracking \${total} issue\${total === 1 ? '' : 's'}</div>\`;
      const list = summary.map(item => {
        const bureauText = (item.bureaus || []).length ? item.bureaus.join(', ') : 'Bureaus pending';
        const issues = item.issues || 0;
        return \`<div class="news-item"><div class="font-medium">\${escape(item.creditor)}</div><div class="text-xs muted">S\${item.severity || 0} • \${issues} issue\${issues === 1 ? '' : 's'} • \${escape(bureauText)}</div></div>\`;
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
    else eduEl.innerHTML = edu.map(e => \`<div class="news-item"><div class="font-medium">\${e.account}</div><div>\${e.text}</div></div>\`).join('');
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
      const suffixMatch = str.match(/(\\*{4,}|•{4,}|\\d{4})\\s*$/);
      const suffix = suffixMatch ? suffixMatch[1].replace(/\\*/g, '•') : '••••';
      return \`REDACTED SSN \${suffix}\`;
    }
    if(str.startsWith('••••')) return str;
    if(/\\*{4,}/.test(str)) return str.replace(/\\*/g, '•');
    const clean = str.replace(/[^0-9a-z]/gi, '');
    if(clean.length <= 4) return clean;
    return \`•••• \${clean.slice(-4)}\`;
  }

  function formatCurrency(amount){
    const value = Number(amount) || 0;
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
    } catch {
      return \`$\${value.toFixed(2)}\`;
    }
  }

  function formatTradelineMeta(item){
    const age = item?.age ? item.age : 'Seasoning N/A';
    const limit = Number.isFinite(item?.limit) ? formatCurrency(item.limit) : '';
    return \`\${age}\${limit ? \` • \${limit} limit\` : ''}\`;
  }

  function loadCart(id){
    try {
      const stored = localStorage.getItem(\`tradelineCart:\${id || 'guest'}\`);
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
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
    updateCartSummary();
  }

  function loadMessages() {
    if (!messageList || !consumerId) return;
    fetch(\`/api/messages/\${consumerId}\`)
      .then(r => r.json())
      .then(msgs => {
        if (messageBanner) {
          const hostMsg = msgs.find(m => m.payload?.from === 'host');
          if (hostMsg) {
            const prefix = \`<strong>\${hostMsg.payload?.from}:</strong> \`;
            messageBanner.innerHTML = prefix + (hostMsg.payload?.text || '');
            messageBanner.classList.remove('hidden');
          } else {
            messageBanner.classList.add('hidden');
          }
        }
        if (!msgs.length) {
          messageList.innerHTML = '<div class="muted">No messages.</div>';
        } else {
          messageList.innerHTML = msgs.map(m => {
            const fromUser = m.payload?.from;
            const isClient = fromUser === 'client';
            const cls = isClient ? 'msg-client' : 'msg-host';
            const name = isClient ? 'You' : fromUser || 'Host';
            const when = new Date(m.at).toLocaleString();
            const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', \"'\": '&#39;' }[c] || c));
            return \`<div class="message \${cls}"><div class="text-xs muted">\${name} • \${when}</div><div>\${esc(m.payload?.text || '')}</div></div>\`;
          }).join('');
        }
      })
      .catch(err => {
        console.error('Failed to load messages', err);
        messageList.innerHTML = '<div class="muted">Failed to load messages. <a href="#" id="retryMessages">Retry</a></div>';
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
      fetch(\`/api/messages/\${consumerId}\`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'client', text }) })
        .then(r => r.json())
        .then(() => { input.value = ''; loadMessages(); });
    });
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

    const moduleKey = HASH_TO_PORTAL_MODULE[hash] || 'overview';
    
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
      // loadDocs(); // Placeholder
    } else if (hash === '#mailSection' && mailSection) {
      mailSection.classList.remove('hidden');
      // loadMail(); // Placeholder
    } else if (hash === '#payments' && paymentSection) {
      paymentSection.classList.remove('hidden');
    } else if (hash === '#tradelines' && tradelineSection) {
      tradelineSection.classList.remove('hidden');
    } else if (hash === '#negative-items' && negativeItemsSection) {
      negativeItemsSection.classList.remove('hidden');
      // initNegativeItems(); // Placeholder
    } else if (portalMain) {
      portalMain.classList.remove('hidden');
    }
  }

  const navLinks = document.querySelectorAll('#primaryNav a[href^="#"]');
  navLinks.forEach(link => {
    link.addEventListener('click', event => {
      const targetHash = link.getAttribute('href');
      if (!targetHash) return;
      event.preventDefault();
      if (location.hash !== targetHash) {
        location.hash = targetHash;
      } else {
        showSection(targetHash);
      }
    });
  });
  showSection(location.hash);
  window.addEventListener('hashchange', () => showSection(location.hash));

});
