// Public API origins only. Netlify environment variables can override this default.
export function resolveApiBaseUrl(configured, production = false) {
  const value =
    configured?.trim() ||
    (production ? "https://jtrackerch.runasp.net" : "https://localhost:7179");
  // Requests already include /api. Accept an accidentally appended /api once.
  return value.replace(/\/+$/, "").replace(/\/api$/i, "");
}
