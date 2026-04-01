import { authHeader, api, escapeHtml } from './common.js';

import { resolveStateInfo, STATES_WITH_ADDENDA } from './state-utils.js';

const $ = (s) => document.querySelector(s);

let currentConsumerId = null;
let currentReportId = null;
let currentDisputeData = null;
let disputePollTimer = null;
const disputeTemplateOverrides = {};
const selectedItems = new Set();
const collapsedRounds = new Set();

function getSelectionKey(jobId, itemIdx) {
  return `${jobId}__${itemIdx}`;
}

function updateSelectionToolbar() {
  const toolbar = $('#selectionToolbar');
  if (!toolbar) return;
  if (selectedItems.size > 0) {
    toolbar.style.display = 'flex';
    const countEl = toolbar.querySelector('#selCount');
    if (countEl) countEl.textContent = selectedItems.size;
  } else {
    toolbar.style.display = 'none';
  }
}

function toggleItemSelection(jobId, itemIdx, checkbox) {
  const key = getSelectionKey(jobId, itemIdx);
  if (checkbox.checked) {
    selectedItems.add(key);
  } else {
    selectedItems.delete(key);
  }
  const row = checkbox.closest('.dispute-item-row');
  if (row) row.style.background = checkbox.checked ? 'rgba(212,168,83,0.1)' : 'rgba(255,255,255,0.03)';
  updateSelectionToolbar();
}

