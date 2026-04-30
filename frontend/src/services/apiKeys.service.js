import api from './api';

export async function getApiKeys(orgSlug) {
  const res = await api.get(`/orgs/${orgSlug}/api-keys`);
  return res.data.data;
}

export async function createApiKey(orgSlug, payload) {
  const res = await api.post(`/orgs/${orgSlug}/api-keys`, payload);
  return res.data.data;
}

export async function rotateApiKey(orgSlug, keyId, rawKey) {
  const res = await api.put(`/orgs/${orgSlug}/api-keys/${keyId}`, { rawKey });
  return res.data.data;
}

export async function deleteApiKey(orgSlug, keyId) {
  await api.delete(`/orgs/${orgSlug}/api-keys/${keyId}`);
}
