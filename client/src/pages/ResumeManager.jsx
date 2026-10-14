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
  const { invalidate } = useApplications();
  const [resumes, setResumes] = useState([]);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const load = useCallback(async (signal) => {
    const rows = await listResumes(signal);
    if (signal?.aborted) return;
    setResumes(rows);
    setLoaded(true);
    setLoadError("");
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => {
        if (!controller.signal.aborted) return load(controller.signal);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(extractErrorMessage(err));
      });
    return () => controller.abort();
  }, [load, revision]);
  const pending = resumes.some(
    (resume) =>
      resume.id !== review?.id &&
      ["queued", "dispatching", "dispatched", "running"].includes(
        resume.extractionStatus,
      ),
  );
  useEffect(() => {
    if (!pending || loadError) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void load(controller.signal).catch((err) => {
        if (!controller.signal.aborted) setLoadError(extractErrorMessage(err));
      });
    }, 10000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [pending, resumes, load, loadError]);
  async function mutate(action) {
    setBusy(true);
    try {
      await action();
      invalidate();
      await load();
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
      {loadError && (
        <div role="alert">
          <p>{loadError}</p>
          <button
            onClick={() => {
              setRevision((value) => value + 1);
            }}
          >
            Retry resumes
          </button>
        </div>
      )}
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
        onSkillsConfirmed={invalidate}
      />
    </Layout>
  );
}
