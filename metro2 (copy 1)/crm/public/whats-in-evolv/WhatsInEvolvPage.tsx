import React from 'react';

const features = [
  { icon: '🤖', title: 'AI Credit Audit', desc: 'Instantly scan any credit report for Metro 2 violations, inaccurate balances, and FCRA discrepancies.', tier: 'Pro CRM' },
  { icon: '📬', title: 'Dispute Letter Generator', desc: 'One-click certified dispute letters tailored to each bureau and creditor based on their specific violations.', tier: 'Pro CRM' },
  { icon: '👥', title: 'Client Management', desc: 'Full CRM for managing unlimited clients, tracking status, uploading reports, and monitoring progress.', tier: 'Pro CRM' },
  { icon: '📊', title: 'Dashboard & KPIs', desc: 'Real-time metrics on active clients, revenue, disputes filed, and success rates at a glance.', tier: 'Pro CRM' },
  { icon: '📅', title: 'Schedule & Calendar', desc: 'Built-in scheduling with booking pages, calendar sync, and automated appointment reminders.', tier: 'Pro CRM' },
  { icon: '💌', title: 'SMS & Email Marketing', desc: 'Broadcast compliant outreach campaigns to leads and clients with built-in merge fields and templates.', tier: 'Pro CRM' },
  { icon: '📑', title: 'Letter Library', desc: 'Customizable dispute letter templates, client service agreements, and educational content sequences.', tier: 'Pro CRM' },
  { icon: '⚙️', title: 'Workflow Automation', desc: 'Trigger follow-up actions automatically when clients hit key milestones or statuses change.', tier: 'Pro CRM' },
  { icon: '💳', title: 'Billing & Invoicing', desc: 'Stripe-powered billing with recurring plans, automated reminders, and client invoice tracking.', tier: 'Pro CRM' },
  { icon: '🏦', title: 'Tradelines', desc: 'Manage tradeline orders and connect clients to authorized user tradelines for rapid score improvement.', tier: 'Pro CRM' },
  { icon: '🎓', title: 'Credit Academy', desc: 'Teach your clients with built-in lessons, quizzes, and educational tracks inside the client portal.', tier: 'Both' },
  { icon: '🔗', title: 'Affiliate Program', desc: 'Invite referral partners, track commissions, and manage payouts directly from your dashboard.', tier: 'Pro CRM' },
  { icon: '📣', title: 'CFPB Complaint Assistant', desc: 'Guide clients through CFPB complaint submissions with pre-filled forms and proof attachment tools.', tier: 'Pro CRM' },
  { icon: '📱', title: 'Client Portal', desc: 'Branded self-service portal where clients track progress, view letters, and complete educational modules.', tier: 'Both' },
  { icon: '🔐', title: 'Multi-User Access', desc: 'Invite team members with role-based permissions so advisors, analysts, and admins each see what they need.', tier: 'Pro CRM' },
  { icon: '📊', title: 'Facebook Ad Manager', desc: 'Launch and monitor Facebook lead-gen campaigns directly from your CRM without leaving the platform.', tier: 'Pro CRM' },
];

export function WhatsInEvolvPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#312e81 100%)', color: '#fff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 18px', borderRadius: 9999, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c4b5fd', marginBottom: 24 }}>
            Every Feature, Plain English
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,52px)', fontWeight: 800, margin: '0 0 16px', lineHeight: 1.1 }}>
            What's Inside <span style={{ background: 'linear-gradient(135deg,#a78bfa,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Evolv</span>
          </h1>
          <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.6)', maxWidth: 600, margin: '0 auto' }}>
            A complete credit repair operating system — from AI audits to client portals — built for professional credit repair businesses.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 20 }}>
          {features.map((f) => (
            <div key={f.title} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '20px 22px', display: 'flex', gap: 16, alignItems: 'flex-start', transition: 'border-color 0.2s' }}>
              <div style={{ width: 44, height: 44, borderRadius: 11, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                {f.icon}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{f.title}</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 9999, background: f.tier === 'Both' ? 'rgba(16,185,129,0.15)' : 'rgba(139,92,246,0.15)', color: f.tier === 'Both' ? '#6ee7b7' : '#c4b5fd', fontWeight: 700, letterSpacing: '0.05em' }}>
                    {f.tier}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.55 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 56 }}>
          <a href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 32px', borderRadius: 12, background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 15 }}>
            Go to Dashboard →
          </a>
        </div>
      </div>
    </div>
  );
}
