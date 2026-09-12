import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Layout } from '../components/Layout.jsx';
import { getSkillsGap } from '../api/skills.js';
import { extractErrorMessage } from '../api/errors.js';
import { notify } from '../notify.js';

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div
      style={{
        background: 'var(--panel-raised)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: '8px 12px',
        fontSize: 12.5,
        color: 'var(--text)',
      }}
    >
      <div style={{ marginBottom: 2 }}>{item.name}</div>
      <div style={{ color: 'var(--text-dim)' }}>
        {item.frequency}% of your applications · {item.iHaveIt ? 'you have this' : "you don't have this"}
      </div>
    </div>
  );
}

export function SkillsGap() {
  const [skills, setSkills] = useState(null);

  useEffect(() => {
    getSkillsGap()
      .then(setSkills)
      .catch((err) => notify.error('Could not load skills gap', extractErrorMessage(err)));
  }, []);

  return (
    <Layout title="Skills gap">
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0, marginBottom: 20 }}>
        How often each skill appears across your applications' required-skill tags, and whether
        it's one of your claimed skills.
      </p>

      {skills === null && <p style={{ color: 'var(--text-dim)' }}>Loading…</p>}

      {skills !== null && skills.length === 0 && (
        <div className="panel">
          <p style={{ margin: 0, color: 'var(--text-dim)' }}>
            No data yet — tag required skills on an application's detail view, or add your own
            skills in Settings, to start building this chart.
          </p>
        </div>
      )}

      {skills !== null && skills.length > 0 && (
        <>
          <div className="panel" style={{ height: 420 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={skills} layout="vertical" margin={{ left: 12, right: 20 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--text-dim)', fontSize: 11 }} unit="%" />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fill: 'var(--text)', fontSize: 12 }}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="frequency" radius={[0, 3, 3, 0]}>
                  {skills.map((s) => (
                    <Cell key={s.name} fill={s.iHaveIt ? 'var(--s-interview)' : 'var(--accent)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'flex', gap: 20, marginTop: 14, fontSize: 12, color: 'var(--text-dim)' }}>
            <span>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 1, background: 'var(--s-interview)', marginRight: 6 }} />
              You have this
            </span>
            <span>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 1, background: 'var(--accent)', marginRight: 6 }} />
              Gap
            </span>
          </div>
        </>
      )}
    </Layout>
  );
}
