import React from 'react';

const variants = {
  primary: {
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
  },
  secondary: {
    background: 'var(--color-surface-2)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
  },
  danger: {
    background: 'var(--color-danger)',
    color: '#fff',
    border: 'none',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text-muted)',
    border: '1px solid var(--color-border)',
  },
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  style = {},
  ...props
}) {
  const padding = size === 'sm' ? '6px 14px' : size === 'lg' ? '12px 28px' : '9px 20px';
  const fontSize = size === 'sm' ? '13px' : size === 'lg' ? '15px' : '14px';

  return (
    <button
      disabled={disabled || loading}
      style={{
        ...variants[variant],
        padding,
        fontSize,
        fontWeight: 500,
        borderRadius: 'var(--radius-sm)',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.6 : 1,
        transition: 'background var(--transition), opacity var(--transition)',
        width: fullWidth ? '100%' : 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        justifyContent: 'center',
        ...style,
      }}
      {...props}
    >
      {loading && (
        <span
          style={{
            width: 14,
            height: 14,
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'spin 0.7s linear infinite',
          }}
        />
      )}
      {children}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
