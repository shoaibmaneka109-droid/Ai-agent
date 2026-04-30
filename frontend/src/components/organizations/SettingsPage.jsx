import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { orgApi, usersApi } from '../../services/api';
import Card from '../common/Card';
import Button from '../common/Button';
import Input from '../common/Input';

export default function SettingsPage() {
  const { user, organization } = useSelector((s) => s.auth);
  const [orgData, setOrgData] = useState(null);
  const [orgForm, setOrgForm] = useState({});
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgMsg, setOrgMsg] = useState('');
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await orgApi.get();
        setOrgData(res.data);
        setOrgForm({
          name: res.data.name || '',
          billing_email: res.data.billing_email || '',
          company_name: res.data.company_name || '',
          company_website: res.data.company_website || '',
          company_address: res.data.company_address || '',
        });
      } catch {}
    };
    load();
  }, []);

  const saveOrg = async (e) => {
    e.preventDefault();
    setOrgSaving(true);
    setOrgMsg('');
    try {
      await orgApi.update(orgForm);
      setOrgMsg('Organization settings saved.');
    } catch { setOrgMsg('Failed to save.'); }
    setOrgSaving(false);
  };

  const changePw = async (e) => {
    e.preventDefault();
    setPwSaving(true);
    setPwMsg('');
    setPwError('');
    try {
      await usersApi.changePassword(pwForm);
      setPwMsg('Password changed. Please log in again.');
      setPwForm({ currentPassword: '', newPassword: '' });
    } catch (err) {
      setPwError(err.response?.data?.error || 'Failed to change password');
    }
    setPwSaving(false);
  };

  return (
    <div style={{ padding: '32px 36px', maxWidth: 700 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Settings</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 4 }}>Manage your organization and account</p>
      </div>

      {/* Org settings */}
      <Card title="Organization" style={{ marginBottom: 24 }}>
        <form onSubmit={saveOrg} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input label="Organization Name" name="name" value={orgForm.name || ''} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} />
          <Input label="Billing Email" type="email" name="billing_email" value={orgForm.billing_email || ''} onChange={(e) => setOrgForm({ ...orgForm, billing_email: e.target.value })} />

          {organization?.planType === 'agency' && (
            <>
              <Input label="Company Name" name="company_name" value={orgForm.company_name || ''} onChange={(e) => setOrgForm({ ...orgForm, company_name: e.target.value })} />
              <Input label="Company Website" type="url" name="company_website" value={orgForm.company_website || ''} onChange={(e) => setOrgForm({ ...orgForm, company_website: e.target.value })} />
              <div>
                <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>Company Address</label>
                <textarea
                  value={orgForm.company_address || ''}
                  onChange={(e) => setOrgForm({ ...orgForm, company_address: e.target.value })}
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text)', fontSize: 14, resize: 'vertical' }}
                />
              </div>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button type="submit" loading={orgSaving}>Save Changes</Button>
            {orgMsg && <span style={{ fontSize: 13, color: orgMsg.includes('Failed') ? 'var(--color-danger)' : 'var(--color-success)' }}>{orgMsg}</span>}
          </div>
        </form>

        {/* Plan info */}
        <div style={{ marginTop: 20, padding: '12px 14px', background: 'var(--color-surface-2)', borderRadius: 6, fontSize: 13 }}>
          <div style={{ marginBottom: 4, color: 'var(--color-text-muted)' }}>Current Plan</div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
            {organization?.planType === 'agency' ? '🏢 Agency' : '👤 Solo'}
          </div>
          <div style={{ color: 'var(--color-text-subtle)' }}>
            {organization?.planType === 'agency'
              ? 'Unlimited team members · 10 API keys'
              : '1 user · 2 API keys'}
          </div>
        </div>
      </Card>

      {/* Change password */}
      <Card title="Change Password">
        <form onSubmit={changePw} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input label="Current Password" type="password" name="currentPassword" required value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} />
          <Input label="New Password" type="password" name="newPassword" required hint="Min 8 chars, 1 uppercase, 1 number" value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} />
          {pwError && <div style={{ color: 'var(--color-danger)', fontSize: 13 }}>{pwError}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button type="submit" loading={pwSaving}>Update Password</Button>
            {pwMsg && <span style={{ fontSize: 13, color: 'var(--color-success)' }}>{pwMsg}</span>}
          </div>
        </form>
      </Card>
    </div>
  );
}
