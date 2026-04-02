import React, { useState, useEffect } from 'react';
import { useConsumers, useInvoices, useCreateInvoice, useMarkInvoicePaid, type Invoice } from './hooks.ts';
import { useAppStore } from '../store/appStore.ts';

function formatCurrency(v: number) {
  return `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ClientInvoicingPage() {
  const { currentConsumerId, setCurrentConsumerId } = useAppStore();
  const [selectedConsumerId, setSelectedConsumerId] = useState<string | null>(currentConsumerId);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Invoice>>({ desc: '', amount: undefined, due: '', company: '' });

  const consumersQ = useConsumers();
  const invoicesQ = useInvoices(selectedConsumerId);
  const createM = useCreateInvoice();
  const markPaidM = useMarkInvoicePaid();

  useEffect(() => {
    if (selectedConsumerId && selectedConsumerId !== currentConsumerId) setCurrentConsumerId(selectedConsumerId);
  }, [selectedConsumerId, currentConsumerId, setCurrentConsumerId]);

  const consumers = (consumersQ.data as { consumers?: Array<{ id: string; name?: string }> })?.consumers || [];
  const invoices: Invoice[] = (invoicesQ.data as { invoices?: Invoice[] })?.invoices || (Array.isArray(invoicesQ.data) ? invoicesQ.data as Invoice[] : []);

  const totalDue = invoices.filter(i => !i.paid).reduce((s, i) => s + (i.amount || 0), 0);
  const totalPaid = invoices.filter(i => i.paid).reduce((s, i) => s + (i.amount || 0), 0);

  const handleCreate = async () => {
    if (!selectedConsumerId || !form.desc || !form.amount) return;
    await createM.mutateAsync({ ...form, consumerId: selectedConsumerId });
    setForm({ desc: '', amount: undefined, due: '', company: '' });
    setShowForm(false);
  };

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-3xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">Client Invoicing</h1>
              <p className="hero-subtitle">Create and manage invoices for your clients. Track payments and outstanding balances.</p>
            </div>
          </div>
        </section>

        <div className="glass card p-4">
          <label style={{ fontSize: 12, fontWeight: 600, color: '#d4a853', display: 'block', marginBottom: 8 }}>Select Client</label>
          <select
            className="input w-full"
            value={selectedConsumerId || ''}
            onChange={e => setSelectedConsumerId(e.target.value || null)}
          >
            <option value="">— Choose a client —</option>
            {consumers.map(c => (
              <option key={c.id} value={c.id}>{c.name || c.id}</option>
            ))}
          </select>
        </div>

        {selectedConsumerId && (
          <>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))' }}>
              {[
                { label: 'Outstanding', value: formatCurrency(totalDue), color: '#f87171' },
                { label: 'Collected', value: formatCurrency(totalPaid), color: '#6ee7b7' },
                { label: 'Total Invoices', value: String(invoices.length), color: '#d4a853' },
              ].map(stat => (
                <div key={stat.label} className="glass card p-4">
                  <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="glass card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853' }}>Invoices</h3>
                <button className="btn" onClick={() => setShowForm(!showForm)}>
                  {showForm ? 'Cancel' : '+ New Invoice'}
                </button>
              </div>

              {showForm && (
                <div className="mb-4 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Description</label>
                      <input className="input w-full" value={form.desc || ''} onChange={e => setForm(p => ({ ...p, desc: e.target.value }))} placeholder="Credit Repair Services — Month 1" />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Amount ($)</label>
                      <input type="number" step="0.01" className="input w-full" value={form.amount ?? ''} onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) }))} placeholder="297.00" />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Due Date</label>
                      <input type="date" className="input w-full" value={form.due || ''} onChange={e => setForm(p => ({ ...p, due: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Company Name</label>
                      <input className="input w-full" value={form.company || ''} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} placeholder="Your Company LLC" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button className="btn" onClick={handleCreate} disabled={!form.desc || !form.amount || createM.isPending}>
                      {createM.isPending ? 'Creating…' : 'Create Invoice'}
                    </button>
                    <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {invoicesQ.isLoading ? (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading invoices…</p>
              ) : invoices.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No invoices yet. Create one above.</p>
              ) : (
                <div className="space-y-3">
                  {invoices.map((inv: Invoice) => (
                    <div key={inv.id} className="flex items-start justify-between gap-3 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${inv.paid ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.07)'}` }}>
                      <div style={{ flex: 1 }}>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span style={{ fontSize: 15, fontWeight: 600, color: '#e5e7eb' }}>{inv.desc || 'Invoice'}</span>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: inv.paid ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: inv.paid ? '#6ee7b7' : '#fbbf24', fontWeight: 600 }}>
                            {inv.paid ? 'Paid' : 'Unpaid'}
                          </span>
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: inv.paid ? '#6ee7b7' : '#d4a853', marginBottom: 2 }}>
                          {formatCurrency(inv.amount || 0)}
                        </div>
                        {inv.due && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Due: {inv.due}</div>}
                        {inv.company && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{inv.company}</div>}
                      </div>
                      {!inv.paid && (
                        <button className="btn shrink-0" style={{ fontSize: 12, padding: '6px 14px', background: 'rgba(16,185,129,0.15)', color: '#6ee7b7' }}
                          onClick={() => markPaidM.mutate(inv.id!)} disabled={markPaidM.isPending}>
                          Mark Paid
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
