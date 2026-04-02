import React, { useState, useEffect } from 'react';
import { useConsumers, useNegativeItems, useCfpbComplaints, useSubmitCfpbComplaint } from './hooks.ts';
import { useAppStore } from '../store/appStore.ts';

export function CfpbPage() {
  const { currentConsumerId, setCurrentConsumerId } = useAppStore();
  const [selectedId, setSelectedId] = useState<string | null>(currentConsumerId);
  const [form, setForm] = useState({ creditor: '', issue: '', description: '', desiredResolution: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const consumersQ = useConsumers();
  const negativeQ = useNegativeItems(selectedId);
  const complaintsQ = useCfpbComplaints(selectedId);
  const submitM = useSubmitCfpbComplaint();

  useEffect(() => {
    if (selectedId && selectedId !== currentConsumerId) setCurrentConsumerId(selectedId);
  }, [selectedId, currentConsumerId, setCurrentConsumerId]);

  const consumers = (consumersQ.data as { consumers?: Array<{ id: string; name?: string }> })?.consumers || [];
  const negItems = (negativeQ.data as { items?: Array<{ creditor?: string; type?: string; balance?: number }> })?.items || [];
  const complaints = (complaintsQ.data as { complaints?: unknown[] })?.complaints || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !form.creditor || !form.description) return;
    setSubmitting(true);
    try {
      await submitM.mutateAsync({ consumerId: selectedId, data: form });
      setSuccess(true);
      setForm({ creditor: '', issue: '', description: '', desiredResolution: '' });
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-3xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">CFPB Complaints</h1>
              <p className="hero-subtitle">Guide clients through filing CFPB complaints. Escalate unresolved disputes to the Consumer Financial Protection Bureau.</p>
            </div>
          </div>
        </section>

        <div className="glass card p-4">
          <label style={{ fontSize: 12, fontWeight: 600, color: '#d4a853', display: 'block', marginBottom: 8 }}>Select Client</label>
          <select
            value={selectedId || ''}
            onChange={e => setSelectedId(e.target.value || null)}
            className="input w-full"
          >
            <option value="">— Choose a client —</option>
            {consumers.map(c => (
              <option key={c.id} value={c.id}>{c.name || c.id}</option>
            ))}
          </select>
        </div>

        {selectedId && (
          <>
            {negItems.length > 0 && (
              <div className="glass card p-4">
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853', marginBottom: 12 }}>Negative Items (Pre-fill creditor)</h3>
                <div className="flex flex-wrap gap-2">
                  {negItems.slice(0, 8).map((item, i) => (
                    <button
                      key={i}
                      className="btn btn-outline"
                      style={{ fontSize: 12, padding: '4px 12px' }}
                      onClick={() => setForm(prev => ({ ...prev, creditor: item.creditor || '' }))}
                    >
                      {item.creditor || `Item ${i + 1}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="glass card p-4">
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853', marginBottom: 16 }}>File CFPB Complaint</h3>
              {success && (
                <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', fontSize: 14 }}>
                  ✓ Complaint submitted successfully.
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 6 }}>Creditor / Company</label>
                  <input
                    className="input w-full"
                    value={form.creditor}
                    onChange={e => setForm(prev => ({ ...prev, creditor: e.target.value }))}
                    placeholder="e.g. Capital One, Equifax"
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 6 }}>Issue Type</label>
                  <select className="input w-full" value={form.issue} onChange={e => setForm(prev => ({ ...prev, issue: e.target.value }))}>
                    <option value="">Select issue type</option>
                    <option value="incorrect_information">Incorrect information on report</option>
                    <option value="identity_theft">Identity theft / fraud</option>
                    <option value="account_not_mine">Account I don't recognize</option>
                    <option value="collector_harassment">Debt collector harassment</option>
                    <option value="billing_dispute">Billing dispute</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 6 }}>Description</label>
                  <textarea
                    className="input w-full"
                    value={form.description}
                    onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe what happened and how the company failed to resolve it…"
                    rows={4}
                    required
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 6 }}>Desired Resolution</label>
                  <input
                    className="input w-full"
                    value={form.desiredResolution}
                    onChange={e => setForm(prev => ({ ...prev, desiredResolution: e.target.value }))}
                    placeholder="e.g. Remove incorrect account, correct balance"
                  />
                </div>
                <button type="submit" className="btn" disabled={submitting} style={{ padding: '10px 24px' }}>
                  {submitting ? 'Submitting…' : 'Submit Complaint'}
                </button>
              </form>
            </div>

            {complaints.length > 0 && (
              <div className="glass card p-4">
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853', marginBottom: 12 }}>Previous Complaints</h3>
                <div className="space-y-2">
                  {complaints.map((c: unknown, i: number) => {
                    const complaint = c as Record<string, unknown>;
                    return (
                      <div key={complaint.id as string || i} className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb', marginBottom: 4 }}>{String(complaint.creditor || '—')}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{String(complaint.issue || '—')} • {String(complaint.createdAt || '')}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
