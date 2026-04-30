import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiKeysApi, type ApiKey, type CreateApiKeyPayload, type Provider } from '../../api/apiKeys.api';
import { useAuthStore } from '../../store/auth.store';
import { Plus, Key, ShieldCheck, AlertTriangle } from 'lucide-react';
import EmptyState from '../../components/common/EmptyState';
import Spinner from '../../components/common/Spinner';
import AddKeyModal from '../../components/common/AddKeyModal';
import ProviderCard from '../../components/common/ProviderCard';
import clsx from 'clsx';

// Group keys by provider for organised display
function groupByProvider(keys: ApiKey[]): Record<string, ApiKey[]> {
  return keys.reduce((acc: Record<string, ApiKey[]>, key) => {
    const p = key.provider;
    if (!acc[p]) acc[p] = [];
    acc[p].push(key);
    return acc;
  }, {});
}

const PROVIDER_ORDER: Provider[] = ['stripe', 'airwallex', 'wise', 'custom'];

const PROVIDER_LABELS: Record<string, string> = {
  stripe: 'Stripe', airwallex: 'Airwallex', wise: 'Wise', custom: 'Custom',
};

export default function ApiKeysPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState('');
  const [filterEnv, setFilterEnv] = useState<'all' | 'live' | 'sandbox'>('all');
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const canManage = ['owner', 'admin'].includes(user?.role ?? '');

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: apiKeysApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateApiKeyPayload) => apiKeysApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      setAddOpen(false);
      setAddError('');
    },
    onError: (err: any) => {
      setAddError(err.response?.data?.message || 'Failed to save API key');
    },
  });

  // Stats
  const activeKeys = keys.filter((k) => k.is_active);
  const liveKeys   = activeKeys.filter((k) => k.environment === 'live');
  const connected  = activeKeys.filter((k) => k.last_test_status === 'success');
  const failed     = activeKeys.filter((k) => k.last_test_status === 'failure');

  const filtered = keys.filter((k) => filterEnv === 'all' || k.environment === filterEnv);
  const grouped  = groupByProvider(filtered);

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Integrations</h1>
          <p className="text-gray-500">
            Self-service API key management — add your own Stripe, Airwallex, or Wise credentials.
          </p>
        </div>
        {canManage && (
          <button onClick={() => { setAddOpen(true); setAddError(''); }} className="btn-primary">
            <Plus className="h-4 w-4" />
            Add Provider
          </button>
        )}
      </div>

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      {activeKeys.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Active Keys',  value: activeKeys.length, color: 'text-gray-900' },
            { label: 'Live Keys',    value: liveKeys.length,   color: 'text-emerald-600' },
            { label: 'Verified',     value: connected.length,  color: 'text-brand-600' },
            { label: 'Failed',       value: failed.length,     color: 'text-red-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card py-3 text-center">
              <p className={clsx('text-2xl font-bold', color)}>{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Security notice ───────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
        <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
        <div>
          <span className="font-semibold">End-to-end encryption:</span> All API keys and secrets are
          encrypted with AES-256-GCM before being written to the database. Plaintext credentials are
          never stored, logged, or returned to the browser. Only masked values (e.g.{' '}
          <span className="font-mono">••••••abcd</span>) are displayed.
        </div>
      </div>

      {/* ── Failed keys warning ───────────────────────────────────────────── */}
      {failed.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
          <div>
            <span className="font-semibold">{failed.length} integration{failed.length > 1 ? 's' : ''} failing:</span>{' '}
            {failed.map((k) => k.label).join(', ')}. Run a connection test to diagnose.
          </div>
        </div>
      )}

      {/* ── Filter tabs ───────────────────────────────────────────────────── */}
      {keys.length > 0 && (
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
          {(['all', 'live', 'sandbox'] as const).map((env) => (
            <button
              key={env}
              onClick={() => setFilterEnv(env)}
              className={clsx(
                'rounded-lg px-4 py-1.5 text-sm font-medium transition-all capitalize',
                filterEnv === env
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {env === 'all' ? 'All' : env}
            </button>
          ))}
        </div>
      )}

      {/* ── Key list ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      ) : keys.length === 0 ? (
        <EmptyState
          icon={Key}
          title="No integrations yet"
          description="Add your Stripe, Airwallex, or Wise API keys to start processing payments. You control your own credentials."
          action={
            canManage ? (
              <button onClick={() => setAddOpen(true)} className="btn-primary">
                <Plus className="h-4 w-4" /> Add your first provider
              </button>
            ) : undefined
          }
        />
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">
          No {filterEnv} keys found.
        </p>
      ) : (
        <div className="space-y-6">
          {PROVIDER_ORDER.filter((p) => grouped[p]?.length).map((provider) => (
            <div key={provider}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
                {PROVIDER_LABELS[provider]}
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500 normal-case">
                  {grouped[provider].length}
                </span>
              </h2>
              <div className="space-y-3">
                {grouped[provider].map((key) => (
                  <ProviderCard
                    key={key.id}
                    apiKey={key}
                    canManage={canManage}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Self-service info ─────────────────────────────────────────────── */}
      {keys.length > 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-sm text-gray-400">
          <p>
            <span className="font-medium text-gray-600">Self-service:</span> You own and manage your provider keys.
            SecurePay never holds your credentials on behalf — each tenant controls their own integrations independently.
          </p>
        </div>
      )}

      {/* ── Add Provider Modal ────────────────────────────────────────────── */}
      <AddKeyModal
        isOpen={addOpen}
        onClose={() => { setAddOpen(false); setAddError(''); }}
        onSubmit={async (data) => { await createMutation.mutateAsync(data); }}
        isSubmitting={createMutation.isPending}
        error={addError}
      />
    </div>
  );
}
