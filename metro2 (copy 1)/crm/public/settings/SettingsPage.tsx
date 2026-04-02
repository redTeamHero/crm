import React, { useState, useEffect } from 'react';
import { useSettings, useUpdateSettings, useUsers, useCollectorAddresses, useAddCollectorAddress, useDeleteCollectorAddress } from './hooks.ts';

export function SettingsPage() {
  const settingsQ = useSettings();
  const usersQ = useUsers();
  const addressesQ = useCollectorAddresses();
  const updateM = useUpdateSettings();
  const addAddressM = useAddCollectorAddress();
  const deleteAddressM = useDeleteCollectorAddress();

  const [form, setForm] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [newAddress, setNewAddress] = useState({ name: '', address: '', city: '', state: '', zip: '' });
  const [showAddressForm, setShowAddressForm] = useState(false);

  const settings = settingsQ.data as Record<string, unknown> | undefined;
  const users = (usersQ.data as { users?: unknown[] })?.users || (Array.isArray(usersQ.data) ? usersQ.data : []);
  const addresses = (addressesQ.data as { addresses?: unknown[] })?.addresses || (Array.isArray(addressesQ.data) ? addressesQ.data : []);

  useEffect(() => {
    if (settings) {
      const f: Record<string, string> = {};
      ['companyName', 'phone', 'email', 'address', 'city', 'state', 'zip', 'website', 'defaultFrom', 'smsSenderId', 'emailSignature'].forEach(k => {
        f[k] = String(settings[k] || '');
      });
      setForm(f);
      setHasChanges(false);
    }
  }, [settings]);

  const update = (k: string, v: string) => { setForm(prev => ({ ...prev, [k]: v })); setHasChanges(true); };

  const handleSave = async () => {
    await updateM.mutateAsync(form);
    setHasChanges(false);
    setSaveMsg('Settings saved!');
    setTimeout(() => setSaveMsg(''), 3000);
  };

  const handleAddAddress = async () => {
    if (!newAddress.name || !newAddress.address) return;
    await addAddressM.mutateAsync(newAddress);
    setNewAddress({ name: '', address: '', city: '', state: '', zip: '' });
    setShowAddressForm(false);
  };

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-3xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">Settings</h1>
              <p className="hero-subtitle">Configure your company details, communication settings, and system preferences.</p>
            </div>
            {hasChanges && (
              <button className="btn" onClick={handleSave} disabled={updateM.isPending}>
                {updateM.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            )}
          </div>
        </section>

        {saveMsg && (
          <div className="p-3 rounded-lg" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', fontSize: 14 }}>
            ✓ {saveMsg}
          </div>
        )}

        <div className="glass card p-4">
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853', marginBottom: 16 }}>Company Information</h2>
          {settingsQ.isLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading settings…</p>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
              {[
                { key: 'companyName', label: 'Company Name', placeholder: 'Evolv Credit Solutions' },
                { key: 'phone', label: 'Phone', placeholder: '(555) 000-0000' },
                { key: 'email', label: 'Email', placeholder: 'hello@yourcompany.com' },
                { key: 'website', label: 'Website', placeholder: 'https://yourcompany.com' },
                { key: 'address', label: 'Address', placeholder: '123 Main St' },
                { key: 'city', label: 'City', placeholder: 'Atlanta' },
                { key: 'state', label: 'State', placeholder: 'GA' },
                { key: 'zip', label: 'ZIP', placeholder: '30301' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>{label}</label>
                  <input className="input w-full" value={form[key] || ''} onChange={e => update(key, e.target.value)} placeholder={placeholder} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass card p-4">
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853', marginBottom: 16 }}>Communication Settings</h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
            <div>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Default From Email</label>
              <input className="input w-full" value={form.defaultFrom || ''} onChange={e => update('defaultFrom', e.target.value)} placeholder="no-reply@yourcompany.com" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>SMS Sender ID</label>
              <input className="input w-full" value={form.smsSenderId || ''} onChange={e => update('smsSenderId', e.target.value)} placeholder="EVOLV or +15550000000" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>Email Signature</label>
              <textarea className="input w-full" value={form.emailSignature || ''} onChange={e => update('emailSignature', e.target.value)} rows={3} style={{ resize: 'vertical' }} placeholder="Best regards,&#10;The Evolv Team" />
            </div>
          </div>
        </div>

        <div className="glass card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853' }}>Collector Addresses</h2>
            <button className="btn" onClick={() => setShowAddressForm(!showAddressForm)}>
              {showAddressForm ? 'Cancel' : '+ Add Address'}
            </button>
          </div>
          {showAddressForm && (
            <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
                {['name', 'address', 'city', 'state', 'zip'].map(f => (
                  <div key={f}>
                    <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4, textTransform: 'capitalize' }}>{f}</label>
                    <input className="input w-full" value={newAddress[f as keyof typeof newAddress]} onChange={e => setNewAddress(p => ({ ...p, [f]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <button className="btn mt-3" onClick={handleAddAddress} disabled={addAddressM.isPending}>
                {addAddressM.isPending ? 'Saving…' : 'Save Address'}
              </button>
            </div>
          )}
          {addressesQ.isLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading addresses…</p>
          ) : addresses.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No collector addresses saved.</p>
          ) : (
            <div className="space-y-2">
              {addresses.map((a: unknown, i: number) => {
                const addr = a as Record<string, unknown>;
                return (
                  <div key={addr.id as string || i} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb' }}>{String(addr.name || '')}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{[addr.address, addr.city, addr.state, addr.zip].filter(Boolean).join(', ')}</div>
                    </div>
                    <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                      onClick={() => deleteAddressM.mutate(addr.id as string)} disabled={deleteAddressM.isPending}>
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="glass card p-4">
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#d4a853', marginBottom: 16 }}>Team Users</h2>
          {usersQ.isLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading users…</p>
          ) : users.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No users found.</p>
          ) : (
            <div className="space-y-2">
              {users.map((u: unknown, i: number) => {
                const user = u as Record<string, unknown>;
                return (
                  <div key={user.id as string || i} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#e5e7eb' }}>{String(user.name || user.username || 'User')}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{String(user.email || '')} • {String(user.role || 'user')}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
