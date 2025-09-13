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

  const saveBtn = document.getElementById('saveSettings');
  const msgEl = document.getElementById('saveMsg');

  async function load() {
    try {
      const resp = await fetch('/api/settings');
      const data = await resp.json();
      if (hibpEl) hibpEl.value = data.settings?.hibpApiKey || '';
      if (rssEl) rssEl.value = data.settings?.rssFeedUrl || '';
      if (gcalTokenEl) gcalTokenEl.value = data.settings?.googleCalendarToken || '';
      if (gcalIdEl) gcalIdEl.value = data.settings?.googleCalendarId || '';
      if (stripeEl) stripeEl.value = data.settings?.stripeApiKey || '';

    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }

  async function init() {
    try {
      const resp = await fetch('/api/me');
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

      };
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (msgEl) {
          msgEl.classList.remove('hidden');
          setTimeout(() => msgEl.classList.add('hidden'), 2000);
        }
      } catch (e) {
        console.error('Failed to save settings', e);
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

