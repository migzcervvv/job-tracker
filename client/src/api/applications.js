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

export async function upsertStageDetail(id, stage, fields) {
  const { data } = await api.put(`/api/applications/${id}/stage-details`, {
    stage,
    fields,
  });
  return data;
}
