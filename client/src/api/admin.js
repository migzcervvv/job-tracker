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

export async function listSkillsAdmin() {
  const { data } = await api.get('/api/admin/skills');
  return data;
}

export async function mergeSkills(sourceSkillId, targetSkillId) {
  const { data } = await api.post('/api/admin/skills/merge', { sourceSkillId, targetSkillId });
  return data;
}
