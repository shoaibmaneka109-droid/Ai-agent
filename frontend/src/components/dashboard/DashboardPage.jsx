import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { orgApi, paymentsApi } from '../../services/api';
import Card from '../common/Card';
import Badge from '../common/Badge';

const mockChartData = [
  { month: 'Nov', volume: 12400 },
  { month: 'Dec', volume: 18900 },
  { month: 'Jan', volume: 15200 },
  { month: 'Feb', volume: 22100 },
  { month: 'Mar', volume: 28700 },
  { month: 'Apr', volume: 31500 },
];

function StatCard({ label, value, sub, color }) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '20px 24px',
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'var(--color-text)', marginBottom: 4 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--color-text-subtle)' }}>{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { user, organization } = useSelector((s) => s.auth);
  const [stats, setStats] = useState(null);
  const [recentPayments, setRecentPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, paymentsRes] = await Promise.all([
          orgApi.stats(),
          paymentsApi.list({ limit: 5 }),
        ]);
        setStats(statsRes.data);
        setRecentPayments(paymentsRes.data.data || []);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const statusBadge = (status) => {
    const map = { completed: 'success', failed: 'danger', pending: 'warning', refunded: 'default' };
    return <Badge variant={map[status] || 'default'}>{status}</Badge>;
  };

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          Good morning, {user?.fullName?.split(' ')[0]} 👋
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
          {organization?.name} · {organization?.planType === 'agency' ? 'Agency Plan' : 'Solo Plan'}
        </p>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        <StatCard
          label="Total Payments"
          value={loading ? '—' : (stats?.payments?.total ?? 0).toLocaleString()}
          sub="All time"
        />
        <StatCard
          label="Completed"
          value={loading ? '—' : (stats?.payments?.completed ?? 0).toLocaleString()}
          color="var(--color-success)"
          sub="Successfully processed"
        />
        <StatCard
          label="Volume (USD)"
          value={loading ? '—' : `$${((stats?.payments?.volume ?? 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          sub="Total processed"
        />
        <StatCard
          label="Team Members"
          value={loading ? '—' : (stats?.members ?? 1)}
          sub={`${stats?.apiKeys ?? 0} active API keys`}
        />
      </div>

      {/* Chart */}
      <Card title="Payment Volume" subtitle="Monthly trend" style={{ marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={mockChartData}>
            <defs>
              <linearGradient id="volumeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="month" tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 100}`} />
            <Tooltip
              contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13 }}
              formatter={(v) => [`$${(v / 100).toLocaleString()}`, 'Volume']}
            />
            <Area type="monotone" dataKey="volume" stroke="#6366f1" strokeWidth={2} fill="url(#volumeGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Recent payments */}
      <Card title="Recent Payments">
        {recentPayments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-muted)' }}>
            No payments yet. <a href="/payments">Create your first payment →</a>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['ID', 'Amount', 'Provider', 'Customer', 'Status', 'Date'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500, borderBottom: '1px solid var(--color-border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentPayments.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                    {p.id.slice(0, 8)}…
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500 }}>
                    ${(p.amount / 100).toFixed(2)} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>{p.currency}</span>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 13 }}>{p.provider}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--color-text-muted)' }}>
                    {p.customer_email || '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>{statusBadge(p.status)}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {new Date(p.created_at).toLocaleDateString()}
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
