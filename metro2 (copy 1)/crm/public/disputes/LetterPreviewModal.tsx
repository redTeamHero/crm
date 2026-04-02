import React, { useState, useRef } from 'react';
import { authHeader } from '../common.ts';
import type { GeneratedLetter } from './types.ts';
import { MAIL_RATES, fmtPrice, getTokenParam } from './utils.ts';

interface Props {
  jobId: string;
  letters: GeneratedLetter[];
  roundNum: number;
  portalSent: boolean;
  portalError: string;
  onClose: () => void;
  onPortalSend: (jobId: string) => Promise<boolean>;
}

const MAX_GROUP_SIZE = 10;

export function LetterPreviewModal({ jobId, letters, roundNum, portalSent: initialPortalSent, portalError: initialPortalError, onClose, onPortalSend }: Props) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(() => new Set(letters.map((l, i) => l.index ?? i)));
  const [activeMailKey, setActiveMailKey] = useState('certified');
  const [groupingActive, setGroupingActive] = useState(false);
  const [portalSent, setPortalSent] = useState(initialPortalSent);
  const [portalError, setPortalError] = useState(initialPortalError);
  const [portalSending, setPortalSending] = useState(false);
  const [dlStatus, setDlStatus] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [groupCollapsed, setGroupCollapsed] = useState<Map<string, boolean>>(new Map());

  const tokenParam = getTokenParam();

  function toggleIndex(idx: number) {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  function selectAll(checked: boolean) {
    setSelectedIndices(checked ? new Set(letters.map((l, i) => l.index ?? i)) : new Set());
  }

  const allSelected = selectedIndices.size === letters.length;
  const someSelected = selectedIndices.size > 0 && selectedIndices.size < letters.length;
  const { label: mailLabel, rate: mailRate } = MAIL_RATES[activeMailKey] || MAIL_RATES.certified;

  function computeGroups() {
    const selected = letters.filter((l, i) => selectedIndices.has(l.index ?? i));
    const byBureau = new Map<string, GeneratedLetter[]>();
    for (const l of selected) {
      const b = (l.bureau as string || 'Unknown').trim();
      if (!byBureau.has(b)) byBureau.set(b, []);
      byBureau.get(b)!.push(l);
    }
    const groups: Array<{ bureau: string; items: GeneratedLetter[]; partNum: number; totalParts: number }> = [];
    for (const [bureau, items] of byBureau) {
      const totalParts = Math.ceil(items.length / MAX_GROUP_SIZE);
      for (let s = 0; s < items.length; s += MAX_GROUP_SIZE) {
        groups.push({ bureau, items: items.slice(s, s + MAX_GROUP_SIZE), partNum: Math.floor(s / MAX_GROUP_SIZE) + 1, totalParts });
      }
    }
    return groups;
  }

  const groups = groupingActive ? computeGroups() : [];
  const envelopeCount = groups.length;

  async function downloadSelected() {
    if (!selectedIndices.size) return;
    setDlStatus('Building ZIP…');
    try {
      const res = await fetch(`/api/letters/${encodeURIComponent(jobId)}/selected.zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ indices: [...selectedIndices] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'selected_letters.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Download failed: ${err.message || err}`);
    } finally { setDlStatus(null); }
  }

  async function downloadGrouped() {
    if (!selectedIndices.size) return;
    setDlStatus('Building grouped ZIP…');
    try {
      const res = await fetch(`/api/letters/${encodeURIComponent(jobId)}/grouped.zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ indices: [...selectedIndices] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'grouped_letters.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Grouped download failed: ${err.message || err}`);
    } finally { setDlStatus(null); }
  }

  async function handleSendPortal() {
    setPortalSending(true);
    setPortalError('');
    try {
      const ok = await onPortalSend(jobId);
      if (ok) { setPortalSent(true); }
      else { setPortalError('Failed to send to portal.'); }
    } catch (err: any) {
      setPortalError(err.message || String(err));
    } finally { setPortalSending(false); }
  }

  const hasOverLimit = groups.some(g => g.totalParts > 1);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#1a1a1e', border: '1px solid rgba(212,168,83,0.2)', borderRadius: 12, width: '90%', maxWidth: 740, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: 16 }}>Generated Letters — {new Date().toLocaleDateString()}</div>
            <div style={{ fontSize: 12, color: '#888' }}>Round {roundNum} • {letters.length} letter{letters.length !== 1 ? 's' : ''} generated</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#888', cursor: 'pointer' }}>
              <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected; }}
                onChange={e => selectAll(e.target.checked)} style={{ accentColor: '#d4a853', width: 13, height: 13 }} /> All
            </label>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: 20, cursor: 'pointer', padding: '4px 8px' }}>&times;</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          {!groupingActive ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
              {letters.map((l, i) => {
                const idx = l.index ?? i;
                const creditor = String(l.creditor || l.creditorName || 'Letter');
                const bureau = String(l.bureau || '');
                const htmlUrl = `/api/letters/${encodeURIComponent(jobId)}/${idx}.html${tokenParam}`;
                const pdfUrl = `/api/letters/${encodeURIComponent(jobId)}/${idx}.pdf${tokenParam}`;
                const sel = selectedIndices.has(idx);
                return (
                  <div key={idx} className="glass card" style={{ padding: 12, border: `1px solid ${sel ? 'rgba(212,168,83,0.45)' : 'rgba(212,168,83,0.15)'}`, borderRadius: 8, position: 'relative' }}>
                    <label style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={sel} onChange={() => toggleIndex(idx)} style={{ accentColor: '#d4a853', width: 15, height: 15 }} />
                    </label>
                    <div style={{ paddingLeft: 20 }}>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>{creditor}</div>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>{bureau}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-outline text-xs" onClick={() => setIframeUrl(htmlUrl)}>View</button>
                        <a className="btn btn-outline text-xs" href={pdfUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>PDF</a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              {hasOverLimit && (
                <div style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#fbbf24' }}>
                  ⚠ One or more bureaus have more than {MAX_GROUP_SIZE} letters — they will be split into multiple packets.
                </div>
              )}
              {groups.map(({ bureau, items, partNum, totalParts }, gi) => {
                const key = `${bureau}::${partNum}`;
                const isCollapsed = groupCollapsed.get(key) !== false;
                const label = totalParts > 1 ? `${bureau} — Part ${partNum} of ${totalParts}` : bureau;
                return (
                  <div key={gi} style={{ border: '1px solid rgba(168,85,247,0.3)', borderRadius: 8, marginBottom: 8, background: 'rgba(168,85,247,0.05)', overflow: 'hidden' }}>
                    <div onClick={() => setGroupCollapsed(m => new Map(m).set(key, !isCollapsed))}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}>
                      <span style={{ fontWeight: 700, color: '#c084fc', fontSize: 13 }}>📋 {label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: '#888', background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 10, padding: '1px 8px' }}>{items.length} letter{items.length !== 1 ? 's' : ''} → 1 envelope</span>
                        <span style={{ fontSize: 12, color: '#a855f7' }}>{isCollapsed ? '▼' : '▲'}</span>
                      </div>
                    </div>
                    {!isCollapsed && (
                      <div style={{ padding: '4px 14px 10px', fontSize: 11, color: '#aaa' }}>
                        {items.map(l => String(l.creditor || l.creditorName || 'Letter')).join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Mail type + cost */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(212,168,83,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#888' }}>📬 Mail type:</span>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {Object.entries(MAIL_RATES).map(([key, { label, rate }]) => (
                  <button key={key} onClick={() => setActiveMailKey(key)}
                    style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, border: `1px solid ${activeMailKey === key ? 'rgba(212,168,83,0.5)' : 'rgba(212,168,83,0.3)'}`, background: activeMailKey === key ? 'rgba(212,168,83,0.18)' : 'transparent', color: activeMailKey === key ? '#d4a853' : '#888', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {label} ({fmtPrice(rate)})
                  </button>
                ))}
              </div>
            </div>
            <span style={{ fontSize: 10, color: '#555' }}>Portal &amp; download are always free</span>
          </div>
          <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#888' }}>💰 Mailing est.:</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#d4a853' }}>
              {groupingActive
                ? (envelopeCount === 0 ? 'No letters selected' : `${envelopeCount} envelope${envelopeCount !== 1 ? 's' : ''} × ${fmtPrice(mailRate)} = ${fmtPrice(envelopeCount * mailRate)} (${mailLabel})`)
                : (selectedIndices.size === 0 ? 'No letters selected' : `${selectedIndices.size} × ${fmtPrice(mailRate)} = ${fmtPrice(selectedIndices.size * mailRate)} (${mailLabel})`)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <a className="btn btn-outline text-xs" href={`/api/letters/${encodeURIComponent(jobId)}/all.zip${tokenParam}`} style={{ textDecoration: 'none' }}>⬇ All (ZIP)</a>
          <button className="btn btn-outline text-xs" onClick={downloadSelected} disabled={!selectedIndices.size || !!dlStatus}
            style={{ borderColor: 'rgba(96,165,250,0.35)', color: '#60a5fa' }}>
            {dlStatus || `⬇ Selected (${selectedIndices.size})`}
          </button>
          <button className="btn btn-outline text-xs" onClick={() => setGroupingActive(a => !a)}
            style={{ borderColor: groupingActive ? 'rgba(168,85,247,0.5)' : 'rgba(168,85,247,0.4)', color: groupingActive ? '#c084fc' : '#a855f7', background: groupingActive ? 'rgba(168,85,247,0.18)' : 'transparent' }}>
            ⊞ {groupingActive ? 'Grouped ✓' : 'Group by Bureau'}
          </button>
          {groupingActive && (
            <button className="btn btn-outline text-xs" onClick={downloadGrouped} disabled={!selectedIndices.size || !!dlStatus}
              style={{ borderColor: 'rgba(74,222,128,0.4)', color: '#4ade80' }}>
              ⬇ Grouped ({envelopeCount} envelope{envelopeCount !== 1 ? 's' : ''})
            </button>
          )}
          <button className="btn btn-outline text-xs" onClick={handleSendPortal}
            disabled={portalSent || portalSending}
            style={{ color: portalSent ? '#4ade80' : portalError ? '#fbbf24' : undefined, borderColor: portalSent ? '#4ade80' : portalError ? '#fbbf24' : undefined }}>
            {portalSending ? 'Sending…' : portalSent ? '✓ Portal' : portalError ? '⚠ Retry Portal' : '↑ Send to Portal'}
          </button>
          {portalError && <span style={{ fontSize: 11, color: '#fbbf24', maxWidth: 200, display: 'inline-block' }}>{portalError}</span>}
          <a className="btn btn-outline text-xs" href={`/letters?job=${encodeURIComponent(jobId)}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>Full View</a>
          <button className="btn text-xs" onClick={onClose} style={{ marginLeft: 'auto' }}>Done</button>
        </div>
      </div>

      {/* Iframe overlay */}
      {iframeUrl && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Letter Preview</span>
            <button onClick={() => setIframeUrl(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer' }}>&times;</button>
          </div>
          <iframe src={iframeUrl} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />
        </div>
      )}
    </div>
  );
}
