/* public/common.js */

// Escape HTML entities for safe DOM insertion
export function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

// Consistent currency formatter used across UI modules
export function formatCurrency(val) {
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? '—' : `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Lightweight analytics helper exposed globally
function trackEvent(name, props = {}) {
  if (window.plausible) {
    window.plausible(name, { props });
  } else {
    console.debug('trackEvent', name, props);
  }
}
if (typeof window !== 'undefined') window.trackEvent = trackEvent;


const LANGUAGE_STORAGE_KEY = 'crm_language';
const DEFAULT_LANGUAGE = 'en';

const TRANSLATIONS = {
  en: {
    brand: 'Metro 2 CRM',
    nav: {
      dashboard: 'Dashboard',
      clients: 'Clients',
      leads: 'Leads',
      schedule: 'Schedule',
      billing: 'Billing',
      marketing: 'Marketing',
      settings: 'Settings',
      myCompany: 'My Company',
      letters: 'Letter',
      library: 'Library',
      workflows: 'Workflows',
      tradelines: 'Tradelines'
    },
    buttons: {
      menu: 'Menu',
      help: 'Help',
      helpTip: 'Help (H)',
      invite: 'Add Team Member',
      invitePlus: 'Invite +',
      addTeamMember: 'Add Team Member',
      logout: 'Logout'
    },
    prompts: {
      teammateEmail: 'Teammate email?',
      teammateName: 'Teammate name?',
      inviteFailed: 'Failed to invite member'
    },
    badges: {
      tooltip: "You've started your journey."
    },
    marketing: {
      hero: {
        title: 'Marketing Launchpad',
        subtitle: 'Plan premium credit-repair journeys, nurture leads, and prep conversion-focused automations before you wire them into Twilio, SendGrid, or any integration.',
        tip: 'Tip: Document every touchpoint to stay compliant, boost trust, and prime upsells. Once the backend hooks are live, these tiles can push payloads directly to your automation queue.'
      },
      smsBuilder: {
        heading: 'SMS Campaign Builder',
        description: 'Craft compliant outreach, personalize with merge fields, and preview the mobile experience before launch.',
        kpi: 'Suggested KPI: Reply Rate',
        upsell: 'Upsell: SMS Concierge Follow-up',
        experiment: 'A/B Test: “Book Call” vs “Discover your plan”',
        campaignName: 'Campaign Name',
        campaignPlaceholder: 'Fall Promo Launch',
        recipientLabel: 'Recipient Group',
        recipients: {
          leads: 'All Leads',
          newClients: 'New Clients (≤30 days)',
          inactive: 'Inactive Accounts (90+ days)',
          truckers: 'Owner-Operators and Truckers'
        },
        messageLabel: 'Message',
        messagePlaceholder: 'Hi {{first_name}}, we spotted a dispute update ready for review. Tap to confirm your next step.',
        insertMerge: 'Insert Merge Field',
        personalize: '+ Personalize',
        characterLabel: 'Character Count:',
        guardrails: 'Guardrails: opt-out copy auto-appended, rate-limited when live.',
        previewButton: 'Preview SMS',
        sendTestButton: 'Send Test'
      }
    },
    tiers: {
      names: {
        creditLegend: 'Credit Legend',
        creditHero: 'Credit Hero',
        creditChampion: 'Credit Champion',
        creditWarrior: 'Credit Warrior',
        creditSurgeon: 'Credit Surgeon',
        disputeMaster: 'Dispute Master',
        debtSlayer: 'Debt Slayer',
        reportScrubber: 'Report Scrubber',
        scoreShifter: 'Score Shifter',
        creditCleaner: 'Credit Cleaner',
        balanceBuster: 'Balance Buster',
        debtDuster: 'Debt Duster',
        rookie: 'Rookie'
      },
      messages: {
        creditLegend: 'The ultimate, rare achievement.',
        creditHero: 'You’re now the hero of your credit story.',
        creditChampion: 'Championing your credit victory.',
        creditWarrior: 'Battle-ready credit repair fighter.',
        creditSurgeon: 'Precision deletions.',
        disputeMaster: 'Mastering the dispute process.',
        debtSlayer: 'Slaying negative accounts.',
        reportScrubber: 'Deep cleaning your credit.',
        scoreShifter: 'Scores are improving.',
        creditCleaner: 'Your report is shining.',
        balanceBuster: 'Breaking negative balances.',
        debtDuster: 'Cleaning up the dust.',
        rookie: 'You’ve started your journey.'
      }
    }
  }
};

function getStoredLanguage() {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && TRANSLATIONS[stored]) return stored;
  } catch (err) {
    console.debug('language storage read failed', err);
  }
  return DEFAULT_LANGUAGE;
}

export function getTranslation(key, lang = currentLanguage) {
  if (!key) return '';
  const dictionary = TRANSLATIONS[lang] || TRANSLATIONS[DEFAULT_LANGUAGE];
  return key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), dictionary) ?? '';
}

let currentLanguage = typeof window === 'undefined' ? DEFAULT_LANGUAGE : getStoredLanguage();
if (typeof document !== 'undefined') {
  document.documentElement?.setAttribute('lang', currentLanguage);
}

function updateInviteButtonCopy(btn, variant, lang = currentLanguage) {
  if (!btn) return;
  const key = variant === 'invite_plus' ? 'buttons.invitePlus' : 'buttons.addTeamMember';
  const label = getTranslation(key, lang) || getTranslation('buttons.invite', lang);
  if (label) btn.textContent = label;
}


function applyDataI18n(lang = currentLanguage) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    const value = getTranslation(key, lang);
    if (!value) return;
    el.textContent = value;
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.dataset.i18nHtml;
    const value = getTranslation(key, lang);
    if (!value) return;
    el.innerHTML = value;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    const value = getTranslation(key, lang);
    if (!value) return;
    if ('placeholder' in el) {
      el.placeholder = value;
    }
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.dataset.i18nTitle;
    const value = getTranslation(key, lang);
    if (!value) return;
    el.title = value;
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = el.dataset.i18nAriaLabel;
    const value = getTranslation(key, lang);
    if (!value) return;
    el.setAttribute('aria-label', value);
  });
}

export function applyLanguage(lang = currentLanguage) {
  const target = TRANSLATIONS[lang] ? lang : DEFAULT_LANGUAGE;
  currentLanguage = target;

  if (typeof document !== 'undefined') {
    document.documentElement?.setAttribute('lang', target);
  }

  const mapping = [
    ['.nav-brand-row .text-xl', 'brand'],
    ['a[href="/dashboard"]', 'nav.dashboard'],
    ['a[href="/clients"]', 'nav.clients'],
    ['a[href="/leads"]', 'nav.leads'],
    ['a[href="/schedule"]', 'nav.schedule'],
    ['a[href="/billing"]', 'nav.billing'],
    ['a[href="/marketing"]', 'nav.marketing'],
    ['a[href="/tradelines"]', 'nav.tradelines'],
    ['#navCompany', 'nav.myCompany'],
    ['#navSettingsMenu a[href="/letters"]', 'nav.letters'],
    ['#navSettingsMenu a[href="/library"]', 'nav.library'],
    ['#navSettingsMenu a[href="/workflows"]', 'nav.workflows']
  ];
  if (typeof document !== 'undefined') {
    mapping.forEach(([selector, key]) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const value = getTranslation(key, target);
      if (value) el.textContent = value;
    });
  }

  if (typeof document !== 'undefined') {
    const navToggle = document.getElementById('navToggle');
    const menuLabel = getTranslation('buttons.menu', target);
    if (navToggle && menuLabel) {
      navToggle.setAttribute('aria-label', menuLabel);
      const span = navToggle.querySelector('span');
      if (span) span.textContent = menuLabel;
    }

    const settingsToggleLabel = document.querySelector('#navSettingsToggle span');
    const settingsLabel = getTranslation('nav.settings', target);
    if (settingsToggleLabel && settingsLabel) settingsToggleLabel.textContent = settingsLabel;
    const settingsToggle = document.getElementById('navSettingsToggle');
    if (settingsToggle && settingsLabel) settingsToggle.setAttribute('aria-label', settingsLabel);

    const helpButton = document.getElementById('btnHelp');
    if (helpButton) {
      const helpLabel = getTranslation('buttons.help', target);
      if (helpLabel) helpButton.textContent = helpLabel;
      const tip = getTranslation('buttons.helpTip', target);
      if (tip) helpButton.setAttribute('data-tip', tip);
    }

    const inviteButton = document.getElementById('btnInvite');
    if (inviteButton) {
      const variant = inviteButton.dataset.ctaVariant || localStorage.getItem('cta_variant') || 'add_team_member';
      updateInviteButtonCopy(inviteButton, variant, target);
    }

    const logoutButton = document.getElementById('btnLogout');
    if (logoutButton) {
      const logoutLabel = getTranslation('buttons.logout', target);
      if (logoutLabel) logoutButton.textContent = logoutLabel;
    }

    const tierBadge = document.getElementById('tierBadge');
    if (tierBadge) {
      const tooltip = getTranslation('tiers.messages.rookie', target) || getTranslation('badges.tooltip', target);
      if (tooltip) tierBadge.title = tooltip;
    }
  }

  applyDataI18n(target);
  if (typeof renderDeletionTier === 'function') {
    renderDeletionTier();
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('crm:language-change', { detail: { language: target } }));
  }
}

export function setLanguage(lang) {
  const target = TRANSLATIONS[lang] ? lang : DEFAULT_LANGUAGE;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, target);
  } catch (err) {
    console.debug('language storage write failed', err);
  }
  applyLanguage(target);
}

export function getCurrentLanguage() {
  return currentLanguage;
}


function initResponsiveNav() {
  const nav = document.getElementById('primaryNav');
  const toggle = document.getElementById('navToggle');
  const settings = document.getElementById('navSettings');
  const settingsToggle = document.getElementById('navSettingsToggle');

  if (!nav || !toggle) return;

  const syncToggleState = () => {
    const expanded = nav.classList.contains('hidden') ? 'false' : 'true';
    toggle.setAttribute('aria-expanded', expanded);
  };

  const closeSettings = () => {
    if (settings) settings.classList.remove('open');
    settingsToggle?.setAttribute('aria-expanded', 'false');
  };

  const updateLayout = () => {
    const navRoleHidden = nav.dataset.roleHidden === 'true';
    const toggleRoleHidden = toggle.dataset.roleHidden === 'true';
    const isDesktop = window.innerWidth >= 768;

    if (isDesktop) {
      toggle.classList.add('hidden');

      if (navRoleHidden) {
        nav.classList.add('hidden');
      } else {
        nav.classList.remove('hidden');
      }

      syncToggleState();
      return;
    }

    toggle.classList.toggle('hidden', toggleRoleHidden);

    if (navRoleHidden) {
      nav.classList.add('hidden');
      syncToggleState();
      return;
    }

    const hidden = nav.classList.contains('hidden');
    toggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
  };

  toggle.addEventListener('click', () => {
    const nowHidden = nav.classList.toggle('hidden');
    toggle.setAttribute('aria-expanded', nowHidden ? 'false' : 'true');
    if (nowHidden) closeSettings();
    syncToggleState();
  });

  settingsToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = settings?.classList.toggle('open');
    settingsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    if (!settings) return;
    if (!settings.contains(e.target)) {
      closeSettings();
    }
  });

  window.addEventListener('resize', updateLayout);
  updateLayout();
  syncToggleState();
}

async function fallbackInviteFlow(sourceId){
  const emailPrompt = getTranslation('prompts.teammateEmail') || 'Teammate email?';
  const email = prompt(emailPrompt);
  if (!email) return;
  const namePrompt = getTranslation('prompts.teammateName') || 'Teammate name?';
  const name = prompt(namePrompt);
  if (!name) return;
  try {
    const member = await createTeamMember({ name, email });
    alert(`Token: ${member.token}\nTemp Password: ${member.password}`);
  } catch (err) {
    console.error('Failed to invite member', err);
    alert(getTranslation('prompts.inviteFailed') || 'Failed to invite member');
  }
}

function attachInviteHandlers(){
  const triggers = new Set();
  const navTrigger = document.getElementById('btnInvite');
  if(navTrigger) triggers.add(navTrigger);
  document.querySelectorAll('[data-action="invite-team"]').forEach(btn => triggers.add(btn));
  triggers.forEach(btn => {
    if(btn.dataset.inviteBound) return;
    btn.dataset.inviteBound = 'true';
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      const event = new CustomEvent('team-invite:open', {
        cancelable: true,
        detail: { source: btn.id || btn.dataset.action || 'unknown' }
      });
      const dispatched = document.dispatchEvent(event);
      if (dispatched) {
        fallbackInviteFlow(btn.id || btn.dataset.action || 'unknown');
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initResponsiveNav();
  trackEvent('page_view', { path: location.pathname });
  initAbTest();
  applyLanguage(currentLanguage);
  attachInviteHandlers();
  applyRoleNav(window.userRole);
});

function initAbTest() {
  const btn = document.getElementById('btnInvite');
  if (!btn) return;
  let variant = localStorage.getItem('cta_variant');
  if (!variant) {
    variant = Math.random() < 0.5 ? 'invite_plus' : 'add_team_member';
    localStorage.setItem('cta_variant', variant);
  }
  btn.dataset.ctaVariant = variant;
  updateInviteButtonCopy(btn, variant);
  trackEvent('ab_exposure', { experiment: 'cta_copy', variant });
}

// Allow ?auth=BASE64 or ?token=JWT links to set local auth state
// (runs early so tokens in query strings are captured immediately)
//
const params = new URLSearchParams(location.search);
const _authParam = params.get('auth');
if (_authParam) {
  localStorage.setItem('auth', _authParam);
}
const _tokenParam = params.get('token');
if (_tokenParam) {
  localStorage.setItem('token', _tokenParam);
}

// redirect to login if not authenticated
if (location.pathname !== '/' && location.pathname !== '/login.html') {
  const hasAuth = localStorage.getItem('token') || localStorage.getItem('auth');
  if (!hasAuth) location.href = '/login.html';
}

function parseJwt(t){
  try{
    return JSON.parse(atob(t.split('.')[1]));
  }catch{return {};}
}

const _tok = localStorage.getItem('token');
const _payload = _tok ? parseJwt(_tok) : {};
window.userRole = _payload.role || null;

function restrictRoutes(role){
  const allowed = {
    host: null,
    team: ['/dashboard','/clients','/leads','/marketing','/schedule','/billing','/','/index.html','/login.html','/team-member-template.html'],
    client: ['/client-portal','/portal','/login.html','/']
  }[role];
  if(!allowed) return;
  const path = location.pathname;
  const ok = allowed.some(p=> path.startsWith(p));
  if(!ok){
    location.href = role === 'client' ? '/client-portal-template.html' : '/dashboard';
  }
}
restrictRoutes(window.userRole);

// append a logout button to the nav if present
const navContainer = document.getElementById('primaryNavLinks');
if (navContainer) {
  if (!navContainer.querySelector('a[href="/marketing"]')) {
    const marketingLink = document.createElement('a');
    marketingLink.href = '/marketing';
    marketingLink.className = 'btn nav-btn';
    marketingLink.textContent = getTranslation('nav.marketing');
    const scheduleLink = navContainer.querySelector('a[href="/schedule"]');
    if (scheduleLink?.parentElement === navContainer) {
      navContainer.insertBefore(marketingLink, scheduleLink);
    } else {
      const leadsLink = navContainer.querySelector('a[href="/leads"]');
      leadsLink?.insertAdjacentElement('afterend', marketingLink);
      if (!leadsLink) navContainer.appendChild(marketingLink);
    }
  }
  const btnLogout = document.createElement('button');
  btnLogout.id = 'btnLogout';
  btnLogout.className = 'btn nav-btn';
  btnLogout.textContent = getTranslation('buttons.logout');
  btnLogout.addEventListener('click', () => {
    // clear all locally stored state when logging out to avoid
    // carrying data between different user sessions
    localStorage.clear();

    location.href = '/login.html';
  });
  navContainer.appendChild(btnLogout);
}

function applyRoleNav(role){
  const nav = document.getElementById('primaryNav');
  const navLinks = document.getElementById('primaryNavLinks');
  const toggle = document.getElementById('navToggle');
  if(!nav || !navLinks) return;
  if(nav.dataset.roleHidden === 'true'){
    nav.classList.remove('hidden');
  }
  nav.style.removeProperty('display');
  nav.removeAttribute('aria-hidden');
  delete nav.dataset.roleHidden;
  if(toggle){
    if(toggle.dataset.roleHidden === 'true'){
      toggle.classList.remove('hidden');
    }
    toggle.style.removeProperty('display');
    toggle.removeAttribute('aria-hidden');
    delete toggle.dataset.roleHidden;
  }
  if(role === 'client'){
    nav.dataset.roleHidden = 'true';
    nav.classList.add('hidden');
    nav.setAttribute('aria-hidden','true');
    if(toggle){
      toggle.dataset.roleHidden = 'true';
      toggle.classList.add('hidden');
      toggle.setAttribute('aria-hidden','true');
      toggle.setAttribute('aria-expanded','false');
    }
    return;
  }
  if(role === 'team'){
    const allowed = new Set(['/dashboard','/clients','/leads','/marketing','/schedule','/billing']);
    navLinks.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if(href && !allowed.has(href)){
        link.remove();
      }
    });
    ['btnInvite','btnHelp','tierBadge'].forEach(id => {
      const el = navLinks.querySelector(`#${id}`);
      if(el) el.remove();
    });
  }
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

