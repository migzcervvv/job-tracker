import { api } from '../api/client.js';

export async function loginRequest(email, password) {
  const { data } = await api.post('/api/auth/login', { email, password });
  // AuthResponse: { token, email, role }
  return data;
}

export async function registerRequest(email, password) {
  const { data } = await api.post('/api/auth/register', { email, password });
  return data;
}