async function batchUpdateStatus(newStatus) {
  if (!selectedItems.size || !currentConsumerId || !currentDisputeData) return;
  const byJob = {};
  selectedItems.forEach(key => {
    const [jobId, idx] = key.split('__');
    if (!byJob[jobId]) byJob[jobId] = [];
    byJob[jobId].push(parseInt(idx, 10));
  });
  for (const [jobId, indices] of Object.entries(byJob)) {
    const round = currentDisputeData.rounds?.find(r => r.jobId === jobId);
    if (!round || !round.items) continue;
    const items = indices.map(idx => {
      const item = round.items[idx];
      if (!item) return null;
      return { creditor: item.creditor, bureau: item.bureau, outcome: newStatus, notes: `Batch ${newStatus} by CRM user` };
    }).filter(Boolean);
    if (!items.length) continue;
    try {
      await api(`/api/consumers/${currentConsumerId}/disputes/${encodeURIComponent(jobId)}/response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
    } catch (err) {
      showErr(String(err));
    }
  }
  selectedItems.clear();
  updateSelectionToolbar();
  await loadDisputeTracker();
}

let DISPUTE_LETTER_TEMPLATES = [];

async function loadDisputeLetterTemplates() {
  try {
    const res = await fetch('/api/sample-letters');
    const data = await res.json().catch(() => ({}));
    DISPUTE_LETTER_TEMPLATES = data.templates || [];
  } catch {}
}
loadDisputeLetterTemplates();

function showErr(msg) {
  const el = $('#err');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 6000);
}

function buildIdempotencyKey(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const DISPUTE_STATUS_LABELS = {
  awaiting: { label: 'Awaiting', color: '#d4a853' },
  awaiting_response: { label: 'Awaiting Response', color: '#d4a853' },
  response_received: { label: 'Response Received', color: '#8b5cf6' },
  removed: { label: 'Removed', color: '#4ade80' },
  deleted: { label: 'Deleted', color: '#4ade80' },
  corrected: { label: 'Corrected', color: '#4ade80' },
  resolved: { label: 'Resolved', color: '#4ade80' },
  verified: { label: 'Verified', color: '#60a5fa' },
  no_response: { label: 'No Response', color: '#6b7280' },
  stalled: { label: 'Stalled', color: '#f87171' },
  escalated: { label: 'Escalated', color: '#f87171' },
  partial: { label: 'Partial', color: '#fbbf24' }
};

function disputeStatusBadge(status) {
  const info = DISPUTE_STATUS_LABELS[status] || { label: status || 'Unknown', color: '#6b7280' };
  return `<span class="dispute-status-badge" style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:${info.color}22;color:${info.color};border:1px solid ${info.color}44;">${escapeHtml(info.label)}</span>`;
}

function startDisputePolling() {
  stopDisputePolling();
  disputePollTimer = setInterval(() => {
    if (currentConsumerId) loadDisputeTracker();
  }, 30000);
}

function stopDisputePolling() {
  if (disputePollTimer) {
    clearInterval(disputePollTimer);
    disputePollTimer = null;
  }
}

async function loadConsumers() {
  const picker = $('#consumerPicker');
  if (!picker) return;
  try {
    const data = await api('/api/consumers');
    const consumers = data.consumers || data || [];
    consumers.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name || c.email || c.id;
      picker.appendChild(opt);
    });

    const params = new URLSearchParams(window.location.search);
    const clientId = params.get('client');
    if (clientId) {
      picker.value = clientId;
      selectConsumer(clientId);
    }
  } catch (err) {
    console.error('Failed to load consumers', err);
  }
}

async function selectConsumer(id) {
  stopDisputePolling();
  currentConsumerId = id || null;
  currentReportId = null;
  selectedItems.clear();
  updateSelectionToolbar();

  const ccaPanel = document.getElementById('consumerCollectorAddrPanel');
  if (!currentConsumerId) {
    const panel = $('#disputeTrackerPanel');
    if (panel) panel.classList.add('hidden');
    if (ccaPanel) ccaPanel.classList.add('hidden');
    currentDisputeData = null;
    return;
  }

  if (ccaPanel) ccaPanel.classList.remove('hidden');
  if (typeof _ccaPanel !== 'undefined') _ccaPanel.reload(currentConsumerId);

  try {
    const reportData = await api(`/api/consumers/${currentConsumerId}/reports`);
    if (reportData?.reports?.length) {
      currentReportId = reportData.reports[0].id;
    }
  } catch {}

  await loadDisputeTracker();
  startDisputePolling();
}

async function loadDisputeTracker() {
  const panel = $('#disputeTrackerPanel');
  if (!panel) return;
  if (!currentConsumerId) {
    panel.classList.add('hidden');
    currentDisputeData = null;
    const historySection = $('#letterHistorySection');
    if (historySection) historySection.innerHTML = `<div style="font-size:12px;color:#666;padding:8px 0;">Select a client to view letter history.</div>`;
    return;
  }

  try {
    const [data] = await Promise.all([
      api(`/api/consumers/${currentConsumerId}/disputes`),
      loadSentTemplates(currentConsumerId),
    ]);
    if (!data || data.ok === false) {
      panel.classList.add('hidden');
      currentDisputeData = null;
      return;
    }
    currentDisputeData = data;
    panel.classList.remove('hidden');
    renderDisputeTracker(data);
  } catch (err) {
    console.error('Failed to load dispute tracker', err);
    panel.classList.add('hidden');
    currentDisputeData = null;
  }
}

const MAIL_RATES = {
  regular:      { label: 'Regular',         rate: 1.00 },
  certified:    { label: 'Certified',        rate: 8.00 },
  certifiedPod: { label: 'Certified + POD',  rate: 11.00 },
};
const CERTIFIED_MAIL_RATE = MAIL_RATES.certified.rate;

function fmtPrice(n) { return '$' + n.toFixed(2); }

function showNextRoundTargetModal(recs) {
  return new Promise((resolve) => {
    let existing = document.getElementById('nextRoundTargetModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'nextRoundTargetModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:12000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);';

    const targets = recs.map(r => r.letterTarget || 'bureau');

    function renderRows() {
      return recs.map((rec, idx) => {
        const creditor = escapeHtml(rec.creditor || 'Unknown');
        const bureau = escapeHtml(rec.bureau || '');
        const template = escapeHtml(rec.recommendedTemplate || 'auto');
        const isColl = targets[idx] === 'collector';
        return `<div class="nrt-row" data-idx="${idx}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;">
          <div style="flex:1;min-width:0;overflow:hidden;">
            <div style="font-weight:600;color:#fff;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${creditor}</div>
            <div style="font-size:11px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${bureau}${bureau && template ? ' • ' : ''}${template ? `<span style="color:#60a5fa;">${template}</span>` : ''}</div>
          </div>
          <div style="display:flex;gap:0;border:1px solid rgba(255,255,255,0.15);border-radius:6px;overflow:hidden;flex-shrink:0;">
            <button type="button" class="nrt-toggle" data-idx="${idx}" data-target="bureau"
              style="padding:5px 11px;font-size:11px;font-weight:600;border:none;cursor:pointer;transition:background 0.15s,color 0.15s;background:${!isColl ? 'rgba(96,165,250,0.22)' : 'transparent'};color:${!isColl ? '#60a5fa' : '#666'};">
              Bureaus
            </button>
            <button type="button" class="nrt-toggle" data-idx="${idx}" data-target="collector"
              style="padding:5px 11px;font-size:11px;font-weight:600;border:none;cursor:pointer;transition:background 0.15s,color 0.15s;background:${isColl ? 'rgba(251,191,36,0.22)' : 'transparent'};color:${isColl ? '#fbbf24' : '#666'};">
              Collector
            </button>
          </div>
        </div>`;
      }).join('');
    }

    function buildHtml() {
      return `
        <div style="background:#1a1a1e;border:1px solid rgba(212,168,83,0.2);border-radius:12px;width:90%;max-width:600px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">
          <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <div style="font-weight:700;color:#fff;font-size:16px;">Generate Next Round Letters</div>
            <div style="font-size:12px;color:#888;margin-top:3px;">For each item, choose whether the letter goes to the credit bureaus or directly to the creditor/collector. Intellisense has pre-selected a target — you can override any item.</div>
          </div>
          <div id="nrtRows" style="padding:14px 20px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:7px;">
            ${renderRows()}
          </div>
          <div style="padding:12px 20px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:flex-end;gap:8px;">
            <button id="nrtCancel" type="button" style="padding:8px 18px;border-radius:7px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#888;font-size:13px;font-weight:600;cursor:pointer;">Cancel</button>
            <button id="nrtGenerate" type="button" style="padding:8px 20px;border-radius:7px;border:1px solid rgba(212,168,83,0.3);background:rgba(212,168,83,0.12);color:#d4a853;font-size:13px;font-weight:600;cursor:pointer;">Generate Letters</button>
          </div>
        </div>`;
    }

    modal.innerHTML = buildHtml();
    document.body.appendChild(modal);

    function refreshRow(idx) {
      const isColl = targets[idx] === 'collector';
      const row = modal.querySelector(`.nrt-row[data-idx="${idx}"]`);
      if (!row) return;
      row.querySelectorAll('.nrt-toggle').forEach(btn => {
        const isSel = btn.dataset.target === targets[idx];
        const isBureauBtn = btn.dataset.target === 'bureau';
        btn.style.background = isSel ? (isBureauBtn ? 'rgba(96,165,250,0.22)' : 'rgba(251,191,36,0.22)') : 'transparent';
        btn.style.color = isSel ? (isBureauBtn ? '#60a5fa' : '#fbbf24') : '#666';
      });
    }

    modal.addEventListener('click', (e) => {
      const btn = e.target.closest('.nrt-toggle');
      if (btn) {
        const idx = parseInt(btn.dataset.idx, 10);
        targets[idx] = btn.dataset.target;
        refreshRow(idx);
        return;
      }
      if (e.target === modal) { modal.remove(); resolve(null); }
    });

    document.getElementById('nrtCancel').addEventListener('click', () => { modal.remove(); resolve(null); });
    document.getElementById('nrtGenerate').addEventListener('click', () => { modal.remove(); resolve([...targets]); });
  });
}

function openLetterPreviewModal(letterJobId, letters, roundNum, portalSent, portalError) {
  let existing = document.getElementById('letterPreviewModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'letterPreviewModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);';

  const tokenParam = authHeader()?.Authorization ? `?token=${encodeURIComponent(authHeader().Authorization.replace('Bearer ',''))}` : '';

  const letterSelections = new Set(letters.map((_, i) => i));

  let cardsHtml = letters.map((l, i) => {
    const creditor = escapeHtml(l.creditor || l.creditorName || 'Letter');
    const bureau = escapeHtml(l.bureau || '');
    const idx = l.index ?? i;
    const htmlUrl = `/api/letters/${encodeURIComponent(letterJobId)}/${idx}.html${tokenParam}`;
    const pdfUrl = `/api/letters/${encodeURIComponent(letterJobId)}/${idx}.pdf${tokenParam}`;
    return `<div class="glass card lpm-letter-card" style="padding:12px;border:1px solid rgba(212,168,83,0.25);border-radius:8px;position:relative;">
      <label style="position:absolute;top:6px;left:6px;z-index:2;display:flex;align-items:center;cursor:pointer;" onclick="event.stopPropagation()">
        <input type="checkbox" class="lpm-letter-check" data-idx="${idx}" checked style="accent-color:#d4a853;width:15px;height:15px;cursor:pointer;" />
      </label>
      <div style="padding-left:20px;">
        <div style="font-weight:600;color:#fff;font-size:13px;">${creditor}</div>
        <div style="font-size:11px;color:#888;margin-bottom:8px;">${bureau}</div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-outline text-xs lpm-view" data-url="${escapeHtml(htmlUrl)}">View</button>
          <a class="btn btn-outline text-xs" href="${escapeHtml(pdfUrl)}" target="_blank" style="text-decoration:none;">PDF</a>
        </div>
      </div>
    </div>`;
  }).join('');

  const _initRate = MAIL_RATES.certified;
  const totalEst = fmtPrice(letters.length * _initRate.rate);

  const _mailTypePills = Object.entries(MAIL_RATES).map(([key, {label, rate}]) =>
    `<button class="lpm-mail-type" data-key="${key}" style="font-size:10px;padding:3px 8px;border-radius:20px;border:1px solid rgba(212,168,83,0.3);background:${key==='certified'?'rgba(212,168,83,0.18)':'transparent'};color:${key==='certified'?'#d4a853':'#888'};cursor:pointer;white-space:nowrap;transition:background 0.15s,color 0.15s;">${escapeHtml(label)} (${fmtPrice(rate)})</button>`
  ).join('');

  modal.innerHTML = `
    <div style="background:#1a1a1e;border:1px solid rgba(212,168,83,0.2);border-radius:12px;width:90%;max-width:740px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">
      <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-weight:700;color:#fff;font-size:16px;">Generated Letters — ${new Date().toLocaleDateString()}</div>
          <div style="font-size:12px;color:#888;">Round ${escapeHtml(String(roundNum))} • ${letters.length} letter${letters.length !== 1 ? 's' : ''} generated</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:#888;cursor:pointer;">
            <input type="checkbox" id="lpmSelectAll" checked style="accent-color:#d4a853;width:13px;height:13px;cursor:pointer;" /> All
          </label>
          <button id="lpmClose" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:4px 8px;">&times;</button>
        </div>
      </div>
      <div style="padding:16px 20px;overflow-y:auto;flex:1;">
        <div id="lpmLetterGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">${cardsHtml}</div>
        <div id="lpmGroupView" style="display:none;"></div>
      </div>

      <div style="padding:10px 20px;border-top:1px solid rgba(255,255,255,0.05);background:rgba(212,168,83,0.04);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-size:11px;color:#888;">📬 Mail type:</span>
            <div id="lpmMailTypePills" style="display:flex;gap:5px;flex-wrap:wrap;">${_mailTypePills}</div>
          </div>
          <span style="font-size:10px;color:#555;">Portal &amp; download are always free</span>
        </div>
        <div style="margin-top:7px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:11px;color:#888;">💰 Mailing est.:</span>
          <span id="lpmPriceText" style="font-size:13px;font-weight:700;color:#d4a853;">${letters.length} × ${fmtPrice(_initRate.rate)} = ${totalEst} (${escapeHtml(_initRate.label)})</span>
        </div>
      </div>

      <div style="padding:12px 20px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <a class="btn btn-outline text-xs" href="/api/letters/${encodeURIComponent(letterJobId)}/all.zip${tokenParam}" style="text-decoration:none;">⬇ All (ZIP)</a>
        <button id="lpmDownloadSelected" class="btn btn-outline text-xs" style="border-color:rgba(96,165,250,0.35);color:#60a5fa;">⬇ Selected (${letters.length})</button>
        <button id="lpmGroupToggle" class="btn btn-outline text-xs" style="border-color:rgba(168,85,247,0.4);color:#a855f7;">⊞ Group by Bureau</button>
        <button id="lpmDownloadGrouped" class="btn btn-outline text-xs" style="display:none;border-color:rgba(74,222,128,0.4);color:#4ade80;">⬇ Grouped (ZIP)</button>
        <button class="btn btn-outline text-xs" id="lpmSendPortal"${portalSent ? ' disabled style="color:#4ade80;border-color:#4ade80;"' : portalError ? ' style="color:#fbbf24;border-color:#fbbf24;"' : ''}>
          ${portalSent ? '\u2713 Portal' : portalError ? '\u26A0 Retry Portal' : '↑ Send to Portal'}
        </button>
        ${portalError ? `<span id="lpmPortalError" style="font-size:11px;color:#fbbf24;max-width:200px;display:inline-block;">${escapeHtml(portalError)}</span>` : ''}
        <a class="btn btn-outline text-xs" href="/letters?job=${encodeURIComponent(letterJobId)}" target="_blank" style="text-decoration:none;">Full View</a>
        <button class="btn text-xs" id="lpmDone" style="margin-left:auto;">Done</button>
      </div>
    </div>
    <div id="lpmIframeOverlay" style="display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.85);backdrop-filter:blur(4px);flex-direction:column;">
      <div style="padding:12px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.1);">
        <span id="lpmIframeTitle" style="color:#fff;font-weight:600;font-size:14px;">Letter Preview</span>
        <button id="lpmIframeClose" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;">&times;</button>
      </div>
      <iframe id="lpmIframe" style="flex:1;width:100%;border:none;background:#fff;"></iframe>
    </div>
  `;
  document.body.appendChild(modal);

  let activeMailKey = 'certified';

  function updateLpmCalc() {
    const count = letterSelections.size;
    const { label, rate } = MAIL_RATES[activeMailKey] || MAIL_RATES.certified;
    const total = fmtPrice(count * rate);
    const priceEl = modal.querySelector('#lpmPriceText');
    if (priceEl) {
      priceEl.textContent = count === 0
        ? 'No letters selected'
        : `${count} × ${fmtPrice(rate)} = ${total} (${label})`;
    }
    const dlBtn = modal.querySelector('#lpmDownloadSelected');
    if (dlBtn) {
      dlBtn.textContent = `⬇ Selected (${count})`;
      dlBtn.disabled = count === 0;
      dlBtn.style.opacity = count === 0 ? '0.4' : '1';
    }
    const allCb = modal.querySelector('#lpmSelectAll');
    if (allCb) {
      allCb.indeterminate = count > 0 && count < letters.length;
      allCb.checked = count === letters.length;
    }
  }

  modal.querySelectorAll('.lpm-mail-type').forEach(btn => {
    btn.addEventListener('click', () => {
      activeMailKey = btn.dataset.key;
      modal.querySelectorAll('.lpm-mail-type').forEach(b => {
        const active = b.dataset.key === activeMailKey;
        b.style.background = active ? 'rgba(212,168,83,0.18)' : 'transparent';
        b.style.color = active ? '#d4a853' : '#888';
        b.style.borderColor = active ? 'rgba(212,168,83,0.5)' : 'rgba(212,168,83,0.3)';
      });
      if (groupingActive) { updateGroupCalc(); } else { updateLpmCalc(); }
    });
  });

  modal.querySelectorAll('.lpm-letter-check').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      const card = e.target.closest('.lpm-letter-card');
      if (e.target.checked) {
        letterSelections.add(idx);
        if (card) card.style.borderColor = 'rgba(212,168,83,0.45)';
      } else {
        letterSelections.delete(idx);
        if (card) card.style.borderColor = 'rgba(212,168,83,0.15)';
      }
      if (groupingActive) { renderGroupView(); updateGroupCalc(); } else { updateLpmCalc(); }
    });
  });

  modal.querySelector('#lpmSelectAll')?.addEventListener('change', (e) => {
    letters.forEach((_, i) => {
      const idx = (letters[i].index ?? i);
      if (e.target.checked) {
        letterSelections.add(idx);
      } else {
        letterSelections.delete(idx);
      }
    });
    modal.querySelectorAll('.lpm-letter-check').forEach(cb => {
      cb.checked = e.target.checked;
      const card = cb.closest('.lpm-letter-card');
      if (card) card.style.borderColor = e.target.checked ? 'rgba(212,168,83,0.45)' : 'rgba(212,168,83,0.15)';
    });
    if (groupingActive) { renderGroupView(); updateGroupCalc(); } else { updateLpmCalc(); }
  });

  modal.querySelector('#lpmDownloadSelected')?.addEventListener('click', async () => {
    if (!letterSelections.size) return;
    const indices = [...letterSelections];
    const btn = modal.querySelector('#lpmDownloadSelected');
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Building ZIP…';
    try {
      const res = await fetch(`/api/letters/${encodeURIComponent(letterJobId)}/selected.zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ indices }),
      });
      if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`HTTP ${res.status} ${t}`.trim()); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `selected_letters.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      showErr(`Download failed: ${err.message || err}`);
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  });

  const MAX_GROUP_SIZE = 10;
  let groupingActive = false;
  const letterGrid = modal.querySelector('#lpmLetterGrid');
  const groupWrap  = modal.querySelector('#lpmGroupView');
  const groupToggleBtn    = modal.querySelector('#lpmGroupToggle');
  const groupedDlBtn      = modal.querySelector('#lpmDownloadGrouped');

  function computeBureauGroups() {
    const selected = letters.filter((l, i) => letterSelections.has(l.index ?? i));
    const byBureau = new Map();
    for (const l of selected) {
      const b = (l.bureau || 'Unknown').trim();
      if (!byBureau.has(b)) byBureau.set(b, []);
      byBureau.get(b).push(l);
    }
    const groups = [];
    for (const [bureau, items] of byBureau) {
      const totalParts = Math.ceil(items.length / MAX_GROUP_SIZE);
      for (let s = 0; s < items.length; s += MAX_GROUP_SIZE) {
        const partNum = Math.floor(s / MAX_GROUP_SIZE) + 1;
        groups.push({ bureau, items: items.slice(s, s + MAX_GROUP_SIZE), partNum, totalParts });
      }
    }
    return groups;
  }

  const _groupCollapsed = new Map();

  function renderGroupView() {
    const groups = computeBureauGroups();
    if (!groupWrap) return;
    if (groups.length === 0) {
      groupWrap.innerHTML = '<p style="color:#888;font-size:13px;padding:12px 0;">No letters selected.</p>';
      return;
    }
    const hasOverLimit = groups.some(g => g.totalParts > 1);
    let html = '';
    if (hasOverLimit) {
      html += `<div style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:12px;color:#fbbf24;">⚠ One or more bureaus have more than ${MAX_GROUP_SIZE} letters selected — they will be split into multiple packets.</div>`;
    }
    groups.forEach(({ bureau, items, partNum, totalParts }, gi) => {
      const sectionKey = `${bureau}::${partNum}`;
      const isCollapsed = _groupCollapsed.get(sectionKey) !== false;
      const label = totalParts > 1 ? `${escapeHtml(bureau)} — Part ${partNum} of ${totalParts}` : escapeHtml(bureau);
      const creditorList = items.map(l => escapeHtml(l.creditor || l.creditorName || 'Letter')).join(', ');
      html += `<div class="lpm-group-section" data-key="${escapeHtml(sectionKey)}" style="border:1px solid rgba(168,85,247,0.3);border-radius:8px;margin-bottom:8px;background:rgba(168,85,247,0.05);overflow:hidden;">
        <div class="lpm-group-header" data-key="${escapeHtml(sectionKey)}" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;user-select:none;">
          <span style="font-weight:700;color:#c084fc;font-size:13px;">📋 ${label}</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:11px;color:#888;background:rgba(168,85,247,0.12);border:1px solid rgba(168,85,247,0.2);border-radius:10px;padding:1px 8px;">${items.length} letter${items.length !== 1 ? 's' : ''} → 1 envelope</span>
            <span class="lpm-group-chevron" style="font-size:12px;color:#a855f7;transition:transform 0.2s;transform:rotate(${isCollapsed ? '0deg' : '180deg'})">${isCollapsed ? '▼' : '▲'}</span>
          </div>
        </div>
        <div class="lpm-group-body" data-key="${escapeHtml(sectionKey)}" style="padding:0 14px ${isCollapsed ? '0' : '10px'};max-height:${isCollapsed ? '0' : '200px'};overflow:hidden;transition:max-height 0.2s ease,padding 0.2s ease;">
          <div style="font-size:11px;color:#aaa;padding-top:${isCollapsed ? '0' : '4px'};">${creditorList}</div>
        </div>
      </div>`;
    });
    groupWrap.innerHTML = html;

    groupWrap.querySelectorAll('.lpm-group-header').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const key = hdr.dataset.key;
        const wasCollapsed = _groupCollapsed.get(key) !== false;
        _groupCollapsed.set(key, !wasCollapsed);
        const body = groupWrap.querySelector(`.lpm-group-body[data-key="${CSS.escape(key)}"]`);
        const chev = hdr.querySelector('.lpm-group-chevron');
        if (body) {
          if (wasCollapsed) {
            body.style.maxHeight = '200px';
            body.style.padding = '0 14px 10px';
            body.querySelector('div').style.paddingTop = '4px';
            if (chev) { chev.style.transform = 'rotate(180deg)'; chev.textContent = '▲'; }
          } else {
            body.style.maxHeight = '0';
            body.style.padding = '0 14px 0';
            body.querySelector('div').style.paddingTop = '0';
            if (chev) { chev.style.transform = 'rotate(0deg)'; chev.textContent = '▼'; }
          }
        }
      });
    });
  }

  function updateGroupCalc() {
    if (!groupingActive) return;
    const groups = computeBureauGroups();
    const envelopeCount = groups.length;
    const { label, rate } = MAIL_RATES[activeMailKey] || MAIL_RATES.certified;
    const priceEl = modal.querySelector('#lpmPriceText');
    if (priceEl) {
      priceEl.textContent = envelopeCount === 0
        ? 'No letters selected'
        : `${envelopeCount} envelope${envelopeCount !== 1 ? 's' : ''} × ${fmtPrice(rate)} = ${fmtPrice(envelopeCount * rate)} (${label})`;
    }
    if (groupedDlBtn) {
      groupedDlBtn.disabled = envelopeCount === 0;
      groupedDlBtn.style.opacity = envelopeCount === 0 ? '0.4' : '1';
      groupedDlBtn.textContent = `⬇ Grouped (${envelopeCount} envelope${envelopeCount !== 1 ? 's' : ''})`;
    }
  }

  groupToggleBtn?.addEventListener('click', () => {
    groupingActive = !groupingActive;
    if (groupingActive) {
      groupToggleBtn.style.background = 'rgba(168,85,247,0.18)';
      groupToggleBtn.style.color = '#c084fc';
      groupToggleBtn.style.borderColor = 'rgba(168,85,247,0.5)';
      groupToggleBtn.textContent = '⊞ Grouped ✓';
      if (letterGrid) letterGrid.style.display = 'none';
      if (groupWrap)  groupWrap.style.display = 'block';
      if (groupedDlBtn) groupedDlBtn.style.display = 'inline-flex';
      renderGroupView();
      updateGroupCalc();
    } else {
      groupToggleBtn.style.background = 'transparent';
      groupToggleBtn.style.color = '#a855f7';
      groupToggleBtn.style.borderColor = 'rgba(168,85,247,0.4)';
      groupToggleBtn.textContent = '⊞ Group by Bureau';
      if (letterGrid) letterGrid.style.display = '';
      if (groupWrap)  groupWrap.style.display = 'none';
      if (groupedDlBtn) groupedDlBtn.style.display = 'none';
      updateLpmCalc();
    }
  });

  groupedDlBtn?.addEventListener('click', async () => {
    const indices = [...letterSelections];
    if (!indices.length) return;
    const btn = groupedDlBtn;
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Building grouped ZIP…';
    try {
      const res = await fetch(`/api/letters/${encodeURIComponent(letterJobId)}/grouped.zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ indices }),
      });
      if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`HTTP ${res.status} ${t}`.trim()); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `grouped_letters.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      showErr(`Grouped download failed: ${err.message || err}`);
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  });

  const closeModal = () => { modal.remove(); loadDisputeTracker(); };
  modal.querySelector('#lpmClose').addEventListener('click', closeModal);
  modal.querySelector('#lpmDone').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  modal.querySelectorAll('.lpm-view').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = btn.dataset.url;
      const overlay = modal.querySelector('#lpmIframeOverlay');
      const iframe = modal.querySelector('#lpmIframe');
      iframe.src = url;
      overlay.style.display = 'flex';
    });
  });

  const iframeOverlay = modal.querySelector('#lpmIframeOverlay');
  modal.querySelector('#lpmIframeClose').addEventListener('click', () => {
    iframeOverlay.style.display = 'none';
    modal.querySelector('#lpmIframe').src = '';
  });

  modal.querySelector('#lpmSendPortal').addEventListener('click', async () => {
    const btn = modal.querySelector('#lpmSendPortal');
    let errEl = modal.querySelector('#lpmPortalError');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    btn.style.color = '';
    btn.style.borderColor = '';
    function showInlineErr(msg) {
      if (!errEl) {
        errEl = document.createElement('span');
        errEl.id = 'lpmPortalError';
        errEl.style.cssText = 'font-size:11px;color:#fbbf24;max-width:200px;display:inline-block;';
        btn.parentElement.insertBefore(errEl, btn.nextSibling);
      }
      errEl.textContent = msg;
    }
    const markPortalSent = () => {
      btn.textContent = '\u2713 Portal';
      btn.style.color = '#4ade80';
      btn.style.borderColor = '#4ade80';
      btn.disabled = true;
      if (errEl) errEl.remove();
    };
    const markPortalErr = msg => {
      btn.disabled = false;
      btn.textContent = '\u26A0 Retry Portal';
      btn.style.color = '#fbbf24';
      btn.style.borderColor = '#fbbf24';
      showInlineErr(msg);
    };
    try {
      const res = await api(`/api/letters/${encodeURIComponent(letterJobId)}/portal`, { method: 'POST' });
      if (res?.ok) {
        markPortalSent();
      } else if (res?.status === 404) {
        const round = currentDisputeData?.rounds?.find(r => r.jobId === letterJobId);
        if (!round) {
          markPortalErr('Letters not found — please regenerate manually.');
        } else {
          try {
            await regenerateAndSendPortal(round, msg => { btn.textContent = msg; });
            markPortalSent();
          } catch (regenErr) {
            markPortalErr(`Auto-regeneration failed: ${regenErr.message || regenErr}`);
          }
        }
      } else {
        markPortalErr(res?.error || res?.message || 'Failed to send to portal.');
      }
    } catch (err) {
      markPortalErr(String(err.message || err));
    }
  });
}

