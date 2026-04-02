import React, { useState } from 'react';
import { useWorkflowsConfig, useUpdateWorkflowConfig } from './hooks.ts';

interface WorkflowToggle {
  key: string;
  label: string;
  description: string;
  category: string;
}

const WORKFLOW_DEFINITIONS: WorkflowToggle[] = [
  { key: 'welcomeEmail', label: 'Welcome Email', description: 'Send a welcome email when a new client is added.', category: 'Onboarding' },
  { key: 'reportUploadAlert', label: 'Report Upload Alert', description: 'Notify the team when a client uploads a new credit report.', category: 'Onboarding' },
  { key: 'disputeGenerated', label: 'Dispute Generated', description: 'Alert the client when dispute letters are ready.', category: 'Disputes' },
  { key: 'roundComplete', label: 'Round Complete', description: 'Celebrate with the client when a dispute round is finalized.', category: 'Disputes' },
  { key: 'invoiceDue', label: 'Invoice Due Reminder', description: 'Send a payment reminder 3 days before invoice due date.', category: 'Billing' },
  { key: 'paymentReceived', label: 'Payment Received', description: 'Send a payment confirmation when an invoice is paid.', category: 'Billing' },
  { key: 'leadFollowUp', label: 'Lead Follow-Up', description: 'Automatically follow up with leads after 48 hours of no activity.', category: 'Marketing' },
  { key: 'scoreImprovement', label: 'Score Improvement Alert', description: 'Celebrate when a client\'s score improves significantly.', category: 'Milestones' },
  { key: 'annualReview', label: 'Annual Review Reminder', description: 'Remind clients to schedule their annual credit review.', category: 'Milestones' },
];

export function WorkflowsPage() {
  const configQ = useWorkflowsConfig();
  const updateM = useUpdateWorkflowConfig();
  const [saving, setSaving] = useState<string | null>(null);

  const config = (configQ.data as Record<string, unknown>) || {};

  const toggle = async (key: string) => {
    setSaving(key);
    const newVal = !config[key];
    await updateM.mutateAsync({ [key]: newVal });
    setSaving(null);
  };

  const categories = [...new Set(WORKFLOW_DEFINITIONS.map(w => w.category))];

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-3xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">Workflow Automation</h1>
              <p className="hero-subtitle">Configure automated actions that trigger when clients hit milestones, pay invoices, or need follow-up.</p>
            </div>
          </div>
        </section>

        {configQ.isLoading ? (
          <div className="glass card p-6">
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading workflow configuration…</p>
          </div>
        ) : (
          categories.map(cat => (
            <div key={cat} className="glass card p-4">
              <h3 style={{ fontSize: 12, fontWeight: 700, color: '#d4a853', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>{cat}</h3>
              <div className="space-y-3">
                {WORKFLOW_DEFINITIONS.filter(w => w.category === cat).map(workflow => (
                  <div key={workflow.key} className="flex items-start gap-4 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb', marginBottom: 3 }}>{workflow.label}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>{workflow.description}</div>
                    </div>
                    <button
                      onClick={() => toggle(workflow.key)}
                      disabled={saving === workflow.key}
                      style={{
                        flexShrink: 0,
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        background: config[workflow.key] ? '#d4a853' : 'rgba(255,255,255,0.12)',
                        border: 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'background 0.2s',
                        opacity: saving === workflow.key ? 0.5 : 1,
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: 3,
                        left: config[workflow.key] ? 22 : 3,
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.2s',
                      }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
