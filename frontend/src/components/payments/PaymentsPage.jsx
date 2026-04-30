import React, { useEffect, useState } from 'react';
import { paymentsApi } from '../../services/api';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Input from '../common/Input';
import FeatureLock from '../common/FeatureLock';

const statusBadge = (status) => {
  const map = { completed: 'success', failed: 'danger', pending: 'warning', refunded: 'default', cancelled: 'default' };
  return <Badge variant={map[status] || 'default'}>{status}</Badge>;
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [form, setForm] = useState({
    provider: 'stripe',
    amount: '',
    currency: 'USD',
    description: '',
    customerEmail: '',
    environment: 'test',
  });

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const res = await paymentsApi.list({ page: p, limit: 15 });
      setPayments(res.data.data || []);
      setPagination(res.data.pagination || {});
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(page); }, [page]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      await paymentsApi.create({ ...form, amount: parseInt(form.amount, 10) });
      setShowCreate(false);
      setForm({ provider: 'stripe', amount: '', currency: 'USD', description: '', customerEmail: '', environment: 'test' });
      load(1);
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create payment');
    }
    setCreating(false);
  };

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Payments</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 4 }}>
            Manage and track all payment transactions
          </p>
        </div>
        <FeatureLock message="Reactivate subscription to create payments">
          <Button onClick={() => setShowCreate(!showCreate)}>+ New Payment</Button>
        </FeatureLock>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card title="Create Payment" style={{ marginBottom: 24 }}>
          {createError && (
            <div style={{ color: 'var(--color-danger)', background: 'var(--color-danger-light)', padding: '8px 12px', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
              {createError}
            </div>
          )}
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>Provider</label>
                <select
                  value={form.provider}
                  onChange={(e) => setForm({ ...form, provider: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text)', fontSize: 14 }}
                >
                  <option value="stripe">Stripe</option>
                  <option value="airwallex">Airwallex</option>
                </select>
              </div>
              <Input
                label="Amount (cents)"
                name="amount"
                type="number"
                required
                min="1"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="e.g. 5000 = $50.00"
              />
              <div>
                <label style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>Currency</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text)', fontSize: 14 }}
                >
                  {['USD', 'EUR', 'GBP', 'AUD', 'SGD', 'HKD'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <Input
                label="Customer Email"
                type="email"
                name="customerEmail"
                value={form.customerEmail}
                onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                placeholder="customer@example.com"
              />
              <Input
                label="Description"
                name="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Payment description"
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" loading={creating}>Create Payment</Button>
              <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)' }}>Loading payments…</div>
        ) : payments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)' }}>
            No payments yet. Click <strong>+ New Payment</strong> to get started.
          </div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['ID', 'Amount', 'Provider', 'Customer', 'Description', 'Status', 'Date'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500, borderBottom: '1px solid var(--color-border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{p.id.slice(0, 8)}…</td>
                    <td style={{ padding: '10px 12px', fontWeight: 500, fontSize: 13 }}>
                      ${(p.amount / 100).toFixed(2)} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>{p.currency}</span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 13 }}>{p.provider}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--color-text-muted)' }}>{p.customer_email || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.description || '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>{statusBadge(p.status)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pagination.pages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
                <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>← Prev</Button>
                <span style={{ padding: '6px 12px', fontSize: 13, color: 'var(--color-text-muted)' }}>
                  Page {page} of {pagination.pages}
                </span>
                <Button variant="ghost" size="sm" disabled={page === pagination.pages} onClick={() => setPage(page + 1)}>Next →</Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
