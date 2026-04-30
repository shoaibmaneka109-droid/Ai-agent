import React, { useEffect, useState, useCallback } from 'react';
import { providerConnectionsApi } from '../../services/api';
import ProviderCard from './ProviderCard';

const PROVIDERS = ['stripe', 'airwallex', 'wise'];
const ENVIRONMENTS = ['test', 'live'];

/**
 * ProviderSettingsPage — Self-service integration management for Admins/Owners.
 *
 * Architecture:
 * - One ProviderCard per (provider × environment) combination = 6 cards total
 * - Each card is fully self-contained: configure, test, view history, deactivate
 * - The page fetches PROVIDER_META once (static labels/logos/docs URLs) and the
 *   live connections list; the two are merged into a lookup by provider+environment
 * - No platform admin needed: clients manage their own keys end-to-end
 */
export default function ProviderSettingsPage() {
  const [meta, setMeta] = useState({});
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Build a (provider:env) → connection lookup
  const connectionMap = {};
  connections.forEach((c) => {
    connectionMap[`${c.provider}:${c.environment}`] = c;
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [metaRes, listRes] = await Promise.all([
        providerConnectionsApi.meta(),
        providerConnectionsApi.list(),
      ]);
      setMeta(metaRes.data || {});
      setConnections(listRes.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load integration data');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  /**
   * Called by a ProviderCard when its connection is created, updated, or deactivated.
   * `updatedConn` is null when deactivated.
   */
  const handleConnectionChange = (provider, environment, updatedConn) => {
    setConnections((prev) => {
      const key = `${provider}:${environment}`;
      if (!updatedConn) {
        // Deactivated — remove from list
        return prev.filter((c) => !(c.provider === provider && c.environment === environment));
      }
      // Upsert
      const exists = prev.some((c) => c.provider === provider && c.environment === environment);
      if (exists) {
        return prev.map((c) =>
          c.provider === provider && c.environment === environment ? updatedConn : c
        );
      }
      return [...prev, updatedConn];
    });
  };

  const verifiedCount = connections.filter((c) => c.status === 'verified').length;
  const configuredCount = connections.filter((c) => c.status !== 'unconfigured').length;

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Payment Integrations</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
          Configure your own Stripe, Airwallex, and Wise API keys. All secrets are encrypted
          with AES-256-GCM before storage. No platform admin required.
        </p>
      </div>

      {/* Summary bar */}
      <div
        style={{
          display: 'flex',
          gap: 20,
          marginBottom: 28,
          padding: '14px 20px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        {[
          { label: 'Providers', value: PROVIDERS.length, icon: '🔌' },
          { label: 'Configured', value: configuredCount, icon: '🟡' },
          { label: 'Verified', value: verifiedCount, icon: '🟢' },
          { label: 'Environments', value: ENVIRONMENTS.length, icon: '⚙️' },
        ].map(({ label, value, icon }) => (
          <div key={label} style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 20, marginBottom: 2 }}>{icon}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)' }}>{value}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ background: 'var(--color-danger-light)', border: '1px solid var(--color-danger)', borderRadius: 6, padding: '10px 14px', color: 'var(--color-danger)', fontSize: 13, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-muted)' }}>
          Loading integrations…
        </div>
      ) : (
        PROVIDERS.map((provider) => {
          const providerMeta = meta[provider];

          return (
            <div key={provider} style={{ marginBottom: 36 }}>
              {/* Provider section header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 14,
                  paddingBottom: 10,
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <span style={{ fontSize: 22 }}>{providerMeta?.logo || '🔌'}</span>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
                    {providerMeta?.label || provider}
                  </h2>
                  {providerMeta?.docsUrl && (
                    <a
                      href={providerMeta.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, color: 'var(--color-text-subtle)', textDecoration: 'underline' }}
                    >
                      Documentation ↗
                    </a>
                  )}
                </div>
              </div>

              {/* One card per environment */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {ENVIRONMENTS.map((env) => {
                  const conn = connectionMap[`${provider}:${env}`] || null;
                  return (
                    <ProviderCard
                      key={`${provider}:${env}`}
                      provider={provider}
                      environment={env}
                      connection={conn}
                      meta={providerMeta}
                      onRefresh={(updated) => handleConnectionChange(provider, env, updated)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* Security notice */}
      <div
        style={{
          marginTop: 8,
          padding: '14px 18px',
          background: 'var(--color-primary-light)',
          border: '1px solid var(--color-primary)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 13,
          color: 'var(--color-text-muted)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>🔒</span>
        <span>
          All API keys and webhook secrets are encrypted with{' '}
          <strong style={{ color: 'var(--color-text)' }}>AES-256-GCM</strong> before being written to the
          database. Plaintext values are held only in server memory during the Connection Test and are
          never logged or returned to the client. Only a safe key prefix is displayed in this UI.
        </span>
      </div>
    </div>
  );
}
