import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});

// ── Request interceptor: attach access token ──────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor ──────────────────────────────────────────────────────
let refreshing = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status   = error.response?.status;

    // ── 401: try token refresh, then re-attempt original ──────────────────
    if (
      status === 401 &&
      !original._retry &&
      !original.url?.includes('/auth/refresh')
    ) {
      original._retry = true;

      if (!refreshing) {
        refreshing = api
          .post('/auth/refresh', { refreshToken: localStorage.getItem('refreshToken') })
          .then((res) => {
            localStorage.setItem('accessToken', res.data.data.accessToken);
            return res.data.data.accessToken;
          })
          .catch(() => {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            window.location.href = '/login';
            return Promise.reject(error);
          })
          .finally(() => { refreshing = null; });
      }

      try {
        const newToken = await refreshing;
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        return Promise.reject(error);
      }
    }

    // ── 402: Payment Required / Data Hibernation ──────────────────────────
    // Bubble the subscription payload so UI components can react to it
    // without each needing their own 402-handling code.
    if (status === 402) {
      const subData = error.response?.data?.error?.subscription;
      window.dispatchEvent(new CustomEvent('securepay:hibernated', { detail: subData }));
    }

    return Promise.reject(error);
  },
);

export default api;
