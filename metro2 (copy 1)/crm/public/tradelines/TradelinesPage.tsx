import React from 'react';
import { useTradelines, useTradelinesProviders } from './hooks.ts';

export function TradelinesPage() {
  const tradelinesQ = useTradelines();
  const providersQ = useTradelinesProviders();

  const tradelines = (tradelinesQ.data as { tradelines?: unknown[] })?.tradelines || [];
  const providers = (providersQ.data as { providers?: unknown[] })?.providers || [];

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-4xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">Tradelines</h1>
              <p className="hero-subtitle">
                Connect clients to authorized user tradelines to rapidly boost scores through positive credit history.
              </p>
            </div>
          </div>
        </section>

        {providers.length > 0 && (
          <div className="glass card p-4">
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853', marginBottom: 16 }}>Tradeline Providers</h3>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))' }}>
              {providers.map((p: unknown, i: number) => {
                const prov = p as Record<string, unknown>;
                return (
                  <div key={prov.id as string || i} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#e5e7eb', marginBottom: 4 }}>{String(prov.name || 'Provider')}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>{String(prov.description || '')}</div>
                    {prov.url && (
                      <a href={String(prov.url)} target="_blank" rel="noopener noreferrer" className="btn" style={{ fontSize: 12, padding: '5px 14px' }}>View Provider</a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="glass card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853' }}>Active Tradeline Orders</h3>
          </div>

          {tradelinesQ.isLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading tradelines…</p>
          ) : tradelines.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>💳</div>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No tradeline orders yet.</p>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 4 }}>Connect with a tradeline provider above to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tradelines.map((t: unknown, i: number) => {
                const tl = t as Record<string, unknown>;
                return (
                  <div key={tl.id as string || i} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb' }}>{String(tl.clientName || tl.consumerId || 'Client')}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                        Provider: {String(tl.provider || '—')} • Limit: ${String(tl.creditLimit || '—')} • Age: {String(tl.accountAge || '—')}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 9999, background: tl.status === 'active' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: tl.status === 'active' ? '#6ee7b7' : '#fbbf24', fontWeight: 600 }}>
                      {String(tl.status || 'pending')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="glass card p-6" style={{ background: 'linear-gradient(135deg,rgba(212,168,83,0.06),rgba(212,168,83,0.02))', border: '1px solid rgba(212,168,83,0.15)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#d4a853', marginBottom: 8 }}>About Authorized User Tradelines</h3>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
            Adding a client as an authorized user on a positive, aged credit account can rapidly improve their credit score.
            This strategy is 100% legal under the Fair Credit Reporting Act and is commonly used in credit repair.
            Always use reputable providers and ensure accounts meet bureau reporting requirements.
          </p>
        </div>
      </div>
    </div>
  );
}
