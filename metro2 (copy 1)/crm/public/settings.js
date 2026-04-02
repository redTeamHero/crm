/* public/settings.js */
import { setupPageTour } from './tour-guide.js';

function authHeader() {
  const token = localStorage.getItem('token') || localStorage.getItem('auth');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function initCollectorAddressPanel() {
  const tableBody = document.getElementById('caTableBody');
  const searchEl = document.getElementById('caSearch');
  const showFormBtn = document.getElementById('caShowFormBtn');
  const addForm = document.getElementById('caAddForm');
  const fName = document.getElementById('caFName');
  const fAddr1 = document.getElementById('caFAddr1');
  const fAddr2 = document.getElementById('caFAddr2');
  const fCity = document.getElementById('caFCity');
  const fState = document.getElementById('caFState');
  const fZip = document.getElementById('caFZip');
  const fErr = document.getElementById('caFErr');
  const fSave = document.getElementById('caFSave');
  const fCancel = document.getElementById('caFCancel');
  const msgEl = document.getElementById('caMsg');

  if (!tableBody) return;

  let allEntries = [];
  let editingId = null;

  function escHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function showMsg(text, isErr) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.color = isErr ? '#f87171' : '#4ade80';
    msgEl.style.display = 'block';
    setTimeout(() => { msgEl.style.display = 'none'; }, 3000);
  }

  function renderTable(entries) {
    const q = (searchEl?.value || '').toLowerCase();
    const filtered = q ? entries.filter(e => (e.name || '').toLowerCase().includes(q) || (e.addr1 || '').toLowerCase().includes(q)) : entries;
    if (!filtered.length) {
      tableBody.innerHTML = `<tr><td colspan="4" style="padding:14px 8px;color:#555;text-align:center;">No entries found.</td></tr>`;
      return;
    }
    tableBody.innerHTML = filtered.map(e => `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.04);${e.builtIn ? 'opacity:0.65;' : ''}">
        <td style="padding:7px 8px;color:#e5e5e5;">${escHtml(e.name)}${e.builtIn ? ' <span style="font-size:9px;color:#888;background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:4px;margin-left:4px;">built-in</span>' : ''}</td>
        <td style="padding:7px 8px;color:#aaa;">${escHtml(e.addr1)}${e.addr2 ? `<br><span style="font-size:10px;color:#666;">${escHtml(e.addr2)}</span>` : ''}</td>
        <td style="padding:7px 8px;color:#aaa;">${escHtml([e.city, e.state, e.zip].filter(Boolean).join(', '))}</td>
        <td style="padding:7px 8px;text-align:right;">
          ${!e.builtIn ? `<button class="ca-edit" data-id="${escHtml(e.id)}" style="font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid rgba(96,165,250,0.3);background:transparent;color:#60a5fa;cursor:pointer;margin-right:4px;">Edit</button><button class="ca-del" data-id="${escHtml(e.id)}" style="font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid rgba(239,68,68,0.3);background:transparent;color:#f87171;cursor:pointer;">Del</button>` : ''}
        </td>
      </tr>`).join('');

    tableBody.querySelectorAll('.ca-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const entry = allEntries.find(e => e.id === id);
        if (!entry) return;
        editingId = id;
        fName.value = entry.name || '';
        fAddr1.value = entry.addr1 || '';
        fAddr2.value = entry.addr2 || '';
        fCity.value = entry.city || '';
        fState.value = entry.state || '';
        fZip.value = entry.zip || '';
        addForm.style.display = 'block';
        fName.focus();
      });
    });
    tableBody.querySelectorAll('.ca-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm('Delete this custom entry?')) return;
        try {
          const res = await fetch(`/api/settings/collector-addresses/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeader() });
          const data = await res.json().catch(() => ({}));
          if (!data.ok) throw new Error(data.error || 'Delete failed');
          allEntries = allEntries.filter(e => e.id !== id);
          renderTable(allEntries);
          showMsg('Deleted.');
        } catch (err) { showMsg(String(err.message || err), true); }
      });
    });
  }

  async function loadAddresses() {
    try {
      const res = await fetch('/api/settings/collector-addresses', { headers: authHeader() });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || 'Failed to load');
      allEntries = [...(data.custom || []), ...(data.builtIn || []).map(e => ({ ...e, builtIn: true }))];
      renderTable(allEntries);
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="4" style="padding:12px 8px;color:#f87171;text-align:center;">${String(err.message || err)}</td></tr>`;
    }
  }

  searchEl?.addEventListener('input', () => renderTable(allEntries));

  showFormBtn?.addEventListener('click', () => {
    editingId = null;
    fName.value = ''; fAddr1.value = ''; fAddr2.value = ''; fCity.value = ''; fState.value = ''; fZip.value = '';
    fErr.style.display = 'none';
    addForm.style.display = addForm.style.display === 'none' ? 'block' : 'none';
    if (addForm.style.display === 'block') fName.focus();
  });
  fCancel?.addEventListener('click', () => { addForm.style.display = 'none'; editingId = null; });

  fSave?.addEventListener('click', async () => {
    const name = fName.value.trim();
    const addr1 = fAddr1.value.trim();
    if (!name || !addr1) { fErr.textContent = 'Collector name and address line 1 are required.'; fErr.style.display = 'block'; return; }
    fErr.style.display = 'none';
    fSave.disabled = true;
    fSave.textContent = 'Saving…';
    try {
      const body = { name, addr1, addr2: fAddr2.value.trim(), city: fCity.value.trim(), state: fState.value.trim().toUpperCase(), zip: fZip.value.trim() };
      if (editingId) body.id = editingId;
      const res = await fetch('/api/settings/collector-addresses', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader() }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || 'Save failed');
      await loadAddresses();
      addForm.style.display = 'none';
      editingId = null;
      showMsg('Saved!');
    } catch (err) { fErr.textContent = String(err.message || err); fErr.style.display = 'block'; }
    finally { fSave.disabled = false; fSave.textContent = 'Save'; }
  });

  loadAddresses();
}

document.addEventListener('DOMContentLoaded', () => { initCollectorAddressPanel(); });

function restoreSettingsTour(context) {
  if (!context || context.restored) return;
  const adminPanel = document.getElementById('adminPanel');
  const userManager = document.getElementById('userManager');
  if (context.showAdmin && adminPanel) {
    adminPanel.classList.add('hidden');
  }
  if (context.showUsers && userManager) {
    userManager.classList.add('hidden');
  }
  context.restored = true;
}

