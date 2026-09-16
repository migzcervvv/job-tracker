import { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { getSkillsGap } from '../api/skills.js';
import { extractErrorMessage } from '../api/errors.js';
import { notify } from '../notify.js';

// Importance is 1-3 from the JD extraction (nice-to-have → required).
// Weighting by it means "required everywhere" outranks "mentioned often
// but always optional", which raw frequency alone can't distinguish.
const IMPORTANCE_LABEL = { 3: 'required', 2: 'preferred', 1: 'nice to have' };

function weightedScore(item) {
  const imp = item.avgImportance ?? 2;
  return item.frequency * (imp / 2);
}

function RankedList({ title, hint, items, tone, mode }) {
  return (
    <div className="panel skill-panel">
      <div className="section-label" style={{ marginBottom: 4 }}>{title}</div>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-dim)' }}>{hint}</p>

      {items.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>Nothing here yet.</p>
      )}

      {items.map((item) => {
        const display = mode === 'trend'
          ? `${item.trend > 0 ? '+' : ''}${item.trend}pt`
          : `${item.frequency}%`;
        const width = Math.min(Math.abs(mode === 'trend' ? item.trend : item.frequency), 100);
        const impLabel = IMPORTANCE_LABEL[Math.round(item.avgImportance ?? 0)];

        return (
          <div className="skill-row" key={item.name}>
            <div className="skill-row-top">
              <span className="skill-name">
                {item.name}
                {impLabel && mode !== 'trend' && (
                  <span className={`imp-tag imp-${Math.round(item.avgImportance)}`}>{impLabel}</span>
                )}
              </span>
              <span className="skill-value">{display}</span>
            </div>
            <div className="skill-bar-track">
              <div className="skill-bar-fill" style={{ width: `${width}%`, background: tone }} />
            </div>
          </div>
        );
      })}
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
      // Gaps rank by weighted score, not raw frequency — a skill that's
      // hard-required in half your applications matters more than one
      // that's nice-to-have in most of them.
      gaps: [...list].filter((s) => !s.iHaveIt).sort((a, b) => weightedScore(b) - weightedScore(a)).slice(0, 6),
      strengths: [...list].filter((s) => s.iHaveIt).sort((a, b) => weightedScore(b) - weightedScore(a)).slice(0, 6),
      rising: [...list].filter((s) => s.trend > 0).sort((a, b) => b.trend - a.trend).slice(0, 5),
      fading: [...list].filter((s) => s.trend < 0).sort((a, b) => a.trend - b.trend).slice(0, 5),
    };
  }, [skills]);

  return (
    <Layout title="Skills gap">
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0, marginBottom: 20, maxWidth: 640 }}>
        Required skills across your applications, weighted by how hard a requirement each one
        was, compared against your own claimed skills. Trend compares recent applications
        against older ones — with only a handful logged, read it as a rough signal.
      </p>

      {skills === null && <p style={{ color: 'var(--text-dim)' }}>Loading…</p>}

      {skills !== null && skills.length === 0 && (
        <div className="panel">
          <p style={{ margin: 0, color: 'var(--text-dim)' }}>
            No data yet — tag required skills on an application, or add your own skills
            under Skills &amp; resume, to start building this out.
          </p>
        </div>
      )}

      {skills !== null && skills.length > 0 && (
        <div className="skill-grid">
          <RankedList
            title="Biggest gaps"
            hint="Weighted by requirement strength — the highest-leverage things to pick up next."
            items={gaps}
            tone="var(--accent)"
          />
          <RankedList
            title="Your strengths"
            hint="Skills you have that employers are actually asking for."
            items={strengths}
            tone="var(--s-interview)"
          />
          <RankedList
            title="Rising"
            hint="Appearing more in your recent applications than your older ones."
            items={rising}
            tone="var(--s-offered)"
            mode="trend"
          />
          <RankedList
            title="Fading"
            hint="Showing up less than it used to. Could mean less relevant — or so standard it stopped being listed."
            items={fading}
            tone="var(--s-closed)"
            mode="trend"
          />
        </div>
      )}
    </Layout>
  );
}
