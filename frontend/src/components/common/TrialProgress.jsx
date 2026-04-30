import React from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';

/**
 * TrialProgress
 *
 * A compact pill/card showing how many trial days remain.
 * Used in the Sidebar and Settings page.
 */
const TrialProgress = () => {
  const subscription = useSelector((s) => s.auth.subscription);
  const org = useSelector((s) => s.auth.org);

  if (!subscription || subscription.status !== 'trialing') return null;

  const { daysRemaining, trialMemberLimit } = subscription;
  const totalDays = org?.type === 'agency' ? 30 : 15;
  const daysUsed = totalDays - (daysRemaining ?? 0);
  const pct = Math.min(100, Math.max(0, (daysUsed / totalDays) * 100));
  const urgent = typeof daysRemaining === 'number' && daysRemaining <= 4;

  return (
    <div className={`rounded-lg px-3 py-3 mx-3 mb-3 border ${urgent ? 'bg-orange-900/30 border-orange-700' : 'bg-gray-800 border-gray-700'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-300">
          Free Trial
        </span>
        <span className={`text-xs font-bold ${urgent ? 'text-orange-300' : 'text-indigo-300'}`}>
          {daysRemaining != null ? (
            daysRemaining <= 0 ? 'Expires today' : `${daysRemaining}d left`
          ) : '—'}
        </span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-1.5 mb-2">
        <div
          className={`h-1.5 rounded-full transition-all ${urgent ? 'bg-orange-400' : 'bg-indigo-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {org?.type === 'agency' && trialMemberLimit && (
        <p className="text-xs text-gray-400 mb-1.5">
          Up to {trialMemberLimit} team members
        </p>
      )}
      <Link
        to="/settings/billing"
        className={`block text-center text-xs font-semibold py-1 rounded ${
          urgent
            ? 'text-orange-200 hover:text-orange-100'
            : 'text-indigo-300 hover:text-indigo-200'
        }`}
      >
        Upgrade plan →
      </Link>
    </div>
  );
};

export default TrialProgress;
