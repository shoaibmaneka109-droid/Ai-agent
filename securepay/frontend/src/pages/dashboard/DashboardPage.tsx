import { useQuery } from '@tanstack/react-query';
import { paymentsApi } from '../../api/payments.api';
import { tenantApi } from '../../api/tenant.api';
import { useAuthStore } from '../../store/auth.store';
import { TrendingUp, CreditCard, RefreshCw, AlertCircle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays } from 'date-fns';
import Spinner from '../../components/common/Spinner';

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function formatCurrency(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const from = subDays(new Date(), 30).toISOString();
  const to = new Date().toISOString();

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['analytics', from, to],
    queryFn: () => paymentsApi.analytics({ from, to, groupBy: 'day' }),
  });

  const { data: recentPayments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments', 'recent'],
    queryFn: () => paymentsApi.list({ limit: 5 }),
  });

  const { data: tenant } = useQuery({
    queryKey: ['tenant-profile'],
    queryFn: tenantApi.getProfile,
  });

  const totalSucceeded = analytics?.reduce((sum: number, d: any) => sum + (Number(d.succeeded_amount) || 0), 0) ?? 0;
  const totalCount = analytics?.reduce((sum: number, d: any) => sum + (Number(d.succeeded_count) || 0), 0) ?? 0;
  const failedCount = analytics?.reduce((sum: number, d: any) => sum + (Number(d.failed_count) || 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.firstName}
        </h1>
        <p className="text-gray-500">
          {tenant?.name} · <span className="capitalize">{tenant?.plan}</span> plan · Last 30 days
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Volume (30d)" value={formatCurrency(totalSucceeded)} icon={TrendingUp} color="bg-brand-600" />
        <StatCard label="Transactions" value={totalCount.toLocaleString()} icon={CreditCard} color="bg-emerald-500" />
        <StatCard label="Failed" value={failedCount.toLocaleString()} icon={AlertCircle} color="bg-red-500" />
      </div>

      {/* Area chart */}
      <div className="card">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Revenue over time</h2>
        {analyticsLoading ? (
          <div className="flex h-48 items-center justify-center"><Spinner /></div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={[...(analytics ?? [])].reverse()}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#5462f5" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#5462f5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="period"
                tickFormatter={(v) => format(new Date(v), 'MMM d')}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `$${(v / 100).toFixed(0)}`}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v: number) => [formatCurrency(v), 'Revenue']}
                labelFormatter={(l) => format(new Date(l), 'MMM d, yyyy')}
              />
              <Area
                type="monotone"
                dataKey="succeeded_amount"
                stroke="#5462f5"
                strokeWidth={2}
                fill="url(#colorRevenue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent payments */}
      <div className="card">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Recent Payments</h2>
        {paymentsLoading ? (
          <div className="flex h-24 items-center justify-center"><Spinner /></div>
        ) : recentPayments?.data?.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No payments yet</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentPayments?.data?.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{p.customer_email || 'Anonymous'}</p>
                  <p className="text-xs text-gray-500">{format(new Date(p.created_at), 'MMM d, h:mm a')}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{formatCurrency(p.amount, p.currency)}</p>
                  <span className={`badge text-xs capitalize ${p.status === 'succeeded' ? 'badge-green' : p.status === 'failed' ? 'badge-red' : 'badge-yellow'}`}>
                    {p.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
