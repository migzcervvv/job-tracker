import { useCallback, useEffect, useState } from "react";
import { Layout } from "../components/Layout.jsx";
import { TagEditor } from "../components/TagEditor.jsx";
import { ResumeUpload } from "../components/ResumeUpload.jsx";
import { ResumeCard } from "../components/ResumeCard.jsx";
import { ResumePreviewModal } from "../components/ResumePreviewModal.jsx";
import { SkillExtractionLog } from "../components/SkillExtractionLog.jsx";
import { getMySkills, setMySkills } from "../api/skills.js";
import { listResumes, getResumeDownloadUrl, deleteResume } from "../api/resumes.js";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";

export function Settings() {
  const [skills, setSkills] = useState(null);
  // Bumped every time `skills` is replaced from the server so TagEditor
  // (which owns its own draft state internally) remounts with the fresh
  // list instead of going stale after a resume confirms new skills.
  const [skillsVersion, setSkillsVersion] = useState(0);
  const [resumes, setResumes] = useState(null);
  const [previewing, setPreviewing] = useState(null);

  const refreshSkills = useCallback(() => {
    return getMySkills()
      .then((data) => {
        setSkills(data);
        setSkillsVersion((v) => v + 1);
        return data;
      })
      .catch((err) => {
        notify.error("Could not load skills", extractErrorMessage(err));
        throw err;
      });
  }, []);

  const refreshResumes = useCallback(() => {
    return listResumes()
      .then(setResumes)
      .catch((err) =>
        notify.error("Could not load resumes", extractErrorMessage(err)),
      );
  }, []);

  useEffect(() => {
    refreshSkills().catch(() => {});
    refreshResumes();
  }, [refreshSkills, refreshResumes]);

  async function handleDownload(id) {
    try {
      const { url } = await getResumeDownloadUrl(id);
      window.open(url, "_blank", "noreferrer");
    } catch (err) {
      notify.error("Could not open resume", extractErrorMessage(err));
    }
  }

  async function handleDelete(id) {
    try {
      await deleteResume(id);
      setResumes((prev) => prev.filter((r) => r.id !== id));
      notify.success("Resume deleted");
    } catch (err) {
      notify.error("Could not delete resume", extractErrorMessage(err));
    }
  }

  return (
    <Layout title="Resume & skills">
      <section className="page-section" id="resumes">
        <div className="page-section-head">
          <div>
            <h2>Resumes</h2>
            <p className="page-section-sub">
              Upload a resume and skills extract in the background — no need
              to wait here for it.
            </p>
          </div>
          <span className="page-count">{resumes?.length ?? 0}</span>
        </div>

        {resumes === null ? (
          <p style={{ color: "var(--text-dim)" }}>Loading…</p>
        ) : (
          <div className="resume-rack">
            <ResumeUpload onUploaded={refreshResumes} />
            {resumes.map((r) => (
              <ResumeCard
                key={r.id}
                resume={r}
                onPreview={setPreviewing}
                onDownload={handleDownload}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </section>

      <section className="page-section" id="skills">
        <div className="page-section-head">
          <div>
            <h2>My skills</h2>
            <p className="page-section-sub">
              Add manually, or confirm what was found in a resume below.
            </p>
          </div>
          <span className="page-count">{skills?.length ?? 0}</span>
        </div>

        {skills === null ? (
          <p style={{ color: "var(--text-dim)" }}>Loading…</p>
        ) : (
          <TagEditor
            key={skillsVersion}
            initialSkills={skills}
            onSave={setMySkills}
            saveLabel="Save skills"
          />
        )}

        <SkillExtractionLog
          resumes={resumes}
          onRefresh={refreshResumes}
          onSkillsAdded={refreshSkills}
        />
      </section>

      <ResumePreviewModal
        resume={previewing}
        onClose={() => setPreviewing(null)}
      />
    </Layout>
  );
}
