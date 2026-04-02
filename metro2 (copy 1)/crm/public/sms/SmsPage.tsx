import React, { useState } from 'react';
import {
  useSmsGroups, useCreateSmsGroup, useDeleteSmsGroup,
  useSmsTemplates, useCreateSmsTemplate, useDeleteSmsTemplate,
  useSmsCampaigns, useCreateSmsCampaign, useDeleteSmsCampaign,
  useSendSms, useSmsHistory,
  type SmsGroup, type SmsTemplate, type SmsCampaign,
} from './hooks.ts';

type SmsTab = 'send' | 'groups' | 'templates' | 'campaigns' | 'history';

export function SmsPage() {
  const [tab, setTab] = useState<SmsTab>('send');
  const groupsQ = useSmsGroups();
  const templatesQ = useSmsTemplates();
  const campaignsQ = useSmsCampaigns();
  const historyQ = useSmsHistory();
  const createGroupM = useCreateSmsGroup();
  const deleteGroupM = useDeleteSmsGroup();
  const createTemplateM = useCreateSmsTemplate();
  const deleteTemplateM = useDeleteSmsTemplate();
  const createCampaignM = useCreateSmsCampaign();
  const deleteCampaignM = useDeleteSmsCampaign();
  const sendM = useSendSms();

  const [sendForm, setSendForm] = useState({ to: '', body: '', recipientType: 'individual' });
  const [groupForm, setGroupForm] = useState({ name: '', description: '' });
  const [templateForm, setTemplateForm] = useState({ title: '', body: '', segment: 'all' });
  const [campaignForm, setCampaignForm] = useState({ name: '', groupId: '', templateId: '', scheduledAt: '' });
  const [showForm, setShowForm] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  const groups: SmsGroup[] = (groupsQ.data as { groups?: SmsGroup[] })?.groups || (Array.isArray(groupsQ.data) ? groupsQ.data as SmsGroup[] : []);
  const templates: SmsTemplate[] = (templatesQ.data as { templates?: SmsTemplate[] })?.templates || (Array.isArray(templatesQ.data) ? templatesQ.data as SmsTemplate[] : []);
  const campaigns: SmsCampaign[] = (campaignsQ.data as { campaigns?: SmsCampaign[] })?.campaigns || (Array.isArray(campaignsQ.data) ? campaignsQ.data as SmsCampaign[] : []);
  const history: unknown[] = (historyQ.data as { history?: unknown[] })?.history || (Array.isArray(historyQ.data) ? historyQ.data : []);

  const tabs: { id: SmsTab; label: string }[] = [
    { id: 'send', label: 'Send SMS' }, { id: 'groups', label: 'Groups' },
    { id: 'templates', label: 'Templates' }, { id: 'campaigns', label: 'Campaigns' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-4xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">SMS</h1>
              <p className="hero-subtitle">Send individual messages, manage contact groups, and run SMS campaigns to leads and clients.</p>
            </div>
          </div>
        </section>

        <div className="glass card">
          <div className="flex overflow-x-auto" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setShowForm(false); }}
                style={{ padding: '14px 20px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', color: tab === t.id ? '#d4a853' : 'rgba(255,255,255,0.5)', borderBottom: tab === t.id ? '2px solid #d4a853' : '2px solid transparent' }}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {tab === 'send' && (
              <div className="space-y-4">
                {sendSuccess && <div className="p-3 rounded-lg" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', fontSize: 14 }}>✓ SMS sent successfully!</div>}
                <div>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Recipient Type</label>
                  <select className="input" value={sendForm.recipientType} onChange={e => setSendForm(p => ({ ...p, recipientType: e.target.value }))}>
                    <option value="individual">Individual Number</option>
                    <option value="group">Contact Group</option>
                    <option value="all_leads">All Leads</option>
                    <option value="all_clients">All Clients</option>
                  </select>
                </div>
                {sendForm.recipientType === 'individual' ? (
                  <div>
                    <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Phone Number</label>
                    <input className="input w-full" value={sendForm.to} onChange={e => setSendForm(p => ({ ...p, to: e.target.value }))} placeholder="+15551234567" />
                  </div>
                ) : (
                  <div>
                    <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Select Template</label>
                    <select className="input w-full" onChange={e => { const t = templates.find(t => t.id === e.target.value); if (t) setSendForm(p => ({ ...p, body: t.body || '' })); }}>
                      <option value="">— Select template —</option>
                      {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Message</label>
                  <textarea className="input w-full" value={sendForm.body} onChange={e => setSendForm(p => ({ ...p, body: e.target.value }))} rows={4} style={{ resize: 'vertical' }} placeholder="Type your message… Use {name} for merge fields." />
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                    {sendForm.body.length} characters {sendForm.body.length > 160 ? `(${Math.ceil(sendForm.body.length / 160)} segments)` : '(1 segment)'}
                  </div>
                </div>
                <button className="btn" onClick={() =>
                  sendM.mutate({ body: sendForm.body, to: sendForm.to, recipientType: sendForm.recipientType }, {
                    onSuccess: () => { setSendSuccess(true); setSendForm(p => ({ ...p, to: '', body: '' })); setTimeout(() => setSendSuccess(false), 3000); }
                  })
                } disabled={!sendForm.body || sendM.isPending} style={{ padding: '10px 24px' }}>
                  {sendM.isPending ? 'Sending…' : 'Send Message'}
                </button>
              </div>
            )}

            {tab === 'groups' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{groups.length} group{groups.length !== 1 ? 's' : ''}</span>
                  <button className="btn" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ New Group'}</button>
                </div>
                {showForm && (
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 2fr' }}>
                      <div>
                        <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Group Name</label>
                        <input className="input w-full" value={groupForm.name} onChange={e => setGroupForm(p => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Description</label>
                        <input className="input w-full" value={groupForm.description} onChange={e => setGroupForm(p => ({ ...p, description: e.target.value }))} />
                      </div>
                    </div>
                    <button className="btn mt-3" onClick={() => createGroupM.mutate(groupForm, { onSuccess: () => { setShowForm(false); setGroupForm({ name: '', description: '' }); } })} disabled={!groupForm.name || createGroupM.isPending}>
                      Create Group
                    </button>
                  </div>
                )}
                {groupsQ.isLoading ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading…</p> :
                  groups.map((g: SmsGroup) => (
                    <div key={g.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb' }}>{g.name}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{g.description || ''} • {g.memberCount || 0} members</div>
                      </div>
                      <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                        onClick={() => { if (confirm('Delete group?')) deleteGroupM.mutate(g.id!); }}>Delete</button>
                    </div>
                  ))
                }
              </div>
            )}

            {tab === 'templates' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{templates.length} template{templates.length !== 1 ? 's' : ''}</span>
                  <button className="btn" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ New Template'}</button>
                </div>
                {showForm && (
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="space-y-3">
                      <div><label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Title</label>
                        <input className="input w-full" value={templateForm.title} onChange={e => setTemplateForm(p => ({ ...p, title: e.target.value }))} /></div>
                      <div><label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Message Body</label>
                        <textarea className="input w-full" value={templateForm.body} onChange={e => setTemplateForm(p => ({ ...p, body: e.target.value }))} rows={3} style={{ resize: 'vertical' }} placeholder="Hi {name}, …" /></div>
                    </div>
                    <button className="btn mt-3" onClick={() => createTemplateM.mutate(templateForm, { onSuccess: () => { setShowForm(false); setTemplateForm({ title: '', body: '', segment: 'all' }); } })} disabled={!templateForm.title || !templateForm.body || createTemplateM.isPending}>
                      Create Template
                    </button>
                  </div>
                )}
                {templatesQ.isLoading ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading…</p> :
                  templates.length === 0 ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No templates yet.</p> :
                  templates.map((t: SmsTemplate) => (
                    <div key={t.id} className="flex items-start justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb', marginBottom: 4 }}>{t.title}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{t.body}</div>
                      </div>
                      <button className="btn ml-4 shrink-0" style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                        onClick={() => { if (confirm('Delete template?')) deleteTemplateM.mutate(t.id!); }}>Delete</button>
                    </div>
                  ))
                }
              </div>
            )}

            {tab === 'campaigns' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}</span>
                  <button className="btn" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ New Campaign'}</button>
                </div>
                {showForm && (
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
                      <div><label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Name</label>
                        <input className="input w-full" value={campaignForm.name} onChange={e => setCampaignForm(p => ({ ...p, name: e.target.value }))} /></div>
                      <div><label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Group</label>
                        <select className="input w-full" value={campaignForm.groupId} onChange={e => setCampaignForm(p => ({ ...p, groupId: e.target.value }))}>
                          <option value="">All contacts</option>
                          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select></div>
                      <div><label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Template</label>
                        <select className="input w-full" value={campaignForm.templateId} onChange={e => setCampaignForm(p => ({ ...p, templateId: e.target.value }))}>
                          <option value="">— Select template —</option>
                          {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                        </select></div>
                    </div>
                    <button className="btn mt-3" onClick={() => createCampaignM.mutate(campaignForm, { onSuccess: () => { setShowForm(false); setCampaignForm({ name: '', groupId: '', templateId: '', scheduledAt: '' }); } })} disabled={!campaignForm.name || createCampaignM.isPending}>
                      Create Campaign
                    </button>
                  </div>
                )}
                {campaignsQ.isLoading ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading…</p> :
                  campaigns.length === 0 ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No campaigns yet.</p> :
                  campaigns.map((c: SmsCampaign) => (
                    <div key={c.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb' }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{c.status || 'draft'}{c.scheduledAt ? ` • ${c.scheduledAt}` : ''}</div>
                      </div>
                      <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                        onClick={() => { if (confirm('Delete campaign?')) deleteCampaignM.mutate(c.id!); }}>Delete</button>
                    </div>
                  ))
                }
              </div>
            )}

            {tab === 'history' && (
              historyQ.isLoading ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading…</p> :
              history.length === 0 ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No SMS history yet.</p> :
              <div className="space-y-2">
                {history.map((h: unknown, i: number) => {
                  const msg = h as Record<string, unknown>;
                  return (
                    <div key={msg.id as string || i} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div>
                        <div style={{ fontSize: 13, color: '#e5e7eb', marginBottom: 2 }}>{String(msg.body || msg.message || '')}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{String(msg.to || msg.recipient || '')} • {String(msg.createdAt || msg.sentAt || '')}</div>
                      </div>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: msg.status === 'delivered' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: msg.status === 'delivered' ? '#6ee7b7' : '#fbbf24', fontWeight: 600 }}>
                        {String(msg.status || 'sent')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
