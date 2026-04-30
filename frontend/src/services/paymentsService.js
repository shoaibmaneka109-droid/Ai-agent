import api from './api';

export const listPayments = (orgId, params) =>
  api.get(`/organizations/${orgId}/payments`, { params });
export const createPaymentIntent = (orgId, data) =>
  api.post(`/organizations/${orgId}/payments/intent`, data);
export const getPayment = (orgId, paymentId) =>
  api.get(`/organizations/${orgId}/payments/${paymentId}`);
export const updatePaymentStatus = (orgId, paymentId, data) =>
  api.patch(`/organizations/${orgId}/payments/${paymentId}/status`, data);
