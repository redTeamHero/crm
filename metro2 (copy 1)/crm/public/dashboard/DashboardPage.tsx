import React from 'react';
import { useDashboardSummary, useConsumers, useLeads, useCalendarEvents } from './hooks.ts';

function StatCard({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: string }) {
  return (
    <div className="glass card p-5" style={{ borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, color, marginBottom: 4 }}>{value}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>{label}</div>
        </div>
        <div style={{ fontSize: 28, opacity: 0.7 }}>{icon}</div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const summaryQ = useDashboardSummary();
  const consumersQ = useConsumers();
  const leadsQ = useLeads();
  const eventsQ = useCalendarEvents();

  const summary = summaryQ.data as Record<string, unknown> | undefined;
  const consumers = (consumersQ.data as { consumers?: unknown[] })?.consumers || [];
  const leads = (leadsQ.data as { leads?: unknown[] })?.leads || [];
  const events = (Array.isArray(eventsQ.data) ? eventsQ.data : (eventsQ.data as { events?: unknown[] })?.events || []) as Array<Record<string, unknown>>;

  const activeClients = consumers.filter(c => (c as Record<string, unknown>).status === 'active').length;
  const newLeads = leads.filter(l => (l as Record<string, unknown>).status === 'new').length;
  const upcomingEvents = events.filter(e => e.start && new Date(e.start as string) > new Date()).slice(0, 5);

  const revenue = summary?.monthlyRevenue ?? summary?.revenue ?? '—';

  const stats = [
    { label: 'Active Clients', value: activeClients || (summary?.activeClients as number) || 0, color: '#6ee7b7', icon: '👥' },
    { label: 'New Leads', value: newLeads || (summary?.newLeads as number) || 0, color: '#818cf8', icon: '🎯' },
    { label: 'Monthly Revenue', value: typeof revenue === 'number' ? `$${revenue.toLocaleString()}` : String(revenue), color: '#d4a853', icon: '💰' },
    { label: 'Disputes Filed', value: (summary?.disputesFiled as number) || 0, color: '#f87171', icon: '📬' },
  ];

  const loading = summaryQ.isLoading && consumersQ.isLoading;

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-5xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">Dashboard</h1>
              <p className="hero-subtitle">Welcome back. Here's a snapshot of your Evolv business at a glance.</p>
            </div>
          </div>
        </section>

        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass card p-5" style={{ height: 90, opacity: 0.4 }} />
            ))
          ) : (
            stats.map(stat => <StatCard key={stat.label} {...stat} />)
          )}
        </div>

        <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="glass card p-4">
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853', marginBottom: 14 }}>Upcoming Events</h3>
            {eventsQ.isLoading ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading…</p>
            ) : upcomingEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No upcoming events.</p>
                <a href="/schedule" style={{ color: '#d4a853', fontSize: 13, textDecoration: 'none' }}>View Schedule →</a>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.map((ev, i) => (
                  <div key={ev.id as string || i} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(212,168,83,0.12)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#d4a853', lineHeight: 1 }}>{ev.start ? new Date(ev.start as string).getDate() : '?'}</div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>{ev.start ? new Date(ev.start as string).toLocaleString('default', { month: 'short' }) : ''}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#e5e7eb' }}>{String(ev.title || 'Event')}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{ev.start ? new Date(ev.start as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                    </div>
                  </div>
                ))}
                <div style={{ textAlign: 'center', paddingTop: 8 }}>
                  <a href="/schedule" style={{ color: '#d4a853', fontSize: 12, textDecoration: 'none' }}>View all →</a>
                </div>
              </div>
            )}
          </div>

          <div className="glass card p-4">
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853', marginBottom: 14 }}>Recent Clients</h3>
            {consumersQ.isLoading ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading…</p>
            ) : consumers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No clients yet.</p>
                <a href="/index" style={{ color: '#d4a853', fontSize: 13, textDecoration: 'none' }}>Add Client →</a>
              </div>
            ) : (
              <div className="space-y-2">
                {consumers.slice(0, 5).map((c: unknown, i: number) => {
                  const client = c as Record<string, unknown>;
                  const statusCol: Record<string, string> = { active: '#6ee7b7', pending: '#fbbf24', completed: '#a5b4fc', paused: '#9ca3af', cancelled: '#f87171' };
                  const col = statusCol[client.status as string] || '#9ca3af';
                  return (
                    <a key={client.id as string || i} href="/index" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', textDecoration: 'none' }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(212,168,83,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#d4a853', flexShrink: 0 }}>
                        {String(client.name || '?')[0]?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(client.name || 'Unknown')}</div>
                        <div style={{ fontSize: 11, color: col, textTransform: 'capitalize' }}>{String(client.status || 'active')}</div>
                      </div>
                      {client.score && <div style={{ fontSize: 14, fontWeight: 700, color: '#d4a853' }}>{String(client.score)}</div>}
                    </a>
                  );
                })}
                {consumers.length > 5 && (
                  <div style={{ textAlign: 'center', paddingTop: 4 }}>
                    <a href="/index" style={{ color: '#d4a853', fontSize: 12, textDecoration: 'none' }}>View all {consumers.length} clients →</a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
          {[
            { href: '/disputes', icon: '📄', label: 'Disputes', desc: 'Run credit analysis & generate letters' },
            { href: '/leads', icon: '🎯', label: 'Leads', desc: 'Track prospects and conversions' },
            { href: '/billing', icon: '💳', label: 'Billing', desc: 'Subscription & billing plans' },
            { href: '/schedule', icon: '📅', label: 'Schedule', desc: 'Appointments & bookings' },
            { href: '/sms', icon: '📱', label: 'SMS', desc: 'Broadcast campaigns' },
            { href: '/letters', icon: '📬', label: 'Letters', desc: 'View generated batches' },
          ].map(link => (
            <a key={link.href} href={link.href} style={{ display: 'block', padding: '16px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', textDecoration: 'none', transition: 'all 0.15s' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{link.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb', marginBottom: 3 }}>{link.label}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>{link.desc}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
