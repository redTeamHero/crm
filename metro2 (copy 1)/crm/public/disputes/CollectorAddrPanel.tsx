import React, { useState } from 'react';
import { useConsumerCollectorAddresses, useSaveCollectorAddress, useDeleteCollectorAddress } from './hooks.ts';
import type { CollectorAddress } from './types.ts';

interface Props {
  consumerId: string;
}

export function CollectorAddrPanel({ consumerId }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [addr1, setAddr1] = useState('');
  const [addr2, setAddr2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const addrQuery = useConsumerCollectorAddresses(consumerId);
  const saveMut = useSaveCollectorAddress(consumerId);
  const delMut = useDeleteCollectorAddress(consumerId);

  const addrs: CollectorAddress[] = addrQuery.data?.addresses || [];

  function fillEdit(a: CollectorAddress) {
    setName(a.name || '');
    setAddr1(a.addr1 || '');
    setAddr2(a.addr2 || '');
    setCity(a.city || '');
    setState(a.state || '');
    setZip(a.zip || '');
    setErr('');
  }

  async function handleSave() {
    if (!name.trim() || !addr1.trim()) {
      setErr('Name and Address Line 1 are required.');
      return;
    }
    setErr('');
    try {
      await saveMut.mutateAsync({ name: name.trim(), addr1: addr1.trim(), addr2: addr2.trim(), city: city.trim(), state: state.trim().toUpperCase(), zip: zip.trim() });
      setName(''); setAddr1(''); setAddr2(''); setCity(''); setState(''); setZip('');
      setMsg('Saved!');
      setTimeout(() => setMsg(''), 2500);
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  }

  async function handleDelete(addrName: string) {
    if (!confirm(`Remove saved address for "${addrName}"?`)) return;
    try {
      await delMut.mutateAsync(addrName);
    } catch (e: any) {
      alert(e.message || String(e));
    }
  }

  return (
    <article className="glass panel" style={{ marginTop: 0 }}>
      <details open={open} onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#d4a853', fontSize: 14 }}>📬</span>
            <span style={{ fontWeight: 600, color: '#e5e5e5', fontSize: 13 }}>Collector Addresses</span>
            <span style={{ fontSize: 10, color: '#666', fontWeight: 400 }}>per-client overrides — pre-fill letters for this consumer only</span>
          </div>
          <span style={{ color: '#888', fontSize: 11, userSelect: 'none' }}>{open ? '▼ Collapse' : '▶ Expand'}</span>
        </summary>
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 10 }}>
            {addrQuery.isLoading ? <div style={{ fontSize: 11, color: '#666' }}>Loading…</div> :
             !addrs.length ? <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>No custom addresses saved for this client. Common collectors will auto-fill from the built-in directory.</div> :
             addrs.map((a, idx) => (
               <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: '6px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7, marginBottom: 5 }}>
                 <div>
                   <div style={{ fontSize: 12, fontWeight: 600, color: '#e5e5e5' }}>{a.name}</div>
                   <div style={{ fontSize: 11, color: '#888' }}>{a.addr1}{a.addr2 ? `, ${a.addr2}` : ''} · {[a.city, a.state, a.zip].filter(Boolean).join(', ')}</div>
                 </div>
                 <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                   <button onClick={() => fillEdit(a)} style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid rgba(99,102,241,0.3)', background: 'transparent', color: '#a5b4fc', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>Edit</button>
                   <button onClick={() => handleDelete(a.name!)} style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: '#f87171', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>Remove</button>
                 </div>
               </div>
             ))}
          </div>
          <div style={{ background: '#111113', border: '1px solid rgba(212,168,83,0.12)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#d4a853', marginBottom: 8 }}>Add / Update Address for This Client</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Collector Name *</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Exact name from credit report"
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 9px', fontSize: 12, color: '#e5e5e5', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Address Line 1 *</label>
                <input type="text" value={addr1} onChange={e => setAddr1(e.target.value)} placeholder="PO Box 1234 or 123 Main St"
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 9px', fontSize: 12, color: '#e5e5e5', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Address Line 2</label>
                <input type="text" value={addr2} onChange={e => setAddr2(e.target.value)} placeholder="Suite, Dept, etc."
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 9px', fontSize: 12, color: '#e5e5e5', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>City</label>
                <input type="text" value={city} onChange={e => setCity(e.target.value)}
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 9px', fontSize: 12, color: '#e5e5e5', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>State</label>
                  <input type="text" maxLength={2} value={state} onChange={e => setState(e.target.value)}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 9px', fontSize: 12, color: '#e5e5e5', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>ZIP</label>
                  <input type="text" maxLength={10} value={zip} onChange={e => setZip(e.target.value)}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 9px', fontSize: 12, color: '#e5e5e5', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>
            {err && <div style={{ fontSize: 11, color: '#f87171', marginTop: 5 }}>{err}</div>}
            <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={handleSave} disabled={saveMut.isPending}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(212,168,83,0.35)', background: 'rgba(212,168,83,0.1)', color: '#d4a853', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {saveMut.isPending ? 'Saving…' : 'Save Address'}
              </button>
              {msg && <span style={{ fontSize: 11, color: '#4ade80' }}>{msg}</span>}
            </div>
          </div>
        </div>
      </details>
    </article>
  );
}
