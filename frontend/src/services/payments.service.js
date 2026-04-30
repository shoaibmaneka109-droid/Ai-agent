import api from './api';

export async function getPayments(orgSlug, params = {}) {
  const res = await api.get(`/orgs/${orgSlug}/payments`, { params });
  return res.data;
}

export async function getPayment(orgSlug, paymentId) {
  const res = await api.get(`/orgs/${orgSlug}/payments/${paymentId}`);
  return res.data.data;
}

export async function createPayment(orgSlug, payload) {
  const res = await api.post(`/orgs/${orgSlug}/payments`, payload);
  return res.data.data;
}

export async function refundPayment(orgSlug, paymentId, reason) {
  const res = await api.post(`/orgs/${orgSlug}/payments/${paymentId}/refund`, { reason });
  return res.data.data;
}
