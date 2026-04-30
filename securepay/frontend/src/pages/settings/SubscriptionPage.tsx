import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import { format } from 'date-fns';
import {
  ShieldCheck, Zap, Users, Key, CheckCircle2, Lock, AlertTriangle, Clock,
} from 'lucide-react';
import Spinner from '../../components/common/Spinner';
import StatusBadge from '../../components/common/StatusBadge';
import clsx from 'clsx';

async function fetchSubscription() {
  const r = await apiClient.get('/subscription/status');
  return r.data.data;
}

function AccessRow({ label, enabled, note }: { label: string; enabled: boolean; note?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {note && <p className="text-xs text-gray-400">{note}</p>}
      </div>
      {enabled
        ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        : <Lock className="h-5 w-5 text-gray-300" />
      }
    </div>
  );
}

export default function SubscriptionPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const isOwner = user?.role === 'owner';

  const { data, isLoading } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: fetchSubscription,
  });

  const reactivateMutation = useMutation({
    mutationFn: () => apiClient.post('/subscription/reactivate', {
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscription-status'] });
      qc.invalidateQueries({ queryKey: ['subscription-banner'] });
    },
  });

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;

  const { subscription, access, limits } = data ?? {};
  const isHibernated = access?.dataReadOnly;
  const isTrialing   = subscription?.status === 'trialing';
  const trialDays    = subscription?.trialDaysRemaining;

  const statusColors: Record<string, string> = {
    full:       'text-emerald-600 bg-emerald-50 border-emerald-200',
    grace:      'text-amber-700 bg-amber-50 border-amber-200',
    hibernated: 'text-red-700 bg-red-50 border-red-200',
    locked:     'text-red-700 bg-red-50 border-red-200',
    past_due:   'text-amber-700 bg-amber-50 border-amber-200',
    full_paid:  'text-emerald-600 bg-emerald-50 border-emerald-200',
    unknown:    'text-gray-600 bg-gray-50 border-gray-200',
  };
  const colorClass = statusColors[access?.accessStatus ?? 'unknown'] ?? statusColors.unknown;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Subscription</h1>
        <p className="text-gray-500">Manage your plan and monitor feature access</p>
      </div>

      {/* Access status card */}
      <div className={clsx('rounded-2xl border p-6', colorClass)}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {isHibernated
                ? <Lock className="h-5 w-5" />
                : access?.accessStatus === 'full'
                  ? <CheckCircle2 className="h-5 w-5" />
                  : <AlertTriangle className="h-5 w-5" />
              }
              <p className="font-semibold text-lg capitalize">
                {access?.accessStatus === 'full' ? 'Active' : access?.accessStatus?.replace('_', ' ')}
              </p>
              {subscription?.status && (
                <StatusBadge status={subscription.status} />
              )}
            </div>
            {access?.reason && <p className="mt-1 text-sm opacity-80">{access.reason}</p>}
          </div>
          {isTrialing && trialDays !== null && trialDays !== undefined && (
            <div className="text-right flex-shrink-0">
              <p className="text-3xl font-bold">{trialDays}</p>
              <p className="text-xs opacity-70">days left</p>
            </div>
          )}
        </div>

        {subscription?.trialEnd && isTrialing && (
          <div className="mt-3 flex items-center gap-1.5 text-xs opacity-70">
            <Clock className="h-3.5 w-3.5" />
            Trial ends {format(new Date(subscription.trialEnd), 'MMMM d, yyyy')}
          </div>
        )}
      </div>

      {/* Feature access breakdown */}
      <div className="card">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Feature Access</h2>
        <AccessRow
          label="View & Export Data"
          enabled={true}
          note="Always available — your data is always yours"
        />
        <AccessRow
          label="Payment Processing (API)"
          enabled={access?.apiAccess ?? false}
          note="Create payments, refunds, charge customers"
        />
        <AccessRow
          label="Autofill Integration"
          enabled={access?.autofillAccess ?? false}
          note="Browser extension and SDK autofill features"
        />
        <AccessRow
          label="Team Collaboration"
          enabled={!isHibernated}
          note={limits?.trialEmployeeCap != null
            ? `Trial: up to ${limits.trialEmployeeCap} employees`
            : 'Unlimited team members on paid plan'
          }
        />
        <AccessRow
          label="API Key Management"
          enabled={!isHibernated}
          note="Add, test and manage provider integrations"
        />
      </div>

      {/* Plan limits */}
      {limits && (
        <div className="card space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Plan Limits</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
                <Users className="h-4 w-4 text-brand-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  {limits.trialEmployeeCap != null
                    ? `${limits.currentEmployeeCount} / ${limits.trialEmployeeCap}`
                    : limits.maxUsers === -1 ? 'Unlimited' : limits.maxUsers
                  }
                </p>
                <p className="text-xs text-gray-400">Team members</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
                <Key className="h-4 w-4 text-brand-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">{limits.maxApiKeys === -1 ? 'Unlimited' : limits.maxApiKeys}</p>
                <p className="text-xs text-gray-400">API keys</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscription history events */}
      <SubscriptionEventLog />

      {/* Reactivation / upgrade CTA */}
      {isOwner && (
        <div className="card border-brand-200 bg-brand-50">
          <div className="flex items-start gap-3">
            <Zap className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-600" />
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">
                {isHibernated ? 'Restore full access' : 'Upgrade your plan'}
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                {isHibernated
                  ? 'Your data is preserved and waiting. Subscribe to unlock API access, autofill, and team features.'
                  : 'Unlock unlimited team members, advanced analytics, and priority support.'
                }
              </p>
              {isHibernated && (
                <p className="mt-1 text-xs text-gray-400">
                  (In production this button triggers payment checkout. For testing, click to simulate reactivation.)
                </p>
              )}
            </div>
          </div>
          <div className="mt-4">
            {isHibernated ? (
              <button
                onClick={() => reactivateMutation.mutate()}
                disabled={reactivateMutation.isPending}
                className="btn-primary"
              >
                {reactivateMutation.isPending
                  ? <Spinner size="sm" className="text-white" />
                  : 'Reactivate Account'
                }
              </button>
            ) : (
              <button className="btn-primary" disabled>
                Upgrade Plan (Stripe Checkout)
              </button>
            )}
            {reactivateMutation.isSuccess && (
              <p className="mt-2 text-sm text-emerald-600">Account reactivated! Refresh to see updated access.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SubscriptionEventLog() {
  const { data: events, isLoading } = useQuery({
    queryKey: ['subscription-events'],
    queryFn: () => apiClient.get('/subscription/events').then((r) => r.data.data),
    staleTime: 60_000,
  });

  if (isLoading || !events?.length) return null;

  const eventLabels: Record<string, string> = {
    trial_started:       'Trial started',
    trial_expired:       'Trial expired → hibernated',
    reactivated:         'Account reactivated',
    payment_received:    'Payment received',
    payment_failed_lock: 'Payment failed — account locked',
    hibernated:          'Account hibernated',
  };

  return (
    <div className="card">
      <h2 className="mb-4 text-base font-semibold text-gray-900">Account History</h2>
      <div className="divide-y divide-gray-50">
        {events.slice(0, 10).map((e: any) => (
          <div key={e.id} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-gray-700">{eventLabels[e.event_type] ?? e.event_type}</span>
            <span className="text-xs text-gray-400">{format(new Date(e.created_at), 'MMM d, yyyy')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
