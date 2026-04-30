import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiKeysApi, type ApiKey } from '../../api/apiKeys.api';
import { format, formatDistanceToNow } from 'date-fns';
import {
  CheckCircle2, XCircle, Loader2, Trash2, ChevronDown, ChevronUp,
  RefreshCw, Clock, Wifi,
} from 'lucide-react';
import ProviderLogo from './ProviderLogo';
import ConnectionTestLog from './ConnectionTestLog';
import clsx from 'clsx';

interface Props {
  apiKey: ApiKey;
  canManage: boolean;
}

export default function ProviderCard({ apiKey, canManage }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs: number } | null>(null);
  const qc = useQueryClient();

  const testMutation = useMutation({
    mutationFn: () => apiKeysApi.testConnection(apiKey.id),
    onSuccess: (res) => {
      setTestResult({ success: res.success, message: res.message, latencyMs: res.data.latencyMs });
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      qc.invalidateQueries({ queryKey: ['api-key-test-log', apiKey.id] });
    },
    onError: (err: any) => {
      setTestResult({ success: false, message: err.response?.data?.message || 'Test failed', latencyMs: 0 });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => apiKeysApi.revoke(apiKey.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  const isLive = apiKey.environment === 'live';
  const testStatus = apiKey.last_test_status;

  return (
    <div className={clsx(
      'card transition-all duration-200',
      !apiKey.is_active && 'opacity-60',
    )}>
      {/* ── Header row ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <ProviderLogo provider={apiKey.provider} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 truncate">{apiKey.label}</span>
              <span className={clsx(
                'badge text-xs capitalize',
                isLive ? 'badge-green' : 'badge-yellow',
              )}>
                {apiKey.environment}
              </span>
              {!apiKey.is_active && <span className="badge badge-red text-xs">Revoked</span>}
            </div>
            <p className="mt-0.5 text-xs text-gray-400 capitalize">
              {apiKey.provider}
              {apiKey.last_used_at && (
                <> · Used {formatDistanceToNow(new Date(apiKey.last_used_at), { addSuffix: true })}</>
              )}
            </p>
          </div>
        </div>

        {/* Right-side actions */}
        <div className="flex flex-shrink-0 items-center gap-2">
          {/* Last test status indicator */}
          {testStatus && (
            <span title={apiKey.last_test_message || ''} className="flex items-center gap-1 text-xs">
              {testStatus === 'success'
                ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                : <XCircle className="h-4 w-4 text-red-400" />
              }
              <span className={testStatus === 'success' ? 'text-emerald-600' : 'text-red-500'}>
                {testStatus === 'success' ? 'Connected' : 'Failed'}
              </span>
            </span>
          )}

          {/* Test button */}
          {canManage && apiKey.is_active && (
            <button
              onClick={() => { setTestResult(null); testMutation.mutate(); }}
              disabled={testMutation.isPending}
              className="btn-outline px-3 py-1.5 text-xs gap-1.5"
              title="Run connection test"
            >
              {testMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Wifi className="h-3.5 w-3.5" />
              }
              {testMutation.isPending ? 'Testing…' : 'Test'}
            </button>
          )}

          {/* Revoke */}
          {canManage && apiKey.is_active && (
            <button
              onClick={() => {
                if (window.confirm(`Revoke "${apiKey.label}"? This cannot be undone.`))
                  revokeMutation.mutate();
              }}
              disabled={revokeMutation.isPending}
              className="btn-outline p-2 text-red-400 hover:border-red-300 hover:text-red-600"
              title="Revoke key"
            >
              {revokeMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Trash2 className="h-4 w-4" />
              }
            </button>
          )}

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ── Inline test result banner ───────────────────────────────────── */}
      {testResult && (
        <div className={clsx(
          'mt-3 flex items-start gap-2 rounded-lg p-3 text-sm',
          testResult.success
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-red-50 border border-red-200 text-red-700',
        )}>
          {testResult.success
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
            : <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
          }
          <div>
            <p className="font-medium">{testResult.success ? 'Connection successful' : 'Connection failed'}</p>
            <p className="text-xs mt-0.5 opacity-80">{testResult.message}</p>
            {testResult.latencyMs > 0 && (
              <p className="text-xs mt-0.5 opacity-60 flex items-center gap-1">
                <Clock className="h-3 w-3" />{testResult.latencyMs}ms
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Expanded details ────────────────────────────────────────────── */}
      {expanded && (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
          {/* Key metadata grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div>
              <p className="text-xs text-gray-400">Secret key</p>
              <p className="font-mono text-gray-700">{apiKey.secretKeyMasked ?? '••••••••'}</p>
            </div>
            {apiKey.webhookSecretMasked && (
              <div>
                <p className="text-xs text-gray-400">Webhook secret</p>
                <p className="font-mono text-gray-700">{apiKey.webhookSecretMasked}</p>
              </div>
            )}
            {apiKey.clientIdMasked && (
              <div>
                <p className="text-xs text-gray-400">Client ID</p>
                <p className="font-mono text-gray-700">{apiKey.clientIdMasked}</p>
              </div>
            )}
            {apiKey.publishable_key && (
              <div>
                <p className="text-xs text-gray-400">Publishable key</p>
                <p className="font-mono text-gray-700 text-xs break-all">{apiKey.publishable_key}</p>
              </div>
            )}
            {apiKey.last_verified_at && (
              <div>
                <p className="text-xs text-gray-400">Last verified</p>
                <p className="text-gray-700">{format(new Date(apiKey.last_verified_at), 'PPp')}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400">Added</p>
              <p className="text-gray-700">{format(new Date(apiKey.created_at), 'PPp')}</p>
            </div>
            {apiKey.last_test_at && (
              <div>
                <p className="text-xs text-gray-400">Last tested</p>
                <p className="text-gray-700">{format(new Date(apiKey.last_test_at), 'PPp')}</p>
                {apiKey.last_test_latency_ms && (
                  <p className="text-xs text-gray-400">{apiKey.last_test_latency_ms}ms</p>
                )}
              </div>
            )}
          </div>

          {/* Test history */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Test History</p>
              {canManage && apiKey.is_active && (
                <button
                  onClick={() => { setTestResult(null); testMutation.mutate(); }}
                  disabled={testMutation.isPending}
                  className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
                >
                  <RefreshCw className={clsx('h-3 w-3', testMutation.isPending && 'animate-spin')} />
                  Run again
                </button>
              )}
            </div>
            <ConnectionTestLog keyId={apiKey.id} />
          </div>
        </div>
      )}
    </div>
  );
}
