import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, authHeader } from '../common.ts';
import {
  useConsumers, useReports, useDisputeData, useLetterHistory, useLetterTemplates,
  useCollectorAddressLibrary, useUpdateItemStatus, useUpdateRoundSettings,
  useSendToPortal, useDeleteRound,
} from './hooks.ts';
import { buildIdempotencyKey } from './utils.ts';
import { DisputeRound } from './DisputeRound.tsx';
import { NextRoundTargetModal } from './NextRoundTargetModal.tsx';
import { LetterPreviewModal } from './LetterPreviewModal.tsx';
import { AddrPreflightModal } from './AddrPreflightModal.tsx';
import { CollectorAddrPanel } from './CollectorAddrPanel.tsx';
import { LetterHistory } from './LetterHistory.tsx';
import type {
  DisputeRec, CollectorEntry, SelMapEntry,
  LetterPreviewState, NextRoundModalState, AddrPreflightModalState,
  RecommendationApiResponse, PreflightApiResponse, JobStatusApiResponse, LettersApiResponse, PortalApiResponse,
} from './types.ts';

export function DisputesPage() {
  const qc = useQueryClient();

  // --- Page-level state ---
  const [consumerId, setConsumerId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('client') || null;
  });
  const [reportId, setReportId] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [collapsedRounds, setCollapsedRounds] = useState<Set<string>>(new Set());
  const [templateOverrides, setTemplateOverrides] = useState<Record<string, string>>({});
  const [itemsPerLetter, setItemsPerLetter] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [genStatus, setGenStatus] = useState<string | null>(null);

  // Modal state
  const [letterPreview, setLetterPreview] = useState<LetterPreviewState | null>(null);
  const [nextRoundModal, setNextRoundModal] = useState<NextRoundModalState | null>(null);
  const [addrPreflightModal, setAddrPreflightModal] = useState<AddrPreflightModalState | null>(null);

  // --- Queries ---
  const consumersQ = useConsumers();
  const reportsQ = useReports(consumerId);
  const disputeQ = useDisputeData(consumerId);
  const historyQ = useLetterHistory(consumerId);
  const templatesQ = useLetterTemplates();
  const addrLibQ = useCollectorAddressLibrary();

  // --- Mutations ---
  const updateStatusM = useUpdateItemStatus(consumerId);
  const updateSettingsM = useUpdateRoundSettings(consumerId);
  const sendPortalM = useSendToPortal();
  const deleteRoundM = useDeleteRound(consumerId);

  // Derived: report ID
  useEffect(() => {
    if (reportsQ.data?.reports?.[0]) {
      setReportId(reportsQ.data.reports[0].id ?? null);
    }
  }, [reportsQ.data]);

  // Derived: sent templates set (creditor__bureau combos)
  const sentTemplates = useMemo(() => {
    const set = new Set<string>();
    const letters = historyQ.data?.letters || [];
    for (const l of letters) {
      if (l.creditor && l.bureau) set.add(`${l.creditor}__${l.bureau}`);
    }
    return set;
  }, [historyQ.data]);

  // Derived: letter templates list
  const templates = useMemo(() => {
    const raw = templatesQ.data?.templates || [];
    return raw.map((t: any) => ({ id: t.id || t.name || '', name: t.name || t.id || '' }));
  }, [templatesQ.data]);

  // Derived: dispute rounds
  const rounds = disputeQ.data?.rounds || [];

  // --- Helpers ---
  function showErr(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 6000);
  }

  function clearSelection() {
    setSelectedItems(new Set());
  }

  function getSelectedJobIds(): string[] {
    const jobs = new Set<string>();
    selectedItems.forEach(key => jobs.add(key.split('__')[0]));
    return [...jobs];
  }

  // --- Event handlers ---
  function handleToggleSelect(key: string, checked: boolean) {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  }

  function handleSelectAll(jobId: string, checked: boolean, itemCount: number) {
    setSelectedItems(prev => {
      const next = new Set(prev);
      for (let i = 0; i < itemCount; i++) {
        const key = `${jobId}__${i}`;
        if (checked) next.add(key); else next.delete(key);
      }
      return next;
    });
  }

  function handleToggleCollapse(jobId: string) {
    setCollapsedRounds(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      return next;
    });
  }

  async function handleStatusChange(jobId: string, itemIdx: number, item: any, newStatus: string) {
    try {
      await updateStatusM.mutateAsync({
        jobId,
        items: [{ creditor: item.creditor, bureau: item.bureau, outcome: newStatus, itemIndex: itemIdx, notes: `Status set to ${newStatus} by CRM user` }],
      });
    } catch (e: any) {
      showErr(String(e.message || e));
    }
  }

  function handleTemplateChange(key: string, templateId: string) {
    setTemplateOverrides(prev => ({ ...prev, [key]: templateId }));
  }

  async function handleUpdateSentDate(jobId: string, val: string) {
    try {
      await updateSettingsM.mutateAsync({ jobId, settings: { sentAt: val } });
    } catch (e: any) {
      showErr(String(e.message || e));
    }
  }

  async function handleUpdateFollowupDays(jobId: string, val: number) {
    try {
      await updateSettingsM.mutateAsync({ jobId, settings: { followUpDays: val } });
    } catch (e: any) {
      showErr(String(e.message || e));
    }
  }

  async function batchUpdateStatus(newStatus: string) {
    if (!selectedItems.size || !consumerId || !rounds.length) return;
    const byJob: Record<string, number[]> = {};
    selectedItems.forEach(key => {
      const [jobId, idxStr] = key.split('__');
      if (!byJob[jobId]) byJob[jobId] = [];
      byJob[jobId].push(parseInt(idxStr, 10));
    });
    for (const [jobId, indices] of Object.entries(byJob)) {
      const round = rounds.find(r => r.jobId === jobId);
      if (!round?.items) continue;
      const items = indices.map(idx => {
        const item = round.items![idx];
        if (!item) return null;
        return { creditor: item.creditor, bureau: item.bureau, outcome: newStatus, itemIndex: idx, notes: `Batch ${newStatus} by CRM user` };
      }).filter(Boolean) as any[];
      if (!items.length) continue;
      try {
        await updateStatusM.mutateAsync({ jobId, items });
      } catch (e: any) {
        showErr(String(e.message || e));
      }
    }
    clearSelection();
  }

  // --- Complex generate-next-round flow ---
  const [genBusy, setGenBusy] = useState(false);

  const handleGenerateNextRound = useCallback(async () => {
    const jobIds = getSelectedJobIds();
    if (!jobIds.length || !consumerId || !rounds.length) return;
    if (jobIds.length > 1) { showErr('Please select items from a single round to generate next letters.'); return; }
    const jobId = jobIds[0];
    const round = rounds.find(r => r.jobId === jobId);
    if (!round) { showErr('Could not find the dispute round.'); return; }
    if (round.status === 'resolved') { showErr('This round is already resolved.'); return; }
    const roundNum = rounds.indexOf(round) + 1;

    setGenBusy(true);
    setGenStatus('Loading recommendations…');
    try {
      const recData = await api<RecommendationApiResponse>(`/api/consumers/${consumerId}/disputes/${encodeURIComponent(jobId)}/recommendation`);
      if (!recData?.ok || !recData.recommendations?.length) {
        showErr(recData.error || 'No recommendations available.'); return;
      }
      const recs: DisputeRec[] = (recData.recommendations as DisputeRec[]).filter(r => !r.resolved);
      if (!recs.length) { showErr('All items are already resolved — no next round needed.'); return; }

      setGenStatus('Choosing targets…');
      const chosenTargets = await new Promise<string[] | null>(resolve => {
        setNextRoundModal({ recs, resolve });
      });
      setNextRoundModal(null);
      if (!chosenTargets) return;

      const bureauRecs = recs.filter((_, i) => chosenTargets[i] !== 'collector');
      const collectorRecs = recs.filter((_, i) => chosenTargets[i] === 'collector');

      const selMap: Record<string, SelMapEntry> = {};
      bureauRecs.forEach(r => {
        const tlIdx = r.tradelineIndex;
        if (tlIdx == null) return;
        const itemIdx = r.itemIndex;
        const overrideKey = itemIdx != null ? `${jobId}__${itemIdx}` : null;
        const templateId = (overrideKey && templateOverrides[overrideKey]) || r.recommendedTemplate || null;
        const groupKey = `${tlIdx}__${templateId || 'default'}`;
        if (!selMap[groupKey]) selMap[groupKey] = { tradelineIndex: tlIdx, bureaus: [], templateId, specificDisputeReason: r.specificDisputeReason || null };
        if (r.bureau && !selMap[groupKey].bureaus.includes(r.bureau)) selMap[groupKey].bureaus.push(r.bureau);
        if (!selMap[groupKey].specificDisputeReason && r.specificDisputeReason) selMap[groupKey].specificDisputeReason = r.specificDisputeReason;
      });
      let selections = Object.values(selMap);
      selections.forEach(sel => { if (!sel.bureaus.length) sel.bureaus = ['TransUnion', 'Experian', 'Equifax']; });
      if (!selections.length && bureauRecs.length && round.selections?.length) {
        const fbTpl = bureauRecs[0]?.recommendedTemplate || null;
        selections = (round.selections || [])
          .filter(s => s.tradelineIndex != null)
          .map(s => ({ tradelineIndex: s.tradelineIndex, bureaus: s.bureaus?.length ? s.bureaus : ['TransUnion', 'Experian', 'Equifax'], templateId: fbTpl, specificDisputeReason: s.specificDisputeReason || bureauRecs[0]?.specificDisputeReason || null }));
      }

      const _seenCollectors = new Set<string>();
      let collectors: CollectorEntry[] = collectorRecs
        .filter(r => {
          const key = (r.creditor || r.collectorName || '').toLowerCase().trim();
          if (_seenCollectors.has(key)) return false;
          _seenCollectors.add(key); return true;
        })
        .map(r => ({ name: r.creditor || r.collectorName || 'Unknown Collector', addr1: '', addr2: '', templateId: r.recommendedTemplate || 'debt-validation', tradelineIndex: r.tradelineIndex ?? null }));

      if (!selections.length && !collectors.length) {
        showErr('Could not determine tradeline selections from recommendations. Please generate letters manually.'); return;
      }

      if (collectors.length) {
        setGenStatus('Checking addresses…');
        const preflightRes = await api<PreflightApiResponse>('/api/generate/preflight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consumerId, collectors }),
        });
        if (!preflightRes.ok) {
          showErr((preflightRes as any).error || 'Address preflight check failed.'); return;
        }
        if (preflightRes.flagged?.length) {
          const resolvedCollectors = await new Promise<CollectorEntry[] | null>(resolve => {
            setAddrPreflightModal({ flagged: preflightRes.flagged as CollectorEntry[], enrichedAll: preflightRes.enriched || [], consumerId, resolve });
          });
          setAddrPreflightModal(null);
          if (!resolvedCollectors) return;
          collectors = resolvedCollectors;
        } else {
          collectors = (Array.isArray(preflightRes.enriched) && preflightRes.enriched.length) ? preflightRes.enriched : collectors;
        }
      }

      setGenStatus('Sending to server…');
      const genResp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': buildIdempotencyKey('dispute-next-round'), ...authHeader() },
        body: JSON.stringify({ consumerId, reportId, selections, personalInfo: false, collectors, itemsPerLetter }),
      });
      if (!genResp.ok) { const txt = await genResp.text().catch(() => ''); throw new Error(`Generation failed: HTTP ${genResp.status} ${txt}`.trim()); }
      const genData = await genResp.json().catch(() => ({}));
      if (!genData?.ok || !genData?.jobId) throw new Error(genData?.error || 'Server did not return a job ID.');
      const letterJobId = genData.jobId;

      setGenStatus('Processing letters…');
      let jobDone = false;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 1500));
        const statusResp = await api<JobStatusApiResponse>(`/api/jobs/${encodeURIComponent(letterJobId)}`);
        const jobStatus = statusResp.job?.status || statusResp.status;
        if (jobStatus === 'completed' || jobStatus === 'done') { jobDone = true; break; }
        if (jobStatus === 'failed') throw new Error(statusResp.job?.error || statusResp.error || 'Letter generation job failed.');
      }
      if (!jobDone) throw new Error('Letter generation timed out.');

      const lettersData = await api<LettersApiResponse>(`/api/letters/${encodeURIComponent(letterJobId)}`);
      if (!lettersData.letters?.length) throw new Error('No letters were generated.');

      setGenStatus('Sending to portal…');
      let portalSent = false;
      let portalError = '';
      try {
        const portalRes = await api<PortalApiResponse>(`/api/letters/${encodeURIComponent(letterJobId)}/portal`, { method: 'POST' });
        portalSent = !!(portalRes?.ok);
        if (!portalSent) portalError = (portalRes as any).error || portalRes.message || 'Portal upload returned an error.';
      } catch (e: any) { portalError = String(e.message || e); }

      clearSelection();
      qc.invalidateQueries({ queryKey: ['disputes', consumerId] });
      setLetterPreview({ jobId: letterJobId, letters: lettersData.letters!, roundNum: roundNum + 1, portalSent, portalError });
    } catch (e: any) {
      showErr(String(e.message || e));
    } finally {
      setGenBusy(false);
      setGenStatus(null);
    }
  }, [consumerId, reportId, rounds, selectedItems, templateOverrides, itemsPerLetter]);

  // --- Batch send portal ---
  async function handleBatchSendPortal() {
    const jobIds = getSelectedJobIds();
    if (!jobIds.length || !consumerId) return;
    if (jobIds.length > 1) { showErr('Select items from a single round to send to portal.'); return; }
    const jobId = jobIds[0];
    try {
      const res = await sendPortalM.mutateAsync(jobId);
      if ((res as any)?.ok) {
        // Success feedback handled by marking button state
      } else if ((res as any)?.status === 404) {
        const round = rounds.find(r => r.jobId === jobId);
        if (!round) { showErr('Letters not found on server — please generate letters again manually.'); return; }
        await handleRegenerateAndSendPortal(round);
      } else {
        showErr((res as any)?.error || (res as any)?.message || 'Failed to send to portal.');
      }
    } catch (e: any) {
      showErr(`Portal send failed: ${e.message || e}`);
    }
  }

  async function handleRegenerateAndSendPortal(round: any) {
    setGenStatus('Regenerating letters…');
    setGenBusy(true);
    try {
      let selections: any[] = [];
      if (round.selections?.length) {
        selections = round.selections.filter((s: any) => s.tradelineIndex != null);
      }
      if (!selections.length) {
        const selMap: Record<string, any> = {};
        for (const item of (round.items || [])) {
          const tlIdx = item.tradelineIndex;
          if (tlIdx == null) continue;
          const templateId = item.letterType || null;
          const key = `${tlIdx}__${templateId || 'default'}`;
          if (!selMap[key]) selMap[key] = { tradelineIndex: tlIdx, bureaus: [], templateId, specificDisputeReason: item.specificDisputeReason || null };
          if (item.bureau && !selMap[key].bureaus.includes(item.bureau)) selMap[key].bureaus.push(item.bureau);
        }
        selections = Object.values(selMap);
      }
      if (!selections.length) throw new Error('No selectable tradelines found in this round.');
      selections.forEach((sel: any) => { if (!sel.bureaus?.length) sel.bureaus = ['TransUnion', 'Experian', 'Equifax']; });

      const genResp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': buildIdempotencyKey('regen-portal'), ...authHeader() },
        body: JSON.stringify({ consumerId, reportId, selections, personalInfo: false, collectors: [], itemsPerLetter }),
      });
      if (!genResp.ok) throw new Error(`HTTP ${genResp.status}`);
      const genData = await genResp.json().catch(() => ({}));
      if (!genData?.ok || !genData?.jobId) throw new Error(genData?.error || 'No job ID returned.');
      const newJobId = genData.jobId;

      setGenStatus('Processing…');
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 1500));
        const statusResp = await api<JobStatusApiResponse>(`/api/jobs/${encodeURIComponent(newJobId)}`);
        const st = statusResp.job?.status || statusResp.status;
        if (st === 'completed' || st === 'done') break;
        if (st === 'failed') throw new Error(statusResp.job?.error || statusResp.error || 'Failed.');
        if (i === 59) throw new Error('Timed out.');
      }

      setGenStatus('Sending to portal…');
      const portalRes = await api<PortalApiResponse>(`/api/letters/${encodeURIComponent(newJobId)}/portal`, { method: 'POST' });
      if (!portalRes?.ok) throw new Error((portalRes as any).error || 'Portal upload failed.');
      qc.invalidateQueries({ queryKey: ['disputes', consumerId] });
    } catch (e: any) {
      showErr(`Regeneration failed: ${e.message || e}`);
    } finally {
      setGenBusy(false);
      setGenStatus(null);
    }
  }

  async function handleBatchDeleteRound() {
    const jobIds = getSelectedJobIds();
    if (!jobIds.length || !consumerId) return;
    if (jobIds.length > 1) { showErr('Please select items from a single round to delete.'); return; }
    if (!confirm('Delete this dispute round and all associated portal files? This cannot be undone.')) return;
    try {
      await deleteRoundM.mutateAsync(jobIds[0]);
      clearSelection();
    } catch (e: any) {
      showErr(String(e.message || e));
    }
  }

  async function handleBatchDownloadRound() {
    const jobIds = getSelectedJobIds();
    if (!jobIds.length || !consumerId) return;
    if (jobIds.length > 1) { showErr('Select items from a single round to download.'); return; }
    const jobId = jobIds[0];
    const round = rounds.find(r => r.jobId === jobId);
    const letterCount = round?.letters?.length || 0;
    const costLine = letterCount > 0 ? ` (${letterCount} letter${letterCount !== 1 ? 's' : ''})` : '';
    if (!confirm(`Download all letters for this round as a ZIP?${costLine}`)) return;
    try {
      const res = await fetch(`/api/letters/${encodeURIComponent(jobId)}/all.zip`, { headers: { ...authHeader() } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'letters_round.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      showErr(`Download failed: ${e.message || e}`);
    }
  }

  async function handleSaveCollectorAddress(data: { name: string; addr1: string; addr2?: string; city?: string; state?: string; zip?: string }) {
    if (!consumerId) return;
    await api(`/api/consumers/${consumerId}/collector-addresses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    qc.invalidateQueries({ queryKey: ['consumer-collector-addresses', consumerId] });
  }

  async function handlePortalSend(jobId: string): Promise<boolean> {
    try {
      const res = await api<PortalApiResponse>(`/api/letters/${encodeURIComponent(jobId)}/portal`, { method: 'POST' });
      return !!(res as any)?.ok;
    } catch { return false; }
  }

  // Derive activation info
  const activation = disputeQ.data?.activation;
  const consumerState = disputeQ.data?.consumerState;

  const consumers = consumersQ.data?.consumers || [];
  const selectedConsumer = consumers.find(c => c.id === consumerId);

  const selectionCount = selectedItems.size;
  const hasSelection = selectionCount > 0;

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Error toast */}
      {error && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 20000, maxWidth: 420, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: 13, fontWeight: 500 }}>
          {error}
        </div>
      )}

      <div className="container" style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 48px' }}>
        {/* Header */}
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="section-title" style={{ margin: 0, marginBottom: 4 }}>Dispute Tracker</h1>
            <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Track, manage, and generate dispute letters for each client.</p>
          </div>
          <button className="btn btn-outline text-sm" onClick={() => { qc.invalidateQueries({ queryKey: ['disputes', consumerId] }); qc.invalidateQueries({ queryKey: ['letter-history', consumerId] }); }}>
            ↻ Refresh
          </button>
        </div>

        {/* Consumer picker */}
        <div className="glass panel" style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '.04em' }}>Select Client</label>
          {consumersQ.isLoading ? <div style={{ color: '#666', fontSize: 13 }}>Loading clients…</div> :
          consumersQ.isError ? <div style={{ color: '#f87171', fontSize: 13 }}>Failed to load clients.</div> :
          (
            <select value={consumerId || ''} onChange={e => { setConsumerId(e.target.value || null); clearSelection(); }}
              className="input" style={{ width: '100%', maxWidth: 400 }}>
              <option value="">— Select a client —</option>
              {consumers.map(c => (
                <option key={c.id as string} value={c.id as string}>
                  {String(c.name || c.email || c.id)}
                </option>
              ))}
            </select>
          )}
          {consumerId && selectedConsumer && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
              {selectedConsumer.email ? <span>Email: {String(selectedConsumer.email)} · </span> : null}
              <a href={`?client=${encodeURIComponent(consumerId)}`} style={{ color: '#60a5fa', textDecoration: 'none', fontSize: 11 }}>Shareable link</a>
            </div>
          )}
        </div>

        {consumerId && (
          <>
            {/* Items per letter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: '#9ca3af' }}>Items per letter:</label>
              <input type="number" min={1} max={100} value={itemsPerLetter} onChange={e => setItemsPerLetter(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{ width: 64, background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 8px', color: '#e5e5e5', fontSize: 12 }} />
            </div>

            {/* Dispute tracker panel */}
            {disputeQ.isLoading ? (
              <div className="glass panel" style={{ textAlign: 'center', color: '#888', padding: 32 }}>Loading dispute tracker…</div>
            ) : disputeQ.isError ? (
              <div className="glass panel" style={{ textAlign: 'center', color: '#f87171', padding: 32 }}>Failed to load dispute data.</div>
            ) : (
              <div id="disputeTrackerPanel">
                {/* Activation section */}
                {activation?.items?.length ? (
                  <div className="glass panel" style={{ marginBottom: 16, border: '1px solid rgba(212,168,83,0.2)' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#d4a853', marginBottom: 8 }}>🎯 Dispute Candidates</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {activation.items.map((item, i) => (
                        <div key={i} style={{ fontSize: 12, padding: '4px 10px', background: 'rgba(212,168,83,0.08)', border: '1px solid rgba(212,168,83,0.2)', borderRadius: 6, color: '#e5e5e5' }}>
                          {item.creditor}
                          {item.bureaus?.length ? <span style={{ color: '#9ca3af', fontSize: 10, marginLeft: 4 }}>{item.bureaus.join(', ')}</span> : null}
                          {item.violationCount ? <span style={{ color: '#f87171', fontSize: 10, marginLeft: 4 }}>{item.violationCount} violation{item.violationCount !== 1 ? 's' : ''}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* No rounds */}
                {!rounds.length ? (
                  <div className="glass panel" style={{ textAlign: 'center', padding: 32 }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                    <div style={{ color: '#aaa', fontSize: 14, marginBottom: 4 }}>No dispute rounds yet for this client.</div>
                    <div style={{ color: '#666', fontSize: 12 }}>Generate dispute letters from the Generate Letters page to begin tracking.</div>
                  </div>
                ) : (
                  <div>
                    {rounds.map((round, ri) => (
                      <DisputeRound
                        key={round.jobId}
                        round={round}
                        roundIndex={ri}
                        consumerId={consumerId}
                        templates={templates}
                        selectedItems={selectedItems}
                        templateOverrides={templateOverrides}
                        isCollapsed={collapsedRounds.has(round.jobId)}
                        sentTemplates={sentTemplates}
                        onToggleSelect={handleToggleSelect}
                        onSelectAll={handleSelectAll}
                        onToggleCollapse={handleToggleCollapse}
                        onStatusChange={handleStatusChange}
                        onTemplateChange={handleTemplateChange}
                        onUpdateSentDate={handleUpdateSentDate}
                        onUpdateFollowupDays={handleUpdateFollowupDays}
                        onRefresh={() => qc.invalidateQueries({ queryKey: ['disputes', consumerId] })}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Selection toolbar */}
            {hasSelection && (
              <div style={{ position: 'sticky', bottom: 12, zIndex: 100, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'rgba(18,18,22,0.95)', backdropFilter: 'blur(12px)', border: '1px solid rgba(212,168,83,0.3)', borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', marginTop: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#d4a853' }}>{selectionCount} selected</span>
                <button className="btn btn-outline text-xs" onClick={handleGenerateNextRound} disabled={genBusy}
                  style={{ borderColor: 'rgba(212,168,83,0.4)', color: '#d4a853', background: genBusy ? 'rgba(212,168,83,0.1)' : undefined }}>
                  {genBusy ? (genStatus || 'Working…') : '⚡ Generate Next Letters'}
                </button>
                <button className="btn btn-outline text-xs" onClick={handleBatchSendPortal} disabled={genBusy}
                  style={{ borderColor: 'rgba(96,165,250,0.4)', color: '#60a5fa' }}>
                  {sendPortalM.isPending ? 'Sending…' : '↑ Send to Portal'}
                </button>
                <button className="btn btn-outline text-xs" onClick={handleBatchDownloadRound}
                  style={{ borderColor: 'rgba(74,222,128,0.35)', color: '#4ade80' }}>
                  ⬇ Download Round
                </button>
                <button className="btn btn-outline text-xs" onClick={() => { if (confirm(`Mark ${selectionCount} item(s) as resolved?`)) batchUpdateStatus('removed'); }}
                  style={{ borderColor: 'rgba(74,222,128,0.35)', color: '#4ade80' }}>
                  ✓ Resolve Selected
                </button>
                <button className="btn btn-outline text-xs" onClick={() => batchUpdateStatus('awaiting_response')}
                  style={{ borderColor: 'rgba(212,168,83,0.35)', color: '#d4a853' }}>
                  ⏳ Mark Awaiting
                </button>
                <button className="btn btn-outline text-xs" onClick={handleBatchDeleteRound}
                  style={{ borderColor: 'rgba(239,68,68,0.35)', color: '#f87171' }}>
                  🗑 Delete Round
                </button>
                <button className="btn btn-outline text-xs" onClick={clearSelection} style={{ color: '#666' }}>
                  ✕ Clear
                </button>
              </div>
            )}

            {/* Letter History */}
            <div className="glass panel" style={{ marginTop: 20 }}>
              <div style={{ fontWeight: 700, color: '#e5e5e5', fontSize: 14, marginBottom: 12 }}>Letter History</div>
              <LetterHistory consumerId={consumerId} />
            </div>

            {/* Collector Address Panel */}
            <div style={{ marginTop: 14 }}>
              <CollectorAddrPanel consumerId={consumerId} />
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {nextRoundModal && (
        <NextRoundTargetModal
          recs={nextRoundModal.recs}
          onConfirm={targets => nextRoundModal.resolve(targets)}
          onCancel={() => nextRoundModal.resolve(null)}
        />
      )}

      {addrPreflightModal && (
        <AddrPreflightModal
          flagged={addrPreflightModal.flagged}
          enrichedAll={addrPreflightModal.enrichedAll}
          consumerId={addrPreflightModal.consumerId}
          library={addrLibQ.data || []}
          onConfirm={collectors => addrPreflightModal.resolve(collectors)}
          onCancel={() => addrPreflightModal.resolve(null)}
          onSaveAddress={handleSaveCollectorAddress}
        />
      )}

      {letterPreview && (
        <LetterPreviewModal
          jobId={letterPreview.jobId}
          letters={letterPreview.letters}
          roundNum={letterPreview.roundNum}
          portalSent={letterPreview.portalSent}
          portalError={letterPreview.portalError}
          onClose={() => setLetterPreview(null)}
          onPortalSend={handlePortalSend}
        />
      )}
    </div>
  );
}
