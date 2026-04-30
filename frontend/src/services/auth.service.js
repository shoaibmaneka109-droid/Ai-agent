import api from './api';

export async function login(email, password) {
  const res = await api.post('/auth/login', { email, password });
  const { accessToken, refreshToken, user } = res.data.data;
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  return user;
}

export async function register(payload) {
  const res = await api.post('/auth/register', payload);
  return res.data.data;
}

export async function getMe() {
  const res = await api.get('/auth/me');
  return res.data.data;
}

export function logout() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}
