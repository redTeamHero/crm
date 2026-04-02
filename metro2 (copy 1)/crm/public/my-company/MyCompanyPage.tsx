import React, { useState } from 'react';
import { useTeamMembers, useDeleteTeamMember, useCreditCompanies, useCreateCreditCompany, useUpdateCreditCompanyBio, type TeamMember, type CreditCompany } from './hooks.ts';

export function MyCompanyPage() {
  const membersQ = useTeamMembers();
  const deleteM = useDeleteTeamMember();
  const companiesQ = useCreditCompanies();
  const createCompanyM = useCreateCreditCompany();
  const updateBioM = useUpdateCreditCompanyBio();

  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name: '', bio: '' });
  const [editingBio, setEditingBio] = useState<string | null>(null);
  const [bioText, setBioText] = useState('');

  const members: TeamMember[] = (membersQ.data as { members?: TeamMember[] })?.members || (Array.isArray(membersQ.data) ? membersQ.data as TeamMember[] : []);
  const companies: CreditCompany[] = (companiesQ.data as { companies?: CreditCompany[] })?.companies || (Array.isArray(companiesQ.data) ? companiesQ.data as CreditCompany[] : []);

  const handleCopyToken = (token: string) => { navigator.clipboard.writeText(token); };

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-4xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">My Company</h1>
              <p className="hero-subtitle">Manage your team members, invite advisors, and configure your credit company profiles.</p>
            </div>
          </div>
        </section>

        <div className="glass card p-4">
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853', marginBottom: 16 }}>Team Members</h2>
          {membersQ.isLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading team…</p>
          ) : members.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No team members yet.</p>
          ) : (
            <div className="space-y-2">
              {members.map((m: TeamMember) => (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb' }}>{m.name || 'Unnamed'}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{m.email || ''} • {m.role || m.teamRole || 'Member'}</div>
                  </div>
                  <div className="flex gap-2">
                    {m.token && (
                      <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => handleCopyToken(m.token!)}>Copy Token</button>
                    )}
                    <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                      onClick={() => { if (confirm(`Remove ${m.name || 'this member'}?`)) deleteM.mutate(m.id!); }} disabled={deleteM.isPending}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 p-4 rounded-xl" style={{ background: 'rgba(212,168,83,0.06)', border: '1px dashed rgba(212,168,83,0.2)' }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
              To invite a team member, share your referral link or have them sign up directly with your tenant ID.
              Invited members will appear here once they join.
            </p>
          </div>
        </div>

        <div className="glass card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853' }}>Credit Company Profiles</h2>
            <button className="btn" onClick={() => { setCompanyForm({ name: '', bio: '' }); setShowCompanyForm(!showCompanyForm); }}>
              {showCompanyForm ? 'Cancel' : '+ Add Company'}
            </button>
          </div>

          {showCompanyForm && (
            <div className="mb-4 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="space-y-3">
                <div>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Company Name</label>
                  <input className="input w-full" value={companyForm.name} onChange={e => setCompanyForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Bio / Description</label>
                  <textarea className="input w-full" value={companyForm.bio} onChange={e => setCompanyForm(p => ({ ...p, bio: e.target.value }))} rows={3} style={{ resize: 'vertical' }} />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button className="btn" onClick={() => createCompanyM.mutate(companyForm, { onSuccess: () => setShowCompanyForm(false) })} disabled={!companyForm.name || createCompanyM.isPending}>
                  {createCompanyM.isPending ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          )}

          {companiesQ.isLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading companies…</p>
          ) : companies.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No company profiles yet.</p>
          ) : (
            <div className="space-y-3">
              {companies.map((co: CreditCompany) => (
                <div key={co.id} className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#e5e7eb' }}>{co.name}</div>
                    <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }}
                      onClick={() => { setEditingBio(co.id || null); setBioText(co.bio || ''); }}>
                      {editingBio === co.id ? 'Cancel' : 'Edit Bio'}
                    </button>
                  </div>
                  {editingBio === co.id ? (
                    <div>
                      <textarea className="input w-full mb-2" value={bioText} onChange={e => setBioText(e.target.value)} rows={3} style={{ resize: 'vertical' }} />
                      <button className="btn" style={{ fontSize: 12, padding: '5px 14px' }}
                        onClick={() => updateBioM.mutate({ id: co.id!, bio: bioText }, { onSuccess: () => setEditingBio(null) })} disabled={updateBioM.isPending}>
                        {updateBioM.isPending ? 'Saving…' : 'Save Bio'}
                      </button>
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: 0 }}>
                      {co.bio || <em style={{ opacity: 0.5 }}>No bio yet.</em>}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
