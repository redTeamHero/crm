const BUTTERFLY_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(50,50)">
    <g class="tour-butterfly__wing-l" transform="translate(-2,0)">
      <path d="M-5,-5 C-25,-35 -50,-30 -45,-10 C-42,2 -25,8 -5,2 Z" fill="#d4a853" opacity="0.9"/>
      <path d="M-5,5 C-25,30 -45,28 -40,12 C-37,2 -22,-2 -5,2 Z" fill="#c49a45" opacity="0.85"/>
      <path d="M-8,-3 C-18,-22 -35,-20 -32,-8 Z" fill="#e8c875" opacity="0.4"/>
      <path d="M-8,5 C-18,20 -32,18 -28,8 Z" fill="#e8c875" opacity="0.3"/>
    </g>
    <g class="tour-butterfly__wing-r" transform="translate(2,0)">
      <path d="M5,-5 C25,-35 50,-30 45,-10 C42,2 25,8 5,2 Z" fill="#d4a853" opacity="0.9"/>
      <path d="M5,5 C25,30 45,28 40,12 C37,2 22,-2 5,2 Z" fill="#c49a45" opacity="0.85"/>
      <path d="M8,-3 C18,-22 35,-20 32,-8 Z" fill="#e8c875" opacity="0.4"/>
      <path d="M8,5 C18,20 32,18 28,8 Z" fill="#e8c875" opacity="0.3"/>
    </g>
    <ellipse cx="0" cy="0" rx="3.5" ry="12" fill="#1a1a1a"/>
    <circle cx="-1.5" cy="-8" r="1.8" fill="#d4a853"/>
    <circle cx="1.5" cy="-8" r="1.8" fill="#d4a853"/>
    <line x1="-2" y1="-12" x2="-6" y2="-20" stroke="#d4a853" stroke-width="0.8" stroke-linecap="round"/>
    <line x1="2" y1="-12" x2="6" y2="-20" stroke="#d4a853" stroke-width="0.8" stroke-linecap="round"/>
    <circle cx="-6" cy="-21" r="1.2" fill="#d4a853"/>
    <circle cx="6" cy="-21" r="1.2" fill="#d4a853"/>
  </g>
