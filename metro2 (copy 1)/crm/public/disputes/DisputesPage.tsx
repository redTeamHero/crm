import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useConsumers, useReports, useDisputeData, useLetterHistory, useLetterTemplates,
  useCollectorAddressLibrary, useUpdateItemStatus, useUpdateRoundSettings,
  useSendToPortal, useDeleteRound, useGetRecommendation, useCheckPreflight,
  useGenerateLetters, usePollJobStatus, useGetGeneratedLetters, useDownloadLetterZip,
  useSaveDisputeCollectorAddress,
} from './hooks.ts';
import { buildIdempotencyKey } from './utils.ts';
import { DisputeRound as DisputeRoundComponent } from './DisputeRound.tsx';
import { NextRoundTargetModal } from './NextRoundTargetModal.tsx';
import { LetterPreviewModal } from './LetterPreviewModal.tsx';
import { AddrPreflightModal } from './AddrPreflightModal.tsx';
import { CollectorAddrPanel } from './CollectorAddrPanel.tsx';
import { LetterHistory } from './LetterHistory.tsx';
import type {
  DisputeRec, DisputeRound, DisputeItem, CollectorEntry, SelMapEntry,
  LetterPreviewState, NextRoundModalState, AddrPreflightModalState,
  LetterTemplate,
} from './types.ts';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function DisputesPage() {
  const qc = useQueryClient();

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
  const [genBusy, setGenBusy] = useState(false);

  const [letterPreview, setLetterPreview] = useState<LetterPreviewState | null>(null);
  const [nextRoundModal, setNextRoundModal] = useState<NextRoundModalState | null>(null);
  const [addrPreflightModal, setAddrPreflightModal] = useState<AddrPreflightModalState | null>(null);

  // Queries
  const consumersQ = useConsumers();
  const reportsQ = useReports(consumerId);
  const disputeQ = useDisputeData(consumerId);
  const historyQ = useLetterHistory(consumerId);
  const templatesQ = useLetterTemplates();
  const addrLibQ = useCollectorAddressLibrary();

  // Write mutations
  const updateStatusM = useUpdateItemStatus(consumerId);
  const updateSettingsM = useUpdateRoundSettings(consumerId);
  const sendPortalM = useSendToPortal();
  const deleteRoundM = useDeleteRound(consumerId);
  const getRecM = useGetRecommendation(consumerId);
  const preflightM = useCheckPreflight();
  const generateM = useGenerateLetters();
  const pollJobM = usePollJobStatus();
  const getLettersM = useGetGeneratedLetters();
  const downloadZipM = useDownloadLetterZip();
  const saveAddrM = useSaveDisputeCollectorAddress(consumerId);

  useEffect(() => {
    if (reportsQ.data?.reports?.[0]) {
      setReportId(reportsQ.data.reports[0].id ?? null);
    } else if (reportsQ.data) {
      setReportId(null);
    }
  }, [reportsQ.data]);

  const sentTemplates = useMemo(() => {
    const set = new Set<string>();
    for (const l of historyQ.data?.letters || []) {
      if (l.creditor && l.bureau) set.add(`${l.creditor}__${l.bureau}`);
    }
    return set;
  }, [historyQ.data]);

  const templates = useMemo((): LetterTemplate[] => {
    return (templatesQ.data?.templates || []).map((t: { id: string; name: string }) => ({
      id: t.id || t.name || '',
      name: t.name || t.id || '',
    }));
  }, [templatesQ.data]);

  const rounds: DisputeRound[] = disputeQ.data?.rounds || [];
  const activation = disputeQ.data?.activation;

  const consumers = consumersQ.data?.consumers || [];
  const selectedConsumer = consumers.find(c => c.id === consumerId);

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

  async function handleStatusChange(jobId: string, itemIdx: number, item: DisputeItem, newStatus: string) {
    try {
      await updateStatusM.mutateAsync({
        jobId,
        items: [{ creditor: item.creditor, bureau: item.bureau, outcome: newStatus, itemIndex: itemIdx, notes: `Status set to ${newStatus} by CRM user` }],
      });
    } catch (e: unknown) {
      showErr(errMsg(e));
    }
  }

  function handleTemplateChange(key: string, templateId: string) {
    setTemplateOverrides(prev => ({ ...prev, [key]: templateId }));
  }

  async function handleUpdateSentDate(jobId: string, val: string) {
    try {
      await updateSettingsM.mutateAsync({ jobId, settings: { sentAt: val } });
    } catch (e: unknown) {
      showErr(errMsg(e));
    }
  }

  async function handleUpdateFollowupDays(jobId: string, val: number) {
    try {
      await updateSettingsM.mutateAsync({ jobId, settings: { followUpDays: val } });
    } catch (e: unknown) {
      showErr(errMsg(e));
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
      const items = indices
        .map(idx => {
          const item = round.items![idx];
          if (!item) return null;
          return { creditor: item.creditor, bureau: item.bureau, outcome: newStatus, itemIndex: idx, notes: `Batch ${newStatus} by CRM user` };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      if (!items.length) continue;
      try {
        await updateStatusM.mutateAsync({ jobId, items });
      } catch (e: unknown) {
        showErr(errMsg(e));
      }
    }
    clearSelection();
  }

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
      const recData = await getRecM.mutateAsync(jobId);
      if (!recData?.ok || !recData.recommendations?.length) {
        showErr(recData.error || 'No recommendations available.'); return;
      }
      const recs: DisputeRec[] = recData.recommendations.filter(r => !r.resolved);
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
      let selections: SelMapEntry[] = Object.values(selMap);
      selections.forEach(sel => { if (!sel.bureaus.length) sel.bureaus = ['TransUnion', 'Experian', 'Equifax']; });
      if (!selections.length && bureauRecs.length && round.selections?.length) {
        const fbTpl = bureauRecs[0]?.recommendedTemplate || null;
        selections = (round.selections || [])
          .filter(s => s.tradelineIndex != null)
          .map(s => ({ tradelineIndex: s.tradelineIndex, bureaus: s.bureaus?.length ? s.bureaus : ['TransUnion', 'Experian', 'Equifax'], templateId: fbTpl, specificDisputeReason: s.specificDisputeReason || bureauRecs[0]?.specificDisputeReason || null }));
      }

      const seenCollectors = new Set<string>();
      let collectors: CollectorEntry[] = collectorRecs
        .filter(r => {
          const key = (r.creditor || r.collectorName || '').toLowerCase().trim();
          if (seenCollectors.has(key)) return false;
          seenCollectors.add(key); return true;
        })
        .map(r => ({ name: r.creditor || r.collectorName || 'Unknown Collector', addr1: '', addr2: '', templateId: r.recommendedTemplate || 'debt-validation', tradelineIndex: r.tradelineIndex ?? null }));

      if (!selections.length && !collectors.length) {
        showErr('Could not determine tradeline selections from recommendations. Please generate letters manually.'); return;
      }

      if (collectors.length) {
        setGenStatus('Checking addresses…');
        const preflightRes = await preflightM.mutateAsync({ consumerId, collectors });
        if (!preflightRes.ok) {
          showErr(preflightRes.error || 'Address preflight check failed.'); return;
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
      const genResult = await generateM.mutateAsync({
        consumerId,
        reportId,
        selections,
        collectors,
        itemsPerLetter,
        idempotencyKey: buildIdempotencyKey('dispute-next-round'),
      });
      const letterJobId = genResult.jobId;

      setGenStatus('Processing letters…');
      await pollJobM.mutateAsync(letterJobId);

      const lettersData = await getLettersM.mutateAsync(letterJobId);
      if (!lettersData.letters?.length) throw new Error('No letters were generated.');

      setGenStatus('Sending to portal…');
      let portalSent = false;
      let portalError = '';
      try {
        const portalRes = await sendPortalM.mutateAsync(letterJobId);
        portalSent = !!portalRes?.ok;
        if (!portalSent) portalError = portalRes.error || String(portalRes.message || '') || 'Portal upload returned an error.';
      } catch (e: unknown) { portalError = errMsg(e); }

      clearSelection();
      qc.invalidateQueries({ queryKey: ['disputes', consumerId] });
      setLetterPreview({ jobId: letterJobId, letters: lettersData.letters!, roundNum: roundNum + 1, portalSent, portalError });
    } catch (e: unknown) {
      showErr(errMsg(e));
    } finally {
      setGenBusy(false);
      setGenStatus(null);
    }
  }, [consumerId, reportId, rounds, selectedItems, templateOverrides, itemsPerLetter,
      getRecM, preflightM, generateM, pollJobM, getLettersM, sendPortalM]);

  async function handleBatchSendPortal() {
    const jobIds = getSelectedJobIds();
    if (!jobIds.length || !consumerId) return;
    if (jobIds.length > 1) { showErr('Select items from a single round to send to portal.'); return; }
    const jobId = jobIds[0];
    try {
      const res = await sendPortalM.mutateAsync(jobId);
      if (res?.ok) {
        // success — portal accepted the letters
      } else if (res?.status === 404) {
        const round = rounds.find(r => r.jobId === jobId);
        if (!round) { showErr('Letters not found on server — please generate letters again manually.'); return; }
        await handleRegenerateAndSendPortal(round);
      } else {
        showErr(res?.error || String(res?.message || '') || 'Failed to send to portal.');
      }
    } catch (e: unknown) {
      showErr(`Portal send failed: ${errMsg(e)}`);
    }
  }

  async function handleRegenerateAndSendPortal(round: DisputeRound) {
    setGenStatus('Regenerating letters…');
    setGenBusy(true);
    try {
      let selections: SelMapEntry[] = [];
      if (round.selections?.length) {
        selections = round.selections.filter(s => s.tradelineIndex != null);
      }
      if (!selections.length) {
        const selMap: Record<string, SelMapEntry> = {};
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
      selections.forEach(sel => { if (!sel.bureaus?.length) sel.bureaus = ['TransUnion', 'Experian', 'Equifax']; });

      setGenStatus('Sending to server…');
      const genResult = await generateM.mutateAsync({
        consumerId: consumerId!,
        reportId,
        selections,
        collectors: [],
        itemsPerLetter,
        idempotencyKey: buildIdempotencyKey('regen-portal'),
      });
      const newJobId = genResult.jobId;

      setGenStatus('Processing…');
      await pollJobM.mutateAsync(newJobId);

      setGenStatus('Sending to portal…');
      const portalRes = await sendPortalM.mutateAsync(newJobId);
      if (!portalRes?.ok) throw new Error(portalRes?.error || 'Portal upload failed.');
      qc.invalidateQueries({ queryKey: ['disputes', consumerId] });
    } catch (e: unknown) {
      showErr(`Regeneration failed: ${errMsg(e)}`);
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
    } catch (e: unknown) {
      showErr(errMsg(e));
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
      await downloadZipM.mutateAsync({ jobId, type: 'all' });
    } catch (e: unknown) {
      showErr(`Download failed: ${errMsg(e)}`);
    }
  }

  async function handleSaveCollectorAddress(data: { name: string; addr1: string; addr2?: string; city?: string; state?: string; zip?: string }) {
    if (!consumerId) return;
    await saveAddrM.mutateAsync(data);
  }

  async function handlePortalSend(jobId: string): Promise<boolean> {
    try {
      const res = await sendPortalM.mutateAsync(jobId);
      return !!res?.ok;
    } catch { return false; }
  }

  const selectionCount = selectedItems.size;
  const hasSelection = selectionCount > 0;

  return (
    <div style={{ minHeight: '100vh' }}>
      {error && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 20000, maxWidth: 420, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: 13, fontWeight: 500 }}>
          {error}
        </div>
      )}

      <div className="container" style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 48px' }}>
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="section-title" style={{ margin: 0, marginBottom: 4 }}>Dispute Tracker</h1>
            <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Track, manage, and generate dispute letters for each client.</p>
          </div>
          <button className="btn btn-outline text-sm" onClick={() => {
            qc.invalidateQueries({ queryKey: ['disputes', consumerId] });
            qc.invalidateQueries({ queryKey: ['letter-history', consumerId] });
          }}>
            ↻ Refresh
          </button>
        </div>

        <div className="glass panel" style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '.04em' }}>Select Client</label>
          {consumersQ.isLoading ? <div style={{ color: '#666', fontSize: 13 }}>Loading clients…</div> :
          consumersQ.isError ? <div style={{ color: '#f87171', fontSize: 13 }}>Failed to load clients.</div> : (
            <select value={consumerId || ''} onChange={e => { setConsumerId(e.target.value || null); setReportId(null); clearSelection(); }}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: '#9ca3af' }}>Items per letter:</label>
              <input type="number" min={1} max={100} value={itemsPerLetter}
                onChange={e => setItemsPerLetter(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{ width: 64, background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 8px', color: '#e5e5e5', fontSize: 12 }} />
            </div>

            {disputeQ.isLoading ? (
              <div className="glass panel" style={{ textAlign: 'center', color: '#888', padding: 32 }}>Loading dispute tracker…</div>
            ) : disputeQ.isError ? (
              <div className="glass panel" style={{ textAlign: 'center', color: '#f87171', padding: 32 }}>Failed to load dispute data.</div>
            ) : (
              <div id="disputeTrackerPanel">
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

                {!rounds.length ? (
                  <div className="glass panel" style={{ textAlign: 'center', padding: 32 }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                    <div style={{ color: '#aaa', fontSize: 14, marginBottom: 4 }}>No dispute rounds yet for this client.</div>
                    <div style={{ color: '#666', fontSize: 12 }}>Generate dispute letters from the Generate Letters page to begin tracking.</div>
                  </div>
                ) : (
                  <div>
                    {rounds.map((round, ri) => (
                      <DisputeRoundComponent
                        key={round.jobId}
                        round={round}
                        roundIndex={ri}
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
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

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
                  {downloadZipM.isPending ? 'Downloading…' : '⬇ Download Round'}
                </button>
                <button className="btn btn-outline text-xs"
                  onClick={() => { if (confirm(`Mark ${selectionCount} item(s) as resolved?`)) batchUpdateStatus('removed'); }}
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

            <div className="glass panel" style={{ marginTop: 20 }}>
              <div style={{ fontWeight: 700, color: '#e5e5e5', fontSize: 14, marginBottom: 12 }}>Letter History</div>
              <LetterHistory consumerId={consumerId} />
            </div>

            <div style={{ marginTop: 14 }}>
              <CollectorAddrPanel consumerId={consumerId} />
            </div>
          </>
        )}
      </div>

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
