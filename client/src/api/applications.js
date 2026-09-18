import { api } from "./client.js";

export async function listApplications() {
  const { data } = await api.get("/api/applications");
  return data;
}

export async function createApplication({
  title,
  company,
  jobUrl,
  rawDescription,
}) {
  const { data } = await api.post("/api/applications", {
    title,
    company,
    jobUrl,
    rawDescription,
  });
  return data;
}

export async function updateApplicationStatus(id, status) {
  const { data } = await api.patch(`/api/applications/${id}/status`, {
    status,
  });
  return data;
}

export async function getApplication(id) {
  const { data } = await api.get(`/api/applications/${id}`);
  return data;
}

export async function deleteApplication(id) {
  await api.delete(`/api/applications/${id}`);
}

// stageDetailId: pass the existing record's id when editing it in place
// (any stage). Omit — or pass null — to create: for a single-record stage
// that's the initial save, for InterviewScheduled it's a new round.
export async function upsertStageDetail(
  id,
  stage,
  fields,
  stageDetailId = null,
) {
  const { data } = await api.put(`/api/applications/${id}/stage-details`, {
    stage,
    fields,
    stageDetailId,
  });
  return data;
}

export async function getAutomationStatus(id) {
  const { data } = await api.get(`/api/applications/${id}/automation-status`);
  return data;
}

export async function generateInterviewQuestions(id, round) {
  const { data } = await api.post(
    `/api/applications/${id}/interview-questions`,
    { round },
  );
  return data;
}
