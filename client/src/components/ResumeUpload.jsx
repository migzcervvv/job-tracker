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

// phase: 'idle' | 'uploading' | 'extracting' | 'confirm' | 'failed' | 'timeout'
// While phase !== 'idle' a full-screen modal blocks the page — the user
// can't do anything else until they confirm/skip the extracted skills or
// close an error, per the "pause the site and wait" requirement.
export function ResumeUpload({ onUploaded, onConfirmSkills }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [skillNames, setSkillNames] = useState([]);
  const [checked, setChecked] = useState({});
  const [confirming, setConfirming] = useState(false);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  function stopPolling() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }

  function startPolling(resumeId) {
    stopPolling();
    let attempts = 0;

    function poll() {
      getResumeAutomationStatus(resumeId)
        .then((data) => {
          attempts += 1;

          if (data.status === "succeeded") {
            stopPolling();
            const names = data.skillNames ?? [];
            setSkillNames(names);
            setChecked(Object.fromEntries(names.map((n) => [n, true])));
            setPhase("confirm");
            return;
          }

          if (data.status === "failed") {
            stopPolling();
            setErrorMessage(data.message || "Extraction failed.");
            setPhase("failed");
            return;
          }

          if (attempts >= MAX_ATTEMPTS) {
            stopPolling();
            setPhase("timeout");
          }
        })
        .catch((err) => {
          stopPolling();
          setErrorMessage(
            extractErrorMessage(err, "Lost track of extraction status."),
          );
          setPhase("failed");
        });
    }

    poll();
    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
  }

  async function handleFile(file) {
    if (!file) return;
    setErrorMessage("");
    setPhase("uploading");
    try {
      const resume = await uploadResume(file);
      onUploaded?.();
      setPhase("extracting");
      startPolling(resume.id);
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, "Could not upload this file"));
      setPhase("failed");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function toggleSkill(name) {
    setChecked((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  async function handleConfirm() {
    const selected = skillNames.filter((n) => checked[n]);
    setConfirming(true);
    try {
      await onConfirmSkills?.(selected);
      close();
    } catch (err) {
      notify.error("Could not save skills", extractErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  }

  function close() {
    setPhase("idle");
    setSkillNames([]);
    setChecked({});
    setErrorMessage("");
  }

  const blocking = phase !== "idle";
  const selectedCount = skillNames.filter((n) => checked[n]).length;

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
        Drag a resume here to auto-extract skills, or{" "}
        <label htmlFor="resume-upload">browse</label>
      </div>

      {blocking && (
        <div className="modal-backdrop">
          <div className="modal-panel resume-modal-panel">
            {(phase === "uploading" || phase === "extracting") && (
              <>
                <div className="resume-modal-spinner" />
                <div className="resume-modal-title">
                  {phase === "uploading"
                    ? "Uploading resume…"
                    : "Extracting skills…"}
                </div>
                <div className="resume-modal-sub">
                  {phase === "uploading"
                    ? "Sending your file to the server."
                    : "n8n is reading your resume — this can take up to a minute."}
                </div>
              </>
            )}

            {phase === "confirm" && (
              <div className="resume-modal-content-left">
                <div className="resume-modal-title">
                  Skills found in your resume
                </div>
                <div className="resume-modal-sub" style={{ marginBottom: 4 }}>
                  Uncheck anything that doesn't belong, then confirm to add the
                  rest to My skills.
                </div>
                {skillNames.length === 0 ? (
                  <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
                    No skills were found in this resume.
                  </p>
                ) : (
                  <div className="skill-confirm-list">
                    {skillNames.map((name) => (
                      <label className="skill-confirm-row" key={name}>
                        <input
                          type="checkbox"
                          checked={Boolean(checked[name])}
                          onChange={() => toggleSkill(name)}
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                )}
                <div className="resume-modal-actions">
                  <button
                    className="icon-btn"
                    onClick={close}
                    disabled={confirming}
                  >
                    Skip
                  </button>
                  <button
                    className="btn-primary"
                    style={{ width: "auto" }}
                    onClick={handleConfirm}
                    disabled={confirming || selectedCount === 0}
                  >
                    {confirming
                      ? "Adding…"
                      : `Add ${selectedCount} skill${selectedCount === 1 ? "" : "s"}`}
                  </button>
                </div>
              </div>
            )}

            {phase === "failed" && (
              <div className="resume-modal-content-left">
                <div className="resume-modal-title">
                  Skill extraction failed
                </div>
                <div className="resume-modal-sub" style={{ marginBottom: 16 }}>
                  {errorMessage || "Something went wrong reading this resume."}{" "}
                  The resume itself was still saved — add skills manually if
                  needed.
                </div>
                <div className="resume-modal-actions">
                  <button
                    className="btn-primary"
                    style={{ width: "auto" }}
                    onClick={close}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {phase === "timeout" && (
              <div className="resume-modal-content-left">
                <div className="resume-modal-title">Still processing</div>
                <div className="resume-modal-sub" style={{ marginBottom: 16 }}>
                  Extraction is taking longer than expected. The resume was
                  saved — check back shortly, or add skills manually for now.
                </div>
                <div className="resume-modal-actions">
                  <button
                    className="btn-primary"
                    style={{ width: "auto" }}
                    onClick={close}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