setupPageTour('settings-core', {
  onBeforeStart: () => {
    const adminPanel = document.getElementById('adminPanel');
    const userManager = document.getElementById('userManager');
    const state = { showAdmin: false, showUsers: false };
    if (adminPanel && adminPanel.classList.contains('hidden')) {
      adminPanel.classList.remove('hidden');
      state.showAdmin = true;
    }
    if (userManager && userManager.classList.contains('hidden')) {
      userManager.classList.remove('hidden');
      state.showUsers = true;
    }
    return state;
  },
  onAfterComplete: ({ context }) => restoreSettingsTour(context),
  onAfterCancel: ({ context }) => restoreSettingsTour(context),
  steps: [
    {
      id: 'settings-nav',
      title: 'Navigation',
      text: `<p class="font-semibold">Access My Company, Letters, Library, and Workflows.</p>
             <p class="mt-1 text-xs text-slate-600">Keep configuration and content synced with the rest of the CRM.</p>`,
      attachTo: { element: '#primaryNav', on: 'bottom' }
    },
    {
      id: 'settings-admin',
      title: 'API integrations',
      text: `<p class="font-semibold">Centralize Stripe, calendar, and marketing keys.</p>
             <p class="mt-1 text-xs text-slate-600">Document credentials before wiring automations.</p>`,
      attachTo: { element: '#adminPanel', on: 'top' }
    },
    {
      id: 'settings-env',
      title: 'Environment overrides',
      text: `<p class="font-semibold">Store worker variables securely.</p>
             <p class="mt-1 text-xs text-slate-600">Use uppercase keys and keep sensitive data off public repos.</p>`,
      attachTo: { element: '#envList', on: 'top' }
    },
    {
      id: 'settings-users',
      title: 'User permissions',
      text: `<p class="font-semibold">Manage team roles and login activity.</p>
             <p class="mt-1 text-xs text-slate-600">Rotate invites and keep Metro-2 access tight.</p>`,
      attachTo: { element: '#userManager', on: 'top' }
    },
    {
      id: 'settings-hotkeys',
      title: 'Keyboard shortcuts',
      text: `<p class="font-semibold">Customize hotkeys for your ops team.</p>
             <p class="mt-1 text-xs text-slate-600">Speed up dispute prep without sacrificing compliance.</p>`,
      attachTo: { element: '#hotkeyPanel', on: 'top' }
    }
  ]
});

