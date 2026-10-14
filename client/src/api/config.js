// Development uses a public API origin; production uses the checked-in Netlify proxy.
export function resolveApiTimeout(configured, development = false) {
  // Pausing the API in Visual Studio does not pause the browser's timer.
  if (!development) return 15000;
  const value = Number(configured);
  return Number.isFinite(value) && value >= 1000 && value <= 600000
    ? value
    : 120000;
}

export function resolveApiBaseUrl(
  configured,
  production = false,
  hostname = typeof window === "undefined" ? "" : window.location.hostname,
) {
  const local =
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname) ||
    hostname.endsWith(".localhost");
  // Netlify forwards /api to MonsterASP. Keep browser requests on this origin
  // so stale build variables, mixed content, and CORS do not break every screen.
  // A production build previewed locally still needs the local API, rather
  // than the Netlify proxy used by the deployed site.
  if (production && !local) return "";
  const value = configured?.trim() || "https://localhost:7179";
  // Requests already include /api. Accept an accidentally appended /api once.
  return value.replace(/\/+$/, "").replace(/\/api$/i, "");
}
