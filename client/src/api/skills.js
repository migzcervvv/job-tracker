import { api } from "./client.js";
export async function getMySkills(signal) {
  return (await api.get("/api/me/skills", { signal })).data;
}
export async function addMySkill(name) {
  return (await api.post("/api/me/skills", { skillNames: [name] })).data;
}
export async function removeMySkill(name) {
  await api.delete("/api/me/skills/" + encodeURIComponent(name));
}
export async function setSkillLevel(name, level) {
  return (await api.put("/api/me/skills/level", { name, level })).data;
}
export async function getApplicationSkills(id, signal) {
  return (await api.get(`/api/applications/${id}/skills`, { signal })).data;
}
export async function setApplicationSkills(id, skills, version) {
  return (await api.put(`/api/applications/${id}/skills`, { skills, version }))
    .data;
}
export async function getSkillsGap() {
  return (await api.get("/api/analytics/skills-gap")).data;
}