</svg>`;

const TOUR_STORAGE_KEY = 'evolv.tours';

function getTourState() {
  try { return JSON.parse(localStorage.getItem(TOUR_STORAGE_KEY)) || {}; } catch { return {}; }
}
function saveTourState(state) {
  localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
}

const PAGE_TOURS = {
  dashboard: {
    label: 'Dashboard',
    icon: '📊',
    desc: 'Your command center overview',
    steps: [
      { target: '.hero-gold-section, .dashboard-hero, [data-tour="hero"]', title: 'Welcome to Your Command Center!', body: "Hey there! I'm Evolv, your butterfly guide. This is your dashboard — the heartbeat of your business. Let me show you around!", pose: 'wave' },
      { target: '#metricCardsRow, .metric-card, [data-tour="metrics"]', title: 'Your Key Metrics', body: "These cards show your most important numbers at a glance — active clients, revenue, letters sent, and more. They update in real time!", pose: 'default' },
      { target: '#focusSection, [data-tour="focus"]', title: 'Daily Focus', body: "Your top 3 priorities for today. Click the pencil icon to customize them — it's like your personal mission control each morning.", pose: 'excited' },
      { target: '#growthNavigator, [data-tour="growth"]', title: 'Growth Navigator', body: "This is your business growth roadmap. Track where you are and what's next on your journey to scaling your credit repair business.", pose: 'default' },
      { target: '#clientLocationChart, .map-section, [data-tour="map"]', title: 'Client Map', body: "See where your clients are located across the country. Great for identifying hot markets and planning local outreach!", pose: 'default' },
      { target: '#timelineSection, [data-tour="timeline"]', title: 'Recent Activity', body: "Everything happening in your business — new clients, payments, letters sent. Stay in the loop without digging through pages!", pose: 'celebrate' }
    ]
  },
  clients: {
    label: 'Clients',
    icon: '👥',
    desc: 'Manage your client base',
    steps: [
      { target: '.client-search, [data-tour="client-search"], #searchConsumers', title: 'Find Any Client Instantly', body: "Type a name, email, or status to filter your client list in real time. Your search command center!", pose: 'wave' },
      { target: '.add-consumer-btn, [data-tour="add-client"], #addConsumerBtn', title: 'Add New Clients', body: "Click here to onboard a new client. You'll fill in their details and they'll appear in your pipeline right away.", pose: 'default' },
      { target: '#consumersList, .consumer-table, [data-tour="client-list"]', title: 'Your Client Pipeline', body: "Every client at a glance — their status, bureau info, and progress. Click any row to dive into their full profile.", pose: 'default' },
      { target: '.bank-filter, [data-tour="bank-filter"], #bankFilterSelect', title: 'Smart Filters', body: "Filter by creditor, status, or bureau to zero in on exactly who needs attention. Power moves for power users!", pose: 'excited' }
    ]
  },
  leads: {
    label: 'Leads',
    icon: '🎯',
    desc: 'Track and convert prospects',
    steps: [
      { target: '.lead-hero, [data-tour="lead-hero"]', title: 'Your Lead Pipeline', body: "Welcome to lead central! This is where prospects transform into paying clients. Let me show you how to close more deals!", pose: 'wave' },
      { target: '.lead-board, .kanban-board, [data-tour="lead-board"]', title: 'Visual Pipeline Board', body: "Drag leads between stages as they progress — from cold prospect to booked consult to paying client. Visual selling at its finest!", pose: 'default' },
      { target: '[data-tour="add-lead"], .add-lead-btn', title: 'Capture New Leads', body: "Add leads manually or they'll flow in automatically from your marketing funnels. Every lead counts!", pose: 'excited' }
    ]
  },
  library: {
    label: 'Letter Library',
    icon: '📚',
    desc: 'Dispute letter templates',
    steps: [
      { target: '.library-hero, [data-tour="library-hero"]', title: 'Your Letter Arsenal', body: "Welcome to the library — your collection of dispute letter templates! These are your weapons in the credit repair battle.", pose: 'wave' },
      { target: '#templatePanel, [data-tour="templates"]', title: 'Template Collection', body: "Browse and select from proven dispute letter templates. Each one is crafted for specific violation types and bureaus.", pose: 'default' },
      { target: '#sequencePanel, [data-tour="sequences"]', title: 'Letter Sequences', body: "Create multi-step letter sequences that automatically escalate disputes. Set it and let the system handle follow-ups!", pose: 'excited' },
      { target: '#editorPanel, [data-tour="editor"]', title: 'Letter Editor', body: "Customize any template with your client's specific details. The editor handles formatting, merge fields, and compliance.", pose: 'default' }
    ]
  },
  billing: {
    label: 'Billing',
    icon: '💳',
    desc: 'Subscription and payments',
    steps: [
      { target: '[data-tour="billing-plans"], .pricing-grid', title: 'Choose Your Plan', body: "Pick the plan that fits your business size. As you grow, upgrade anytime to unlock more features!", pose: 'wave' },
      { target: '[data-tour="billing-status"], .subscription-status', title: 'Subscription Status', body: "See your current plan, billing cycle, and usage at a glance. Everything transparent, no surprises!", pose: 'default' }
    ]
  },
  settings: {
    label: 'Settings',
    icon: '⚙️',
    desc: 'Configure your workspace',
    steps: [
      { target: '[data-tour="api-cards"], .settings-cards', title: 'API Integrations', body: "Connect your favorite tools — Stripe for payments, AI for smart letters, and more. Each card shows you what's connected.", pose: 'wave' },
      { target: '[data-tour="shortcuts"], .shortcut-section', title: 'Keyboard Shortcuts', body: "Speed up your workflow! These keyboard shortcuts let you navigate and take action without touching your mouse.", pose: 'default' }
    ]
  },
  letters: {
    label: 'Letters',
    icon: '✉️',
    desc: 'Generated dispute letters',
    steps: [
      { target: '[data-tour="letter-list"], .letter-list', title: 'Your Letter Queue', body: "Every dispute letter you've generated lives here. Track status, download PDFs, and manage your mailing pipeline.", pose: 'wave' },
      { target: '[data-tour="letter-actions"], .letter-actions', title: 'Take Action', body: "Send letters, track delivery, and follow up — all from one place. Your dispute factory!", pose: 'excited' }
    ]
  },
  tradelines: {
    label: 'Tradelines',
    icon: '📋',
    desc: 'Credit report analysis',
    steps: [
      { target: '[data-tour="tradeline-upload"], .upload-section', title: 'Upload Reports', body: "Drop credit reports here and watch the magic happen. Our Metro-2 engine will scan every line for violations.", pose: 'wave' },
      { target: '[data-tour="tradeline-results"], .tradeline-list', title: 'Violation Results', body: "Every error, inconsistency, and violation found in the report. This is your ammunition for dispute letters!", pose: 'default' }
    ]
  },
  schedule: {
    label: 'Schedule',
    icon: '📅',
    desc: 'Appointments & bookings',
    steps: [
      { target: '[data-tour="schedule-cal"], .calendar-view', title: 'Your Calendar', body: "See all your upcoming consultations and follow-ups. Stay organized and never miss an appointment!", pose: 'wave' }
    ]
  },
  marketing: {
    label: 'Marketing',
    icon: '📢',
    desc: 'Campaigns & outreach',
    steps: [
      { target: '[data-tour="marketing-hero"]', title: 'Marketing Hub', body: "Launch campaigns, track results, and grow your client base. Marketing on autopilot!", pose: 'wave' }
    ]
  },
  workflows: {
    label: 'Workflows',
    icon: '⚡',
    desc: 'Automation rules',
    steps: [
      { target: '[data-tour="workflow-list"]', title: 'Your Automations', body: "Set up rules that handle repetitive tasks — auto-send letters, schedule follow-ups, assign leads. Work smarter, not harder!", pose: 'wave' }
    ]
  },
  'my-company': {
    label: 'My Company',
    icon: '🏢',
    desc: 'Business profile',
    steps: [
      { target: '[data-tour="company-info"]', title: 'Company Profile', body: "Your business identity — logo, name, address. This info appears on your letters and client portal.", pose: 'wave' }
    ]
  }
};

const PAGE_MAP = {
  'dashboard.html': 'dashboard',
  'index.html': 'clients',
  'leads.html': 'leads',
  'library.html': 'library',
  'billing.html': 'billing',
  'settings.html': 'settings',
  'letters.html': 'letters',
  'tradelines.html': 'tradelines',
  'schedule.html': 'schedule',
  'marketing.html': 'marketing',
  'workflows.html': 'workflows',
  'my-company.html': 'my-company'
};

function getCurrentPageKey() {
  const path = window.location.pathname;
  const filename = path.split('/').pop() || 'dashboard.html';
  return PAGE_MAP[filename] || null;
}

class EvolvTourEngine {
  constructor() {
    this.steps = [];
    this.currentStep = 0;
    this.overlay = null;
    this.spotlight = null;
    this.popover = null;
    this.tourKey = null;
    this.onComplete = null;
    this.isActive = false;
    this._keyHandler = null;
  }

  start(tourKey, options = {}) {
    const tour = PAGE_TOURS[tourKey];
    if (!tour) return;

    this.tourKey = tourKey;
    this.steps = tour.steps.filter(s => {
      const selectors = s.target.split(',').map(t => t.trim());
      return selectors.some(sel => {
        try { return !!document.querySelector(sel); } catch { return false; }
      });
    });

    if (!this.steps.length) {
      this.steps = tour.steps.slice(0, 1);
      if (this.steps.length) {
        this.steps[0] = { ...this.steps[0], _noTarget: true };
      } else {
        return;
      }
    }

    this.currentStep = 0;
    this.onComplete = options.onComplete || null;
    this.isActive = true;
    this.createOverlay();
    this.showStep(0);
  }

  createOverlay() {
    this.cleanup();
    this.overlay = document.createElement('div');
    this.overlay.className = 'tour-overlay tour-overlay--active';
    this.overlay.innerHTML = '<div class="tour-backdrop"></div>';
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay || e.target.classList.contains('tour-backdrop')) {
        this.finish(false);
      }
    });
    document.body.appendChild(this.overlay);

    this.spotlight = document.createElement('div');
    this.spotlight.className = 'tour-spotlight';
    this.overlay.appendChild(this.spotlight);

    this.popover = document.createElement('div');
    this.popover.className = 'tour-popover';
    this.overlay.appendChild(this.popover);

    this._keyHandler = (e) => {
      if (!this.isActive) return;
      if (e.key === 'Escape') { e.preventDefault(); this.finish(false); }
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); this.next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.prev(); }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  findTarget(step) {
    if (step._noTarget) return null;
    const selectors = step.target.split(',').map(t => t.trim());
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) return el;
      } catch { /* skip invalid selectors */ }
    }
    return null;
  }

  showStep(index) {
    if (index < 0 || index >= this.steps.length) return;
    this.currentStep = index;
    const step = this.steps[index];
    const target = this.findTarget(step);

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => this.positionElements(target, step), 400);
    } else {
      this.positionCenter(step);
    }
  }

  positionElements(target, step) {
    const rect = target.getBoundingClientRect();
    const pad = 10;

    this.spotlight.style.top = `${rect.top - pad + window.scrollY}px`;
    this.spotlight.style.left = `${rect.left - pad}px`;
    this.spotlight.style.width = `${rect.width + pad * 2}px`;
    this.spotlight.style.height = `${rect.height + pad * 2}px`;
    this.spotlight.style.position = 'fixed';
    this.spotlight.style.top = `${rect.top - pad}px`;

    const placement = this.calculatePlacement(rect);
    this.renderPopover(step, placement, rect);
  }

  positionCenter(step) {
    this.spotlight.style.top = '-9999px';
    this.spotlight.style.left = '-9999px';
    this.spotlight.style.width = '0';
    this.spotlight.style.height = '0';
    this.renderPopover(step, 'center', null);
  }

  calculatePlacement(rect) {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const spaceRight = vw - rect.right;

    if (spaceBelow > 260) return 'bottom';
    if (spaceAbove > 260) return 'top';
    if (spaceRight > 440) return 'right';
    return 'bottom';
  }

  renderPopover(step, placement, rect) {
    const isLast = this.currentStep === this.steps.length - 1;
    const isFirst = this.currentStep === 0;
    const poseClass = step.pose ? `tour-butterfly--${step.pose}` : '';

    const dots = this.steps.map((_, i) => {
      let cls = 'tour-bubble__dot';
      if (i === this.currentStep) cls += ' tour-bubble__dot--active';
      else if (i < this.currentStep) cls += ' tour-bubble__dot--done';
      return `<div class="${cls}"></div>`;
    }).join('');

    this.popover.setAttribute('data-placement', placement);
    this.popover.innerHTML = `
      <div class="tour-butterfly ${poseClass}">
        ${BUTTERFLY_SVG}
      </div>
      <div class="tour-bubble">
        <div class="tour-bubble__title">${step.title}</div>
        <div class="tour-bubble__body">${step.body}</div>
        <div class="tour-bubble__footer">
          <div class="tour-bubble__progress">${dots}</div>
          <div class="tour-bubble__actions">
            ${isFirst ? `<button class="tour-btn tour-btn--skip" data-action="skip">Skip Tour</button>` : `<button class="tour-btn tour-btn--prev" data-action="prev">Back</button>`}
            ${isLast
              ? `<button class="tour-btn tour-btn--finish" data-action="finish">Got it! 🦋</button>`
              : `<button class="tour-btn tour-btn--next" data-action="next">Next →</button>`
            }
          </div>
        </div>
      </div>
    `;

    this.popover.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'next') this.next();
        else if (action === 'prev') this.prev();
        else if (action === 'skip') this.finish(false);
        else if (action === 'finish') this.finish(true);
      });
    });

    this.popover.style.animation = 'none';
    void this.popover.offsetHeight;
    this.popover.style.animation = '';

    requestAnimationFrame(() => {
      if (placement === 'center') {
        this.popover.style.position = 'fixed';
        this.popover.style.top = '50%';
        this.popover.style.left = '50%';
        this.popover.style.transform = 'translate(-50%, -50%)';
        return;
      }
      if (!rect) return;

      this.popover.style.position = 'fixed';
      this.popover.style.transform = 'none';
      const popRect = this.popover.getBoundingClientRect();
      let top, left;

      switch (placement) {
        case 'bottom':
          top = rect.bottom + 20;
          left = Math.max(16, Math.min(rect.left, window.innerWidth - popRect.width - 16));
          break;
        case 'top':
          top = rect.top - popRect.height - 20;
          left = Math.max(16, Math.min(rect.left, window.innerWidth - popRect.width - 16));
          break;
        case 'right':
          top = Math.max(16, rect.top);
          left = rect.right + 20;
          break;
        case 'left':
          top = Math.max(16, rect.top);
          left = rect.left - popRect.width - 20;
          break;
      }

      this.popover.style.top = `${top}px`;
      this.popover.style.left = `${left}px`;
    });
  }

  next() {
    if (this.currentStep < this.steps.length - 1) {
      this.showStep(this.currentStep + 1);
    } else {
      this.finish(true);
    }
  }

  prev() {
    if (this.currentStep > 0) {
      this.showStep(this.currentStep - 1);
    }
  }

  finish(completed) {
    this.isActive = false;
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }

    if (completed && this.tourKey) {
      const state = getTourState();
      state[this.tourKey] = { completed: true, date: new Date().toISOString() };
      saveTourState(state);
      this.showConfetti();
    }

    this.cleanup();
    if (this.onComplete) this.onComplete(completed);
  }

  cleanup() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
    this.spotlight = null;
    this.popover = null;
  }

  showConfetti() {
    const container = document.createElement('div');
    container.className = 'tour-confetti';
    document.body.appendChild(container);
    const colors = ['#d4a853', '#e8c875', '#c49a45', '#fff', '#f0d78c'];
    for (let i = 0; i < 50; i++) {
      const piece = document.createElement('div');
      piece.className = 'tour-confetti__piece';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = `${Math.random() * 0.8}s`;
      piece.style.animationDuration = `${1.5 + Math.random()}s`;
      piece.style.width = `${4 + Math.random() * 6}px`;
      piece.style.height = `${4 + Math.random() * 6}px`;
      container.appendChild(piece);
    }
    setTimeout(() => container.remove(), 3000);
  }
}

const tourEngine = new EvolvTourEngine();

function startPageTour(pageKey) {
  const key = pageKey || getCurrentPageKey();
  if (!key) return;
  tourEngine.start(key);
}

function showTourMenu() {
  const existing = document.querySelector('.tour-menu-overlay');
  if (existing) existing.remove();

  const state = getTourState();
  const currentPage = getCurrentPageKey();
  const overlay = document.createElement('div');
  overlay.className = 'tour-menu-overlay';

  const menuItems = Object.entries(PAGE_TOURS).map(([key, tour]) => {
    const done = state[key]?.completed;
    const isCurrent = key === currentPage;
    return `
      <div class="tour-menu__item" data-tour-key="${key}">
        <div class="tour-menu__item-icon">${tour.icon}</div>
        <div class="tour-menu__item-text">
          <div class="tour-menu__item-label">${tour.label}${isCurrent ? ' (current page)' : ''}</div>
          <div class="tour-menu__item-desc">${tour.desc}</div>
        </div>
        ${done ? '<span class="tour-menu__item-badge">✓ Done</span>' : ''}
      </div>
    `;
  }).join('');

  overlay.innerHTML = `
    <div class="tour-menu" style="position:relative;">
      <button class="tour-menu__close" data-close>✕</button>
      <div class="tour-menu__header">
        <div class="tour-butterfly" style="width:56px;height:56px;">${BUTTERFLY_SVG}</div>
        <div>
          <div class="tour-menu__title">Explore Evolv.AI</div>
          <div class="tour-menu__subtitle">Choose a section to learn about</div>
        </div>
      </div>
      <div class="tour-menu__list" style="max-height: 400px; overflow-y: auto;">
        <div class="tour-menu__item tour-menu__item--full" data-tour-key="__current__">
          <div class="tour-menu__item-icon">🦋</div>
          <div class="tour-menu__item-text">
            <div class="tour-menu__item-label">Tour This Page</div>
            <div class="tour-menu__item-desc">Let Evolv walk you through what's on screen</div>
          </div>
        </div>
        ${menuItems}
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) {
      overlay.remove();
      return;
    }
    const item = e.target.closest('[data-tour-key]');
    if (!item) return;
    const key = item.dataset.tourKey;
    overlay.remove();

    if (key === '__current__') {
      const current = getCurrentPageKey();
      if (current) tourEngine.start(current);
      return;
    }

    if (key === getCurrentPageKey()) {
      tourEngine.start(key);
    } else {
      const pageFile = Object.entries(PAGE_MAP).find(([, v]) => v === key);
      if (pageFile) {
        sessionStorage.setItem('evolv.tour.autostart', key);
        window.location.href = `/${pageFile[0]}`;
      }
    }
  });

  document.body.appendChild(overlay);
}

