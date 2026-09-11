export function daysAgo(dateString) {
  const then = new Date(dateString).getTime();
  const diffMs = Date.now() - then;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (days <= 0) return 'today';
  if (days === 1) return '1d';
  if (days < 14) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export function relativeTime(dateString) {
  const then = new Date(dateString).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / (1000 * 60));

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
