import api from './api';

export async function getSubscriptionStatus(orgSlug) {
  const res = await api.get(`/orgs/${orgSlug}/subscription`);
  return res.data.data;
}

export async function cancelSubscription(orgSlug, reason = '') {
  const res = await api.post(`/orgs/${orgSlug}/subscription/cancel`, { reason });
  return res.data.data;
}
