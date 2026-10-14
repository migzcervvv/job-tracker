import { api } from "./client.js";
export async function listResumes(signal) {
  return (await api.get("/api/resumes", { signal })).data;
}
export async function uploadResume(file) {
  const form = new FormData();
  form.append("file", file);
  return (await api.post("/api/resumes", form, { timeout: 60000 })).data;
}
export async function getResumeDownloadUrl(id) {
  const { data } = await api.get(`/api/resumes/${id}/download`);
  if (!data.demo) return data.url;
  return URL.createObjectURL(
    (await api.get(`/api/resumes/${id}/content`, { responseType: "blob" }))
      .data,
  );
}
export async function deleteResume(id) {
  await api.delete(`/api/resumes/${id}`);
}
export async function activateResume(id) {
  return (await api.post(`/api/resumes/${id}/activate`)).data;
}
export async function getResumeAutomationStatus(id, runId, signal) {
  return (
    await api.get(`/api/resumes/${id}/automation-status`, {
      params: { runId },
      signal,
    })
  ).data;
}
export async function getProposedSkills(id) {
  return (await api.get(`/api/resumes/${id}/proposed-skills`)).data;
}
export async function confirmResumeSkills(id, skillNames, runId) {
  return (
    await api.post(`/api/resumes/${id}/confirm-skills`, { skillNames, runId })
  ).data;
}
export async function dismissProposedSkills(id, runId) {
  await api.post(`/api/resumes/${id}/dismiss-skills`, { runId });
}
export async function retryResumeExtraction(id) {
  return (await api.post(`/api/resumes/${id}/retry-extraction`)).data;
}
