import React, { useState } from 'react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import ConnectionTestButton from './ConnectionTestButton';
import ProviderForm from './ProviderForm';
import { providerConnectionsApi } from '../../services/api';

const STATUS_BADGE = {
  unconfigured: 'default',
  configured:   'warning',
  verified:     'success',
  failed:       'danger',
};

const STATUS_ICON = {
  unconfigured: '⚪',
  configured:   '🟡',
  verified:     '🟢',
  failed:       '🔴',
};

const ENV_COLORS = {
  live: { bg: 'rgba(239,68,68,0.12)', text: 'var(--color-danger)', border: 'var(--color-danger)' },
  test: { bg: 'rgba(245,158,11,0.12)', text: 'var(--color-warning)', border: 'var(--color-warning)' },
};

/**
 * ProviderCard — displays one provider+environment connection with:
 * - Status badge (unconfigured / configured / verified / failed)
 * - Last test timestamp and latency
 * - "Configure" form (collapsible)
 * - "Test Connection" button
 * - Test log history toggle
 * - Deactivate action
 */
export default function ProviderCard({ provider, environment, connection, meta, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const env = ENV_COLORS[environment] || ENV_COLORS.test;
  const hasConnection = !!connection;
  const status = connection?.status || 'unconfigured';

  const handleFormSuccess = (newConn) => {
    setShowForm(false);
    onRefresh(newConn);
  };

  const handleTestResult = (testResult, updatedConn) => {
    onRefresh(updatedConn);
  };

  const loadLogs = async () => {
    if (!connection) return;
    setLoadingLogs(true);
    try {
      const { data } = await providerConnectionsApi.testLogs(connection.id);
      setLogs(data);
    } catch {}
    setLoadingLogs(false);
    setShowLogs(true);
  };

  const handleDeactivate = async () => {
    if (!connection || !window.confirm('Deactivate this connection? Your encrypted keys will be removed.')) return;
    setDeactivating(true);
    try {
      await providerConnectionsApi.deactivate(connection.id);
      onRefresh(null);
    } catch {}
    setDeactivating(false);
  };

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: `1px solid ${status === 'verified' ? 'var(--color-success)' : status === 'failed' ? 'var(--color-danger)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-md)',
        padding: 20,
        transition: 'border-color 0.2s',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: meta?.color ? `${meta.color}20` : 'var(--color-surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          {meta?.logo || '🔌'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>
              {meta?.label || provider}
            </span>
            <span
              style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                background: env.bg, color: env.text, border: `1px solid ${env.border}`,
              }}
            >
              {environment.toUpperCase()}
            </span>
            <Badge variant={STATUS_BADGE[status]}>
              {STATUS_ICON[status]} {status}
            </Badge>
          </div>

          {connection?.display_name && (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 2 }}>
              {connection.display_name}
            </div>
          )}
          {connection?.key_prefix && (
            <code style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>
              {connection.key_prefix}
            </code>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button
            variant={hasConnection ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : hasConnection ? '✏️ Update' : '+ Configure'}
          </Button>
          {hasConnection && (
            <Button variant="ghost" size="sm" loading={deactivating} onClick={handleDeactivate}>
              Deactivate
            </Button>
          )}
        </div>
      </div>

      {/* Last test info */}
      {connection?.last_test_at && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 12px',
            background: 'var(--color-surface-2)',
            borderRadius: 6,
            marginBottom: 12,
            fontSize: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: 'var(--color-text-muted)' }}>
            Last tested: {new Date(connection.last_test_at).toLocaleString()}
          </span>
          {connection.last_test_latency_ms != null && (
            <span style={{ color: 'var(--color-text-subtle)' }}>
              {connection.last_test_latency_ms} ms
            </span>
          )}
          {connection.last_test_message && (
            <span style={{ color: connection.last_test_success ? 'var(--color-success)' : 'var(--color-danger)', flex: 1 }}>
              {connection.last_test_message}
            </span>
          )}
          <button
            onClick={showLogs ? () => setShowLogs(false) : loadLogs}
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: 12, cursor: 'pointer', padding: 0 }}
          >
            {loadingLogs ? 'Loading…' : showLogs ? 'Hide history' : 'View history'}
          </button>
        </div>
      )}

      {/* Collapsible form */}
      {showForm && (
        <ProviderForm
          provider={provider}
          meta={meta}
          existing={connection}
          environment={environment}
          onSuccess={handleFormSuccess}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Test button — only shown when connection exists and form is hidden */}
      {hasConnection && !showForm && (
        <ConnectionTestButton
          connectionId={connection.id}
          onResult={handleTestResult}
          size="sm"
        />
      )}

      {/* Test log history */}
      {showLogs && logs.length > 0 && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            Test History (last 20)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {logs.map((log) => (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 12,
                  padding: '6px 10px',
                  background: log.success ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                  borderRadius: 4,
                  flexWrap: 'wrap',
                }}
              >
                <span>{log.success ? '✅' : '❌'}</span>
                <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
                  {new Date(log.created_at).toLocaleString()}
                </span>
                {log.latency_ms != null && (
                  <span style={{ color: 'var(--color-text-subtle)' }}>{log.latency_ms}ms</span>
                )}
                <span style={{ flex: 1, color: 'var(--color-text-muted)' }}>{log.response_summary}</span>
                {log.triggered_by_name && (
                  <span style={{ color: 'var(--color-text-subtle)', fontSize: 11 }}>by {log.triggered_by_name}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
