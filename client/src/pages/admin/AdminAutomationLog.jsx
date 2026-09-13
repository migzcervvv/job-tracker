import { useEffect, useState } from 'react';
import { Layout } from '../../components/Layout.jsx';
import { getAutomationLog } from '../../api/admin.js';
import { relativeTime } from '../../api/dates.js';
import { extractErrorMessage } from '../../api/errors.js';
import { notify } from '../../notify.js';

const STATUS_COLOR = {
  triggered: 'var(--s-pending)',
  succeeded: 'var(--s-interview)',
  failed: '#e07a6f',
};

export function AdminAutomationLog() {
  const [entries, setEntries] = useState(null);

  function refresh() {
    getAutomationLog(50)
      .then(setEntries)
      .catch((err) => notify.error('Could not load automation log', extractErrorMessage(err)));
  }

  useEffect(refresh, []);

  return (
    <Layout
      title="Automation log"
      actions={<button className="icon-btn" onClick={refresh}>Refresh</button>}
    >
      {entries === null && <p style={{ color: 'var(--text-dim)' }}>Loading…</p>}

      {entries !== null && entries.length === 0 && (
        <div className="panel">
          <p style={{ margin: 0, color: 'var(--text-dim)' }}>
            No automation activity yet — this fills in once applications start triggering n8n.
          </p>
        </div>
      )}

      {entries !== null && entries.length > 0 && (
        <ul className="timeline-list">
          {entries.map((e) => (
            <li key={e.id} className="timeline-item">
              <span
                className="tick"
                style={{ background: STATUS_COLOR[e.status] ?? 'var(--text-dim)', width: 7, height: 7, borderRadius: '50%', flexShrink: 0 }}
              />
              <span className="timeline-label" style={{ textTransform: 'capitalize' }}>{e.status}</span>
              <span className="timeline-body">
                {e.type} {e.applicationId ? `· ${e.applicationId.slice(0, 8)}` : ''}
                {e.message ? ` — ${e.message}` : ''}
              </span>
              <span className="timeline-time">{relativeTime(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
