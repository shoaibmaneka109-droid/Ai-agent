import apiClient from './client';

export interface PaymentFilters {
  status?: string;
  provider?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const paymentsApi = {
  list: (filters: PaymentFilters = {}) =>
    apiClient.get('/payments', { params: filters }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get(`/payments/${id}`).then((r) => r.data.data),

  create: (payload: object) =>
    apiClient.post('/payments', payload).then((r) => r.data.data),

  refund: (paymentId: string, payload: { amount: number; reason?: string }) =>
    apiClient.post(`/payments/${paymentId}/refunds`, payload).then((r) => r.data.data),

  analytics: (params: { from?: string; to?: string; groupBy?: string } = {}) =>
    apiClient.get('/payments/analytics', { params }).then((r) => r.data.data),
};
