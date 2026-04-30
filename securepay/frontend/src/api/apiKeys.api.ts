import apiClient from './client';

export interface CreateApiKeyPayload {
  label: string;
  provider: 'stripe' | 'airwallex' | 'custom';
  environment: 'live' | 'sandbox';
  secretKey: string;
  publishableKey?: string;
  webhookSecret?: string;
}

export const apiKeysApi = {
  list: () => apiClient.get('/api-keys').then((r) => r.data.data),

  get: (id: string) => apiClient.get(`/api-keys/${id}`).then((r) => r.data.data),

  create: (payload: CreateApiKeyPayload) =>
    apiClient.post('/api-keys', payload).then((r) => r.data.data),

  update: (id: string, label: string) =>
    apiClient.patch(`/api-keys/${id}`, { label }).then((r) => r.data.data),

  revoke: (id: string) =>
    apiClient.delete(`/api-keys/${id}`).then((r) => r.data.data),
};
