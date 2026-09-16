export function formatBytes(bytes) {
  // Guard: the API omits sizeBytes on some responses (and a freshly-uploaded
  // row read back before commit can arrive undefined) — without this the
  // arithmetic below produces NaN and renders "NaN KB" in the resume list.
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) return '—';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Log-style relative time: "just now", "12m ago", "3h ago", "2d ago".
export function logTime(dateString) {
  const then = new Date(dateString).getTime();
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Coarse bucket used to group log entries under headers.
export function logBucket(dateString) {
  const mins = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
  if (mins < 60) return 'Last hour';
  if (mins < 1440) return 'Today';
  if (mins < 2880) return 'Yesterday';
  if (mins < 10080) return 'This week';
  return 'Older';
}

export function absoluteTime(dateString) {
  return new Date(dateString).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}
