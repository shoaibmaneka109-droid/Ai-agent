import React from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';

/**
 * HibernationGate
 *
 * Wraps a section of the UI that should be blurred/disabled when the account
 * is in Data Hibernation. Shows an overlay with an upgrade CTA.
 *
 * Usage:
 *   <HibernationGate feature="Payment Intents">
 *     <CreatePaymentForm />
 *   </HibernationGate>
 */
const HibernationGate = ({ children, feature = 'This feature' }) => {
  const subscription = useSelector((s) => s.auth.subscription);

  const isLocked =
    subscription &&
    (subscription.status === 'hibernating' || subscription.status === 'cancelled');

  if (!isLocked) return <>{children}</>;

  return (
    <div className="relative">
      {/* Blurred content */}
      <div className="pointer-events-none select-none blur-sm opacity-40" aria-hidden>
        {children}
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div className="bg-white rounded-2xl shadow-lg border border-red-200 px-8 py-6 text-center max-w-sm mx-4">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">🔒</span>
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Feature Locked</h3>
          <p className="text-sm text-gray-500 mb-4">
            <strong>{feature}</strong> is unavailable while your account is in Data
            Hibernation. Reactivate your subscription to restore full access.
          </p>
          <Link
            to="/settings/billing"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg
              bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Reactivate account
          </Link>
        </div>
      </div>
    </div>
  );
};

export default HibernationGate;
