import React, { useState, useMemo } from 'react';
import { useLeads, useCreateLead, useUpdateLead, useDeleteLead, useConvertLeadToClient, useGenerateLeadLink, type Lead } from './hooks.ts';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  new: { bg: 'rgba(59,130,246,0.15)', text: '#93c5fd' },
  contacted: { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24' },
  consultation: { bg: 'rgba(139,92,246,0.15)', text: '#c4b5fd' },
  converted: { bg: 'rgba(16,185,129,0.15)', text: '#6ee7b7' },
  lost: { bg: 'rgba(239,68,68,0.12)', text: '#f87171' },
};

const EMPTY_LEAD: Partial<Lead> = { name: '', email: '', phone: '', status: 'new', source: '', notes: '' };

export function LeadsPage() {
  const leadsQ = useLeads();
  const createM = useCreateLead();
  const updateM = useUpdateLead();
  const deleteM = useDeleteLead();
  const convertM = useConvertLeadToClient();
  const genLinkM = useGenerateLeadLink();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Lead>>(EMPTY_LEAD);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [generatedLink, setGeneratedLink] = useState('');

  const leads: Lead[] = useMemo(() => {
    const raw = (leadsQ.data as { leads?: Lead[] })?.leads || (Array.isArray(leadsQ.data) ? leadsQ.data as Lead[] : []);
    return raw
      .filter(l => filterStatus === 'all' || l.status === filterStatus)
      .filter(l => !search || [l.name, l.email, l.phone].some(f => f?.toLowerCase().includes(search.toLowerCase())));
  }, [leadsQ.data, filterStatus, search]);

  const handleSave = async () => {
    if (editingId) {
      await updateM.mutateAsync({ id: editingId, data: form });
    } else {
      await createM.mutateAsync(form);
    }
    setForm(EMPTY_LEAD);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (lead: Lead) => {
    setForm({ ...lead });
    setEditingId(lead.id || null);
    setShowForm(true);
  };

  const handleConvert = async (lead: Lead) => {
    if (!confirm(`Convert ${lead.name || 'this lead'} to a client?`)) return;
    await convertM.mutateAsync(lead);
  };

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-4xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">Leads</h1>
              <p className="hero-subtitle">Track prospects from first contact to consultation. Convert qualified leads to clients with one click.</p>
            </div>
          </div>
        </section>

        <div className="glass card p-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              <input className="input" placeholder="Search leads…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 220 }} />
              <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">All Statuses</option>
                {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-outline" onClick={() =>
                genLinkM.mutate(undefined, { onSuccess: (d) => setGeneratedLink((d as { url?: string })?.url || '') })
              } disabled={genLinkM.isPending}>
                {genLinkM.isPending ? '…' : 'Generate Capture Link'}
              </button>
              <button className="btn" onClick={() => { setForm(EMPTY_LEAD); setEditingId(null); setShowForm(!showForm); }}>
                {showForm ? 'Cancel' : '+ New Lead'}
              </button>
            </div>
          </div>
          {generatedLink && (
            <div className="mt-3 flex gap-2">
              <input readOnly value={generatedLink} className="input flex-1" style={{ fontSize: 13, fontFamily: 'monospace' }} />
              <button className="btn" onClick={() => navigator.clipboard.writeText(generatedLink)}>Copy</button>
            </div>
          )}
        </div>

        {showForm && (
          <div className="glass card p-4">
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb', marginBottom: 14 }}>{editingId ? 'Edit Lead' : 'New Lead'}</h3>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Name</label>
                <input className="input w-full" value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Email</label>
                <input className="input w-full" type="email" value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Phone</label>
                <input className="input w-full" value={form.phone || ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Status</label>
                <select className="input w-full" value={form.status || 'new'} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                  {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Source</label>
                <input className="input w-full" value={form.source || ''} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} placeholder="Facebook, Referral, Website…" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Notes</label>
                <textarea className="input w-full" value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn" onClick={handleSave} disabled={createM.isPending || updateM.isPending}>
                {createM.isPending || updateM.isPending ? 'Saving…' : 'Save Lead'}
              </button>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="glass card p-4">
          <div style={{ marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
            {leadsQ.isLoading ? 'Loading…' : `${leads.length} lead${leads.length !== 1 ? 's' : ''}`}
          </div>
          {leadsQ.isLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading leads…</p>
          ) : leads.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No leads found. Add your first lead above.</p>
          ) : (
            <div className="space-y-2">
              {leads.map(lead => {
                const col = STATUS_COLORS[lead.status || 'new'] || STATUS_COLORS.new;
                return (
                  <div key={lead.id} className="flex items-start gap-4 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span style={{ fontSize: 15, fontWeight: 600, color: '#e5e7eb' }}>{lead.name || 'Unnamed Lead'}</span>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: col.bg, color: col.text, fontWeight: 600, textTransform: 'capitalize' }}>
                          {lead.status || 'new'}
                        </span>
                        {lead.source && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{lead.source}</span>}
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                        {[lead.email, lead.phone].filter(Boolean).join(' • ')}
                      </div>
                      {lead.notes && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{lead.notes}</div>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => startEdit(lead)}>Edit</button>
                      <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(16,185,129,0.15)', color: '#6ee7b7' }} onClick={() => handleConvert(lead)} disabled={convertM.isPending}>
                        Convert
                      </button>
                      <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(239,68,68,0.12)', color: '#f87171' }} onClick={() => {
                        if (confirm('Delete this lead?')) deleteM.mutate(lead.id!);
                      }}>
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
