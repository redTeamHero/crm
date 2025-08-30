/* public/my-company.js */
document.addEventListener('DOMContentLoaded', () => {
  const nameEl = document.getElementById('companyName');
  const phoneEl = document.getElementById('companyPhone');
  const emailEl = document.getElementById('companyEmail');
  const addrEl = document.getElementById('companyAddress');
  const saveBtn = document.getElementById('saveCompany');

  const company = JSON.parse(localStorage.getItem('companyInfo') || '{}');
  if (nameEl) nameEl.value = company.name || '';
  if (phoneEl) phoneEl.value = company.phone || '';
  if (emailEl) emailEl.value = company.email || '';
  if (addrEl) addrEl.value = company.address || '';

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const data = {
        name: nameEl.value.trim(),
        phone: phoneEl.value.trim(),
        email: emailEl.value.trim(),
        address: addrEl.value.trim(),
      };
      localStorage.setItem('companyInfo', JSON.stringify(data));
    });
  }

  let auth = localStorage.getItem('auth');
  if (!auth) {
    const u = prompt('Admin username');
    const p = prompt('Admin password');
    if (u && p) {
      auth = btoa(`${u}:${p}`);
      localStorage.setItem('auth', auth);
    }
  }

  let members = [];
  const listEl = document.getElementById('teamMemberList');

  async function loadMembers() {
    if (!auth || !listEl) return;
    try {
      const res = await fetch('/api/users', {
        headers: { Authorization: 'Basic ' + auth }
      });
      const data = await res.json();
      members = data.users || [];
    } catch {
      members = [];
    }
    renderMembers();
  }

  function renderMembers() {
    if (!listEl) return;
    if (!members.length) {
      listEl.innerHTML = '<div class="muted text-sm">No team members.</div>';
      return;
    }
    listEl.innerHTML = members.map(m => `
      <div class="flex items-center justify-between border rounded px-2 py-1">
        <div>
          <div class="font-medium">${m.username}</div>
          <div class="text-xs muted">${m.role || ''}${m.permissions && m.permissions.length ? ' - ' + m.permissions.join(', ') : ''}</div>
        </div>
      </div>
    `).join('');
  }

  const addBtn = document.getElementById('addTeamMember');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      const uEl = document.getElementById('tmUser');
      const pEl = document.getElementById('tmPass');
      if (!uEl.value.trim() || !auth) return;
      const perms = [];
      if (document.getElementById('permContacts').checked) perms.push('contacts');
      if (document.getElementById('permTasks').checked) perms.push('tasks');
      if (document.getElementById('permReports').checked) perms.push('reports');
      await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic ' + auth
        },
        body: JSON.stringify({
          username: uEl.value.trim(),
          password: pEl.value,
          role: 'member',
          permissions: perms
        })
      });
      // Generate shareable link that preloads credentials via ?auth param
      const link = `${location.origin}/dashboard?auth=${btoa(`${uEl.value.trim()}:${pEl.value}`)}`;
      // Offer the link for copying/sharing
      prompt('Share this link with the new team member:', link);
      uEl.value = '';
      pEl.value = '';
      document.getElementById('permContacts').checked = false;
      document.getElementById('permTasks').checked = false;
      document.getElementById('permReports').checked = false;
      loadMembers();
    });
  }

  loadMembers();
});
