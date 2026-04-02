import React, { useState } from 'react';
import { useCalendarEvents, useCreateEvent, useDeleteEvent, useBookings, type CalendarEvent, type Booking } from './hooks.ts';

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const EVENT_TYPES = ['appointment', 'follow-up', 'consultation', 'call', 'other'];

export function SchedulePage() {
  const eventsQ = useCalendarEvents();
  const bookingsQ = useBookings();
  const createM = useCreateEvent();
  const deleteM = useDeleteEvent();

  const [tab, setTab] = useState<'calendar' | 'bookings'>('calendar');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<CalendarEvent>>({ title: '', type: 'appointment', allDay: false, description: '' });
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');

  const events: CalendarEvent[] = Array.isArray(eventsQ.data) ? eventsQ.data : ((eventsQ.data as { events?: CalendarEvent[] })?.events || []);
  const bookings: Booking[] = Array.isArray(bookingsQ.data) ? bookingsQ.data : ((bookingsQ.data as { bookings?: Booking[] })?.bookings || []);

  const handleCreate = async () => {
    if (!form.title || !startDate) return;
    const start = startTime ? `${startDate}T${startTime}:00` : `${startDate}T00:00:00`;
    const end = endDate ? (endTime ? `${endDate}T${endTime}:00` : `${endDate}T23:59:00`) : start;
    await createM.mutateAsync({ ...form, start, end });
    setForm({ title: '', type: 'appointment', allDay: false, description: '' });
    setStartDate(''); setStartTime(''); setEndDate(''); setEndTime('');
    setShowForm(false);
  };

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-4xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">Schedule</h1>
              <p className="hero-subtitle">Manage appointments, track bookings, and keep your calendar organized.</p>
            </div>
            <button className="btn" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : '+ New Event'}
            </button>
          </div>
        </section>

        {showForm && (
          <div className="glass card p-4">
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb', marginBottom: 14 }}>New Calendar Event</h3>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Title</label>
                <input className="input w-full" value={form.title || ''} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Consultation with John Smith" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Type</label>
                <select className="input w-full" value={form.type || 'appointment'} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                  {EVENT_TYPES.map(t => <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Start Date</label>
                <input type="date" className="input w-full" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Start Time</label>
                <input type="time" className="input w-full" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>End Date</label>
                <input type="date" className="input w-full" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>End Time</label>
                <input type="time" className="input w-full" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Notes</label>
                <textarea className="input w-full" value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn" onClick={handleCreate} disabled={!form.title || !startDate || createM.isPending}>
                {createM.isPending ? 'Creating…' : 'Create Event'}
              </button>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="glass card">
          <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {[{ id: 'calendar' as const, label: 'Events' }, { id: 'bookings' as const, label: 'Bookings' }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ flex: 1, padding: '14px 0', fontSize: 14, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', color: tab === t.id ? '#d4a853' : 'rgba(255,255,255,0.5)', borderBottom: tab === t.id ? '2px solid #d4a853' : 'none' }}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {tab === 'calendar' ? (
              eventsQ.isLoading ? (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading events…</p>
              ) : events.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ fontSize: 44, marginBottom: 12 }}>📅</div>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No events scheduled.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {events.map((ev: CalendarEvent) => (
                    <div key={ev.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb', marginBottom: 3 }}>{ev.title}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                          {ev.start ? formatDate(ev.start) : 'No date'} {ev.type && `• ${ev.type}`}
                        </div>
                        {ev.description && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{ev.description}</div>}
                      </div>
                      <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                        onClick={() => { if (confirm('Delete event?')) deleteM.mutate(ev.id!); }} disabled={deleteM.isPending}>
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : (
              bookingsQ.isLoading ? (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading bookings…</p>
              ) : bookings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ fontSize: 44, marginBottom: 12 }}>📋</div>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No bookings yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {bookings.map((b: Booking, i: number) => (
                    <div key={b.id || i} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb', marginBottom: 3 }}>{b.clientName || 'Guest'}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                          {[b.email, b.phone].filter(Boolean).join(' • ')}
                          {b.date && ` • ${b.date} ${b.time || ''}`}
                        </div>
                        {b.notes && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{b.notes}</div>}
                      </div>
                      {b.status && (
                        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 9999, background: b.status === 'confirmed' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: b.status === 'confirmed' ? '#6ee7b7' : '#fbbf24', fontWeight: 600 }}>
                          {b.status}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
