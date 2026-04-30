import api from './api';

export const getProfile = () => api.get('/users/profile');
export const updateProfile = (data) => api.patch('/users/profile', data);
export const changePassword = (data) => api.post('/users/change-password', data);
