import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';

/**
 * SubscriptionBanner
 *
 * Renders a persistent top-of-page banner depending on subscription state:
 *  - trialing (>= 5 days left):   soft info banner with countdown
 *  - trialing (<  5 days left):   urgent warning banner
 *  - hibernating / cancelled:     full-width error banner with upgrade CTA
 *  - active:                      nothing
 */
const SubscriptionBanner = () => {
  const subscription = useSelector((s) => s.auth.subscription);
  const org = useSelector((s) => s.auth.org);
  const [dismissed, setDismissed] = useState(false);

  if (!subscription || subscription.status === 'active') return null;
  if (dismissed && subscription.status === 'trialing') return null;

  const { status, daysRemaining, trialEndsAt } = subscription;

  if (status === 'hibernating' || status === 'cancelled') {
    return (
      <div className="w-full bg-red-600 text-white px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-lg">🔒</span>
            <div>
              <p className="font-semibold text-sm">
                {status === 'cancelled'
                  ? 'Your subscription has been cancelled.'
                  : 'Account in Data Hibernation mode.'}
              </p>
              <p className="text-xs text-red-100">
                You can view existing data but payment integrations and API features are
                locked.{' '}
                <Link to="/settings/billing" className="underline font-medium">
                  Reactivate now →
                </Link>
              </p>
            </div>
          </div>
          <Link
            to="/settings/billing"
            className="shrink-0 bg-white text-red-600 text-xs font-semibold
              px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            Upgrade plan
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'trialing') {
    const urgent = typeof daysRemaining === 'number' && daysRemaining <= 4;
    const formattedEnd = trialEndsAt
      ? new Date(trialEndsAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : null;

    return (
      <div
        className={`w-full px-4 py-2.5 ${
          urgent ? 'bg-orange-500 text-white' : 'bg-indigo-50 border-b border-indigo-100 text-indigo-800'
        }`}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span>{urgent ? '⚠️' : '⏳'}</span>
            <span>
              {urgent ? (
                <>
                  <strong>Trial expires {daysRemaining <= 0 ? 'today' : `in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`}</strong>
                  {formattedEnd && ` (${formattedEnd})`}. Upgrade to keep full access.
                </>
              ) : (
                <>
                  Free trial active —{' '}
                  <strong>
                    {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining
                  </strong>
                  {formattedEnd && ` (ends ${formattedEnd})`}.
                  {org?.type === 'agency' &&
                    ` Team limited to ${subscription.trialMemberLimit} members during trial.`}
                </>
              )}
              {' '}
              <Link
                to="/settings/billing"
                className={`font-semibold underline ml-1 ${urgent ? 'text-white' : 'text-indigo-600'}`}
              >
                View plans
              </Link>
            </span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className={`text-lg opacity-60 hover:opacity-100 transition-opacity ${
              urgent ? 'text-white' : 'text-indigo-500'
            }`}
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default SubscriptionBanner;
