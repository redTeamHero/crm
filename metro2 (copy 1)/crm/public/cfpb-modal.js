import { authHeader } from '/common.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const VIOLATION_OPTIONS = [
  { value: '', label: '-- Select violation --' },
  { value: 'no_response_30', label: '30-Day No Response (FCRA §611)' },
  { value: 'verified_inaccurate', label: 'Verified Inaccurate Information (FCRA §611)' },
  { value: 'reaged', label: 'Re-Aged Debt / Changed DOFD (FCRA §605(c))' },
  { value: 'continued_after_paid', label: 'Continued Reporting After Paid/Settled (FCRA §623)' },
  { value: 'not_mine', label: 'Account Not Mine / Identity Theft (FCRA §611, §623)' },
  { value: 'other', label: 'Other (describe below)' },
];

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'firm_assertive', label: 'Firm & Assertive' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'legal_formal', label: 'Legal Formal' },
  { value: 'strong_aggressive', label: 'Strong & Aggressive' },
];

const RESPONSE_OPTIONS = [
  { value: '', label: '-- Select --' },
  { value: 'No Response', label: 'No Response' },
  { value: 'Verified as Accurate', label: 'Verified as Accurate' },
  { value: 'Deleted', label: 'Deleted' },
  { value: 'Updated/Partially Corrected', label: 'Updated/Partially Corrected' },
  { value: 'Account Closed', label: 'Account Closed' },
  { value: 'Paid/Settled', label: 'Paid/Settled' },
  { value: 'Transferred', label: 'Transferred' },
  { value: 'other', label: 'Other' },
];

