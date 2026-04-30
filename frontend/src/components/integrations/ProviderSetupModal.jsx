import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import Button from '../common/Button';
import Input from '../common/Input';
import Alert from '../common/Alert';
import ConnectionStatus from '../common/ConnectionStatus';

/**
 * Provider-specific field schemas.
 * Each entry describes exactly what to ask for and includes documentation hints.
 */
const PROVIDER_SCHEMAS = {
  stripe: {
    name: 'Stripe',
    color: 'indigo',
    logo: '💳',
    docsUrl: 'https://dashboard.stripe.com/apikeys',
    fields: [
      {
        key: 'secretKey',
        label: 'Secret Key',
        placeholder: 'sk_live_… or sk_test_…',
        type: 'password',
        required: true,
        hint: 'Found in Stripe Dashboard → Developers → API Keys',
      },
      {
        key: 'publicKey',
        label: 'Publishable Key',
        placeholder: 'pk_live_… or pk_test_…',
        type: 'text',
        required: false,
        hint: 'Used for client-side Stripe.js. Not stored encrypted.',
      },
      {
        key: 'webhookSecret',
        label: 'Webhook Signing Secret',
        placeholder: 'whsec_…',
        type: 'password',
        required: false,
        hint: 'From Stripe Dashboard → Developers → Webhooks → your endpoint',
      },
    ],
    extraFields: [],
  },
  airwallex: {
    name: 'Airwallex',
    color: 'blue',
    logo: '🌐',
    docsUrl: 'https://www.airwallex.com/docs/api#/Authentication',
    fields: [
      {
        key: 'publicKey',
        label: 'Client ID',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        type: 'text',
        required: true,
        hint: 'Found in Airwallex Dashboard → API Keys',
      },
      {
        key: 'secretKey',
        label: 'API Key',
        placeholder: 'Your Airwallex API key',
        type: 'password',
        required: true,
        hint: 'From Airwallex Dashboard → API Keys',
      },
      {
        key: 'webhookSecret',
        label: 'Webhook Secret',
        placeholder: 'Optional webhook signing secret',
        type: 'password',
        required: false,
        hint: 'Set up in Airwallex Dashboard → Developers → Webhooks',
      },
    ],
    extraFields: [],
  },
  wise: {
    name: 'Wise',
    color: 'green',
    logo: '💚',
    docsUrl: 'https://docs.wise.com/api-docs/features/authentication-access',
    fields: [
      {
        key: 'secretKey',
        label: 'API Token',
        placeholder: 'Your Wise API token',
        type: 'password',
        required: true,
        hint: 'From Wise Account → Settings → API Tokens',
      },
      {
        key: 'webhookSecret',
        label: 'Webhook Public Key',
        placeholder: 'Optional webhook public key for signature verification',
        type: 'password',
        required: false,
        hint: 'Available in Wise → Developers → Webhooks',
      },
    ],
    extraFields: [
      {
        key: 'extraConfig.sandbox',
        label: 'Use Sandbox Environment',
        type: 'checkbox',
        hint: 'Tick this if you are using a Wise sandbox API token.',
      },
    ],
  },
  custom: {
    name: 'Custom Provider',
    color: 'gray',
    logo: '⚙️',
    docsUrl: null,
    fields: [
      {
        key: 'secretKey',
        label: 'API Secret / Bearer Token',
        placeholder: 'Your API secret key',
        type: 'password',
        required: true,
        hint: 'This will be AES-256-GCM encrypted before storage.',
      },
      {
        key: 'publicKey',
        label: 'Public Key / Client ID',
        placeholder: 'Optional public key or client ID',
        type: 'text',
        required: false,
        hint: 'Not encrypted.',
      },
      {
        key: 'webhookSecret',
        label: 'Webhook Secret',
        placeholder: 'Optional webhook signing secret',
        type: 'password',
        required: false,
        hint: 'AES-256-GCM encrypted.',
      },
    ],
    extraFields: [
      {
        key: 'extraConfig.testEndpoint',
        label: 'Connection Test Endpoint URL',
        type: 'text',
        placeholder: 'https://api.example.com/health',
        hint: 'GET request sent here during connection test. Must return 2xx.',
      },
    ],
  },
};

