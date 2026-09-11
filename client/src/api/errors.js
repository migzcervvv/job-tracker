export function extractErrorMessage(err, fallback = 'Something went wrong') {
  const data = err?.response?.data;

  if (typeof data === 'string' && data.trim()) return data;
  if (Array.isArray(data) && data.length) return data.join(' ');
  if (data?.title) return data.title; // ASP.NET ProblemDetails
  if (err?.message === 'Network Error') return 'Cannot reach the server. Is the API running?';

  return fallback;
}
