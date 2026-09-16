import { useEffect, useState } from "react";
import { Layout } from "../components/Layout.jsx";
import { SkillListEditor } from "../components/SkillListEditor.jsx";
import { getMySkills, setMySkills } from "../api/skills.js";
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

  return (
    <Layout title="My skills">
      <p
        style={{
          color: "var(--text-dim)",
          fontSize: 13,
          marginTop: 0,
          marginBottom: 16,
        }}
      >
        Feeds the Skills Gap view and the fit score on every application. Skills
        picked up from a resume land here too, once you confirm them on the
        Resume page.
      </p>
      {skills === null ? (
        <p style={{ color: "var(--text-dim)" }}>Loading…</p>
      ) : (
        <SkillListEditor
          key={(skills ?? []).join("|")}
          initialSkills={skills}
          onSave={setMySkills}
          saveLabel="Save skills"
        />
      )}
    </Layout>
  );
}
