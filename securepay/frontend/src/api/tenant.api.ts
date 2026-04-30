import apiClient from './client';

export const tenantApi = {
  getProfile: () => apiClient.get('/tenants/profile').then((r) => r.data.data),

  updateProfile: (payload: object) =>
    apiClient.patch('/tenants/profile', payload).then((r) => r.data.data),

  getTeam: (params: { page?: number; limit?: number } = {}) =>
    apiClient.get('/tenants/team', { params }).then((r) => r.data),

  updateMemberRole: (userId: string, role: string) =>
    apiClient.patch(`/tenants/team/${userId}/role`, { role }).then((r) => r.data.data),

  removeMember: (userId: string) =>
    apiClient.delete(`/tenants/team/${userId}`).then((r) => r.data),
};