function checkAutoStartTour() {
  const pending = sessionStorage.getItem('evolv.tour.autostart');
  if (pending) {
    sessionStorage.removeItem('evolv.tour.autostart');
    setTimeout(() => tourEngine.start(pending), 800);
    return;
  }

  const state = getTourState();
  if (!state._welcomed) {
    const currentPage = getCurrentPageKey();
    if (currentPage) {
      state._welcomed = true;
      saveTourState(state);
      setTimeout(() => showWelcome(), 2000);
    }
  }
}

function showWelcome() {
  const overlay = document.createElement('div');
  overlay.className = 'tour-welcome';
  overlay.innerHTML = `
    <div class="tour-welcome__card">
      <div class="tour-welcome__butterfly">${BUTTERFLY_SVG}</div>
      <div class="tour-welcome__title">Hi! I'm Evolv 🦋</div>
      <div class="tour-welcome__body">
        I'm your personal guide to mastering your credit repair business. Want me to show you around? I'll walk you through everything — it only takes a minute!
      </div>
      <div class="tour-welcome__actions">
        <button class="tour-welcome__btn tour-welcome__btn--start" data-action="start">Show Me Around!</button>
        <button class="tour-welcome__btn tour-welcome__btn--skip" data-action="skip">I'll Explore On My Own</button>
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset?.action;
    if (action === 'start') {
      overlay.remove();
      const current = getCurrentPageKey();
      if (current) tourEngine.start(current);
    } else if (action === 'skip' || e.target === overlay) {
      overlay.remove();
    }
  });

  document.body.appendChild(overlay);
}

function resetAllTours() {
  localStorage.removeItem(TOUR_STORAGE_KEY);
  sessionStorage.removeItem('evolv.tour.autostart');
}

window.EvolvTour = {
  start: startPageTour,
  showMenu: showTourMenu,
  showWelcome,
  reset: resetAllTours,
  engine: tourEngine,
  PAGE_TOURS,
  getCurrentPageKey
};

window.addEventListener('crm:tutorial-request', (event) => {
  const mode = event?.detail?.mode || 'start';
  if (mode === 'menu') {
    showTourMenu();
  } else {
    startPageTour();
  }
});

window.addEventListener('crm:tutorial-reset', () => {
  resetAllTours();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(checkAutoStartTour, 1000));
} else {
  setTimeout(checkAutoStartTour, 1000);
}

export { tourEngine, startPageTour, showTourMenu, showWelcome, resetAllTours, PAGE_TOURS, getCurrentPageKey };

export function setupPageTour() {
  return {
    startTour: startPageTour,
    resetTour: resetAllTours,
    refreshHelpState: () => {}
  };
}
