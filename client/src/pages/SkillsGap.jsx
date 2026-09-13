import { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { getSkillsGap } from '../api/skills.js';
import { extractErrorMessage } from '../api/errors.js';
import { notify } from '../notify.js';

function RankedList({ title, hint, items, tone, showTrend }) {
  return (
    <div className="panel skill-panel">
      <div className="section-label" style={{ marginBottom: 4 }}>{title}</div>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-dim)' }}>{hint}</p>

      {items.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>Nothing here yet.</p>
      )}

      {items.map((item) => (
        <div className="skill-row" key={item.name}>
          <div className="skill-row-top">
            <span className="skill-name">{item.name}</span>
            <span className="skill-value">
              {showTrend ? `${item.trend > 0 ? '+' : ''}${item.trend}pt` : `${item.frequency}%`}
            </span>
          </div>
          <div className="skill-bar-track">
            <div
              className="skill-bar-fill"
              style={{ width: `${Math.min(Math.abs(showTrend ? item.trend : item.frequency), 100)}%`, background: tone }}
            />
          </div>
        </div>
      ))}
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

  const { gaps, strengths, rising, fading } = useMemo(() => {
    const list = skills ?? [];
    return {
      gaps: [...list].filter((s) => !s.iHaveIt).sort((a, b) => b.frequency - a.frequency).slice(0, 5),
      strengths: [...list].filter((s) => s.iHaveIt).sort((a, b) => b.frequency - a.frequency).slice(0, 5),
      rising: [...list].filter((s) => s.trend > 0).sort((a, b) => b.trend - a.trend).slice(0, 5),
      fading: [...list].filter((s) => s.trend < 0).sort((a, b) => a.trend - b.trend).slice(0, 5),
    };
  }, [skills]);

  return (
    <Layout title="Skills gap">
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0, marginBottom: 20, maxWidth: 640 }}>
        Based on required skills tagged across your applications, compared against your own
        claimed skills. Trend compares your more recent applications against your older ones —
        with only a handful of applications, treat trend numbers as a rough signal, not a precise one.
      </p>

      {skills === null && <p style={{ color: 'var(--text-dim)' }}>Loading…</p>}

      {skills !== null && skills.length === 0 && (
        <div className="panel">
          <p style={{ margin: 0, color: 'var(--text-dim)' }}>
            No data yet — tag required skills on an application's detail view, or add your own
            skills in Settings, to start building this out.
          </p>
        </div>
      )}

      {skills !== null && skills.length > 0 && (
        <div className="skill-grid">
          <RankedList
            title="Biggest gaps"
            hint="Frequently required, not yet in your skill set — the highest-leverage things to pick up."
            items={gaps}
            tone="var(--accent)"
          />
          <RankedList
            title="Your strengths"
            hint="Skills you already have that also show up often in postings."
            items={strengths}
            tone="var(--s-interview)"
          />
          <RankedList
            title="Rising"
            hint="Appearing more in your recent applications than your older ones."
            items={rising}
            tone="var(--s-offered)"
            showTrend
          />
          <RankedList
            title="Fading"
            hint="Showing up less than it used to — lower priority to chase right now."
            items={fading}
            tone="var(--s-closed)"
            showTrend
          />
        </div>
      )}
    </Layout>
  );
}
