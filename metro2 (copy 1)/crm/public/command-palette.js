(function () {
  'use strict';

  var styleEl = document.createElement('style');
  styleEl.id = 'evolv-cmd-palette-styles';
  styleEl.textContent = `
    .cmd-palette-backdrop {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 15vh;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s ease, visibility 0.2s ease;
    }
    .cmd-palette-backdrop.open {
      opacity: 1;
      visibility: visible;
    }
    .cmd-palette-modal {
      width: 100%;
      max-width: 640px;
      background: #111113;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
      overflow: hidden;
      transform: scale(0.95);
      opacity: 0;
      transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
    }
    .cmd-palette-backdrop.open .cmd-palette-modal {
      transform: scale(1);
      opacity: 1;
    }
    .cmd-palette-input-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .cmd-palette-input-wrap svg {
      flex-shrink: 0;
      color: #666;
    }
    .cmd-palette-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      font-size: 18px;
      color: #f0f0f0;
      caret-color: var(--accent, #d4a853);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .cmd-palette-input::placeholder {
      color: #555;
    }
    .cmd-palette-kbd {
      font-size: 11px;
      color: #555;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 4px;
      padding: 2px 6px;
      font-family: -apple-system, BlinkMacSystemFont, monospace;
    }
    .cmd-palette-list {
      max-height: 400px;
      overflow-y: auto;
      padding: 8px 0;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.08) transparent;
    }
    .cmd-palette-list::-webkit-scrollbar {
      width: 4px;
    }
    .cmd-palette-list::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.08);
      border-radius: 4px;
    }
    .cmd-palette-category {
      padding: 8px 20px 4px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #666;
    }
    .cmd-palette-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 20px;
      cursor: pointer;
      border-left: 3px solid transparent;
      transition: background 0.15s ease, border-color 0.15s ease;
      margin: 0 4px;
      border-radius: 8px;
    }
    .cmd-palette-item:hover,
    .cmd-palette-item.active {
      background: rgba(var(--accent-rgb, 212,168,83),0.08);
    }
    .cmd-palette-item.active {
      border-left-color: var(--accent, #d4a853);
      background: rgba(var(--accent-rgb, 212,168,83),0.1);
    }
    .cmd-palette-item-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.06);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: #888;
    }
    .cmd-palette-item.active .cmd-palette-item-icon {
      color: var(--accent, #d4a853);
      border-color: rgba(var(--accent-rgb, 212,168,83),0.2);
      background: rgba(var(--accent-rgb, 212,168,83),0.08);
    }
    .cmd-palette-item-text {
      flex: 1;
      min-width: 0;
    }
    .cmd-palette-item-label {
      font-size: 14px;
      color: #f0f0f0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cmd-palette-item-desc {
      font-size: 11px;
      color: #666;
      margin-top: 1px;
    }
    .cmd-palette-item-shortcut {
      flex-shrink: 0;
    }
    .cmd-palette-empty {
      padding: 32px 20px;
      text-align: center;
      color: #555;
      font-size: 14px;
    }
    .cmd-palette-footer {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 10px 20px;
      border-top: 1px solid rgba(255,255,255,0.06);
      font-size: 11px;
      color: #555;
    }
    .cmd-palette-footer span {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .cmd-palette-sidebar-btn {
      background: none;
      border: none;
      color: #666;
      cursor: pointer;
      padding: 10px 24px;
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
      transition: background 0.2s ease, color 0.15s ease;
      min-height: 40px;
      white-space: nowrap;
      font-family: inherit;
      font-size: 14px;
    }
    .cmd-palette-sidebar-btn:hover {
      background: rgba(255,255,255,0.04);
      color: #aaa;
    }
    .cmd-palette-sidebar-btn svg {
      flex-shrink: 0;
    }
    .cmd-palette-sidebar-btn .evolv-sb-item-label {
      font-size: 14px;
      letter-spacing: 0.02em;
      opacity: 0;
      transition: opacity 0.2s ease;
      overflow: hidden;
    }
    .evolv-sidebar.expanded .cmd-palette-sidebar-btn .evolv-sb-item-label {
      opacity: 1;
    }
    @media (max-width: 767px) {
      .evolv-sidebar .cmd-palette-sidebar-btn .evolv-sb-item-label {
        opacity: 1;
      }
      .cmd-palette-modal {
        margin: 0 16px;
      }
    }
  `;
  document.head.appendChild(styleEl);

  function svgIcon(paths, size) {
    size = size || 18;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }

  var icons = {
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    sms: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    emailIcon: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    creditCard: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    dollarSign: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><line x1="8" y1="6" x2="8" y2="6.01"/><line x1="12" y1="6" x2="12" y2="6.01"/><line x1="16" y1="6" x2="16" y2="6.01"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
  };

  var commands = [
    { cat: 'Navigation', label: 'Dashboard', desc: 'Overview & KPIs', icon: 'grid', action: function () { window.location.href = '/dashboard'; } },
    { cat: 'Navigation', label: 'Clients', desc: 'Manage client profiles', icon: 'users', action: function () { window.location.href = '/clients'; } },
    { cat: 'Navigation', label: 'Leads', desc: 'Track prospects', icon: 'target', action: function () { window.location.href = '/leads'; } },
    { cat: 'Navigation', label: 'Marketing SMS', desc: 'SMS campaigns', icon: 'sms', action: function () { window.location.href = '/marketing/sms'; } },
    { cat: 'Navigation', label: 'Marketing Email', desc: 'Email campaigns', icon: 'emailIcon', action: function () { window.location.href = '/marketing/email'; } },
    { cat: 'Navigation', label: 'Schedule', desc: 'Calendar & appointments', icon: 'calendar', action: function () { window.location.href = '/schedule'; } },
    { cat: 'Navigation', label: 'Billing', desc: 'Invoices & payments', icon: 'creditCard', action: function () { window.location.href = '/billing'; } },
    { cat: 'Navigation', label: 'Tradelines', desc: 'Credit tradeline data', icon: 'dollarSign', action: function () { window.location.href = '/tradelines'; } },
    { cat: 'Navigation', label: 'Letters', desc: 'Dispute letter templates', icon: 'mail', action: function () { window.location.href = '/letters'; } },
    { cat: 'Navigation', label: 'Library', desc: 'Knowledge base', icon: 'book', action: function () { window.location.href = '/library'; } },
    { cat: 'Navigation', label: 'My Company', desc: 'Company settings', icon: 'building', action: function () { window.location.href = '/my-company'; } },
    { cat: 'Navigation', label: 'Client Portal Settings', desc: 'Portal configuration', icon: 'settings', action: function () { window.location.href = '/settings/client-portal'; } },
    { cat: 'Navigation', label: 'APIs', desc: 'API integrations', icon: 'code', action: function () { window.location.href = '/settings#api-integrations'; } },
    { cat: 'Navigation', label: 'Workflows', desc: 'Automation workflows', icon: 'zap', action: function () { window.location.href = '/workflows'; } },
    { cat: 'Action', label: 'Add Client', desc: 'Create a new client', icon: 'userPlus', action: function () { window.location.href = '/clients?action=add'; } },
    { cat: 'Action', label: 'Help', desc: 'Open help panel', icon: 'help', action: function () { var b = document.getElementById('btnHelp'); if (b) b.click(); } },
    { cat: 'Action', label: 'Guided Tour', desc: 'Butterfly mascot walks you through this page', icon: 'help', action: function () { if (window.EvolvTour) window.EvolvTour.showMenu(); } },
    { cat: 'Action', label: 'Tour This Page', desc: 'Quick tour of the current page', icon: 'help', action: function () { if (window.EvolvTour) window.EvolvTour.start(); } },
    { cat: 'Action', label: 'Reset Tours', desc: 'Reset all tour progress', icon: 'help', action: function () { if (window.EvolvTour) { window.EvolvTour.reset(); alert('All tour progress has been reset!'); } } }
  ];

  var backdrop = document.createElement('div');
  backdrop.className = 'cmd-palette-backdrop';
  backdrop.innerHTML =
    '<div class="cmd-palette-modal">' +
      '<div class="cmd-palette-input-wrap">' +
        svgIcon(icons.search, 20) +
        '<input class="cmd-palette-input" type="text" placeholder="Type a command or search..." autocomplete="off" spellcheck="false" />' +
        '<span class="cmd-palette-kbd">' + (navigator.platform.indexOf('Mac') > -1 ? '⌘' : 'Ctrl') + '+K</span>' +
      '</div>' +
      '<div class="cmd-palette-list"></div>' +
      '<div class="cmd-palette-footer">' +
        '<span>' + svgIcon('<polyline points="18 15 12 9 6 15"/>', 12) + svgIcon('<polyline points="6 9 12 15 18 9"/>', 12) + ' Navigate</span>' +
        '<span>' + svgIcon('<path d="M9 10l-5 5 5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>', 12) + ' Select</span>' +
        '<span>esc Close</span>' +
      '</div>' +
    '</div>';
  document.body.appendChild(backdrop);

  var modal = backdrop.querySelector('.cmd-palette-modal');
  var input = backdrop.querySelector('.cmd-palette-input');
  var list = backdrop.querySelector('.cmd-palette-list');
  var activeIndex = 0;
  var filtered = [];
  var isOpen = false;

  function renderList(query) {
    query = (query || '').toLowerCase().trim();
    filtered = [];
    for (var i = 0; i < commands.length; i++) {
      if (!query || commands[i].label.toLowerCase().indexOf(query) > -1 ||
          (commands[i].desc && commands[i].desc.toLowerCase().indexOf(query) > -1) ||
          commands[i].cat.toLowerCase().indexOf(query) > -1) {
        filtered.push(commands[i]);
      }
    }
    if (activeIndex >= filtered.length) activeIndex = Math.max(0, filtered.length - 1);

    if (filtered.length === 0) {
      list.innerHTML = '<div class="cmd-palette-empty">No results found</div>';
      return;
    }

    var html = '';
    var lastCat = '';
    for (var j = 0; j < filtered.length; j++) {
      var cmd = filtered[j];
      if (cmd.cat !== lastCat) {
        lastCat = cmd.cat;
        html += '<div class="cmd-palette-category">' + cmd.cat + '</div>';
      }
      html += '<div class="cmd-palette-item' + (j === activeIndex ? ' active' : '') + '" data-index="' + j + '">';
      html += '<div class="cmd-palette-item-icon">' + svgIcon(icons[cmd.icon] || icons.grid, 16) + '</div>';
      html += '<div class="cmd-palette-item-text">';
      html += '<div class="cmd-palette-item-label">' + cmd.label + '</div>';
      if (cmd.desc) html += '<div class="cmd-palette-item-desc">' + cmd.desc + '</div>';
      html += '</div>';
      html += '</div>';
    }
    list.innerHTML = html;
    scrollActiveIntoView();
  }

  function scrollActiveIntoView() {
    var activeEl = list.querySelector('.cmd-palette-item.active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    activeIndex = 0;
    input.value = '';
    renderList('');
    backdrop.classList.add('open');
    setTimeout(function () { input.focus(); }, 50);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    backdrop.classList.remove('open');
  }

  function selectItem() {
    if (filtered[activeIndex]) {
      close();
      filtered[activeIndex].action();
    }
  }

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen) { close(); } else { open(); }
      return;
    }
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length > 0) {
        activeIndex = (activeIndex + 1) % filtered.length;
        renderList(input.value);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length > 0) {
        activeIndex = (activeIndex - 1 + filtered.length) % filtered.length;
        renderList(input.value);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      selectItem();
      return;
    }
  });

  input.addEventListener('input', function () {
    activeIndex = 0;
    renderList(input.value);
  });

  backdrop.addEventListener('click', function (e) {
    if (e.target === backdrop) close();
  });

  list.addEventListener('click', function (e) {
    var item = e.target.closest('.cmd-palette-item');
    if (item) {
      activeIndex = parseInt(item.getAttribute('data-index'), 10);
      selectItem();
    }
  });

  list.addEventListener('mousemove', function (e) {
    var item = e.target.closest('.cmd-palette-item');
    if (item) {
      var idx = parseInt(item.getAttribute('data-index'), 10);
      if (idx !== activeIndex) {
        activeIndex = idx;
        var items = list.querySelectorAll('.cmd-palette-item');
        for (var i = 0; i < items.length; i++) {
          items[i].classList.toggle('active', i === activeIndex);
        }
      }
    }
  });

  function injectSidebarButton() {
    var bottom = document.querySelector('.evolv-sb-bottom');
    if (!bottom) return;
    var helpLink = bottom.querySelector('#evolv-sb-help');
    var btn = document.createElement('button');
    btn.className = 'cmd-palette-sidebar-btn';
    btn.setAttribute('data-tooltip', 'Search');
    btn.innerHTML = svgIcon(icons.search, 20) + '<span class="evolv-sb-item-label">Search</span>';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      open();
    });
    if (helpLink) {
      bottom.insertBefore(btn, helpLink);
    } else {
      bottom.insertBefore(btn, bottom.firstChild);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(injectSidebarButton, 100); });
  } else {
    setTimeout(injectSidebarButton, 100);
  }
})();