function renderStateLawBadge(consumerState) {
  if (!consumerState) return '';
  const info = resolveStateInfo(consumerState);
  if (!info.code) return '';
  if (!STATES_WITH_ADDENDA.has(info.code)) return '';
  const label = info.name || info.code;
  return `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:600;background:rgba(212,168,83,0.12);color:#d4a853;border:1px solid rgba(212,168,83,0.3);margin-left:8px;" title="${escapeHtml(label)} consumer-protection law addendum is included in generated letters">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    ${escapeHtml(label)} Law
  </span>`;
}

// Track previously sent letterTypes per creditor+bureau for "Sent previously" markers
let _sentTemplatesByCreditorBureau = {};

async function loadSentTemplates(consumerId) {
  try {
    const data = await api(`/api/consumers/${consumerId}/letter-history`);
    const map = {};
    for (const letter of (data?.letters || [])) {
      if (!letter.letterType) continue;
      const key = `${(letter.creditor || '').toLowerCase()}__${(letter.bureau || '').toLowerCase()}`;
      if (!map[key]) map[key] = new Set();
      map[key].add(letter.letterType);
    }
    _sentTemplatesByCreditorBureau = map;
  } catch {
    _sentTemplatesByCreditorBureau = {};
  }
}

function getSentTemplatesFor(creditor, bureau) {
  const key = `${(creditor || '').toLowerCase()}__${(bureau || '').toLowerCase()}`;
  return _sentTemplatesByCreditorBureau[key] || new Set();
}

