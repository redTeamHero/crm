import React, { useState } from 'react';
import { useEducationProgress, useEducationLessons } from './hooks.ts';

const TRACKS = [
  { id: 'crm', label: 'CRM Mastery', icon: '🎯', color: '#7c3aed', desc: 'Master the tools and workflows to run a professional credit repair business.' },
  { id: 'expert', label: 'Credit Expert', icon: '🏆', color: '#d4a853', desc: 'Deep-dive into FCRA, Metro 2, and advanced dispute strategies.' },
  { id: 'intermediate', label: 'Credit Fundamentals', icon: '📚', color: '#0ea5e9', desc: 'Understand credit scoring, reports, and the dispute process.' },
];

const STATIC_LESSONS = [
  { id: 'l1', title: 'Introduction to Metro 2 Format', track: 'expert', duration: '12 min', type: 'video' },
  { id: 'l2', title: 'FCRA Section 611 Deep Dive', track: 'expert', duration: '18 min', type: 'video' },
  { id: 'l3', title: 'Reading a Credit Report', track: 'intermediate', duration: '8 min', type: 'article' },
  { id: 'l4', title: 'Client Onboarding Workflow', track: 'crm', duration: '10 min', type: 'video' },
  { id: 'l5', title: 'NEPQ Sales Script Basics', track: 'crm', duration: '15 min', type: 'video' },
  { id: 'l6', title: 'Understanding Credit Scores', track: 'intermediate', duration: '6 min', type: 'article' },
  { id: 'l7', title: 'Advanced Dispute Techniques', track: 'expert', duration: '22 min', type: 'video' },
  { id: 'l8', title: 'Building Recurring Revenue', track: 'crm', duration: '14 min', type: 'video' },
];

export function EducationPage() {
  const [activeTrack, setActiveTrack] = useState<string>('crm');
  const lessonsQ = useEducationLessons();

  const lessons = (lessonsQ.data as { lessons?: typeof STATIC_LESSONS })?.lessons || STATIC_LESSONS;
  const filtered = lessons.filter(l => l.track === activeTrack);

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-3xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">Credit Academy</h1>
              <p className="hero-subtitle">Master credit repair, grow your business, and become the expert your clients need.</p>
            </div>
          </div>
        </section>

        <div className="glass card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: '#d4a853' }}>Learning Tracks</h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
            {TRACKS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTrack(t.id)}
                className="text-left rounded-xl p-4 transition-all"
                style={{
                  background: activeTrack === t.id ? `${t.color}22` : 'rgba(255,255,255,0.03)',
                  border: `1.5px solid ${activeTrack === t.id ? t.color + '66' : 'rgba(255,255,255,0.07)'}`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>{t.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: activeTrack === t.id ? t.color : '#e5e7eb', marginBottom: 4 }}>{t.label}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="glass card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: '#d4a853' }}>
            {TRACKS.find(t => t.id === activeTrack)?.label} — Lessons
          </h2>
          {lessonsQ.isLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading lessons…</p>
          ) : filtered.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No lessons in this track yet.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((lesson, i) => (
                <div key={lesson.id || i} className="flex items-center justify-between rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center gap-3">
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(212,168,83,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                      {lesson.type === 'video' ? '▶' : '📄'}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb' }}>{lesson.title}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{lesson.duration} • {lesson.type}</div>
                    </div>
                  </div>
                  <button className="btn" style={{ fontSize: 12, padding: '4px 12px' }}>Start</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
