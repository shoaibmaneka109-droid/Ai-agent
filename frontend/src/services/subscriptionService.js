import api from './api';

export const getSubscriptionStatus = (orgId) =>
  api.get(`/organizations/${orgId}/subscription`);

export const getSubscriptionEvents = (orgId) =>
  api.get(`/organizations/${orgId}/subscription/events`);

export const reactivateSubscription = (orgId, data) =>
  api.post(`/organizations/${orgId}/subscription/reactivate`, data);

export const cancelSubscription = (orgId, reason) =>
  api.post(`/organizations/${orgId}/subscription/cancel`, { reason });
