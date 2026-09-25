import { api } from "./client.js";

// Anonymous endpoint — must be reachable before login, so this is called
// with no JWT requirement on the backend side.
// Expected response: { status: "healthy" | "unreachable" | "not_configured" }
export async function checkN8nHealth() {
  const { data } = await api.get("/api/health/n8n");
  return data;
}
