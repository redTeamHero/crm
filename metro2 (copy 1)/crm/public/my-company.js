import { api, createTeamMember } from './common.js';

const state = {
  members: [],
  credentials: {}
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
let inviteHeading;
let inviteDescription;
let inviteSuccessDescription;
let teamLoading;
let teamError;
let teamEmpty;
let teamTable;
let teamTableWrap;
let lastInviteCredentials = null;
let inviteHeadingDefault = '';
let inviteDescriptionDefault = '';
let inviteSuccessDescriptionDefault = '';

const INVITE_BUTTON_LABEL = 'Send Invite';
const INVITE_CREDENTIAL_STORAGE_KEY = 'teamMemberInviteCredentials';

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

function normalizeMemberEmail(member = {}) {
  return (member.email || member.username || '').trim();
}

function loadStoredInviteCredentials() {
  try {
    const raw = localStorage.getItem(INVITE_CREDENTIAL_STORAGE_KEY);
    if (!raw) {
      state.credentials = {};
      return;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      state.credentials = parsed;
    } else {
      state.credentials = {};
    }
  } catch (err) {
    console.error('Failed to load stored invite credentials', err);
    state.credentials = {};
  }
}

function persistInviteCredentials() {
  try {
    localStorage.setItem(INVITE_CREDENTIAL_STORAGE_KEY, JSON.stringify(state.credentials));
  } catch (err) {
    console.error('Failed to persist invite credentials', err);
  }
}

function createCredentialRecord(member, token, password) {
  return {
    token: token || '',
    password: password || '',
    memberId: member?.id ?? null,
    email: normalizeMemberEmail(member),
    name: member?.name || normalizeMemberEmail(member) || 'Team member',
    savedAt: new Date().toISOString()
  };
}

function storeInviteCredentials(member, token, password) {
  if (!member || (!token && !password)) return;
  const record = createCredentialRecord(member, token, password);
  const keys = new Set();
  if (record.memberId !== null && record.memberId !== undefined) {
    keys.add(`id:${record.memberId}`);
  }
  if (record.email) {
    keys.add(`email:${record.email}`);
  }
  if (!keys.size) return;
  Object.entries(state.credentials).forEach(([key, value]) => {
    if (!value) return;
    if ((record.memberId !== null && String(value.memberId) === String(record.memberId)) || (record.email && value.email === record.email)) {
      delete state.credentials[key];
    }
  });
  keys.forEach(key => {
    state.credentials[key] = record;
  });
  persistInviteCredentials();
}

function findStoredCredentials(member) {
  if (!member) return null;
  const candidates = [];
  if (member.id !== undefined && member.id !== null) {
    candidates.push(`id:${member.id}`);
  }
  const email = normalizeMemberEmail(member);
  if (email) {
    candidates.push(`email:${email}`);
  }
  for (const key of candidates) {
    const record = state.credentials[key];
    if (record && (record.token || record.password)) {
      return record;
    }
  }
  return null;
}

function findStoredCredentialsById(memberId) {
  if (memberId === undefined || memberId === null) return null;
  const directKey = `id:${memberId}`;
  if (state.credentials[directKey] && (state.credentials[directKey].token || state.credentials[directKey].password)) {
    return state.credentials[directKey];
  }
  const match = Object.values(state.credentials).find(entry => entry && entry.memberId !== null && String(entry.memberId) === String(memberId) && (entry.token || entry.password));
  return match || null;
}

function removeStoredCredentials(member) {
  if (!member) return;
  const email = normalizeMemberEmail(member);
  let changed = false;
  Object.entries(state.credentials).forEach(([key, value]) => {
    if (!value) return;
    const sameId = member.id !== undefined && member.id !== null && value.memberId !== null && String(value.memberId) === String(member.id);
    const sameEmail = email && value.email === email;
    if (sameId || sameEmail) {
      delete state.credentials[key];
      changed = true;
    }
  });
  if (changed) {
    persistInviteCredentials();
  }
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
    const storedCredentials = findStoredCredentials(member);
    const credentialKey = member.id !== undefined && member.id !== null
      ? String(member.id)
      : normalizeMemberEmail(member);
    const credentialType = member.id !== undefined && member.id !== null ? 'id' : 'email';
    const credentialButton = storedCredentials && credentialKey
      ? `<button type="button" class="text-xs text-accent underline mt-1" data-credentials="${escapeHtml(credentialKey)}" data-credential-type="${credentialType}" data-member-name="${name}">View invite credentials</button>`
      : '';
    const credentialSavedAt = storedCredentials?.savedAt ? formatDate(storedCredentials.savedAt) : null;
    const credentialMeta = credentialSavedAt
      ? `<div class="text-[11px] muted">Saved ${escapeHtml(credentialSavedAt)}</div>`
      : '';
    return `
      <tr class="align-top">
        <td class="px-4 py-3">
          <div class="font-medium">${name}</div>
          <div class="text-xs muted">Team workspace access</div>
          ${credentialButton}
          ${credentialMeta}
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
  if (inviteHeading && inviteHeadingDefault) {
    inviteHeading.textContent = inviteHeadingDefault;
  }
  if (inviteDescription && inviteDescriptionDefault) {
    inviteDescription.textContent = inviteDescriptionDefault;
  }
  if (inviteSuccessDescription && inviteSuccessDescriptionDefault) {
    inviteSuccessDescription.textContent = inviteSuccessDescriptionDefault;
  }
  if (inviteDialog) {
    inviteDialog.dataset.mode = 'invite';
  }
  if (inviteName) inviteName.value = '';
  if (inviteEmail) inviteEmail.value = '';
  lastInviteCredentials = null;
  if (inviteToken) {
    inviteToken.textContent = '';
  }
  if (invitePassword) {
    invitePassword.textContent = '';
  }
  if (inviteSubmit) {
    inviteSubmit.disabled = false;
    inviteSubmit.textContent = INVITE_BUTTON_LABEL;
  }
}

function closeInviteDialog() {
  if (!inviteDialog) return;
  inviteDialog.close();
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
  if (inviteDialog) {
    inviteDialog.dataset.mode = 'invite';
  }
  if (inviteSuccessDescription && inviteSuccessDescriptionDefault) {
    inviteSuccessDescription.textContent = inviteSuccessDescriptionDefault;
  }
  const token = member?.token || '';
  const password = member?.password || '';
  lastInviteCredentials = { token, password };
  inviteToken.textContent = token;
  invitePassword.textContent = password;
  if (member) {
    storeInviteCredentials(member, token, password);
  }
}

function showStoredCredentials({ key, type, fallbackName }) {
  if (!key) return;
  const normalizedType = type === 'email' ? 'email' : 'id';
  const lookup = normalizedType === 'email'
    ? (member) => normalizeMemberEmail(member) === key
    : (member) => String(member.id) === String(key);
  const member = state.members.find(lookup);
  let credentials = member ? findStoredCredentials(member) : null;
  if (!credentials) {
    credentials = normalizedType === 'email'
      ? state.credentials[`email:${key}`] || null
      : findStoredCredentialsById(key);
  }
  if (!credentials || (!credentials.token && !credentials.password)) {
    alert('We could not find stored invite credentials. Send a fresh invite to regenerate them.');
    return;
  }
  const displayName = member?.name || member?.email || credentials.name || fallbackName || 'Team member';
  resetInviteView();
  if (inviteHeading) {
    inviteHeading.textContent = `Invite credentials for ${displayName}`;
  }
  if (inviteDescription) {
    inviteDescription.textContent = 'Share or copy the saved invite token and temporary password.';
  }
  if (inviteSuccessDescription) {
    inviteSuccessDescription.textContent = 'Stored locally so you can resend via a secure channel (encrypted email, SMS, etc.).';
  }
  lastInviteCredentials = {
    token: credentials.token || '',
    password: credentials.password || ''
  };
  if (inviteToken) {
    inviteToken.textContent = lastInviteCredentials.token;
  }
  if (invitePassword) {
    invitePassword.textContent = lastInviteCredentials.password;
  }
  inviteForm?.classList.add('hidden');
  inviteSuccess?.classList.remove('hidden');
  if (inviteDialog) {
    inviteDialog.dataset.mode = 'credentials';
    try {
      if (!inviteDialog.open) {
        inviteDialog.showModal();
      }
    } catch (err) {
      console.error('Failed to open invite dialog for stored credentials', err);
    }
  }
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
  const credentialTrigger = event.target.closest('[data-credentials]');
  if (credentialTrigger) {
    const key = credentialTrigger.getAttribute('data-credentials');
    const type = credentialTrigger.getAttribute('data-credential-type') || 'id';
    const fallbackName = credentialTrigger.getAttribute('data-member-name') || 'Team member';
    showStoredCredentials({ key, type, fallbackName });
    return;
  }
  const target = event.target.closest('[data-remove]');
  if (!target) return;
  const memberId = target.dataset.remove;
  const memberName = target.dataset.name || 'this teammate';
  if (!memberId) return;
  const member = state.members.find(entry => String(entry.id) === String(memberId)) || null;
  const confirmed = confirm(`Remove ${memberName} from your workspace?`);
  if (!confirmed) return;
  target.disabled = true;
  try {
    const res = await api(`/api/team-members/${memberId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(res.error || 'Failed to remove');
    state.members = state.members.filter(entry => String(entry.id) !== String(memberId));
    removeStoredCredentials(member || { id: memberId });
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
  const formEl = document.getElementById('companyForm');
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

  const handleSave = (event) => {
    event?.preventDefault();
    const data = {
      name: nameEl?.value.trim() || '',
      phone: phoneEl?.value.trim() || '',
      email: emailEl?.value.trim() || '',
      address: addrEl?.value.trim() || ''
    };
    localStorage.setItem('companyInfo', JSON.stringify(data));
  };

  if (formEl) {
    formEl.addEventListener('submit', handleSave);
  }
  if (saveBtn) {
    saveBtn.addEventListener('click', handleSave);
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
  inviteHeading = inviteDialog?.querySelector('.dialog-header .section-title') || null;
  inviteDescription = inviteDialog?.querySelector('.dialog-header .section-description') || null;
  inviteSuccessDescription = inviteSuccess?.querySelector('.section-description') || null;
  teamLoading = document.getElementById('teamLoading');
  teamError = document.getElementById('teamError');
  teamEmpty = document.getElementById('teamEmpty');
  teamTable = document.getElementById('teamTable');
  teamTableWrap = document.getElementById('teamTableWrap');

  inviteHeadingDefault = inviteHeading?.textContent || inviteHeadingDefault;
  inviteDescriptionDefault = inviteDescription?.textContent || inviteDescriptionDefault;
  inviteSuccessDescriptionDefault = inviteSuccessDescription?.textContent || inviteSuccessDescriptionDefault;

  loadStoredInviteCredentials();

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
    inviteDialog.addEventListener('close', resetInviteView);
  }
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', closeInviteDialog);
  });
  inviteSuccess?.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-copy');
      const value = type === 'token'
        ? (lastInviteCredentials?.token || inviteToken?.textContent || '')
        : (lastInviteCredentials?.password || invitePassword?.textContent || '');
      if (!value) return;
      const label = type === 'token' ? 'Token' : 'Password';
      copyToClipboard(value, label);
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
