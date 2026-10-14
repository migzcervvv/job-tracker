import { api } from "./client.js";

export async function getProfile(signal) {
  const { data } = await api.get("/api/me", { signal });
  return data;
}

export async function updateProfile(email) {
  const { data } = await api.put("/api/me/profile", { email });
  return data;
}

export async function changePassword(currentPassword, newPassword) {
  await api.put("/api/me/password", { currentPassword, newPassword });
}
