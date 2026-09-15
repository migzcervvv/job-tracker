import { useEffect, useRef, useState } from "react";
import { uploadResume, getResumeAutomationStatus } from "../api/resumes.js";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";

const ACCEPTED = ".pdf,.doc,.docx";
const POLL_INTERVAL_MS = 3000;
// Resume parsing + LLM extraction runs longer than the JD flow (bigger
// document, sometimes a slower free-tier model) — give it ~60s before
// giving up on polling.
const MAX_ATTEMPTS = 20;

export function ResumeUpload({ onUploaded, onSkillsExtracted }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [automationStatus, setAutomationStatus] = useState(null);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  function pollExtraction(resumeId) {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    let attempts = 0;
    let skillsRefetched = false;

    function poll() {
      getResumeAutomationStatus(resumeId)
        .then((data) => {
          setAutomationStatus(data);
          attempts += 1;

          if (data.status === "succeeded" && !skillsRefetched) {
            skillsRefetched = true;
            onSkillsExtracted?.();
            notify.success("Skills added from your resume");
          }

          if (data.status === "failed") {
            notify.error(
              "Skill extraction failed",
              data.message || "You can still add skills manually above.",
            );
          }

          if (data.status !== "triggered" || attempts >= MAX_ATTEMPTS) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        })
        .catch(() => {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        });
    }

    poll();
    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
  }

  async function handleFile(file) {
    if (!file) return;
    setAutomationStatus(null);
    try {
      const resume = await notify.promise(uploadResume(file), {
        loading: "Uploading resume…",
        success: "Resume uploaded — extracting skills…",
        error: (err) => extractErrorMessage(err, "Could not upload this file"),
      });
      // Refetch from the list endpoint rather than trusting this response's
      // shape for every field (e.g. sizeBytes) — avoids stale/partial data.
      onUploaded();
      if (resume?.id) pollExtraction(resume.id);
    } catch {
      // toast already shown
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <div
        className="upload-drop"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        style={
          dragOver
            ? { borderColor: "var(--accent)", color: "var(--text)" }
            : undefined
        }
      >
        <input
          ref={inputRef}
          id="resume-upload"
          type="file"
          accept={ACCEPTED}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        Drag a PDF or Word doc here, or{" "}
        <label htmlFor="resume-upload">browse</label>
      </div>
      <AutomationStatusBanner automationStatus={automationStatus} />
    </>
  );
}

function AutomationStatusBanner({ automationStatus }) {
  if (!automationStatus || !automationStatus.status) return null;

  if (automationStatus.status === "triggered") {
    return (
      <div className="automation-banner automation-banner-pending">
        <span className="automation-spinner" />
        Extracting skills from your resume…
      </div>
    );
  }

  if (automationStatus.status === "failed") {
    return (
      <div className="automation-banner automation-banner-failed">
        Automatic skill extraction failed
        {automationStatus.message ? `: ${automationStatus.message}` : "."} Add
        skills manually above.
      </div>
    );
  }

  return (
    <div className="automation-banner automation-banner-success">
      Skills extracted from your resume — check the list above.
    </div>
  );
}
