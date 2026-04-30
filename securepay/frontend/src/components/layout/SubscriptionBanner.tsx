import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import { AlertTriangle, Lock, Clock } from 'lucide-react';
import clsx from 'clsx';

interface AccessData {
  apiAccess: boolean;
  autofillAccess: boolean;
  dataReadOnly: boolean;
  accessStatus: string;
  reason: string | null;
}

interface SubscriptionData {
  trialDaysRemaining: number | null;
  status: string;
  trialEnd: string | null;
}

interface StatusResponse {
  subscription: SubscriptionData | null;
  access: AccessData;
}

async function fetchStatus(): Promise<StatusResponse> {
  const r = await apiClient.get('/subscription/status');
  return r.data.data;
}

export default function SubscriptionBanner() {
  const { data } = useQuery({
    queryKey: ['subscription-banner'],
    queryFn: fetchStatus,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  if (!data) return null;

  const { subscription, access } = data;

  // Nothing to show if fully active
  if (access.accessStatus === 'full' && subscription?.status === 'active') return null;
  if (access.accessStatus === 'full' && (subscription?.trialDaysRemaining ?? 99) > 5) return null;

  let variant: 'warning' | 'error' | 'info' = 'info';
  let icon = Clock;
  let message = '';
  let cta = 'Upgrade';

  if (access.accessStatus === 'hibernated' || access.dataReadOnly) {
    variant = 'error';
    icon = Lock;
    message = access.reason || 'Your account is hibernated. Subscribe to restore full access.';
    cta = 'Reactivate';
  } else if (access.accessStatus === 'grace') {
    variant = 'warning';
    icon = AlertTriangle;
    message = access.reason || 'Trial expired. Grace period active.';
    cta = 'Subscribe now';
  } else if (access.accessStatus === 'past_due') {
    variant = 'warning';
    icon = AlertTriangle;
    message = 'Your payment is past due. Update your billing to avoid interruption.';
    cta = 'Update billing';
  } else if (subscription?.trialDaysRemaining !== null && subscription?.trialDaysRemaining !== undefined) {
    const days = subscription.trialDaysRemaining;
    variant = days <= 3 ? 'warning' : 'info';
    icon = days <= 3 ? AlertTriangle : Clock;
    message = days === 0
      ? 'Your trial ends today.'
      : `Your free trial ends in ${days} day${days !== 1 ? 's' : ''}.`;
    cta = 'Subscribe';
  } else {
    return null;
  }

  const Icon = icon;

  const styles = {
    info:    'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    error:   'bg-red-50 border-red-200 text-red-800',
  };

  const iconStyles = {
    info:    'text-blue-500',
    warning: 'text-amber-500',
    error:   'text-red-500',
  };

  return (
    <div className={clsx('flex items-center justify-between gap-4 border-b px-6 py-2.5 text-sm', styles[variant])}>
      <div className="flex items-center gap-2">
        <Icon className={clsx('h-4 w-4 flex-shrink-0', iconStyles[variant])} />
        <span>{message}</span>
      </div>
      <Link
        to="/settings/subscription"
        className={clsx(
          'flex-shrink-0 rounded-lg px-3 py-1 text-xs font-semibold transition-colors',
          variant === 'error'   ? 'bg-red-600 text-white hover:bg-red-700'
          : variant === 'warning' ? 'bg-amber-500 text-white hover:bg-amber-600'
          : 'bg-blue-600 text-white hover:bg-blue-700',
        )}
      >
        {cta}
      </Link>
    </div>
  );
}
