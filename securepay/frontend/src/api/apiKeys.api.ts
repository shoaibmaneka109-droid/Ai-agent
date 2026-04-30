import apiClient from './client';

export type Provider = 'stripe' | 'airwallex' | 'wise' | 'custom';
export type Environment = 'live' | 'sandbox';

export interface CreateApiKeyPayload {
  label: string;
  provider: Provider;
  environment: Environment;
  secretKey: string;
  publishableKey?: string;
  webhookSecret?: string;
  clientId?: string;       // Airwallex
  extraConfig?: Record<string, string>;  // e.g. { test_url } for custom
}

export interface ApiKey {
  id: string;
  label: string;
  provider: Provider;
  environment: Environment;
  publishable_key?: string;
  is_active: boolean;
  last_verified_at?: string;
  last_used_at?: string;
  last_test_at?: string;
  last_test_status?: 'success' | 'failure';
  last_test_message?: string;
  last_test_latency_ms?: number;
  secretKeyMasked?: string;
  webhookSecretMasked?: string;
  clientIdMasked?: string;
  extra_config?: Record<string, unknown>;
  created_at: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  data: {
    status: 'success' | 'failure';
    latencyMs: number;
    providerDetail: Record<string, unknown>;
    logId: string;
    testedAt: string;
  };
}

export const apiKeysApi = {
  list: (): Promise<ApiKey[]> =>
    apiClient.get('/api-keys').then((r) => r.data.data),

  get: (id: string): Promise<ApiKey> =>
    apiClient.get(`/api-keys/${id}`).then((r) => r.data.data),

  create: (payload: CreateApiKeyPayload): Promise<ApiKey> =>
    apiClient.post('/api-keys', payload).then((r) => r.data.data),

  update: (id: string, updates: { label?: string; extraConfig?: Record<string, string> }): Promise<ApiKey> =>
    apiClient.patch(`/api-keys/${id}`, updates).then((r) => r.data.data),

  revoke: (id: string): Promise<{ id: string; label: string }> =>
    apiClient.delete(`/api-keys/${id}`).then((r) => r.data.data),

  testConnection: (id: string): Promise<ConnectionTestResult> =>
    apiClient.post(`/api-keys/${id}/test`).then((r) => r.data),

  getTestLog: (id: string, limit = 20) =>
    apiClient.get(`/api-keys/${id}/test-log`, { params: { limit } }).then((r) => r.data.data),
};
