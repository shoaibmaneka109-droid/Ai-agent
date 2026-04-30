import React, { useState } from 'react';

export default function Input({
  label,
  error,
  type = 'text',
  hint,
  required,
  style = {},
  ...props
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      {label && (
        <label
          style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)' }}
          htmlFor={props.id || props.name}
        >
          {label}
          {required && <span style={{ color: 'var(--color-danger)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        <input
          type={isPassword && showPassword ? 'text' : type}
          id={props.id || props.name}
          style={{
            width: '100%',
            padding: '10px 14px',
            paddingRight: isPassword ? 42 : 14,
            background: 'var(--color-surface-2)',
            border: `1px solid ${error ? 'var(--color-danger)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text)',
            fontSize: 14,
            outline: 'none',
            transition: 'border-color var(--transition)',
          }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; }}
          onBlur={(e) => { e.target.style.borderColor = error ? 'var(--color-danger)' : 'var(--color-border)'; }}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted)',
              fontSize: 13,
              cursor: 'pointer',
              padding: 2,
            }}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {hint && !error && <span style={{ fontSize: 12, color: 'var(--color-text-subtle)' }}>{hint}</span>}
      {error && <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</span>}
    </div>
  );
}
