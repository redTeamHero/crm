import React, { useState } from 'react';
import { useFacebookAds, useFacebookPages, useCreateFacebookAd, usePauseFacebookAd } from './hooks.ts';

export function FacebookManagerPage() {
  const adsQ = useFacebookAds();
  const pagesQ = useFacebookPages();
  const createM = useCreateFacebookAd();
  const pauseM = usePauseFacebookAd();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', objective: 'LEAD_GENERATION', budget: '', pageId: '' });

  const ads = (adsQ.data as { ads?: unknown[] })?.ads || (Array.isArray(adsQ.data) ? adsQ.data : []);
  const pages = (pagesQ.data as { pages?: unknown[] })?.pages || (Array.isArray(pagesQ.data) ? pagesQ.data : []);

  const isConnected = !adsQ.error || pages.length > 0;

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-4xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">Facebook Ad Manager</h1>
              <p className="hero-subtitle">Launch and monitor Facebook lead generation campaigns directly from your Evolv dashboard.</p>
            </div>
            {isConnected && (
              <button className="btn" onClick={() => setShowForm(!showForm)}>
                {showForm ? 'Cancel' : '+ New Ad'}
              </button>
            )}
          </div>
        </section>

        {!isConnected && (
          <div className="glass card p-8 text-center">
            <div style={{ fontSize: 48, marginBottom: 16 }}>📘</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e5e7eb', marginBottom: 8 }}>Connect Facebook</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, maxWidth: 400, margin: '0 auto 24px' }}>
              Link your Facebook Business account to launch lead generation ads and track performance from this dashboard.
            </p>
            <a href="/settings" className="btn" style={{ textDecoration: 'none' }}>Go to Settings to Connect</a>
          </div>
        )}

        {isConnected && showForm && (
          <div className="glass card p-4">
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb', marginBottom: 14 }}>Create New Ad Campaign</h3>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Campaign Name</label>
                <input className="input w-full" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Credit Repair Leads — Q1" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Objective</label>
                <select className="input w-full" value={form.objective} onChange={e => setForm(p => ({ ...p, objective: e.target.value }))}>
                  <option value="LEAD_GENERATION">Lead Generation</option>
                  <option value="MESSAGES">Messages</option>
                  <option value="REACH">Reach</option>
                  <option value="CONVERSIONS">Conversions</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Daily Budget ($)</label>
                <input type="number" className="input w-full" value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} placeholder="25.00" />
              </div>
              {pages.length > 0 && (
                <div>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Facebook Page</label>
                  <select className="input w-full" value={form.pageId} onChange={e => setForm(p => ({ ...p, pageId: e.target.value }))}>
                    <option value="">— Select page —</option>
                    {pages.map((page: unknown) => {
                      const p = page as Record<string, unknown>;
                      return <option key={p.id as string} value={p.id as string}>{String(p.name || p.id)}</option>;
                    })}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn" disabled={!form.name || !form.budget || createM.isPending}
                onClick={() => createM.mutate({ name: form.name, objective: form.objective, dailyBudget: parseFloat(form.budget), pageId: form.pageId }, { onSuccess: () => setShowForm(false) })}>
                {createM.isPending ? 'Creating…' : 'Create Campaign'}
              </button>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        {isConnected && (
          <div className="glass card p-4">
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853', marginBottom: 14 }}>Active Campaigns</h3>
            {adsQ.isLoading ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading campaigns…</p>
            ) : ads.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>📊</div>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No campaigns yet. Create your first ad above.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ads.map((ad: unknown, i: number) => {
                  const a = ad as Record<string, unknown>;
                  return (
                    <div key={a.id as string || i} className="flex items-start justify-between p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ flex: 1 }}>
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span style={{ fontSize: 15, fontWeight: 600, color: '#e5e7eb' }}>{String(a.name || 'Campaign')}</span>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: a.status === 'ACTIVE' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: a.status === 'ACTIVE' ? '#6ee7b7' : '#fbbf24', fontWeight: 600 }}>
                            {String(a.status || 'PAUSED')}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(100px,1fr))', gap: 12 }}>
                          {[
                            { label: 'Spend', value: `$${String(a.spend || '0')}` },
                            { label: 'Reach', value: String(a.reach || '0') },
                            { label: 'Leads', value: String(a.leads || '0') },
                            { label: 'CPL', value: a.costPerLead ? `$${String(a.costPerLead)}` : '—' },
                          ].map(stat => (
                            <div key={stat.label} style={{ fontSize: 13 }}>
                              <div style={{ fontWeight: 600, color: '#e5e7eb' }}>{stat.value}</div>
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{stat.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4 shrink-0">
                        {a.status === 'ACTIVE' && (
                          <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => pauseM.mutate(a.id as string)} disabled={pauseM.isPending}>Pause</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
