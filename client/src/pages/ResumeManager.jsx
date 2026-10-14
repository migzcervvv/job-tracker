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
export function ResumeManager() {
  const { refresh } = useApplications();
  const [resumes, setResumes] = useState([]);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setResumes(await listResumes()), []);
  useEffect(() => {
    let cancelled = false;
    let timer;
    async function check() {
      try {
        const rows = await listResumes();
        if (!cancelled) setResumes(rows);
      } catch (err) {
        if (!cancelled)
          notify.error("Could not load resumes", extractErrorMessage(err));
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
      notify.error("Resume operation failed", extractErrorMessage(err));
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
    <Layout title="Resume">
      <p>
        Select an active resume after extraction. Each application can retain a
        different submitted file.
      </p>
      <ResumeUpload
        onUploaded={(resume) => {
          setResumes((prev) => [resume, ...prev]);
          setReview(resume);
        }}
      />
      <div className="resume-list">
        {resumes.map((resume) => (
          <div className="resume-row" key={resume.id}>
            <span className="name">{resume.fileName}</span>
            <span>
              {resume.extractionStatus ?? "Not extracted"}
              {resume.isActive ? " · Active" : ""}
            </span>
            <div className="row-actions">
              <button disabled={busy} onClick={() => setReview(resume)}>
                Review / status
              </button>
              <button disabled={busy} onClick={() => void download(resume)}>
                Open
              </button>
              <button
                disabled={busy || resume.extractionStatus !== "succeeded"}
                onClick={() => void mutate(() => activateResume(resume.id))}
              >
                Use as active
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
                Extract again
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
