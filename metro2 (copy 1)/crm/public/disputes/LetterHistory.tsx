import React, { useState } from 'react';
import { useLetterHistory } from './hooks.ts';
import { getTokenParam } from './utils.ts';
import { authHeader } from '../common.ts';

interface Props {
  consumerId: string;
}

export function LetterHistory({ consumerId }: Props) {
  const { data, isLoading, isError } = useLetterHistory(consumerId);
  const [detailOpen, setDetailOpen] = useState(false);

  if (isLoading) return <div style={{ fontSize: 12, color: '#666', padding: '8px 0' }}>Loading letter history…</div>;
  if (isError) return <div style={{ fontSize: 12, color: '#666', padding: '8px 0' }}>Could not load letter history.</div>;

  const letters = data?.letters || [];
  const summaries = data?.summaries || [];
  const tokenParam = getTokenParam();

  if (!letters.length && !summaries.length) {
    return <div style={{ fontSize: 12, color: '#666', padding: '8px 0' }}>No letters generated yet for this client.</div>;
  }

  // Dedup: one row per unique (letterType, bureau) combo, newest date
  const dedupMap = new Map<string, any>();
  for (const letter of letters) {
    const tplKey = `${letter.letterType || '(unknown)'}__${letter.bureau || ''}`;
    const existing = dedupMap.get(tplKey);
    const letterAt = letter.at ? new Date(letter.at as string).getTime() : 0;
    if (!existing || letterAt > (existing.latestAt || 0)) {
      dedupMap.set(tplKey, { letterType: letter.letterType, bureau: letter.bureau, creditor: letter.creditor, round: letter.round, jobId: letter.jobId, latestAt: letterAt, at: letter.at });
    }
  }
  const deduped = Array.from(dedupMap.values()).sort((a, b) => (b.latestAt || 0) - (a.latestAt || 0));

  // Per-round detail grouped by jobId
  const byJob = new Map<string, any>();
  for (const letter of letters) {
    const key = letter.jobId || `nojob_${letter.at}`;
    if (!byJob.has(key)) byJob.set(key, { jobId: letter.jobId, round: letter.round, at: letter.at, letterItems: [] });
    byJob.get(key).letterItems.push(letter);
  }
  const groups = Array.from(byJob.values()).sort((a, b) => +new Date(b.at || 0) - +new Date(a.at || 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* At-a-glance deduped */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.04em' }}>Letters Sent (all time)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {deduped.map((d, i) => {
            const date = d.at ? new Date(d.at as string).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
            const dlLink = d.jobId ? `/api/letters/${encodeURIComponent(d.jobId)}/all.zip${tokenParam}` : null;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 5, fontSize: 11 }}>
                <span style={{ fontWeight: 500, color: '#e5e7eb', flex: 1 }}>{d.letterType || '(unknown)'}</span>
                <span style={{ fontSize: 10, color: '#888' }}>{d.bureau || ''}{d.bureau && d.round ? ' • ' : ''}{d.round ? `R${d.round}` : ''}</span>
                <span style={{ color: '#666', fontSize: 10, whiteSpace: 'nowrap' }}>{date}</span>
                {dlLink && <a href={dlLink} style={{ fontSize: 10, color: '#60a5fa', textDecoration: 'none', whiteSpace: 'nowrap', marginLeft: 4 }}>⬇</a>}
              </div>
            );
          })}
          {summaries.map((s, i) => {
            const date = s.at ? new Date(s.at as string).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
            const bureaus = ((s.bureaus as string[]) || []).join(', ') || 'N/A';
            const dlLink = s.jobId ? `/api/letters/${encodeURIComponent(s.jobId as string)}/all.zip${tokenParam}` : null;
            return (
              <div key={`s-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, fontSize: 11 }}>
                <span style={{ color: '#888', flex: 1 }}>{s.count as number} letter{(s.count as number) !== 1 ? 's' : ''} · {bureaus}</span>
                <span style={{ color: '#666', whiteSpace: 'nowrap' }}>{date}</span>
                {dlLink && <a href={dlLink} style={{ fontSize: 10, color: '#60a5fa', textDecoration: 'none', whiteSpace: 'nowrap', marginLeft: 4 }}>⬇</a>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Expandable per-round detail */}
      {groups.length > 0 && (
        <details style={{ fontSize: 11 }} open={detailOpen} onToggle={e => setDetailOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary style={{ cursor: 'pointer', color: '#60a5fa', fontSize: 11, listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
            <span>{detailOpen ? '▼' : '▶'}</span> Round-by-round detail
          </summary>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {groups.map((group, gi) => {
              const date = group.at ? new Date(group.at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown date';
              const roundLabel = group.round ? `Round ${group.round}` : 'No round';
              const dlLink = group.jobId ? `/api/letters/${encodeURIComponent(group.jobId)}/all.zip${tokenParam}` : null;
              return (
                <div key={gi} style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: '#e5e7eb' }}>{date}</span>
                    <span style={{ fontSize: 10, color: '#d4a853' }}>{roundLabel}</span>
                    <span style={{ fontSize: 10, color: '#666', marginLeft: 'auto' }}>{group.letterItems.length} letter{group.letterItems.length !== 1 ? 's' : ''}</span>
                    {dlLink && <a href={dlLink} style={{ fontSize: 10, color: '#60a5fa', textDecoration: 'none' }}>⬇ ZIP</a>}
                  </div>
                  <div>
                    {group.letterItems.map((l: any, li: number) => (
                      <div key={li} style={{ fontSize: 10, color: '#ccc', padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 500 }}>{l.creditor || 'Unknown'}</span>
                        <span style={{ color: '#666' }}>→</span>
                        <span style={{ color: '#9ca3af' }}>{l.bureau || ''}</span>
                        {l.letterType && <span style={{ color: '#888', fontSize: 10 }}>{l.letterType}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
