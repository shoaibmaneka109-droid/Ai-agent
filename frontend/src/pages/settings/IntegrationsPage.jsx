import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, RefreshCw, CheckCircle, XCircle, Clock,
  Eye, EyeOff, ChevronDown, ChevronUp, Plug, AlertTriangle,
  ExternalLink, Shield, Zap, Settings,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getProviderCatalog, getIntegrations, createIntegration,
  updateIntegration, deleteIntegration, testIntegrationConnection,
} from '../../services/integrations.service';

// ── Provider brand colours / icons (fallback to letter avatar) ───────────────
const PROVIDER_COLORS = {
  stripe:    { bg: 'bg-indigo-100', text: 'text-indigo-700', accent: '#6366f1' },
  airwallex: { bg: 'bg-blue-100',   text: 'text-blue-700',   accent: '#3b82f6' },
  wise:      { bg: 'bg-green-100',  text: 'text-green-700',  accent: '#22c55e' },
  paypal:    { bg: 'bg-sky-100',    text: 'text-sky-700',    accent: '#0ea5e9' },
  braintree: { bg: 'bg-teal-100',   text: 'text-teal-700',   accent: '#14b8a6' },
};

const KEY_TYPE_LABELS = {
  secret_key:       'Secret Key',
  publishable_key:  'Publishable Key',
  webhook_secret:   'Webhook Secret',
  access_token:     'Access Token',
  api_token:        'API Token',
};

const ENV_BADGE = (env) =>
  env === 'live'
    ? <span className="badge-green">Live</span>
    : <span className="badge-yellow">Sandbox</span>;

