import { api, createTeamMember } from './common.js';

const state = {
  members: []
};

let inviteDialog;
let inviteForm;
let inviteSuccess;
let inviteError;
let inviteSubmit;
let inviteName;
let inviteEmail;
let inviteToken;
let invitePassword;
let inviteAnother;
let teamLoading;
let teamError;
let teamEmpty;
let teamTable;
let teamTableWrap;

const INVITE_BUTTON_LABEL = 'Send Invite';

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function syncTeamToLocalStorage() {
  const payload = state.members.map(member => ({
    id: member.id,
    name: member.name || member.email || 'Team member',
    email: member.email || '',
    role: 'team'
  }));
  localStorage.setItem('teamMembers', JSON.stringify(payload));
}

function renderTeamMembers() {
  if (!teamTable) return;
  if (!state.members.length) {
    teamTable.innerHTML = '';
    teamTableWrap?.classList.add('hidden');
    teamEmpty?.classList.remove('hidden');
    return;
  }
  teamEmpty?.classList.add('hidden');
  teamTableWrap?.classList.remove('hidden');
  teamTable.innerHTML = state.members.map(member => {
    const name = escapeHtml(member.name || member.email || 'Team member');
    const email = escapeHtml(member.email || '—');
    const lastLogin = formatDate(member.lastLoginAt) || 'Pending';
    const invited = formatDate(member.createdAt) || '—';
    const status = member.lastLoginAt ? 'Active' : 'Awaiting first login';
    return `
      <tr class="align-top">
        <td class="px-4 py-3">
          <div class="font-medium">${name}</div>
          <div class="text-xs muted">Team workspace access</div>
        </td>
        <td class="px-4 py-3">
          <div><a class="text-accent underline" href="mailto:${email}">${email}</a></div>
          <div class="mt-1 inline-flex items-center gap-2 text-xs">
            <span class="chip ${member.lastLoginAt ? 'active' : ''}">${escapeHtml(status)}</span>
            ${member.permissions?.length ? `<span class="text-xs muted">${escapeHtml(member.permissions.join(', '))}</span>` : ''}
          </div>
        </td>
        <td class="px-4 py-3 text-sm">${escapeHtml(lastLogin)}</td>
        <td class="px-4 py-3 text-sm">${escapeHtml(invited)}</td>
        <td class="px-4 py-3 text-right">
          <button type="button" class="btn-destructive text-xs" data-remove="${member.id}" data-name="${name}">Remove</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function loadTeamMembers() {
  if (!teamLoading) return;
  teamLoading.classList.remove('hidden');
  teamError?.classList.add('hidden');
  try {
    const res = await api('/api/team-members');
    if (!res.ok) throw new Error(res.error || 'Failed to load team');
    state.members = (res.members || []).map(member => ({
      ...member,
      name: member.name || member.email || 'Team member',
      email: member.email || member.username || ''
    }));
    syncTeamToLocalStorage();
    renderTeamMembers();
  } catch (err) {
    console.error('Failed to load team members', err);
    if (teamError) {
      teamError.textContent = 'We could not load your team roster. Refresh and try again.';
      teamError.classList.remove('hidden');
    }
    state.members = [];
    renderTeamMembers();
  } finally {
    teamLoading.classList.add('hidden');
  }
}

function resetInviteView() {
  inviteForm?.classList.remove('hidden');
  inviteSuccess?.classList.add('hidden');
  inviteError?.classList.add('hidden');
  if (inviteName) inviteName.value = '';
  if (inviteEmail) inviteEmail.value = '';
  if (inviteToken) inviteToken.textContent = '';
  if (invitePassword) invitePassword.textContent = '';
  if (inviteSubmit) {
    inviteSubmit.disabled = false;
    inviteSubmit.textContent = INVITE_BUTTON_LABEL;
  }
}

function closeInviteDialog() {
  if (!inviteDialog) return;
  inviteDialog.close();
  resetInviteView();
}

function openInviteDialog() {
  if (!inviteDialog) return;
  resetInviteView();
  inviteDialog.showModal();
  inviteName?.focus();
}

function showInviteSuccess(member) {
  if (!inviteSuccess || !inviteToken || !invitePassword) return;
  inviteForm?.classList.add('hidden');
  inviteSuccess.classList.remove('hidden');
  inviteToken.textContent = member.token;
  inviteToken.dataset.value = member.token;
  invitePassword.textContent = member.password;
  invitePassword.dataset.value = member.password;
}

async function handleInviteSubmit(event) {
  event.preventDefault();
  if (!inviteForm || !inviteSubmit) return;
  const name = inviteName?.value.trim() || '';
  const email = inviteEmail?.value.trim() || '';
  if (!name || !email) {
    if (inviteError) {
      inviteError.textContent = 'Name and email are required.';
      inviteError.classList.remove('hidden');
    }
    return;
  }
  inviteError?.classList.add('hidden');
  inviteSubmit.disabled = true;
  inviteSubmit.textContent = 'Sending…';
  try {
    const member = await createTeamMember({ name, email });
    showInviteSuccess(member);
    await loadTeamMembers();
  } catch (err) {
    console.error('Invite failed', err);
    if (inviteError) {
      inviteError.textContent = 'We could not send the invite. Please try again.';
      inviteError.classList.remove('hidden');
    }
  } finally {
    if (inviteSubmit) {
      inviteSubmit.disabled = false;
      inviteSubmit.textContent = INVITE_BUTTON_LABEL;
    }
  }
}

async function handleTeamTableClick(event) {
  const target = event.target.closest('[data-remove]');
  if (!target) return;
  const memberId = target.dataset.remove;
  const memberName = target.dataset.name || 'this teammate';
  if (!memberId) return;
  const confirmed = confirm(`Remove ${memberName} from your workspace?`);
  if (!confirmed) return;
  target.disabled = true;
  try {
    const res = await api(`/api/team-members/${memberId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(res.error || 'Failed to remove');
    state.members = state.members.filter(member => member.id !== memberId);
    syncTeamToLocalStorage();
    renderTeamMembers();
  } catch (err) {
    console.error('Failed to remove teammate', err);
    alert('We could not remove that teammate. Please refresh and try again.');
  } finally {
    target.disabled = false;
  }
}

function copyToClipboard(value, label) {
  if (!value) return;
  navigator.clipboard?.writeText(value)
    .then(() => {
      const msg = label ? `${label} copied to clipboard` : 'Copied!';
      console.info(msg);
    })
    .catch(() => {
      alert('Copy failed. Please copy manually.');
    });
}

function initCompanyForm() {
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
        name: nameEl?.value.trim() || '',
        phone: phoneEl?.value.trim() || '',
        email: emailEl?.value.trim() || '',
        address: addrEl?.value.trim() || ''
      };
      localStorage.setItem('companyInfo', JSON.stringify(data));
    });
  }
}

