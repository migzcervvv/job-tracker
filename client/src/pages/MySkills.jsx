import { useEffect, useMemo, useState } from "react";
import { Layout } from "../components/Layout.jsx";
import { SkillLevelEditor } from "../components/SkillLevelEditor.jsx";
import {
  getMySkills,
  addMySkill,
  removeMySkill,
  setSkillLevel,
} from "../api/skills.js";
import { extractErrorMessage } from "../api/errors.js";
import { useApplications } from "../state/ApplicationsContext.jsx";

export function MySkills() {
  const { invalidate } = useApplications();
  const [skills, setSkills] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getMySkills()
      .then((data) => {
        if (!cancelled) {
          setSkills(data);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(extractErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const list = skills ?? [];
    return {
      total: list.length,
      advancedPlus: list.filter((s) => s.level >= 3).length,
      unrated: list.filter((s) => s.level === 0).length,
    };
  }, [skills]);

  // Recompute scores when the board is next opened.
  function refreshFitScores() {
    invalidate();
  }

  async function handleAdd(name) {
    const updated = await addMySkill(name);
    const added = updated.find((s) => s.name === name.trim().toLowerCase());
    if (added)
      setSkills((previous) => [
        ...(previous ?? []).filter((s) => s.name !== added.name),
        added,
      ]);
    refreshFitScores();
  }

  async function handleRemove(name) {
    await removeMySkill(name);
    setSkills((previous) => (previous ?? []).filter((s) => s.name !== name));
    refreshFitScores();
  }

  async function handleLevelChange(name, level) {
    const updated = await setSkillLevel(name, level);
    setSkills((prev) =>
      (prev ?? []).map((s) =>
        s.name === updated.name ? { ...s, ...updated } : s,
      ),
    );
  }

  return (
    <Layout title="My skills">
      <p className="skills-page-hint">
        Add the skills you bring to a role, or review suggestions from a resume.
        These skills help you compare opportunities. Your proficiency ratings
        are personal notes and do not change match scores. Changes save
        automatically.
      </p>

      {skills !== null && skills.length > 0 && (
        <div className="stat-strip">
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total skills</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.advancedPlus}</div>
            <div className="stat-label">Advanced or expert</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.unrated}</div>
            <div className="stat-label">Not yet rated</div>
          </div>
        </div>
      )}

      <div className="panel">
        {error ? (
          <p className="notice-error" role="alert">
            {error}
          </p>
        ) : skills === null ? (
          <p style={{ color: "var(--text-dim)", margin: 0 }}>Loading…</p>
        ) : (
          <SkillLevelEditor
            skills={skills}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onLevelChange={handleLevelChange}
          />
        )}
      </div>
    </Layout>
  );
}
