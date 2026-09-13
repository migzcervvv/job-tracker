import { api } from './client.js';

export async function listUsers() {
  const { data } = await api.get('/api/admin/users');
  return data;
}

export async function setUserRole(id, role) {
  await api.put(`/api/admin/users/${id}/role`, { role });
}

export async function deleteUser(id) {
  await api.delete(`/api/admin/users/${id}`);
}

export async function getHealth() {
  const { data } = await api.get('/api/admin/health');
  return data;
}

export async function getAutomationLog(take = 50) {
  const { data } = await api.get('/api/admin/automation-log', { params: { take } });
  return data;
}

// Returns { items, totalCount, page, pageSize }
export async function listSkillsAdmin({ search = '', page = 1, pageSize = 20 } = {}) {
  const { data } = await api.get('/api/admin/skills', { params: { search, page, pageSize } });
  return data;
}

export async function mergeSkills(sourceSkillId, targetSkillId) {
  const { data } = await api.post('/api/admin/skills/merge', { sourceSkillId, targetSkillId });
  return data;
}

export async function createUserAdmin(email, password, role) {
  const { data } = await api.post('/api/admin/users', { email, password, role });
  return data;
}
