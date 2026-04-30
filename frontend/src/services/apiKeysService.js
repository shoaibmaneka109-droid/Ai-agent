import api from './api';

export const listApiKeys = (orgId) =>
  api.get(`/organizations/${orgId}/api-keys`);

export const createApiKey = (orgId, data) =>
  api.post(`/organizations/${orgId}/api-keys`, data);

export const getApiKey = (orgId, keyId) =>
  api.get(`/organizations/${orgId}/api-keys/${keyId}`);

export const updateApiKeyMeta = (orgId, keyId, data) =>
  api.patch(`/organizations/${orgId}/api-keys/${keyId}/meta`, data);

export const testApiKeyConnection = (orgId, keyId) =>
  api.post(`/organizations/${orgId}/api-keys/${keyId}/test`);

export const rotateApiKey = (orgId, keyId, data) =>
  api.put(`/organizations/${orgId}/api-keys/${keyId}/rotate`, data);

export const toggleApiKey = (orgId, keyId, isActive) =>
  api.patch(`/organizations/${orgId}/api-keys/${keyId}/toggle`, { isActive });

export const deleteApiKey = (orgId, keyId) =>
  api.delete(`/organizations/${orgId}/api-keys/${keyId}`);
