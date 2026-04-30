import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, Clock, Lock, Users, Zap, CheckCircle,
  AlertTriangle, RefreshCw, XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { getSubscriptionStatus, cancelSubscription } from '../../services/subscription.service';

// ── Plan catalogue ────────────────────────────────────────────────────────────

const PLANS = {
  solo: [
    {
      id: 'free',
      name: 'Free Trial',
      price: '$0',
      period: '15 days',
      features: ['1 seat', '100 payments/mo', 'Stripe + Airwallex', 'Email support'],
    },
    {
      id: 'starter',
      name: 'Starter',
      price: '$19',
      period: '/month',
      features: ['1 seat', '1,000 payments/mo', 'All providers', 'Priority email'],
      recommended: true,
    },
    {
      id: 'professional',
      name: 'Professional',
      price: '$49',
      period: '/month',
      features: ['3 seats', 'Unlimited payments', 'All providers', 'Slack support'],
    },
  ],
  agency: [
    {
      id: 'free',
      name: 'Free Trial',
      price: '$0',
      period: '30 days',
      features: ['Up to 9 seats', '500 payments/mo', 'Stripe + Airwallex', 'Email support'],
    },
    {
      id: 'professional',
      name: 'Professional',
      price: '$99',
      period: '/month',
      features: ['25 seats', 'Unlimited payments', 'All providers', 'Priority support'],
      recommended: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      features: ['Unlimited seats', 'SLA guarantee', 'Dedicated CSM', 'Custom integrations'],
    },
  ],
};

// ── Status display helpers ────────────────────────────────────────────────────

function StatusChip({ status }) {
  const map = {
    trialing:  { cls: 'badge-blue',   label: 'Trial',    icon: <Clock   className="h-3 w-3" /> },
    active:    { cls: 'badge-green',  label: 'Active',   icon: <CheckCircle className="h-3 w-3" /> },
    past_due:  { cls: 'badge-yellow', label: 'Past Due', icon: <AlertTriangle className="h-3 w-3" /> },
    expired:   { cls: 'badge-red',    label: 'Expired',  icon: <XCircle  className="h-3 w-3" /> },
    cancelled: { cls: 'badge-red',    label: 'Cancelled',icon: <XCircle  className="h-3 w-3" /> },
    suspended: { cls: 'badge-red',    label: 'Suspended',icon: <Lock     className="h-3 w-3" /> },
  };
  const { cls, label, icon } = map[status] || map.expired;
  return (
    <span className={`${cls} flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full`}>
      {icon} {label}
    </span>
  );
}

