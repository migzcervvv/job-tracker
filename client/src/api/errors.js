const DEFAULT_MESSAGE = "We couldn’t complete that request. Please try again.";
function readable(message) {
  if (typeof message !== "string") return null;
  const text = message.trim();
  if (
    !text ||
    text.length > 400 ||
    /<[^>]+>|stack trace|exception|npgsql|sqlstate|system\.|traceid|json value|deserializ|schemaVersion|runId|1536|connectionstring/i.test(
      text,
    )
  )
    return null;
  const translations = [
    [
      /invalid email or password/i,
      "The email or password isn’t correct. Check your details and try again.",
    ],
    [
      /not configured/i,
      "Automatic processing isn’t available right now. You can keep editing and try again later.",
    ],
    [
      /run.*(replaced|active)|proposal.*(changed|current)|select skills from/i,
      "These results have changed. Reopen the review to see the latest suggestions.",
    ],
    [
      /shared demo|demo account/i,
      "Account details cannot be changed in the demo.",
    ],
    [
      /password.*(length|characters)|passwordtooshort/i,
      "Use at least 10 characters, including an uppercase letter, a lowercase letter and a number.",
    ],
    [
      /polling deadline|callback_timeout|dispatch_failed|workflow_failed/i,
      "Processing is taking longer than expected. Check again or try starting it again.",
    ],
  ];
  return translations.find(([pattern]) => pattern.test(text))?.[1] ?? text;
}
export function extractErrorMessage(err, fallback = DEFAULT_MESSAGE) {
  if (err?.code === "API_RETURNED_HTML")
    return "The website received a page instead of application data. The frontend API address needs to point to the backend.";
  if (err?.code === "INVALID_APPLICATION_LIST")
    return "The server returned an unexpected application list. Check that the frontend and backend deployments are up to date.";
  if (err?.code === "INVALID_APPLICATION_DETAIL")
    return "The server returned incomplete application details. Check that the frontend and backend deployments are up to date.";
  const status = err?.response?.status;
  if (err?.code === "ECONNABORTED" || err?.code === "ETIMEDOUT")
    return "The request took too long. Check your connection and try again.";
  if (err?.message === "Network Error")
    return "We can’t connect right now. Check your internet connection and try again in a moment.";
  if (status === 401)
    return /invalid email or password/i.test(String(err?.response?.data))
      ? "The email or password isn’t correct. Check your details and try again."
      : "Please sign in again to continue.";
  if (status === 403)
    return "You don’t have permission to do that. Contact your administrator if you need access.";
  if (status === 404)
    return "This item is no longer available. Go back and refresh the list.";
  if (status === 409)
    return "This item was updated elsewhere. Reload the latest version before saving again.";
  if (status === 413)
    return "This file is too large. Choose a smaller file and try again.";
  if (status === 429)
    return "Too many attempts. Wait a moment before trying again.";
  if (status >= 500) {
    const reasons = {
      database_schema_outdated:
        "The server database is missing a required update. The server administrator needs to apply the database migrations.",
      database_unavailable:
        "The server cannot reach its database right now. Try again in a moment.",
    };
    const reason =
      reasons[err?.response?.data?.code] ??
      (status === 502 || status === 504
        ? "The website could not get a response from the backend server."
        : "The server could not complete this request.");
    const requestId =
      err?.response?.data?.requestId ??
      err?.response?.headers?.["x-request-id"];
    const reference =
      typeof requestId === "string" &&
      /^[a-zA-Z0-9:._-]{1,100}$/.test(requestId)
        ? ` Reference: ${requestId}.`
        : "";
    return `${reason} (HTTP ${status}).${reference}`;
  }
  const data = err?.response?.data;
  const messages = Array.isArray(data)
    ? data
    : data?.errors
      ? Object.values(data.errors).flat()
      : [typeof data === "string" ? data : (data?.error ?? data?.detail)];
  const message = messages.map(readable).filter(Boolean).join(" ");
  if (message) return message;
  if (status === 400 || status === 422)
    return "Check the information you entered and try again.";
  if (!err?.response && err instanceof SyntaxError)
    return "This file couldn’t be read. Choose a valid JSON backup or CSV file.";
  if (!err?.response && /CSV requires a title column/i.test(err?.message))
    return "Your CSV needs a column named title. Add it and try importing again.";
  if (!err?.response && /CSV quote/i.test(err?.message))
    return "Some quotes in this CSV are incomplete. Save it again as CSV and try importing again.";
  if (!err?.response && /Invalid date and time/i.test(err?.message))
    return "Choose a valid date and time before saving.";
  return readable(fallback) ?? DEFAULT_MESSAGE;
}
