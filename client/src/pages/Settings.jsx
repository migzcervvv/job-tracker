import { useCallback, useEffect, useState } from "react";
import { Layout } from "../components/Layout.jsx";
import { TagEditor } from "../components/TagEditor.jsx";
import { ResumeUpload } from "../components/ResumeUpload.jsx";
import { getMySkills, setMySkills } from "../api/skills.js";
import {
  listResumes,
  getResumeDownloadUrl,
  deleteResume,
} from "../api/resumes.js";
import { extractErrorMessage } from "../api/errors.js";
import { formatBytes } from "../api/format.js";
import { notify } from "../notify.js";

export function Settings() {
  const [skills, setSkills] = useState(null);
  const [resumes, setResumes] = useState(null);

  const refreshSkills = useCallback(() => {
    getMySkills()
      .then(setSkills)
      .catch((err) =>
        notify.error("Could not load skills", extractErrorMessage(err)),
      );
  }, []);

  const refreshResumes = useCallback(() => {
    listResumes()
      .then(setResumes)
      .catch((err) =>
        notify.error("Could not load resumes", extractErrorMessage(err)),
      );
  }, []);

  useEffect(() => {
    refreshSkills();
    refreshResumes();
  }, [refreshSkills, refreshResumes]);

  async function handleDownload(id) {
    try {
      const url = await getResumeDownloadUrl(id);
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
      <div className="section-label">My skills</div>
      <p
        style={{
          color: "var(--text-dim)",
          fontSize: 13,
          marginTop: 0,
          marginBottom: 12,
        }}
      >
        Feeds the Skills Gap chart — compared against skills tagged on your
        applications. Uploading a resume below adds to this list automatically
        once extraction finishes.
      </p>
      {skills === null ? (
        <p style={{ color: "var(--text-dim)" }}>Loading…</p>
      ) : (
        <TagEditor
          initialSkills={skills}
          onSave={setMySkills}
          saveLabel="Save skills"
        />
      )}

      <div className="section-label" style={{ marginTop: 28 }}>
        Resumes
      </div>
      <ResumeUpload
        onUploaded={refreshResumes}
        onSkillsExtracted={refreshSkills}
      />

      {resumes === null && <p style={{ color: "var(--text-dim)" }}>Loading…</p>}
      {resumes !== null && resumes.length === 0 && (
        <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
          No resumes uploaded yet.
        </p>
      )}
      {resumes !== null && resumes.length > 0 && (
        <div className="resume-list">
          {resumes.map((r) => (
            <div className="resume-row" key={r.id}>
              <span className="name">{r.fileName}</span>
              <span className="size">{formatBytes(r.sizeBytes)}</span>
              <div className="row-actions">
                <button onClick={() => handleDownload(r.id)}>Open</button>
                <button onClick={() => handleDelete(r.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