async function renderLetterHistory(consumerId) {
  const container = $('#letterHistorySection');
  if (!container) return;
  try {
    const data = await api(`/api/consumers/${consumerId}/letter-history`);
    const letters = data?.letters || [];
    const summaries = data?.summaries || [];

    if (!letters.length && !summaries.length) {
      container.innerHTML = `<div style="font-size:12px;color:#666;padding:8px 0;">No letters generated yet for this client.</div>`;
      return;
    }

    const tokenParam = authHeader()?.Authorization ? `?token=${encodeURIComponent(authHeader().Authorization.replace('Bearer ',''))}` : '';

    // Build deduped at-a-glance list: one row per unique (letterType, bureau) combo, newest date
    const dedupMap = new Map();
    for (const letter of letters) {
      const tplKey = `${letter.letterType || '(unknown)'}__${letter.bureau || ''}`;
      const existing = dedupMap.get(tplKey);
      const letterAt = letter.at ? new Date(letter.at).getTime() : 0;
      if (!existing || letterAt > (existing.latestAt || 0)) {
        dedupMap.set(tplKey, {
          letterType: letter.letterType,
          bureau: letter.bureau,
          creditor: letter.creditor,
          round: letter.round,
          jobId: letter.jobId,
          latestAt: letterAt,
          at: letter.at,
        });
      }
    }
    const deduped = Array.from(dedupMap.values()).sort((a, b) => (b.latestAt || 0) - (a.latestAt || 0));

    // Build per-round detail grouped by jobId (for expandable section)
    const byJob = new Map();
    for (const letter of letters) {
      const key = letter.jobId || `nojob_${letter.at}`;
      if (!byJob.has(key)) {
        byJob.set(key, { jobId: letter.jobId, round: letter.round, at: letter.at, letterItems: [] });
      }
      byJob.get(key).letterItems.push(letter);
    }
    const groups = Array.from(byJob.values()).sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

    let html = `<div style="display:flex;flex-direction:column;gap:10px;">`;

    // At-a-glance deduped table
    html += `<div>
      <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Letter types sent</div>
      <div style="display:flex;flex-direction:column;gap:3px;">`;
    for (const entry of deduped) {
      const date = entry.at ? new Date(entry.at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
      const tpl = escapeHtml(entry.letterType || '(unknown)');
      const bureau = escapeHtml(entry.bureau || '');
      const roundBadge = entry.round ? `<span style="font-size:9px;color:#d4a853;background:rgba(212,168,83,0.1);padding:1px 5px;border-radius:9999px;border:1px solid rgba(212,168,83,0.2);">R${entry.round}</span>` : '';
      html += `<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:6px;font-size:11px;">
        <span style="font-weight:600;color:#e5e7eb;flex:1;min-width:0;">${tpl}</span>
        <span style="color:#9ca3af;">${bureau}</span>
        ${roundBadge}
        <span style="color:#666;white-space:nowrap;margin-left:auto;">${escapeHtml(date)}</span>
      </div>`;
    }
    // Summaries from standalone jobs with no round data
    for (const s of summaries) {
      const date = s.at ? new Date(s.at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
      const bureaus = (s.bureaus || []).join(', ') || 'N/A';
      const dlLink = s.jobId ? `/api/letters/${encodeURIComponent(s.jobId)}/all.zip${tokenParam}` : null;
      html += `<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:6px;font-size:11px;">
        <span style="color:#888;flex:1;">${s.count} letter${s.count !== 1 ? 's' : ''} · ${escapeHtml(bureaus)}</span>
        <span style="color:#666;white-space:nowrap;">${escapeHtml(date)}</span>
        ${dlLink ? `<a href="${escapeHtml(dlLink)}" style="font-size:10px;color:#60a5fa;text-decoration:none;white-space:nowrap;margin-left:4px;">⬇</a>` : ''}
      </div>`;
    }
    html += `</div></div>`;

    // Expandable per-round detail
    if (groups.length > 0) {
      const detailId = `lh-detail-${consumerId}`;
      html += `<details style="font-size:11px;">
        <summary style="cursor:pointer;color:#60a5fa;font-size:11px;list-style:none;display:flex;align-items:center;gap:4px;user-select:none;">
          <span>▶</span> Round-by-round detail
        </summary>
        <div style="margin-top:6px;display:flex;flex-direction:column;gap:6px;">`;
      for (const group of groups) {
        const date = group.at ? new Date(group.at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown date';
        const roundLabel = group.round ? `Round ${group.round}` : 'No round';
        const dlLink = group.jobId ? `/api/letters/${encodeURIComponent(group.jobId)}/all.zip${tokenParam}` : null;
        const itemsHtml = group.letterItems.map(l => {
          const creditor = escapeHtml(l.creditor || 'Unknown');
          const bureau = escapeHtml(l.bureau || '');
          const tpl = l.letterType ? `<span style="color:#888;font-size:10px;">${escapeHtml(l.letterType)}</span>` : '';
          return `<div style="font-size:10px;color:#ccc;padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-weight:500;">${creditor}</span><span style="color:#666;">→</span><span style="color:#9ca3af;">${bureau}</span>${tpl}
          </div>`;
        }).join('');
        html += `<div style="padding:6px 8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:6px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <span style="font-weight:600;color:#e5e7eb;">${escapeHtml(date)}</span>
            <span style="font-size:10px;color:#d4a853;">${escapeHtml(roundLabel)}</span>
            <span style="font-size:10px;color:#666;margin-left:auto;">${group.letterItems.length} letter${group.letterItems.length !== 1 ? 's' : ''}</span>
            ${dlLink ? `<a href="${escapeHtml(dlLink)}" style="font-size:10px;color:#60a5fa;text-decoration:none;">⬇ ZIP</a>` : ''}
          </div>
          <div>${itemsHtml}</div>
        </div>`;
      }
      html += `</div></details>`;
    }

    html += `</div>`;
    container.innerHTML = html;
  } catch {
    container.innerHTML = `<div style="font-size:12px;color:#666;padding:8px 0;">Could not load letter history.</div>`;
  }
}

function renderDisputeTracker(data) {
  const subtitle = $('#disputeTrackerSubtitle');
  const analysisCard = $('#disputeAnalysisCard');
  const analysisBody = $('#disputeAnalysisBody');
  const analysisTitle = $('#disputeAnalysisTitle');
  const timeline = $('#disputeTimeline');

  const activation = data.activation;
  const rounds = data.rounds || [];
  const consumerState = data.consumerState || null;

  if (activation && activation.items && activation.items.length > 0) {
    analysisCard.classList.remove('hidden');
    const stateBadge = renderStateLawBadge(consumerState);
    analysisTitle.innerHTML = `Report Analysis — ${activation.items.length} negative item${activation.items.length !== 1 ? 's' : ''} found${stateBadge}`;
    let html = '';
    activation.items.forEach(item => {
      const creditor = escapeHtml(item.creditor || 'Unknown');
      const bureaus = (item.bureaus || []).map(b => escapeHtml(b)).join(', ') || 'N/A';
      const vCount = item.violationCount || 0;
      html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(212,168,83,0.06);border:1px solid rgba(212,168,83,0.15);border-radius:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;color:#fff;font-size:13px;">${creditor}</div>
          <div style="font-size:11px;color:#888;">${bureaus} • ${vCount} violation${vCount !== 1 ? 's' : ''}</div>
        </div>
      </div>`;
    });

    if (activation.recommendations && activation.recommendations.length > 0) {
      html += `<div style="margin-top:8px;font-weight:600;color:#d4a853;font-size:12px;">Initial Letter Recommendations</div>`;
      activation.recommendations.forEach(rec => {
        const creditor = escapeHtml(rec.creditor || '');
        const template = escapeHtml(rec.recommendedTemplate || '');
        const reason = escapeHtml(rec.reason || '');
        const urgencyColor = rec.urgency === 'high' ? '#f87171' : rec.urgency === 'medium' ? '#fbbf24' : '#4ade80';
        const isCollector = rec.letterTarget === 'collector';
        const targetLabel = isCollector ? '→ Collector' : '→ Bureaus';
        const targetColor = isCollector ? '#fbbf24' : '#60a5fa';
        html += `<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 10px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.12);border-radius:6px;">
          <div style="flex:1;">
            <div style="font-size:12px;font-weight:600;color:#fff;">${creditor}: <span style="color:#60a5fa;">${template}</span> <span style="font-size:10px;font-weight:700;color:${targetColor};padding:1px 6px;border-radius:10px;border:1px solid ${targetColor}33;background:${isCollector ? 'rgba(251,191,36,0.1)' : 'rgba(96,165,250,0.1)'};">${targetLabel}</span></div>
            <div style="font-size:11px;color:#888;">${reason}</div>
          </div>
          <span style="font-size:10px;font-weight:600;color:${urgencyColor};text-transform:uppercase;">${escapeHtml(rec.urgency || '')}</span>
        </div>`;
      });
    }
    analysisBody.innerHTML = html;
  } else {
    analysisCard.classList.add('hidden');
  }

  if (currentConsumerId) {
    renderLetterHistory(currentConsumerId);
  }

  if (rounds.length === 0 && !activation) {
    subtitle.textContent = 'No active disputes.';
    timeline.innerHTML = `<div class="muted text-center" style="padding:16px;">No dispute rounds recorded yet. Upload a credit report and generate letters to begin tracking.</div>`;
    return;
  }

  const totalItems = rounds.reduce((sum, r) => sum + (r.items || []).length, 0);
  const activeRounds = rounds.filter(r => r.status !== 'resolved').length;
  subtitle.textContent = `${rounds.length} round${rounds.length !== 1 ? 's' : ''} • ${totalItems} item${totalItems !== 1 ? 's' : ''} tracked${activeRounds > 0 ? ` • ${activeRounds} active` : ''}`;

  let html = '';
  rounds.forEach((round, rIdx) => {
    const roundNum = round.round || (rIdx + 1);
    const sentDate = round.sentAt ? new Date(round.sentAt).toLocaleDateString() : 'N/A';
    const sentDateISO = round.sentAt ? (() => { const d = new Date(round.sentAt); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })() : '';
    const followUpDate = round.followUpDate ? new Date(round.followUpDate).toLocaleDateString() : 'N/A';
    const followUpDays = round.followUpDays || 30;
    const questionnaireCompleted = round.questionnaireCompleted || false;
    const jobId = round.jobId || '';
    const items = round.items || [];

    const isResolved = round.status === 'resolved';
    const isCollapsed = collapsedRounds.has(jobId) || (isResolved && !collapsedRounds.has(`${jobId}__expanded`));
    const chevron = isCollapsed ? '▶' : '▼';

    html += `<div class="glass card" style="border-left:3px solid ${isResolved ? '#4ade80' : '#d4a853'};padding:0;overflow:hidden;">`;
    html += `<div class="dispute-round-header" data-job-id="${escapeHtml(jobId)}" data-resolved="${isResolved}" style="display:flex;align-items:center;justify-content:space-between;padding:12px;cursor:pointer;user-select:none;transition:background .15s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
      <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
        <span class="round-chevron" style="font-size:10px;color:#888;transition:transform .2s;flex-shrink:0;">${chevron}</span>
        <span style="font-weight:700;color:#fff;font-size:14px;">Round ${escapeHtml(String(roundNum))}</span>
        <span class="dispute-sent-date" data-job-id="${escapeHtml(jobId)}" data-sent-iso="${sentDateISO}" style="font-size:12px;color:#888;cursor:pointer;border-bottom:1px dashed rgba(136,136,136,0.4);padding-bottom:1px;" title="Click to edit sent date" onclick="event.stopPropagation()">Sent ${sentDate}</span>
        ${disputeStatusBadge(round.status || 'awaiting')}
        <span style="font-size:11px;color:#666;margin-left:auto;">${items.length} item${items.length !== 1 ? 's' : ''}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;" onclick="event.stopPropagation()">
        <span style="font-size:11px;color:#888;">Follow-up:</span>
        <input type="number" class="dispute-followup-days" data-job-id="${escapeHtml(jobId)}" value="${followUpDays}" min="1" max="365" style="width:60px;padding:2px 6px;border-radius:6px;border:1px solid rgba(212,168,83,0.2);background:#1a1a1e;color:#fff;font-size:12px;text-align:center;" />
        <span style="font-size:11px;color:#888;">days (${followUpDate})</span>
      </div>
    </div>`;

    html += `<div class="dispute-round-body" data-job-id="${escapeHtml(jobId)}" style="padding:0 12px 12px;${isCollapsed ? 'display:none;' : ''}">`;

    html += `<div style="font-size:11px;color:${questionnaireCompleted ? '#4ade80' : '#888'};margin-bottom:8px;">
      ${questionnaireCompleted ? '✓ Client questionnaire completed' : '○ Awaiting client questionnaire'}
    </div>`;

    if (round.letters && round.letters.length > 0) {
      html += `<div style="font-size:11px;color:#888;margin-bottom:4px;">Letters sent: ${round.letters.length}</div>`;
    }

    if (items.length > 0) {
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;color:#888;">
          <input type="checkbox" class="dispute-select-all" data-job-id="${escapeHtml(jobId)}" style="accent-color:#d4a853;width:14px;height:14px;cursor:pointer;" />
          Select All (${items.length})
        </label>
      </div>`;
      html += `<div class="space-y-2" style="margin-bottom:8px;">`;
      items.forEach((item, itemIdx) => {
        const creditor = escapeHtml(item.creditor || 'Unknown');
        const bureau = escapeHtml(item.bureau || '');
        const status = item.status || 'awaiting';
        const notes = item.notes ? escapeHtml(item.notes) : '';
        const iDays = item.followUpDays || 30;
        const iDate = item.followUpDate ? new Date(item.followUpDate).toLocaleDateString() : '';
        const overrideKey = `${jobId}__${itemIdx}`;
        const currentOverride = disputeTemplateOverrides[overrideKey] || '';
        const selKey = getSelectionKey(jobId, itemIdx);
        const isChecked = selectedItems.has(selKey);
        const acctNum = item.accountNumber ? escapeHtml(item.accountNumber) : '';
        const disputeReason = item.specificDisputeReason ? escapeHtml(item.specificDisputeReason) : '';

        html += `<div class="dispute-item-row" data-sel-key="${escapeHtml(selKey)}" style="padding:6px 10px;background:${isChecked ? 'rgba(212,168,83,0.1)' : 'rgba(255,255,255,0.03)'};border-radius:6px;border:1px solid ${isChecked ? 'rgba(212,168,83,0.3)' : 'rgba(255,255,255,0.06)'};cursor:pointer;transition:background .15s,border-color .15s;">
          <div class="dispute-item-header" style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" class="dispute-item-check" data-job-id="${escapeHtml(jobId)}" data-item-index="${itemIdx}" ${isChecked ? 'checked' : ''} style="accent-color:#d4a853;width:15px;height:15px;cursor:pointer;flex-shrink:0;" />
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;color:#fff;font-size:12px;">${creditor}${acctNum ? ` <span style="color:#666;font-weight:400;">(····${acctNum})</span>` : ''}</div>
              <div style="font-size:11px;color:#888;">${bureau}</div>
            </div>
            <div class="dispute-item-status-wrap" style="position:relative;" onclick="event.stopPropagation()">
              ${disputeStatusBadge(status)}
              <select class="dispute-item-status-select" data-job-id="${escapeHtml(jobId)}" data-item-index="${itemIdx}" data-creditor="${creditor}" data-bureau="${bureau}" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:11px;">
                <option value="" disabled selected>Change status…</option>
                <option value="removed"${status==='removed'?' selected':''}>Removed</option>
                <option value="deleted"${status==='deleted'?' selected':''}>Deleted</option>
                <option value="corrected"${status==='corrected'?' selected':''}>Corrected</option>
                <option value="verified"${status==='verified'?' selected':''}>Verified</option>
                <option value="updated"${status==='updated'?' selected':''}>Updated</option>
                <option value="stalled"${status==='stalled'?' selected':''}>Stalled</option>
                <option value="no_response"${status==='no_response'?' selected':''}>No Response</option>
                <option value="partial"${status==='partial'?' selected':''}>Partial</option>
              </select>
            </div>
            <svg class="dispute-item-chevron" style="width:14px;height:14px;color:#666;flex-shrink:0;transition:transform .2s;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div class="dispute-item-details" style="display:none;margin-top:6px;padding:6px 0 2px 23px;border-top:1px solid rgba(255,255,255,0.05);">
            <div style="display:flex;flex-wrap:wrap;gap:8px 16px;font-size:11px;color:#aaa;margin-bottom:6px;">
              <span>Follow-up: <input type="number" class="dispute-item-followup-days" data-job-id="${escapeHtml(jobId)}" data-item-index="${itemIdx}" value="${iDays}" min="1" max="180" onclick="event.stopPropagation()" style="width:44px;padding:1px 4px;border-radius:4px;border:1px solid rgba(212,168,83,0.2);background:#1a1a1e;color:#fff;font-size:10px;text-align:center;" /> days${iDate ? ` (${iDate})` : ''}</span>
            </div>
            ${disputeReason ? `<div style="font-size:11px;color:#ccc;margin-bottom:4px;"><span style="color:#888;">Reason:</span> ${disputeReason}</div>` : ''}
            ${notes ? `<div style="font-size:11px;color:#ccc;margin-bottom:4px;"><span style="color:#888;">Notes:</span> ${notes}</div>` : ''}`;

        if (round.status !== 'resolved') {
          const sentTpls = getSentTemplatesFor(item.creditor || '', item.bureau || '');
          const tplOptions = (DISPUTE_LETTER_TEMPLATES || []).map(t => {
            const tid = escapeHtml(t.id || '');
            const tname = escapeHtml(t.name || t.id || '');
            const selected = currentOverride === t.id ? ' selected' : '';
            const wasSent = sentTpls.has(t.id);
            const sentMarker = wasSent ? ' — Sent previously' : '';
            return `<option value="${tid}"${selected}>${tname}${sentMarker}</option>`;
          }).join('');
          const sentCount = sentTpls.size;
          const sentInfo = sentCount > 0 ? `<span style="font-size:10px;color:#d4a853;margin-left:4px;">${sentCount} type${sentCount !== 1 ? 's' : ''} sent previously to this bureau</span>` : '';
          html += `<div style="margin-top:4px;" onclick="event.stopPropagation()">
            <div style="font-size:10px;color:#888;margin-bottom:2px;display:flex;align-items:center;gap:4px;">Next round template:${sentInfo}</div>
            <select class="dispute-template-override" data-job-id="${escapeHtml(jobId)}" data-item-index="${itemIdx}" style="width:100%;padding:2px 6px;border-radius:4px;border:1px solid rgba(96,165,250,0.2);background:#1a1a1e;color:#9ca3af;font-size:10px;">
              <option value="">Auto (use recommendation)</option>
              ${tplOptions}
            </select>
          </div>`;
        }

        if (item.evidence && item.evidence.length > 0) {
          html += `<div style="margin-top:4px;">`;
          item.evidence.forEach(ev => {
            const name = escapeHtml(ev.name || ev.originalName || 'Evidence');
            const url = ev.url ? escapeHtml(ev.url) : '#';
            html += `<div style="font-size:11px;color:#60a5fa;"><a href="${url}" target="_blank" onclick="event.stopPropagation()" style="color:#60a5fa;text-decoration:underline;">📎 ${name}</a></div>`;
          });
          html += `</div>`;
        }

        if (item.recommendation) {
          const rec = item.recommendation;
          const tpl = escapeHtml(rec.recommendedTemplate || 'None');
          const reason = escapeHtml(rec.reason || '');
          const altTemplates = (rec.alternativeTemplates || []).map(t => escapeHtml(t)).join(', ');
          const isCollector = rec.letterTarget === 'collector';
          const targetLabel = isCollector ? '→ Collector' : '→ Bureaus';
          const targetColor = isCollector ? '#fbbf24' : '#60a5fa';
          const targetBg = isCollector ? 'rgba(251,191,36,0.1)' : 'rgba(96,165,250,0.1)';
          html += `<div style="margin-top:4px;padding:4px 8px;background:rgba(96,165,250,0.06);border-radius:4px;border:1px solid rgba(96,165,250,0.1);">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span style="font-size:11px;color:#60a5fa;font-weight:600;">Recommended: ${tpl}</span>
              <span style="font-size:10px;font-weight:700;color:${targetColor};background:${targetBg};padding:1px 6px;border-radius:10px;border:1px solid ${targetColor}33;">${targetLabel}</span>
            </div>
            <div style="font-size:10px;color:#888;">${reason}</div>
            ${altTemplates ? `<div style="font-size:10px;color:#666;">Alternatives: ${altTemplates}</div>` : ''}
          </div>`;
        }

        html += `</div></div>`;
      });
      html += `</div>`;
    }

    html += `<div style="padding-top:8px;margin-top:4px;border-top:1px solid rgba(255,255,255,0.05);">
      <button class="btn-cfpb-round" data-job-id="${escapeHtml(jobId)}" type="button"
        style="display:inline-flex;align-items:center;gap:6px;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);color:#818cf8;border-radius:7px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
        Send to Client
      </button>
    </div>`;

    html += `</div>`;
    html += `</div>`;
  });

  timeline.innerHTML = html;

  timeline.querySelectorAll('.dispute-round-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('input, select, button, .dispute-sent-date')) return;
      const jid = header.dataset.jobId;
      const isResolved = header.dataset.resolved === 'true';
      const body = timeline.querySelector(`.dispute-round-body[data-job-id="${jid}"]`);
      const chevron = header.querySelector('.round-chevron');
      if (!body) return;
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? '' : 'none';
      if (chevron) chevron.textContent = isHidden ? '▼' : '▶';
      if (isResolved) {
        if (isHidden) {
          collapsedRounds.delete(jid);
          collapsedRounds.add(`${jid}__expanded`);
        } else {
          collapsedRounds.add(jid);
          collapsedRounds.delete(`${jid}__expanded`);
        }
      } else {
        if (isHidden) {
          collapsedRounds.delete(jid);
        } else {
          collapsedRounds.add(jid);
        }
      }
    });
  });

  timeline.querySelectorAll('.dispute-item-check').forEach(cb => {
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleItemSelection(e.target.dataset.jobId, parseInt(e.target.dataset.itemIndex, 10), e.target);
    });
  });

  timeline.querySelectorAll('.dispute-item-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('input, select, button, a, .dispute-item-status-wrap')) return;
      const details = row.querySelector('.dispute-item-details');
      const chevron = row.querySelector('.dispute-item-chevron');
      if (details) {
        const isOpen = details.style.display !== 'none';
        details.style.display = isOpen ? 'none' : '';
        if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
      }
    });
  });

  timeline.querySelectorAll('.btn-cfpb-round').forEach(btn => {
    btn.addEventListener('click', async () => {
      const jid = btn.dataset.jobId;
      if (!jid) { showErr('No letter job found for this round.'); return; }
      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        const res = await api(`/api/letters/${encodeURIComponent(jid)}/portal`, { method: 'POST' });
        if (res?.ok) {
          btn.textContent = '✓ Sent';
          btn.style.color = '#4ade80';
          btn.style.borderColor = 'rgba(74,222,128,0.4)';
          setTimeout(() => {
            btn.textContent = origText;
            btn.style.color = '';
            btn.style.borderColor = '';
            btn.disabled = false;
          }, 3000);
        } else {
          showErr(res?.error || res?.message || 'Failed to send to client.');
          btn.disabled = false;
          btn.textContent = origText;
        }
      } catch (err) {
        showErr(`Send failed: ${err.message || err}`);
        btn.disabled = false;
        btn.textContent = origText;
      }
    });
  });

  timeline.querySelectorAll('.dispute-sent-date').forEach(span => {
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      if (span.querySelector('input')) return;
      const jobId = span.dataset.jobId;
      const currentISO = span.dataset.sentIso || '';
      const originalText = span.textContent;
      const input = document.createElement('input');
      input.type = 'date';
      input.value = currentISO;
      input.style.cssText = 'font-size:12px;padding:2px 6px;border-radius:4px;border:1px solid rgba(212,168,83,0.3);background:#1a1a1e;color:#fff;cursor:pointer;';
      span.textContent = '';
      span.appendChild(input);
      input.focus();
      const finish = async () => {
        const newVal = input.value;
        if (newVal && newVal !== currentISO && currentConsumerId) {
          try {
            const res = await api(`/api/consumers/${currentConsumerId}/disputes/${encodeURIComponent(jobId)}/settings`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sentAt: newVal })
            });
            if (res?.ok) {
              await loadDisputeTracker();
              return;
            } else {
              showErr(res?.error || 'Failed to update sent date.');
            }
          } catch (err) {
            showErr(String(err));
          }
        }
        span.textContent = originalText;
      };
      input.addEventListener('change', finish);
      input.addEventListener('blur', () => {
        setTimeout(() => { if (span.contains(input)) span.textContent = originalText; }, 200);
      });
    });
  });

  timeline.querySelectorAll('.dispute-select-all').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const jobId = e.target.dataset.jobId;
      const round = currentDisputeData?.rounds?.find(r => r.jobId === jobId);
      if (!round || !round.items) return;
      round.items.forEach((_, idx) => {
        const key = getSelectionKey(jobId, idx);
        if (e.target.checked) {
          selectedItems.add(key);
        } else {
          selectedItems.delete(key);
        }
      });
      const container = e.target.closest('.glass.card') || e.target.closest('.panel');
      if (container) {
        container.querySelectorAll('.dispute-item-check').forEach(itemCb => {
          itemCb.checked = e.target.checked;
          const row = itemCb.closest('.dispute-item-row');
          if (row) row.style.background = e.target.checked ? 'rgba(212,168,83,0.1)' : 'rgba(255,255,255,0.03)';
        });
      }
      updateSelectionToolbar();
    });
  });

  timeline.querySelectorAll('.dispute-followup-days').forEach(input => {
    input.addEventListener('change', async (e) => {
      const jobId = e.target.dataset.jobId;
      const days = parseInt(e.target.value, 10);
      if (!days || days < 1 || !jobId || !currentConsumerId) return;
      try {
        const res = await api(`/api/consumers/${currentConsumerId}/disputes/${encodeURIComponent(jobId)}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ followUpDays: days })
        });
        if (res?.ok) {
          await loadDisputeTracker();
        } else {
          showErr(res?.error || 'Failed to update follow-up timing.');
        }
      } catch (err) {
        showErr(String(err));
      }
    });
  });

  timeline.querySelectorAll('.dispute-item-followup-days').forEach(input => {
    input.addEventListener('change', async (e) => {
      const jobId = e.target.dataset.jobId;
      const itemIndex = parseInt(e.target.dataset.itemIndex, 10);
      const days = parseInt(e.target.value, 10);
      if (!days || days < 1 || isNaN(itemIndex) || !jobId || !currentConsumerId) return;
      try {
        const res = await api(`/api/consumers/${currentConsumerId}/disputes/${encodeURIComponent(jobId)}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ followUpDays: days, itemIndex })
        });
        if (res?.ok) {
          await loadDisputeTracker();
        } else {
          showErr(res?.error || 'Failed to update item follow-up.');
        }
      } catch (err) {
        showErr(String(err));
      }
    });
  });

  timeline.querySelectorAll('.dispute-template-override').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const key = `${e.target.dataset.jobId}__${e.target.dataset.itemIndex}`;
      if (e.target.value) {
        disputeTemplateOverrides[key] = e.target.value;
        e.target.style.color = '#60a5fa';
      } else {
        delete disputeTemplateOverrides[key];
        e.target.style.color = '#9ca3af';
      }
    });
  });

}

