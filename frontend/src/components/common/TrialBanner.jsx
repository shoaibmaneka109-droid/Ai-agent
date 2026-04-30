import React from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';

/**
 * Shown to trialing users at the top of every page.
 * Disappears once the user is on an active paid subscription.
 * Urgency colouring kicks in when ≤ 3 days remain.
 */
export default function TrialBanner() {
  const sub = useSelector((s) => s.auth.subscription);
  const org = useSelector((s) => s.auth.organization);

  if (!sub || sub.status !== 'trialing') return null;

  const days = sub.trialDaysRemaining ?? 0;
  const urgent = days <= 3;
  const planLabel = org?.planType === 'agency' ? 'Agency' : 'Solo';
  const trialLength = org?.planType === 'agency' ? 30 : 15;

  const bg = urgent ? 'var(--color-warning-light)' : 'var(--color-primary-light)';
  const border = urgent ? 'var(--color-warning)' : 'var(--color-primary)';
  const textColor = urgent ? 'var(--color-warning)' : 'var(--color-primary)';

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 'var(--radius-sm)',
        padding: '10px 20px',
        margin: '16px 36px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 16 }}>{urgent ? '⚠️' : '🕐'}</span>
        <span style={{ color: textColor, fontWeight: 500 }}>
          {planLabel} Free Trial:&nbsp;
        </span>
        <span style={{ color: 'var(--color-text)' }}>
          {days === 0
            ? 'Trial expires today!'
            : `${days} day${days === 1 ? '' : 's'} remaining of your ${trialLength}-day trial.`}
          {org?.planType === 'agency' && (
            <span style={{ color: 'var(--color-text-muted)', marginLeft: 8 }}>
              · Up to {sub.trialMemberLimit || 10} team members included
            </span>
          )}
        </span>
      </div>
      <Link
        to="/settings/billing"
        style={{
          background: textColor,
          color: '#fff',
          padding: '5px 14px',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          textDecoration: 'none',
        }}
      >
        Upgrade Now
      </Link>
    </div>
  );
}