const ProviderSetupModal = ({ provider, existingKey, onSave, onClose }) => {
  const schema = PROVIDER_SCHEMAS[provider];
  const isEdit = Boolean(existingKey);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveAlert, setSaveAlert] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const { register, handleSubmit, getValues, formState: { errors } } = useForm({
    defaultValues: {
      label: existingKey?.label ?? `${schema?.name} Integration`,
      publicKey: existingKey?.publicKey ?? '',
    },
  });

  if (!schema) return null;

  const onSubmit = async (data) => {
    setSaving(true);
    setSaveAlert(null);
    try {
      // Build extraConfig from dotted keys
      const extraConfig = {};
      Object.entries(data).forEach(([k, v]) => {
        if (k.startsWith('extraConfig.')) {
          const subKey = k.replace('extraConfig.', '');
          extraConfig[subKey] = v === 'true' || v === true ? true : v;
        }
      });

      const payload = {
        provider,
        label: data.label,
        secretKey: data.secretKey,
        publicKey: data.publicKey || undefined,
        webhookSecret: data.webhookSecret || undefined,
        extraConfig: Object.keys(extraConfig).length ? extraConfig : undefined,
        testAfterCreate: true,
      };

      await onSave(payload, existingKey?.id);
    } catch (err) {
      setSaveAlert(err.response?.data?.error?.message || 'Failed to save integration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{schema.logo}</span>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {isEdit ? 'Edit' : 'Connect'} {schema.name}
              </h2>
              {schema.docsUrl && (
                <a
                  href={schema.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-500 hover:underline"
                >
                  View API docs →
                </a>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Security notice */}
        <div className="mx-6 mt-4 px-3 py-2.5 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center gap-2">
          <span className="text-base">🔒</span>
          <p className="text-xs text-indigo-700">
            All secret keys are encrypted with <strong>AES-256-GCM</strong> before saving.
            Plaintext values are never stored or logged.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 pt-5 pb-6 space-y-4">
          {saveAlert && (
            <Alert type="error" message={saveAlert} onClose={() => setSaveAlert(null)} />
          )}

          {/* Label */}
          <Input
            label="Integration Label"
            required
            placeholder={`e.g. Production ${schema.name}`}
            error={errors.label?.message}
            helperText="A human-readable name to identify this key"
            {...register('label', { required: 'Label is required' })}
          />

          {/* Provider-specific fields */}
          {schema.fields.map((field) => (
            <Input
              key={field.key}
              label={field.label}
              type={field.type}
              required={field.required}
              placeholder={field.placeholder}
              helperText={field.hint}
              error={errors[field.key]?.message}
              {...register(field.key, {
                required: field.required ? `${field.label} is required` : false,
              })}
            />
          ))}

          {/* Extra fields */}
          {schema.extraFields.map((field) => {
            if (field.type === 'checkbox') {
              return (
                <label key={field.key} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    {...register(field.key)}
                  />
                  <span>
                    <span className="text-sm font-medium text-gray-700">{field.label}</span>
                    {field.hint && (
                      <span className="block text-xs text-gray-500 mt-0.5">{field.hint}</span>
                    )}
                  </span>
                </label>
              );
            }
            return (
              <Input
                key={field.key}
                label={field.label}
                type={field.type || 'text'}
                placeholder={field.placeholder}
                helperText={field.hint}
                {...register(field.key)}
              />
            );
          })}

          {/* Connection test result */}
          {testResult && (
            <ConnectionStatus
              status={testResult.ok ? 'ok' : 'failed'}
              message={testResult.message}
              latencyMs={testResult.latencyMs}
              variant="full"
            />
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" loading={saving} className="flex-1">
              {isEdit ? 'Update & Test Connection' : 'Save & Test Connection'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>

          <p className="text-xs text-center text-gray-400">
            A connection test is run automatically after saving to verify credentials.
          </p>
        </form>
      </div>
    </div>
  );
};

export { PROVIDER_SCHEMAS };
export default ProviderSetupModal;