const THEME_LABELS = {
  blue: 'Trust Blue / Azul confianza',
  green: 'Momentum Green / Verde impulso',
  orange: 'Warm Orange / Naranja cálida',
  red: 'Alert Red / Rojo alerta',
  purple: 'Royal Purple / Morado real',
  teal: 'Signal Teal / Verde señal',
  pink: 'Hero Pink / Rosa heroína',
  spacegray: 'Space Gray / Gris espacial',
  metallicgrey: 'Titanium Grey / Gris titanio',
  glass: 'Glass Neutral / Neutro cristal'
};

function highlightActiveTheme(name) {
  const palette = document.getElementById('themePalette');
  if (!palette) return;
  const bubbles = palette.querySelectorAll('.bubble');
  bubbles.forEach(bubble => {
    const isActive = bubble.dataset.theme === name;
    bubble.classList.toggle('active', isActive);
    const baseLabel = bubble.dataset.label || bubble.dataset.theme;
    bubble.setAttribute('aria-pressed', String(isActive));
    bubble.setAttribute('aria-label', isActive ? `${baseLabel} (selected)` : baseLabel);
  });
}

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
  highlightActiveTheme(name);

  const slider = document.getElementById('glassAlpha');
  const match = t.glassBg.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/);
  const themeAlpha = match ? parseFloat(match[1]) : 0.15;
  const savedAlpha = parseFloat(localStorage.getItem('glassAlpha'));
  const alpha = isNaN(savedAlpha) ? themeAlpha : savedAlpha;
  if (slider) slider.value = alpha;
  setGlassAlpha(alpha);
}

