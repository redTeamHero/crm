import React, { useState } from 'react';
import { useAffiliateMe, useAffiliatePayouts, useCommissionRates, useJoinAffiliate, useCancelPayout, useRequestPayout } from './hooks.ts';

export function AffiliatePage() {
  const meQ = useAffiliateMe();
  const payoutsQ = useAffiliatePayouts();
  const ratesQ = useCommissionRates();
  const joinM = useJoinAffiliate();
  const cancelM = useCancelPayout();
  const requestM = useRequestPayout();
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('bank');

  const me = meQ.data as Record<string, unknown> | undefined;
  const payouts = (payoutsQ.data as { payouts?: unknown[] })?.payouts || [];
  const rates = ratesQ.data as Record<string, number> | undefined;

  const isAffiliate = !!me?.id;

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-3xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">Affiliate Program</h1>
              <p className="hero-subtitle">Earn commissions by referring new users to Evolv. Track your earnings and request payouts.</p>
            </div>
          </div>
        </section>

        {!isAffiliate ? (
          <div className="glass card p-8 text-center">
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#e5e7eb', marginBottom: 8 }}>Join the Affiliate Program</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
              Share your unique referral link. Earn commissions on every paid subscription you bring in.
            </p>
            {rates && (
              <div className="flex justify-center gap-6 mb-6">
                {Object.entries(rates).map(([k, v]) => (
                  <div key={k} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#d4a853' }}>{v}%</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize' }}>{k}</div>
                  </div>
                ))}
              </div>
            )}
            <button
              className="btn"
              onClick={() => joinM.mutate()}
              disabled={joinM.isPending || meQ.isLoading}
            >
              {joinM.isPending ? 'Joining…' : 'Join Affiliate Program'}
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
              {[
                { label: 'Total Earned', value: `$${(me.totalEarned as number || 0).toFixed(2)}`, color: '#d4a853' },
                { label: 'Pending', value: `$${(me.pendingAmount as number || 0).toFixed(2)}`, color: '#6ee7b7' },
                { label: 'Total Referrals', value: String(me.totalReferrals || 0), color: '#818cf8' },
              ].map(stat => (
                <div key={stat.label} className="glass card p-4">
                  <div style={{ fontSize: 24, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {me.referralLink && (
              <div className="glass card p-4">
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853', marginBottom: 12 }}>Your Referral Link</h3>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={String(me.referralLink)}
                    className="input flex-1"
                    style={{ fontSize: 13, fontFamily: 'monospace' }}
                  />
                  <button className="btn" onClick={() => navigator.clipboard.writeText(String(me.referralLink))}>Copy</button>
                </div>
              </div>
            )}

            <div className="glass card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853' }}>Payout History</h3>
                <button className="btn" onClick={() => setShowPayoutForm(!showPayoutForm)}>Request Payout</button>
              </div>

              {showPayoutForm && (
                <div className="mb-4 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex gap-3 flex-wrap">
                    <input
                      type="number"
                      placeholder="Amount ($)"
                      value={payoutAmount}
                      onChange={e => setPayoutAmount(e.target.value)}
                      className="input"
                      style={{ width: 140 }}
                    />
                    <select value={payoutMethod} onChange={e => setPayoutMethod(e.target.value)} className="input" style={{ width: 140 }}>
                      <option value="bank">Bank Transfer</option>
                      <option value="paypal">PayPal</option>
                      <option value="check">Check</option>
                    </select>
                    <button
                      className="btn"
                      onClick={() => {
                        const amt = parseFloat(payoutAmount);
                        if (isNaN(amt) || amt <= 0) return;
                        requestM.mutate({ amount: amt, method: payoutMethod });
                        setShowPayoutForm(false);
                        setPayoutAmount('');
                      }}
                      disabled={requestM.isPending}
                    >
                      Submit
                    </button>
                  </div>
                </div>
              )}

              {payoutsQ.isLoading ? (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading payouts…</p>
              ) : payouts.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No payouts yet.</p>
              ) : (
                <div className="space-y-2">
                  {payouts.map((p: unknown, i: number) => {
                    const payout = p as Record<string, unknown>;
                    return (
                      <div key={payout.id as string || i} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb' }}>${(payout.amount as number || 0).toFixed(2)}</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{String(payout.method || 'Bank')} • {String(payout.createdAt || '')}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 9999, background: payout.status === 'completed' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: payout.status === 'completed' ? '#6ee7b7' : '#fbbf24', fontWeight: 600 }}>
                            {String(payout.status || 'pending')}
                          </span>
                          {payout.status === 'pending' && (
                            <button className="btn" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => cancelM.mutate(payout.id as string)}>Cancel</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
