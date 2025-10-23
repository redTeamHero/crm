/* public/settings.js */
import { setupPageTour } from './tour-guide.js';

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
  const hibpEl = document.getElementById('hibpKey');
  const rssEl = document.getElementById('rssFeedUrl');
  const gcalTokenEl = document.getElementById('gcalToken');
  const gcalIdEl = document.getElementById('gcalId');
  const stripeEl = document.getElementById('stripeKey');
  const marketingBaseEl = document.getElementById('marketingApiBaseUrl');
  const marketingKeyEl = document.getElementById('marketingApiKey');
  const sendCertifiedMailEl = document.getElementById('sendCertifiedMailKey');
  const gmailClientIdEl = document.getElementById('gmailClientId');
  const gmailClientSecretEl = document.getElementById('gmailClientSecret');
  const gmailRefreshTokenEl = document.getElementById('gmailRefreshToken');
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

  const MAX_ENV_KEY_LEN = 64;

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

  function loadHotkeys() {
    const active = window.__crm_hotkeys?.get?.() || { ...defaultHotkeys };
    for (const k in hotkeyEls) if (hotkeyEls[k]) hotkeyEls[k].value = active[k] || '';
  }

  loadHotkeys();

  if (saveHotkeysBtn) {
    saveHotkeysBtn.addEventListener('click', () => {
      const hk = {};
      for (const k in hotkeyEls) {
        const value = (hotkeyEls[k].value || '').trim().toLowerCase().slice(0,1);
        if (value && value !== defaultHotkeys[k]) {
          hk[k] = value;
        }
      }
      localStorage.setItem('hotkeys', JSON.stringify(hk));
      window.__crm_hotkeys?.refresh?.();
      if (hotkeyMsgEl) {
        hotkeyMsgEl.classList.remove('hidden');
        setTimeout(() => hotkeyMsgEl.classList.add('hidden'), 2000);
      }
    });
  }

  async function load() {
    try {
      const resp = await fetch('/api/settings');
      const data = await resp.json();
      currentSettings = data.settings || {};
      if (hibpEl) hibpEl.value = currentSettings.hibpApiKey || '';
      if (rssEl) rssEl.value = currentSettings.rssFeedUrl || '';
      if (gcalTokenEl) gcalTokenEl.value = currentSettings.googleCalendarToken || '';
      if (gcalIdEl) gcalIdEl.value = currentSettings.googleCalendarId || '';
      if (stripeEl) stripeEl.value = currentSettings.stripeApiKey || '';
      if (marketingBaseEl) marketingBaseEl.value = currentSettings.marketingApiBaseUrl || '';
      if (marketingKeyEl) marketingKeyEl.value = currentSettings.marketingApiKey || '';
      if (sendCertifiedMailEl) sendCertifiedMailEl.value = currentSettings.sendCertifiedMailApiKey || '';
      if (gmailClientIdEl) gmailClientIdEl.value = currentSettings.gmailClientId || '';
      if (gmailClientSecretEl) gmailClientSecretEl.value = currentSettings.gmailClientSecret || '';
      if (gmailRefreshTokenEl) gmailRefreshTokenEl.value = currentSettings.gmailRefreshToken || '';
      renderEnvOverrides(currentSettings.envOverrides || {});
      applyPortalSettingsForm(currentSettings.clientPortal || {});

    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }

  async function init() {
    try {
      const resp = await fetch('/api/me', { headers: authHeader() });
      if (!resp.ok) {
        return;
      }
      const data = await resp.json();
      if (data.user?.role === 'admin') {
        panelEl?.classList.remove('hidden');
        userMgrEl?.classList.remove('hidden');
        await Promise.all([load(), loadUsers()]);
      }
    } catch (e) {
      console.error('Failed to load user', e);
    }
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const body = {
        hibpApiKey: readSettingValue(hibpEl, 'hibpApiKey'),
        rssFeedUrl: readSettingValue(rssEl, 'rssFeedUrl'),
        googleCalendarToken: readSettingValue(gcalTokenEl, 'googleCalendarToken'),
        googleCalendarId: readSettingValue(gcalIdEl, 'googleCalendarId'),
        stripeApiKey: readSettingValue(stripeEl, 'stripeApiKey'),
        marketingApiBaseUrl: readSettingValue(marketingBaseEl, 'marketingApiBaseUrl'),
        marketingApiKey: readSettingValue(marketingKeyEl, 'marketingApiKey'),
        sendCertifiedMailApiKey: readSettingValue(sendCertifiedMailEl, 'sendCertifiedMailApiKey'),
        gmailClientId: readSettingValue(gmailClientIdEl, 'gmailClientId'),
        gmailClientSecret: readSettingValue(gmailClientSecretEl, 'gmailClientSecret'),
        gmailRefreshToken: readSettingValue(gmailRefreshTokenEl, 'gmailRefreshToken'),
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const result = await resp.json().catch(() => ({}));
        if (!resp.ok || !result.ok) {
          throw new Error(result?.error || 'Failed to save settings');
        }
        currentSettings = result.settings || currentSettings;
        if (hibpEl) hibpEl.value = currentSettings.hibpApiKey || '';
        if (rssEl) rssEl.value = currentSettings.rssFeedUrl || '';
        if (gcalTokenEl) gcalTokenEl.value = currentSettings.googleCalendarToken || '';
        if (gcalIdEl) gcalIdEl.value = currentSettings.googleCalendarId || '';
        if (stripeEl) stripeEl.value = currentSettings.stripeApiKey || '';
        if (marketingBaseEl) marketingBaseEl.value = currentSettings.marketingApiBaseUrl || '';
        if (marketingKeyEl) marketingKeyEl.value = currentSettings.marketingApiKey || '';
        if (sendCertifiedMailEl) sendCertifiedMailEl.value = currentSettings.sendCertifiedMailApiKey || '';
        if (gmailClientIdEl) gmailClientIdEl.value = currentSettings.gmailClientId || '';
        if (gmailClientSecretEl) gmailClientSecretEl.value = currentSettings.gmailClientSecret || '';
        if (gmailRefreshTokenEl) gmailRefreshTokenEl.value = currentSettings.gmailRefreshToken || '';
        renderEnvOverrides(currentSettings.envOverrides || {});
        applyPortalSettingsForm(currentSettings.clientPortal || {});
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
    });
  }

  init();
  
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
});

