import React, { useState } from 'react';
import { useAdminAffiliates, useCommissionRates, useUpdateCommissionRates, useUpdateAffiliateStatus } from './hooks.ts';

export function AffiliatesAdminPage() {
  const affiliatesQ = useAdminAffiliates();
  const ratesQ = useCommissionRates();
  const updateRatesM = useUpdateCommissionRates();
  const updateStatusM = useUpdateAffiliateStatus();
  const [editingRates, setEditingRates] = useState(false);
  const [rateValues, setRateValues] = useState<Record<string, string>>({});

  const affiliates = (affiliatesQ.data as { affiliates?: unknown[] })?.affiliates || (Array.isArray(affiliatesQ.data) ? affiliatesQ.data : []);
  const rates = ratesQ.data as Record<string, number> | undefined;

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-4xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">Affiliates Admin</h1>
              <p className="hero-subtitle">Manage affiliate partners, review applications, and set commission rates.</p>
            </div>
          </div>
        </section>

        <div className="glass card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853' }}>Commission Rates</h3>
            <button className="btn" onClick={() => {
              if (editingRates && rates) {
                const newRates: Record<string, number> = {};
                Object.keys(rates).forEach(k => { newRates[k] = parseFloat(rateValues[k] ?? String(rates[k])) || rates[k]; });
                updateRatesM.mutate(newRates);
              } else if (rates) {
                const init: Record<string, string> = {};
                Object.entries(rates).forEach(([k, v]) => { init[k] = String(v); });
                setRateValues(init);
              }
              setEditingRates(!editingRates);
            }}>
              {editingRates ? 'Save Rates' : 'Edit Rates'}
            </button>
          </div>
          {ratesQ.isLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading…</p>
          ) : rates ? (
            <div className="flex flex-wrap gap-4">
              {Object.entries(rates).map(([k, v]) => (
                <div key={k} style={{ textAlign: 'center', minWidth: 100 }}>
                  {editingRates ? (
                    <input
                      type="number"
                      value={rateValues[k] ?? String(v)}
                      onChange={e => setRateValues(prev => ({ ...prev, [k]: e.target.value }))}
                      className="input"
                      style={{ width: 80, textAlign: 'center', fontSize: 18, fontWeight: 700, color: '#d4a853' }}
                    />
                  ) : (
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#d4a853' }}>{v}%</div>
                  )}
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize', marginTop: 4 }}>{k}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No rates configured.</p>
          )}
        </div>

        <div className="glass card p-4">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853', marginBottom: 16 }}>All Affiliates</h3>
          {affiliatesQ.isLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading affiliates…</p>
          ) : affiliates.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No affiliates yet.</p>
          ) : (
            <div className="space-y-2">
              {affiliates.map((aff: unknown, i: number) => {
                const a = aff as Record<string, unknown>;
                return (
                  <div key={a.id as string || i} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb' }}>{String(a.name || a.email || 'Unknown')}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                        {String(a.email || '')} • Referrals: {String(a.totalReferrals || 0)} • Earned: ${(a.totalEarned as number || 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 9999, background: a.status === 'active' ? 'rgba(16,185,129,0.15)' : a.status === 'pending' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)', color: a.status === 'active' ? '#6ee7b7' : a.status === 'pending' ? '#fbbf24' : '#f87171', fontWeight: 600 }}>
                        {String(a.status || 'pending')}
                      </span>
                      {a.status === 'pending' && (
                        <button className="btn" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => updateStatusM.mutate({ id: a.id as string, status: 'active' })}>Approve</button>
                      )}
                      {a.status === 'active' && (
                        <button className="btn" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => updateStatusM.mutate({ id: a.id as string, status: 'suspended' })}>Suspend</button>
                      )}
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
