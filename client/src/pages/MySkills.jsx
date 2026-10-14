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
import { notify } from "../notify.js";
import { useApplications } from "../state/ApplicationsContext.jsx";

export function MySkills() {
  const { refresh: refreshApplications } = useApplications();
  const [skills, setSkills] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMySkills()
      .then((data) => {
        if (!cancelled) setSkills(data);
      })
      .catch((err) =>
        notify.error("Could not load skills", extractErrorMessage(err)),
      );
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

  // These three handlers hit the API directly and return the server's
  // response — SkillLevelEditor updates its own row state from whatever
  // comes back, so there's no separate refetch after every keystroke.
  // Every one of them can shift the fit score on every application, so each
  // also refreshes the board in the background — otherwise it's stale until
  // the board happens to reload on its own.
  function refreshFitScores() {
    refreshApplications().catch(() => {});
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
        Claimed skills feed Skills Gap and weighted fit. Proficiency ratings are
        personal notes; they do not change either calculation. Resume skills are
        added only after confirmation. Evidence remains attached to each skill.
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
        {skills === null ? (
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
