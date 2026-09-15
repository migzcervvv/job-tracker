import { useCallback, useEffect, useState } from "react";
import { Layout } from "../components/Layout.jsx";
import { TagEditor } from "../components/TagEditor.jsx";
import { ResumeUpload } from "../components/ResumeUpload.jsx";
import { ResumePreviewModal } from "../components/ResumePreviewModal.jsx";
import { SkillExtractionLog } from "../components/SkillExtractionLog.jsx";
import { getMySkills, setMySkills } from "../api/skills.js";
import {
  listResumes,
  getResumeDownloadUrl,
  deleteResume,
} from "../api/resumes.js";
import { extractErrorMessage } from "../api/errors.js";
import { formatBytes } from "../api/format.js";
import { relativeTime } from "../api/dates.js";
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
      <div className="section-label">My skills</div>
      <p
        style={{
          color: "var(--text-dim)",
          fontSize: 13,
          marginTop: 0,
          marginBottom: 12,
        }}
      >
        Add manually below. Skills extracted from an uploaded resume show up
        here to review and confirm once n8n finishes — no need to wait on this
        page for it.
      </p>
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

      <div className="section-label" style={{ marginTop: 28 }}>
        Resumes
      </div>
      <div style={{ marginBottom: 16 }}>
        <ResumeUpload onUploaded={refreshResumes} />
      </div>

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
              <span className="size">
                {formatBytes(r.sizeBytes)} · {relativeTime(r.createdAt)}
              </span>
              <div className="row-actions">
                <button onClick={() => setPreviewing(r)}>Preview</button>
                <button onClick={() => handleDownload(r.id)}>Download</button>
                <button onClick={() => handleDelete(r.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ResumePreviewModal
        resume={previewing}
        onClose={() => setPreviewing(null)}
      />
    </Layout>
  );
}
