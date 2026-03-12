import { api, authHeader } from '/common.js';

const $ = id => document.getElementById(id);

let currentConsumerId = null;
let lastResult = null;

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

$('consumerSelect')?.addEventListener('change', e => {
  currentConsumerId = e.target.value || null;
  lastResult = null;
  $('cfpbResultSection').style.display = 'none';
  $('cfpbSaveMsg').style.display = 'none';
  if (currentConsumerId) {
    $('cfpbFormSection').style.display = 'block';
    loadHistory(currentConsumerId);
  } else {
    $('cfpbFormSection').style.display = 'none';
    $('cfpbHistorySection').style.display = 'none';
  }
});

$('cfpbViolationType')?.addEventListener('change', e => {
  $('cfpbOtherBox').style.display = e.target.value === 'other' ? 'block' : 'none';
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

  const itemsRaw = $('cfpbItems')?.value?.trim() || '';
  const itemsDisputed = itemsRaw ? itemsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
  const disputeSentDate = $('cfpbSentDate')?.value || '';
  const responseOutcome = $('cfpbResponse')?.value?.trim() || '';
  const additionalNotes = $('cfpbNotes')?.value?.trim() || '';

  const btn = $('btnGenerateCfpb');
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Generating…';

  try {
    const data = await fetch(`/api/consumers/${currentConsumerId}/cfpb-complaint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ companyName: company, violationType, otherViolationText: otherText, itemsDisputed, disputeSentDate, responseOutcome, additionalNotes, save: false }),
    }).then(r => r.json());

    if (!data.ok) throw new Error(data.error || 'Generation failed');
    lastResult = { companyName: company, violationType, otherViolationText: otherText, itemsDisputed, disputeSentDate, responseOutcome, additionalNotes, narrative: data.narrative, resolution: data.resolution };

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
    const data = await fetch(`/api/consumers/${currentConsumerId}/cfpb-complaint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ ...lastResult, save: true }),
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
