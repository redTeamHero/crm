/* public/settings.js */
document.addEventListener('DOMContentLoaded', () => {
  const panelEl = document.getElementById('adminPanel');
  const userMgrEl = document.getElementById('userManager');
  const userListEl = document.getElementById('userList');
  const hibpEl = document.getElementById('hibpKey');
  const rssEl = document.getElementById('rssFeedUrl');
  const gcalTokenEl = document.getElementById('gcalToken');
  const gcalIdEl = document.getElementById('gcalId');
  const stripeEl = document.getElementById('stripeKey');
  const envListEl = document.getElementById('envList');
  const addEnvBtn = document.getElementById('addEnvRow');

  const saveBtn = document.getElementById('saveSettings');
  const msgEl = document.getElementById('saveMsg');

  const MAX_ENV_KEY_LEN = 64;

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
    valueInput.placeholder = 'Value / Valor';
    valueInput.value = value;
    valueInput.dataset.field = 'value';
    valueInput.autocomplete = 'off';
    valueInput.spellcheck = false;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn text-xs px-3';
    removeBtn.textContent = 'Remove / Quitar';
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
    if (!envListEl) return {};
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
      <p>Google Calendar setup / Configuración:</p>
      <ol class="list-decimal list-inside">
        <li><a href="https://console.cloud.google.com/" class="underline" target="_blank" rel="noopener">Google Cloud Console</a>: create project & enable Calendar API / crea un proyecto y habilita la API de Calendar.</li>
        <li>Generate an OAuth token or service account and share it with your calendar / Genera un token OAuth o una cuenta de servicio y compártelo con tu calendario.</li>
        <li>From Google Calendar settings &gt; Integrate calendar, copy the <em>Calendar ID</em> / En Configuración &gt; Integrar calendario, copia el <em>ID del calendario</em>.</li>
        <li>Paste the token & ID above and save / Pega el token y el ID arriba y guarda.</li>
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
  const defaultHotkeys = {
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
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem('hotkeys')) || {}; } catch {}
    const hk = { ...defaultHotkeys, ...stored };
    for (const k in hotkeyEls) if (hotkeyEls[k]) hotkeyEls[k].value = hk[k] || '';
  }

  loadHotkeys();

  if (saveHotkeysBtn) {
    saveHotkeysBtn.addEventListener('click', () => {
      const hk = {};
      for (const k in hotkeyEls) hk[k] = (hotkeyEls[k].value || '').trim().toLowerCase().slice(0,1);
      localStorage.setItem('hotkeys', JSON.stringify(hk));
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
      if (hibpEl) hibpEl.value = data.settings?.hibpApiKey || '';
      if (rssEl) rssEl.value = data.settings?.rssFeedUrl || '';
      if (gcalTokenEl) gcalTokenEl.value = data.settings?.googleCalendarToken || '';
      if (gcalIdEl) gcalIdEl.value = data.settings?.googleCalendarId || '';
      if (stripeEl) stripeEl.value = data.settings?.stripeApiKey || '';
      renderEnvOverrides(data.settings?.envOverrides || {});

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
        hibpApiKey: hibpEl.value.trim(),
        rssFeedUrl: rssEl.value.trim(),
        googleCalendarToken: gcalTokenEl.value.trim(),
        googleCalendarId: gcalIdEl.value.trim(),
        stripeApiKey: stripeEl.value.trim(),
        envOverrides: collectEnvOverrides(),

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
        if (hibpEl) hibpEl.value = result.settings?.hibpApiKey || '';
        if (rssEl) rssEl.value = result.settings?.rssFeedUrl || '';
        if (gcalTokenEl) gcalTokenEl.value = result.settings?.googleCalendarToken || '';
        if (gcalIdEl) gcalIdEl.value = result.settings?.googleCalendarId || '';
        if (stripeEl) stripeEl.value = result.settings?.stripeApiKey || '';
        renderEnvOverrides(result.settings?.envOverrides || {});
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

