import React from 'react';
import { useSelector } from 'react-redux';

const STATUS_CONFIG = {
  trialing: { label: 'Free Trial', color: 'var(--color-primary)', bg: 'var(--color-primary-light)', icon: '🕐' },
  active: { label: 'Active', color: 'var(--color-success)', bg: 'var(--color-success-light)', icon: '✅' },
  hibernating: { label: 'Hibernating', color: 'var(--color-danger)', bg: 'var(--color-danger-light)', icon: '🔒' },
  cancelled: { label: 'Cancelled', color: 'var(--color-text-muted)', bg: 'rgba(100,116,139,0.15)', icon: '⛔' },
};

/**
 * Small inline badge showing the current subscription status.
 * Safe to render anywhere in the sidebar or header.
 */
export default function SubscriptionStatus() {
  const sub = useSelector((s) => s.auth.subscription);
  if (!sub) return null;

  const cfg = STATUS_CONFIG[sub.status] || STATUS_CONFIG.trialing;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.color}`,
        borderRadius: 999,
        padding: '2px 10px',
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {cfg.icon} {cfg.label}
      {sub.status === 'trialing' && sub.trialDaysRemaining != null && (
        <span style={{ opacity: 0.8 }}>· {sub.trialDaysRemaining}d left</span>
      )}
    </span>
  );
}
