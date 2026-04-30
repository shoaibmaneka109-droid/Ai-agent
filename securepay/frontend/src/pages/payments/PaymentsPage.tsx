import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { paymentsApi, PaymentFilters } from '../../api/payments.api';
import { format } from 'date-fns';
import { Search, Filter, ChevronRight } from 'lucide-react';
import StatusBadge from '../../components/common/StatusBadge';
import Spinner from '../../components/common/Spinner';
import EmptyState from '../../components/common/EmptyState';
import { CreditCard } from 'lucide-react';

function formatCurrency(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

const STATUSES = ['', 'pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded'];

export default function PaymentsPage() {
  const [filters, setFilters] = useState<PaymentFilters>({ page: 1, limit: 20 });
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['payments', filters],
    queryFn: () => paymentsApi.list(filters),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-gray-500">
            {data?.meta ? `${data.meta.total.toLocaleString()} total transactions` : ''}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email..."
              className="input pl-9"
            />
          </div>
          <select
            value={filters.status ?? ''}
            onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined, page: 1 })}
            className="input w-40"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All statuses'}</option>
            ))}
          </select>
          <select
            value={filters.provider ?? ''}
            onChange={(e) => setFilters({ ...filters, provider: e.target.value || undefined, page: 1 })}
            className="input w-40"
          >
            <option value="">All providers</option>
            <option value="stripe">Stripe</option>
            <option value="airwallex">Airwallex</option>
            <option value="manual">Manual</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center"><Spinner /></div>
        ) : !data?.data?.length ? (
          <EmptyState icon={CreditCard} title="No payments found" description="Payments will appear here once they are created." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['ID', 'Customer', 'Amount', 'Provider', 'Status', 'Date', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.data.map((p: any) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.id.slice(0, 8)}…</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{p.customer_name || '—'}</p>
                        <p className="text-xs text-gray-500">{p.customer_email || '—'}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(p.amount, p.currency)}</td>
                      <td className="px-4 py-3 capitalize text-gray-600">{p.provider}</td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3 text-gray-500">{format(new Date(p.created_at), 'MMM d, yyyy')}</td>
                      <td className="px-4 py-3">
                        <Link to={`/payments/${p.id}`} className="text-brand-600 hover:text-brand-700">
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data.meta && data.meta.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                <p className="text-sm text-gray-500">
                  Page {data.meta.page} of {data.meta.totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={!data.meta.hasPrevPage}
                    onClick={() => setFilters({ ...filters, page: filters.page! - 1 })}
                    className="btn-outline px-3 py-1.5 text-xs disabled:opacity-40"
                  >Prev</button>
                  <button
                    disabled={!data.meta.hasNextPage}
                    onClick={() => setFilters({ ...filters, page: filters.page! + 1 })}
                    className="btn-outline px-3 py-1.5 text-xs disabled:opacity-40"
                  >Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