function TrialProgressBar({ daysRemaining, totalDays }) {
  const pct = Math.max(0, Math.min(100, (daysRemaining / totalDays) * 100));
  const color = pct > 40 ? 'bg-primary-500' : pct > 15 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining</span>
        <span>{totalDays} day trial</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SubscriptionPage() {
  const { user }                    = useAuth();
  const { subscription, refresh }   = useSubscription();
  const orgSlug  = user?.orgSlug || user?.org_slug;
  const orgType  = user?.role === 'owner' ? (user?.org_type || 'solo') : 'solo';
  const qc       = useQueryClient();

  const [showCancel, setShowCancel] = useState(false);

  const { data: live, isLoading } = useQuery({
    queryKey: ['subscription', orgSlug],
    queryFn:  () => getSubscriptionStatus(orgSlug),
    enabled:  !!orgSlug,
    onSuccess: refresh,
  });

  const sub = live || subscription;

  const cancel = useMutation({
    mutationFn: (reason) => cancelSubscription(orgSlug, reason),
    onSuccess: () => {
      qc.invalidateQueries(['subscription', orgSlug]);
      refresh();
      setShowCancel(false);
    },
  });

  const plans = PLANS[sub?.orgType || orgType] || PLANS.solo;
  const totalTrialDays = sub?.orgType === 'agency' ? 30 : 15;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Subscription</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your trial, plan, and billing.
        </p>
      </div>

      {/* ── Current status card ────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="card flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        </div>
      ) : sub ? (
        <div className="card space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-primary-500" />
              <div>
                <p className="font-semibold text-gray-900">Current Subscription</p>
                <p className="text-xs text-gray-500 capitalize">{sub.orgType || orgType} plan</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusChip status={sub.status} />
              <button onClick={refresh} className="text-gray-400 hover:text-gray-600">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Trial progress */}
          {sub.status === 'trialing' && (
            <TrialProgressBar
              daysRemaining={sub.trialDaysRemaining ?? 0}
              totalDays={totalTrialDays}
            />
          )}

          {/* Hibernation notice */}
          {sub.isHibernated && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex gap-3">
              <Lock className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                <strong>Data Hibernation is active.</strong> Your data is preserved and you
                can view it at any time. API execution and auto-fill features are locked
                until you renew your subscription.
              </div>
            </div>
          )}

          {/* Seat usage */}
          {sub.maxSeats && (
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 border border-gray-100 px-4 py-3">
              <Users className="h-5 w-5 text-gray-400" />
              <div className="text-sm">
                <span className="font-medium text-gray-700">Seat limit during trial: </span>
                <span className="text-gray-600">{sub.maxSeats} seat{sub.maxSeats !== 1 ? 's' : ''}</span>
                {sub.orgType === 'agency' && (
                  <span className="ml-2 text-xs text-gray-400">(owner + up to {sub.maxSeats - 1} employees)</span>
                )}
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {sub.trialEndsAt && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Trial ends</p>
                <p className="font-medium">{new Date(sub.trialEndsAt).toLocaleDateString()}</p>
              </div>
            )}
            {sub.subscriptionEndsAt && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Subscription renews</p>
                <p className="font-medium">{new Date(sub.subscriptionEndsAt).toLocaleDateString()}</p>
              </div>
            )}
          </div>

          {/* Cancel button (only if active) */}
          {(sub.status === 'active' || sub.status === 'past_due') && (
            <div className="border-t border-gray-100 pt-4">
              <button
                onClick={() => setShowCancel(true)}
                className="text-sm text-red-500 hover:underline"
              >
                Cancel subscription
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* ── Plan cards ────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-5 w-5 text-primary-500" />
          <h2 className="font-semibold text-gray-900">Available Plans</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = sub?.orgPlan === plan.id || (sub?.status === 'trialing' && plan.id === 'free');
            return (
              <div
                key={plan.id}
                className={`relative rounded-xl border-2 p-5 transition
                            ${plan.recommended ? 'border-primary-500 shadow-md' : 'border-gray-200'}
                            ${isCurrent ? 'bg-primary-50' : 'bg-white'}`}
              >
                {plan.recommended && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full
                                   bg-primary-600 text-white text-xs font-bold px-3 py-0.5">
                    Recommended
                  </span>
                )}

                <p className="font-bold text-gray-900">{plan.name}</p>
                <p className="mt-1">
                  <span className="text-2xl font-bold text-primary-600">{plan.price}</span>
                  <span className="text-xs text-gray-400">{plan.period}</span>
                </p>

                <ul className="mt-4 space-y-1.5 text-xs text-gray-600">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="mt-4 rounded-lg bg-primary-100 text-primary-700 text-xs
                                  font-semibold text-center py-2">
                    Current Plan
                  </div>
                ) : (
                  <button
                    disabled={plan.id === 'enterprise'}
                    className="mt-4 btn-primary w-full text-xs py-2 disabled:opacity-50"
                    onClick={() => {
                      // In production: launch Stripe Checkout / Airwallex payment link
                      alert(`Stripe Checkout for "${plan.name}" would open here.`);
                    }}
                  >
                    {plan.id === 'enterprise' ? 'Contact Sales' : `Upgrade to ${plan.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Cancel confirmation modal ──────────────────────────────────────── */}
      {showCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Cancel subscription?</h3>
            <p className="text-sm text-gray-600">
              Your organization will enter <strong>Data Hibernation</strong> mode immediately.
              Your data remains safe, but API execution and auto-fill will be locked
              until you resubscribe.
            </p>
            {cancel.error && (
              <p className="text-sm text-red-600">
                {cancel.error.response?.data?.error?.message || 'Cancellation failed'}
              </p>
            )}
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setShowCancel(false)}>
                Keep subscription
              </button>
              <button
                className="btn-danger flex-1"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate('User requested cancellation')}
              >
                {cancel.isPending ? 'Cancelling…' : 'Yes, cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
