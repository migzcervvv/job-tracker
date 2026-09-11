import { Layout } from '../components/Layout.jsx';

// Placeholder counts — replace with GET /api/analytics/summary
const STAGES = [
  { key: 'applied', label: 'Applied', count: 14, color: 'var(--s-applied)' },
  { key: 'pending', label: 'Assessment pending', count: 3, color: 'var(--s-pending)' },
  { key: 'sent', label: 'Assessment sent', count: 2, color: 'var(--s-sent)' },
  { key: 'interview', label: 'Interview scheduled', count: 4, color: 'var(--s-interview)' },
  { key: 'offered', label: 'Offered', count: 1, color: 'var(--s-offered)' },
  { key: 'closed', label: 'Closed (rejected, withdrawn, archived)', count: 9, color: 'var(--s-closed)' },
];

export function Dashboard() {
  return (
    <Layout title="Board">
      <div className="board-rail">
        {STAGES.map((s) => (
          <div className="board-row" key={s.key}>
            <span className="tick" style={{ background: s.color }} />
            <span className="label">{s.label}</span>
            <span className="count">{s.count}</span>
          </div>
        ))}
      </div>

      <div className="panel">
        <p style={{ margin: 0, color: 'var(--text-dim)' }}>
          Kanban columns and drag-and-drop land in the next build step. This
          view currently reads the pipeline summary endpoint only.
        </p>
      </div>
    </Layout>
  );
}
