import api from './api';

export const getOrganization = (orgId) => api.get(`/organizations/${orgId}`);
export const updateOrganization = (orgId, data) => api.patch(`/organizations/${orgId}`, data);
export const listMembers = (orgId, params) => api.get(`/organizations/${orgId}/members`, { params });
export const inviteMember = (orgId, data) => api.post(`/organizations/${orgId}/members/invite`, data);
export const updateMemberRole = (orgId, userId, role) =>
  api.patch(`/organizations/${orgId}/members/${userId}/role`, { role });
