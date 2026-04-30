import React from 'react';

const colorMap = {
  success: { bg: 'var(--color-success-light)', text: 'var(--color-success)' },
  danger: { bg: 'var(--color-danger-light)', text: 'var(--color-danger)' },
  warning: { bg: 'var(--color-warning-light)', text: 'var(--color-warning)' },
  primary: { bg: 'var(--color-primary-light)', text: 'var(--color-primary)' },
  default: { bg: 'rgba(148,163,184,0.15)', text: 'var(--color-text-muted)' },
};

export default function Badge({ children, variant = 'default' }) {
  const colors = colorMap[variant] || colorMap.default;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        background: colors.bg,
        color: colors.text,
      }}
    >
      {children}
    </span>
  );
}
