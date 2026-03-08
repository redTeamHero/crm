import { authHeader, api, escapeHtml } from './common.js';

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

  if (!currentConsumerId) {
    const panel = $('#disputeTrackerPanel');
    if (panel) panel.classList.add('hidden');
    currentDisputeData = null;
    return;
  }

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
    return;
  }

  try {
    const data = await api(`/api/consumers/${currentConsumerId}/disputes`);
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

function openLetterPreviewModal(letterJobId, letters, roundNum) {
  let existing = document.getElementById('letterPreviewModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'letterPreviewModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);';

  const tokenParam = authHeader()?.Authorization ? `?token=${encodeURIComponent(authHeader().Authorization.replace('Bearer ',''))}` : '';

  let cardsHtml = letters.map((l, i) => {
    const creditor = escapeHtml(l.creditor || l.creditorName || 'Letter');
    const bureau = escapeHtml(l.bureau || '');
    const idx = l.index ?? i;
    const htmlUrl = `/api/letters/${encodeURIComponent(letterJobId)}/${idx}.html${tokenParam}`;
    const pdfUrl = `/api/letters/${encodeURIComponent(letterJobId)}/${idx}.pdf${tokenParam}`;
    return `<div class="glass card" style="padding:12px;border:1px solid rgba(212,168,83,0.15);border-radius:8px;cursor:pointer;" data-html-url="${escapeHtml(htmlUrl)}">
      <div style="font-weight:600;color:#fff;font-size:13px;">${creditor}</div>
      <div style="font-size:11px;color:#888;margin-bottom:8px;">${bureau}</div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-outline text-xs lpm-view" data-url="${escapeHtml(htmlUrl)}">View</button>
        <a class="btn btn-outline text-xs" href="${escapeHtml(pdfUrl)}" target="_blank" style="text-decoration:none;">PDF</a>
      </div>
    </div>`;
  }).join('');

  modal.innerHTML = `
    <div style="background:#1a1a1e;border:1px solid rgba(212,168,83,0.2);border-radius:12px;width:90%;max-width:700px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">
      <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-weight:700;color:#fff;font-size:16px;">Generated Letters — Round ${escapeHtml(String(roundNum))}</div>
          <div style="font-size:12px;color:#888;">${letters.length} letter${letters.length !== 1 ? 's' : ''} generated</div>
        </div>
        <button id="lpmClose" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:4px 8px;">&times;</button>
      </div>
      <div style="padding:16px 20px;overflow-y:auto;flex:1;">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">${cardsHtml}</div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:8px;flex-wrap:wrap;">
        <a class="btn btn-outline text-xs" href="/api/letters/${encodeURIComponent(letterJobId)}/all.zip${tokenParam}" style="text-decoration:none;">Download All (ZIP)</a>
        <button class="btn btn-outline text-xs" id="lpmSendPortal">Send to Portal</button>
        <a class="btn btn-outline text-xs" href="/letters?job=${encodeURIComponent(letterJobId)}" target="_blank" style="text-decoration:none;">Open Full View</a>
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
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
      const res = await api(`/api/letters/${encodeURIComponent(letterJobId)}/portal`, { method: 'POST' });
      if (res?.ok) {
        btn.textContent = 'Sent to Portal';
        btn.style.color = '#4ade80';
      } else {
        btn.textContent = 'Failed';
        showErr(res?.error || 'Failed to send to portal.');
      }
    } catch (err) {
      btn.textContent = 'Failed';
      showErr(String(err));
    }
  });
}

function renderDisputeTracker(data) {
  const subtitle = $('#disputeTrackerSubtitle');
  const analysisCard = $('#disputeAnalysisCard');
  const analysisBody = $('#disputeAnalysisBody');
  const analysisTitle = $('#disputeAnalysisTitle');
  const timeline = $('#disputeTimeline');

  const activation = data.activation;
  const rounds = data.rounds || [];

  if (activation && activation.items && activation.items.length > 0) {
    analysisCard.classList.remove('hidden');
    analysisTitle.textContent = `Report Analysis — ${activation.items.length} negative item${activation.items.length !== 1 ? 's' : ''} found`;
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
        html += `<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 10px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.12);border-radius:6px;">
          <div style="flex:1;">
            <div style="font-size:12px;font-weight:600;color:#fff;">${creditor}: <span style="color:#60a5fa;">${template}</span></div>
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
        <span style="font-size:12px;color:#888;">Sent ${sentDate}</span>
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
        const currentLetterType = item.letterType || '';
        const selKey = getSelectionKey(jobId, itemIdx);
        const isChecked = selectedItems.has(selKey);

        html += `<div class="dispute-item-row" data-sel-key="${escapeHtml(selKey)}" style="padding:6px 10px;background:${isChecked ? 'rgba(212,168,83,0.1)' : 'rgba(255,255,255,0.03)'};border-radius:6px;border:1px solid ${isChecked ? 'rgba(212,168,83,0.3)' : 'rgba(255,255,255,0.06)'};cursor:pointer;transition:background .15s,border-color .15s;">
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" class="dispute-item-check" data-job-id="${escapeHtml(jobId)}" data-item-index="${itemIdx}" ${isChecked ? 'checked' : ''} style="accent-color:#d4a853;width:15px;height:15px;cursor:pointer;flex-shrink:0;" />
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;color:#fff;font-size:12px;">${creditor}</div>
              <div style="font-size:11px;color:#888;">${bureau}${currentLetterType ? ' • <span style="color:#60a5fa;">' + escapeHtml(currentLetterType) + '</span>' : ''}${notes ? ' • ' + notes : ''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
              <input type="number" class="dispute-item-followup-days" data-job-id="${escapeHtml(jobId)}" data-item-index="${itemIdx}" value="${iDays}" min="1" max="180" style="width:44px;padding:1px 4px;border-radius:4px;border:1px solid rgba(212,168,83,0.2);background:#1a1a1e;color:#fff;font-size:10px;text-align:center;" title="Follow-up days for this item" />
              <span style="font-size:10px;color:#666;">${iDate ? iDate : 'd'}</span>
            </div>
            ${disputeStatusBadge(status)}
          </div>`;

        if (round.status !== 'resolved') {
          const tplOptions = (DISPUTE_LETTER_TEMPLATES || []).map(t => {
            const tid = escapeHtml(t.id || '');
            const tname = escapeHtml(t.name || t.id || '');
            const selected = currentOverride === t.id ? ' selected' : '';
            return `<option value="${tid}"${selected}>${tname}</option>`;
          }).join('');
          html += `<div style="margin-top:4px;">
            <select class="dispute-template-override" data-job-id="${escapeHtml(jobId)}" data-item-index="${itemIdx}" style="width:100%;padding:2px 6px;border-radius:4px;border:1px solid rgba(96,165,250,0.2);background:#1a1a1e;color:#9ca3af;font-size:10px;">
              <option value="">Auto (use recommendation)</option>
              ${tplOptions}
            </select>
          </div>`;
        }

        if (item.evidence && item.evidence.length > 0) {
          html += `<div style="padding-left:18px;margin-top:4px;">`;
          item.evidence.forEach(ev => {
            const name = escapeHtml(ev.name || ev.originalName || 'Evidence');
            const url = ev.url ? escapeHtml(ev.url) : '#';
            html += `<div style="font-size:11px;color:#60a5fa;"><a href="${url}" target="_blank" style="color:#60a5fa;text-decoration:underline;">📎 ${name}</a></div>`;
          });
          html += `</div>`;
        }

        if (item.recommendation) {
          const rec = item.recommendation;
          const tpl = escapeHtml(rec.recommendedTemplate || 'None');
          const reason = escapeHtml(rec.reason || '');
          const altTemplates = (rec.alternativeTemplates || []).map(t => escapeHtml(t)).join(', ');
          html += `<div style="margin-top:4px;padding:4px 8px;background:rgba(96,165,250,0.06);border-radius:4px;border:1px solid rgba(96,165,250,0.1);">
            <div style="font-size:11px;color:#60a5fa;font-weight:600;">Recommended: ${tpl}</div>
            <div style="font-size:10px;color:#888;">${reason}</div>
            ${altTemplates ? `<div style="font-size:10px;color:#666;">Alternatives: ${altTemplates}</div>` : ''}
          </div>`;
        }

        html += `</div>`;
      });
      html += `</div>`;
    }

    if (round.letters && round.letters.length > 0) {
      html += `<div style="font-size:11px;color:#888;margin-bottom:4px;">Letters sent: ${round.letters.length}</div>`;
    }

    html += `<div style="display:flex;gap:6px;margin-top:8px;">`;
    if (round.status !== 'resolved') {
      html += `<button class="btn btn-outline text-xs dispute-generate-next" data-job-id="${escapeHtml(jobId)}" data-round="${roundNum}">Generate Next Round</button>`;
      html += `<button class="btn btn-outline text-xs dispute-mark-resolved" data-job-id="${escapeHtml(jobId)}">Mark Resolved</button>`;
    }
    html += `<button class="btn btn-outline text-xs dispute-delete-round" data-job-id="${escapeHtml(jobId)}" style="color:#ef4444;border-color:rgba(239,68,68,0.3);">Delete Round</button>`;
    html += `</div>`;

    html += `</div>`;
    html += `</div>`;
  });

  timeline.innerHTML = html;

  timeline.querySelectorAll('.dispute-round-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('input, select, button')) return;
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
      if (e.target.closest('input, select, button, a')) return;
      const cb = row.querySelector('.dispute-item-check');
      if (cb) {
        cb.checked = !cb.checked;
        toggleItemSelection(cb.dataset.jobId, parseInt(cb.dataset.itemIndex, 10), cb);
      }
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

  timeline.querySelectorAll('.dispute-generate-next').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const jobId = e.target.dataset.jobId;
      const roundNum = parseInt(e.target.dataset.round, 10) || 1;
      if (!jobId || !currentConsumerId) return;
      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Generating...';
      try {
        const recData = await api(`/api/consumers/${currentConsumerId}/disputes/${encodeURIComponent(jobId)}/recommendation`);
        if (!recData?.ok || !recData.recommendations || !recData.recommendations.length) {
          showErr(recData?.error || 'No recommendations available.');
          btn.disabled = false;
          btn.textContent = origText;
          return;
        }
        const recs = recData.recommendations.filter(r => !r.resolved);
        if (!recs.length) {
          showErr('All items are already resolved — no next round needed.');
          btn.disabled = false;
          btn.textContent = origText;
          return;
        }
        const selMap = {};
        recs.forEach(r => {
          const tlIdx = r.tradelineIndex ?? null;
          if (tlIdx === null) return;
          const itemIdx = r.itemIndex ?? null;
          const overrideKey = itemIdx !== null ? `${jobId}__${itemIdx}` : null;
          const templateId = (overrideKey && disputeTemplateOverrides[overrideKey]) || r.recommendedTemplate || null;
          const groupKey = `${tlIdx}__${templateId || 'default'}`;
          if (!selMap[groupKey]) {
            selMap[groupKey] = { tradelineIndex: tlIdx, bureaus: [], templateId };
          }
          if (r.bureau && !selMap[groupKey].bureaus.includes(r.bureau)) {
            selMap[groupKey].bureaus.push(r.bureau);
          }
        });
        const selections = Object.values(selMap);
        selections.forEach(sel => {
          if (!sel.bureaus.length) sel.bureaus = ['TransUnion', 'Experian', 'Equifax'];
        });
        if (!selections.length) {
          showErr('Could not determine tradeline selections from recommendations. Please generate letters manually.');
          btn.disabled = false;
          btn.textContent = origText;
          return;
        }
        btn.textContent = 'Sending to server...';
        const genResp = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-idempotency-key': buildIdempotencyKey('dispute-next-round'), ...authHeader() },
          body: JSON.stringify({
            consumerId: currentConsumerId,
            reportId: currentReportId,
            selections,
            personalInfo: false,
            collectors: [],
          })
        });
        if (!genResp.ok) {
          const txt = await genResp.text().catch(() => '');
          throw new Error(`Generation failed: HTTP ${genResp.status} ${txt}`.trim());
        }
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
        openLetterPreviewModal(letterJobId, lettersData.letters, roundNum + 1);
      } catch (err) {
        showErr(String(err.message || err));
      } finally {
        btn.disabled = false;
        btn.textContent = origText;
      }
    });
  });

  timeline.querySelectorAll('.dispute-mark-resolved').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const jobId = e.target.dataset.jobId;
      if (!jobId || !currentConsumerId) return;
      if (!confirm('Mark this dispute round as resolved?')) return;
      try {
        const round = currentDisputeData?.rounds?.find(r => r.jobId === jobId);
        if (round && round.items) {
          const items = round.items.map(item => ({
            creditor: item.creditor,
            bureau: item.bureau,
            outcome: 'removed',
            notes: 'Marked resolved by CRM user'
          }));
          const res = await api(`/api/consumers/${currentConsumerId}/disputes/${encodeURIComponent(jobId)}/response`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items })
          });
          if (res?.ok) {
            await loadDisputeTracker();
          } else {
            showErr(res?.error || 'Failed to mark resolved.');
          }
        }
      } catch (err) {
        showErr(String(err));
      }
    });
  });

  timeline.querySelectorAll('.dispute-delete-round').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const jobId = e.target.dataset.jobId;
      if (!jobId || !currentConsumerId) return;
      if (!confirm('Delete this dispute round and all associated portal files? This cannot be undone.')) return;
      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Deleting…';
      try {
        const res = await api(`/api/letters/${encodeURIComponent(jobId)}?consumerId=${encodeURIComponent(currentConsumerId)}`, { method: 'DELETE' });
        if (res?.ok) {
          await loadDisputeTracker();
        } else {
          showErr(res?.error || 'Failed to delete round.');
          btn.disabled = false;
          btn.textContent = origText;
        }
      } catch (err) {
        showErr(String(err));
        btn.disabled = false;
        btn.textContent = origText;
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

$('#batchResolve')?.addEventListener('click', () => {
  if (!confirm(`Mark ${selectedItems.size} item(s) as resolved?`)) return;
  batchUpdateStatus('removed');
});

$('#batchAwaiting')?.addEventListener('click', () => {
  batchUpdateStatus('awaiting_response');
});

$('#batchClear')?.addEventListener('click', () => {
  selectedItems.clear();
  document.querySelectorAll('.dispute-item-check').forEach(cb => { cb.checked = false; });
  document.querySelectorAll('.dispute-select-all').forEach(cb => { cb.checked = false; });
  document.querySelectorAll('.dispute-item-row').forEach(row => { row.style.background = 'rgba(255,255,255,0.03)'; });
  updateSelectionToolbar();
});

loadConsumers();
