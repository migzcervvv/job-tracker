import { useEffect, useState } from "react";
import { Layout } from "../components/Layout.jsx";
import { ResumeUpload } from "../components/ResumeUpload.jsx";
import { ResumeExtractionModal } from "../components/ResumeExtractionModal.jsx";
import {
  listResumes,
  getResumeDownloadUrl,
  deleteResume,
  retryResumeExtraction,
} from "../api/resumes.js";
import { extractErrorMessage } from "../api/errors.js";
import { formatBytes } from "../api/format.js";
import { notify } from "../notify.js";

export function ResumeManager() {
  const [resumes, setResumes] = useState(null);
  const [extractingResume, setExtractingResume] = useState(null);
  const [retryingId, setRetryingId] = useState(null);

  useEffect(() => {
    loadResumes();
  }, []);

  function loadResumes() {
    listResumes()
      .then(setResumes)
      .catch((err) =>
        notify.error("Could not load resumes", extractErrorMessage(err)),
      );
  }

  function handleResumeUploaded(resume) {
    setResumes((prev) => [resume, ...(prev ?? [])]);
    setExtractingResume(resume);
  }

  function handleModalClosed() {
    setExtractingResume(null);
    loadResumes();
  }

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

  async function handleRetryExtraction(resume) {
    setRetryingId(resume.id);
    try {
      await retryResumeExtraction(resume.id);
      notify.info("Retrying extraction…", "This can take a few seconds.");
      loadResumes();
      setExtractingResume({ ...resume, extractionStatus: "triggered" });
    } catch (err) {
      notify.error("Could not retry extraction", extractErrorMessage(err));
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <Layout title="Resume">
      <p
        style={{
          color: "var(--text-dim)",
          fontSize: 13,
          marginTop: 0,
          marginBottom: 16,
        }}
      >
        Uploading a resume reads skills out of it automatically. Nothing is
        added to your profile until you review and confirm it on the extraction
        screen — confirmed skills show up on the My Skills page.
      </p>
      <ResumeUpload onUploaded={handleResumeUploaded} />

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
              {r.extractionStatus === "failed" && (
                <buttonww
                  className="pending-chip"
                  onClick={() => handleRetryExtraction(r)}
                  disabled={retryingId === r.id}
                >
                  {retryingId === r.id ? "Retrying…" : "Retry extraction"}
                </buttonww>
              )}
              {r.extractionStatus === "triggered" && (
                <span className="size">Extracting…</span>
              )}
              {r.proposedSkillCount > 0 && (
                <button
                  className="pending-chip"
                  onClick={() => setExtractingResume(r)}
                >
                  {r.proposedSkillCount} to review
                </button>
              )}
              <span className="size">{formatBytes(r.sizeBytes)}</span>
              <div className="row-actions">
                <button onClick={() => handleDownload(r.id)}>Open</button>
                <button onClick={() => handleDelete(r.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ResumeExtractionModal
        resume={extractingResume}
        onClose={handleModalClosed}
      />
    </Layout>
  );
}
