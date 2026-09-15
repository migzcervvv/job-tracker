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

// Returns { url, contentType, fileName } — url is a short-lived signed link.
export async function getResumeDownloadUrl(id) {
  const { data } = await api.get(`/api/resumes/${id}/download`);
  return data;
}

export async function deleteResume(id) {
  await api.delete(`/api/resumes/${id}`);
}

// Replaces the old (broken) getResumeAutomationStatus — that polled
// /api/resumes/{id}/automation-status, which was never a real route on
// this controller (it only exists on ApplicationsController, for a
// different resource). Every poll 404'd, which is what made the app
// "lose track" of n8n. This is the endpoint that was actually built to
// answer this question.
export async function getProposedSkills(id) {
  const { data } = await api.get(`/api/resumes/${id}/proposed-skills`);
  return data;
}

export async function confirmResumeSkills(id, skillNames) {
  const { data } = await api.post(`/api/resumes/${id}/confirm-skills`, {
    skillNames,
  });
  return data;
}

export async function dismissResumeSkills(id) {
  await api.post(`/api/resumes/${id}/dismiss-skills`);
}
