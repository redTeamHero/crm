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

  let members = JSON.parse(localStorage.getItem('teamMembers') || '[]');
  const listEl = document.getElementById('teamMemberList');
  function renderMembers() {
    if (!listEl) return;
    if (!members.length) {
      listEl.innerHTML = '<div class="muted text-sm">No team members.</div>';
      return;
    }
    listEl.innerHTML = members.map((m,i) => `
      <div class="flex items-center justify-between border rounded px-2 py-1">
        <div>
          <div class="font-medium">${m.name}</div>
          <div class="text-xs muted">${m.role || ''}${m.email ? ' - ' + m.email : ''}</div>
        </div>
        <button data-index="${i}" class="text-red-500 text-xs remove-member">Remove</button>
      </div>
    `).join('');
    listEl.querySelectorAll('.remove-member').forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = parseInt(e.target.dataset.index, 10);
        members.splice(idx,1);
        localStorage.setItem('teamMembers', JSON.stringify(members));
        renderMembers();
      });
    });
  }
  renderMembers();

  const addBtn = document.getElementById('addTeamMember');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const n = document.getElementById('tmName');
      const r = document.getElementById('tmRole');
      const e = document.getElementById('tmEmail');
      if (!n.value.trim()) return;
      members.push({ name: n.value.trim(), role: r.value.trim(), email: e.value.trim() });
      localStorage.setItem('teamMembers', JSON.stringify(members));
      n.value = '';
      r.value = '';
      e.value = '';
      renderMembers();
    });
  }
});
