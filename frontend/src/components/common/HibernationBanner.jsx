import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { subscriptionApi } from '../../services/api';
import { updateSubscription } from '../../store/slices/authSlice';

/**
 * Full-width hibernation banner. Shown when subscription_status = 'hibernating'.
 *
 * Data Hibernation mode behaviour:
 *   ✅  User can log in and browse all historical data (payments, keys list, team)
 *   🔒  Creating payments, using API keys, or adding members is blocked
 *
 * This component renders a prominent banner with a "Reactivate" action that
 * calls POST /subscription/activate (simulates payment confirmation in demo mode).
 */
export default function HibernationBanner() {
  const dispatch = useDispatch();
  const sub = useSelector((s) => s.auth.subscription);
  const [reactivating, setReactivating] = useState(false);
  const [error, setError] = useState('');

  if (!sub || sub.status !== 'hibernating') return null;

  const expiredAt = sub.hibernatedAt
    ? new Date(sub.hibernatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'recently';

  const handleReactivate = async () => {
    setReactivating(true);
    setError('');
    try {
      const { data } = await subscriptionApi.activate({ durationDays: 30, note: 'Reactivated via billing page' });
      dispatch(updateSubscription(data.subscription));
    } catch (err) {
      setError(err.response?.data?.error || 'Reactivation failed. Please try again.');
    }
    setReactivating(false);
  };

  return (
    <>
      {/* Semi-transparent page overlay hint — not full block, user can still scroll */}
      <div
        style={{
          background: 'rgba(239, 68, 68, 0.06)',
          border: '1px solid var(--color-danger)',
          borderRadius: 'var(--radius-md)',
          padding: '20px 24px',
          margin: '16px 36px 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>🔒</span>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-danger)' }}>
                Account in Data Hibernation
              </h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.7, marginBottom: 12 }}>
              Your subscription expired on <strong style={{ color: 'var(--color-text)' }}>{expiredAt}</strong>.
              You can still view all your historical data below, but the following features are&nbsp;
              <strong style={{ color: 'var(--color-danger)' }}>locked until reactivation</strong>:
            </p>
            <ul
              style={{
                listStyle: 'none',
                display: 'flex',
                gap: 16,
                flexWrap: 'wrap',
                fontSize: 12,
                marginBottom: 16,
              }}
            >
              {[
                '💳 Create new payments',
                '🔑 Add / rotate API keys',
                '🌐 Provider API calls (Stripe/Airwallex)',
                '👥 Add team members',
              ].map((item) => (
                <li
                  key={item}
                  style={{
                    background: 'var(--color-danger-light)',
                    border: '1px solid var(--color-danger)',
                    borderRadius: 4,
                    padding: '3px 10px',
                    color: 'var(--color-danger)',
                    fontWeight: 500,
                  }}
                >
                  {item}
                </li>
              ))}
            </ul>

            {error && (
              <div style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, minWidth: 160 }}>
            <button
              onClick={handleReactivate}
              disabled={reactivating}
              style={{
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 600,
                cursor: reactivating ? 'not-allowed' : 'pointer',
                opacity: reactivating ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                justifyContent: 'center',
              }}
            >
              {reactivating && (
                <span
                  style={{
                    width: 13,
                    height: 13,
                    border: '2px solid #fff',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    display: 'inline-block',
                    animation: 'spin 0.7s linear infinite',
                  }}
                />
              )}
              {reactivating ? 'Processing…' : '⚡ Reactivate Plan'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--color-text-subtle)', textAlign: 'center' }}>
              Your data is safe and waiting
            </span>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
