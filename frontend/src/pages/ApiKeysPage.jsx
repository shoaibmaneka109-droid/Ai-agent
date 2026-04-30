import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Alert from '../components/common/Alert';
import HibernationGate from '../components/common/HibernationGate';
import {
  listApiKeys, createApiKey, toggleApiKey, deleteApiKey, rotateApiKey,
} from '../services/apiKeysService';

const PROVIDERS = ['stripe', 'airwallex', 'custom'];

const ApiKeysPage = () => {
  const { org, user } = useSelector((s) => s.auth);
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [alert, setAlert] = useState(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { provider: 'stripe' },
  });

  const load = async () => {
    try {
      const res = await listApiKeys(org.id);
      setKeys(res.data.data.keys || []);
    } catch {
      setAlert({ type: 'error', message: 'Failed to load API keys' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (org?.id) load(); }, [org?.id]);

  const onSubmit = async (data) => {
    setFormLoading(true);
    try {
      await createApiKey(org.id, data);
      setAlert({ type: 'success', message: 'API key added securely (AES-256-GCM encrypted)' });
      setShowForm(false);
      reset();
      load();
    } catch (err) {
      setAlert({ type: 'error', message: err.response?.data?.error?.message || 'Failed to save key' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggle = async (key) => {
    try {
      await toggleApiKey(org.id, key.id, !key.is_active);
      load();
    } catch {
      setAlert({ type: 'error', message: 'Failed to toggle key' });
    }
  };

  const handleDelete = async (keyId) => {
    if (!window.confirm('Permanently delete this API key?')) return;
    try {
      await deleteApiKey(org.id, keyId);
      load();
    } catch {
      setAlert({ type: 'error', message: 'Failed to delete key' });
    }
  };

  const canManage = ['owner', 'admin'].includes(user?.role);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-gray-500 text-sm mt-1">
            Keys are encrypted with AES-256-GCM — secret values are never stored in plaintext
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Add Key'}
          </Button>
        )}
      </div>

      {alert && (
        <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} className="mb-4" />
      )}

      {/* Add key form */}
      {showForm && (
        <HibernationGate feature="Adding API Keys">
        <Card title="New API Key" className="mb-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
              <select
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                {...register('provider', { required: true })}
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>

            <Input
              label="Label"
              placeholder="e.g. Production Stripe"
              error={errors.label?.message}
              {...register('label', { required: 'Label is required' })}
            />

            <Input
              label="Publishable / Public Key"
              placeholder="pk_live_..."
              helperText="Optional — not encrypted"
              {...register('publicKey')}
            />

            <Input
              label="Secret Key"
              type="password"
              placeholder="sk_live_..."
              required
              helperText="Stored encrypted with AES-256-GCM"
              error={errors.secretKey?.message}
              {...register('secretKey', { required: 'Secret key is required' })}
            />

            <Input
              label="Webhook Secret"
              type="password"
              placeholder="whsec_..."
              helperText="Optional — stored encrypted"
              {...register('webhookSecret')}
            />

            <Button type="submit" loading={formLoading}>Save Key</Button>
          </form>
        </Card>
        </HibernationGate>
      )}

      {/* Keys list */}
      <Card>
        {loading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : keys.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">No API keys configured yet.</p>
            {canManage && (
              <Button className="mt-4" onClick={() => setShowForm(true)}>Add your first key</Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 uppercase">
                    {k.provider.slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{k.label}</p>
                    <p className="text-xs text-gray-400 capitalize">
                      {k.provider} · {k.public_key ? `${k.public_key.slice(0, 12)}…` : 'No public key'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge color={k.is_active ? 'green' : 'gray'}>
                    {k.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  {canManage && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleToggle(k)}
                      >
                        {k.is_active ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(k.id)}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default ApiKeysPage;
