import React, { useState } from 'react';
import Input from '../common/Input';
import Button from '../common/Button';
import { providerConnectionsApi } from '../../services/api';

/**
 * ProviderForm — rendered inside a collapsible panel when the user clicks
 * "Configure" or "Update Keys" on a ProviderCard.
 *
 * Props:
 *   provider   — provider slug ('stripe' | 'airwallex' | 'wise')
 *   meta       — PROVIDER_META entry (labels, placeholders, etc.)
 *   existing   — existing connection object (for edit mode) or null
 *   environment — 'live' | 'test'
 *   onSuccess  — callback(connection) when upsert succeeds
 *   onCancel   — callback when form is dismissed
 */
export default function ProviderForm({ provider, meta, existing, environment = 'test', onSuccess, onCancel }) {
  const [form, setForm] = useState({
    displayName: existing?.display_name || `${meta?.label || provider} ${environment === 'live' ? 'Live' : 'Test'}`,
    secretKey: '',
    publishableKey: '',
    webhookSecret: '',
    extraCredential: '',
    webhookEndpointUrl: existing?.webhook_endpoint_url || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.secretKey && !existing) {
      setError(`${meta?.keyLabel || 'Secret key'} is required`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        provider,
        environment,
        displayName: form.displayName,
        secretKey: form.secretKey || undefined,
        publishableKey: form.publishableKey || undefined,
        webhookSecret: form.webhookSecret || undefined,
        extraCredential: form.extraCredential || undefined,
        webhookEndpointUrl: form.webhookEndpointUrl || undefined,
      };

      // Upsert (creates or updates existing connection)
      const { data } = await providerConnectionsApi.upsert(payload);
      onSuccess(data);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.details?.[0]?.message || 'Failed to save connection');
    }
    setSaving(false);
  };

  const isEdit = !!existing;

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        padding: 20,
        marginTop: 12,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 14 }}>
        {isEdit ? 'Update Connection' : 'Configure Connection'} — {meta?.label}
        <span
          style={{
            marginLeft: 8,
            background: environment === 'live' ? 'var(--color-danger-light)' : 'var(--color-warning-light)',
            color: environment === 'live' ? 'var(--color-danger)' : 'var(--color-warning)',
            padding: '1px 7px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {environment.toUpperCase()}
        </span>
      </div>

      {error && (
        <div style={{ background: 'var(--color-danger-light)', border: '1px solid var(--color-danger)', borderRadius: 6, padding: '8px 12px', color: 'var(--color-danger)', fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input
          label="Display Name"
          name="displayName"
          value={form.displayName}
          onChange={set('displayName')}
          placeholder="My Stripe Live Key"
          required
        />

        <Input
          label={isEdit ? `${meta?.keyLabel || 'Secret Key'} (leave blank to keep existing)` : `${meta?.keyLabel || 'Secret Key'} *`}
          type="password"
          name="secretKey"
          value={form.secretKey}
          onChange={set('secretKey')}
          placeholder={meta?.keyPlaceholder || 'secret key…'}
          required={!isEdit}
          hint={isEdit ? 'Only fill if you want to replace the existing key' : undefined}
        />

        {meta?.publishableKeyLabel && (
          <Input
            label={`${meta.publishableKeyLabel} (optional)`}
            type="password"
            name="publishableKey"
            value={form.publishableKey}
            onChange={set('publishableKey')}
            placeholder={meta.publishableKeyPlaceholder || ''}
            hint={isEdit ? 'Leave blank to keep existing' : undefined}
          />
        )}

        {meta?.webhookSecretLabel && (
          <Input
            label={`${meta.webhookSecretLabel} (optional)`}
            type="password"
            name="webhookSecret"
            value={form.webhookSecret}
            onChange={set('webhookSecret')}
            placeholder={meta.webhookSecretPlaceholder || ''}
            hint={isEdit ? 'Leave blank to keep existing' : undefined}
          />
        )}

        {meta?.extraCredentialLabel && (
          <Input
            label={`${meta.extraCredentialLabel} (optional)`}
            name="extraCredential"
            value={form.extraCredential}
            onChange={set('extraCredential')}
            placeholder={meta.extraCredentialPlaceholder || ''}
            hint={isEdit ? 'Leave blank to keep existing' : undefined}
          />
        )}

        <Input
          label="Webhook Endpoint URL (optional)"
          type="url"
          name="webhookEndpointUrl"
          value={form.webhookEndpointUrl}
          onChange={set('webhookEndpointUrl')}
          placeholder="https://yourdomain.com/webhooks/stripe"
          hint="The URL you registered at the provider for incoming webhooks"
        />
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <Button type="submit" loading={saving} size="sm">
          {isEdit ? 'Update' : 'Save & Configure'}
        </Button>
        <Button variant="ghost" type="button" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        {meta?.docsUrl && (
          <a
            href={meta.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-subtle)', alignSelf: 'center', textDecoration: 'underline' }}
          >
            {meta.label} Docs ↗
          </a>
        )}
      </div>
    </form>
  );
}
