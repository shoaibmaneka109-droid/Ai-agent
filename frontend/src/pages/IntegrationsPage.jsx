import React, { useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Alert from '../components/common/Alert';
import ConnectionStatus from '../components/common/ConnectionStatus';
import HibernationGate from '../components/common/HibernationGate';
import ProviderSetupModal, { PROVIDER_SCHEMAS } from '../components/integrations/ProviderSetupModal';
import {
  listApiKeys,
  createApiKey,
  testApiKeyConnection,
  rotateApiKey,
  toggleApiKey,
  deleteApiKey,
  updateApiKeyMeta,
} from '../services/apiKeysService';

// ─── Provider catalogue shown on the page ─────────────────────────────────────
const PROVIDER_CATALOGUE = [
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Card issuing, payments, subscriptions, and payouts.',
    logo: '💳',
    color: 'indigo',
    category: 'Card Issuing',
  },
  {
    id: 'airwallex',
    name: 'Airwallex',
    description: 'Global multi-currency payments, FX, and card issuing.',
    logo: '🌐',
    color: 'blue',
    category: 'Card Issuing',
  },
  {
    id: 'wise',
    name: 'Wise',
    description: 'International money transfers and borderless accounts.',
    logo: '💚',
    color: 'green',
    category: 'Transfers',
  },
  {
    id: 'custom',
    name: 'Custom Provider',
    description: 'Any payment API with a Bearer token or API key.',
    logo: '⚙️',
    color: 'gray',
    category: 'Custom',
  },
];

const categoryColors = {
  'Card Issuing': 'indigo',
  Transfers: 'green',
  Custom: 'gray',
};

