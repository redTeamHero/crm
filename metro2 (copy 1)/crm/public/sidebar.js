(function () {
  'use strict';

  const hostNav = document.getElementById('host-nav');
  if (!hostNav) return;

  const COLLAPSED_W = 72;
  const EXPANDED_W = 260;
  const LS_KEY = 'evolv_sidebar_expanded';
  const saved = localStorage.getItem(LS_KEY);
  let expanded = saved !== null ? saved === '1' : false;
  let mobileOpen = false;
  const isMobile = () => window.innerWidth < 768;

  const icons = {
    menu: '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    megaphone: '<path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    creditCard: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    dollarSign: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><line x1="8" y1="6" x2="8" y2="6.01"/><line x1="12" y1="6" x2="12" y2="6.01"/><line x1="16" y1="6" x2="16" y2="6.01"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    sms: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    emailIcon: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/>',
    chevronDown: '<polyline points="6 9 12 15 18 9"/>'
  };

  function svg(name, size) {
    size = size || 20;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + icons[name] + '</svg>';
  }

  var path = window.location.pathname;

  var navItems = [
    { group: 'MAIN' },
    { label: 'Dashboard', icon: 'grid', href: '/dashboard', match: ['/dashboard'] },
    { label: 'Clients', icon: 'users', href: '/clients', match: ['/clients', '/'] },
    { label: 'Leads', icon: 'target', href: '/leads', match: ['/leads'] },
    { label: 'Marketing', icon: 'megaphone', href: null, match: ['/marketing'], sub: [
      { label: 'SMS', icon: 'sms', href: '/marketing/sms', match: ['/marketing/sms'] },
      { label: 'Email', icon: 'emailIcon', href: '/marketing/email', match: ['/marketing/email'] }
    ]},
    { label: 'Schedule', icon: 'calendar', href: '/schedule', match: ['/schedule'] },
    { label: 'Billing', icon: 'creditCard', href: '/billing', match: ['/billing'] },
    { group: 'TOOLS' },
    { label: 'Tradelines', icon: 'dollarSign', href: '/tradelines', match: ['/tradelines'] },
    { group: 'SETTINGS' },
    { label: 'Letters', icon: 'mail', href: '/letters', match: ['/letters'] },
    { label: 'Library', icon: 'book', href: '/library', match: ['/library'] },
    { label: 'My Company', icon: 'building', href: '/my-company', match: ['/my-company'] },
    { label: 'Client Portal', icon: 'settings', href: '/settings/client-portal', match: ['/settings/client-portal'] },
    { label: 'APIs', icon: 'code', href: '/settings', match: ['/settings'] },
    { label: 'Workflows', icon: 'zap', href: '/workflows', match: ['/workflows'] }
  ];

  function isActive(item) {
    if (!item.match) return false;
    for (var i = 0; i < item.match.length; i++) {
      var m = item.match[i];
      if (m === '/' && path === '/') return true;
      if (m !== '/' && path.indexOf(m) === 0) return true;
    }
    return false;
  }

  function isParentActive(item) {
    if (!item.sub) return false;
    for (var i = 0; i < item.sub.length; i++) {
      if (isActive(item.sub[i])) return true;
    }
    return false;
  }

  var style = document.createElement('style');
  style.id = 'evolv-sidebar-styles';
  style.textContent = `
    #host-nav { display: none !important; }

    .evolv-sidebar {
      position: fixed;
      top: 0;
      left: 0;
      height: 100vh;
      width: ${COLLAPSED_W}px;
      background: #0d0d0f;
      border-right: 1px solid rgba(255,255,255,0.06);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .evolv-sidebar.expanded {
      width: ${EXPANDED_W}px;
    }

    .evolv-sb-brand {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 18px 0 18px 0;
      min-height: 68px;
      flex-shrink: 0;
      cursor: pointer;
    }
    .evolv-sb-brand-inner {
      display: flex;
      align-items: center;
      gap: 14px;
      padding-left: 16px;
      min-width: ${EXPANDED_W - 16}px;
    }
    .evolv-sb-logo {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: linear-gradient(135deg, #d4a853 0%, #c4973e 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 18px;
      color: #0a0a0a;
      flex-shrink: 0;
      box-shadow: 0 0 18px rgba(212,168,83,0.25);
    }
    .evolv-sb-brand-text {
      font-size: 16px;
      font-weight: 600;
      letter-spacing: 0.16em;
      color: #f0f0f0;
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .evolv-sidebar.expanded .evolv-sb-brand-text {
      opacity: 1;
    }

    .evolv-sb-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 0 0 8px 0;
      flex-shrink: 0;
    }
    .evolv-sb-toggle button {
      background: none;
      border: none;
      color: #666;
      cursor: pointer;
      padding: 8px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s, color 0.2s;
    }
    .evolv-sb-toggle button:hover {
      background: rgba(255,255,255,0.06);
      color: #aaa;
    }

    .evolv-sb-nav {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 4px 0;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.08) transparent;
    }
    .evolv-sb-nav::-webkit-scrollbar {
      width: 4px;
    }
    .evolv-sb-nav::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.08);
      border-radius: 4px;
    }

    .evolv-sb-group {
      padding: 20px 0 6px 0;
    }
    .evolv-sb-group-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #d4a853;
      padding: 0 24px;
      white-space: nowrap;
      opacity: 0;
      height: 0;
      overflow: hidden;
      transition: opacity 0.2s ease;
    }
    .evolv-sidebar.expanded .evolv-sb-group-label {
      opacity: 0.7;
      height: auto;
    }
    .evolv-sb-group-line {
      height: 1px;
      background: rgba(255,255,255,0.06);
      margin: 0 16px;
    }
    .evolv-sidebar:not(.expanded) .evolv-sb-group {
      padding: 12px 0 4px 0;
    }

    .evolv-sb-item {
      position: relative;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 10px 24px;
      color: #666;
      text-decoration: none;
      cursor: pointer;
      transition: background 0.2s ease, color 0.15s ease;
      border-left: 3px solid transparent;
      margin: 1px 0;
      min-height: 40px;
      white-space: nowrap;
    }
    .evolv-sb-item:hover {
      background: rgba(255,255,255,0.04);
      color: #aaa;
    }
    .evolv-sb-item.active {
      color: #d4a853;
      background: rgba(212,168,83,0.08);
      border-left-color: #d4a853;
    }
    .evolv-sb-item.active svg {
      color: #d4a853;
    }
    .evolv-sb-item svg {
      flex-shrink: 0;
      transition: color 0.15s ease;
    }
    .evolv-sb-item-label {
      font-size: 14px;
      letter-spacing: 0.02em;
      opacity: 0;
      transition: opacity 0.2s ease;
      overflow: hidden;
    }
    .evolv-sidebar.expanded .evolv-sb-item-label {
      opacity: 1;
    }

    .evolv-sb-item[data-tooltip]:not(.evolv-sidebar.expanded .evolv-sb-item)::after {
      content: attr(data-tooltip);
      position: absolute;
      left: ${COLLAPSED_W + 8}px;
      top: 50%;
      transform: translateY(-50%);
      background: #1a1a1e;
      color: #f0f0f0;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      border: 1px solid rgba(255,255,255,0.08);
    }
    .evolv-sidebar:not(.expanded) .evolv-sb-item:hover[data-tooltip]::after {
      opacity: 1;
    }

    .evolv-sb-sub {
      overflow: hidden;
      max-height: 0;
      transition: max-height 0.3s ease;
    }
    .evolv-sb-sub.open {
      max-height: 200px;
    }
    .evolv-sb-sub .evolv-sb-item {
      padding-left: 38px;
    }
    .evolv-sidebar.expanded .evolv-sb-sub .evolv-sb-item {
      padding-left: 62px;
    }

    .evolv-sb-parent-toggle {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 10px 24px;
      color: #666;
      cursor: pointer;
      transition: background 0.2s ease, color 0.15s ease;
      border: none;
      background: none;
      width: 100%;
      text-align: left;
      border-left: 3px solid transparent;
      min-height: 40px;
      white-space: nowrap;
      position: relative;
      font-family: inherit;
    }
    .evolv-sb-parent-toggle:hover {
      background: rgba(255,255,255,0.04);
      color: #aaa;
    }
    .evolv-sb-parent-toggle.active {
      color: #d4a853;
      background: rgba(212,168,83,0.08);
      border-left-color: #d4a853;
    }
    .evolv-sb-parent-toggle svg {
      flex-shrink: 0;
    }
    .evolv-sb-parent-toggle .evolv-sb-item-label {
      flex: 1;
    }
    .evolv-sb-parent-toggle .evolv-sb-chevron {
      flex-shrink: 0;
      transition: transform 0.2s ease, opacity 0.2s ease;
      opacity: 0;
    }
    .evolv-sidebar.expanded .evolv-sb-parent-toggle .evolv-sb-chevron {
      opacity: 1;
    }
    .evolv-sb-sub.open + .evolv-sb-parent-toggle .evolv-sb-chevron,
    .evolv-sb-parent-toggle.sub-open .evolv-sb-chevron {
      transform: rotate(180deg);
    }

    .evolv-sb-bottom {
      flex-shrink: 0;
      border-top: 1px solid rgba(255,255,255,0.06);
      padding: 12px 0;
    }
    .evolv-sb-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(212,168,83,0.15);
      color: #d4a853;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 600;
      flex-shrink: 0;
    }
    .evolv-sb-tier {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 24px;
      font-size: 11px;
      color: #d4a853;
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .evolv-sidebar.expanded .evolv-sb-tier {
      opacity: 0.7;
    }

    body.evolv-sidebar-active {
      padding-left: ${COLLAPSED_W}px !important;
      transition: padding-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    body.evolv-sidebar-expanded {
      padding-left: ${EXPANDED_W}px !important;
    }

    .evolv-mobile-toggle {
      display: none;
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 9998;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: #0d0d0f;
      border: 1px solid rgba(255,255,255,0.1);
      color: #aaa;
      cursor: pointer;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }
    .evolv-sb-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(4px);
      z-index: 9998;
    }
    .evolv-sb-backdrop.visible {
      display: block;
    }

    @media (max-width: 767px) {
      body.evolv-sidebar-active {
        padding-left: 0 !important;
      }
      body.evolv-sidebar-expanded {
        padding-left: 0 !important;
      }
      .evolv-sidebar {
        transform: translateX(-100%);
        width: ${EXPANDED_W}px;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .evolv-sidebar.mobile-open {
        transform: translateX(0);
      }
      .evolv-sidebar.expanded {
        width: ${EXPANDED_W}px;
      }
      .evolv-sidebar .evolv-sb-brand-text {
        opacity: 1;
      }
      .evolv-sidebar .evolv-sb-item-label {
        opacity: 1;
      }
      .evolv-sidebar .evolv-sb-group-label {
        opacity: 0.7;
        height: auto;
      }
      .evolv-sidebar .evolv-sb-parent-toggle .evolv-sb-chevron {
        opacity: 1;
      }
      .evolv-sidebar .evolv-sb-tier {
        opacity: 0.7;
      }
      .evolv-sidebar .evolv-sb-sub .evolv-sb-item {
        padding-left: 62px;
      }
      .evolv-mobile-toggle {
        display: flex;
      }
    }
  `;
  document.head.appendChild(style);

  hostNav.style.display = 'none';

  var sidebar = document.createElement('div');
  sidebar.className = 'evolv-sidebar' + (expanded && !isMobile() ? ' expanded' : '');

  var backdrop = document.createElement('div');
  backdrop.className = 'evolv-sb-backdrop';

  var mobileBtn = document.createElement('button');
  mobileBtn.className = 'evolv-mobile-toggle';
  mobileBtn.innerHTML = svg('menu', 22);
  mobileBtn.setAttribute('aria-label', 'Toggle navigation');

  var html = '';

  html += '<div class="evolv-sb-brand" title="EVOLV.AI"><div class="evolv-sb-brand-inner"><div class="evolv-sb-logo">E</div><div class="evolv-sb-brand-text">EVOLV.AI</div></div></div>';

  html += '<div class="evolv-sb-toggle"><button type="button" aria-label="Toggle sidebar">' + svg('menu', 20) + '</button></div>';

  html += '<div class="evolv-sb-nav">';

  for (var i = 0; i < navItems.length; i++) {
    var item = navItems[i];

    if (item.group) {
      html += '<div class="evolv-sb-group"><div class="evolv-sb-group-line"></div><div class="evolv-sb-group-label">' + item.group + '</div></div>';
      continue;
    }

    if (item.sub) {
      var parentActive = isParentActive(item);
      var subOpen = parentActive;
      html += '<button class="evolv-sb-parent-toggle' + (parentActive ? ' active' : '') + (subOpen ? ' sub-open' : '') + '" data-tooltip="' + item.label + '">';
      html += svg(item.icon, 20);
      html += '<span class="evolv-sb-item-label">' + item.label + '</span>';
      html += '<span class="evolv-sb-chevron">' + svg('chevronDown', 16) + '</span>';
      html += '</button>';
      html += '<div class="evolv-sb-sub' + (subOpen ? ' open' : '') + '">';
      for (var j = 0; j < item.sub.length; j++) {
        var sub = item.sub[j];
        var subActive = isActive(sub);
        html += '<a href="' + sub.href + '" class="evolv-sb-item' + (subActive ? ' active' : '') + '" data-tooltip="' + sub.label + '">';
        html += svg(sub.icon, 20);
        html += '<span class="evolv-sb-item-label">' + sub.label + '</span>';
        html += '</a>';
      }
      html += '</div>';
      continue;
    }

    var active = isActive(item);
    html += '<a href="' + item.href + '" class="evolv-sb-item' + (active ? ' active' : '') + '" data-tooltip="' + item.label + '">';
    html += svg(item.icon, 20);
    html += '<span class="evolv-sb-item-label">' + item.label + '</span>';
    html += '</a>';
  }

  html += '</div>';

  html += '<div class="evolv-sb-bottom">';
  html += '<a href="#" class="evolv-sb-item" data-tooltip="Guided Tour" id="evolv-sb-tour" style="color:#d4a853;">';
  html += '<svg width="20" height="20" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><g transform="translate(50,50)"><g><path d="M-5,-5 C-25,-35 -50,-30 -45,-10 C-42,2 -25,8 -5,2 Z" fill="#d4a853" opacity="0.9"/><path d="M-5,5 C-25,30 -45,28 -40,12 C-37,2 -22,-2 -5,2 Z" fill="#c49a45" opacity="0.85"/></g><g><path d="M5,-5 C25,-35 50,-30 45,-10 C42,2 25,8 5,2 Z" fill="#d4a853" opacity="0.9"/><path d="M5,5 C25,30 45,28 40,12 C37,2 22,-2 5,2 Z" fill="#c49a45" opacity="0.85"/></g><ellipse cx="0" cy="0" rx="3.5" ry="12" fill="#1a1a1a"/></g></svg>';
  html += '<span class="evolv-sb-item-label" style="color:#d4a853;">Guided Tour</span></a>';
  html += '<a href="#" class="evolv-sb-item" data-tooltip="Help" id="evolv-sb-help">' + svg('help', 20) + '<span class="evolv-sb-item-label">Help</span></a>';

  var tierBadge = document.getElementById('tierBadge');
  var tierText = '';
  if (tierBadge) {
    var tierSpan = tierBadge.querySelector('.font-semibold');
    if (tierSpan) tierText = tierSpan.textContent.trim();
  }
  if (tierText) {
    html += '<div class="evolv-sb-tier"><span>📄</span><span>' + tierText + '</span></div>';
  }

  var tok = localStorage.getItem('token');
  var initials = 'U';
  var displayName = 'Account';
  if (tok) {
    try {
      var p = JSON.parse(atob(tok.split('.')[1]));
      if (p.username) {
        displayName = p.username;
        initials = p.username.charAt(0).toUpperCase();
      }
    } catch(e) {}
  }

  html += '<div class="evolv-sb-item" style="cursor:default;" data-tooltip="' + displayName + '">';
  html += '<div class="evolv-sb-avatar">' + initials + '</div>';
  html += '<span class="evolv-sb-item-label" style="font-size:12px;color:#888;">' + displayName + '</span>';
  html += '</div>';

  html += '<a href="#" class="evolv-sb-item" data-tooltip="Sign Out" id="evolv-sb-logout" style="color:#888;">' + svg('logout', 20) + '<span class="evolv-sb-item-label" style="color:#888;">Sign Out</span></a>';
  html += '</div>';

  sidebar.innerHTML = html;
  document.body.appendChild(sidebar);
  document.body.appendChild(backdrop);
  document.body.appendChild(mobileBtn);

  if (!isMobile()) {
    document.body.classList.add('evolv-sidebar-active');
    if (expanded) document.body.classList.add('evolv-sidebar-expanded');
  }

  var toggleBtn = sidebar.querySelector('.evolv-sb-toggle button');
  var brandEl = sidebar.querySelector('.evolv-sb-brand');

  function setExpanded(val) {
    expanded = val;
    localStorage.setItem(LS_KEY, val ? '1' : '0');
    if (isMobile()) return;
    sidebar.classList.toggle('expanded', expanded);
    document.body.classList.toggle('evolv-sidebar-expanded', expanded);
  }

  function toggleMobile() {
    mobileOpen = !mobileOpen;
    sidebar.classList.toggle('mobile-open', mobileOpen);
    backdrop.classList.toggle('visible', mobileOpen);
  }

  toggleBtn.addEventListener('click', function () {
    if (isMobile()) {
      toggleMobile();
    } else {
      setExpanded(!expanded);
    }
  });

  brandEl.addEventListener('click', function () {
    if (isMobile()) {
      toggleMobile();
    } else {
      setExpanded(!expanded);
    }
  });

  mobileBtn.addEventListener('click', function () {
    toggleMobile();
  });

  backdrop.addEventListener('click', function () {
    if (mobileOpen) toggleMobile();
  });

  var parentToggles = sidebar.querySelectorAll('.evolv-sb-parent-toggle');
  for (var p = 0; p < parentToggles.length; p++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        var subMenu = btn.nextElementSibling;
        if (subMenu && subMenu.classList.contains('evolv-sb-sub')) {
          subMenu.classList.toggle('open');
          btn.classList.toggle('sub-open');
        }
        if (!expanded && !isMobile()) {
          setExpanded(true);
        }
      });
    })(parentToggles[p]);
  }

  var tourBtn = sidebar.querySelector('#evolv-sb-tour');
  if (tourBtn) {
    tourBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (window.EvolvTour && window.EvolvTour.showMenu) {
        window.EvolvTour.showMenu();
      }
    });
  }

  var helpBtn = sidebar.querySelector('#evolv-sb-help');
  if (helpBtn) {
    helpBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var originalHelp = document.getElementById('btnHelp');
      if (originalHelp) originalHelp.click();
    });
  }

  var logoutBtn = sidebar.querySelector('#evolv-sb-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function (e) {
      e.preventDefault();
      localStorage.clear();
      location.href = '/login.html';
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
    if (e.key === '[') {
      e.preventDefault();
      if (isMobile()) {
        toggleMobile();
      } else {
        setExpanded(!expanded);
      }
    }
  });

  window.addEventListener('resize', function () {
    if (isMobile()) {
      document.body.classList.remove('evolv-sidebar-active', 'evolv-sidebar-expanded');
      sidebar.classList.remove('expanded');
      if (!mobileOpen) {
        sidebar.classList.remove('mobile-open');
        backdrop.classList.remove('visible');
      }
    } else {
      mobileOpen = false;
      sidebar.classList.remove('mobile-open');
      backdrop.classList.remove('visible');
      document.body.classList.add('evolv-sidebar-active');
      sidebar.classList.toggle('expanded', expanded);
      document.body.classList.toggle('evolv-sidebar-expanded', expanded);
    }
  });
})();
