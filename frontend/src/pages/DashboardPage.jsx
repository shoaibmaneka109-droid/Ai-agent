import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import { listPayments } from '../services/paymentsService';
import { listApiKeys } from '../services/apiKeysService';
import { refreshSubscriptionThunk } from '../store/slices/authSlice';

const planColors = { free: 'gray', starter: 'blue', growth: 'indigo', enterprise: 'indigo' };
const statusColors = { succeeded: 'green', failed: 'red', pending: 'yellow', refunded: 'gray', cancelled: 'gray' };

const StatCard = ({ label, value, sub }) => (
  <Card>
    <p className="text-sm text-gray-500">{label}</p>
    <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
  </Card>
);

const DashboardPage = () => {
  const dispatch = useDispatch();
  const { user, org, subscription } = useSelector((s) => s.auth);
  const [payments, setPayments] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!org?.id) return;
    // Refresh subscription state from server on every dashboard mount
    dispatch(refreshSubscriptionThunk(org.id));

    const load = async () => {
      try {
        const [pmRes, keyRes] = await Promise.all([
          listPayments(org.id, { limit: 5 }),
          listApiKeys(org.id),
        ]);
        setPayments(pmRes.data.data.payments || []);
        setApiKeys(keyRes.data.data.keys || []);
      } catch {
        // Non-critical — page degrades gracefully
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [org?.id, dispatch]);

  const totalVolume = payments
    .filter((p) => p.status === 'succeeded')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.firstName}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-gray-500 text-sm">{org?.name}</p>
            <Badge color={planColors[org?.plan] || 'gray'}>{org?.plan}</Badge>
            <Badge color="blue">{org?.type === 'solo' ? 'Individual' : 'Agency'}</Badge>
          </div>
        </div>
      </div>

      {/* Hibernation notice */}
      {subscription && !subscription.hasFullAccess && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
          <span className="text-xl mt-0.5">🔒</span>
          <div>
            <p className="font-semibold text-red-800 text-sm">Account in Data Hibernation</p>
            <p className="text-xs text-red-700 mt-0.5">
              Your payment integrations and API features are locked.
              You can view all historical data below.{' '}
              <Link to="/settings/billing" className="font-semibold underline">
                Reactivate your plan →
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Total payments"
          value={loading ? '—' : payments.length}
          sub="Last 5 transactions shown"
        />
        <StatCard
          label="Succeeded volume"
          value={loading ? '—' : `$${(totalVolume / 100).toFixed(2)}`}
          sub="From recent transactions"
        />
        <StatCard
          label="Active API keys"
          value={loading ? '—' : apiKeys.filter((k) => k.is_active).length}
          sub={`${apiKeys.length} total configured`}
        />
      </div>

      {/* Recent payments */}
      <Card
        title="Recent Payments"
        actions={
          <Link to="/payments" className="text-sm text-indigo-600 hover:underline font-medium">
            View all
          </Link>
        }
        className="mb-6"
      >
        {loading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : payments.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm">No payments yet.</p>
            <Link to="/payments" className="text-indigo-600 text-sm font-medium hover:underline mt-1 block">
              Create your first payment intent →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {p.provider.charAt(0).toUpperCase() + p.provider.slice(1)}
                  </p>
                  <p className="text-xs text-gray-400">{new Date(p.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge color={statusColors[p.status] || 'gray'}>{p.status}</Badge>
                  <span className="text-sm font-semibold text-gray-900">
                    {p.currency} {(Number(p.amount) / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* API Keys quick view */}
      <Card
        title="Payment Integrations"
        actions={
          <Link to="/api-keys" className="text-sm text-indigo-600 hover:underline font-medium">
            Manage keys
          </Link>
        }
      >
        {loading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : apiKeys.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm">No API keys configured.</p>
            <Link to="/api-keys" className="text-indigo-600 text-sm font-medium hover:underline mt-1 block">
              Add Stripe or Airwallex →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {apiKeys.slice(0, 4).map((k) => (
              <div key={k.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900 capitalize">{k.provider}</p>
                  <p className="text-xs text-gray-400">{k.label}</p>
                </div>
                <Badge color={k.is_active ? 'green' : 'gray'}>{k.is_active ? 'Active' : 'Inactive'}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default DashboardPage;
