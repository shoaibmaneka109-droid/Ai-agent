import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { type CreateApiKeyPayload, type Provider } from '../../api/apiKeys.api';
import Modal from './Modal';
import Spinner from './Spinner';
import ProviderLogo from './ProviderLogo';
import clsx from 'clsx';

// ─── Provider metadata ────────────────────────────────────────────────────────

interface ProviderMeta {
  name: string;
  secretLabel: string;
  secretPlaceholder: string;
  publishableLabel?: string;
  publishablePlaceholder?: string;
  webhookLabel?: string;
  webhookPlaceholder?: string;
  clientIdLabel?: string;
  clientIdPlaceholder?: string;
  docsUrl: string;
  description: string;
  supportsLive: boolean;
}

const PROVIDERS: Record<Provider, ProviderMeta> = {
  stripe: {
    name: 'Stripe',
    secretLabel: 'Secret Key',
    secretPlaceholder: 'sk_live_... or sk_test_...',
    publishableLabel: 'Publishable Key',
    publishablePlaceholder: 'pk_live_... or pk_test_...',
    webhookLabel: 'Webhook Signing Secret',
    webhookPlaceholder: 'whsec_...',
    docsUrl: 'https://dashboard.stripe.com/apikeys',
    description: 'Accept card payments, issue cards, and manage payouts globally.',
    supportsLive: true,
  },
  airwallex: {
    name: 'Airwallex',
    secretLabel: 'API Key',
    secretPlaceholder: 'your-airwallex-api-key',
    clientIdLabel: 'Client ID',
    clientIdPlaceholder: 'your-client-id',
    webhookLabel: 'Webhook Secret',
    webhookPlaceholder: 'your-webhook-secret',
    docsUrl: 'https://www.airwallex.com/docs/api#section/Authentication',
    description: 'Multi-currency accounts, FX, and global transfers for businesses.',
    supportsLive: true,
  },
  wise: {
    name: 'Wise',
    secretLabel: 'API Token',
    secretPlaceholder: 'your-wise-api-token',
    webhookLabel: 'Webhook Secret',
    webhookPlaceholder: 'your-wise-webhook-public-key-base64',
    docsUrl: 'https://docs.wise.com/api-docs/features/api-keys',
    description: 'International transfers and multi-currency borderless accounts.',
    supportsLive: true,
  },
  custom: {
    name: 'Custom',
    secretLabel: 'Bearer Token / Secret Key',
    secretPlaceholder: 'your-api-key-or-token',
    webhookLabel: 'Webhook Secret',
    webhookPlaceholder: 'your-webhook-secret',
    docsUrl: '',
    description: 'Connect any HTTPS-based payment API with a bearer token.',
    supportsLive: true,
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateApiKeyPayload) => Promise<void>;
  isSubmitting: boolean;
  error?: string;
}

export default function AddKeyModal({ isOpen, onClose, onSubmit, isSubmitting, error }: Props) {
  const [selectedProvider, setSelectedProvider] = useState<Provider>('stripe');
  const [showSecret, setShowSecret] = useState(false);
  const [showWebhook, setShowWebhook] = useState(false);

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<CreateApiKeyPayload>({
    defaultValues: { provider: 'stripe', environment: 'sandbox' },
  });

  const meta = PROVIDERS[selectedProvider];
  const environment = watch('environment');

  function handleClose() {
    reset();
    setSelectedProvider('stripe');
    setShowSecret(false);
    onClose();
  }

  async function handleFormSubmit(data: CreateApiKeyPayload) {
    await onSubmit({ ...data, provider: selectedProvider });
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Payment Provider" size="lg">
      <div className="space-y-6">
        {/* Provider picker */}
        <div>
          <p className="label mb-2">Choose provider</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setSelectedProvider(p)}
                className={clsx(
                  'flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center transition-all',
                  selectedProvider === p
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white',
                )}
              >
                <ProviderLogo provider={p} size="sm" />
                <span className={clsx(
                  'text-xs font-medium',
                  selectedProvider === p ? 'text-brand-700' : 'text-gray-600',
                )}>
                  {PROVIDERS[p].name}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">{meta.description}</p>
          {meta.docsUrl && (
            <a href={meta.docsUrl} target="_blank" rel="noreferrer"
              className="mt-1 inline-block text-xs text-brand-600 hover:underline">
              View {meta.name} API docs →
            </a>
          )}
        </div>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Label + Environment */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="label mb-1">Label</label>
              <input
                {...register('label', { required: 'Required' })}
                className="input"
                placeholder={`${meta.name} Production`}
              />
              {errors.label && <p className="mt-1 text-xs text-red-600">{errors.label.message}</p>}
            </div>
            <div>
              <label className="label mb-1">Environment</label>
              <select {...register('environment')} className="input">
                <option value="sandbox">Sandbox / Test</option>
                <option value="live">Live / Production</option>
              </select>
            </div>
          </div>

          {/* Live-mode warning */}
          {environment === 'live' && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
              You are adding a <strong>live</strong> key. Real money transactions will be processed.
            </div>
          )}

          {/* Client ID (Airwallex) */}
          {meta.clientIdLabel && (
            <div>
              <label className="label mb-1">{meta.clientIdLabel}</label>
              <input
                {...register('clientId', { required: 'Required for Airwallex' })}
                className="input font-mono text-xs"
                placeholder={meta.clientIdPlaceholder}
                autoComplete="off"
              />
              {errors.clientId && <p className="mt-1 text-xs text-red-600">{errors.clientId.message}</p>}
            </div>
          )}

          {/* Secret Key / API Token */}
          <div>
            <label className="label mb-1">{meta.secretLabel}</label>
            <div className="relative">
              <input
                {...register('secretKey', { required: 'Required' })}
                type={showSecret ? 'text' : 'password'}
                className="input pr-10 font-mono text-xs"
                placeholder={meta.secretPlaceholder}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.secretKey && <p className="mt-1 text-xs text-red-600">{errors.secretKey.message}</p>}
          </div>

          {/* Publishable Key (Stripe) */}
          {meta.publishableLabel && (
            <div>
              <label className="label mb-1">{meta.publishableLabel} <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                {...register('publishableKey')}
                className="input font-mono text-xs"
                placeholder={meta.publishablePlaceholder}
                autoComplete="off"
              />
            </div>
          )}

          {/* Webhook Secret */}
          {meta.webhookLabel && (
            <div>
              <label className="label mb-1">{meta.webhookLabel} <span className="text-gray-400 font-normal">(optional)</span></label>
              <div className="relative">
                <input
                  {...register('webhookSecret')}
                  type={showWebhook ? 'text' : 'password'}
                  className="input pr-10 font-mono text-xs"
                  placeholder={meta.webhookPlaceholder}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowWebhook(!showWebhook)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showWebhook ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Custom test URL */}
          {selectedProvider === 'custom' && (
            <div>
              <label className="label mb-1">Test URL <span className="text-gray-400 font-normal">(HTTPS endpoint for connection test)</span></label>
              <input
                {...register('extraConfig.test_url' as any)}
                className="input font-mono text-xs"
                placeholder="https://api.yourprovider.com/v1/account"
              />
            </div>
          )}

          {/* Encryption notice */}
          <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
            All credentials are encrypted with AES-256-GCM before storage. Plaintext values are never persisted or returned to the browser.
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={handleClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
              {isSubmitting ? <Spinner size="sm" className="text-white" /> : 'Save & Encrypt'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
