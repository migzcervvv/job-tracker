export function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function toInstant(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Invalid date and time");
  return date.toISOString();
}
export function dateOnlyLabel(value, locale) {
  return value ? new Date(value + "T12:00:00").toLocaleDateString(locale) : "";
}
