import React, { useState } from 'react';
import type { DisputeRec, TargetGroup } from './types.ts';

interface Props {
  recs: DisputeRec[];
  onConfirm: (targets: string[]) => void;
  onCancel: () => void;
}

export function NextRoundTargetModal({ recs, onConfirm, onCancel }: Props) {
  const [targets, setTargets] = useState<string[]>(() => recs.map(r => r.letterTarget || 'bureau'));

  const groupMap = new Map<string, TargetGroup>();
  recs.forEach((r, i) => {
    const creditorKey = (r.creditor || '').toLowerCase().trim();
    const key = r.tradelineIndex != null
      ? `tl:${r.tradelineIndex}`
      : creditorKey
        ? `cr:${creditorKey}`
        : `unknown:${i}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { creditor: r.creditor || 'Unknown', bureaus: [], templates: [], indices: [] });
    }
    const g = groupMap.get(key)!;
    if (r.bureau && !g.bureaus.includes(r.bureau)) g.bureaus.push(r.bureau);
    const tpl = r.recommendedTemplate || '';
    if (tpl && !g.templates.includes(tpl)) g.templates.push(tpl);
    g.indices.push(i);
  });
  const groups = [...groupMap.values()];

  function groupTarget(g: TargetGroup): 'bureau' | 'collector' {
    const first = targets[g.indices[0]];
    return g.indices.every(i => targets[i] === first) ? (first as 'bureau' | 'collector') : 'bureau';
  }

  function setGroupTarget(g: TargetGroup, target: 'bureau' | 'collector') {
    setTargets(prev => {
      const next = [...prev];
      g.indices.forEach(i => { next[i] = target; });
      return next;
    });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 12000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: '#1a1a1e', border: '1px solid rgba(212,168,83,0.2)', borderRadius: 12, width: '90%', maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: 16 }}>Generate Next Round Letters</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>For each tradeline, choose whether the letter goes to the credit bureaus or directly to the creditor/collector.</div>
        </div>
        <div style={{ padding: '14px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {groups.map((g, gi) => {
            const isColl = groupTarget(g) === 'collector';
            const template = g.templates.length > 1 ? 'mixed templates' : g.templates[0] || 'auto';
            return (
              <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8 }}>
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 600, color: '#fff', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.creditor}</div>
                  <div style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {g.bureaus.join(', ')}{g.bureaus.length && template ? ' • ' : ''}{template ? <span style={{ color: '#60a5fa' }}>{template}</span> : null}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 0, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                  <button type="button" onClick={() => setGroupTarget(g, 'bureau')}
                    style={{ padding: '5px 11px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'background 0.15s,color 0.15s', background: !isColl ? 'rgba(96,165,250,0.22)' : 'transparent', color: !isColl ? '#60a5fa' : '#666' }}>
                    Bureaus
                  </button>
                  <button type="button" onClick={() => setGroupTarget(g, 'collector')}
                    style={{ padding: '5px 11px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'background 0.15s,color 0.15s', background: isColl ? 'rgba(251,191,36,0.22)' : 'transparent', color: isColl ? '#fbbf24' : '#666' }}>
                    Collector
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onCancel}
            style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#888', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm([...targets])}
            style={{ padding: '8px 20px', borderRadius: 7, border: '1px solid rgba(212,168,83,0.3)', background: 'rgba(212,168,83,0.12)', color: '#d4a853', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Generate Letters
          </button>
        </div>
      </div>
    </div>
  );
}