$('#consumerPicker')?.addEventListener('change', (e) => {
  selectConsumer(e.target.value);
});

$('#btnRefreshDisputes')?.addEventListener('click', () => {
  loadDisputeTracker();
});

document.addEventListener('change', async (e) => {
  if (!e.target.classList.contains('dispute-item-status-select')) return;
  const sel = e.target;
  const newStatus = sel.value;
  if (!newStatus || !currentConsumerId) return;
  const jobId = sel.dataset.jobId;
  const creditor = sel.dataset.creditor;
  const bureau = sel.dataset.bureau;
  try {
    await api(`/api/consumers/${currentConsumerId}/disputes/${encodeURIComponent(jobId)}/response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ creditor, bureau, outcome: newStatus, itemIndex: parseInt(sel.dataset.itemIndex, 10), notes: `Status set to ${newStatus} by CRM user` }] })
    });
    await loadDisputeTracker();
  } catch (err) {
    showErr(String(err));
    sel.value = '';
  }
});

function getSelectedJobIds() {
  const jobs = new Set();
  selectedItems.forEach(key => { jobs.add(key.split('__')[0]); });
  return [...jobs];
}

$('#batchGenerateNext')?.addEventListener('click', async () => {
  const jobIds = getSelectedJobIds();
  if (!jobIds.length || !currentConsumerId || !currentDisputeData) return;
  if (jobIds.length > 1) { showErr('Please select items from a single round to generate next letters.'); return; }
  const jobId = jobIds[0];
  const round = currentDisputeData.rounds?.find(r => r.jobId === jobId);
  if (!round) { showErr('Could not find the dispute round.'); return; }
  if (round.status === 'resolved') { showErr('This round is already resolved.'); return; }
  const roundNum = currentDisputeData.rounds.indexOf(round) + 1;
  const btn = $('#batchGenerateNext');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Generating...';
  try {
    const recData = await api(`/api/consumers/${currentConsumerId}/disputes/${encodeURIComponent(jobId)}/recommendation`);
    if (!recData?.ok || !recData.recommendations || !recData.recommendations.length) {
      showErr(recData?.error || 'No recommendations available.');
      btn.disabled = false; btn.textContent = origText; return;
    }
    const recs = recData.recommendations.filter(r => !r.resolved);
    if (!recs.length) {
      showErr('All items are already resolved — no next round needed.');
      btn.disabled = false; btn.textContent = origText; return;
    }

    btn.textContent = 'Waiting...';
    const chosenTargets = await showNextRoundTargetModal(recs);
    if (!chosenTargets) {
      btn.disabled = false; btn.textContent = origText; return;
    }
    btn.textContent = 'Generating...';

    const bureauRecs = recs.filter((_, i) => chosenTargets[i] !== 'collector');
    const collectorRecs = recs.filter((_, i) => chosenTargets[i] === 'collector');

    const selMap = {};
    bureauRecs.forEach(r => {
      const tlIdx = r.tradelineIndex ?? null;
      if (tlIdx === null) return;
      const itemIdx = r.itemIndex ?? null;
      const overrideKey = itemIdx !== null ? `${jobId}__${itemIdx}` : null;
      const templateId = (overrideKey && disputeTemplateOverrides[overrideKey]) || r.recommendedTemplate || null;
      const groupKey = `${tlIdx}__${templateId || 'default'}`;
      if (!selMap[groupKey]) {
        selMap[groupKey] = { tradelineIndex: tlIdx, bureaus: [], templateId, specificDisputeReason: r.specificDisputeReason || null };
      }
      if (r.bureau && !selMap[groupKey].bureaus.includes(r.bureau)) selMap[groupKey].bureaus.push(r.bureau);
      if (!selMap[groupKey].specificDisputeReason && r.specificDisputeReason) selMap[groupKey].specificDisputeReason = r.specificDisputeReason;
    });
    let selections = Object.values(selMap);
    selections.forEach(sel => { if (!sel.bureaus.length) sel.bureaus = ['TransUnion', 'Experian', 'Equifax']; });
    if (!selections.length && bureauRecs.length && round.selections && round.selections.length) {
      const firstBureauRec = bureauRecs[0];
      const fallbackTemplateId = firstBureauRec?.recommendedTemplate || null;
      selections = round.selections
        .filter(s => s.tradelineIndex !== null && s.tradelineIndex !== undefined)
        .map(s => ({
          tradelineIndex: s.tradelineIndex,
          bureaus: s.bureaus && s.bureaus.length ? s.bureaus : ['TransUnion', 'Experian', 'Equifax'],
          templateId: fallbackTemplateId,
          specificDisputeReason: s.specificDisputeReason || firstBureauRec?.specificDisputeReason || null
        }));
    }

    const collectors = collectorRecs.map(r => ({
      name: r.creditor || r.collectorName || 'Unknown Collector',
      addr1: '',
      addr2: '',
      templateId: r.recommendedTemplate || 'debt-validation',
      tradelineIndex: r.tradelineIndex ?? null,
    }));

    if (!selections.length && !collectors.length) {
      showErr('Could not determine tradeline selections from recommendations. Please generate letters manually.');
      btn.disabled = false; btn.textContent = origText; return;
    }
    btn.textContent = 'Sending to server...';
    const itemsPerLetter = 1;
    const genResp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-idempotency-key': buildIdempotencyKey('dispute-next-round'), ...authHeader() },
      body: JSON.stringify({ consumerId: currentConsumerId, reportId: currentReportId, selections, personalInfo: false, collectors, itemsPerLetter })
    });
    if (!genResp.ok) { const txt = await genResp.text().catch(() => ''); throw new Error(`Generation failed: HTTP ${genResp.status} ${txt}`.trim()); }
    const genData = await genResp.json().catch(() => ({}));
    if (!genData?.ok || !genData?.jobId) throw new Error(genData?.error || 'Server did not return a job ID.');
    const letterJobId = genData.jobId;
    btn.textContent = 'Processing letters...';
    let jobDone = false;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const statusResp = await api(`/api/jobs/${encodeURIComponent(letterJobId)}`);
      const jobStatus = statusResp?.job?.status || statusResp?.status;
      if (jobStatus === 'completed' || jobStatus === 'done') { jobDone = true; break; }
      if (jobStatus === 'failed') throw new Error(statusResp?.job?.error || statusResp?.error || 'Letter generation job failed.');
    }
    if (!jobDone) throw new Error('Letter generation timed out.');
    const lettersData = await api(`/api/letters/${encodeURIComponent(letterJobId)}`);
    if (!lettersData?.letters || !lettersData.letters.length) throw new Error('No letters were generated.');
    btn.textContent = 'Sending to portal...';
    let portalSent = false;
    let portalError = '';
    try {
      const portalRes = await api(`/api/letters/${encodeURIComponent(letterJobId)}/portal`, { method: 'POST' });
      portalSent = !!(portalRes?.ok);
      if (!portalSent) portalError = portalRes?.error || portalRes?.message || 'Portal upload returned an error.';
    } catch (portalErr) { portalError = String(portalErr.message || portalErr); }
    selectedItems.clear();
    updateSelectionToolbar();
    openLetterPreviewModal(letterJobId, lettersData.letters, roundNum + 1, portalSent, portalError);
  } catch (err) {
    showErr(String(err.message || err));
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
});

$('#batchResolve')?.addEventListener('click', () => {
  if (!confirm(`Mark ${selectedItems.size} item(s) as resolved?`)) return;
  batchUpdateStatus('removed');
});

$('#batchAwaiting')?.addEventListener('click', () => {
  batchUpdateStatus('awaiting_response');
});

$('#batchDeleteRound')?.addEventListener('click', async () => {
  const jobIds = getSelectedJobIds();
  if (!jobIds.length || !currentConsumerId) return;
  if (jobIds.length > 1) { showErr('Please select items from a single round to delete.'); return; }
  const jobId = jobIds[0];
  if (!confirm('Delete this dispute round and all associated portal files? This cannot be undone.')) return;
  const btn = $('#batchDeleteRound');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Deleting...';
  try {
    const res = await api(`/api/letters/${encodeURIComponent(jobId)}?consumerId=${encodeURIComponent(currentConsumerId)}`, { method: 'DELETE' });
    if (res?.ok) {
      selectedItems.clear();
      updateSelectionToolbar();
      await loadDisputeTracker();
    } else {
      showErr(res?.error || 'Failed to delete round.');
    }
  } catch (err) {
    showErr(String(err));
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
});

$('#batchClear')?.addEventListener('click', () => {
  selectedItems.clear();
  document.querySelectorAll('.dispute-item-check').forEach(cb => { cb.checked = false; });
  document.querySelectorAll('.dispute-select-all').forEach(cb => { cb.checked = false; });
  document.querySelectorAll('.dispute-item-row').forEach(row => { row.style.background = 'rgba(255,255,255,0.03)'; });
  updateSelectionToolbar();
});

$('#batchDownloadRound')?.addEventListener('click', async () => {
  const jobIds = getSelectedJobIds();
  if (!jobIds.length || !currentConsumerId) return;
  if (jobIds.length > 1) { showErr('Select items from a single round to download.'); return; }
  const jobId = jobIds[0];
  const round = currentDisputeData?.rounds?.find(r => r.jobId === jobId);
  const letterCount = round?.letters?.length || 0;

  const btn = $('#batchDownloadRound');
  const origText = btn.textContent;
  const costLine = letterCount > 0 ? ` (${letterCount} letter${letterCount !== 1 ? 's' : ''} — ${fmtPrice(MAIL_RATES.regular.rate)}–${fmtPrice(MAIL_RATES.certifiedPod.rate)}/letter depending on mail type)` : '';
  if (!confirm(`Download all letters for this round as a ZIP?${costLine}`)) return;
  btn.disabled = true;
  btn.textContent = 'Building ZIP…';
  try {
    const res = await fetch(`/api/letters/${encodeURIComponent(jobId)}/all.zip`, {
      headers: { ...authHeader() },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `letters_round.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    showErr(`Download failed: ${err.message || err}`);
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
});

async function regenerateAndSendPortal(round, onStatus) {
  let selections = [];

  if (round.selections && round.selections.length) {
    selections = round.selections.filter(s => s.tradelineIndex !== null && s.tradelineIndex !== undefined);
  }

  if (!selections.length) {
    const selMap = {};
    for (const item of (round.items || [])) {
      const tlIdx = item.tradelineIndex;
      if (tlIdx === null || tlIdx === undefined) continue;
      const templateId = item.letterType || null;
      const key = `${tlIdx}__${templateId || 'default'}`;
      if (!selMap[key]) {
        selMap[key] = { tradelineIndex: tlIdx, bureaus: [], templateId, specificDisputeReason: item.specificDisputeReason || null };
      }
      if (item.bureau && !selMap[key].bureaus.includes(item.bureau)) selMap[key].bureaus.push(item.bureau);
      if (!selMap[key].specificDisputeReason && item.specificDisputeReason) selMap[key].specificDisputeReason = item.specificDisputeReason;
    }
    selections = Object.values(selMap);
  }

  if (!selections.length) {
    throw new Error('No selectable tradelines found in this round — please generate letters manually.');
  }

  selections.forEach(sel => { if (!sel.bureaus || !sel.bureaus.length) sel.bureaus = ['TransUnion', 'Experian', 'Equifax']; });

  const itemsPerLetter = Math.max(1, parseInt($('#itemsPerLetterInput')?.value || '10', 10) || 10);
  onStatus?.('Regenerating letters…');
  const genResp = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-idempotency-key': buildIdempotencyKey('regen-portal'), ...authHeader() },
    body: JSON.stringify({ consumerId: currentConsumerId, reportId: currentReportId, selections, personalInfo: false, collectors: [], itemsPerLetter }),
  });
  if (!genResp.ok) {
    const txt = await genResp.text().catch(() => '');
    throw new Error(`Letter regeneration failed: HTTP ${genResp.status} ${txt}`.trim());
  }
  const genData = await genResp.json().catch(() => ({}));
  if (!genData?.ok || !genData?.jobId) throw new Error(genData?.error || 'Server did not return a job ID.');
  const newJobId = genData.jobId;

  onStatus?.('Processing letters…');
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const statusResp = await api(`/api/jobs/${encodeURIComponent(newJobId)}`);
    const jobStatus = statusResp?.job?.status || statusResp?.status;
    if (jobStatus === 'completed' || jobStatus === 'done') break;
    if (jobStatus === 'failed') throw new Error(statusResp?.job?.error || statusResp?.error || 'Letter regeneration job failed.');
    if (i === 59) throw new Error('Letter generation timed out — please try again.');
  }

  onStatus?.('Sending to portal…');
  const portalRes = await api(`/api/letters/${encodeURIComponent(newJobId)}/portal`, { method: 'POST' });
  if (!portalRes?.ok) throw new Error(portalRes?.error || portalRes?.message || 'Portal upload failed after regeneration.');

  const lettersData = await api(`/api/letters/${encodeURIComponent(newJobId)}`);
  return { jobId: newJobId, letters: lettersData?.letters || [] };
}

