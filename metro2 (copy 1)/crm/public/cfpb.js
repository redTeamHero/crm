import { api, authHeader } from '/common.js';

const $ = id => document.getElementById(id);

let currentConsumerId = null;
let lastResult = null;
let proofFiles = [];
let uploadedProofKeys = [];

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
      const label = `${escHtml(item.name)}${item.accountNumber ? ' #' + escHtml(item.accountNumber) : ''}${item.bureaus?.length ? ' (' + escHtml(item.bureaus.join(', ')) + ')' : ''}`;
      return `<label style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:13px;cursor:pointer;">
        <input type="checkbox" class="cfpb-item-cb" value="${escHtml(item.name)}${item.accountNumber ? ' #' + escHtml(item.accountNumber) : ''}"> ${label}
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
