import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || '/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  me: () => api.get('/auth/me'),
};

export const orgApi = {
  get: () => api.get('/organizations'),
  update: (data) => api.patch('/organizations', data),
  stats: () => api.get('/organizations/stats'),
  members: () => api.get('/organizations/members'),
};

export const apiKeysApi = {
  list: () => api.get('/api-keys'),
  create: (data) => api.post('/api-keys', data),
  rotate: (id, data) => api.put(`/api-keys/${id}/rotate`, data),
  delete: (id) => api.delete(`/api-keys/${id}`),
};

export const paymentsApi = {
  list: (params) => api.get('/payments', { params }),
  get: (id) => api.get(`/payments/${id}`),
  create: (data) => api.post('/payments', data),
  stats: (params) => api.get('/payments/stats', { params }),
};

export const usersApi = {
  list: () => api.get('/users'),
  updateProfile: (data) => api.patch('/users/me/profile', data),
  changePassword: (data) => api.post('/users/me/change-password', data),
  updateRole: (id, role) => api.patch(`/users/${id}/role`, { role }),
  deactivate: (id) => api.delete(`/users/${id}`),
};

export const subscriptionApi = {
  getStatus: () => api.get('/subscription'),
  getEvents: () => api.get('/subscription/events'),
  activate: (data) => api.post('/subscription/activate', data),
  cancel: (data) => api.post('/subscription/cancel', data),
  simulateExpire: () => api.post('/subscription/simulate-expire'),
};

export default api;
