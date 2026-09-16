import { useEffect, useMemo, useState } from 'react';
import { Layout } from '../../components/Layout.jsx';
import { getAutomationLog } from '../../api/admin.js';
import { logTime, logBucket, absoluteTime } from '../../api/format.js';
import { extractErrorMessage } from '../../api/errors.js';
import { notify } from '../../notify.js';

const BUCKET_ORDER = ['Last hour', 'Today', 'Yesterday', 'This week', 'Older'];

const LEVEL = {
  triggered: { label: 'RUN', color: 'var(--s-pending)' },
  succeeded: { label: 'OK', color: 'var(--s-interview)' },
  failed: { label: 'ERR', color: '#e07a6f' },
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'failed', label: 'Errors' },
  { key: 'triggered', label: 'Running' },
  { key: 'succeeded', label: 'Succeeded' },
];

export function AdminAutomationLog() {
  const [entries, setEntries] = useState(null);
  const [filter, setFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  function refresh() {
    getAutomationLog(200)
      .then(setEntries)
      .catch((err) => notify.error('Could not load automation log', extractErrorMessage(err)));
  }

  useEffect(refresh, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const filtered = useMemo(
    () => (entries ?? []).filter((e) => filter === 'all' || e.status === filter),
    [entries, filter]
  );

  // Group into time buckets, preserving the newest-first order the API returns.
  const grouped = useMemo(() => {
    const map = new Map();
    for (const e of filtered) {
      const bucket = logBucket(e.createdAt);
      if (!map.has(bucket)) map.set(bucket, []);
      map.get(bucket).push(e);
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => [b, map.get(b)]);
  }, [filtered]);

  const errorCount = (entries ?? []).filter((e) => e.status === 'failed').length;

  return (
    <Layout
      title="Automation log"
      actions={
        <>
          <label className="auto-refresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Live
          </label>
          <button className="icon-btn" onClick={refresh}>Refresh</button>
        </>
      }
    >
      <div className="log-toolbar">
        <div className="view-toggle">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={filter === f.key ? 'active' : ''}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              {f.key === 'failed' && errorCount > 0 && <span className="filter-count">{errorCount}</span>}
            </button>
          ))}
        </div>
        <span className="log-meta">
          {entries === null ? 'Loading…' : `${filtered.length} of ${entries.length} entries`}
        </span>
      </div>

      {entries !== null && filtered.length === 0 && (
        <div className="panel">
          <p style={{ margin: 0, color: 'var(--text-dim)' }}>
            {filter === 'all'
              ? 'No automation activity yet — this fills in once applications and resumes start triggering n8n.'
              : 'Nothing matches this filter.'}
          </p>
        </div>
      )}

      {grouped.map(([bucket, items]) => (
        <div className="log-group" key={bucket}>
          <div className="log-group-head">
            <span>{bucket}</span>
            <span className="log-group-count">{items.length}</span>
          </div>
          <div className="log-stream">
            {items.map((e) => {
              const level = LEVEL[e.status] ?? { label: '???', color: 'var(--text-dim)' };
              return (
                <div className={`log-line log-line-${e.status}`} key={e.id} title={absoluteTime(e.createdAt)}>
                  <span className="log-level" style={{ color: level.color, borderColor: level.color }}>
                    {level.label}
                  </span>
                  <span className="log-type">{e.type}</span>
                  <span className="log-message">
                    {e.message || (e.applicationId ? e.applicationId : '—')}
                  </span>
                  <span className="log-ts">{logTime(e.createdAt)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </Layout>
  );
}
