import React from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';

/**
 * Wraps any UI element that should be visually disabled during hibernation.
 * The child is rendered with reduced opacity and a lock tooltip.
 *
 * Usage:
 *   <FeatureLock>
 *     <Button>Create Payment</Button>
 *   </FeatureLock>
 *
 * When subscription is active/trialing, the child renders normally.
 */
export default function FeatureLock({ children, message }) {
  const sub = useSelector((s) => s.auth.subscription);
  const locked = sub?.featuresLocked;

  if (!locked) return children;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div
        style={{
          opacity: 0.4,
          pointerEvents: 'none',
          userSelect: 'none',
          filter: 'grayscale(0.5)',
        }}
      >
        {children}
      </div>
      <div
        title={message || 'Reactivate your subscription to use this feature'}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'not-allowed',
        }}
      >
        <Link
          to="/settings/billing"
          style={{
            background: 'var(--color-danger)',
            color: '#fff',
            borderRadius: 4,
            padding: '3px 10px',
            fontSize: 11,
            fontWeight: 600,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          🔒 Locked
        </Link>
      </div>
    </div>
  );
}

/**
 * Inline lock badge — use inside table rows or list items.
 */
export function LockBadge() {
  const sub = useSelector((s) => s.auth.subscription);
  if (!sub?.featuresLocked) return null;
  return (
    <span
      style={{
        background: 'var(--color-danger-light)',
        color: 'var(--color-danger)',
        border: '1px solid var(--color-danger)',
        borderRadius: 4,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      🔒 Hibernating
    </span>
  );
}