function setGlassAlpha(alpha){
  const root = document.documentElement;
  const bg = getComputedStyle(root).getPropertyValue('--glass-bg').trim();
  const brd = getComputedStyle(root).getPropertyValue('--glass-brd').trim();
  const bgMatch = bg.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);
  const brdMatch = brd.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);
  if(!bgMatch || !brdMatch) return;
  const ratio = parseFloat(brdMatch[4]) / parseFloat(bgMatch[4] || 1);
  root.style.setProperty('--glass-bg', `rgba(${bgMatch[1]},${bgMatch[2]},${bgMatch[3]},${alpha})`);
  root.style.setProperty('--glass-brd', `rgba(${brdMatch[1]},${brdMatch[2]},${brdMatch[3]},${alpha * ratio})`);
}

function initPalette(){
  if(document.getElementById('themePalette')) return;
  const wrap = document.createElement('div');
  wrap.id = 'themePalette';
  wrap.className = 'palette collapsed';
  const bubbles = Object.entries(THEMES)
    .map(([name, t]) => {
      const label = (THEME_LABELS[name] || name.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ')).replace(/^./, c => c.toUpperCase());
      return `<div class="bubble" role="button" tabindex="0" aria-pressed="false" data-theme="${name}" data-label="${label}" aria-label="${label}" style="background:${t.accent}"></div>`;
    })
    .join('');
  wrap.innerHTML = `
    <button class="toggle" type="button" aria-expanded="false">
      <span class="toggle-icon" aria-hidden="true">🎨</span>
      <span class="toggle-label">Theme</span>
    </button>
    <div class="palette-controls" aria-hidden="true">
      <label class="palette-field">
        <span class="palette-field-label">Glass opacity / Opacidad</span>
        <input id="glassAlpha" class="alpha-slider" type="range" min="0" max="0.5" step="0.05" />
      </label>
      <div class="palette-bubbles">${bubbles}</div>
    </div>
    <button id="voiceMic" class="mic" type="button" aria-label="Toggle voice notes">🎤</button>`;
  document.body.appendChild(wrap);
  const toggle = wrap.querySelector('.toggle');
  const controls = wrap.querySelector('.palette-controls');
  const mic = wrap.querySelector('#voiceMic');
  const icon = toggle.querySelector('.toggle-icon');
  const label = toggle.querySelector('.toggle-label');
  const syncState = () => {
    const isCollapsed = wrap.classList.contains('collapsed');
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
    controls?.setAttribute('aria-hidden', String(isCollapsed));
    if (mic) {
      mic.setAttribute('aria-hidden', String(isCollapsed));
      mic.tabIndex = isCollapsed ? -1 : 0;
    }
    if (label) label.textContent = isCollapsed ? 'Theme' : 'Hide';
    if (icon) icon.textContent = isCollapsed ? '🎨' : '✕';
  };
  toggle.addEventListener('click', ()=>{
    wrap.classList.toggle('collapsed');
    syncState();
  });
  syncState();
  wrap.addEventListener('click', (e)=>{
    const b = e.target.closest('.bubble');
    if(!b) return;
    applyTheme(b.dataset.theme);
  });
  wrap.addEventListener('keydown', (e) => {
    if (!['Enter', ' '].includes(e.key)) return;
    const b = e.target.closest('.bubble');
    if (!b) return;
    e.preventDefault();
    applyTheme(b.dataset.theme);
  });
  const saved = localStorage.getItem('theme') || 'purple';
  applyTheme(saved);
  const slider = wrap.querySelector('#glassAlpha');
  if(slider){
    slider.addEventListener('input', e=>{
      const v = parseFloat(e.target.value);
      setGlassAlpha(v);
      localStorage.setItem('glassAlpha', v);
    });
  }
}

export function authHeader(){
  const token = localStorage.getItem('token');
  if(token) return { Authorization: 'Bearer '+token };
  const auth = localStorage.getItem('auth');
  if(auth) return { Authorization: 'Basic '+auth };
  return {};
}

export async function api(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...authHeader(),
    ...(options.headers || {})
  };
  try {
    const res = await fetch(url, { ...options, headers });
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        return { status: res.status, ...parsed };
      }
      return { status: res.status, data: parsed };
    } catch {
      return { status: res.status, ok: res.ok, data: text };
    }
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
}

