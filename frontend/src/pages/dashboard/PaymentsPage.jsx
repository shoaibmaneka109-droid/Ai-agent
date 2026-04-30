import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, RefreshCw, Filter } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getPayments, refundPayment } from '../../services/payments.service';

const STATUS_OPTIONS = ['', 'pending', 'succeeded', 'failed', 'refunded'];

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
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount / 100);
}

export default function PaymentsPage() {
  const { user }   = useAuth();
  const orgSlug    = user?.org_slug || user?.orgSlug;
  const qc         = useQueryClient();

  const [page,     setPage]     = useState(1);
  const [status,   setStatus]   = useState('');
  const [provider, setProvider] = useState('');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['payments', orgSlug, { page, status, provider }],
    queryFn:  () => getPayments(orgSlug, { page, limit: 20, status: status || undefined, provider: provider || undefined }),
    enabled:  !!orgSlug,
    keepPreviousData: true,
  });

  const payments  = data?.data   || [];
  const meta      = data?.meta   || {};
  const totalPages = Math.ceil((meta.total || 0) / (meta.limit || 20));

  const refund = useMutation({
    mutationFn: ({ paymentId, reason }) => refundPayment(orgSlug, paymentId, reason),
    onSuccess: () => qc.invalidateQueries(['payments']),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="mt-1 text-sm text-gray-500">All transactions for your organization</p>
        </div>
        {isFetching && <RefreshCw className="h-5 w-5 animate-spin text-primary-500" />}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-500">Filter:</span>
        </div>
        <select
          className="input w-40"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          type="text"
          className="input w-40"
          placeholder="Provider…"
          value={provider}
          onChange={(e) => { setProvider(e.target.value); setPage(1); }}
        />
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
          </div>
        ) : payments.length === 0 ? (
          <div className="py-16 text-center">
            <CreditCard className="mx-auto h-10 w-10 text-gray-200 mb-3" />
            <p className="text-gray-500">No payments found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3">Transaction ID</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Env</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{p.id.slice(0, 8)}…</td>
                    <td className="px-4 py-3 capitalize">{p.provider}</td>
                    <td className="px-4 py-3 font-medium">{formatAmount(p.amount, p.currency)}</td>
                    <td className="px-4 py-3">{statusBadge(p.status)}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${p.environment === 'live' ? 'badge-green' : 'badge-yellow'}`}>
                        {p.environment}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {p.status === 'succeeded' && (
                        <button
                          onClick={() => refund.mutate({ paymentId: p.id, reason: 'Customer request' })}
                          disabled={refund.isPending}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-500">
              Page {page} of {totalPages} ({meta.total} total)
            </p>
            <div className="flex gap-2">
              <button
                className="btn-secondary px-3 py-1 text-xs"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                className="btn-secondary px-3 py-1 text-xs"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