$('#batchSendPortal')?.addEventListener('click', async () => {
  const jobIds = getSelectedJobIds();
  if (!jobIds.length || !currentConsumerId) return;
  if (jobIds.length > 1) { showErr('Select items from a single round to send to portal.'); return; }
  const jobId = jobIds[0];
  const btn = $('#batchSendPortal');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Sending…';

  const markSent = () => {
    btn.textContent = '✓ Sent to Portal';
    btn.style.color = '#4ade80';
    btn.style.borderColor = 'rgba(74,222,128,0.4)';
    setTimeout(() => {
      btn.textContent = origText;
      btn.style.color = '';
      btn.style.borderColor = '';
      btn.disabled = false;
    }, 3000);
  };

  try {
    const res = await api(`/api/letters/${encodeURIComponent(jobId)}/portal`, { method: 'POST' });
    if (res?.ok) {
      markSent();
    } else if (res?.status === 404) {
      const round = currentDisputeData?.rounds?.find(r => r.jobId === jobId);
      if (!round) {
        showErr('Letters not found on server and round data is unavailable — please generate letters again manually.');
        btn.disabled = false; btn.textContent = origText; return;
      }
      try {
        await regenerateAndSendPortal(round, msg => { btn.textContent = msg; });
        markSent();
      } catch (regenErr) {
        showErr(`Auto-regeneration failed: ${regenErr.message || regenErr}`);
        btn.disabled = false;
        btn.textContent = origText;
      }
    } else {
      showErr(res?.error || res?.message || 'Failed to send to portal.');
      btn.disabled = false;
      btn.textContent = origText;
    }
  } catch (err) {
    showErr(`Portal send failed: ${err.message || err}`);
    btn.disabled = false;
    btn.textContent = origText;
  }
});