function buildViolationSelect(id, val = '') {
  return `<select id="${id}" class="input-field w-full">${VIOLATION_OPTIONS.map(o => `<option value="${esc(o.value)}"${o.value === val ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
}

function buildToneSelect(id) {
  return `<select id="${id}" class="input-field w-full">${TONE_OPTIONS.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>`;
}

function buildResponseSelect(id) {
  return `<select id="${id}" class="input-field w-full">${RESPONSE_OPTIONS.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>`;
}

function buildItemRow(item, idx) {
  const creditor = item.creditorName || item.creditor || 'Unknown';
  const bureau = item.bureau || '';
  const status = item.status || '';
  return `
  <div class="cfpb-item-row" data-idx="${idx}" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;margin-bottom:8px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <div>
        <strong style="font-size:13px;">${esc(creditor)}</strong>
        ${bureau ? `<span style="font-size:11px;color:#818cf8;margin-left:8px;">${esc(bureau)}</span>` : ''}
        ${status ? `<span style="font-size:11px;color:#6b7280;margin-left:8px;">${esc(status)}</span>` : ''}
      </div>
      <button class="btn-cfpb-gen-item" data-idx="${idx}" type="button"
        style="background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.4);color:#818cf8;border-radius:6px;font-size:12px;font-weight:600;padding:4px 12px;cursor:pointer;">
        Generate
      </button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
      <div>
        <label style="font-size:11px;color:#9ca3af;display:block;margin-bottom:3px;">Company Name</label>
        <input type="text" class="cfpb-item-company input-field" data-idx="${idx}" value="${esc(creditor)}" style="width:100%;font-size:12px;padding:5px 8px;">
      </div>
      <div>
        <label style="font-size:11px;color:#9ca3af;display:block;margin-bottom:3px;">Violation Type</label>
        ${buildViolationSelect('cfpb-item-vtype-' + idx)}
      </div>
    </div>
    <div id="cfpb-item-other-${idx}" style="display:none;margin-bottom:8px;">
      <label style="font-size:11px;color:#9ca3af;display:block;margin-bottom:3px;">Describe Violation</label>
      <textarea class="input-field cfpb-item-other-text" data-idx="${idx}" rows="2" style="width:100%;font-size:12px;resize:vertical;" placeholder="Describe…"></textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
      <div>
        <label style="font-size:11px;color:#9ca3af;display:block;margin-bottom:3px;">Tone</label>
        ${buildToneSelect('cfpb-item-tone-' + idx)}
      </div>
      <div>
        <label style="font-size:11px;color:#9ca3af;display:block;margin-bottom:3px;">Response Received</label>
        ${buildResponseSelect('cfpb-item-response-' + idx)}
        <input type="text" id="cfpb-item-response-other-${idx}" class="input-field" placeholder="Describe…" style="display:none;margin-top:4px;width:100%;font-size:12px;padding:5px 8px;">
      </div>
    </div>
    <div id="cfpb-item-result-${idx}" style="display:none;margin-top:8px;"></div>
  </div>`;
}

export function openCfpbModal({ consumerId, roundData = null }) {
  const existingModal = document.getElementById('cfpbOverlay');
  if (existingModal) existingModal.remove();

  const items = roundData?.items || [];
  const uniqueBureaus = [...new Set(items.map(i => i.bureau).filter(Boolean))];
  const jobId = roundData?.jobId || null;
  const roundNum = roundData?.round || null;

  const overlay = document.createElement('div');
  overlay.id = 'cfpbOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow-y:auto;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);';

  const hasRoundData = items.length > 0;

  const itemCheckboxes = hasRoundData ? items.map((item, idx) => {
    const name = item.creditorName || item.creditor || 'Unknown';
    return `<label style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;cursor:pointer;"><input type="checkbox" class="cfpb-bureau-item-cb" value="${esc(name)}" checked> ${esc(name)}${item.bureau ? ' (' + esc(item.bureau) + ')' : ''}</label>`;
  }).join('') : '';

  overlay.innerHTML = `
  <div id="cfpbModalBox" style="background:var(--bg-card,#1a1d27);border:1px solid rgba(255,255,255,0.1);border-radius:16px;width:100%;max-width:680px;padding:28px 28px 24px;position:relative;min-width:0;">
    <button id="cfpbModalClose" type="button" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.06);border:none;color:#9ca3af;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">✕</button>
    <h2 style="font-size:18px;font-weight:700;margin:0 0 4px;">CFPB Complaint Generator</h2>
    <p style="font-size:13px;color:#9ca3af;margin:0 0 20px;">Draft a formal CFPB complaint using AI-generated FCRA-specific language.</p>

    ${hasRoundData ? `
    <div style="display:flex;gap:6px;margin-bottom:18px;background:rgba(255,255,255,0.04);border-radius:8px;padding:4px;">
      <button id="cfpbModeByBureau" type="button" data-mode="bureau"
        style="flex:1;padding:7px 12px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;background:rgba(99,102,241,0.3);border:1px solid rgba(99,102,241,0.5);color:#a5b4fc;">
        By Bureau
      </button>
      <button id="cfpbModeIndividual" type="button" data-mode="individual"
        style="flex:1;padding:7px 12px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;background:transparent;border:1px solid transparent;color:#9ca3af;">
        Individually
      </button>
    </div>
    ` : ''}

    <div id="cfpbBureauForm">
      ${hasRoundData && uniqueBureaus.length > 0 ? `
      <div style="margin-bottom:14px;">
        <label style="font-size:12px;color:#9ca3af;display:block;margin-bottom:4px;">Bureau / Target</label>
        <select id="cfpbBureauSelect" class="input-field w-full">
          ${uniqueBureaus.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('')}
        </select>
      </div>` : ''}
      <div style="margin-bottom:14px;">
        <label style="font-size:12px;color:#9ca3af;display:block;margin-bottom:4px;">Company Being Complained About <span style="color:#f87171;">*</span></label>
        <input type="text" id="cfpbBureauCompany" class="input-field w-full" placeholder="e.g. Equifax Information Services" value="${hasRoundData && uniqueBureaus.length === 1 ? esc(uniqueBureaus[0]) : ''}">
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:12px;color:#9ca3af;display:block;margin-bottom:4px;">Violation Type <span style="color:#f87171;">*</span></label>
        ${buildViolationSelect('cfpbBureauVtype')}
      </div>
      <div id="cfpbBureauOtherBox" style="display:none;margin-bottom:14px;">
        <label style="font-size:12px;color:#9ca3af;display:block;margin-bottom:4px;">Describe Violation</label>
        <textarea id="cfpbBureauOtherText" class="input-field w-full" rows="2" placeholder="Describe…"></textarea>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:12px;color:#9ca3af;display:block;margin-bottom:4px;">Tone</label>
        ${buildToneSelect('cfpbBureauTone')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <div>
          <label style="font-size:12px;color:#9ca3af;display:block;margin-bottom:4px;">Date Dispute Sent</label>
          <input type="date" id="cfpbBureauSentDate" class="input-field w-full">
        </div>
        <div>
          <label style="font-size:12px;color:#9ca3af;display:block;margin-bottom:4px;">Response Received</label>
          ${buildResponseSelect('cfpbBureauResponse')}
          <input type="text" id="cfpbBureauResponseOther" class="input-field w-full" placeholder="Describe…" style="display:none;margin-top:4px;">
        </div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:12px;color:#9ca3af;display:block;margin-bottom:4px;">Account(s) Disputed</label>
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px;max-height:140px;overflow-y:auto;">
          ${itemCheckboxes || '<span style="font-size:12px;color:#6b7280;">No items available</span>'}
        </div>
        <div style="margin-top:6px;display:flex;gap:6px;align-items:center;">
          <label style="font-size:11px;color:#818cf8;cursor:pointer;display:flex;align-items:center;gap:3px;"><input type="checkbox" id="cfpbBureauSelectAll" checked> Select All</label>
          <div style="flex:1;"></div>
          <input type="text" id="cfpbBureauCustomItem" class="input-field" placeholder="Add custom…" style="font-size:11px;padding:3px 6px;max-width:160px;">
          <button type="button" id="btnBureauAddCustom" style="font-size:10px;padding:2px 8px;background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.4);color:#818cf8;border-radius:5px;cursor:pointer;font-weight:600;">Add</button>
        </div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:12px;color:#9ca3af;display:block;margin-bottom:4px;">Additional Notes</label>
        <textarea id="cfpbBureauNotes" class="input-field w-full" rows="2" placeholder="Any additional context…"></textarea>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:12px;color:#9ca3af;display:block;margin-bottom:4px;">Attach Proof Documents</label>
        <div id="cfpbBureauProofArea" style="background:rgba(255,255,255,0.03);border:2px dashed rgba(255,255,255,0.12);border-radius:8px;padding:12px;text-align:center;cursor:pointer;">
          <input type="file" id="cfpbBureauProofInput" multiple accept=".pdf,.png,.jpg,.jpeg" style="display:none;">
          <div style="font-size:12px;color:#9ca3af;">Click to attach files (PDF, PNG, JPG — max 10 MB, up to 5)</div>
        </div>
        <div id="cfpbBureauProofList" style="margin-top:6px;"></div>
      </div>
      <div id="cfpbBureauError" style="display:none;color:#f87171;font-size:13px;margin-bottom:10px;"></div>
      <button id="btnCfpbBureauGenerate" type="button" class="btn-primary w-full" style="padding:10px;font-size:14px;font-weight:600;">Generate CFPB Complaint</button>
    </div>

    ${hasRoundData ? `
    <div id="cfpbIndividualForm" style="display:none;">
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:12px;color:#9ca3af;">Shared fields for all items:</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
          <div>
            <label style="font-size:11px;color:#9ca3af;display:block;margin-bottom:3px;">Date Dispute Sent</label>
            <input type="date" id="cfpbItemsSharedDate" class="input-field w-full" style="font-size:12px;padding:5px 8px;">
          </div>
          <div>
            <label style="font-size:11px;color:#9ca3af;display:block;margin-bottom:3px;">Additional Notes</label>
            <textarea id="cfpbItemsSharedNotes" class="input-field w-full" rows="1" style="font-size:12px;padding:5px 8px;" placeholder="Shared notes…"></textarea>
          </div>
        </div>
      </div>
      <div id="cfpbItemList">${items.map((item, idx) => buildItemRow(item, idx)).join('')}</div>
    </div>` : ''}

    <div id="cfpbModalResult" style="display:none;margin-top:20px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.08);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <strong style="font-size:14px;">Generated Complaint</strong>
        <div style="display:flex;gap:8px;">
          <button id="cfpbModalCopy" type="button" style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:#d1d5db;padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;">Copy</button>
          <button id="cfpbModalSave" type="button" style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);color:#34d399;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Save</button>
        </div>
      </div>
      <div style="font-size:11px;font-weight:700;letter-spacing:0.05em;color:#6b7280;text-transform:uppercase;margin-bottom:6px;">WHAT HAPPENED</div>
      <div id="cfpbModalNarrative" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;font-size:13px;line-height:1.7;white-space:pre-wrap;margin-bottom:12px;max-height:220px;overflow-y:auto;"></div>
      <div style="font-size:11px;font-weight:700;letter-spacing:0.05em;color:#6b7280;text-transform:uppercase;margin-bottom:6px;">WHAT RESOLUTION I AM SEEKING</div>
      <div id="cfpbModalResolution" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;font-size:13px;line-height:1.7;white-space:pre-wrap;max-height:180px;overflow-y:auto;"></div>
      <div id="cfpbModalSaveMsg" style="display:none;margin-top:8px;font-size:13px;color:#10b981;">Saved to client record.</div>
    </div>

    <div id="cfpbPastSection" style="display:none;margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);">
      <div style="font-size:12px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Past Complaints</div>
      <div id="cfpbPastList" style="max-height:200px;overflow-y:auto;"></div>
    </div>
  </div>`;

  document.body.appendChild(overlay);

  let lastResult = null;
  let lastPayload = null;
  let bureauProofFiles = [];
  let bureauUploadedKeys = [];

  const closeModal = () => overlay.remove();
  document.getElementById('cfpbModalClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  function getResponseVal(selectId, otherId) {
    const sel = document.getElementById(selectId);
    if (!sel) return '';
    if (sel.value === 'other') return document.getElementById(otherId)?.value?.trim() || '';
    return sel.value;
  }

  function getBureauSelectedItems() {
    const cbs = document.querySelectorAll('.cfpb-bureau-item-cb:checked');
    return Array.from(cbs).map(cb => cb.value);
  }

  async function uploadBureauProofFiles() {
    if (!bureauProofFiles.length) return [];
    const formData = new FormData();
    bureauProofFiles.forEach(f => formData.append('files', f));
    const resp = await fetch(`/api/consumers/${consumerId}/cfpb-proof`, {
      method: 'POST',
      headers: authHeader(),
      body: formData,
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'Upload failed');
    return data.files || [];
  }

  function renderBureauProofList() {
    const list = document.getElementById('cfpbBureauProofList');
    if (!list) return;
    if (!bureauProofFiles.length) { list.innerHTML = ''; return; }
    list.innerHTML = bureauProofFiles.map((f, i) => `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;font-size:12px;">
      <span style="color:#d1d5db;">${esc(f.name)}</span>
      <span style="color:#6b7280;font-size:10px;">(${(f.size/1024).toFixed(1)} KB)</span>
      <button type="button" data-pidx="${i}" class="rm-bureau-proof" style="color:#f87171;background:none;border:none;cursor:pointer;font-size:11px;">Remove</button>
    </div>`).join('');
  }

  const bureauProofArea = document.getElementById('cfpbBureauProofArea');
  const bureauProofInput = document.getElementById('cfpbBureauProofInput');
  bureauProofArea?.addEventListener('click', () => bureauProofInput?.click());
  bureauProofInput?.addEventListener('change', e => {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg'];
    for (const f of e.target.files) {
      if (bureauProofFiles.length >= 5) break;
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      if (!allowed.includes(ext) || f.size > 10 * 1024 * 1024) continue;
      bureauProofFiles.push(f);
    }
    e.target.value = '';
    bureauUploadedKeys = [];
    renderBureauProofList();
  });
  document.getElementById('cfpbBureauProofList')?.addEventListener('click', e => {
    const btn = e.target.closest('.rm-bureau-proof');
    if (!btn) return;
    bureauProofFiles.splice(parseInt(btn.dataset.pidx, 10), 1);
    bureauUploadedKeys = [];
    renderBureauProofList();
  });

  async function generateComplaint({ companyName, violationType, otherViolationText, itemsDisputed, disputeSentDate, responseOutcome, additionalNotes, roundJobId, tone }) {
    const payload = { companyName, violationType, otherViolationText, itemsDisputed, disputeSentDate, responseOutcome, additionalNotes, tone: tone || 'professional', roundJobId: roundJobId || jobId, save: false };
    const resp = await fetch(`/api/consumers/${consumerId}/cfpb-complaint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'Generation failed');
    lastPayload = payload;
    return data;
  }

  async function saveComplaint() {
    if (!lastResult || !lastPayload) return;
    const saveBtn = document.getElementById('cfpbModalSave');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      let savedProofFiles = bureauUploadedKeys;
      if (bureauProofFiles.length && !bureauUploadedKeys.length) {
        savedProofFiles = await uploadBureauProofFiles();
        bureauUploadedKeys = savedProofFiles;
      }
      const resp = await fetch(`/api/consumers/${consumerId}/cfpb-complaint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ ...lastPayload, proofFiles: savedProofFiles, save: true }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'Save failed');
      document.getElementById('cfpbModalSaveMsg').style.display = 'block';
      loadPastComplaints();
    } catch (e) {
      alert('Save failed: ' + e.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  }

  function showResult(narrative, resolution) {
    lastResult = { narrative, resolution };
    document.getElementById('cfpbModalNarrative').textContent = narrative || '';
    document.getElementById('cfpbModalResolution').textContent = resolution || '';
    document.getElementById('cfpbModalSaveMsg').style.display = 'none';
    document.getElementById('cfpbModalResult').style.display = 'block';
    document.getElementById('cfpbModalResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function loadPastComplaints() {
    try {
      const resp = await fetch(`/api/consumers/${consumerId}/cfpb-complaints`, { headers: authHeader() });
      const data = await resp.json();
      const complaints = data?.complaints || [];
      const section = document.getElementById('cfpbPastSection');
      const list = document.getElementById('cfpbPastList');
      if (!complaints.length) { section.style.display = 'none'; return; }
      section.style.display = 'block';
      list.innerHTML = complaints.slice(0, 5).map(c => {
        const date = c.generatedAt ? new Date(c.generatedAt).toLocaleDateString() : '';
        let proofHtml = '';
        if (Array.isArray(c.proofFiles) && c.proofFiles.length) {
          proofHtml = `<div style="margin-top:4px;font-size:11px;color:#818cf8;">Proof: ${c.proofFiles.map(f => `<a href="/api/consumers/${consumerId}/cfpb-proof/${encodeURIComponent(f.key)}" target="_blank" style="color:#818cf8;text-decoration:underline;margin-right:6px;">${esc(f.name)}</a>`).join('')}</div>`;
        }
        return `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:10px 12px;margin-bottom:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong style="font-size:12px;">${esc(c.companyName || '')}</strong>
            <span style="font-size:11px;color:#6b7280;">${esc(date)}</span>
          </div>
          <details style="font-size:12px;margin-top:4px;">
            <summary style="cursor:pointer;color:#818cf8;">Show</summary>
            <div style="white-space:pre-wrap;margin-top:6px;line-height:1.6;max-height:120px;overflow-y:auto;">${esc(c.narrative || '')}</div>
          </details>
          ${proofHtml}
        </div>`;
      }).join('');
    } catch (_) {}
  }

  document.getElementById('cfpbModalCopy')?.addEventListener('click', () => {
    if (!lastResult) return;
    const text = `WHAT HAPPENED:\n${lastResult.narrative}\n\nWHAT RESOLUTION I AM SEEKING:\n${lastResult.resolution}`;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('cfpbModalCopy');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    });
  });

  document.getElementById('cfpbModalSave')?.addEventListener('click', saveComplaint);

  const bureauVtype = document.getElementById('cfpbBureauVtype');
  bureauVtype?.addEventListener('change', () => {
    const box = document.getElementById('cfpbBureauOtherBox');
    if (box) box.style.display = bureauVtype.value === 'other' ? 'block' : 'none';
  });

  document.getElementById('cfpbBureauResponse')?.addEventListener('change', e => {
    const other = document.getElementById('cfpbBureauResponseOther');
    if (other) other.style.display = e.target.value === 'other' ? 'block' : 'none';
  });

  document.getElementById('cfpbBureauSelectAll')?.addEventListener('change', e => {
    document.querySelectorAll('.cfpb-bureau-item-cb').forEach(cb => { cb.checked = e.target.checked; });
  });

  document.getElementById('btnBureauAddCustom')?.addEventListener('click', () => {
    const input = document.getElementById('cfpbBureauCustomItem');
    const val = input?.value?.trim();
    if (!val) return;
    const container = document.querySelector('#cfpbBureauForm .cfpb-bureau-item-cb')?.closest('div') || document.getElementById('cfpbBureauForm');
    const panel = container?.parentElement;
    if (!panel) return;
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;cursor:pointer;';
    label.innerHTML = `<input type="checkbox" class="cfpb-bureau-item-cb" value="${esc(val)}" checked> ${esc(val)} <span style="color:#10b981;font-size:10px;">(custom)</span>`;
    panel.appendChild(label);
    input.value = '';
  });

  if (hasRoundData) {
    const bureauSelect = document.getElementById('cfpbBureauSelect');
    bureauSelect?.addEventListener('change', () => {
      const b = bureauSelect.value;
      const companyInput = document.getElementById('cfpbBureauCompany');
      if (companyInput && b) companyInput.value = b;
    });

    document.getElementById('cfpbModeByBureau')?.addEventListener('click', () => {
      document.getElementById('cfpbBureauForm').style.display = 'block';
      document.getElementById('cfpbIndividualForm').style.display = 'none';
      document.getElementById('cfpbModeByBureau').style.background = 'rgba(99,102,241,0.3)';
      document.getElementById('cfpbModeByBureau').style.borderColor = 'rgba(99,102,241,0.5)';
      document.getElementById('cfpbModeByBureau').style.color = '#a5b4fc';
      document.getElementById('cfpbModeIndividual').style.background = 'transparent';
      document.getElementById('cfpbModeIndividual').style.borderColor = 'transparent';
      document.getElementById('cfpbModeIndividual').style.color = '#9ca3af';
    });

    document.getElementById('cfpbModeIndividual')?.addEventListener('click', () => {
      document.getElementById('cfpbBureauForm').style.display = 'none';
      document.getElementById('cfpbIndividualForm').style.display = 'block';
      document.getElementById('cfpbModeIndividual').style.background = 'rgba(99,102,241,0.3)';
      document.getElementById('cfpbModeIndividual').style.borderColor = 'rgba(99,102,241,0.5)';
      document.getElementById('cfpbModeIndividual').style.color = '#a5b4fc';
      document.getElementById('cfpbModeByBureau').style.background = 'transparent';
      document.getElementById('cfpbModeByBureau').style.borderColor = 'transparent';
      document.getElementById('cfpbModeByBureau').style.color = '#9ca3af';
    });

    document.getElementById('cfpbItemList')?.addEventListener('change', e => {
      const select = e.target.closest('select');
      if (select && select.id.startsWith('cfpb-item-vtype-')) {
        const idx = select.id.replace('cfpb-item-vtype-', '');
        const otherBox = document.getElementById(`cfpb-item-other-${idx}`);
        if (otherBox) otherBox.style.display = select.value === 'other' ? 'block' : 'none';
      }
      if (select && select.id.startsWith('cfpb-item-response-')) {
        const idx = select.id.replace('cfpb-item-response-', '');
        const otherInput = document.getElementById(`cfpb-item-response-other-${idx}`);
        if (otherInput) otherInput.style.display = select.value === 'other' ? 'block' : 'none';
      }
    });

    document.getElementById('cfpbItemList')?.addEventListener('click', async e => {
      const btn = e.target.closest('.btn-cfpb-gen-item');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx, 10);
      const item = items[idx];
      if (!item) return;
      const companyInput = document.querySelector(`.cfpb-item-company[data-idx="${idx}"]`);
      const vtypeSelect = document.getElementById(`cfpb-item-vtype-${idx}`);
      const otherTextArea = document.querySelector(`.cfpb-item-other-text[data-idx="${idx}"]`);
      const sharedDate = document.getElementById('cfpbItemsSharedDate')?.value || '';
      const toneSelect = document.getElementById(`cfpb-item-tone-${idx}`);
      const responseVal = getResponseVal(`cfpb-item-response-${idx}`, `cfpb-item-response-other-${idx}`);

      const companyName = companyInput?.value?.trim() || item.creditorName || item.creditor || '';
      const violationType = vtypeSelect?.value || '';
      const otherViolationText = otherTextArea?.value?.trim() || '';
      if (!companyName || !violationType) {
        alert('Please enter a company name and select a violation type for this item.');
        return;
      }

      const resultDiv = document.getElementById(`cfpb-item-result-${idx}`);
      btn.disabled = true;
      btn.textContent = '…';

      try {
        const data = await generateComplaint({
          companyName, violationType, otherViolationText,
          itemsDisputed: [item.creditorName || item.creditor || ''],
          disputeSentDate: sharedDate, responseOutcome: responseVal,
          tone: toneSelect?.value || 'professional',
        });
        if (resultDiv) {
          resultDiv.style.display = 'block';
          resultDiv.innerHTML = `
            <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">WHAT HAPPENED</div>
            <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:8px;font-size:12px;line-height:1.6;white-space:pre-wrap;margin-bottom:8px;max-height:140px;overflow-y:auto;">${esc(data.narrative)}</div>
            <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">WHAT RESOLUTION I AM SEEKING</div>
            <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:8px;font-size:12px;line-height:1.6;white-space:pre-wrap;max-height:100px;overflow-y:auto;">${esc(data.resolution)}</div>
            <div style="display:flex;gap:6px;margin-top:8px;">
              <button onclick="navigator.clipboard.writeText(${JSON.stringify('WHAT HAPPENED:\n' + data.narrative + '\n\nWHAT RESOLUTION I AM SEEKING:\n' + data.resolution)});this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',2000);" type="button" style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);color:#9ca3af;padding:3px 10px;border-radius:5px;font-size:11px;cursor:pointer;">Copy</button>
              <button class="btn-cfpb-save-item" data-narrative="${esc(data.narrative)}" data-resolution="${esc(data.resolution)}" data-company="${esc(companyName)}" data-vtype="${esc(violationType)}" type="button" style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);color:#34d399;padding:3px 10px;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;">Save</button>
            </div>`;
          resultDiv.querySelector('.btn-cfpb-save-item')?.addEventListener('click', async function() {
            this.disabled = true; this.textContent = 'Saving…';
            try {
              const resp = await fetch(`/api/consumers/${consumerId}/cfpb-complaint`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader() },
                body: JSON.stringify({ companyName: this.dataset.company, violationType: this.dataset.vtype, narrative: this.dataset.narrative, resolution: this.dataset.resolution, roundJobId: jobId, save: true }),
              });
              const d = await resp.json();
              if (!d.ok) throw new Error(d.error);
              this.textContent = 'Saved!';
              loadPastComplaints();
            } catch (err) { alert('Save failed: ' + err.message); this.disabled = false; this.textContent = 'Save'; }
          });
        }
      } catch (err) {
        if (resultDiv) { resultDiv.style.display = 'block'; resultDiv.innerHTML = `<div style="color:#f87171;font-size:12px;">${esc(err.message)}</div>`; }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Generate';
      }
    });
  }

  document.getElementById('btnCfpbBureauGenerate')?.addEventListener('click', async () => {
    const companyName = document.getElementById('cfpbBureauCompany')?.value?.trim();
    const violationType = document.getElementById('cfpbBureauVtype')?.value;
    const otherViolationText = document.getElementById('cfpbBureauOtherText')?.value?.trim() || '';
    const errEl = document.getElementById('cfpbBureauError');

    if (!companyName) { errEl.textContent = 'Company name is required.'; errEl.style.display = 'block'; return; }
    if (!violationType) { errEl.textContent = 'Please select a violation type.'; errEl.style.display = 'block'; return; }
    if (violationType === 'other' && !otherViolationText) { errEl.textContent = 'Please describe the violation.'; errEl.style.display = 'block'; return; }
    errEl.style.display = 'none';

    const itemsDisputed = getBureauSelectedItems();
    const disputeSentDate = document.getElementById('cfpbBureauSentDate')?.value || '';
    const responseOutcome = getResponseVal('cfpbBureauResponse', 'cfpbBureauResponseOther');
    const additionalNotes = document.getElementById('cfpbBureauNotes')?.value?.trim() || '';
    const tone = document.getElementById('cfpbBureauTone')?.value || 'professional';

    const btn = document.getElementById('btnCfpbBureauGenerate');
    btn.disabled = true; btn.textContent = 'Generating…';
    try {
      const data = await generateComplaint({ companyName, violationType, otherViolationText, itemsDisputed, disputeSentDate, responseOutcome, additionalNotes, tone });
      showResult(data.narrative, data.resolution);
    } catch (e) {
      errEl.textContent = e.message || 'Generation failed'; errEl.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Generate CFPB Complaint';
    }
  });

  loadPastComplaints();
}
