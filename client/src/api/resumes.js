import { api } from "./client.js";

export async function listResumes() {
  const { data } = await api.get("/api/resumes");
  return data;
}

export async function uploadResume(file) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/api/resumes", form, {
    headers: { "Content-Type": "multipart/form-data" },
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

// Polled while n8n extraction runs.
// -> { status, message, createdAt }
export async function getResumeAutomationStatus(id) {
  const { data } = await api.get(`/api/resumes/${id}/automation-status`);
  return data;
}

// -> { extractionStatus, proposedSkills: [{ name, evidence, strength, alreadyClaimed }] }
export async function getProposedSkills(id) {
  const { data } = await api.get(`/api/resumes/${id}/proposed-skills`);
  return data;
}

// Commits only the names passed — the confirm gate.
export async function confirmResumeSkills(id, skillNames) {
  const { data } = await api.post(`/api/resumes/${id}/confirm-skills`, {
    skillNames,
  });
  return data;
}

export async function dismissProposedSkills(id) {
  await api.post(`/api/resumes/${id}/dismiss-skills`);
}

export async function retryResumeExtraction(id) {
  const { data } = await api.post(`/api/resumes/${id}/retry-extraction`);
  return data;
}
