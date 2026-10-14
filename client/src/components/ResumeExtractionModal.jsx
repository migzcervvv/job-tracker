import { useEffect, useRef, useState } from "react";
import {
  getResumeAutomationStatus,
  getProposedSkills,
  confirmResumeSkills,
  dismissProposedSkills,
} from "../api/resumes.js";
import { pollRun } from "../api/polling.js";
import { extractErrorMessage } from "../api/errors.js";
import { progressLabel, progressMessage } from "../api/progress.js";
export function ResumeExtractionModal({ resume, onClose, onSkillsConfirmed }) {
  return resume ? (
    <Review
      key={resume.id + ":" + resume.runId}
      resume={resume}
      onClose={onClose}
      onSkillsConfirmed={onSkillsConfirmed}
    />
  ) : null;
}
function Review({ resume, onClose, onSkillsConfirmed }) {
  const heading = useRef(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const [status, setStatus] = useState("pending");
  const [proposed, setProposed] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const stop = pollRun({
      signal: controller.signal,
      fetchStatus: (signal) =>
        getResumeAutomationStatus(resume.id, resume.runId, signal),
      onStatus: (state) => {
        setStatus(state.status ?? "pending");
        setMessage("");
        if (state.status === "succeeded")
          void getProposedSkills(resume.id)
            .then((data) => {
              if (controller.signal.aborted) return;
              setProposed(data.proposedSkills);
              setSelected(
                new Set(
                  data.proposedSkills
                    .filter((s) => !s.alreadyClaimed)
                    .map((s) => s.name),
                ),
              );
            })
            .catch((err) => {
              if (!controller.signal.aborted)
                setMessage(extractErrorMessage(err));
            });
      },
      onError: (err) => {
        setStatus("unknown");
        setMessage(
          extractErrorMessage(
            err,
            "We can’t check progress right now. Close this review and try again in a moment.",
          ),
        );
      },
    });
    return () => {
      controller.abort();
      stop();
    };
  }, [resume.id, resume.runId]);
  async function save(dismiss) {
    setBusy(true);
    try {
      if (dismiss) await dismissProposedSkills(resume.id, resume.runId);
      else {
        await confirmResumeSkills(resume.id, [...selected], resume.runId);
        onSkillsConfirmed?.();
      }
      onClose();
    } catch (err) {
      setMessage(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel review-panel"
      aria-label="Resume extraction review"
    >
      <h3 ref={heading} tabIndex={-1}>
        Review skills from {resume.fileName}
      </h3>
      <span className="status-pill">{progressLabel(status)}</span>
      <p
        className={message ? "notice-error" : "notice-info"}
        role={message ? "alert" : "status"}
        style={{ marginTop: 16 }}
      >
        {message || progressMessage({ status }, "resume")}
      </p>
      <p>
        Choose the skills you want to add to My skills. Your resume stays saved,
        and you can close this review at any time.
      </p>
      <ul className="proposal-list">
        {proposed.map((skill) => (
          <li key={skill.name}>
            <label>
              <input
                type="checkbox"
                checked={selected.has(skill.name)}
                onChange={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(skill.name)) next.delete(skill.name);
                    else next.add(skill.name);
                    return next;
                  })
                }
              />
              {skill.name}
              {skill.alreadyClaimed ? " (already in My skills)" : ""}
            </label>
            <p>{skill.evidence}</p>
          </li>
        ))}
      </ul>
      <div className="stage-form-actions">
        <button className="icon-btn" onClick={onClose}>
          Close review
        </button>
        {status === "succeeded" && (
          <>
            <button
              className="icon-btn"
              disabled={busy}
              onClick={() => void save(true)}
            >
              Skip suggestions
            </button>
            <button
              className="btn-save"
              disabled={busy || !selected.size}
              onClick={() => void save(false)}
            >
              {busy
                ? "Saving skills…"
                : `Add ${selected.size} ${selected.size === 1 ? "skill" : "skills"}`}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
