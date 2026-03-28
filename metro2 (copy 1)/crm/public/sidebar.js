(function () {
  'use strict';

  // Prevent re-initialization if this script is loaded more than once.
  if (window.__evolvSidebarInit) return;
  window.__evolvSidebarInit = true;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

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
    menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
    grid: '<circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    megaphone: '<path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    calendar: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="4.5" r="1.5" fill="currentColor"/><circle cx="19.5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19.5" r="1.5" fill="currentColor"/><circle cx="4.5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
    creditCard: '<path d="M1 6a2 2 0 0 1 2-2h18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6z"/><path d="M1 10h22"/>',
    dollarSign: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="5"/>',
    fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
    mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    building: '<path d="M4 2h16a2 2 0 0 1 2 2v18H2V4a2 2 0 0 1 2-2z"/><path d="M9 22v-4h6v4"/><circle cx="8" cy="6" r="0.5"/><circle cx="12" cy="6" r="0.5"/><circle cx="16" cy="6" r="0.5"/><circle cx="8" cy="10" r="0.5"/><circle cx="12" cy="10" r="0.5"/><circle cx="16" cy="10" r="0.5"/><circle cx="8" cy="14" r="0.5"/><circle cx="12" cy="14" r="0.5"/><circle cx="16" cy="14" r="0.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    code: '<path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/>',
    zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r="0.5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    sms: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    emailIcon: '<path d="M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z"/><path d="M22 7l-10 7L2 7"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    share2: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98"/><path d="M15.41 6.51l-6.82 3.98"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    rss: '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1" fill="currentColor"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    check: '<polyline points="20 6 9 12 4 10"/>'
  };

  function svg(name, size) {
    size = size || 20;
    return '<span style="display:inline-flex;align-items:center;justify-content:center;width:' + size + 'px;height:' + size + 'px;flex-shrink:0;flex-basis:' + size + 'px;">'
      + '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + (icons[name] || '')
      + '</svg>'
      + '</span>';
  }

  var path = window.location.pathname;

  var navItems = [
    { group: 'MAIN' },
    { label: 'Dashboard', icon: 'grid', href: '/dashboard', match: ['/dashboard'] },
    { label: 'Clients', icon: 'users', href: null, match: ['/clients', '/client-invoicing', '/disputes', '/cfpb', '/'], sub: [
      { label: 'Clients', icon: 'users', href: '/clients', match: ['/clients', '/'] },
      { label: 'Invoicing', icon: 'fileText', href: '/client-invoicing', match: ['/client-invoicing'] },
      { label: 'Disputes', icon: 'shield', href: '/disputes', match: ['/disputes'] },
      { label: 'CFPB Complaints', icon: 'flag', href: '/cfpb', match: ['/cfpb'] }
    ]},
    { label: 'Leads', icon: 'target', href: '/leads', match: ['/leads'] },
    { label: 'Marketing', icon: 'megaphone', href: null, match: ['/marketing', '/social'], sub: [
      { label: 'SMS', icon: 'sms', href: '/marketing/sms', match: ['/marketing/sms'] },
      { label: 'Email', icon: 'emailIcon', href: '/marketing/email', match: ['/marketing/email'] },
      { label: 'Social Media', icon: 'rss', href: '/social', match: ['/social'] }
    ]},
    { label: 'Schedule', icon: 'calendar', href: '/schedule', match: ['/schedule'] },
    { label: 'Billing', icon: 'creditCard', href: '/billing', match: ['/billing'] },
    { group: 'TOOLS' },
    { label: 'Education', icon: 'book', href: '/education', match: ['/education'] },
    { label: 'Tradelines', icon: 'dollarSign', href: '/tradelines', match: ['/tradelines'] },
    { label: 'Affiliate', icon: 'share2', href: '/affiliate', match: ['/affiliate'] },
    { group: 'SETTINGS' },
    { label: 'Letters', icon: 'mail', href: '/letters', match: ['/letters'] },
    { label: 'Library', icon: 'book', href: '/library', match: ['/library'] },
    { label: 'My Company', icon: 'building', href: '/my-company', match: ['/my-company'] },
    { label: 'Client Portal', icon: 'settings', href: '/settings/client-portal', match: ['/settings/client-portal'] },
    { label: 'APIs', icon: 'code', href: '/settings', match: ['/settings'] }
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

  // Remove any stale injected style from a previous load before re-injecting.
  var _oldStyle = document.getElementById('evolv-sidebar-styles');
  if (_oldStyle) _oldStyle.remove();

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
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      padding: 4px 0;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.08) transparent;
      -webkit-transform: translateZ(0);
      transform: translateZ(0);
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
    .evolv-sb-item svg,
    .evolv-sb-parent-toggle svg {
      width: 20px !important;
      height: 20px !important;
      min-width: 20px;
      min-height: 20px;
      transition: color 0.15s ease;
      stroke: currentColor !important;
      fill: none !important;
      visibility: visible !important;
      opacity: 1 !important;
      display: block !important;
    }
    .evolv-sb-item svg > *,
    .evolv-sb-parent-toggle svg > * {
      stroke: currentColor !important;
      visibility: visible !important;
      opacity: 1 !important;
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
      stroke: currentColor !important;
      fill: none !important;
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

    body.evolv-sidebar-active [class*="fixed"][class*="inset-0"],
    body.evolv-sidebar-active .fixed.inset-0 {
      padding-left: ${COLLAPSED_W}px;
    }
    body.evolv-sidebar-expanded [class*="fixed"][class*="inset-0"],
    body.evolv-sidebar-expanded .fixed.inset-0 {
      padding-left: ${EXPANDED_W}px;
    }

    .evolv-mobile-toggle {
      display: none;
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 9998;
      width: auto;
      min-width: 44px;
      height: 44px;
      padding: 0 10px 0 10px;
      gap: 8px;
      border-radius: 12px;
      background: #0d0d0f;
      border: 1px solid rgba(255,255,255,0.1);
      color: #aaa;
      cursor: pointer;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }
    .evolv-mb-avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(212,168,83,0.18);
      border: 1.5px solid rgba(212,168,83,0.45);
      color: #d4a853;
      font-size: 11px;
      font-weight: 700;
      flex-shrink: 0;
      line-height: 1;
    }
    .evolv-sb-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(4px);
      z-index: 9998;
      touch-action: none;
    }

    .evolv-tour-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9997;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: #0d0d0f;
      border: 2px solid #d4a853;
      box-shadow: 0 4px 18px rgba(212,168,83,0.25);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      padding: 0;
      outline: none;
    }
    .evolv-tour-fab:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 24px rgba(212,168,83,0.38);
    }
    .evolv-tour-fab:active {
      transform: scale(0.96);
    }
    .evolv-tour-fab-tooltip {
      position: absolute;
      right: 60px;
      white-space: nowrap;
      background: #1a1a1e;
      color: #f0f0f0;
      font-size: 12px;
      font-weight: 500;
      padding: 5px 11px;
      border-radius: 8px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.18s ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    }
    .evolv-tour-fab:hover .evolv-tour-fab-tooltip {
      opacity: 1;
    }
    .evolv-sb-backdrop.visible {
      display: block;
    }

    @media (max-width: 767px) {
      body.evolv-sidebar-active {
        padding-left: 0 !important;
        padding-top: 64px !important;
      }
      body.evolv-sidebar-expanded {
        padding-left: 0 !important;
        padding-top: 64px !important;
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
      body.evolv-sidebar-active [class*="fixed"][class*="inset-0"],
      body.evolv-sidebar-active .fixed.inset-0,
      body.evolv-sidebar-expanded [class*="fixed"][class*="inset-0"],
      body.evolv-sidebar-expanded .fixed.inset-0 {
        padding-left: 0;
      }
    }

    .evolv-sb-bell-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    .evolv-sb-bell-badge {
      position: absolute;
      top: 6px;
      left: 26px;
      background: #ef4444;
      color: #fff;
      font-size: 9px;
      font-weight: 700;
      line-height: 1;
      min-width: 16px;
      height: 16px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 3px;
      pointer-events: none;
      border: 2px solid #0d0d0f;
      z-index: 10001;
      display: none;
    }
    .evolv-sb-bell-badge.visible {
      display: flex;
    }

    .evolv-notif-panel {
      position: fixed;
      top: 0;
      right: -380px;
      width: 360px;
      height: 100vh;
      background: #111113;
      border-left: 1px solid rgba(255,255,255,0.08);
      z-index: 10002;
      display: flex;
      flex-direction: column;
      transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: -8px 0 32px rgba(0,0,0,0.5);
    }
    .evolv-notif-panel.open {
      right: 0;
    }
    .evolv-notif-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 20px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      flex-shrink: 0;
    }
    .evolv-notif-title {
      font-size: 14px;
      font-weight: 600;
      color: #f0f0f0;
      letter-spacing: 0.02em;
    }
    .evolv-notif-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .evolv-notif-mark-all {
      font-size: 11px;
      color: #d4a853;
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
      font-family: inherit;
      transition: background 0.15s;
    }
    .evolv-notif-mark-all:hover {
      background: rgba(212,168,83,0.08);
    }
    .evolv-notif-close {
      background: none;
      border: none;
      color: #666;
      cursor: pointer;
      padding: 6px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      transition: background 0.15s, color 0.15s;
    }
    .evolv-notif-close:hover {
      background: rgba(255,255,255,0.06);
      color: #aaa;
    }
    .evolv-notif-list {
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.08) transparent;
    }
    .evolv-notif-list::-webkit-scrollbar { width: 4px; }
    .evolv-notif-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
    .evolv-notif-empty {
      padding: 48px 24px;
      text-align: center;
      color: #555;
      font-size: 13px;
    }
    .evolv-notif-item {
      padding: 14px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      cursor: pointer;
      transition: background 0.15s;
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .evolv-notif-item:hover {
      background: rgba(255,255,255,0.03);
    }
    .evolv-notif-item.unread {
      background: rgba(212,168,83,0.04);
    }
    .evolv-notif-item.unread:hover {
      background: rgba(212,168,83,0.07);
    }
    .evolv-notif-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #d4a853;
      flex-shrink: 0;
      margin-top: 5px;
      opacity: 0;
    }
    .evolv-notif-item.unread .evolv-notif-dot {
      opacity: 1;
    }
    .evolv-notif-body {
      flex: 1;
      min-width: 0;
    }
    .evolv-notif-msg {
      font-size: 13px;
      color: #ccc;
      line-height: 1.4;
      word-break: break-word;
    }
    .evolv-notif-item.unread .evolv-notif-msg {
      color: #f0f0f0;
    }
    .evolv-notif-time {
      font-size: 11px;
      color: #555;
      margin-top: 4px;
    }
    .evolv-notif-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.3);
      z-index: 10001;
    }
    .evolv-notif-backdrop.open {
      display: block;
    }

    @media (max-width: 480px) {
      .evolv-notif-panel {
        width: 100vw;
        right: -100vw;
      }
    }
  `;
  document.head.appendChild(style);

  hostNav.style.display = 'none';

  var sidebar = document.createElement('div');
  sidebar.className = 'evolv-sidebar' + (expanded && !isMobile() ? ' expanded' : '');

  var backdrop = document.createElement('div');
  backdrop.className = 'evolv-sb-backdrop';

  var _mbTok = localStorage.getItem('token');
  var _mbInitial = 'U';
  var _mbUsername = 'Account';
  if (_mbTok) {
    try {
      var _mbP = JSON.parse(atob(_mbTok.split('.')[1]));
      if (_mbP.username) { _mbInitial = _mbP.username.charAt(0).toUpperCase(); _mbUsername = _mbP.username; }
    } catch(e) {}
  }
  var mobileBtn = document.createElement('button');
  mobileBtn.className = 'evolv-mobile-toggle';
  mobileBtn.innerHTML = svg('menu', 22) + '<span class="evolv-mb-avatar" title="Logged in as ' + esc(_mbUsername) + '">' + esc(_mbInitial) + '</span>';
  mobileBtn.setAttribute('aria-label', 'Toggle navigation');

  var html = '';

  html += '<div class="evolv-sb-brand" title="EVOLV"><div class="evolv-sb-brand-inner"><div class="evolv-sb-logo">E</div><div class="evolv-sb-brand-text">EVOLV</div></div></div>';

  html += '<div class="evolv-sb-toggle"><button type="button" aria-label="Toggle sidebar">' + svg('menu', 20) + '</button></div>';

  html += '<div class="evolv-sb-nav"></div>';

  html += '<div class="evolv-sb-bottom">';
  html += '<div class="evolv-sb-bell-wrap evolv-sb-item" id="evolv-sb-bell" data-tooltip="Notifications" style="cursor:pointer;">' + svg('bell', 20) + '<span class="evolv-sb-item-label">Notifications</span><span class="evolv-sb-bell-badge" id="evolv-bell-badge"></span></div>';
  // Inject globe spin animation once
  if (!document.getElementById('evolv-globe-style')) {
    var gs = document.createElement('style');
    gs.id = 'evolv-globe-style';
    gs.textContent = '@keyframes evolv-meridian{0%{transform:scaleX(1)}25%{transform:scaleX(0)}50%{transform:scaleX(-1)}75%{transform:scaleX(0)}100%{transform:scaleX(1)}}.evolv-globe-meridian{animation:evolv-meridian 2.4s linear infinite;transform-box:fill-box;transform-origin:center}.evolv-globe-meridian2{animation:evolv-meridian 2.4s linear infinite -1.2s;transform-box:fill-box;transform-origin:center}';
    document.head.appendChild(gs);
  }
  html += '<a href="#" class="evolv-sb-item" data-tooltip="Guided Tour" id="evolv-sb-tour" style="color:#d4a853;">';
  html += '<span style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;flex-shrink:0;">'
    + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="position:absolute;top:0;left:0;">'
    + '<circle cx="12" cy="12" r="9.5" stroke="#d4a853" stroke-width="1.5"/>'
    + '<path d="M2.5 12 Q12 8 21.5 12" stroke="#d4a853" stroke-width="1" fill="none" opacity="0.65"/>'
    + '<path d="M2.5 12 Q12 16 21.5 12" stroke="#d4a853" stroke-width="1" fill="none" opacity="0.65"/>'
    + '<path d="M5.5 6.5 Q12 4.5 18.5 6.5" stroke="#d4a853" stroke-width="0.8" fill="none" opacity="0.45"/>'
    + '<path d="M5.5 17.5 Q12 19.5 18.5 17.5" stroke="#d4a853" stroke-width="0.8" fill="none" opacity="0.45"/>'
    + '<ellipse class="evolv-globe-meridian" cx="12" cy="12" rx="5" ry="9.5" stroke="#d4a853" stroke-width="1.5" fill="none"/>'
    + '<ellipse class="evolv-globe-meridian2" cx="12" cy="12" rx="5" ry="9.5" stroke="#d4a853" stroke-width="1" fill="none" opacity="0.5"/>'
    + '</svg>'
    + '<span style="position:relative;z-index:1;font-size:9px;font-weight:900;color:#d4a853;line-height:1;font-family:Georgia,serif;user-select:none;">?</span>'
    + '</span>';
  html += '<span class="evolv-sb-item-label" style="color:#d4a853;">Guided Tour</span></a>';
  html += '<a href="#" class="evolv-sb-item" data-tooltip="Help" id="evolv-sb-help">' + svg('help', 20) + '<span class="evolv-sb-item-label">Help</span></a>';

  var isDarkNow = localStorage.getItem('evolv-theme') === 'dark';
  html += '<a href="#" class="evolv-sb-item" data-tooltip="' + (isDarkNow ? 'Switch to Light Mode' : 'Switch to Dark Mode') + '" id="evolv-sb-theme-toggle">' + svg(isDarkNow ? 'sun' : 'moon', 20) + '<span class="evolv-sb-item-label">' + (isDarkNow ? 'Light Mode' : 'Dark Mode') + '</span></a>';

  var tierBadge = document.getElementById('tierBadge');
  var tierText = '';
  if (tierBadge) {
    var tierSpan = tierBadge.querySelector('.font-semibold');
    if (tierSpan) tierText = tierSpan.textContent.trim();
  }
  if (tierText) {
    html += '<div class="evolv-sb-tier"><span>📄</span><span>' + esc(tierText) + '</span></div>';
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

  html += '<div class="evolv-sb-item" style="cursor:default;" data-tooltip="' + esc(displayName) + '">';
  html += '<div class="evolv-sb-avatar">' + esc(initials) + '</div>';
  html += '<span class="evolv-sb-item-label" style="font-size:12px;color:#888;">' + esc(displayName) + '</span>';
  html += '</div>';

  html += '<a href="#" class="evolv-sb-item" data-tooltip="Sign Out" id="evolv-sb-logout" style="color:#888;">' + svg('logout', 20) + '<span class="evolv-sb-item-label" style="color:#888;">Sign Out</span></a>';
  html += '</div>';

  sidebar.innerHTML = html;

  // Build nav items using pure DOM methods (zero HTML parsing) to avoid
  // iOS Safari's HTML5 adoption-agency algorithm stripping icon spans.
  var _SVG_NS = 'http://www.w3.org/2000/svg';

  function makeIconSpan(iconName, size) {
    var wrap = document.createElement('span');
    wrap.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:' + size + 'px;height:' + size + 'px;flex-shrink:0;flex-basis:' + size + 'px;';
    var s = document.createElementNS(_SVG_NS, 'svg');
    s.setAttribute('width', size);
    s.setAttribute('height', size);
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.innerHTML = icons[iconName] || '';
    wrap.appendChild(s);
    return wrap;
  }

  function makeLabelSpan(text, extraStyle) {
    var sp = document.createElement('span');
    sp.className = 'evolv-sb-item-label';
    sp.textContent = text;
    if (extraStyle) sp.style.cssText = extraStyle;
    return sp;
  }

  var navEl = sidebar.querySelector('.evolv-sb-nav');
  for (var i = 0; i < navItems.length; i++) {
    var item = navItems[i];

    if (item.group) {
      var grp = document.createElement('div');
      grp.className = 'evolv-sb-group';
      var line = document.createElement('div');
      line.className = 'evolv-sb-group-line';
      var glbl = document.createElement('div');
      glbl.className = 'evolv-sb-group-label';
      glbl.textContent = item.group;
      grp.appendChild(line);
      grp.appendChild(glbl);
      navEl.appendChild(grp);

    } else if (item.sub) {
      var parentActive = isParentActive(item);
      var subOpen = parentActive;
      var btn = document.createElement('button');
      btn.className = 'evolv-sb-parent-toggle' + (parentActive ? ' active' : '') + (subOpen ? ' sub-open' : '');
      btn.setAttribute('data-tooltip', item.label);
      btn.appendChild(makeIconSpan(item.icon, 20));
      btn.appendChild(makeLabelSpan(item.label));
      var chev = document.createElement('span');
      chev.className = 'evolv-sb-chevron';
      chev.appendChild(makeIconSpan('chevronDown', 16));
      btn.appendChild(chev);
      navEl.appendChild(btn);

      var subDiv = document.createElement('div');
      subDiv.className = 'evolv-sb-sub' + (subOpen ? ' open' : '');
      for (var j = 0; j < item.sub.length; j++) {
        var sub = item.sub[j];
        var subActive = isActive(sub);
        var subA = document.createElement('a');
        subA.href = sub.href;
        subA.className = 'evolv-sb-item' + (subActive ? ' active' : '');
        subA.setAttribute('data-tooltip', sub.label);
        subA.appendChild(makeIconSpan(sub.icon, 20));
        subA.appendChild(makeLabelSpan(sub.label));
        subDiv.appendChild(subA);
      }
      navEl.appendChild(subDiv);

    } else {
      var active = isActive(item);
      var a = document.createElement('a');
      a.href = item.href;
      a.className = 'evolv-sb-item' + (active ? ' active' : '');
      a.setAttribute('data-tooltip', item.label);
      a.appendChild(makeIconSpan(item.icon, 20));
      a.appendChild(makeLabelSpan(item.label));
      navEl.appendChild(a);
    }
  }

  document.body.appendChild(sidebar);
  document.body.appendChild(backdrop);
  document.body.appendChild(mobileBtn);

  // --- Floating Tour FAB (globe + ?) ---
  // Remove any previously-injected FAB so we never stack duplicates.
  var _existingFab = document.querySelector('.evolv-tour-fab');
  if (_existingFab) _existingFab.remove();

  var tourFab = document.createElement('button');
  tourFab.className = 'evolv-tour-fab';
  tourFab.setAttribute('aria-label', 'Guided Tour');
  tourFab.setAttribute('type', 'button');
  tourFab.innerHTML = '<span class="evolv-tour-fab-tooltip">Guided Tour</span>'
    + '<span style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;">'
    + '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" style="position:absolute;top:0;left:0;">'
    + '<circle cx="12" cy="12" r="9.5" stroke="#d4a853" stroke-width="1.5"/>'
    + '<path d="M2.5 12 Q12 8 21.5 12" stroke="#d4a853" stroke-width="1" fill="none" opacity="0.65"/>'
    + '<path d="M2.5 12 Q12 16 21.5 12" stroke="#d4a853" stroke-width="1" fill="none" opacity="0.65"/>'
    + '<path d="M5.5 6.5 Q12 4.5 18.5 6.5" stroke="#d4a853" stroke-width="0.8" fill="none" opacity="0.45"/>'
    + '<path d="M5.5 17.5 Q12 19.5 18.5 17.5" stroke="#d4a853" stroke-width="0.8" fill="none" opacity="0.45"/>'
    + '<ellipse class="evolv-globe-meridian" cx="12" cy="12" rx="5" ry="9.5" stroke="#d4a853" stroke-width="1.5" fill="none"/>'
    + '<ellipse class="evolv-globe-meridian2" cx="12" cy="12" rx="5" ry="9.5" stroke="#d4a853" stroke-width="1" fill="none" opacity="0.5"/>'
    + '</svg>'
    + '<span style="position:relative;z-index:1;font-size:12px;font-weight:900;color:#d4a853;line-height:1;font-family:Georgia,serif;user-select:none;">?</span>'
    + '</span>';
  document.body.appendChild(tourFab);
  tourFab.addEventListener('click', function () {
    if (window.EvolvTour && window.EvolvTour.showMenu) {
      window.EvolvTour.showMenu();
    }
  });

  // FAB background/shadow are controlled entirely by CSS (sidebar injected style
  // for dark mode, evolv-light.css overrides for light mode). No inline styles
  // are applied here — inline styles would fight the CSS cascade and can't be
  // overridden by evolv-light.css !important rules.

  document.body.classList.add('evolv-sidebar-active');
  if (!isMobile()) {
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
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
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
      ['token','auth','clientId','teamMembers','companyInfo','cta_variant','creditScore','negativeItems','creditSnapshot','itemsInDispute','disputeTimeline','mailedLetters','educationItems','deletions','portal_user'].forEach(function(k){ localStorage.removeItem(k); });
      location.href = '/login.html';
    });
  }

  var themeToggleBtn = sidebar.querySelector('#evolv-sb-theme-toggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var darkLink = document.getElementById('dark-theme-css');
      var lightLink = document.getElementById('light-theme-css');
      var currentlyDark = localStorage.getItem('evolv-theme') === 'dark';
      if (currentlyDark) {
        localStorage.setItem('evolv-theme', 'light');
        if (darkLink) darkLink.disabled = true;
        if (lightLink) { lightLink.disabled = false; } else {
          var ll = document.createElement('link');
          ll.id = 'light-theme-css'; ll.rel = 'stylesheet'; ll.href = '/evolv-light.css';
          document.head.appendChild(ll);
        }
        themeToggleBtn.setAttribute('data-tooltip', 'Switch to Dark Mode');
        var iconEl = themeToggleBtn.querySelector('svg');
        if (iconEl) iconEl.outerHTML = svg('moon', 20);
        var labelEl = themeToggleBtn.querySelector('.evolv-sb-item-label');
        if (labelEl) labelEl.textContent = 'Dark Mode';
      } else {
        localStorage.setItem('evolv-theme', 'dark');
        if (lightLink) lightLink.disabled = true;
        if (darkLink) { darkLink.disabled = false; } else {
          var dl = document.createElement('link');
          dl.id = 'dark-theme-css'; dl.rel = 'stylesheet'; dl.href = '/evolv-dark.css';
          document.head.appendChild(dl);
        }
        themeToggleBtn.setAttribute('data-tooltip', 'Switch to Light Mode');
        var iconEl2 = themeToggleBtn.querySelector('svg');
        if (iconEl2) iconEl2.outerHTML = svg('sun', 20);
        var labelEl2 = themeToggleBtn.querySelector('.evolv-sb-item-label');
        if (labelEl2) labelEl2.textContent = 'Light Mode';
      }
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
    document.body.classList.add('evolv-sidebar-active');
    if (isMobile()) {
      document.body.classList.remove('evolv-sidebar-expanded');
      sidebar.classList.remove('expanded');
      if (!mobileOpen) {
        sidebar.classList.remove('mobile-open');
        backdrop.classList.remove('visible');
        document.body.style.overflow = '';
        document.body.style.touchAction = '';
      }
    } else {
      if (mobileOpen) {
        mobileOpen = false;
        document.body.style.overflow = '';
        document.body.style.touchAction = '';
      }
      sidebar.classList.remove('mobile-open');
      backdrop.classList.remove('visible');
      sidebar.classList.toggle('expanded', expanded);
      document.body.classList.toggle('evolv-sidebar-expanded', expanded);
    }
  });

  // ---- Notification Panel ----
  var notifPanel = document.createElement('div');
  notifPanel.className = 'evolv-notif-panel';
  notifPanel.innerHTML =
    '<div class="evolv-notif-header">' +
      '<span class="evolv-notif-title">Notifications</span>' +
      '<div class="evolv-notif-actions">' +
        '<button class="evolv-notif-mark-all" id="evolv-notif-mark-all">Mark all read</button>' +
        '<button class="evolv-notif-close" id="evolv-notif-close" aria-label="Close">' + svg('x', 18) + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="evolv-notif-list" id="evolv-notif-list"><div class="evolv-notif-empty">No notifications yet</div></div>';

  var notifBackdrop = document.createElement('div');
  notifBackdrop.className = 'evolv-notif-backdrop';

  document.body.appendChild(notifBackdrop);
  document.body.appendChild(notifPanel);

  var notifOpen = false;
  var notifData = [];
  var notifUnread = 0;
  var badge = sidebar.querySelector('#evolv-bell-badge');

  function relativeTime(isoStr) {
    if (!isoStr) return '';
    var diff = Date.now() - Date.parse(isoStr);
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
  }

  function escN(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  function renderNotifList() {
    var list = document.getElementById('evolv-notif-list');
    if (!list) return;
    if (!notifData.length) {
      list.innerHTML = '<div class="evolv-notif-empty">No notifications yet</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < notifData.length; i++) {
      var n = notifData[i];
      html += '<div class="evolv-notif-item' + (n.read ? '' : ' unread') + '" data-id="' + escN(n.id) + '" data-consumer="' + escN(n.consumerId || '') + '">';
      html += '<div class="evolv-notif-dot"></div>';
      html += '<div class="evolv-notif-body">';
      if (n.eventLabel || n.eventType) {
        html += '<div style="font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#d4a853;margin-bottom:3px;">' + escN(n.eventLabel || n.eventType) + '</div>';
      }
      html += '<div class="evolv-notif-msg">' + escN(n.message) + '</div>';
      if (n.consumerName) {
        html += '<div style="font-size:11px;color:#888;margin-top:2px;">Client: ' + escN(n.consumerName) + '</div>';
      }
      html += '<div class="evolv-notif-time">' + escN(relativeTime(n.at)) + '</div>';
      html += '</div></div>';
    }
    list.innerHTML = html;
    list.querySelectorAll('.evolv-notif-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var id = el.getAttribute('data-id');
        var consumerId = el.getAttribute('data-consumer');
        if (id && !el.classList.contains('read')) {
          markNotifRead(id, { navigate: !!consumerId });
        }
        if (consumerId) {
          window.location.href = '/clients?id=' + encodeURIComponent(consumerId);
        }
      });
    });
  }

  function updateBadge() {
    if (!badge) return;
    if (notifUnread > 0) {
      badge.textContent = notifUnread > 99 ? '99+' : String(notifUnread);
      badge.classList.add('visible');
    } else {
      badge.textContent = '';
      badge.classList.remove('visible');
    }
  }

  function authHeader() {
    var tok = localStorage.getItem('token');
    return tok ? { 'Authorization': 'Bearer ' + tok } : {};
  }

  function fetchNotifications() {
    var token = localStorage.getItem('token');
    if (!token) return;
    fetch('/api/notifications?limit=50', { headers: authHeader() })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (!data || !data.ok) return;
        notifData = data.notifications || [];
        notifUnread = data.unreadCount || 0;
        updateBadge();
        if (notifOpen) renderNotifList();
      })
      .catch(function() {});
  }

  function markNotifRead(id, opts) {
    var navigate = opts && opts.navigate;
    var notif = notifData.find(function(n) { return n.id === id; });
    if (notif && !notif.read) {
      notif.read = true;
      if (notifUnread > 0) notifUnread--;
      updateBadge();
    }
    fetch('/api/notifications/read', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeader()),
      body: JSON.stringify({ id: id }),
      keepalive: true
    })
    .then(function() { if (!navigate) fetchNotifications(); })
    .catch(function() {});
  }

  function markAllNotifsRead() {
    for (var i = 0; i < notifData.length; i++) { notifData[i].read = true; }
    notifUnread = 0;
    updateBadge();
    if (notifOpen) renderNotifList();
    fetch('/api/notifications/read', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeader()),
      body: JSON.stringify({ all: true }),
      keepalive: true
    })
    .then(function() { fetchNotifications(); })
    .catch(function() {});
  }

  function openNotifPanel() {
    notifOpen = true;
    notifPanel.classList.add('open');
    notifBackdrop.classList.add('open');
    renderNotifList();
  }

  function closeNotifPanel() {
    notifOpen = false;
    notifPanel.classList.remove('open');
    notifBackdrop.classList.remove('open');
  }

  var bellBtn = sidebar.querySelector('#evolv-sb-bell');
  if (bellBtn) {
    bellBtn.addEventListener('click', function(e) {
      e.preventDefault();
      if (notifOpen) {
        closeNotifPanel();
      } else {
        openNotifPanel();
      }
    });
  }

  var closeBtn = notifPanel.querySelector('#evolv-notif-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function() { closeNotifPanel(); });
  }

  var markAllBtn = notifPanel.querySelector('#evolv-notif-mark-all');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', function() {
      markAllNotifsRead();
    });
  }

  notifBackdrop.addEventListener('click', function() { closeNotifPanel(); });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && notifOpen) closeNotifPanel();
  });

  fetchNotifications();
  setInterval(fetchNotifications, 60000);
})();