export async function createTeamMember({ name = '', email = '', password = '' } = {}) {
  const payload = { username: email, name };
  if (password) payload.password = password;
  const res = await api('/api/team-members', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (!res.ok || !res.member) {
    throw new Error(res.error || 'Failed to create team member');
  }
  const entry = {
    id: res.member.id,
    name: res.member.name || name || res.member.email || email,
    email: res.member.email || email,
    role: 'team',
    createdAt: res.member.createdAt || null,
    lastLoginAt: res.member.lastLoginAt || null
  };
  const team = JSON.parse(localStorage.getItem('teamMembers') || '[]')
    .filter(m => m.id !== entry.id && m.email !== entry.email);
  team.push(entry);
  localStorage.setItem('teamMembers', JSON.stringify(team));
  return res.member;
}

async function limitNavForMembers(){
  const headers = authHeader();
  if(Object.keys(headers).length === 0) return;
  try{
    const res = await fetch('/api/me',{ headers });
    if(!res.ok) return;
    const data = await res.json();
    const role = (data.user?.role || '').toLowerCase();
    if(!role.includes('member')) return;
    const nav = document.getElementById('primaryNavLinks');
    if(!nav) return;
    const allowed = new Set(['/dashboard','/schedule','/leads','/marketing','/billing','/clients']);
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
  { threshold: 150, key: 'creditLegend', name: 'Credit Legend', icon: '👑', class: 'bg-gradient-to-r from-purple-400 to-pink-500 text-white', message: 'The ultimate, rare achievement.' },
  { threshold: 125, key: 'creditHero', name: 'Credit Hero', icon: '🦸', class: 'bg-red-100 text-red-700', message: 'You’re now the hero of your credit story.' },
  { threshold: 100, key: 'creditChampion', name: 'Credit Champion', icon: '🏆', class: 'bg-yellow-200 text-yellow-800', message: 'Championing your credit victory.' },
  { threshold: 75, key: 'creditWarrior', name: 'Credit Warrior', icon: '🛡️', class: 'bg-indigo-100 text-indigo-700', message: 'Battle-ready credit repair fighter.' },
  { threshold: 60, key: 'creditSurgeon', name: 'Credit Surgeon', icon: '🩺', class: 'bg-cyan-100 text-cyan-700', message: 'Precision deletions.' },
  { threshold: 50, key: 'disputeMaster', name: 'Dispute Master', icon: '🥋', class: 'bg-purple-100 text-purple-700', message: 'Mastering the dispute process.' },
  { threshold: 40, key: 'debtSlayer', name: 'Debt Slayer', icon: '⚔️', class: 'bg-gray-100 text-gray-700', message: 'Slaying negative accounts.' },
  { threshold: 30, key: 'reportScrubber', name: 'Report Scrubber', icon: '🧼', class: 'bg-accent-subtle', message: 'Deep cleaning your credit.' },
  { threshold: 20, key: 'scoreShifter', name: 'Score Shifter', icon: '📊', class: 'bg-green-100 text-green-700', message: 'Scores are improving.' },
  { threshold: 15, key: 'creditCleaner', name: 'Credit Cleaner', icon: '🧽', class: 'bg-yellow-100 text-yellow-700', message: 'Your report is shining.' },
  { threshold: 10, key: 'balanceBuster', name: 'Balance Buster', icon: '💥', class: 'bg-orange-100 text-orange-700', message: 'Breaking negative balances.' },
  { threshold: 5, key: 'debtDuster', name: 'Debt Duster', icon: '🧹', class: 'bg-emerald-100 text-emerald-700', message: 'Cleaning up the dust.' },
  { threshold: 0, key: 'rookie', name: 'Rookie', icon: '📄', class: 'bg-emerald-100 text-emerald-700', message: 'You’ve started your journey.' },
];

function getDeletionTier(count){
  for(const tier of deletionTiers){
    if(count >= tier.threshold) return tier;
  }
  return deletionTiers[deletionTiers.length-1];
}

function ensureTierBadge(){
  if(document.getElementById('tierBadge')) return;
  const nav = document.getElementById('primaryNavLinks');
  if(!nav) return;
  const div = document.createElement('div');
  div.id = 'tierBadge';
  div.className = 'hidden sm:flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-emerald-700 shadow-sm animate-fadeInUp';
  const tooltip = getTranslation('tiers.messages.rookie') || getTranslation('badges.tooltip') || "You've started your journey.";
  const label = getTranslation('tiers.names.rookie') || 'Rookie';
  div.title = tooltip;
  div.innerHTML = `<span class="text-xl">📄</span><span class="font-semibold text-sm">${label}</span>`;
  nav.appendChild(div);
}

function renderDeletionTier(){
  const el = document.getElementById('tierBadge');
  if(!el) return;
  const deletions = Number(localStorage.getItem('deletions') || 0);
  const tier = getDeletionTier(deletions);
  const label = getTranslation(`tiers.names.${tier.key}`) || tier.name;
  const message = getTranslation(`tiers.messages.${tier.key}`) || tier.message;
  el.className = `hidden sm:flex items-center gap-2 rounded-full px-4 py-2 shadow-sm animate-fadeInUp ${tier.class}`;
  el.innerHTML = `<span class="text-xl">${tier.icon}</span><span class="font-semibold text-sm">${label}</span>`;
  el.title = message;
}

function ensureHelpModal(){
  if(document.getElementById('helpModal')) return;
  const div = document.createElement('div');
  div.id = 'helpModal';
  div.className = 'fixed inset-0 hidden items-center justify-center bg-[rgba(0,0,0,.45)] z-50';
  div.innerHTML = `
    <div class="glass card w-[min(760px,94vw)]">
      <div class="flex items-center justify-between mb-2">
        <div class="font-semibold">Hotkeys & Coach</div>
        <button id="helpClose" class="btn">×</button>
      </div>
      <div class="text-sm space-y-3">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div class="glass card p-3">
            <div class="font-medium mb-1">Global</div>
            <ul class="list-disc list-inside space-y-1">
              <li><b>N</b> – New consumer</li>
              <li><b>U</b> – Upload HTML</li>
              <li><b>E</b> – Edit consumer</li>
              <li><b>G</b> – Generate letters</li>
              <li><b>C</b> – Clear (context-aware)</li>
              <li><b>H</b> – Help overlay</li>
              <li><b>R</b> – Remove focused tradeline card</li>
            </ul>
          </div>
          <div class="glass card p-3">
            <div class="font-medium mb-1">Modes and Cards</div>
            <ul class="list-disc list-inside space-y-1">
              <li>Modes: <b>I</b>=Identity Theft, <b>D</b>=Data Breach, <b>S</b>=Sexual Assault</li>
              <li>Click a card to zoom; press <b>A</b> to toggle all bureaus on that card.</li>
              <li>Press <b>Esc</b> to exit a mode.</li>
            </ul>
          </div>
          <div class="glass card p-3 space-y-2" id="helpTourCard">
            <div class="font-medium">Guided Walkthrough</div>
            <p class="text-xs text-slate-600">Follow a 4-step tour that highlights revenue-focused workflows.</p>
            <div class="flex flex-wrap gap-2">
              <button id="helpTourButton" type="button" class="btn text-xs" data-mode="start">Start Walkthrough</button>
              <button id="helpTourReset" type="button" class="btn text-xs bg-slate-100 text-slate-700 hidden">Reset Progress</button>
            </div>
            <p id="helpTourStatus" class="text-[11px] font-medium text-emerald-600 hidden">Tour completed — celebrate your win!</p>
          </div>
          <div class="glass card p-3 space-y-2">
            <div class="font-medium">Chat Coach</div>
            <p class="text-xs text-slate-600">Ask playbook questions or request sales scripts.</p>
            <button id="helpChatButton" type="button" class="btn text-xs">Open Chat Coach</button>
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
  const tourButton = document.getElementById('helpTourButton');
  if(tourButton && !tourButton.dataset.bound){
    tourButton.addEventListener('click', ()=>{
      const mode = tourButton.dataset.mode || 'start';
      closeHelp();
      window.dispatchEvent(new CustomEvent('crm:tutorial-request', { detail: { mode } }));
    });
    tourButton.dataset.bound = 'true';
  }
  const resetButton = document.getElementById('helpTourReset');
  if(resetButton && !resetButton.dataset.bound){
    resetButton.addEventListener('click', ()=>{
      closeHelp();
      window.dispatchEvent(new CustomEvent('crm:tutorial-reset'));
    });
    resetButton.dataset.bound = 'true';
  }
  const chatButton = document.getElementById('helpChatButton');
  if(chatButton && !chatButton.dataset.bound){
    chatButton.addEventListener('click', ()=>{
      closeHelp();
      window.dispatchEvent(new CustomEvent('crm:assistant-request', { detail: { source: 'help' } }));
    });
    chatButton.dataset.bound = 'true';
  }
}

window.setHelpGuideState = function(state = {}){
  ensureHelpModal();
  const tourButton = document.getElementById('helpTourButton');
  const resetButton = document.getElementById('helpTourReset');
  const status = document.getElementById('helpTourStatus');
  const mode = state.mode || 'start';
  if(tourButton){
    tourButton.dataset.mode = mode;
    let label;
    if(mode === 'resume') label = 'Resume Walkthrough';
    else if(mode === 'replay') label = 'Replay Walkthrough';
    else label = 'Start Walkthrough';
    tourButton.textContent = label;
  }
  if(resetButton){
    const showReset = mode === 'resume' || state.completed;
    resetButton.classList.toggle('hidden', !showReset);
  }
  if(status){
    status.classList.toggle('hidden', !state.completed);
  }
};

window.selectedConsumerId = localStorage.getItem('selectedConsumerId') || null;

document.addEventListener('DOMContentLoaded', ()=>{
  ensureHelpModal();
  bindHelp();
  initPalette();
  initVoiceNotes();
  ensureTierBadge();
  renderDeletionTier();
  // limitNavForMembers(); // disabled during host/team nav debugging
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

if (typeof window !== 'undefined') {
  Object.assign(window, { escapeHtml, formatCurrency, trackEvent, authHeader, api, setLanguage, getCurrentLanguage, applyLanguage, getTranslation });
}
