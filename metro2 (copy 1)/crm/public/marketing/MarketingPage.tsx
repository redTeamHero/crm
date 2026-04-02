import React, { useState } from 'react';
import { useCampaigns, useCreateCampaign, useUpdateCampaign, useDeleteCampaign, type Campaign } from './hooks.ts';

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af' },
  active: { bg: 'rgba(16,185,129,0.15)', text: '#6ee7b7' },
  paused: { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24' },
  completed: { bg: 'rgba(99,102,241,0.15)', text: '#a5b4fc' },
};

const EMPTY_CAMPAIGN: Partial<Campaign> = { name: '', status: 'draft', segment: 'all', channel: 'sms', kpi: '' };

export function MarketingPage() {
  const campaignsQ = useCampaigns();
  const createM = useCreateCampaign();
  const updateM = useUpdateCampaign();
  const deleteM = useDeleteCampaign();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Campaign>>(EMPTY_CAMPAIGN);

  const campaigns: Campaign[] = (campaignsQ.data as { campaigns?: Campaign[] })?.campaigns || (Array.isArray(campaignsQ.data) ? campaignsQ.data as Campaign[] : []);

  const handleSave = async () => {
    if (editingId) await updateM.mutateAsync({ id: editingId, data: form });
    else await createM.mutateAsync(form);
    setForm(EMPTY_CAMPAIGN); setEditingId(null); setShowForm(false);
  };

  const startEdit = (c: Campaign) => { setForm({ ...c }); setEditingId(c.id || null); setShowForm(true); };

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-4xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">Marketing</h1>
              <p className="hero-subtitle">Create and track campaigns to reach leads and clients via SMS and email.</p>
            </div>
            <button className="btn" onClick={() => { setForm(EMPTY_CAMPAIGN); setEditingId(null); setShowForm(!showForm); }}>
              {showForm && !editingId ? 'Cancel' : '+ New Campaign'}
            </button>
          </div>
        </section>

        {showForm && (
          <div className="glass card p-4">
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb', marginBottom: 14 }}>{editingId ? 'Edit Campaign' : 'New Campaign'}</h3>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Campaign Name</label>
                <input className="input w-full" value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Channel</label>
                <select className="input w-full" value={form.channel || 'sms'} onChange={e => setForm(p => ({ ...p, channel: e.target.value }))}>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                  <option value="both">SMS + Email</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Segment</label>
                <select className="input w-full" value={form.segment || 'all'} onChange={e => setForm(p => ({ ...p, segment: e.target.value }))}>
                  <option value="all">All Contacts</option>
                  <option value="leads">Leads Only</option>
                  <option value="clients">Clients Only</option>
                  <option value="inactive">Inactive Clients</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Status</label>
                <select className="input w-full" value={form.status || 'draft'} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                  {Object.keys(STATUS_COLOR).map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>KPI / Goal</label>
                <input className="input w-full" value={form.kpi || ''} onChange={e => setForm(p => ({ ...p, kpi: e.target.value }))} placeholder="e.g. 50 consultations booked" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn" onClick={handleSave} disabled={createM.isPending || updateM.isPending}>
                {createM.isPending || updateM.isPending ? 'Saving…' : 'Save Campaign'}
              </button>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="glass card p-4">
          {campaignsQ.isLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading campaigns…</p>
          ) : campaigns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>📣</div>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No campaigns yet. Launch your first campaign above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((c: Campaign) => {
                const col = STATUS_COLOR[c.status || 'draft'] || STATUS_COLOR.draft;
                return (
                  <div key={c.id} className="flex items-start justify-between gap-4 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span style={{ fontSize: 15, fontWeight: 600, color: '#e5e7eb' }}>{c.name || 'Untitled Campaign'}</span>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: col.bg, color: col.text, fontWeight: 600, textTransform: 'capitalize' }}>{c.status}</span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>{c.channel}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                        Segment: {c.segment || 'all'}
                        {c.kpi && ` • Goal: ${c.kpi}`}
                        {c.nextTouch && ` • Next: ${c.nextTouch}`}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => startEdit(c)}>Edit</button>
                      <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                        onClick={() => { if (confirm('Delete this campaign?')) deleteM.mutate(c.id!); }}>Delete</button>
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
