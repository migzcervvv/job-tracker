import { useCallback, useEffect, useState } from "react";
import { Layout } from "../components/Layout.jsx";
import { ResumeUpload } from "../components/ResumeUpload.jsx";
import { ResumeExtractionModal } from "../components/ResumeExtractionModal.jsx";
import {
  listResumes,
  getResumeDownloadUrl,
  deleteResume,
  retryResumeExtraction,
  activateResume,
} from "../api/resumes.js";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";
import { useApplications } from "../state/ApplicationsContext.jsx";
import { progressLabel } from "../api/progress.js";
import { Icon } from "../components/Icon.jsx";
export function ResumeManager() {
  const { refresh } = useApplications();
  const [resumes, setResumes] = useState([]);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const load = useCallback(async () => setResumes(await listResumes()), []);
  useEffect(() => {
    let cancelled = false;
    let timer;
    async function check() {
      try {
        const rows = await listResumes();
        if (!cancelled) {
          setResumes(rows);
          setLoaded(true);
          setLoadError("");
        }
      } catch (err) {
        if (!cancelled) setLoadError(extractErrorMessage(err));
      }
      if (!cancelled) timer = setTimeout(check, 10000);
    }
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  async function mutate(action) {
    setBusy(true);
    try {
      await action();
      await load();
      await refresh();
    } catch (err) {
      notify.error("Couldn’t update your resume", extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function download(resume) {
    try {
      const url = await getResumeDownloadUrl(resume.id);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      anchor.download = resume.fileName;
      anchor.click();
      if (url.startsWith("blob:"))
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      notify.error("Could not open resume", extractErrorMessage(err));
    }
  }
  return (
    <Layout title="Resumes">
      <p>
        Choose a default resume for skill matching. You can attach a different
        version to each application.
      </p>
      <ResumeUpload
        onUploaded={(resume) => {
          setResumes((prev) => [resume, ...prev]);
          setReview(resume);
        }}
      />
      {loadError && <p role="alert">{loadError}</p>}
      {!loaded && !loadError && <p role="status">Loading your resumes…</p>}
      {loaded && !resumes.length && (
        <div className="panel empty-state">
          <Icon name="resume" size={30} />
          <h2>Your resumes, all together</h2>
          <p>
            Upload your first resume above. You’ll be able to review suggested
            skills before adding them to your profile.
          </p>
        </div>
      )}
      <div className="resume-list">
        {resumes.map((resume) => (
          <div className="resume-row" key={resume.id}>
            <Icon name="resume" size={25} />
            <div className="resume-info">
              <span className="name">{resume.fileName}</span>
              <small>
                {progressLabel(resume.extractionStatus)}
                {resume.isActive ? " · Default resume" : ""}
              </small>
            </div>
            <div className="row-actions">
              <button disabled={busy} onClick={() => setReview(resume)}>
                Review skills
              </button>
              <button disabled={busy} onClick={() => void download(resume)}>
                Open
              </button>
              <button
                disabled={
                  busy ||
                  resume.isActive ||
                  resume.extractionStatus !== "succeeded"
                }
                onClick={() => void mutate(() => activateResume(resume.id))}
              >
                {resume.isActive ? "Default resume" : "Make default"}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void mutate(async () => {
                    const run = await retryResumeExtraction(resume.id);
                    setReview({ ...resume, runId: run.runId });
                  })
                }
              >
                Find skills again
              </button>
              <button
                disabled={busy}
                onClick={() => void mutate(() => deleteResume(resume.id))}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      <ResumeExtractionModal
        resume={review}
        onClose={() => {
          setReview(null);
          void load().catch(() => {});
        }}
        onSkillsConfirmed={() => void refresh().catch(() => {})}
      />
    </Layout>
  );
}
