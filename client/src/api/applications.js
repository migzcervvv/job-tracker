import { api } from './client.js';

export async function listApplications() {
  const { data } = await api.get('/api/applications');
  return data;
}

// Response shape changed: { application, wasDuplicate, automationTriggered }
// — the API now detects accidental resubmits and returns the existing row
// instead of erroring, and reports whether skill extraction was fired.
export async function createApplication({ title, company, jobUrl, rawDescription }) {
  const { data } = await api.post('/api/applications', {
    title,
    company,
    jobUrl,
    rawDescription,
  });
  return data;
}

export async function updateApplicationStatus(id, status) {
  const { data } = await api.patch(`/api/applications/${id}/status`, { status });
  return data;
}

export async function getApplication(id) {
  const { data } = await api.get(`/api/applications/${id}`);
  return data;
}

export async function upsertStageDetail(id, stage, fields) {
  const { data } = await api.put(`/api/applications/${id}/stage-details`, { stage, fields });
  return data;
}

export async function deleteApplication(id) {
  await api.delete(`/api/applications/${id}`);
}

export async function getAutomationStatus(id) {
  const { data } = await api.get(`/api/applications/${id}/automation-status`);
  return data;
}
