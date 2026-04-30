import React from 'react';

export default function Card({ children, title, subtitle, action, style = {}, padding = '24px' }) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        ...style,
      }}
    >
      {(title || action) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `16px ${padding}`,
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div>
            {title && <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>{title}</h3>}
            {subtitle && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div style={{ padding }}>{children}</div>
    </div>
  );
}
