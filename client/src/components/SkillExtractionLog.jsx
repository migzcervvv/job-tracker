import { useEffect, useRef, useState } from "react";
import {
  getProposedSkills,
  confirmResumeSkills,
  dismissResumeSkills,
} from "../api/resumes.js";
import { relativeTime } from "../api/dates.js";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";

const POLL_INTERVAL_MS = 4000;

const STATUS_META = {
  triggered: { color: "var(--s-pending)", label: "Extracting…" },
  succeeded: { color: "var(--s-interview)", label: "Extracted" },
  failed: { color: "#e07a6f", label: "Failed" },
};

// Non-blocking: this never covers the page. It's a list the user can
// ignore, come back to, or act on whenever — that's the whole point.
// While anything is still "triggered", it polls the resume list quietly
// in the background so statuses update without a reload.
export function SkillExtractionLog({ resumes, onRefresh, onSkillsAdded }) {
  const pollRef = useRef(null);
  const hasPending = (resumes ?? []).some(
    (r) => r.extractionStatus === "triggered",
  );

  useEffect(() => {
    if (!hasPending) return undefined;
    pollRef.current = setInterval(() => onRefresh?.(), POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [hasPending, onRefresh]);

  const entries = (resumes ?? []).filter((r) => r.extractionStatus);

  if (entries.length === 0) return null;

  return (
    <div className="extraction-log" style={{ marginTop: 4 }}>
      {entries.map((r) => (
        <ExtractionLogRow
          key={r.id}
          resume={r}
          onSkillsAdded={onSkillsAdded}
          onReviewed={onRefresh}
        />
      ))}
    </div>
  );
}

function ExtractionLogRow({ resume, onSkillsAdded, onReviewed }) {
  const [reviewing, setReviewing] = useState(false);
  const [proposed, setProposed] = useState(null);
  const [checked, setChecked] = useState({});
  const [busy, setBusy] = useState(false);

  const meta = STATUS_META[resume.extractionStatus] ?? {
    color: "var(--text-dim)",
    label: resume.extractionStatus,
  };
  const needsReview =
    resume.extractionStatus === "succeeded" && resume.proposedSkillCount > 0;

  function openReview() {
    setReviewing(true);
    getProposedSkills(resume.id)
      .then((data) => {
        const proposedSkills = data.proposedSkills ?? [];
        setProposed(proposedSkills);
        setChecked(
          Object.fromEntries(
            proposedSkills.map((s) => [s.name, !s.alreadyClaimed]),
          ),
        );
      })
      .catch((err) => {
        notify.error("Could not load extracted skills", extractErrorMessage(err));
        setReviewing(false);
      });
  }

  function toggle(name) {
    setChecked((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  async function confirm() {
    const selected = (proposed ?? [])
      .map((s) => s.name)
      .filter((n) => checked[n]);
    setBusy(true);
    try {
      await confirmResumeSkills(resume.id, selected);
      notify.success(
        selected.length
          ? `Added ${selected.length} skill${selected.length === 1 ? "" : "s"} from ${resume.fileName}`
          : "Reviewed — nothing added",
      );
      onSkillsAdded?.();
      onReviewed?.();
      setReviewing(false);
    } catch (err) {
      notify.error("Could not save skills", extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    setBusy(true);
    try {
      await dismissResumeSkills(resume.id);
      onReviewed?.();
      setReviewing(false);
    } catch (err) {
      notify.error("Could not dismiss", extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="extraction-log-row">
      <span
        className="log-time"
        title={new Date(resume.createdAt).toLocaleString()}
      >
        {relativeTime(resume.createdAt)}
      </span>
      <span
        className="log-badge"
        style={{ color: meta.color, borderColor: meta.color }}
      >
        {meta.label}
      </span>
      <span className="log-message" style={{ flex: 1 }}>
        {resume.fileName}
      </span>

      {needsReview && !reviewing && (
        <button className="icon-btn" onClick={openReview}>
          Review {resume.proposedSkillCount} skill
          {resume.proposedSkillCount === 1 ? "" : "s"}
        </button>
      )}

      {reviewing && proposed === null && (
        <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
          Loading…
        </span>
      )}

      {reviewing && proposed !== null && (
        <div className="skill-confirm-list" style={{ width: "100%", marginTop: 10 }}>
          {proposed.length === 0 ? (
            <p style={{ color: "var(--text-dim)", fontSize: 13, margin: 0 }}>
              No skills found in this resume.
            </p>
          ) : (
            proposed.map((s) => (
              <label className="skill-confirm-row" key={s.name}>
                <input
                  type="checkbox"
                  checked={Boolean(checked[s.name])}
                  onChange={() => toggle(s.name)}
                />
                {s.name}
                {s.alreadyClaimed && (
                  <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
                    &nbsp;(already have this)
                  </span>
                )}
              </label>
            ))
          )}
          <div className="resume-modal-actions" style={{ padding: "10px 0 0" }}>
            <button className="icon-btn" onClick={dismiss} disabled={busy}>
              Dismiss
            </button>
            <button
              className="btn-primary"
              style={{ width: "auto" }}
              onClick={confirm}
              disabled={busy}
            >
              {busy ? "Saving…" : "Add selected"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
