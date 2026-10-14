// Development uses a public API origin; production uses the checked-in Netlify proxy.
export function resolveApiBaseUrl(configured, production = false) {
  // Netlify forwards /api to MonsterASP. Keep browser requests on this origin
  // so stale build variables, mixed content, and CORS do not break every screen.
  if (production) return "";
  const value = configured?.trim() || "https://localhost:7179";
  // Requests already include /api. Accept an accidentally appended /api once.
  return value.replace(/\/+$/, "").replace(/\/api$/i, "");
}
