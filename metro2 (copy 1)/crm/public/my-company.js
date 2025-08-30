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
    if (addBtn) addBtn.disabled = true;
    try {
      const res = await fetch('/api/users', {
        headers: { Authorization: 'Basic ' + auth }
      });
      if (res.status === 401 || res.status === 403) {
        alert('You are not authorized to add team members');
        return;
      }
      const data = await res.json();
      members = data.users || [];
      if (addBtn) addBtn.disabled = false;
      const teamData = members.map(m => ({ name: m.username, role: m.role, email: m.email }));
      localStorage.setItem('teamMembers', JSON.stringify(teamData));
    } catch {
      members = [];
      localStorage.removeItem('teamMembers');
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
  if (addBtn) addBtn.disabled = true;
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      const uEl = document.getElementById('tmUser');
      const pEl = document.getElementById('tmPass');
      if (!uEl.value.trim() || !auth) return;
      const body = { username: uEl.value.trim() };
      if (pEl.value) body.password = pEl.value;
      let res;
      try {
        res = await fetch('/api/team-members', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Basic ' + auth
          },
          body: JSON.stringify(body)
        });
      } catch {
        alert('Network error while creating team member');
        return;
      }
      if (res.status === 401 || res.status === 403) {
        alert('You are not authorized to add team members');
        addBtn.disabled = true;

        return;
      }
      if (!res.ok) {
        alert('Failed to create team member');
        return;
      }

      const { member } = await res.json();
      const link = `${location.origin}/team/${member.token}`;
      prompt(`Share this link with the new team member:\n${link}\nInitial password: ${member.password}`, link);

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
