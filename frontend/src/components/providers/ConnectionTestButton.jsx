import React, { useState } from 'react';
import { providerConnectionsApi } from '../../services/api';

const ResultPill = ({ result }) => {
  if (!result) return null;
  const ok = result.success;
  return (
    <div
      style={{
        marginTop: 12,
        padding: '10px 14px',
        background: ok ? 'var(--color-success-light)' : 'var(--color-danger-light)',
        border: `1px solid ${ok ? 'var(--color-success)' : 'var(--color-danger)'}`,
        borderRadius: 'var(--radius-sm)',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>{ok ? '✅' : '❌'}</span>
        <strong style={{ color: ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {ok ? 'Connection verified' : 'Connection failed'}
        </strong>
        {result.latencyMs != null && (
          <span style={{ color: 'var(--color-text-subtle)', marginLeft: 'auto', fontSize: 12 }}>
            {result.latencyMs} ms
          </span>
        )}
      </div>
      <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.5, margin: 0 }}>
        {result.summary}
      </p>
      {result.errorCode && !ok && (
        <code style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--color-text-subtle)' }}>
          {result.errorCode}
        </code>
      )}
    </div>
  );
};

/**
 * Self-contained "Test Connection" button that:
 * 1. Calls POST /provider-connections/:id/test
 * 2. Shows an inline result pill with latency + human message
 * 3. Calls onResult(testResult) so the parent can refresh the connection status
 */
export default function ConnectionTestButton({ connectionId, onResult, size = 'md' }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const { data } = await providerConnectionsApi.test(connectionId);
      setResult(data.testResult);
      if (onResult) onResult(data.testResult, data.connection);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Test failed';
      setResult({ success: false, latencyMs: null, summary: msg, errorCode: 'REQUEST_ERROR' });
    }
    setTesting(false);
  };

  const padding = size === 'sm' ? '6px 14px' : '8px 18px';
  const fontSize = size === 'sm' ? 12 : 13;

  return (
    <div>
      <button
        onClick={handleTest}
        disabled={testing}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding,
          background: testing ? 'var(--color-surface-2)' : 'var(--color-primary-light)',
          border: '1px solid var(--color-primary)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--color-primary)',
          fontSize,
          fontWeight: 600,
          cursor: testing ? 'not-allowed' : 'pointer',
          opacity: testing ? 0.7 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        {testing ? (
          <>
            <span
              style={{
                width: 12, height: 12,
                border: '2px solid var(--color-primary)',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'spin 0.7s linear infinite',
              }}
            />
            Testing…
          </>
        ) : '🔌 Test Connection'}
      </button>
      <ResultPill result={result} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
