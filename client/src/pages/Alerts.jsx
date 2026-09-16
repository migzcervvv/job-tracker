import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { getPipelineAlerts } from '../api/analytics.js';
import { extractErrorMessage } from '../api/errors.js';
import { notify } from '../notify.js';

function AlertList({ title, hint, items, emptyText, unit }) {
  return (
    <div className="panel alert-panel">
      <div className="section-label" style={{ marginBottom: 4 }}>{title}</div>
      <p className="alert-hint">{hint}</p>

      {items.length === 0 ? (
        <p className="alert-empty">{emptyText}</p>
      ) : (
        <ul className="alert-list">
          {items.map((a) => (
            <li className="alert-row" key={a.id}>
              <div className="alert-row-main">
                <span className="alert-title">{a.title}</span>
                <span className="alert-company">{a.company || 'No company set'}</span>
              </div>
              <span className="alert-age">
                {a.daysSinceActivity ?? a.daysSinceApplied}
                {unit}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Alerts() {
  const [data, setData] = useState(null);
  const [staleDays, setStaleDays] = useState(7);
  const [noReplyDays, setNoReplyDays] = useState(60);

  useEffect(() => {
    let cancelled = false;
    getPipelineAlerts({ staleDays, noReplyDays })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => {
        if (!cancelled) notify.error('Could not load alerts', extractErrorMessage(err));
      });
    return () => { cancelled = true; };
  }, [staleDays, noReplyDays]);

  return (
    <Layout title="Alerts">
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0, marginBottom: 20, maxWidth: 640 }}>
        Where your pipeline is going quiet. Terminal applications (rejected, withdrawn,
        archived, decided) are excluded — this only surfaces things still theoretically alive.
      </p>

      {data === null && <p style={{ color: 'var(--text-dim)' }}>Loading…</p>}

      {data !== null && (
        <>
          <div className="stat-strip">
            <div className="stat-card">
              <div className="stat-value">{data.appliedThisWeek}</div>
              <div className="stat-label">applied this week</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: data.stale.length > 0 ? 'var(--s-pending)' : undefined }}>
                {data.stale.length}
              </div>
              <div className="stat-label">no activity in {staleDays}d</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: data.noReply.length > 0 ? '#e07a6f' : undefined }}>
                {data.noReply.length}
              </div>
              <div className="stat-label">no reply in {noReplyDays}d</div>
            </div>
          </div>

          <div className="threshold-row">
            <label>
              Stale after
              <select value={staleDays} onChange={(e) => setStaleDays(Number(e.target.value))}>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </label>
            <label>
              No reply after
              <select value={noReplyDays} onChange={(e) => setNoReplyDays(Number(e.target.value))}>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>
          </div>

          <div className="alert-grid">
            <AlertList
              title="Going quiet"
              hint="Active applications with no timeline event — status change, note, anything — in the window above."
              items={data.stale}
              emptyText="Nothing stale. Every active application has moved recently."
              unit="d"
            />
            <AlertList
              title="Never heard back"
              hint="Nothing at all has happened since you first logged these. Good candidates to follow up on or archive."
              items={data.noReply}
              emptyText="No silent applications past the threshold."
              unit="d"
            />
          </div>
        </>
      )}
    </Layout>
  );
}
