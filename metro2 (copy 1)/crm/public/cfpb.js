import { api, authHeader } from '/common.js';

const $ = id => document.getElementById(id);

let currentConsumerId = null;
let lastResult = null;
let proofFiles = [];
let uploadedProofKeys = [];
let currentTab = 'bureau';

const VIOLATION_OPTIONS = [
  { value: '', label: '-- Select violation --', group: null },
  { value: 'no_response_30', label: '30-Day No Response (FCRA §611)', group: 'FCRA — No Response' },
  { value: 'no_response_45', label: '45-Day No Response / Extended Period (FCRA §611)', group: 'FCRA — No Response' },
  { value: 'verified_inaccurate', label: 'Verified Inaccurate Information (FCRA §611)', group: 'FCRA — Inaccurate Reporting' },
  { value: 'wrong_balance', label: 'Incorrect Balance Reported (FCRA §623)', group: 'FCRA — Inaccurate Reporting' },
  { value: 'wrong_status', label: 'Incorrect Account Status (FCRA §623)', group: 'FCRA — Inaccurate Reporting' },
  { value: 'reaged', label: 'Re-Aged Debt / Changed DOFD (FCRA §605(c))', group: 'FCRA — Inaccurate Reporting' },
  { value: 'mixed_file', label: 'Mixed Credit File / Wrong Consumer Info (FCRA §611)', group: 'FCRA — Inaccurate Reporting' },
  { value: 'duplicate_reporting', label: 'Duplicate / Multiple Reporting (FCRA §623)', group: 'FCRA — Inaccurate Reporting' },
  { value: 'continued_after_paid', label: 'Continued Reporting After Paid/Settled (FCRA §623)', group: 'FCRA — Account Status' },
  { value: 'paid_collection', label: 'Paid Collection Still Reporting Negative (FCRA §623)', group: 'FCRA — Account Status' },
  { value: 'settlement_not_reflected', label: 'Settlement Not Reflected on Report (FCRA §623)', group: 'FCRA — Account Status' },
  { value: 'obsolete_info', label: 'Reporting Obsolete / Beyond 7-Year Limit (FCRA §605)', group: 'FCRA — Account Status' },
  { value: 'bankruptcy_discharge', label: 'Debt Discharged in Bankruptcy Still Reporting (FCRA §623)', group: 'FCRA — Account Status' },
  { value: 'not_mine', label: 'Account Not Mine / Identity Theft (FCRA §611, §623)', group: 'FCRA — Account Status' },
  { value: 'medical_debt', label: 'Medical Debt Under $500 Being Reported (CFPB Rule 2023)', group: 'FCRA — Special Rules' },
  { value: 'collection_no_validation', label: 'Debt Collector Failed to Validate Debt (FDCPA §809)', group: 'FDCPA — Debt Collection' },
  { value: 'collection_harassment', label: 'Debt Collector Harassment / Abusive Conduct (FDCPA §806)', group: 'FDCPA — Debt Collection' },
  { value: 'collection_false_representation', label: 'Debt Collector Made False Representations (FDCPA §807)', group: 'FDCPA — Debt Collection' },
  { value: 'collection_unfair_practices', label: 'Debt Collector Used Unfair Practices (FDCPA §808)', group: 'FDCPA — Debt Collection' },
  { value: 'other', label: 'Other (describe below)', group: null },
];

function buildViolationOptions() {
  const groups = {};
  const noGroup = [];
  for (const o of VIOLATION_OPTIONS) {
    if (!o.group) { noGroup.push(o); continue; }
    if (!groups[o.group]) groups[o.group] = [];
    groups[o.group].push(o);
  }
  let html = noGroup.slice(0,1).map(o => `<option value="${escHtml(o.value)}">${escHtml(o.label)}</option>`).join('');
  for (const [grp, opts] of Object.entries(groups)) {
    html += `<optgroup label="${escHtml(grp)}">${opts.map(o => `<option value="${escHtml(o.value)}">${escHtml(o.label)}</option>`).join('')}</optgroup>`;
  }
  html += noGroup.slice(1).map(o => `<option value="${escHtml(o.value)}">${escHtml(o.label)}</option>`).join('');
  return html;
}