loadConsumers();

let _ccaConsumerId = null;

function initConsumerCollectorAddrPanel() {
  const panel = document.getElementById('consumerCollectorAddrPanel');
  const ccaList = document.getElementById('ccaList');
  const ccaFName = document.getElementById('ccaFName');
  const ccaFAddr1 = document.getElementById('ccaFAddr1');
  const ccaFAddr2 = document.getElementById('ccaFAddr2');
  const ccaFCity = document.getElementById('ccaFCity');
  const ccaFState = document.getElementById('ccaFState');
  const ccaFZip = document.getElementById('ccaFZip');
  const ccaFErr = document.getElementById('ccaFErr');
  const ccaFSave = document.getElementById('ccaFSave');
  const ccaMsg = document.getElementById('ccaMsg');
  const toggleLabel = document.getElementById('ccaToggleLabel');
  const details = panel?.querySelector('details');

  if (details && toggleLabel) {
    details.addEventListener('toggle', () => {
      toggleLabel.textContent = details.open ? '▼ Collapse' : '▶ Expand';
    });
  }

  async function loadCcaList(consumerId) {
    if (!ccaList || !consumerId) return;
    try {
      const res = await api(`/api/consumers/${consumerId}/collector-addresses`);
      const addrs = res.addresses || [];
      if (!addrs.length) {
        ccaList.innerHTML = `<div style="font-size:11px;color:#666;margin-bottom:8px;">No custom addresses saved for this client. Common collectors will auto-fill from the built-in directory.</div>`;
        return;
      }
      ccaList.innerHTML = addrs.map(a => `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:6px 8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:7px;margin-bottom:5px;">
          <div>
            <div style="font-size:12px;font-weight:600;color:#e5e5e5;">${escapeHtml(a.name)}</div>
            <div style="font-size:11px;color:#888;">${escapeHtml(a.addr1)}${a.addr2 ? ', ' + escapeHtml(a.addr2) : ''} · ${escapeHtml([a.city, a.state, a.zip].filter(Boolean).join(', '))}</div>
          </div>
          <button class="cca-del" data-name="${escapeHtml(a.name)}" style="flex-shrink:0;padding:3px 8px;border-radius:5px;border:1px solid rgba(239,68,68,0.25);background:transparent;color:#f87171;font-size:11px;cursor:pointer;white-space:nowrap;">Remove</button>
        </div>`).join('');

      ccaList.querySelectorAll('.cca-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          const name = btn.dataset.name;
          if (!confirm(`Remove saved address for "${name}"?`)) return;
          try {
            await api(`/api/consumers/${consumerId}/collector-addresses/${encodeURIComponent(name)}`, { method: 'DELETE' });
            await loadCcaList(consumerId);
          } catch (err) { showErr(String(err.message || err)); }
        });
      });
    } catch (err) {
      ccaList.innerHTML = `<div style="font-size:11px;color:#f87171;">${escapeHtml(String(err.message || err))}</div>`;
    }
  }

  if (ccaFSave) {
    ccaFSave.addEventListener('click', async () => {
      if (!_ccaConsumerId) return;
      const name = (ccaFName?.value || '').trim();
      const addr1 = (ccaFAddr1?.value || '').trim();
      if (!name || !addr1) {
        if (ccaFErr) { ccaFErr.textContent = 'Name and Address Line 1 are required.'; ccaFErr.style.display = 'block'; }
        return;
      }
      if (ccaFErr) ccaFErr.style.display = 'none';
      ccaFSave.disabled = true;
      ccaFSave.textContent = 'Saving…';
      try {
        await api(`/api/consumers/${_ccaConsumerId}/collector-addresses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, addr1, addr2: (ccaFAddr2?.value || '').trim(), city: (ccaFCity?.value || '').trim(), state: (ccaFState?.value || '').trim().toUpperCase(), zip: (ccaFZip?.value || '').trim() }),
        });
        ccaFName.value = ''; ccaFAddr1.value = ''; ccaFAddr2.value = ''; ccaFCity.value = ''; ccaFState.value = ''; ccaFZip.value = '';
        await loadCcaList(_ccaConsumerId);
        if (ccaMsg) { ccaMsg.textContent = 'Saved!'; ccaMsg.style.display = 'inline'; setTimeout(() => { ccaMsg.style.display = 'none'; }, 2500); }
      } catch (err) {
        if (ccaFErr) { ccaFErr.textContent = String(err.message || err); ccaFErr.style.display = 'block'; }
      } finally {
        ccaFSave.disabled = false;
        ccaFSave.textContent = 'Save Address';
      }
    });
  }

  return { reload: (consumerId) => { _ccaConsumerId = consumerId; loadCcaList(consumerId); } };
}

const _ccaPanel = initConsumerCollectorAddrPanel();
