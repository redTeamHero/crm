import React, { useState, useEffect } from 'react';
import type { CollectorEntry, CollectorAddress } from './types.ts';

interface RowState {
  addr1: string;
  addr2: string;
  city: string;
  state: string;
  zip: string;
  search: string;
  showDropdown: boolean;
  dropdownMatches: CollectorAddress[];
  resolved: boolean;
  save: boolean;
}

interface Props {
  flagged: CollectorEntry[];
  enrichedAll: CollectorEntry[];
  consumerId: string;
  library: CollectorAddress[];
  onConfirm: (collectors: CollectorEntry[]) => void;
  onCancel: () => void;
  onSaveAddress: (data: { name: string; addr1: string; addr2?: string; city?: string; state?: string; zip?: string }) => Promise<void>;
}

export function AddrPreflightModal({ flagged, enrichedAll, consumerId, library, onConfirm, onCancel, onSaveAddress }: Props) {
  const [rows, setRows] = useState<RowState[]>(() =>
    flagged.map(col => ({
      addr1: (col.addr1 && col.addr1 !== '[Add collector address — required before mailing]') ? col.addr1 : '',
      addr2: col.addr2 || '',
      city: col.city || '',
      state: col.state || '',
      zip: col.zip || '',
      search: '',
      showDropdown: false,
      dropdownMatches: [],
      resolved: !!(col.addr1 && col.addr1 !== '[Add collector address — required before mailing]' && col.city && col.state),
      save: false,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusColor, setStatusColor] = useState('#888');

  function updateRow(i: number, patch: Partial<RowState>) {
    setRows(prev => {
      const next = [...prev];
      const updated = { ...next[i], ...patch };
      const resolved = !!(updated.addr1.trim() && updated.city.trim() && updated.state.trim());
      next[i] = { ...updated, resolved };
      return next;
    });
  }

  function handleSearch(i: number, q: string) {
    const matches = q.trim()
      ? library.filter(e =>
          (e.name || '').toLowerCase().includes(q.toLowerCase()) ||
          (e.addr1 || '').toLowerCase().includes(q.toLowerCase()) ||
          (e.city || '').toLowerCase().includes(q.toLowerCase())
        ).slice(0, 12)
      : [];
    updateRow(i, { search: q, showDropdown: matches.length > 0, dropdownMatches: matches });
  }

  function fillFromEntry(i: number, entry: CollectorAddress) {
    updateRow(i, {
      addr1: entry.addr1 || '',
      addr2: entry.addr2 || '',
      city: entry.city || '',
      state: entry.state || '',
      zip: entry.zip || '',
      search: entry.name || '',
      showDropdown: false,
      dropdownMatches: [],
    });
  }

  const allResolved = rows.every(r => r.resolved);

  const resolvedCount = rows.filter(r => r.resolved).length;

  async function handleGenerate() {
    setSaving(true);
    setStatusMsg('Saving…');
    setStatusColor('#888');
    let saveFailures = 0;

    const baseList = (enrichedAll && enrichedAll.length > 0) ? enrichedAll : [...flagged];
    const resolvedCollectors = baseList.map(c => ({ ...c }));

    const saveTasks: Promise<void>[] = [];
    for (let i = 0; i < flagged.length; i++) {
      const row = rows[i];
      const origIdx = flagged[i]._originalIndex ?? i;
      if (resolvedCollectors[origIdx] !== undefined) {
        resolvedCollectors[origIdx] = {
          ...resolvedCollectors[origIdx],
          addr1: row.addr1,
          addr2: row.addr2,
          city: row.city,
          state: row.state.toUpperCase(),
          zip: row.zip,
        };
      }
      if (row.save && row.addr1 && row.city && row.state) {
        saveTasks.push(
          onSaveAddress({ name: flagged[i].name, addr1: row.addr1, addr2: row.addr2, city: row.city, state: row.state.toUpperCase(), zip: row.zip })
            .catch(() => { saveFailures++; })
        );
      }
    }

    await Promise.all(saveTasks);
    if (saveFailures > 0) {
      setStatusMsg(`Note: ${saveFailures} address save(s) failed — addresses will still be used for this generation.`);
      setStatusColor('#f59e0b');
      await new Promise(r => setTimeout(r, 2200));
    }
    setSaving(false);
    onConfirm(resolvedCollectors);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ maxWidth: 640, width: '95vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: '#111113', border: '1px solid rgba(212,168,83,0.22)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#e5e5e5', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#f59e0b' }}>⚠</span> Collector Addresses Missing
              </div>
              <p style={{ fontSize: 12, color: '#888', marginTop: 3 }}>The collectors below have no address on file. Resolve each before generating letters.</p>
            </div>
            <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: 18, cursor: 'pointer', padding: '4px 8px', lineHeight: 1 }}>&times;</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {flagged.map((col, i) => {
            const row = rows[i];
            return (
              <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#e5e5e5', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#f87171', fontSize: 10, letterSpacing: '.05em', fontWeight: 700, padding: '2px 5px', background: 'rgba(239,68,68,0.12)', borderRadius: 4 }}>MISSING</span>
                    {col.name || 'Unknown Collector'}
                  </div>
                  <span style={{ fontSize: 11, color: row.resolved ? '#4ade80' : '#888' }}>{row.resolved ? '✓ Resolved' : 'Not resolved'}</span>
                </div>

                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <input type="text" placeholder="Search address library…" value={row.search} autoComplete="off"
                    onChange={e => handleSearch(i, e.target.value)}
                    onBlur={() => setTimeout(() => updateRow(i, { showDropdown: false }), 200)}
                    style={{ width: '100%', padding: '7px 10px', fontSize: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#e5e5e5', boxSizing: 'border-box', outline: 'none' }} />
                  {row.showDropdown && (
                    <div style={{ display: 'block', position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, background: '#1a1a1e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, zIndex: 200, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                      {row.dropdownMatches.map((e, mi) => (
                        <div key={mi} onMouseDown={ev => { ev.preventDefault(); fillFromEntry(i, e); }}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 12, transition: 'background .1s' }}
                          onMouseOver={ev => { (ev.currentTarget as HTMLElement).style.background = 'rgba(212,168,83,0.08)'; }}
                          onMouseOut={ev => { (ev.currentTarget as HTMLElement).style.background = ''; }}>
                          <div style={{ fontWeight: 600, color: '#e5e5e5' }}>{e.name}{e._src === 'custom' ? <span style={{ color: '#a5b4fc', fontSize: 10 }}> [custom]</span> : null}</div>
                          <div style={{ color: '#888', fontSize: 11 }}>{e.addr1}{e.addr2 ? `, ${e.addr2}` : ''} · {[e.city, e.state, e.zip].filter(Boolean).join(', ')}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <input placeholder="Address line 1 *" value={row.addr1} onChange={e => updateRow(i, { addr1: e.target.value })}
                    style={{ gridColumn: '1/-1', padding: '7px 10px', fontSize: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#e5e5e5', outline: 'none' }} />
                  <input placeholder="Address line 2 (optional)" value={row.addr2} onChange={e => updateRow(i, { addr2: e.target.value })}
                    style={{ gridColumn: '1/-1', padding: '7px 10px', fontSize: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#e5e5e5', outline: 'none' }} />
                  <input placeholder="City *" value={row.city} onChange={e => updateRow(i, { city: e.target.value })}
                    style={{ padding: '7px 10px', fontSize: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#e5e5e5', outline: 'none' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <input placeholder="State *" maxLength={2} value={row.state} onChange={e => updateRow(i, { state: e.target.value })}
                      style={{ padding: '7px 10px', fontSize: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#e5e5e5', outline: 'none' }} />
                    <input placeholder="ZIP" value={row.zip} onChange={e => updateRow(i, { zip: e.target.value })}
                      style={{ padding: '7px 10px', fontSize: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#e5e5e5', outline: 'none' }} />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, color: '#aaa', cursor: 'pointer' }}>
                  <input type="checkbox" checked={row.save} onChange={e => updateRow(i, { save: e.target.checked })} style={{ accentColor: '#d4a853' }} />
                  Save this address for this client (auto-fills next time)
                </label>
              </div>
            );
          })}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 12, color: statusColor }}>{statusMsg || `${resolvedCount} of ${flagged.length} resolved`}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline text-sm" onClick={onCancel} disabled={saving}>Cancel</button>
            <button className="btn text-sm" onClick={handleGenerate} disabled={!allResolved || saving}
              style={{ background: 'linear-gradient(135deg,#d4a853,#c49a45)', color: '#0a0a0a', fontWeight: 700, opacity: allResolved && !saving ? 1 : 0.45, cursor: allResolved && !saving ? 'pointer' : 'not-allowed' }}>
              {saving ? 'Saving…' : 'Generate Letters'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