function initTeamSection() {
  inviteDialog = document.getElementById('inviteDialog');
  inviteForm = document.getElementById('inviteForm');
  inviteSuccess = document.getElementById('inviteSuccess');
  inviteError = document.getElementById('inviteError');
  inviteSubmit = document.getElementById('inviteSubmit');
  inviteName = document.getElementById('inviteName');
  inviteEmail = document.getElementById('inviteEmail');
  inviteToken = document.getElementById('inviteToken');
  invitePassword = document.getElementById('invitePassword');
  inviteAnother = document.getElementById('inviteAnother');
  teamLoading = document.getElementById('teamLoading');
  teamError = document.getElementById('teamError');
  teamEmpty = document.getElementById('teamEmpty');
  teamTable = document.getElementById('teamTable');
  teamTableWrap = document.getElementById('teamTableWrap');

  if (inviteForm) {
    inviteForm.addEventListener('submit', handleInviteSubmit);
  }
  if (inviteAnother) {
    inviteAnother.addEventListener('click', () => {
      resetInviteView();
      inviteName?.focus();
    });
  }
  if (inviteDialog) {
    inviteDialog.addEventListener('click', (event) => {
      if (event.target === inviteDialog) {
        closeInviteDialog();
      }
    });
  }
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', closeInviteDialog);
  });
  inviteSuccess?.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-copy');
      if (type === 'token') {
        copyToClipboard(inviteToken?.dataset.value || inviteToken?.textContent || '', 'Token');
      } else if (type === 'password') {
        copyToClipboard(invitePassword?.dataset.value || invitePassword?.textContent || '', 'Password');
      }
    });
  });
  teamTable?.addEventListener('click', handleTeamTableClick);

  document.addEventListener('team-invite:open', (event) => {
    if (!inviteDialog) return;
    event.preventDefault();
    openInviteDialog();
  });

  loadTeamMembers();
}

document.addEventListener('DOMContentLoaded', () => {
  initCompanyForm();
  initTeamSection();
});