function switchTab(tab) {
  currentTab = tab;
  const byBureau = $('cfpbByBureauPanel');
  const individually = $('cfpbIndividualPanel');
  const btnBureau = $('cfpbTabByBureau');
  const btnIndiv = $('cfpbTabIndividually');
  if (tab === 'bureau') {
    if (byBureau) byBureau.style.display = 'block';
    if (individually) individually.style.display = 'none';
    if (btnBureau) { btnBureau.classList.add('active'); }
    if (btnIndiv) { btnIndiv.classList.remove('active'); }
  } else {
    if (byBureau) byBureau.style.display = 'none';
    if (individually) individually.style.display = 'block';
    if (btnIndiv) { btnIndiv.classList.add('active'); }
    if (btnBureau) { btnBureau.classList.remove('active'); }
    if (currentConsumerId) renderIndivItems(currentConsumerId);
  }
}

$('cfpbTabByBureau')?.addEventListener('click', () => switchTab('bureau'));
$('cfpbTabIndividually')?.addEventListener('click', () => switchTab('individual'));

function buildIndivItemCard(item, bureau, cardIdx) {
  const creditor = item.name || 'Unknown';
  const accountSuffix = item.accountNumber ? ' #' + item.accountNumber : '';
  const bureauBadge = bureau
    ? `<span class="cfpb-bureau-badge">${escHtml(bureau)}</span>`
    : '';
  return `
  <div class="cfpb-item-card" data-idx="${cardIdx}" style="margin-bottom:8px;">
    <div class="cfpb-item-header">
      <div class="cfpb-item-meta">
        <div class="cfpb-item-name">${escHtml(creditor)}${escHtml(accountSuffix)}</div>
        <div class="cfpb-item-sub">
          ${bureauBadge}
          <span class="cfpb-status-dot">awaiting</span>
        </div>
      </div>
      <button class="cfpb-gen-btn btn-cfpb-indiv-gen" data-idx="${cardIdx}" type="button">Generate</button>
    </div>
    <div class="cfpb-item-fields">
      <div>
        <label style="font-size:11px;color:#9ca3af;display:block;margin-bottom:3px;">Violation Type</label>
        <select class="cfpb-indiv-vtype input-field" data-idx="${cardIdx}" style="width:100%;font-size:12px;padding:5px 8px;">${buildViolationOptions()}</select>
      </div>
      <div>
        <label style="font-size:11px;color:#9ca3af;display:block;margin-bottom:3px;">Response Received</label>
        <select class="cfpb-indiv-response input-field" data-idx="${cardIdx}" style="width:100%;font-size:12px;padding:5px 8px;">
          <option value="">-- Select --</option>
          <option value="No Response">No Response</option>
          <option value="Verified as Accurate">Verified as Accurate</option>
          <option value="Deleted">Deleted</option>
          <option value="Updated/Partially Corrected">Updated/Partially Corrected</option>
          <option value="Account Closed">Account Closed</option>
          <option value="Paid/Settled">Paid/Settled</option>
          <option value="Transferred">Transferred</option>
          <option value="other">Other</option>
        </select>
      </div>
    </div>
    <div id="cfpb-indiv-result-${cardIdx}" class="cfpb-item-result"></div>
  </div>`;
}

let indivItemData = [];

async function renderIndivItems(consumerId) {
  const list = $('cfpbIndivItemList');
  const loading = $('cfpbIndivLoading');
  if (!list) return;
  if (loading) { loading.style.display = 'block'; loading.textContent = 'Loading items…'; }
  indivItemData = [];
  try {
    const data = await api(`/api/consumers/${consumerId}/negative-items`);
    const items = data?.items || [];
    if (loading) loading.style.display = 'none';
    if (!items.length) {
      list.innerHTML = '<div style="font-size:13px;color:#9ca3af;padding:12px 0;">No negative items found for this client.</div>';
      return;
    }
    let cards = '';
    let idx = 0;
    for (const item of items) {
      const bureaus = item.bureaus?.length ? item.bureaus : [''];
      for (const bureau of bureaus) {
        indivItemData.push({ item, bureau, idx });
        cards += buildIndivItemCard(item, bureau, idx);
        idx++;
      }
    }
    list.innerHTML = cards;
  } catch (e) {
    if (loading) { loading.style.display = 'block'; loading.textContent = 'Failed to load items.'; }
  }
}