document.addEventListener('DOMContentLoaded', () => {
  const panelEl = document.getElementById('adminPanel');
  const userMgrEl = document.getElementById('userManager');
  const userListEl = document.getElementById('userList');
  const gcalTokenEl = document.getElementById('gcalToken');
  const gcalIdEl = document.getElementById('gcalId');
  const marketingBaseEl = document.getElementById('marketingApiBaseUrl');
  const marketingKeyEl = document.getElementById('marketingApiKey');
  const gmailClientIdEl = document.getElementById('gmailClientId');
  const gmailClientSecretEl = document.getElementById('gmailClientSecret');
  const gmailRefreshTokenEl = document.getElementById('gmailRefreshToken');
  const fbAppIdEl = document.getElementById('fbAppId');
  const fbAppSecretEl = document.getElementById('fbAppSecret');
  const fbRedirectUriEl = document.getElementById('fbRedirectUri');
  const smartCreditClientIdEl = document.getElementById('smartCreditClientId');
  const smartCreditClientSecretEl = document.getElementById('smartCreditClientSecret');
  const smartCreditRedirectUriEl = document.getElementById('smartCreditRedirectUri');
  const sendgridApiKeyEl = document.getElementById('sendgridApiKey');
  const sendgridFromEmailEl = document.getElementById('sendgridFromEmail');
  const sendgridFromNameEl = document.getElementById('sendgridFromName');
  const sgStatusDotEl = document.getElementById('sgStatusDot');
  const envListEl = document.getElementById('envList');
  const addEnvBtn = document.getElementById('addEnvRow');

  const portalBackgroundEl = document.getElementById('portalBackgroundColor');
  const portalLogoEl = document.getElementById('portalLogoUrl');
  const portalTaglinePrimaryEl = document.getElementById('portalTaglinePrimary');
  const portalTaglineSecondaryEl = document.getElementById('portalTaglineSecondary');
  const portalResetBtn = document.getElementById('portalThemeReset');
  const portalModuleInputs = Array.from(document.querySelectorAll('input[data-portal-module]'));

  let currentSettings = {};
  const hasPortalForm = Boolean(
    portalBackgroundEl ||
    portalLogoEl ||
    portalTaglinePrimaryEl ||
    portalTaglineSecondaryEl ||
    portalModuleInputs.length
  );

  const PORTAL_THEME_DEFAULTS = Object.freeze({
    backgroundColor: '',
    logoUrl: '',
    taglinePrimary: 'Track disputes, uploads, and approvals in one place.',
    taglineSecondary: 'Sigue tus disputas, cargas y aprobaciones en un solo lugar.',
  });

  const PORTAL_MODULE_DEFAULTS = Object.freeze(
    portalModuleInputs.reduce((acc, input) => {
      const key = input.dataset.portalModule;
      if (!key) return acc;
      acc[key] = true;
      return acc;
    }, {})
  );

  function applyPortalSettingsForm(portal = {}) {
    if (!hasPortalForm) return;
    const theme = portal.theme || {};
    if (portalBackgroundEl) portalBackgroundEl.value = theme.backgroundColor || '';
    if (portalLogoEl) portalLogoEl.value = theme.logoUrl || '';
    if (portalTaglinePrimaryEl) {
      portalTaglinePrimaryEl.value = typeof theme.taglinePrimary === 'string'
        ? theme.taglinePrimary
        : PORTAL_THEME_DEFAULTS.taglinePrimary;
    }
    if (portalTaglineSecondaryEl) {
      portalTaglineSecondaryEl.value = typeof theme.taglineSecondary === 'string'
        ? theme.taglineSecondary
        : PORTAL_THEME_DEFAULTS.taglineSecondary;
    }

    const modules = portal.modules || {};
    portalModuleInputs.forEach(input => {
      const key = input.dataset.portalModule;
      if (!key) return;
      const enabled = Object.prototype.hasOwnProperty.call(modules, key)
        ? modules[key] !== false
        : PORTAL_MODULE_DEFAULTS[key] !== false;
      input.checked = enabled;
    });
  }

  function collectPortalModules() {
    if (!portalModuleInputs.length) {
      return { ...(currentSettings.clientPortal?.modules || {}) };
    }
    const modules = {};
    portalModuleInputs.forEach(input => {
      const key = input.dataset.portalModule;
      if (!key) return;
      modules[key] = !!input.checked;
    });
    return modules;
  }

  if (portalResetBtn) {
    portalResetBtn.addEventListener('click', () => {
      applyPortalSettingsForm({
        theme: { ...PORTAL_THEME_DEFAULTS },
        modules: { ...PORTAL_MODULE_DEFAULTS },
      });
    });
  }

  const saveBtn = document.getElementById('saveSettings');
  const msgEl = document.getElementById('saveMsg');
  const adminNoticeEl = document.getElementById('adminAccessNotice');

  const MAX_ENV_KEY_LEN = 64;

  if (saveBtn) {
    saveBtn.disabled = true;
  }

  function showAdminNotice() {
    if (!adminNoticeEl) return;
    adminNoticeEl.classList.remove('hidden');
  }

  function readSettingValue(el, key) {
    if (el && typeof el.value === 'string') {
      return el.value.trim();
    }
    const existing = currentSettings?.[key];
    if (existing === undefined || existing === null) return '';
    if (typeof existing === 'string') return existing;
    try {
      return String(existing);
    } catch {
      return '';
    }
  }

  function sanitizeEnvKey(raw = '') {
    let key = raw.toString().trim().toUpperCase();
    key = key.replace(/[^A-Z0-9_]/g, '_');
    if (key && !/^[A-Z_]/.test(key)) {
      key = `VAR_${key}`;
    }
    key = key.replace(/^[^A-Z_]+/, '');
    return key.slice(0, MAX_ENV_KEY_LEN);
  }


  function createEnvRow(key = '', value = '') {
    if (!envListEl) return null;
    const row = document.createElement('div');
    row.className = 'env-row flex flex-wrap md:flex-nowrap items-center gap-2';

    const keyInput = document.createElement('input');
    keyInput.className = 'flex-1 border rounded px-2 py-1 text-xs uppercase tracking-wide';
    keyInput.placeholder = 'ENV_KEY';
    keyInput.value = sanitizeEnvKey(key);

    keyInput.dataset.field = 'key';
    keyInput.maxLength = 64;
    keyInput.autocomplete = 'off';
    keyInput.spellcheck = false;
    keyInput.addEventListener('input', () => {
      const sanitized = sanitizeEnvKey(keyInput.value);
      if (sanitized !== keyInput.value) keyInput.value = sanitized;
    });
    keyInput.addEventListener('blur', () => {
      const sanitized = sanitizeEnvKey(keyInput.value);
      if (sanitized !== keyInput.value) keyInput.value = sanitized;
    });


    const valueInput = document.createElement('input');
    valueInput.className = 'flex-1 border rounded px-2 py-1 text-xs';
    valueInput.placeholder = 'Value';
    valueInput.value = value;
    valueInput.dataset.field = 'value';
    valueInput.autocomplete = 'off';
    valueInput.spellcheck = false;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn text-xs px-3';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => row.remove());

    row.append(keyInput, valueInput, removeBtn);
    return row;
  }

  function renderEnvOverrides(overrides = {}) {
    if (!envListEl) return;
    envListEl.innerHTML = '';
    const entries = Object.entries(overrides || {});
    if (entries.length === 0) {
      const blank = createEnvRow();
      if (blank) envListEl.appendChild(blank);
      return;
    }
    entries.forEach(([key, value]) => {
      const row = createEnvRow(key, value);
      if (row) envListEl.appendChild(row);
    });
  }

  function collectEnvOverrides() {
    if (!envListEl) {
      return { ...(currentSettings.envOverrides || {}) };
    }
    const overrides = {};
    envListEl.querySelectorAll('.env-row').forEach(row => {
      const keyEl = row.querySelector('input[data-field="key"]');
      const valEl = row.querySelector('input[data-field="value"]');
      const key = sanitizeEnvKey(keyEl?.value || '');
      const value = (valEl?.value || '').trim();
      if (keyEl && key !== keyEl.value) {
        keyEl.value = key;
      }

      if (key && value) {
        overrides[key] = value;
      }
    });
    return overrides;
  }

  if (addEnvBtn) {
    addEnvBtn.addEventListener('click', () => {
      const row = createEnvRow();
      if (row && envListEl) envListEl.appendChild(row);
    });
  }

  renderEnvOverrides();

  if (gcalIdEl) {
    const help = document.createElement('div');
    help.className = 'text-xs text-gray-600';
    help.innerHTML = `
      <p>Google Calendar setup:</p>
      <ol class="list-decimal list-inside">
        <li><a href="https://console.cloud.google.com/" class="underline" target="_blank" rel="noopener">Google Cloud Console</a>: create a project and enable the Calendar API.</li>
        <li>Generate an OAuth token or service account and share it with your calendar.</li>
        <li>From Google Calendar settings &gt; Integrate calendar, copy the <em>Calendar ID</em>.</li>
        <li>Paste the token & ID above and save.</li>
      </ol>`;
    gcalIdEl.insertAdjacentElement('afterend', help);
  }

  const hotkeyEls = {
    help: document.getElementById('hotkeyHelp'),
    newConsumer: document.getElementById('hotkeyNewConsumer'),
    upload: document.getElementById('hotkeyUpload'),
    editConsumer: document.getElementById('hotkeyEditConsumer'),
    generate: document.getElementById('hotkeyGenerate'),
    remove: document.getElementById('hotkeyRemove'),
    modeBreach: document.getElementById('hotkeyModeBreach'),
    modeAssault: document.getElementById('hotkeyModeAssault'),
    modeIdentity: document.getElementById('hotkeyModeIdentity')
  };
  const saveHotkeysBtn = document.getElementById('saveHotkeys');
  const hotkeyMsgEl = document.getElementById('hotkeyMsg');
  const defaultHotkeys = window.__crm_hotkeys?.defaults || {
    help: 'h',
    newConsumer: 'n',
    upload: 'u',
    editConsumer: 'e',
    generate: 'g',
    remove: 'r',
    modeBreach: 'd',
    modeAssault: 's',
    modeIdentity: 'i'
  };

  function showHotkeyMessage(text, isError = false) {
    if (!hotkeyMsgEl) return;
    hotkeyMsgEl.textContent = text;
    hotkeyMsgEl.classList.remove('hidden');
    if (isError) hotkeyMsgEl.classList.add('text-red-500');
    else hotkeyMsgEl.classList.remove('text-red-500');
    if (hotkeyMsgEl.__timer) {
      clearTimeout(hotkeyMsgEl.__timer);
    }
    hotkeyMsgEl.__timer = setTimeout(() => {
      hotkeyMsgEl.classList.add('hidden');
    }, isError ? 4000 : 2000);
  }

  function loadHotkeys() {
    const active = window.__crm_hotkeys?.get?.() || { ...defaultHotkeys };
    for (const k in hotkeyEls) if (hotkeyEls[k]) hotkeyEls[k].value = active[k] || '';
  }

  function applyHotkeySettings(overrides = {}) {
    try {
      if (typeof window.__crm_hotkeys?.store === 'function') {
        window.__crm_hotkeys.store(overrides);
      } else {
        const normalized = window.__crm_hotkeys?.normalize?.(overrides) || {};
        localStorage.setItem('hotkeys', JSON.stringify(normalized));
        window.__crm_hotkeys?.refresh?.();
      }
    } catch (error) {
      console.warn('Failed to persist hotkeys locally', error);
    }
    loadHotkeys();
  }

  loadHotkeys();

  if (saveHotkeysBtn) {
    saveHotkeysBtn.addEventListener('click', async (event) => {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      const hk = {};
      for (const k in hotkeyEls) {
        const value = (hotkeyEls[k].value || '').trim().toLowerCase().slice(0,1);
        if (value && value !== defaultHotkeys[k]) {
          hk[k] = value;
        }
      }
      const normalized = window.__crm_hotkeys?.normalize?.(hk) || hk;
      const originalLabel = saveHotkeysBtn.textContent;
      saveHotkeysBtn.disabled = true;
      saveHotkeysBtn.textContent = 'Saving…';
      try {
        const resp = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader() },
          body: JSON.stringify({ hotkeys: normalized })
        });
        const result = await resp.json().catch(() => ({}));
        if (!resp.ok || !result.ok) {
          throw new Error(result?.error || 'Failed to save hotkeys');
        }
        currentSettings = { ...currentSettings, ...(result.settings || {}) };
        const latest = currentSettings.hotkeys || normalized;
        currentSettings.hotkeys = latest;
        applyHotkeySettings(latest);
        showHotkeyMessage('Saved!');
      } catch (error) {
        console.error('Failed to save hotkeys', error);
        showHotkeyMessage('Save failed. Try again.', true);
      } finally {
        saveHotkeysBtn.disabled = false;
        saveHotkeysBtn.textContent = originalLabel;
      }
    });
  }

  function applyStatusBadge(el, connected) {
    if (!el) return;
    el.textContent = connected ? 'Connected' : 'Not Connected';
    el.className = 'system-status-badge ' + (connected ? 'connected' : 'not-connected');
  }

  async function loadSystemStatus() {
    try {
      const resp = await fetch('/api/system-status', { headers: authHeader() });
      const data = await resp.json();
      if (!data.ok) return;
      const s = data.services || {};
      applyStatusBadge(document.getElementById('sysStatusStripe'), s.stripe?.connected);
      applyStatusBadge(document.getElementById('sysStatusEmail'), s.email?.connected);
      if (s.email?.from) {
        const fromEl = document.getElementById('sysEmailFrom');
        if (fromEl) fromEl.textContent = s.email.from;
      }
      applyStatusBadge(document.getElementById('sysStatusCertMail'), s.certifiedMail?.connected);
      applyStatusBadge(document.getElementById('sysStatusHibp'), s.hibp?.connected);
      const rssConnected = s.rssFeed?.connected;
      applyStatusBadge(document.getElementById('sysStatusRss'), rssConnected);
      const rssUrlEl = document.getElementById('sysRssUrl');
      if (rssUrlEl && s.rssFeed?.url) {
        rssUrlEl.textContent = s.rssFeed.isDefault ? 'Using default feed' : s.rssFeed.url;
      }
    } catch (e) {
      console.warn('Failed to load system status', e);
    }
  }

  async function load() {
    try {
      const resp = await fetch('/api/settings', { headers: authHeader() });
      const data = await resp.json();
      currentSettings = data.settings || {};
      if (gcalTokenEl) gcalTokenEl.value = currentSettings.googleCalendarToken || '';
      if (gcalIdEl) gcalIdEl.value = currentSettings.googleCalendarId || '';
      if (marketingBaseEl) marketingBaseEl.value = currentSettings.marketingApiBaseUrl || '';
      if (marketingKeyEl) marketingKeyEl.value = currentSettings.marketingApiKey || '';
      if (gmailClientIdEl) gmailClientIdEl.value = currentSettings.gmailClientId || '';
      if (gmailClientSecretEl) gmailClientSecretEl.value = currentSettings.gmailClientSecret || '';
      if (gmailRefreshTokenEl) gmailRefreshTokenEl.value = currentSettings.gmailRefreshToken || '';
      if (fbAppIdEl) fbAppIdEl.value = currentSettings.fbAppId || '';
      if (fbAppSecretEl) fbAppSecretEl.value = currentSettings.fbAppSecret || '';
      if (fbRedirectUriEl) fbRedirectUriEl.value = currentSettings.fbRedirectUri || '';
      if (smartCreditClientIdEl) smartCreditClientIdEl.value = currentSettings.smartCreditClientId || '';
      if (smartCreditClientSecretEl) smartCreditClientSecretEl.value = currentSettings.smartCreditClientSecret || '';
      if (smartCreditRedirectUriEl) smartCreditRedirectUriEl.value = currentSettings.smartCreditRedirectUri || '';
      if (sendgridApiKeyEl) sendgridApiKeyEl.value = currentSettings.sendgridApiKey || '';
      if (sendgridFromEmailEl) sendgridFromEmailEl.value = currentSettings.sendgridFromEmail || '';
      if (sendgridFromNameEl) sendgridFromNameEl.value = currentSettings.sendgridFromName || '';
      if (sgStatusDotEl) {
        const configured = !!(currentSettings.sendgridApiKey && currentSettings.sendgridFromEmail);
        sgStatusDotEl.className = 'status-dot ml-auto ' + (configured ? 'connected' : 'disconnected');
        sgStatusDotEl.title = configured ? 'Configured' : 'Not configured';
      }
      renderEnvOverrides(currentSettings.envOverrides || {});
      applyPortalSettingsForm(currentSettings.clientPortal || {});
      applyHotkeySettings(currentSettings.hotkeys || {});

    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }

  async function init() {
    try {
      const resp = await fetch('/api/me', { headers: authHeader() });
      if (!resp.ok) {
        showAdminNotice();
        return;
      }
      const data = await resp.json();
      const role = data.user?.role || '';
      if (role === 'admin' || role === 'crm_admin' || role === 'crm_agent') {
        panelEl?.classList.remove('hidden');
        if (role === 'admin' || role === 'crm_admin') {
          userMgrEl?.classList.remove('hidden');
        }
        bindSaveButton();
        await Promise.all([load(), loadUsers(), loadSystemStatus()]);
      } else {
        showAdminNotice();
      }
    } catch (e) {
      console.error('Failed to load user', e);
      showAdminNotice();
    }
  }

  async function handleSave(event) {
    if (!saveBtn) return;
    if (event?.preventDefault) {
      event.preventDefault();
    }

    const body = {
      googleCalendarToken: readSettingValue(gcalTokenEl, 'googleCalendarToken'),
      googleCalendarId: readSettingValue(gcalIdEl, 'googleCalendarId'),
      marketingApiBaseUrl: readSettingValue(marketingBaseEl, 'marketingApiBaseUrl'),
      marketingApiKey: readSettingValue(marketingKeyEl, 'marketingApiKey'),
      gmailClientId: readSettingValue(gmailClientIdEl, 'gmailClientId'),
      gmailClientSecret: readSettingValue(gmailClientSecretEl, 'gmailClientSecret'),
      gmailRefreshToken: readSettingValue(gmailRefreshTokenEl, 'gmailRefreshToken'),
      fbAppId: readSettingValue(fbAppIdEl, 'fbAppId'),
      fbAppSecret: readSettingValue(fbAppSecretEl, 'fbAppSecret'),
      fbRedirectUri: readSettingValue(fbRedirectUriEl, 'fbRedirectUri'),
      smartCreditClientId: readSettingValue(smartCreditClientIdEl, 'smartCreditClientId'),
      smartCreditClientSecret: readSettingValue(smartCreditClientSecretEl, 'smartCreditClientSecret'),
      smartCreditRedirectUri: readSettingValue(smartCreditRedirectUriEl, 'smartCreditRedirectUri'),
      sendgridApiKey: readSettingValue(sendgridApiKeyEl, 'sendgridApiKey'),
      sendgridFromEmail: readSettingValue(sendgridFromEmailEl, 'sendgridFromEmail'),
      sendgridFromName: readSettingValue(sendgridFromNameEl, 'sendgridFromName'),
      envOverrides: collectEnvOverrides(),
      clientPortal: hasPortalForm
        ? {
            theme: {
              backgroundColor: (portalBackgroundEl?.value || '').trim(),
              logoUrl: (portalLogoEl?.value || '').trim(),
              taglinePrimary: (portalTaglinePrimaryEl?.value || '').trim(),
              taglineSecondary: (portalTaglineSecondaryEl?.value || '').trim(),
            },
            modules: collectPortalModules(),
          }
        : { ...(currentSettings.clientPortal || {}) },

    };
    const originalLabel = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      const resp = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(body)
      });
      const result = await resp.json().catch(() => ({}));
      if (!resp.ok || !result.ok) {
        throw new Error(result?.error || 'Failed to save settings');
      }
      currentSettings = result.settings || currentSettings;
      if (gcalTokenEl) gcalTokenEl.value = currentSettings.googleCalendarToken || '';
      if (gcalIdEl) gcalIdEl.value = currentSettings.googleCalendarId || '';
      if (marketingBaseEl) marketingBaseEl.value = currentSettings.marketingApiBaseUrl || '';
      if (marketingKeyEl) marketingKeyEl.value = currentSettings.marketingApiKey || '';
      if (gmailClientIdEl) gmailClientIdEl.value = currentSettings.gmailClientId || '';
      if (gmailClientSecretEl) gmailClientSecretEl.value = currentSettings.gmailClientSecret || '';
      if (gmailRefreshTokenEl) gmailRefreshTokenEl.value = currentSettings.gmailRefreshToken || '';
      if (fbAppIdEl) fbAppIdEl.value = currentSettings.fbAppId || '';
      if (fbAppSecretEl) fbAppSecretEl.value = currentSettings.fbAppSecret || '';
      if (fbRedirectUriEl) fbRedirectUriEl.value = currentSettings.fbRedirectUri || '';
      if (smartCreditClientIdEl) smartCreditClientIdEl.value = currentSettings.smartCreditClientId || '';
      if (smartCreditClientSecretEl) smartCreditClientSecretEl.value = currentSettings.smartCreditClientSecret || '';
      if (smartCreditRedirectUriEl) smartCreditRedirectUriEl.value = currentSettings.smartCreditRedirectUri || '';
      if (sendgridApiKeyEl) sendgridApiKeyEl.value = currentSettings.sendgridApiKey || '';
      if (sendgridFromEmailEl) sendgridFromEmailEl.value = currentSettings.sendgridFromEmail || '';
      if (sendgridFromNameEl) sendgridFromNameEl.value = currentSettings.sendgridFromName || '';
      if (sgStatusDotEl) {
        const configured = !!(currentSettings.sendgridApiKey && currentSettings.sendgridFromEmail);
        sgStatusDotEl.className = 'status-dot ml-auto ' + (configured ? 'connected' : 'disconnected');
        sgStatusDotEl.title = configured ? 'Configured' : 'Not configured';
      }
      renderEnvOverrides(currentSettings.envOverrides || {});
      applyPortalSettingsForm(currentSettings.clientPortal || {});
      applyHotkeySettings(currentSettings.hotkeys || {});
      if (msgEl) {
        msgEl.textContent = 'Saved!';
        msgEl.classList.remove('hidden');
        msgEl.classList.remove('text-red-500');
        setTimeout(() => msgEl.classList.add('hidden'), 2000);
      }
    } catch (e) {
      console.error('Failed to save settings', e);
      if (msgEl) {
        msgEl.textContent = 'Save failed. Check the fields and try again.';
        msgEl.classList.remove('hidden');
        msgEl.classList.add('text-red-500');
        setTimeout(() => msgEl.classList.add('hidden'), 4000);
      }
    }
    finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalLabel;
    }
  }

  function bindSaveButton() {
    if (!saveBtn || saveBtn.dataset.bound === '1') return;
    saveBtn.disabled = false;
    saveBtn.dataset.bound = '1';
    saveBtn.addEventListener('click', handleSave);
  }

  init().then(() => initIntelliSensePanel()).catch(console.error);

  async function loadUsers() {
    if (!userListEl) return;
    try {
      const resp = await fetch('/api/users', { headers: authHeader() });
      const data = await resp.json();
      renderUsers(data.users || []);
    } catch (e) {
      console.error('Failed to load users', e);
    }
  }

  function renderUsers(users) {
    userListEl.innerHTML = '';
    users.forEach(u => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between';
      const label = document.createElement('span');
      label.textContent = u.name || u.username;
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = (u.permissions || []).includes('consumers');
      chk.addEventListener('change', async () => {
        const perms = new Set(u.permissions || []);
        if (chk.checked) perms.add('consumers');
        else perms.delete('consumers');
        await fetch(`/api/users/${u.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeader() },
          body: JSON.stringify({ permissions: [...perms] })
        });
        u.permissions = [...perms];
      });
      row.append(label, chk);
      userListEl.appendChild(row);
    });
  }

  const INTELLISENSE_SCENARIOS = [
    { group: 'First Round', key: 'first:medical_collection',      label: 'Medical debt in collections',              defaultTemplate: 'hipaa-medical-debt' },
    { group: 'First Round', key: 'first:harassment_collection',   label: 'Harassment / abusive collection',          defaultTemplate: 'fdcpa-harassment' },
    { group: 'First Round', key: 'first:time_barred_collection',  label: 'Time-barred debt (collection)',            defaultTemplate: 'fdcpa-time-barred' },
    { group: 'First Round', key: 'first:metro2_inconsistency',    label: 'Metro 2 inconsistency / compliance',       defaultTemplate: 'metro2-inconsistency-dispute' },
    { group: 'First Round', key: 'first:obsolete_debt',           label: 'Obsolete / expired debt',                 defaultTemplate: 'obsolete-debt' },
    { group: 'First Round', key: 'first:bankruptcy',              label: 'Bankruptcy misreporting',                  defaultTemplate: 'bankruptcy-misreporting' },
    { group: 'First Round', key: 'first:tila_loan',               label: 'TILA disclosure violation (loan)',         defaultTemplate: 'tila-disclosure' },
    { group: 'First Round', key: 'first:general_collection',      label: 'General collection account',              defaultTemplate: 'debt-validation' },
    { group: 'First Round', key: 'first:reinsertion',             label: 'Re-inserted / reappearing item',          defaultTemplate: 'reinsertion-dispute' },
    { group: 'First Round', key: 'first:late_payment_only',       label: 'Late payment only (goodwill eligible)',   defaultTemplate: 'goodwill-removal' },
    { group: 'First Round', key: 'first:violations_general',      label: 'General inaccuracies (has violations)',   defaultTemplate: '611-general-dispute' },
    { group: 'First Round', key: 'first:default',                 label: 'Default (no specific match)',             defaultTemplate: '611-general-dispute' },
    { group: 'Follow-up: Awaiting Response', key: 'next:awaiting_time_barred',   label: 'Awaiting — time-barred collection (round 2+)',  defaultTemplate: 'fdcpa-time-barred' },
    { group: 'Follow-up: Awaiting Response', key: 'next:awaiting_collection',    label: 'Awaiting — general collection',                 defaultTemplate: 'debt-validation' },
    { group: 'Follow-up: Awaiting Response', key: 'next:awaiting_bankruptcy',    label: 'Awaiting — bankruptcy',                        defaultTemplate: 'bankruptcy-misreporting' },
    { group: 'Follow-up: Awaiting Response', key: 'next:awaiting_obsolete',      label: 'Awaiting — obsolete debt',                     defaultTemplate: 'obsolete-debt' },
    { group: 'Follow-up: Awaiting Response', key: 'next:awaiting_metro2',        label: 'Awaiting — Metro 2 issues',                    defaultTemplate: 'metro2-inconsistency-dispute' },
    { group: 'Follow-up: Awaiting Response', key: 'next:awaiting_default',       label: 'Awaiting — default',                           defaultTemplate: 'second-round-dispute' },
    { group: 'Follow-up: No Response',       key: 'next:no_response_pfd',           label: 'No response — pay-for-delete offer',              defaultTemplate: 'pay-for-delete-followup' },
    { group: 'Follow-up: No Response',       key: 'next:no_response_time_barred',   label: 'No response — time-barred (round 2+)',            defaultTemplate: 'fdcpa-time-barred' },
    { group: 'Follow-up: No Response',       key: 'next:no_response_metro2_r3',     label: 'No response — Metro 2 (round 3+)',               defaultTemplate: 'metro2-deletion-demand' },
    { group: 'Follow-up: No Response',       key: 'next:no_response_r3',            label: 'No response — escalation (round 3+)',             defaultTemplate: 'ag-cfpb-escalation' },
    { group: 'Follow-up: No Response',       key: 'next:no_response_collection_r2', label: 'No response — collection round 2+ (PFD)',         defaultTemplate: 'pay-for-delete' },
    { group: 'Follow-up: No Response',       key: 'next:no_response_collection',    label: 'No response — general collection',                defaultTemplate: 'debt-validation' },
    { group: 'Follow-up: No Response',       key: 'next:no_response_factual_r2',    label: 'No response — factual errors (round 2+)',         defaultTemplate: 'factual-errors-layer' },
    { group: 'Follow-up: No Response',       key: 'next:no_response_default',       label: 'No response — default',                          defaultTemplate: 'second-round-dispute' },
    { group: 'Follow-up: Verified',          key: 'next:verified_metro2_r3',        label: 'Verified — Metro 2 (round 3+)',                   defaultTemplate: 'metro2-deletion-demand' },
    { group: 'Follow-up: Verified',          key: 'next:verified_r3',               label: 'Verified — escalation (round 3+)',                defaultTemplate: 'ag-cfpb-escalation' },
    { group: 'Follow-up: Verified',          key: 'next:verified_collection_r2',    label: 'Verified — collection round 2+ (PFD)',            defaultTemplate: 'pay-for-delete' },
    { group: 'Follow-up: Verified',          key: 'next:verified_collection',       label: 'Verified — collection default',                   defaultTemplate: '623-direct-dispute' },
    { group: 'Follow-up: Verified',          key: 'next:verified_factual',          label: 'Verified — factual errors',                      defaultTemplate: 'factual-errors-layer' },
    { group: 'Follow-up: Verified',          key: 'next:verified_metro2',           label: 'Verified — Metro 2 (method of verification)',    defaultTemplate: 'method-of-verification' },
    { group: 'Follow-up: Verified',          key: 'next:verified_default',          label: 'Verified — default',                             defaultTemplate: '609-disclosure' },
    { group: 'Follow-up: Other Outcomes',    key: 'next:medical_collection',        label: 'Medical collection follow-up',                    defaultTemplate: 'hipaa-medical-debt' },
    { group: 'Follow-up: Other Outcomes',    key: 'next:harassment_collection',     label: 'Harassment follow-up',                           defaultTemplate: 'fdcpa-harassment' },
    { group: 'Follow-up: Other Outcomes',    key: 'next:stalled_r3',               label: 'Stalled — round 3+ (arbitration)',                defaultTemplate: 'arbitration-election' },
    { group: 'Follow-up: Other Outcomes',    key: 'next:stalled_default',           label: 'Stalled — default',                              defaultTemplate: '623-direct-dispute' },
    { group: 'Follow-up: Other Outcomes',    key: 'next:partial_goodwill',          label: 'Partial correction — goodwill eligible',         defaultTemplate: 'goodwill-removal' },
    { group: 'Follow-up: Other Outcomes',    key: 'next:partial_collection',        label: 'Partial correction — collection',                 defaultTemplate: '623-direct-dispute' },
    { group: 'Follow-up: Other Outcomes',    key: 'next:partial_default',           label: 'Partial correction — default',                   defaultTemplate: '611-general-dispute' },
    { group: 'Follow-up: Other Outcomes',    key: 'next:updated',                   label: 'Item updated — verification request',            defaultTemplate: 'method-of-verification' },
    { group: 'Follow-up: Other Outcomes',    key: 'next:r3_metro2',                 label: 'Round 3+ — Metro 2 deletion demand',             defaultTemplate: 'metro2-deletion-demand' },
    { group: 'Follow-up: Other Outcomes',    key: 'next:r3_default',               label: 'Round 3+ — escalation',                          defaultTemplate: 'ag-cfpb-escalation' },
    { group: 'Follow-up: Other Outcomes',    key: 'next:collection_time_barred_r2', label: 'Collection — time-barred round 2+',              defaultTemplate: 'fdcpa-time-barred' },
    { group: 'Follow-up: Other Outcomes',    key: 'next:collection_r2_pfd',         label: 'Collection — round 2+ (PFD)',                    defaultTemplate: 'pay-for-delete' },
    { group: 'Follow-up: Other Outcomes',    key: 'next:collection_default',        label: 'Collection — default',                           defaultTemplate: 'debt-validation' },
    { group: 'Follow-up: Other Outcomes',    key: 'next:default',                   label: 'Default follow-up',                              defaultTemplate: 'second-round-dispute' },
  ];

  let _intelliSenseTemplates = [];
  let _intelliSenseRules = {};

  function escHtmlIS(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function _buildGroupId(group) {
    return 'is-g-' + group.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  }

  function _updateGroupBadge(groupEl) {
    const selects = groupEl.querySelectorAll('select[data-scenario]');
    const count = [...selects].filter(s => s.value !== '').length;
    const badge = groupEl.querySelector('.is-badge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count + ' customized';
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  function _setGroupOpen(groupEl, open) {
    const body = groupEl.querySelector('.is-group-body');
    const chevron = groupEl.querySelector('.is-chevron');
    if (!body || !chevron) return;
    if (open) {
      body.style.display = 'block';
      chevron.style.transform = 'rotate(90deg)';
    } else {
      body.style.display = 'none';
      chevron.style.transform = 'rotate(0deg)';
    }
  }

  function applyIntelliSenseFilter() {
    const searchEl = document.getElementById('intelliSenseSearch');
    const customOnlyEl = document.getElementById('intelliSenseCustomOnly');
    const container = document.getElementById('intelliSenseGroups');
    if (!container) return;

    const term = (searchEl?.value || '').trim().toLowerCase();
    const customOnly = customOnlyEl?.checked || false;

    container.querySelectorAll('.is-group').forEach(groupEl => {
      let visibleCount = 0;
      let hasSearchMatch = false;

      groupEl.querySelectorAll('.is-scenario-row').forEach(rowEl => {
        const label = (rowEl.dataset.label || '').toLowerCase();
        const sel = rowEl.querySelector('select[data-scenario]');
        const isCustomized = sel && sel.value !== '';

        const matchesSearch = !term || label.includes(term);
        const matchesFilter = !customOnly || isCustomized;
        const visible = matchesSearch && matchesFilter;

        rowEl.style.display = visible ? '' : 'none';
        if (visible) visibleCount++;
        if (matchesSearch && term) hasSearchMatch = true;
      });

      if (visibleCount === 0) {
        groupEl.style.display = 'none';
      } else {
        groupEl.style.display = '';
        if (term && hasSearchMatch) _setGroupOpen(groupEl, true);
      }
    });

    const noResultsEl = document.getElementById('intelliSenseNoResults');
    const anyVisible = [...container.querySelectorAll('.is-group')].some(g => g.style.display !== 'none');
    if (noResultsEl) noResultsEl.style.display = anyVisible ? 'none' : 'block';
  }

  function renderIntelliSenseGroups() {
    const container = document.getElementById('intelliSenseGroups');
    if (!container) return;

    const groupMap = {};
    const groupOrder = [];
    for (const s of INTELLISENSE_SCENARIOS) {
      if (!groupMap[s.group]) { groupMap[s.group] = []; groupOrder.push(s.group); }
      groupMap[s.group].push(s);
    }

    const optionsList = [{ id: '', name: '— System default —' }, ..._intelliSenseTemplates];

    container.innerHTML = groupOrder.map(group => {
      const gid = _buildGroupId(group);
      const scenarios = groupMap[group];
      const customizedCount = scenarios.filter(s => !!_intelliSenseRules[s.key]).length;
      const badgeDisplay = customizedCount > 0 ? 'inline-block' : 'none';

      const rowsHtml = scenarios.map(s => {
        const curVal = _intelliSenseRules[s.key] || '';
        const optsHtml = optionsList.map(t =>
          `<option value="${escHtmlIS(t.id)}"${t.id === curVal ? ' selected' : ''}>${escHtmlIS(t.name || t.id)}</option>`
        ).join('');
        return `<div class="is-scenario-row" data-label="${escHtmlIS(s.label.toLowerCase())}" style="display:flex;flex-direction:column;gap:3px;">
          <span style="font-size:11px;color:#9ca3af;line-height:1.3;">${escHtmlIS(s.label)}</span>
          <select data-scenario="${escHtmlIS(s.key)}" style="font-size:12px;padding:4px 6px;background:#1a1a1e;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e5e5e5;width:100%;">${optsHtml}</select>
          <span style="font-size:10px;color:#374151;">Default: ${escHtmlIS(s.defaultTemplate)}</span>
        </div>`;
      }).join('');

      return `<div class="is-group" style="border:1px solid rgba(255,255,255,0.07);border-radius:10px;overflow:hidden;">
        <button type="button" class="is-group-header" data-gid="${escHtmlIS(gid)}"
          style="width:100%;display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,0.03);border:none;cursor:pointer;text-align:left;">
          <span class="is-chevron" style="font-size:10px;color:#6b7280;transition:transform 0.18s;transform:rotate(0deg);flex-shrink:0;">&#9654;</span>
          <span style="font-size:12px;font-weight:600;color:#d1d5db;flex:1;">${escHtmlIS(group)}</span>
          <span class="is-badge" style="display:${badgeDisplay};font-size:10px;padding:2px 8px;border-radius:20px;background:rgba(212,168,83,0.15);color:#d4a853;font-weight:600;">${customizedCount} customized</span>
          <span style="font-size:11px;color:#4b5563;">${scenarios.length} scenario${scenarios.length !== 1 ? 's' : ''}</span>
        </button>
        <div class="is-group-body" style="display:none;padding:12px 14px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;">${rowsHtml}</div>
        </div>
      </div>`;
    }).join('') + `<div id="intelliSenseNoResults" style="display:none;text-align:center;color:#555;padding:16px;font-size:13px;">No matching scenarios</div>`;

    container.querySelectorAll('.is-group-header').forEach(btn => {
      btn.addEventListener('click', () => {
        const groupEl = btn.closest('.is-group');
        const body = groupEl.querySelector('.is-group-body');
        const isOpen = body.style.display !== 'none';
        _setGroupOpen(groupEl, !isOpen);
      });
    });

    container.querySelectorAll('select[data-scenario]').forEach(sel => {
      sel.addEventListener('change', () => {
        const groupEl = sel.closest('.is-group');
        if (groupEl) _updateGroupBadge(groupEl);
      });
    });
  }

  function collectIntelliSenseRules() {
    const rules = {};
    document.querySelectorAll('#intelliSenseGroups select[data-scenario]').forEach(sel => {
      const key = sel.dataset.scenario;
      const val = sel.value;
      if (val) rules[key] = val;
    });
    return rules;
  }

  async function loadIntelliSenseTemplates() {
    try {
      const [tplResp, sampleResp] = await Promise.all([
        fetch('/api/templates', { headers: authHeader() }).then(r => r.json()).catch(() => ({})),
        fetch('/api/sample-letters', { headers: authHeader() }).then(r => r.json()).catch(() => ({})),
      ]);
      const userTemplates = (tplResp.templates || []).map(t => ({ id: t.id, name: t.name || t.id }));
      const sampleTemplates = (sampleResp.templates || []).map(t => ({ id: t.id, name: t.name || t.id }));
      const seen = new Set();
      _intelliSenseTemplates = [];
      for (const t of [...sampleTemplates, ...userTemplates]) {
        if (!seen.has(t.id)) { seen.add(t.id); _intelliSenseTemplates.push(t); }
      }
      _intelliSenseTemplates.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
    } catch (e) {
      console.warn('Failed to load templates for intellisense panel', e);
    }
  }

  async function initIntelliSensePanel() {
    const container = document.getElementById('intelliSenseGroups');
    const saveBtn2 = document.getElementById('saveIntelliSense');
    const resetBtn = document.getElementById('resetIntelliSense');
    const msgEl2 = document.getElementById('intelliSenseMsg');
    if (!container) return;

    await loadIntelliSenseTemplates();
    _intelliSenseRules = (currentSettings && currentSettings.letterIntelliSenseRules && typeof currentSettings.letterIntelliSenseRules === 'object')
      ? { ...currentSettings.letterIntelliSenseRules }
      : {};
    renderIntelliSenseGroups();

    const searchEl = document.getElementById('intelliSenseSearch');
    const customOnlyEl = document.getElementById('intelliSenseCustomOnly');
    if (searchEl) searchEl.addEventListener('input', applyIntelliSenseFilter);
    if (customOnlyEl) customOnlyEl.addEventListener('change', applyIntelliSenseFilter);

    if (saveBtn2) {
      saveBtn2.addEventListener('click', async () => {
        const rules = collectIntelliSenseRules();
        const originalLabel = saveBtn2.textContent;
        saveBtn2.disabled = true;
        saveBtn2.textContent = 'Saving…';
        try {
          const resp = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader() },
            body: JSON.stringify({ letterIntelliSenseRules: rules })
          });
          const result = await resp.json().catch(() => ({}));
          if (!resp.ok || !result.ok) throw new Error(result?.error || 'Save failed');
          _intelliSenseRules = rules;
          if (currentSettings) currentSettings.letterIntelliSenseRules = rules;
          if (msgEl2) {
            msgEl2.textContent = 'Saved!';
            msgEl2.classList.remove('hidden');
            setTimeout(() => msgEl2.classList.add('hidden'), 2000);
          }
        } catch (err) {
          console.error('Failed to save intellisense rules', err);
          if (msgEl2) {
            msgEl2.textContent = 'Save failed.';
            msgEl2.classList.remove('hidden');
            msgEl2.style.color = '#f87171';
            setTimeout(() => { msgEl2.classList.add('hidden'); msgEl2.style.color = ''; }, 3000);
          }
        } finally {
          saveBtn2.disabled = false;
          saveBtn2.textContent = originalLabel;
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        _intelliSenseRules = {};
        renderIntelliSenseGroups();
        applyIntelliSenseFilter();
      });
    }
  }


});


