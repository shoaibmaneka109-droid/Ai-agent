import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { apiKeysApi, CreateApiKeyPayload } from '../../api/apiKeys.api';
import { format } from 'date-fns';
import { Plus, Trash2, Key, Eye, EyeOff } from 'lucide-react';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import Spinner from '../../components/common/Spinner';

export default function ApiKeysPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [serverError, setServerError] = useState('');
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CreateApiKeyPayload>();

  const { data: keys, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: apiKeysApi.list,
  });

  const createMutation = useMutation({
    mutationFn: apiKeysApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      setCreateOpen(false);
      reset();
    },
    onError: (err: any) => setServerError(err.response?.data?.message || 'Failed to save API key'),
  });

  const revokeMutation = useMutation({
    mutationFn: apiKeysApi.revoke,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-gray-500">Securely stored with AES-256-GCM encryption</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Add API Key
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center"><Spinner /></div>
      ) : !keys?.length ? (
        <EmptyState
          icon={Key}
          title="No API keys yet"
          description="Add your Stripe or Airwallex API keys to start processing payments."
          action={<button onClick={() => setCreateOpen(true)} className="btn-primary">Add API Key</button>}
        />
      ) : (
        <div className="space-y-3">
          {keys.map((key: any) => (
            <div key={key.id} className="card flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
                  <Key className="h-5 w-5 text-gray-500" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{key.label}</p>
                  <p className="text-sm text-gray-500 capitalize">
                    {key.provider} · {key.environment}
                    {key.last_used_at && ` · Last used ${format(new Date(key.last_used_at), 'MMM d')}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={key.is_active ? 'active' : 'cancelled'} />
                <StatusBadge status={key.environment} />
                {key.is_active && (
                  <button
                    onClick={() => {
                      if (confirm('Revoke this API key? This cannot be undone.')) revokeMutation.mutate(key.id);
                    }}
                    className="btn-outline p-2 text-red-500 hover:border-red-300 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal isOpen={createOpen} onClose={() => { setCreateOpen(false); reset(); setServerError(''); }} title="Add API Key">
        <form onSubmit={handleSubmit((d) => { setServerError(''); createMutation.mutate(d); })} className="space-y-4">
          {serverError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{serverError}</p>}

          <div>
            <label className="label mb-1">Label</label>
            <input {...register('label', { required: 'Required' })} className="input" placeholder="Production Stripe" />
            {errors.label && <p className="mt-1 text-xs text-red-600">{errors.label.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label mb-1">Provider</label>
              <select {...register('provider', { required: true })} className="input">
                <option value="stripe">Stripe</option>
                <option value="airwallex">Airwallex</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="label mb-1">Environment</label>
              <select {...register('environment', { required: true })} className="input">
                <option value="sandbox">Sandbox</option>
                <option value="live">Live</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label mb-1">Secret Key</label>
            <div className="relative">
              <input
                {...register('secretKey', { required: 'Required' })}
                type={showSecret ? 'text' : 'password'}
                className="input pr-10 font-mono text-xs"
                placeholder="sk_live_..."
              />
              <button type="button" onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.secretKey && <p className="mt-1 text-xs text-red-600">{errors.secretKey.message}</p>}
          </div>

          <div>
            <label className="label mb-1">Publishable Key (optional)</label>
            <input {...register('publishableKey')} className="input font-mono text-xs" placeholder="pk_live_..." />
          </div>

          <div>
            <label className="label mb-1">Webhook Secret (optional)</label>
            <input {...register('webhookSecret')} type="password" className="input font-mono text-xs" placeholder="whsec_..." />
          </div>

          <div className="mt-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-700 border border-amber-200">
            Your secret key will be encrypted with AES-256-GCM before storage. It can never be retrieved in plaintext.
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={isSubmitting || createMutation.isPending} className="btn-primary flex-1">
              {createMutation.isPending ? <Spinner size="sm" className="text-white" /> : 'Save Securely'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
