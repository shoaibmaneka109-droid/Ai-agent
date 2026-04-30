import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, TrendingUp, CheckCircle, AlertCircle, Key } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getPayments } from '../../services/payments.service';

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="card flex items-start gap-4">
      <div className={`rounded-lg p-2 ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function statusBadge(status) {
  const map = {
    succeeded: 'badge-green',
    pending:   'badge-yellow',
    failed:    'badge-red',
    refunded:  'badge-blue',
    disputed:  'badge-red',
    processing:'badge-yellow',
  };
  return <span className={map[status] || 'badge-gray'}>{status}</span>;
}

function formatAmount(amount, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(amount / 100);
}

export default function DashboardPage() {
  const { user } = useAuth();
  const orgSlug  = user?.org_slug || user?.orgSlug;

  const { data, isLoading } = useQuery({
    queryKey: ['payments', orgSlug, { limit: 5 }],
    queryFn: () => getPayments(orgSlug, { limit: 5 }),
    enabled: !!orgSlug,
  });

  const payments = data?.data || [];
  const total    = data?.meta?.total || 0;

  const succeeded = payments.filter((p) => p.status === 'succeeded').length;
  const failed    = payments.filter((p) => p.status === 'failed').length;
  const revenue   = payments
    .filter((p) => p.status === 'succeeded')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome back, {user?.first_name || user?.firstName}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={CreditCard}    label="Total Transactions"  value={total}           color="bg-primary-600" />
        <StatCard icon={TrendingUp}    label="Revenue (sample)"    value={formatAmount(revenue, 'USD')} color="bg-green-500" />
        <StatCard icon={CheckCircle}   label="Succeeded"           value={succeeded}       color="bg-emerald-500" />
        <StatCard icon={AlertCircle}   label="Failed"              value={failed}          color="bg-red-500" />
      </div>

      {/* Recent payments */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Recent Payments</h2>
          <a href="/payments" className="text-sm font-medium text-primary-600 hover:underline">
            View all
          </a>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
          </div>
        ) : payments.length === 0 ? (
          <div className="rounded-lg bg-gray-50 border border-dashed border-gray-200 py-10 text-center">
            <CreditCard className="mx-auto h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No payments yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                  <th className="pb-3 pr-4">ID</th>
                  <th className="pb-3 pr-4">Provider</th>
                  <th className="pb-3 pr-4">Amount</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-3 pr-4 font-mono text-xs text-gray-400">
                      {p.id.slice(0, 8)}…
                    </td>
                    <td className="py-3 pr-4 capitalize">{p.provider}</td>
                    <td className="py-3 pr-4 font-medium">{formatAmount(p.amount, p.currency)}</td>
                    <td className="py-3 pr-4">{statusBadge(p.status)}</td>
                    <td className="py-3 text-gray-400">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Plan info */}
      <div className="card flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">Current Plan</p>
          <p className="mt-0.5 text-xs text-gray-500 capitalize">
            {user?.org_plan || user?.orgPlan || 'free'} — {user?.org_slug || user?.orgSlug}
          </p>
        </div>
        <a
          href="/settings/org"
          className="btn-secondary text-xs"
        >
          Upgrade
        </a>
      </div>
    </div>
  );
}
