import React, { useEffect, useState } from 'react';
import { apiKeysApi } from '../../services/api';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Input from '../common/Input';

export default function ApiKeysPage() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', provider: 'stripe', environment: 'test', secretKey: '', publishableKey: '' });

  const load = async () => {
    setLoading(true);
    try { const res = await apiKeysApi.list(); setKeys(res.data); } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setAdding(true);
    setError('');
    try {
      await apiKeysApi.create(form);
      setShowAdd(false);
      setForm({ name: '', provider: 'stripe', environment: 'test', secretKey: '', publishableKey: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add key');
    }
    setAdding(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deactivate this API key?')) return;
    try { await apiKeysApi.delete(id); load(); } catch {}
  };

  return (
    <div style={{ padding: '32px 36px', maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>API Keys</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 4 }}>
            Securely stored with AES-256-GCM encryption
          </p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)}>+ Add Key</Button>
      </div>

      {showAdd && (
        <Card title="Add API Key" style={{ marginBottom: 24 }}>
          {error && (
            <div style={{ color: 'var(--color-danger)', background: 'var(--color-danger-light)', padding: '8px 12px', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
              {error}
            </div>
          )}
          <form onSubmit={handleAdd}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <Input label="Key Name" name="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Production Stripe Key" />
              <div>
                <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>Provider</label>
                <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text)', fontSize: 14 }}>
                  <option value="stripe">Stripe</option>
                  <option value="airwallex">Airwallex</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>Environment</label>
                <select value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text)', fontSize: 14 }}>
                  <option value="test">Test</option>
                  <option value="live">Live</option>
                </select>
              </div>
              <Input label="Secret Key" type="password" name="secretKey" required value={form.secretKey} onChange={(e) => setForm({ ...form, secretKey: e.target.value })} placeholder="sk_live_..." />
            </div>
            <Input label="Publishable Key (optional)" name="publishableKey" value={form.publishableKey} onChange={(e) => setForm({ ...form, publishableKey: e.target.value })} placeholder="pk_live_..." style={{ marginBottom: 20 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" loading={adding}>Save Key</Button>
              <Button variant="ghost" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>Loading…</div>
        ) : keys.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>
            No API keys yet. Add your first Stripe or Airwallex key above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {keys.map((k) => (
              <div
                key={k.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      background: k.provider === 'stripe' ? 'rgba(99,91,255,0.15)' : 'rgba(16,185,129,0.15)',
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                    }}
                  >
                    {k.provider === 'stripe' ? '💳' : '🌐'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{k.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                      {k.key_prefix || '••••••••••••'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Badge variant={k.environment === 'live' ? 'danger' : 'warning'}>{k.environment}</Badge>
                  <Badge variant={k.is_active ? 'success' : 'default'}>{k.is_active ? 'Active' : 'Inactive'}</Badge>
                  <span style={{ fontSize: 12, color: 'var(--color-text-subtle)' }}>
                    {k.last_used_at ? `Used ${new Date(k.last_used_at).toLocaleDateString()}` : 'Never used'}
                  </span>
                  {k.is_active && (
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(k.id)}>Deactivate</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Security notice */}
      <div
        style={{
          marginTop: 20,
          padding: '14px 18px',
          background: 'var(--color-primary-light)',
          border: '1px solid var(--color-primary)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 13,
          color: 'var(--color-text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 16 }}>🔒</span>
        <span>
          All API keys are encrypted at rest using <strong style={{ color: 'var(--color-text)' }}>AES-256-GCM</strong> before storage.
          Plaintext values are never persisted to the database.
        </span>
      </div>
    </div>
  );
}
