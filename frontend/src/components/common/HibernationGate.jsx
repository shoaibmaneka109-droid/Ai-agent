/**
 * HibernationGate
 *
 * Wraps any interactive section that must be LOCKED during Data Hibernation.
 * When the org is hibernated:
 *   - Renders a translucent overlay with a padlock and "Renew" CTA.
 *   - The underlying children are still rendered (but blurred) so users can
 *     see their data while understanding what is locked.
 *
 * Usage:
 *   <HibernationGate>
 *     <MyFeaturePanel />
 *   </HibernationGate>
 *
 * Optionally pass `message` to customise the lock text.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useSubscription } from '../../contexts/SubscriptionContext';

export default function HibernationGate({ children, message }) {
  const { subscription } = useSubscription();
  const navigate          = useNavigate();

  const hibernated = subscription?.isHibernated ?? false;

  return (
    <div className="relative">
      {/* Always render children so data is visible */}
      <div className={hibernated ? 'blur-[2px] pointer-events-none select-none' : ''}>
        {children}
      </div>

      {/* Overlay */}
      {hibernated && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center
                        rounded-xl bg-white/80 backdrop-blur-sm border-2 border-dashed border-red-300">
          <Lock className="h-10 w-10 text-red-400 mb-3" />
          <p className="text-sm font-semibold text-gray-800 text-center max-w-xs px-4">
            {message ?? 'This feature is locked. Your subscription has expired.'}
          </p>
          <p className="mt-1 text-xs text-gray-500 text-center max-w-xs px-4">
            Your data is safe. Renew your subscription to unlock all features.
          </p>
          <button
            onClick={() => navigate('/settings/org')}
            className="mt-4 btn-primary text-xs"
          >
            View Plans &amp; Renew
          </button>
        </div>
      )}
    </div>
  );
}
