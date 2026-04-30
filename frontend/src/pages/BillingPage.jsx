import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Alert from '../components/common/Alert';
import { refreshSubscriptionThunk } from '../store/slices/authSlice';
import { getSubscriptionEvents, cancelSubscription } from '../services/subscriptionService';

const statusColors = {
  trialing: 'blue',
  active: 'green',
  hibernating: 'red',
  cancelled: 'gray',
};

const statusLabels = {
  trialing: 'Free Trial',
  active: 'Active',
  hibernating: 'Data Hibernation',
  cancelled: 'Cancelled',
};

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$29/mo',
    features: ['Up to 5 team members', 'Stripe integration', 'Basic analytics'],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '$79/mo',
    features: ['Up to 20 team members', 'Stripe + Airwallex', 'Advanced analytics', 'Priority support'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    features: ['Unlimited members', 'All integrations', 'SLA + dedicated support'],
  },
];

const BillingPage = () => {
  const dispatch = useDispatch();
  const { org, subscription } = useSelector((s) => s.auth);
  const [events, setEvents] = useState([]);
  const [alert, setAlert] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  useEffect(() => {
    if (org?.id) {
      dispatch(refreshSubscriptionThunk(org.id));
      getSubscriptionEvents(org.id)
        .then((res) => setEvents(res.data.data.events || []))
        .catch(() => {});
    }
  }, [org?.id, dispatch]);

  const handleCancel = async () => {
    if (!window.confirm('Cancel your subscription? Your data will be preserved in hibernation.')) return;
    setCancelLoading(true);
    try {
      await cancelSubscription(org.id, 'owner_requested');
      setAlert({ type: 'success', message: 'Subscription cancelled. Data preserved in hibernation mode.' });
      dispatch(refreshSubscriptionThunk(org.id));
    } catch (err) {
      setAlert({ type: 'error', message: err.response?.data?.error?.message || 'Failed to cancel' });
    } finally {
      setCancelLoading(false);
    }
  };

  const isHibernating = subscription?.status === 'hibernating' || subscription?.status === 'cancelled';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing & Subscription</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your plan and payment details</p>
      </div>

      {alert && (
        <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
      )}

      {/* Current status */}
      <Card title="Current Status">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Status</p>
            <Badge color={statusColors[subscription?.status] || 'gray'}>
              {statusLabels[subscription?.status] || subscription?.status}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Plan</p>
            <p className="text-sm font-semibold capitalize">{subscription?.plan || org?.plan}</p>
          </div>
          {subscription?.status === 'trialing' && (
            <>
              <div>
                <p className="text-xs text-gray-500 mb-1">Trial ends</p>
                <p className="text-sm font-medium">
                  {subscription?.trialEndsAt
                    ? new Date(subscription.trialEndsAt).toLocaleDateString()
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Days remaining</p>
                <p className={`text-sm font-bold ${
                  (subscription?.daysRemaining ?? 0) <= 4 ? 'text-orange-600' : 'text-indigo-600'
                }`}>
                  {subscription?.daysRemaining != null
                    ? `${subscription.daysRemaining} day${subscription.daysRemaining !== 1 ? 's' : ''}`
                    : '—'}
                </p>
              </div>
            </>
          )}
          {subscription?.status === 'trialing' && org?.type === 'agency' && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Trial seat limit</p>
              <p className="text-sm font-medium">{subscription?.trialMemberLimit} members</p>
            </div>
          )}
        </div>

        {isHibernating && (
          <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200">
            <p className="text-sm font-semibold text-red-800 mb-1">🔒 Account in Data Hibernation</p>
            <p className="text-xs text-red-700">
              Your data is safe. To restore payment integrations, API access, and auto-fill
              features, choose a plan below and reactivate.
            </p>
          </div>
        )}
      </Card>

      {/* Plan selection */}
      <Card title={isHibernating ? 'Reactivate with a Plan' : 'Available Plans'}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl border-2 p-4 flex flex-col ${
                subscription?.plan === plan.id && !isHibernating
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="mb-3">
                <h3 className="font-bold text-gray-900">{plan.name}</h3>
                <p className="text-2xl font-extrabold text-indigo-600 mt-0.5">{plan.price}</p>
              </div>
              <ul className="text-xs text-gray-600 space-y-1.5 flex-1 mb-4">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-1.5">
                    <span className="text-green-500">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant={subscription?.plan === plan.id && !isHibernating ? 'secondary' : 'primary'}
                className="w-full"
                onClick={() => {
                  setAlert({
                    type: 'info',
                    message: `Connect a payment provider to activate the ${plan.name} plan. (Stripe/Airwallex checkout integration point.)`,
                  });
                }}
              >
                {isHibernating ? 'Reactivate with this plan' : subscription?.plan === plan.id ? 'Current plan' : 'Upgrade'}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Subscription event history */}
      {events.length > 0 && (
        <Card title="Subscription History">
          <div className="divide-y divide-gray-100">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900 capitalize">
                    {e.event_type.replace(/_/g, ' ')}
                  </p>
                  {e.from_status && (
                    <p className="text-xs text-gray-400">
                      {e.from_status} → {e.to_status}
                    </p>
                  )}
                </div>
                <p className="text-xs text-gray-400">{new Date(e.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Danger zone — only show if actively subscribed */}
      {subscription?.status === 'active' && (
        <Card title="Danger Zone">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Cancel subscription</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Your data will be preserved. You can reactivate at any time.
              </p>
            </div>
            <Button variant="danger" size="sm" loading={cancelLoading} onClick={handleCancel}>
              Cancel plan
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default BillingPage;