// ── Test result badge ─────────────────────────────────────────────────────────
function TestBadge({ status, tested_at }) {
  if (!status) return <span className="badge-gray">Not tested</span>;
  if (status === 'success') {
    return (
      <span className="flex items-center gap-1 badge-green">
        <CheckCircle className="h-3 w-3" /> Connected
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 badge-red">
      <XCircle className="h-3 w-3" /> Failed
    </span>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 py-10 overflow-y-auto">
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-2xl bg-white shadow-2xl`}>
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5 text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ── Field with masked value + show/hide toggle ────────────────────────────────
function MaskedField({ label, hint, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          className="input pr-10 font-mono text-sm"
          placeholder={placeholder}
          autoComplete={autoComplete || 'off'}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          tabIndex={-1}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          onClick={() => setShow((v) => !v)}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// ── Provider logo / avatar ────────────────────────────────────────────────────
function ProviderAvatar({ slug, name }) {
  const colors = PROVIDER_COLORS[slug] || { bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors.bg} ${colors.text} font-bold text-sm flex-shrink-0`}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ── Add integration wizard ────────────────────────────────────────────────────
function AddIntegrationModal({ providers, orgSlug, onClose, onSuccess }) {
  const [step, setStep]           = useState(1); // 1=pick provider, 2=enter keys
  const [chosen, setChosen]       = useState(null);
  const [form, setForm]           = useState({
    label: '', keyType: 'secret_key', rawKey: '',
    rawWebhookSecret: '', clientId: '', environment: 'live',
  });
  const [apiError, setApiError]   = useState('');
  const [saving, setSaving]       = useState(false);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const needsClientId = chosen && ['airwallex', 'paypal'].includes(chosen.slug);

  async function handleSave() {
    setApiError('');
    setSaving(true);
    try {
      const payload = {
        provider:          chosen.slug,
        label:             form.label || `${chosen.display_name} (${form.environment})`,
        keyType:           form.keyType,
        rawKey:            form.rawKey,
        environment:       form.environment,
        ...(form.rawWebhookSecret ? { rawWebhookSecret: form.rawWebhookSecret } : {}),
        ...(form.clientId         ? { clientId:         form.clientId }         : {}),
      };
      await createIntegration(orgSlug, payload);
      onSuccess();
    } catch (err) {
      setApiError(err.response?.data?.error?.message || 'Failed to save integration.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={step === 1 ? 'Add Integration' : `Configure ${chosen?.display_name}`}
      subtitle={step === 1
        ? 'Select your payment provider to get started.'
        : 'Your keys are encrypted with AES-256-GCM before storage.'}
      onClose={onClose}
      wide={step === 2}
    >
      {step === 1 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {providers.map((p) => (
              <button
                key={p.slug}
                onClick={() => { setChosen(p); setForm((f) => ({ ...f, label: `${p.display_name} (live)` })); setStep(2); }}
                className="flex items-center gap-3 rounded-xl border-2 border-gray-200
                           p-4 text-left transition hover:border-primary-400 hover:bg-primary-50"
              >
                <ProviderAvatar slug={p.slug} name={p.display_name} />
                <div>
                  <p className="font-medium text-sm text-gray-900">{p.display_name}</p>
                  <p className="text-xs text-gray-400">
                    {p.supported_key_types?.slice(0, 2).map((t) => KEY_TYPE_LABELS[t]).join(', ')}
                  </p>
                </div>
                {p.docs_url && (
                  <a
                    href={p.docs_url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-gray-300 hover:text-primary-500"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Encryption notice */}
          <div className="flex gap-2 rounded-lg bg-primary-50 border border-primary-200 px-3 py-2.5">
            <Shield className="h-4 w-4 text-primary-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-primary-800">
              Keys are AES-256-GCM encrypted before being stored. Raw values are never persisted in plaintext.
            </p>
          </div>

          {/* Basic fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Label</label>
              <input
                type="text"
                className="input"
                value={form.label}
                onChange={(e) => set('label')(e.target.value)}
                placeholder="e.g. Production Stripe"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Environment</label>
              <select className="input" value={form.environment} onChange={(e) => set('environment')(e.target.value)}>
                <option value="live">Live</option>
                <option value="sandbox">Sandbox / Test</option>
              </select>
            </div>
            {chosen.supported_key_types?.length > 1 && (
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Key type</label>
                <select className="input" value={form.keyType} onChange={(e) => set('keyType')(e.target.value)}>
                  {(chosen.supported_key_types || ['secret_key']).filter((t) => t !== 'webhook_secret').map((t) => (
                    <option key={t} value={t}>{KEY_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Client ID (Airwallex, PayPal) */}
          {needsClientId && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {chosen.slug === 'paypal' ? 'Client ID' : 'Client ID'}
              </label>
              <input
                type="text"
                className="input font-mono text-sm"
                placeholder={chosen.slug === 'paypal' ? 'AY0...' : 'your-airwallex-client-id'}
                onChange={(e) => set('clientId')(e.target.value)}
              />
            </div>
          )}

          {/* API Key */}
          <MaskedField
            label={`${chosen.display_name} ${KEY_TYPE_LABELS[form.keyType]}`}
            hint={
              chosen.slug === 'stripe' ? 'Find this in Stripe Dashboard → Developers → API keys' :
              chosen.slug === 'wise'   ? 'Generate in Wise Business → API Tokens' :
              chosen.slug === 'airwallex' ? 'Found in Airwallex Portal → API & Webhooks' :
              'Your provider API key'
            }
            placeholder={
              chosen.slug === 'stripe'    ? 'sk_live_...' :
              chosen.slug === 'wise'      ? 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' :
              chosen.slug === 'airwallex' ? 'Your Airwallex API Key' :
              'Paste your API key here'
            }
            onChange={set('rawKey')}
          />

          {/* Webhook secret */}
          {chosen.supported_key_types?.includes('webhook_secret') && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  Webhook Signing Secret <span className="text-gray-400 font-normal">(optional)</span>
                </label>
              </div>
              <MaskedField
                label=""
                hint={
                  chosen.slug === 'stripe'
                    ? 'From Stripe Dashboard → Webhooks → your endpoint → Signing secret (whsec_...)'
                    : 'Used to verify incoming webhook payloads'
                }
                placeholder={chosen.slug === 'stripe' ? 'whsec_...' : 'Your webhook secret'}
                onChange={set('rawWebhookSecret')}
              />
            </div>
          )}

          {apiError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {apiError}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button className="btn-secondary flex-1" onClick={() => setStep(1)}>← Back</button>
            <button
              className="btn-primary flex-1"
              disabled={saving || !form.rawKey}
              onClick={handleSave}
            >
              {saving ? 'Saving…' : 'Save Integration'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Edit integration modal ────────────────────────────────────────────────────
function EditIntegrationModal({ integration, orgSlug, onClose, onSuccess }) {
  const [form, setForm]     = useState({ label: integration.label, rawKey: '', rawWebhookSecret: '', clientId: integration.extra_config?.client_id || '' });
  const [apiError, setApiError] = useState('');
  const [saving, setSaving]  = useState(false);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  async function handleSave() {
    setApiError('');
    setSaving(true);
    try {
      const payload = {
        ...(form.label             ? { label:            form.label }            : {}),
        ...(form.rawKey            ? { rawKey:           form.rawKey }           : {}),
        ...(form.rawWebhookSecret  ? { rawWebhookSecret: form.rawWebhookSecret } : {}),
        ...(form.clientId          ? { clientId:         form.clientId }         : {}),
      };
      await updateIntegration(orgSlug, integration.id, payload);
      onSuccess();
    } catch (err) {
      setApiError(err.response?.data?.error?.message || 'Update failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Edit ${integration.label}`} subtitle={`${integration.provider} · ${integration.environment}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Label</label>
          <input type="text" className="input" value={form.label} onChange={(e) => set('label')(e.target.value)} />
        </div>

        {['airwallex', 'paypal'].includes(integration.provider) && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Client ID</label>
            <input type="text" className="input font-mono text-sm" value={form.clientId} onChange={(e) => set('clientId')(e.target.value)} />
          </div>
        )}

        <MaskedField
          label="New API Key (leave blank to keep existing)"
          hint={`Current: ${integration.key_hint}`}
          placeholder="Paste new key to rotate…"
          onChange={set('rawKey')}
        />

        {integration.webhook_secret_hint !== undefined && (
          <MaskedField
            label="New Webhook Secret (leave blank to keep existing)"
            hint={integration.webhook_secret_hint ? `Current: ${integration.webhook_secret_hint}` : 'Not set'}
            placeholder="Paste new webhook secret to update…"
            onChange={set('rawWebhookSecret')}
          />
        )}

        {apiError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{apiError}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Update'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Integration card ──────────────────────────────────────────────────────────
function IntegrationCard({ integration, orgSlug, onEdit, onDelete, onTestDone }) {
  const [testing,   setTesting]   = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [expanded,  setExpanded]  = useState(false);

  const colors = PROVIDER_COLORS[integration.provider] || { bg: 'bg-gray-100', text: 'text-gray-600' };

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testIntegrationConnection(orgSlug, integration.id);
      setTestResult(result);
      onTestDone();
    } catch (err) {
      setTestResult({
        success: false,
        message: err.response?.data?.error?.message || 'Test request failed.',
      });
    } finally {
      setTesting(false);
    }
  }

  const lastStatus = testResult?.success ?? (integration.connection_test_status === 'success' ? true : integration.connection_test_status === 'failed' ? false : null);
  const lastMessage = testResult?.message ?? integration.connection_test_message;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-3 px-5 py-4">
        <ProviderAvatar slug={integration.provider} name={integration.provider} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900 truncate">{integration.label}</p>
            {ENV_BADGE(integration.environment)}
            <span className="badge-gray">{KEY_TYPE_LABELS[integration.key_type] || integration.key_type}</span>
          </div>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{integration.key_hint}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <TestBadge status={integration.connection_test_status} />
          <button
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition"
            onClick={() => setExpanded((v) => !v)}
            aria-label="Toggle details"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 space-y-4">
          {/* Webhook secret status */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Webhook secret</span>
            {integration.webhook_secret_hint
              ? <span className="font-mono text-xs text-gray-600">{integration.webhook_secret_hint}</span>
              : <span className="text-gray-400 text-xs">Not configured</span>
            }
          </div>

          {/* Last test info */}
          {integration.connection_tested_at && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Last tested</span>
              <span className="text-xs text-gray-400">
                {new Date(integration.connection_tested_at).toLocaleString()}
              </span>
            </div>
          )}

          {/* Test result message */}
          {lastMessage && (
            <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm
              ${lastStatus === true  ? 'bg-green-50 border border-green-200 text-green-800' :
                lastStatus === false ? 'bg-red-50 border border-red-200 text-red-800' :
                'bg-gray-100 text-gray-600'}`}
            >
              {lastStatus === true  ? <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" /> :
               lastStatus === false ? <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" /> :
               <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
              <span>{lastMessage}</span>
            </div>
          )}

          {/* Test result detail */}
          {testResult?.detail && Object.keys(testResult.detail).length > 0 && (
            <div className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-mono text-gray-600 space-y-0.5">
              {Object.entries(testResult.detail).map(([k, v]) => (
                <div key={k}><span className="text-gray-400">{k}:</span> {String(v)}</div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleTest}
              disabled={testing}
              className="btn-primary text-xs gap-1.5 py-1.5"
            >
              {testing
                ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Testing…</>
                : <><Zap className="h-3.5 w-3.5" /> Test Connection</>
              }
            </button>
            <button
              onClick={() => onEdit(integration)}
              className="btn-secondary text-xs gap-1.5 py-1.5"
            >
              <Settings className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              onClick={() => onDelete(integration)}
              className="text-xs text-red-500 hover:underline ml-auto"
            >
              <Trash2 className="h-3.5 w-3.5 inline-block mr-1" />Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function IntegrationsPage() {
  const { user }  = useAuth();
  const orgSlug   = user?.orgSlug || user?.org_slug;
  const qc        = useQueryClient();

  const [showAdd,   setShowAdd]   = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [deleting,  setDeleting]  = useState(null);
  const [deleteErr, setDeleteErr] = useState('');

  const { data: providers = [], isLoading: catalogLoading } = useQuery({
    queryKey: ['provider-catalog', orgSlug],
    queryFn:  () => getProviderCatalog(orgSlug),
    enabled:  !!orgSlug,
  });

  const { data: integrations = [], isLoading: keysLoading, isFetching } = useQuery({
    queryKey: ['integrations', orgSlug],
    queryFn:  () => getIntegrations(orgSlug),
    enabled:  !!orgSlug,
  });

  const removeMutation = useMutation({
    mutationFn: (keyId) => deleteIntegration(orgSlug, keyId),
    onSuccess: () => {
      qc.invalidateQueries(['integrations', orgSlug]);
      setDeleting(null);
    },
    onError: (err) => {
      setDeleteErr(err.response?.data?.error?.message || 'Delete failed.');
    },
  });

  const refresh = useCallback(() => {
    qc.invalidateQueries(['integrations', orgSlug]);
  }, [qc, orgSlug]);

  // Group integrations by provider for summary
  const byProvider = integrations.reduce((acc, k) => {
    if (!acc[k.provider]) acc[k.provider] = [];
    acc[k.provider].push(k);
    return acc;
  }, {});

  const connectedCount = integrations.filter((k) => k.connection_test_status === 'success').length;
  const failedCount    = integrations.filter((k) => k.connection_test_status === 'failed').length;

  const isLoading = catalogLoading || keysLoading;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
          <p className="mt-1 text-sm text-gray-500">
            Connect your payment providers. Keys are AES-256-GCM encrypted at rest.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />}
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> Add Provider
          </button>
        </div>
      </div>

      {/* Summary chips */}
      {integrations.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm">
            <Plug className="h-4 w-4 text-gray-500" />
            <span className="font-medium text-gray-700">{integrations.length}</span>
            <span className="text-gray-500">integration{integrations.length !== 1 ? 's' : ''}</span>
          </div>
          {connectedCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="font-medium text-green-700">{connectedCount} connected</span>
            </div>
          )}
          {failedCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="font-medium text-red-700">{failedCount} failed</span>
            </div>
          )}
        </div>
      )}

      {/* Integration cards */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        </div>
      ) : integrations.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
          <Plug className="mx-auto h-10 w-10 text-gray-200 mb-3" />
          <p className="font-medium text-gray-600">No integrations yet</p>
          <p className="mt-1 text-sm text-gray-400 max-w-xs mx-auto">
            Add your first payment provider. Keys are self-service — no manual setup required.
          </p>
          <button onClick={() => setShowAdd(true)} className="btn-primary mt-5">
            <Plus className="h-4 w-4" /> Add First Provider
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {integrations.map((intg) => (
            <IntegrationCard
              key={intg.id}
              integration={intg}
              orgSlug={orgSlug}
              onEdit={setEditing}
              onDelete={setDeleting}
              onTestDone={refresh}
            />
          ))}
        </div>
      )}

      {/* Available providers (not yet connected) */}
      {providers.length > 0 && !isLoading && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Available Providers
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {providers
              .filter((p) => !byProvider[p.slug])
              .map((p) => (
                <button
                  key={p.slug}
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 p-3
                             text-left hover:border-primary-300 hover:bg-primary-50 transition"
                >
                  <ProviderAvatar slug={p.slug} name={p.display_name} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.display_name}</p>
                    <p className="text-xs text-gray-400">Click to connect</p>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <AddIntegrationModal
          providers={providers}
          orgSlug={orgSlug}
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); refresh(); }}
        />
      )}

      {/* Edit modal */}
      {editing && (
        <EditIntegrationModal
          integration={editing}
          orgSlug={orgSlug}
          onClose={() => setEditing(null)}
          onSuccess={() => { setEditing(null); refresh(); }}
        />
      )}

      {/* Delete confirmation */}
      {deleting && (
        <Modal title="Remove Integration" onClose={() => { setDeleting(null); setDeleteErr(''); }}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Remove <strong>{deleting.label}</strong>? The encrypted key will be permanently deleted.
              Any payments using this key will fail.
            </p>
            {deleteErr && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{deleteErr}</p>
            )}
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => { setDeleting(null); setDeleteErr(''); }}>
                Cancel
              </button>
              <button
                className="btn-danger flex-1"
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate(deleting.id)}
              >
                {removeMutation.isPending ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
