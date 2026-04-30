import api from './api';

export async function getProviderCatalog(orgSlug) {
  const res = await api.get(`/orgs/${orgSlug}/api-keys/providers`);
  return res.data.data;
}

export async function getIntegrations(orgSlug) {
  const res = await api.get(`/orgs/${orgSlug}/api-keys`);
  return res.data.data;
}

export async function createIntegration(orgSlug, payload) {
  const res = await api.post(`/orgs/${orgSlug}/api-keys`, payload);
  return res.data.data;
}

export async function updateIntegration(orgSlug, keyId, payload) {
  const res = await api.put(`/orgs/${orgSlug}/api-keys/${keyId}`, payload);
  return res.data.data;
}

export async function deleteIntegration(orgSlug, keyId) {
  await api.delete(`/orgs/${orgSlug}/api-keys/${keyId}`);
}

export async function testIntegrationConnection(orgSlug, keyId) {
  const res = await api.post(`/orgs/${orgSlug}/api-keys/${keyId}/test`);
  return res.data.data;
}