// ─── RotateModal ──────────────────────────────────────────────────────────────
const RotateModal = ({ keyRecord, onRotate, onClose }) => {
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!secretKey) { setError('Secret key is required'); return; }
    setLoading(true);
    try {
      await onRotate(keyRecord.id, { secretKey, webhookSecret: webhookSecret || undefined });
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Rotation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Rotate Secret Key</h3>
        <p className="text-sm text-gray-500 mb-4">
          Enter the new credentials for <strong>{keyRecord.label}</strong>. The old secret is immediately replaced and the connection test status is reset.
        </p>
        {error && <Alert type="error" message={error} onClose={() => setError(null)} className="mb-3" />}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Secret Key <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300"
              placeholder="New secret key…"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Webhook Secret <span className="text-xs text-gray-400">(optional)</span>
            </label>
            <input
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300"
              placeholder="Leave blank to keep existing"
              autoComplete="off"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="primary" loading={loading} className="flex-1">
              Rotate Key
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────
const IntegrationsPage = () => {
  const { org, user, subscription } = useSelector((s) => s.auth);
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [setupModal, setSetupModal] = useState(null);  // { provider, existingKey? }
  const [rotateModal, setRotateModal] = useState(null); // keyRecord
  const [testingIds, setTestingIds] = useState(new Set());
  const [testResults, setTestResults] = useState({});   // keyId → testResult

  const isLocked = subscription && !subscription.hasFullAccess;
  const canManage = ['owner', 'admin'].includes(user?.role);

  const load = useCallback(async () => {
    if (!org?.id) return;
    setLoading(true);
    try {
      const res = await listApiKeys(org.id);
      setKeys(res.data.data.keys || []);
    } catch {
      setAlert({ type: 'error', message: 'Failed to load integrations' });
    } finally {
      setLoading(false);
    }
  }, [org?.id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (payload, existingKeyId) => {
    try {
      if (existingKeyId) {
        // Update meta only (secrets are rotated separately)
        await updateApiKeyMeta(org.id, existingKeyId, {
          label: payload.label,
          publicKey: payload.publicKey,
          extraConfig: payload.extraConfig,
        });
      } else {
        await createApiKey(org.id, payload);
      }
      setAlert({ type: 'success', message: `Integration saved and connection test run successfully.` });
      setSetupModal(null);
      load();
    } catch (err) {
      throw err; // bubble up to modal
    }
  };

  const handleTest = async (keyId) => {
    setTestingIds((s) => new Set(s).add(keyId));
    try {
      const res = await testApiKeyConnection(org.id, keyId);
      const result = res.data.data.testResult;
      setTestResults((prev) => ({ ...prev, [keyId]: result }));
      // Refresh the list to get persisted status
      load();
    } catch (err) {
      const errMsg = err.response?.data?.data?.testResult?.message || 'Test failed';
      setTestResults((prev) => ({ ...prev, [keyId]: { ok: false, message: errMsg } }));
    } finally {
      setTestingIds((s) => { const n = new Set(s); n.delete(keyId); return n; });
    }
  };

  const handleRotate = async (keyId, data) => {
    await rotateApiKey(org.id, keyId, data);
    setAlert({ type: 'success', message: 'Key rotated. Run a connection test to verify.' });
    setRotateModal(null);
    load();
  };

  const handleToggle = async (key) => {
    try {
      await toggleApiKey(org.id, key.id, !key.is_active);
      load();
    } catch {
      setAlert({ type: 'error', message: 'Failed to toggle integration' });
    }
  };

  const handleDelete = async (keyId) => {
    if (!window.confirm('Permanently delete this integration? This cannot be undone.')) return;
    try {
      await deleteApiKey(org.id, keyId);
      setAlert({ type: 'success', message: 'Integration deleted.' });
      load();
    } catch {
      setAlert({ type: 'error', message: 'Failed to delete integration' });
    }
  };

  // Group keys by provider
  const keysByProvider = keys.reduce((acc, k) => {
    if (!acc[k.provider]) acc[k.provider] = [];
    acc[k.provider].push(k);
    return acc;
  }, {});

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Integrations</h1>
          <p className="text-gray-500 text-sm mt-1">
            Self-service: connect your own Stripe, Airwallex, Wise, or custom payment provider.
            All secrets are encrypted with AES-256-GCM before storage.
          </p>
        </div>
      </div>

      {alert && (
        <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} className="mb-4" />
      )}

      {/* Provider catalogue */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {PROVIDER_CATALOGUE.map((provider) => {
          const connected = (keysByProvider[provider.id] || []).filter((k) => k.is_active);
          const hasAny = (keysByProvider[provider.id] || []).length > 0;

          return (
            <div
              key={provider.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{provider.logo}</span>
                  <Badge color={categoryColors[provider.category] || 'gray'}>
                    {provider.category}
                  </Badge>
                </div>
                <h3 className="font-semibold text-gray-900 text-sm">{provider.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{provider.description}</p>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {connected.length > 0
                    ? `${connected.length} active key${connected.length !== 1 ? 's' : ''}`
                    : 'Not connected'}
                </span>
                {canManage && !isLocked ? (
                  <button
                    onClick={() => setSetupModal({ provider: provider.id })}
                    className="text-xs text-indigo-600 font-semibold hover:underline"
                  >
                    {hasAny ? 'Add another' : 'Connect →'}
                  </button>
                ) : (
                  hasAny && (
                    <span className="text-xs text-green-600 font-medium">✓ Configured</span>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Configured integrations table */}
      <HibernationGate feature="Managing Payment Integrations">
        <Card title={`Configured Keys (${keys.length})`}>
          {loading ? (
            <p className="text-sm text-gray-400 py-6 text-center">Loading integrations…</p>
          ) : keys.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-3xl mb-3">🔌</p>
              <p className="text-gray-600 font-medium">No integrations configured yet.</p>
              <p className="text-gray-400 text-sm mt-1">
                Click "Connect" on any provider above to add your first API key.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {keys.map((key) => {
                const isTesting = testingIds.has(key.id);
                const liveResult = testResults[key.id];
                const displayStatus = isTesting
                  ? 'pending'
                  : (liveResult?.ok === true ? 'ok' : liveResult?.ok === false ? 'failed' : key.last_test_status);
                const displayMessage = isTesting
                  ? 'Running connection test…'
                  : (liveResult?.message ?? key.last_test_message);
                const displayLatency = liveResult?.latencyMs ?? key.last_test_latency;

                return (
                  <div key={key.id} className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: identity */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-base font-bold text-gray-500 shrink-0 uppercase">
                          {PROVIDER_SCHEMAS[key.provider]?.logo || key.provider.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{key.label}</p>
                          <p className="text-xs text-gray-400 capitalize mt-0.5">
                            {key.provider}
                            {key.public_key && (
                              <span className="ml-2 font-mono">
                                {key.public_key.slice(0, 14)}…
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Right: status + actions */}
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        <ConnectionStatus
                          status={displayStatus}
                          message={displayMessage}
                          latencyMs={displayLatency}
                          variant="pill"
                        />
                        <Badge color={key.is_active ? 'green' : 'gray'}>
                          {key.is_active ? 'Active' : 'Disabled'}
                        </Badge>

                        {canManage && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={isTesting}
                              onClick={() => handleTest(key.id)}
                              title="Run connection test"
                            >
                              {isTesting ? 'Testing…' : 'Test'}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setSetupModal({ provider: key.provider, existingKey: key })}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setRotateModal(key)}
                            >
                              Rotate
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleToggle(key)}
                            >
                              {key.is_active ? 'Disable' : 'Enable'}
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleDelete(key.id)}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expanded test result inline */}
                    {(displayMessage || (displayStatus && displayStatus !== 'untested')) && (
                      <div className="mt-2 ml-13 pl-[52px]">
                        <ConnectionStatus
                          status={displayStatus}
                          message={displayMessage}
                          latencyMs={displayLatency}
                          variant="full"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </HibernationGate>

      {/* Encryption info */}
      <div className="mt-6 p-4 rounded-xl bg-gray-50 border border-gray-200">
        <div className="flex items-start gap-3">
          <span className="text-lg">🔒</span>
          <div>
            <p className="text-sm font-semibold text-gray-800">End-to-End Encryption</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Every secret key and webhook secret is encrypted using <strong>AES-256-GCM</strong> with
              a unique random IV per value before being written to the database.
              Plaintext credentials are never logged, cached, or sent back to the browser.
              Only masked previews are shown.
            </p>
          </div>
        </div>
      </div>

      {/* Modals */}
      {setupModal && (
        <ProviderSetupModal
          provider={setupModal.provider}
          existingKey={setupModal.existingKey}
          onSave={handleSave}
          onClose={() => setSetupModal(null)}
        />
      )}

      {rotateModal && (
        <RotateModal
          keyRecord={rotateModal}
          onRotate={handleRotate}
          onClose={() => setRotateModal(null)}
        />
      )}
    </div>
  );
};

export default IntegrationsPage;
