import { useEffect, useState } from 'react';
import { Layout } from '../../components/Layout.jsx';
import { getHealth } from '../../api/admin.js';
import { extractErrorMessage } from '../../api/errors.js';
import { notify } from '../../notify.js';

const STATUS_COLOR = {
  healthy: 'var(--s-interview)',
  unreachable: '#e07a6f',
  not_configured: 'var(--text-dim)',
};

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function HealthCard({ label, status, detail }) {
  const color = STATUS_COLOR[status] ?? 'var(--text-dim)';
  return (
    <div className="health-card">
      <div className="health-card-top">
        <span className="tick" style={{ background: color, width: 8, height: 8, borderRadius: '50%' }} />
        <span className="health-card-label">{label}</span>
      </div>
      <div className="health-card-status" style={{ color }}>
        {status.replace('_', ' ')}
      </div>
      {detail && <div className="health-card-detail">{detail}</div>}
    </div>
  );
}

export function AdminHealth() {
  const [health, setHealth] = useState(null);

  function refresh() {
    getHealth()
      .then(setHealth)
      .catch((err) => notify.error('Could not load health status', extractErrorMessage(err)));
  }

  useEffect(refresh, []);

  return (
    <Layout
      title="System health"
      actions={<button className="icon-btn" onClick={refresh}>Refresh</button>}
    >
      {health === null && <p style={{ color: 'var(--text-dim)' }}>Loading…</p>}

      {health !== null && (
        <div className="health-grid">
          <HealthCard label="API" status={health.api} detail={`Uptime: ${formatUptime(health.uptimeSeconds)}`} />
          <HealthCard label="Database" status={health.database} detail="Supabase (session pooler)" />
          <HealthCard label="n8n" status={health.n8n} detail="GCP" />
        </div>
      )}
    </Layout>
  );
}
