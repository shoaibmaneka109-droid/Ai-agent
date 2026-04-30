import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { usersApi } from '../../services/api';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';

export default function TeamPage() {
  const { user } = useSelector((s) => s.auth);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await usersApi.list();
      setMembers(res.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const roleBadge = (role) => {
    const map = { owner: 'primary', admin: 'warning', member: 'default' };
    return <Badge variant={map[role] || 'default'}>{role}</Badge>;
  };

  const handleRoleChange = async (id, newRole) => {
    try {
      await usersApi.updateRole(id, newRole);
      load();
    } catch {}
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this team member?')) return;
    try {
      await usersApi.deactivate(id);
      load();
    } catch {}
  };

  return (
    <div style={{ padding: '32px 36px', maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Team Members</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 4 }}>
          Manage your organization&apos;s users and their roles
        </p>
      </div>

      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>Loading…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Member', 'Role', 'Status', 'Last Active', 'Actions'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500, borderBottom: '1px solid var(--color-border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: 'var(--color-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 13,
                          fontWeight: 700,
                          color: '#fff',
                          flexShrink: 0,
                        }}
                      >
                        {m.full_name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{m.full_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>{roleBadge(m.role)}</td>
                  <td style={{ padding: '12px' }}>
                    <Badge variant={m.is_active ? 'success' : 'default'}>{m.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td style={{ padding: '12px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {m.last_login_at ? new Date(m.last_login_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {m.id !== user?.id && m.role !== 'owner' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {m.role === 'member' && (
                          <Button size="sm" variant="ghost" onClick={() => handleRoleChange(m.id, 'admin')}>
                            Make Admin
                          </Button>
                        )}
                        {m.role === 'admin' && (
                          <Button size="sm" variant="ghost" onClick={() => handleRoleChange(m.id, 'member')}>
                            Remove Admin
                          </Button>
                        )}
                        {m.is_active && (
                          <Button size="sm" variant="danger" onClick={() => handleDeactivate(m.id)}>
                            Remove
                          </Button>
                        )}
                      </div>
                    )}
                    {m.id === user?.id && <span style={{ fontSize: 12, color: 'var(--color-text-subtle)' }}>You</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
