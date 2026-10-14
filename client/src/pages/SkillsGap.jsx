import { useEffect, useMemo, useState } from "react";
import { Layout } from "../components/Layout.jsx";
import { getSkillsGap } from "../api/skills.js";
import { extractErrorMessage } from "../api/errors.js";

// Importance is 1-3 from the JD extraction (nice-to-have → required).
// Weighting by it means "required everywhere" outranks "mentioned often
// but always optional", which raw frequency alone can't distinguish.
const IMPORTANCE_LABEL = { 3: "required", 2: "preferred", 1: "nice to have" };

function weightedScore(item) {
  const imp = item.avgImportance ?? 2;
  return item.frequency * (imp / 2);
}

function RankedList({ title, hint, items, tone, mode }) {
  return (
    <div className="panel skill-panel">
      <div className="section-label" style={{ marginBottom: 4 }}>
        {title}
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--text-dim)" }}>
        {hint}
      </p>

      {items.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
          Nothing here yet.
        </p>
      )}

      {items.map((item) => {
        const display =
          mode === "trend"
            ? `${item.trend > 0 ? "+" : ""}${item.trend}pt`
            : `${item.frequency}%`;
        const width = Math.min(
          Math.abs(mode === "trend" ? item.trend : item.frequency),
          100,
        );
        const impLabel = IMPORTANCE_LABEL[Math.round(item.avgImportance ?? 0)];

        return (
          <div className="skill-row" key={item.name}>
            <div className="skill-row-top">
              <span className="skill-name">
                {item.name}
                {impLabel && mode !== "trend" && (
                  <span
                    className={`imp-tag imp-${Math.round(item.avgImportance)}`}
                  >
                    {impLabel}
                  </span>
                )}
              </span>
              <span className="skill-value">{display}</span>
            </div>
            <div className="skill-bar-track">
              <div
                className="skill-bar-fill"
                style={{ width: `${width}%`, background: tone }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SkillsGap() {
  const [skills, setSkills] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getSkillsGap()
      .then((data) => {
        setSkills(data.skills);
        setCoverage(data);
      })
      .catch((err) => setError(extractErrorMessage(err)));
  }, []);

  const { gaps, strengths, rising, fading } = useMemo(() => {
    const list = skills ?? [];
    return {
      // Gaps rank by weighted score, not raw frequency — a skill that's
      // hard-required in half your applications matters more than one
      // that's nice-to-have in most of them.
      gaps: [...list]
        .filter((s) => !s.iHaveIt)
        .sort((a, b) => weightedScore(b) - weightedScore(a))
        .slice(0, 6),
      strengths: [...list]
        .filter((s) => s.iHaveIt)
        .sort((a, b) => weightedScore(b) - weightedScore(a))
        .slice(0, 6),
      rising: [...list]
        .filter((s) => s.trend > 0)
        .sort((a, b) => b.trend - a.trend)
        .slice(0, 5),
      fading: [...list]
        .filter((s) => s.trend < 0)
        .sort((a, b) => a.trend - b.trend)
        .slice(0, 5),
    };
  }, [skills]);

  return (
    <Layout title="Skills insights">
      {coverage && (
        <p>
          {coverage.extractedApplications}/{coverage.totalApplications}{" "}
          applications have job skills recorded. Add descriptions to more
          applications for a fuller picture.
        </p>
      )}
      <p
        style={{
          color: "var(--text-dim)",
          fontSize: 13,
          marginTop: 0,
          marginBottom: 20,
          maxWidth: 640,
        }}
      >
        See the skills employers ask for most often, where you already match,
        and what you could learn next. Required skills carry more weight than
        optional ones.
      </p>

      {error && (
        <p className="notice-error" role="alert">
          {error}
        </p>
      )}
      {skills === null && !error && (
        <p role="status">Comparing skills across your applications…</p>
      )}

      {skills !== null && skills.length === 0 && (
        <div className="panel">
          <p style={{ margin: 0, color: "var(--text-dim)" }}>
            No skill comparisons yet. Add job skills to an application and add
            your experience in My skills to see your matches and learning
            opportunities.
          </p>
        </div>
      )}

      {skills !== null && skills.length > 0 && (
        <div className="skill-grid">
          <RankedList
            title="Biggest gaps"
            hint="Skills you haven’t added yet, ranked by how often employers require them."
            items={gaps}
            tone="var(--accent)"
          />
          <RankedList
            title="Your strengths"
            hint="Skills you have that employers are actually asking for."
            items={strengths}
            tone="var(--s-interview)"
          />
          {coverage?.trendsAvailable && (
            <RankedList
              title="Rising"
              hint="Appearing more in your recent applications than your older ones."
              items={rising}
              tone="var(--s-offered)"
              mode="trend"
            />
          )}
          {coverage?.trendsAvailable && (
            <RankedList
              title="Fading"
              hint="These skills appear less often in your newer job postings."
              items={fading}
              tone="var(--s-closed)"
              mode="trend"
            />
          )}
        </div>
      )}
    </Layout>
  );
}
