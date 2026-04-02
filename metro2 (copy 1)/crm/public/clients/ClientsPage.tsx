import React, { useState, useMemo } from 'react';
import {
  useConsumers, useCreateConsumer, useUpdateConsumer, useDeleteConsumer, type Consumer,
} from './hooks.ts';
import { useAppStore } from '../store/appStore.ts';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: 'rgba(16,185,129,0.15)', text: '#6ee7b7' },
  pending: { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24' },
  completed: { bg: 'rgba(99,102,241,0.15)', text: '#a5b4fc' },
  paused: { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af' },
  cancelled: { bg: 'rgba(239,68,68,0.12)', text: '#f87171' },
};

const EMPTY: Partial<Consumer> = { name: '', email: '', phone: '', address: '', city: '', state: '', zip: '', status: 'active' };

export function ClientsPage() {
  const { setCurrentConsumerId } = useAppStore();
  const consumersQ = useConsumers();
  const createM = useCreateConsumer();
  const updateM = useUpdateConsumer(null);
  const deleteM = useDeleteConsumer();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Consumer>>(EMPTY);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [viewId, setViewId] = useState<string | null>(null);

  const updateSpecificM = useUpdateConsumer(editingId);

  const allConsumers: Consumer[] = useMemo(() => {
    const raw = (consumersQ.data as { consumers?: Consumer[] })?.consumers || (Array.isArray(consumersQ.data) ? consumersQ.data as Consumer[] : []);
    return raw
      .filter(c => filterStatus === 'all' || c.status === filterStatus)
      .filter(c => !search || [c.name, c.email, c.phone].some(f => String(f || '').toLowerCase().includes(search.toLowerCase())));
  }, [consumersQ.data, filterStatus, search]);

  const selected = viewId ? allConsumers.find(c => c.id === viewId) : null;

  const handleSave = async () => {
    if (editingId) {
      await updateSpecificM.mutateAsync(form);
    } else {
      await createM.mutateAsync(form);
    }
    setForm(EMPTY); setEditingId(null); setShowForm(false);
  };

  const startEdit = (c: Consumer) => {
    setForm({ ...c });
    setEditingId(c.id || null);
    setViewId(null);
    setShowForm(true);
  };

  const selectClient = (c: Consumer) => {
    setViewId(c.id || null);
    setCurrentConsumerId(c.id || null);
  };

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-5xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">Clients</h1>
              <p className="hero-subtitle">Manage all your credit repair clients. View status, track progress, and access client records.</p>
            </div>
            <button className="btn" onClick={() => { setForm(EMPTY); setEditingId(null); setViewId(null); setShowForm(!showForm); }}>
              {showForm && !editingId ? 'Cancel' : '+ New Client'}
            </button>
          </div>
        </section>

        <div className="glass card p-4">
          <div className="flex flex-wrap gap-3">
            <input className="input" placeholder="Search clients…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 240 }} />
            <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
            </select>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: 'rgba(255,255,255,0.4)', alignSelf: 'center' }}>
              {consumersQ.isLoading ? '…' : `${allConsumers.length} client${allConsumers.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        </div>

        {showForm && (
          <div className="glass card p-4">
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb', marginBottom: 14 }}>{editingId ? 'Edit Client' : 'New Client'}</h3>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Full Name</label>
                <input className="input w-full" value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Email</label>
                <input type="email" className="input w-full" value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Phone</label>
                <input className="input w-full" value={form.phone || ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Status</label>
                <select className="input w-full" value={form.status || 'active'} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                  {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Address</label>
                <input className="input w-full" value={form.address || ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>City</label>
                <input className="input w-full" value={form.city || ''} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>State</label>
                <input className="input w-full" value={form.state || ''} onChange={e => setForm(p => ({ ...p, state: e.target.value }))} maxLength={2} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>ZIP</label>
                <input className="input w-full" value={form.zip || ''} onChange={e => setForm(p => ({ ...p, zip: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn" onClick={handleSave} disabled={createM.isPending || updateSpecificM.isPending}>
                {createM.isPending || updateSpecificM.isPending ? 'Saving…' : 'Save Client'}
              </button>
              <button className="btn btn-outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
            </div>
          </div>
        )}

        {selected && (
          <div className="glass card p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e5e7eb', marginBottom: 4 }}>{selected.name || 'Client'}</h2>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                  {[selected.email, selected.phone].filter(Boolean).join(' • ')}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn" style={{ fontSize: 12 }} onClick={() => startEdit(selected)}>Edit</button>
                <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => setViewId(null)}>Close</button>
              </div>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
              {selected.address && (
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Address</div>
                  <div style={{ fontSize: 13 }}>{[selected.address, selected.city, selected.state, selected.zip].filter(Boolean).join(', ')}</div>
                </div>
              )}
              {selected.score !== undefined && (
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Score</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#d4a853' }}>{selected.score}</div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <a href="/disputes" className="btn" style={{ fontSize: 12 }}>View Disputes</a>
              <a href="/client-invoicing" className="btn btn-outline" style={{ fontSize: 12 }}>Invoicing</a>
              <a href="/letters" className="btn btn-outline" style={{ fontSize: 12 }}>Letters</a>
              <a href="/cfpb" className="btn btn-outline" style={{ fontSize: 12 }}>CFPB</a>
            </div>
          </div>
        )}

        <div className="glass card p-4">
          {consumersQ.isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading clients…</p>
            </div>
          ) : allConsumers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>👥</div>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No clients found. Add your first client above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allConsumers.map(c => {
                const col = STATUS_COLORS[c.status || 'active'] || STATUS_COLORS.active;
                const isSelected = viewId === c.id;
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-4 rounded-xl cursor-pointer"
                    style={{ background: isSelected ? 'rgba(212,168,83,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isSelected ? 'rgba(212,168,83,0.3)' : 'rgba(255,255,255,0.06)'}`, transition: 'all 0.15s' }}
                    onClick={() => selectClient(c)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb' }}>{c.name || 'Unnamed'}</span>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: col.bg, color: col.text, fontWeight: 600, textTransform: 'capitalize' }}>
                          {c.status || 'active'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                        {[c.email, c.phone].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0" onClick={e => e.stopPropagation()}>
                      {c.score !== undefined && <span style={{ fontSize: 16, fontWeight: 700, color: '#d4a853' }}>{c.score}</span>}
                      <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => startEdit(c)}>Edit</button>
                      <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                        onClick={() => { if (confirm(`Remove ${c.name || 'client'}?`)) deleteM.mutate(c.id!); }}>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
