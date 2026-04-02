import React, { useState } from 'react';
import {
  useStripeSubscriptionStatus, useStripeProducts, useBillingPlans,
  useCreateBillingPlan, useUpdateBillingPlan, useSendPlanInvoice,
  useStripePortal, type BillingPlan,
} from './hooks.ts';

function formatCurrency(v: number) {
  return `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const EMPTY_PLAN: Partial<BillingPlan> = { name: '', amount: undefined, frequency: 'monthly', intervalDays: 30, reminderLeadDays: 3, notes: '', active: true };

export function BillingPage() {
  const subscQ = useStripeSubscriptionStatus();
  const productsQ = useStripeProducts();
  const plansQ = useBillingPlans();
  const createPlanM = useCreateBillingPlan();
  const updatePlanM = useUpdateBillingPlan();
  const sendPlanM = useSendPlanInvoice();
  const portalM = useStripePortal();

  const [planForm, setPlanForm] = useState<Partial<BillingPlan>>(EMPTY_PLAN);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');

  const plans = plansQ.data?.plans || [];
  const subStatus = subscQ.data as Record<string, unknown> | undefined;
  const products = (productsQ.data as { products?: unknown[] })?.products || [];

  const handleSavePlan = async () => {
    if (!planForm.name?.trim()) { setFormError('Add a plan name before saving.'); return; }
    if (!planForm.amount || planForm.amount <= 0) { setFormError('Enter a positive amount.'); return; }
    setFormError('');
    if (editingId) {
      await updatePlanM.mutateAsync({ id: editingId, data: planForm });
    } else {
      await createPlanM.mutateAsync(planForm);
    }
    setPlanForm(EMPTY_PLAN);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (plan: BillingPlan) => {
    setPlanForm({ ...plan });
    setEditingId(plan.id || null);
    setShowForm(true);
  };

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-3xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">Billing</h1>
              <p className="hero-subtitle">Manage your Evolv subscription and create recurring billing plans for clients.</p>
            </div>
          </div>
        </section>

        <div className="glass card p-4">
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853', marginBottom: 16 }}>Your Evolv Subscription</h2>
          {subscQ.isLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading subscription status…</p>
          ) : subStatus ? (
            <div className="flex flex-wrap gap-4 items-center">
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: subStatus.status === 'active' ? '#6ee7b7' : '#fbbf24' }}>
                  {String(subStatus.status || 'Unknown')}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  {subStatus.planName ? String(subStatus.planName) : 'No active plan'}
                </div>
              </div>
              {subStatus.currentPeriodEnd && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                  Renews {new Date(subStatus.currentPeriodEnd as string).toLocaleDateString()}
                </div>
              )}
              <button
                className="btn btn-outline ml-auto"
                onClick={() => portalM.mutate(undefined, { onSuccess: (d) => { if ((d as { url?: string }).url) window.open((d as { url: string }).url, '_blank'); } })}
                disabled={portalM.isPending}
              >
                {portalM.isPending ? 'Opening…' : 'Manage Subscription'}
              </button>
            </div>
          ) : (
            <div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 12 }}>No subscription found.</p>
              <div className="flex flex-wrap gap-3">
                {products.map((prod: unknown, i: number) => {
                  const p = prod as Record<string, unknown>;
                  return (
                    <div key={p.id as string || i} className="rounded-xl p-4" style={{ background: 'rgba(212,168,83,0.06)', border: '1px solid rgba(212,168,83,0.2)', minWidth: 180 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#e5e7eb' }}>{String(p.name || 'Plan')}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#d4a853', margin: '6px 0' }}>{String(p.price || '')}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>{String(p.description || '')}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="glass card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853' }}>Custom Billing Plans</h2>
            <button className="btn" onClick={() => { setPlanForm(EMPTY_PLAN); setEditingId(null); setShowForm(!showForm); }}>
              {showForm && !editingId ? 'Cancel' : '+ New Plan'}
            </button>
          </div>

          {showForm && (
            <div className="mb-6 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb', marginBottom: 14 }}>
                {editingId ? 'Editing Plan' : 'New Plan'}
              </h3>
              {formError && <div className="mb-3 p-2 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', fontSize: 13 }}>{formError}</div>}
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
                <div>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Plan Name</label>
                  <input className="input w-full" value={planForm.name || ''} onChange={e => setPlanForm(p => ({ ...p, name: e.target.value }))} placeholder="Premium Credit Concierge" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Amount ($)</label>
                  <input className="input w-full" type="number" step="0.01" value={planForm.amount ?? ''} onChange={e => setPlanForm(p => ({ ...p, amount: parseFloat(e.target.value) }))} placeholder="297.00" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Frequency</label>
                  <select className="input w-full" value={planForm.frequency || 'monthly'} onChange={e => setPlanForm(p => ({ ...p, frequency: e.target.value }))}>
                    <option value="monthly">Monthly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="weekly">Weekly</option>
                    <option value="custom">Custom days</option>
                  </select>
                </div>
                {planForm.frequency === 'custom' && (
                  <div>
                    <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Interval (days)</label>
                    <input className="input w-full" type="number" value={planForm.intervalDays ?? ''} onChange={e => setPlanForm(p => ({ ...p, intervalDays: parseInt(e.target.value) }))} />
                  </div>
                )}
                <div>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Reminder Lead (days)</label>
                  <input className="input w-full" type="number" value={planForm.reminderLeadDays ?? 3} onChange={e => setPlanForm(p => ({ ...p, reminderLeadDays: parseInt(e.target.value) }))} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Notes</label>
                  <textarea className="input w-full" value={planForm.notes || ''} onChange={e => setPlanForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Outline deliverables" style={{ resize: 'vertical' }} />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button className="btn" onClick={handleSavePlan} disabled={createPlanM.isPending || updatePlanM.isPending}>
                  {createPlanM.isPending || updatePlanM.isPending ? 'Saving…' : 'Save Plan'}
                </button>
                <button className="btn btn-outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
              </div>
            </div>
          )}

          {plansQ.isLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading billing plans…</p>
          ) : plans.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No plans yet. Create a plan to automate billing cadence.</p>
          ) : (
            <div className="space-y-3">
              {plans.map((plan: BillingPlan) => (
                <div key={plan.id} className="flex items-start justify-between p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ flex: 1 }}>
                    <div className="flex items-center gap-3 mb-2">
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#e5e7eb' }}>{plan.name}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: plan.active ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.08)', color: plan.active ? '#6ee7b7' : 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                        {plan.active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#d4a853', marginBottom: 4 }}>{formatCurrency(plan.amount || 0)}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                      {plan.frequency} • Next bill: {plan.nextBillDate || 'Unscheduled'} • {plan.cyclesCompleted || 0} cycles
                    </div>
                    {plan.notes && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{plan.notes}</div>}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button className="btn" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => sendPlanM.mutate({ planId: plan.id! })} disabled={sendPlanM.isPending}>
                      Send Invoice
                    </button>
                    <button className="btn btn-outline" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => startEdit(plan)}>Edit</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
