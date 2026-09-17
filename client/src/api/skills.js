import { api } from "./client.js";

export async function getMySkills() {
  const { data } = await api.get("/api/me/skills");
  return data; // [{ name, level }]
}

export async function setMySkills(skillNames) {
  const { data } = await api.put("/api/me/skills", { skillNames });
  return data; // [{ name, level }]
}

export async function setSkillLevel(name, level) {
  const { data } = await api.put("/api/me/skills/level", { name, level });
  return data; // { name, level }
}

export async function getApplicationSkills(applicationId) {
  const { data } = await api.get(`/api/applications/${applicationId}/skills`);
  return data;
}

export async function setApplicationSkills(applicationId, skillNames) {
  const { data } = await api.put(`/api/applications/${applicationId}/skills`, {
    skillNames,
  });
  return data;
}

export async function getSkillsGap() {
  const { data } = await api.get("/api/analytics/skills-gap");
  return data.skills;
}
