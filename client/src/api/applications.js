import { api } from "./client.js";
export async function listApplications() {
  const result = [];
  for (let page = 1; ; page++) {
    const { data } = await api.get("/api/applications", {
      params: { page, pageSize: 200 },
    });
    if (!Array.isArray(data)) {
      const error = new Error("The application list response is invalid.");
      error.code =
        typeof data === "string" && /<!doctype|<html/i.test(data)
          ? "API_RETURNED_HTML"
          : "INVALID_APPLICATION_LIST";
      throw error;
    }
    result.push(...data);
    if (data.length < 200) return result;
  }
}
export async function createApplication(application) {
  return (await api.post("/api/applications", application)).data;
}
export async function editApplication(id, version, application) {
  return (await api.put(`/api/applications/${id}`, { version, application }))
    .data;
}
export async function updateApplicationStatus(id, status, version) {
  return (
    await api.patch(`/api/applications/${id}/status`, { status, version })
  ).data;
}
export async function getApplication(id, signal) {
  return (await api.get(`/api/applications/${id}`, { signal })).data;
}
export async function deleteApplication(id) {
  await api.delete(`/api/applications/${id}`);
}
export async function upsertStageDetail(
  id,
  stage,
  fields,
  stageDetailId = null,
  version = null,
) {
  return (
    await api.put(`/api/applications/${id}/stage-details`, {
      stage,
      fields,
      stageDetailId,
      version,
    })
  ).data;
}
export async function getAutomationStatus(
  id,
  runId,
  type = "skill_extraction",
  signal,
) {
  return (
    await api.get(`/api/applications/${id}/automation-status`, {
      params: { runId, type },
      signal,
    })
  ).data;
}
export async function generateInterviewQuestions(id, stageDetailId) {
  return (
    await api.post(`/api/applications/${id}/interview-questions`, {
      stageDetailId,
    })
  ).data;
}
export async function retrySkillExtraction(id) {
  return (await api.post(`/api/applications/${id}/retry-skill-extraction`))
    .data;
}
export async function saveFollowUp(id, values) {
  return (await api.patch(`/api/applications/${id}/follow-up`, values)).data;
}
export async function addNote(id, body) {
  return (await api.post(`/api/applications/${id}/notes`, { body })).data;
}
