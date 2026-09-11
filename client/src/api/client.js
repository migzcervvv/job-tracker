import axios from 'axios';
import { AUTH_STORAGE_KEY } from '../auth/constants.js';
import { notify } from '../notify.js';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (raw) {
    const { token } = JSON.parse(raw);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const wasSignedIn = Boolean(localStorage.getItem(AUTH_STORAGE_KEY));
      localStorage.removeItem(AUTH_STORAGE_KEY);
      if (window.location.pathname !== '/login') {
        if (wasSignedIn) notify.error('Session expired', 'Sign in again to continue.');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);