$('cfpbIndivItemList')?.addEventListener('click', async e => {
  const btn = e.target.closest('.btn-cfpb-indiv-gen');
  if (!btn || !currentConsumerId) return;
  const idx = parseInt(btn.dataset.idx, 10);
  const entry = indivItemData[idx];
  if (!entry) return;
  const card = document.querySelector(`.cfpb-item-card[data-idx="${idx}"]`);
  if (!card) return;
  const company = entry.item.name || '';
  const violationType = card.querySelector(`.cfpb-indiv-vtype`)?.value || '';
  const tone = $('cfpbIndivSharedTone')?.value || 'professional';
  const complaintGoal = $('cfpbIndivSharedGoal')?.value || '';
  const responseOutcome = card.querySelector(`.cfpb-indiv-response`)?.value || '';
  const sharedDate = $('cfpbIndivSharedDate')?.value || '';
  const sharedNotes = $('cfpbIndivSharedNotes')?.value?.trim() || '';
  if (!company) { alert('Company name is required.'); return; }
  if (!violationType) { alert('Please select a violation type.'); return; }
  const resultEl = $(`cfpb-indiv-result-${idx}`);
  btn.disabled = true;
  btn.textContent = 'Generating…';
  try {
    const resp = await fetch(`/api/consumers/${currentConsumerId}/cfpb-complaint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ companyName: company, violationType, itemsDisputed: [company + (entry.bureau ? ' (' + entry.bureau + ')' : '')], disputeSentDate: sharedDate, responseOutcome, additionalNotes: sharedNotes, tone, complaintGoal, save: false }),
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'Generation failed');
    if (resultEl) {
      resultEl.textContent = `WHAT HAPPENED:\n${data.narrative}\n\nWHAT RESOLUTION I AM SEEKING:\n${data.resolution}`;
      resultEl.style.display = 'block';
    }
  } catch (err) {
    alert('Failed to generate: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate';
  }
});

async function loadConsumers() {
  const data = await api('/api/consumers?limit=200');
  const consumers = data?.consumers || data?.data || [];
  const sel = $('consumerSelect');
  consumers.forEach(c => {
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || c.email || c.id;
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

async function loadNegativeItems(consumerId) {
  const panel = $('cfpbItemsCheckboxes');
  const controls = $('cfpbItemsControls');
  const loading = $('cfpbItemsLoading');
  if (!panel || !controls) return;
  panel.innerHTML = '';
  loading.style.display = 'block';
  panel.style.display = 'none';
  controls.style.display = 'none';
  try {
    const data = await api(`/api/consumers/${consumerId}/negative-items`);
    const items = data?.items || [];
    if (!items.length) {
      loading.textContent = 'No negative items found. Use the custom field below.';
      loading.style.display = 'block';
      controls.style.display = 'flex';
      panel.style.display = 'none';
      return;
    }
    loading.style.display = 'none';
    panel.style.display = 'block';
    controls.style.display = 'flex';
    panel.innerHTML = items.map((item, idx) => {
      const val = `${escHtml(item.name)}${item.accountNumber ? ' #' + escHtml(item.accountNumber) : ''}`;
      const label = `${escHtml(item.name)}${item.accountNumber ? ' #' + escHtml(item.accountNumber) : ''}${item.bureaus?.length ? ' (' + escHtml(item.bureaus.join(', ')) + ')' : ''}`;
      return `<label class="cfpb-item-cb-label">
        <input type="checkbox" class="cfpb-item-cb" value="${val}"> ${label}
      </label>`;
    }).join('');
  } catch (e) {
    loading.textContent = 'Failed to load items. Use the custom field below.';
    loading.style.display = 'block';
    controls.style.display = 'flex';
  }
}

function getSelectedItems() {
  const cbs = document.querySelectorAll('.cfpb-item-cb:checked');
  return Array.from(cbs).map(cb => cb.value);
}

function getResponseValue() {
  const sel = $('cfpbResponse')?.value || '';
  if (sel === 'other') return $('cfpbResponseOther')?.value?.trim() || '';
  return sel;
}

async function loadHistory(consumerId) {
  try {
    const data = await api(`/api/consumers/${consumerId}/cfpb-complaints`);
    const complaints = data?.complaints || [];
    const section = $('cfpbHistorySection');
    const list = $('cfpbHistoryList');
    if (!complaints.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    list.innerHTML = complaints.map(c => {
      const date = c.generatedAt ? new Date(c.generatedAt).toLocaleDateString() : '';
      const violationLabels = {
        no_response_30: '30-Day No Response',
        verified_inaccurate: 'Verified Inaccurate',
        reaged: 'Re-Aged Debt',
        continued_after_paid: 'Continued After Paid',
        not_mine: 'Not Mine / Identity Theft',
        other: 'Other',
      };
      const vLabel = violationLabels[c.violationType] || c.violationType || '';
      let proofHtml = '';
      if (Array.isArray(c.proofFiles) && c.proofFiles.length) {
        proofHtml = `<div style="margin-top:8px;font-size:12px;color:#818cf8;">Proof files: ${c.proofFiles.map(f => `<a href="/api/consumers/${consumerId}/cfpb-proof/${encodeURIComponent(f.key)}" target="_blank" style="color:#818cf8;text-decoration:underline;margin-right:8px;">${escHtml(f.name)}</a>`).join('')}</div>`;
      }
      return `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px 16px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong style="font-size:14px;">${escHtml(c.companyName || '')}</strong>
          <span style="font-size:12px;color:#9ca3af;">${escHtml(date)}</span>
        </div>
        ${vLabel ? `<div style="font-size:12px;color:#818cf8;margin-bottom:8px;">${escHtml(vLabel)}</div>` : ''}
        <details style="font-size:13px;line-height:1.6;">
          <summary style="cursor:pointer;color:#6b7280;font-size:12px;">Show complaint text</summary>
          <div style="margin-top:8px;white-space:pre-wrap;color:#d1d5db;">${escHtml(c.narrative || '')}</div>
          ${c.resolution ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);white-space:pre-wrap;color:#d1d5db;">${escHtml(c.resolution)}</div>` : ''}
        </details>
        ${proofHtml}
      </div>`;
    }).join('');
  } catch (_) {}
}

function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function showErr(msg) {
  const el = $('cfpbGenError');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function renderProofList() {
  const list = $('cfpbProofList');
  if (!list) return;
  if (!proofFiles.length) { list.innerHTML = ''; return; }
  list.innerHTML = proofFiles.map((f, i) => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;">
    <span style="color:#d1d5db;">${escHtml(f.name)}</span>
    <span style="color:#6b7280;font-size:11px;">(${(f.size / 1024).toFixed(1)} KB)</span>
    <button type="button" data-proof-idx="${i}" class="remove-proof" style="color:#f87171;background:none;border:none;cursor:pointer;font-size:12px;font-weight:600;">Remove</button>
  </div>`).join('');
}

async function uploadProofFiles(consumerId) {
  if (!proofFiles.length) return [];
  const formData = new FormData();
  proofFiles.forEach(f => formData.append('files', f));
  const resp = await fetch(`/api/consumers/${consumerId}/cfpb-proof`, {
    method: 'POST',
    headers: authHeader(),
    body: formData,
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error || 'Upload failed');
  return data.files || [];
}

$('consumerSelect')?.addEventListener('change', e => {
  currentConsumerId = e.target.value || null;
  lastResult = null;
  proofFiles = [];
  uploadedProofKeys = [];
  renderProofList();
  $('cfpbResultSection').style.display = 'none';
  $('cfpbSaveMsg').style.display = 'none';
  if (currentConsumerId) {
    $('cfpbFormSection').style.display = 'block';
    loadNegativeItems(currentConsumerId);
    loadHistory(currentConsumerId);
    if (currentTab === 'individual') renderIndivItems(currentConsumerId);
  } else {
    $('cfpbFormSection').style.display = 'none';
    $('cfpbHistorySection').style.display = 'none';
  }
});

$('cfpbViolationType')?.addEventListener('change', e => {
  $('cfpbOtherBox').style.display = e.target.value === 'other' ? 'block' : 'none';
});

$('cfpbResponse')?.addEventListener('change', e => {
  $('cfpbResponseOther').style.display = e.target.value === 'other' ? 'block' : 'none';
});

$('cfpbSelectAll')?.addEventListener('change', e => {
  document.querySelectorAll('.cfpb-item-cb').forEach(cb => { cb.checked = e.target.checked; });
});

$('btnAddCustomItem')?.addEventListener('click', () => {
  const input = $('cfpbCustomItem');
  const val = input?.value?.trim();
  if (!val) return;
  const panel = $('cfpbItemsCheckboxes');
  if (!panel) return;
  panel.style.display = 'block';
  const label = document.createElement('label');
  label.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0;font-size:13px;cursor:pointer;';
  label.innerHTML = `<input type="checkbox" class="cfpb-item-cb" value="${escHtml(val)}" checked> ${escHtml(val)} <span style="color:#10b981;font-size:10px;">(custom)</span>`;
  panel.appendChild(label);
  input.value = '';
});

const proofArea = $('cfpbProofArea');
const proofInput = $('cfpbProofInput');
proofArea?.addEventListener('click', () => proofInput?.click());
proofArea?.addEventListener('dragover', e => { e.preventDefault(); proofArea.style.borderColor = 'rgba(99,102,241,0.6)'; });
proofArea?.addEventListener('dragleave', () => { proofArea.style.borderColor = 'rgba(255,255,255,0.12)'; });
proofArea?.addEventListener('drop', e => { e.preventDefault(); proofArea.style.borderColor = 'rgba(255,255,255,0.12)'; addProofFiles(e.dataTransfer.files); });
proofInput?.addEventListener('change', e => { addProofFiles(e.target.files); e.target.value = ''; });

function addProofFiles(fileList) {
  const allowed = ['.pdf', '.png', '.jpg', '.jpeg'];
  for (const f of fileList) {
    if (proofFiles.length >= 5) break;
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) continue;
    if (f.size > 10 * 1024 * 1024) continue;
    proofFiles.push(f);
  }
  uploadedProofKeys = [];
  renderProofList();
}

$('cfpbProofList')?.addEventListener('click', e => {
  const btn = e.target.closest('.remove-proof');
  if (!btn) return;
  const idx = parseInt(btn.dataset.proofIdx, 10);
  proofFiles.splice(idx, 1);
  uploadedProofKeys = [];
  renderProofList();
});

$('btnGenerateCfpb')?.addEventListener('click', async () => {
  showErr('');
  if (!currentConsumerId) { showErr('Please select a client.'); return; }
  const company = $('cfpbCompany')?.value?.trim();
  const violationType = $('cfpbViolationType')?.value;
  if (!company) { showErr('Company name is required.'); return; }
  if (!violationType) { showErr('Please select a violation type.'); return; }
  const otherText = $('cfpbOtherText')?.value?.trim();
  if (violationType === 'other' && !otherText) { showErr('Please describe the violation.'); return; }

  const itemsDisputed = getSelectedItems();
  const disputeSentDate = $('cfpbSentDate')?.value || '';
  const responseOutcome = getResponseValue();
  const additionalNotes = $('cfpbNotes')?.value?.trim() || '';
  const tone = $('cfpbTone')?.value || 'professional';
  const complaintGoal = $('cfpbGoal')?.value || '';

  const btn = $('btnGenerateCfpb');
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Generating…';

  try {
    const data = await fetch(`/api/consumers/${currentConsumerId}/cfpb-complaint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ companyName: company, violationType, otherViolationText: otherText, itemsDisputed, disputeSentDate, responseOutcome, additionalNotes, tone, complaintGoal, save: false }),
    }).then(r => r.json());

    if (!data.ok) throw new Error(data.error || 'Generation failed');
    lastResult = { companyName: company, violationType, otherViolationText: otherText, itemsDisputed, disputeSentDate, responseOutcome, additionalNotes, tone, complaintGoal, narrative: data.narrative, resolution: data.resolution };

    $('cfpbNarrative').textContent = data.narrative || '';
    $('cfpbResolution').textContent = data.resolution || '';
    $('cfpbResultSection').style.display = 'block';
    $('cfpbSaveMsg').style.display = 'none';
    $('cfpbResultSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    showErr(e.message || 'Failed to generate complaint');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
});

$('btnCopyCfpb')?.addEventListener('click', () => {
  if (!lastResult) return;
  const text = `WHAT HAPPENED:\n${lastResult.narrative}\n\nWHAT RESOLUTION I AM SEEKING:\n${lastResult.resolution}`;
  navigator.clipboard.writeText(text).then(() => {
    const btn = $('btnCopyCfpb');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy All'; }, 2000);
  });
});

$('btnSaveCfpb')?.addEventListener('click', async () => {
  if (!lastResult || !currentConsumerId) return;
  const btn = $('btnSaveCfpb');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    let savedProofFiles = uploadedProofKeys;
    if (proofFiles.length && !uploadedProofKeys.length) {
      savedProofFiles = await uploadProofFiles(currentConsumerId);
      uploadedProofKeys = savedProofFiles;
    }
    const data = await fetch(`/api/consumers/${currentConsumerId}/cfpb-complaint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ ...lastResult, proofFiles: savedProofFiles, save: true }),
    }).then(r => r.json());
    if (!data.ok) throw new Error(data.error || 'Save failed');
    $('cfpbSaveMsg').style.display = 'block';
    loadHistory(currentConsumerId);
  } catch (e) {
    showErr(e.message || 'Failed to save');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save to Record';
  }
});

loadConsumers();
