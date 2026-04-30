/**
 * SubscriptionBanner
 *
 * Renders a persistent top-of-page banner when the subscription requires
 * user attention. Four visual states:
 *
 *   trialing (≤ 5 days)  → amber warning  "X days left in your trial"
 *   trialing (> 5 days)  → blue info      "Trial ends in X days"
 *   expired / cancelled  → red locked     "Data Hibernation — renew to unlock"
 *   past_due             → orange alert   "Payment failed — update billing"
 *
 * The banner is invisible when the subscription is 'active' or 'trialing'
 * with many days left (> 5).
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, Lock, CreditCard, X } from 'lucide-react';
import { useSubscription } from '../../contexts/SubscriptionContext';

const SHOW_TRIAL_BANNER_DAYS = 5;

export default function SubscriptionBanner() {
  const { subscription } = useSubscription();
  const navigate          = useNavigate();
  const [dismissed, setDismissed] = React.useState(false);

  if (!subscription || dismissed) return null;

  const { status, trialDaysRemaining, isHibernated } = subscription;

  // Determine whether to show and what to show
  let variant = null;
  let icon    = null;
  let message = null;
  let cta     = null;

  if (status === 'trialing') {
    if (trialDaysRemaining <= 0) {
      // Edge case: expired but status not yet flushed to DB
      variant = 'red';
      icon    = <Lock className="h-4 w-4" />;
      message = 'Your trial has ended. Platform features are locked.';
      cta     = 'Renew Now';
    } else if (trialDaysRemaining <= SHOW_TRIAL_BANNER_DAYS) {
      variant = 'amber';
      icon    = <Clock className="h-4 w-4" />;
      message = `Your free trial ends in ${trialDaysRemaining} day${trialDaysRemaining === 1 ? '' : 's'}.`;
      cta     = 'Upgrade';
    } else {
      // Show soft blue info banner for first 2 days of trial
      if (trialDaysRemaining >= (subscription.trialDays ?? 30) - 2) {
        variant = 'blue';
        icon    = <Clock className="h-4 w-4" />;
        message = `Welcome! You're on a free trial — ${trialDaysRemaining} days remaining.`;
        cta     = 'View Plans';
      }
      // Otherwise: no banner
    }
  } else if (isHibernated) {
    variant = 'red';
    icon    = <Lock className="h-4 w-4" />;
    message = status === 'cancelled'
      ? 'Your subscription was cancelled. Your data is safe — renew to unlock all features.'
      : 'Your subscription has expired. Platform features are locked (Data Hibernation).';
    cta = 'Renew Now';
  } else if (status === 'past_due') {
    variant = 'orange';
    icon    = <CreditCard className="h-4 w-4" />;
    message = 'Your last payment failed. Please update your billing information to avoid interruption.';
    cta     = 'Update Billing';
  }

  if (!variant) return null;

  const styles = {
    red:    'bg-red-600 text-white',
    amber:  'bg-amber-500 text-white',
    orange: 'bg-orange-500 text-white',
    blue:   'bg-primary-600 text-white',
  };

  return (
    <div className={`${styles[variant]} px-4 py-2.5 flex items-center justify-between gap-4`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        <span>{message}</span>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {cta && (
          <button
            onClick={() => navigate('/settings/org')}
            className="rounded bg-white/20 hover:bg-white/30 transition px-3 py-1 text-xs font-semibold"
          >
            {cta}
          </button>
        )}
        {status !== 'expired' && status !== 'cancelled' && (
          <button
            onClick={() => setDismissed(true)}
            className="opacity-70 hover:opacity-100 transition"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
