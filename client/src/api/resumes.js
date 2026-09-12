import { api } from './client.js';

export async function listResumes() {
  const { data } = await api.get('/api/resumes');
  return data;
}

export async function uploadResume(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/api/resumes', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getResumeDownloadUrl(id) {
  const { data } = await api.get(`/api/resumes/${id}/download`);
  return data.url;
}

export async function deleteResume(id) {
  await api.delete(`/api/resumes/${id}`);
}
