import { useEffect, useState } from "react";
import {
  getResumeAutomationStatus,
  getProposedSkills,
  confirmResumeSkills,
  dismissProposedSkills,
} from "../api/resumes.js";
import { pollRun } from "../api/polling.js";
import { extractErrorMessage } from "../api/errors.js";
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
        setMessage(state.message ?? "");
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
        setMessage(err.message);
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
    <section className="panel" aria-label="Resume extraction review">
      <h3>
        {resume.fileName}: {status}
      </h3>
      <p role="status">{message}</p>
      <p>
        The file remains saved while processing. Skills require confirmation;
        active resume selection is separate.
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
              {skill.alreadyClaimed ? " (already claimed)" : ""}
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
              Dismiss proposals
            </button>
            <button
              className="btn-save"
              disabled={busy || !selected.size}
              onClick={() => void save(false)}
            >
              Confirm {selected.size} skills
            </button>
          </>
        )}
      </div>
    </section>
  );
}
