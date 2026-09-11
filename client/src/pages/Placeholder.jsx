import { Layout } from '../components/Layout.jsx';

export function Placeholder({ title, note }) {
  return (
    <Layout title={title}>
      <div className="panel">
        <p style={{ margin: 0, color: 'var(--text-dim)' }}>{note}</p>
      </div>
    </Layout>
  );
}
