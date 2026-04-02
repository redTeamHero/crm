import React, { useState } from 'react';
import { useTemplates, useSampleLetters, useContracts, useDeleteContract, useSequences, useDeleteSequence, type Template, type Contract, type Sequence } from './hooks.ts';

type LibraryTab = 'templates' | 'contracts' | 'sequences' | 'samples';

export function LibraryPage() {
  const [tab, setTab] = useState<LibraryTab>('templates');
  const [searchTerm, setSearchTerm] = useState('');

  const templatesQ = useTemplates();
  const samplesQ = useSampleLetters();
  const contractsQ = useContracts();
  const sequencesQ = useSequences();
  const deleteContractM = useDeleteContract();
  const deleteSequenceM = useDeleteSequence();

  const templates: Template[] = (templatesQ.data as { templates?: Template[] })?.templates || (Array.isArray(templatesQ.data) ? templatesQ.data as Template[] : []);
  const samples: unknown[] = (samplesQ.data as { letters?: unknown[] })?.letters || (Array.isArray(samplesQ.data) ? samplesQ.data : []);
  const contracts: Contract[] = (contractsQ.data as { contracts?: Contract[] })?.contracts || (Array.isArray(contractsQ.data) ? contractsQ.data as Contract[] : []);
  const sequences: Sequence[] = (sequencesQ.data as { sequences?: Sequence[] })?.sequences || (Array.isArray(sequencesQ.data) ? sequencesQ.data as Sequence[] : []);

  const tabs: { id: LibraryTab; label: string }[] = [
    { id: 'templates', label: `Templates (${templates.length})` },
    { id: 'contracts', label: `Contracts (${contracts.length})` },
    { id: 'sequences', label: `Sequences (${sequences.length})` },
    { id: 'samples', label: 'Sample Letters' },
  ];

  const filter = <T extends { name?: string; title?: string }>(arr: T[]) =>
    arr.filter(item => !searchTerm || [item.name, item.title].some(f => f?.toLowerCase().includes(searchTerm.toLowerCase())));

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-4xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">Letter Library</h1>
              <p className="hero-subtitle">Dispute letter templates, client agreements, automated sequences, and sample dispute letters.</p>
            </div>
          </div>
        </section>

        <div className="glass card p-4">
          <div className="flex gap-3 items-center flex-wrap">
            <input className="input" placeholder="Search…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ width: 220 }} />
          </div>
        </div>

        <div className="glass card">
          <div className="flex overflow-x-auto" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ padding: '14px 20px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', color: tab === t.id ? '#d4a853' : 'rgba(255,255,255,0.5)', borderBottom: tab === t.id ? '2px solid #d4a853' : '2px solid transparent' }}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {tab === 'templates' && (
              templatesQ.isLoading ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading…</p> :
              filter(templates).length === 0 ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No templates found.</p> :
              <div className="space-y-2">
                {filter(templates).map((tpl: Template) => (
                  <div key={tpl.id || tpl.name} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb' }}>{tpl.name || 'Untitled'}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{tpl.type || tpl.category || 'General'}</div>
                    </div>
                    <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 12px' }}>Use</button>
                  </div>
                ))}
              </div>
            )}

            {tab === 'contracts' && (
              contractsQ.isLoading ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading…</p> :
              filter(contracts).length === 0 ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No contracts. Upload or create a contract template.</p> :
              <div className="space-y-2">
                {filter(contracts).map((c: Contract) => (
                  <div key={c.id || c.name} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb' }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{c.type || 'Contract'}</div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 12px' }}>Preview</button>
                      <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                        onClick={() => { if (confirm('Delete this contract?')) deleteContractM.mutate(c.id!); }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'sequences' && (
              sequencesQ.isLoading ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading…</p> :
              filter(sequences).length === 0 ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No sequences configured yet.</p> :
              <div className="space-y-2">
                {filter(sequences).map((seq: Sequence) => (
                  <div key={seq.id || seq.name} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb' }}>{seq.name || 'Untitled Sequence'}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{(seq.steps as unknown[] || []).length} steps</div>
                    </div>
                    <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                      onClick={() => { if (confirm('Delete this sequence?')) deleteSequenceM.mutate(seq.id!); }}>Delete</button>
                  </div>
                ))}
              </div>
            )}

            {tab === 'samples' && (
              samplesQ.isLoading ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading…</p> :
              samples.length === 0 ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No sample letters available.</p> :
              <div className="space-y-2">
                {samples.map((s: unknown, i: number) => {
                  const sample = s as Record<string, unknown>;
                  return (
                    <div key={sample.id as string || i} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb' }}>{String(sample.name || sample.title || `Sample ${i + 1}`)}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{String(sample.type || sample.category || '')}</div>
                      </div>
                      <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 12px' }}>View</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
