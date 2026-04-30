import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, Plus, Trash2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getApiKeys, createApiKey, rotateApiKey, deleteApiKey } from '../../services/apiKeys.service';
import HibernationGate from '../../components/common/HibernationGate';

const PROVIDERS = ['stripe', 'airwallex', 'paypal', 'braintree'];

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

export default function ApiKeysPage() {
  const { user }  = useAuth();
  const orgSlug   = user?.org_slug || user?.orgSlug;
  const qc        = useQueryClient();

  const [showAdd,    setShowAdd]    = useState(false);
  const [rotating,   setRotating]   = useState(null); // keyId being rotated
  const [newKey,     setNewKey]     = useState({ provider: 'stripe', label: '', rawKey: '', environment: 'live' });
  const [rotateKey,  setRotateKey]  = useState('');
  const [revealed,   setRevealed]   = useState({});

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api-keys', orgSlug],
    queryFn:  () => getApiKeys(orgSlug),
    enabled:  !!orgSlug,
  });

  const create = useMutation({
    mutationFn: (payload) => createApiKey(orgSlug, payload),
    onSuccess: () => {
      qc.invalidateQueries(['api-keys']);
      setShowAdd(false);
      setNewKey({ provider: 'stripe', label: '', rawKey: '', environment: 'live' });
    },
  });

  const rotate = useMutation({
    mutationFn: ({ keyId, rawKey }) => rotateApiKey(orgSlug, keyId, rawKey),
    onSuccess: () => {
      qc.invalidateQueries(['api-keys']);
      setRotating(null);
      setRotateKey('');
    },
  });

  const remove = useMutation({
    mutationFn: (keyId) => deleteApiKey(orgSlug, keyId),
    onSuccess: () => qc.invalidateQueries(['api-keys']),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="mt-1 text-sm text-gray-500">
            Payment provider keys are encrypted with AES-256-GCM before storage.
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Add Key
        </button>
      </div>

      {/* Security notice */}
      <div className="flex gap-3 rounded-lg bg-primary-50 border border-primary-200 px-4 py-3">
        <ShieldCheck className="h-5 w-5 text-primary-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-primary-800">
          <strong>End-to-end encrypted.</strong> Raw API keys are never stored — only an
          AES-256-GCM ciphertext (IV + auth tag + ciphertext). The hint shown below is safe
          to display.
        </div>
      </div>

      {/* Keys table — locked during hibernation */}
      <HibernationGate message="API key management is locked while your subscription is inactive.">
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
          </div>
        ) : keys.length === 0 ? (
          <div className="py-14 text-center">
            <Key className="mx-auto h-10 w-10 text-gray-200 mb-3" />
            <p className="text-gray-500 text-sm">No API keys configured yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Hint</th>
                <th className="px-4 py-3">Env</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{k.label}</td>
                  <td className="px-4 py-3 capitalize">{k.provider}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{k.key_hint}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${k.environment === 'live' ? 'badge-green' : 'badge-yellow'}`}>
                      {k.environment}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={k.is_active ? 'badge-green' : 'badge-red'}>
                      {k.is_active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex items-center gap-3">
                    <button
                      onClick={() => setRotating(k.id)}
                      className="text-xs text-primary-600 hover:underline"
                    >
                      Rotate
                    </button>
                    <button
                      onClick={() => remove.mutate(k.id)}
                      disabled={remove.isPending}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </HibernationGate>

      {/* Add key modal */}
      {showAdd && (
        <Modal title="Add API Key" onClose={() => setShowAdd(false)}>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Provider</label>
              <select
                className="input"
                value={newKey.provider}
                onChange={(e) => setNewKey({ ...newKey, provider: e.target.value })}
              >
                {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Label</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Production Stripe Key"
                value={newKey.label}
                onChange={(e) => setNewKey({ ...newKey, label: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">API Key</label>
              <input
                type="password"
                className="input"
                placeholder="sk_live_…"
                value={newKey.rawKey}
                onChange={(e) => setNewKey({ ...newKey, rawKey: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-400">
                Encrypted with AES-256-GCM before storage.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Environment</label>
              <select
                className="input"
                value={newKey.environment}
                onChange={(e) => setNewKey({ ...newKey, environment: e.target.value })}
              >
                <option value="live">Live</option>
                <option value="sandbox">Sandbox</option>
              </select>
            </div>
            {create.error && (
              <p className="text-sm text-red-600">
                {create.error.response?.data?.error?.message || 'Failed to add key'}
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setShowAdd(false)}>Cancel</button>
              <button
                className="btn-primary flex-1"
                disabled={create.isPending || !newKey.label || !newKey.rawKey}
                onClick={() => create.mutate(newKey)}
              >
                {create.isPending ? 'Saving…' : 'Save Key'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Rotate modal */}
      {rotating && (
        <Modal title="Rotate API Key" onClose={() => setRotating(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Enter the new key value. The old one will be replaced immediately.</p>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">New API Key</label>
              <input
                type="password"
                className="input"
                placeholder="sk_live_…"
                value={rotateKey}
                onChange={(e) => setRotateKey(e.target.value)}
              />
            </div>
            {rotate.error && (
              <p className="text-sm text-red-600">
                {rotate.error.response?.data?.error?.message || 'Rotation failed'}
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setRotating(null)}>Cancel</button>
              <button
                className="btn-primary flex-1"
                disabled={rotate.isPending || !rotateKey}
                onClick={() => rotate.mutate({ keyId: rotating, rawKey: rotateKey })}
              >
                {rotate.isPending ? 'Rotating…' : 'Rotate Key'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
