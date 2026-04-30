import apiClient from './client';

export interface RegisterPayload {
  tenantName: string;
  tenantSlug: string;
  plan: 'solo' | 'agency';
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
  tenantSlug: string;
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    apiClient.post('/auth/register', payload).then((r) => r.data.data),

  login: (payload: LoginPayload) =>
    apiClient.post('/auth/login', payload).then((r) => r.data.data),

  logout: () => apiClient.post('/auth/logout'),

  me: () => apiClient.get('/auth/me').then((r) => r.data.data),
};
