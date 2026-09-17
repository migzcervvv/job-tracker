import { useEffect, useMemo, useState } from "react";
import { Layout } from "../components/Layout.jsx";
import { SkillLevelEditor } from "../components/SkillLevelEditor.jsx";
import { getMySkills, setMySkills, setSkillLevel } from "../api/skills.js";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";

export function MySkills() {
  const [skills, setSkills] = useState(null);

  useEffect(() => {
    loadSkills();
  }, []);

  function loadSkills() {
    getMySkills()
      .then(setSkills)
      .catch((err) =>
        notify.error("Could not load skills", extractErrorMessage(err)),
      );
  }

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
  async function handleAdd(name) {
    const names = [...(skills ?? []).map((s) => s.name), name];
    const updated = await setMySkills(names);
    setSkills(updated);
  }

  async function handleRemove(name) {
    const names = (skills ?? [])
      .filter((s) => s.name !== name)
      .map((s) => s.name);
    const updated = await setMySkills(names);
    setSkills(updated);
  }

  async function handleLevelChange(name, level) {
    const updated = await setSkillLevel(name, level);
    setSkills((prev) =>
      (prev ?? []).map((s) => (s.name === updated.name ? updated : s)),
    );
  }

  return (
    <Layout title="My skills">
      <p className="skills-page-hint">
        Feeds the Skills Gap view and the fit score on every application. Rate
        each skill honestly — both read off these levels, not just whether a
        skill is listed. Skills picked up from a resume land here too, once you
        confirm them on the Resume page.
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
