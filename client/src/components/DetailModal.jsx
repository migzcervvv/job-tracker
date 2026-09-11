import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { STATUS, STATUS_META, statusMeta } from "../api/statusMeta.js";
import { getApplication } from "../api/applications.js";
import { relativeTime } from "../api/dates.js";
import { eventLabel } from "../api/timelineMeta.js";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";
import { StageDetailForm } from "./StageDetailForm.jsx";

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function parseFields(fieldsJson) {
  try {
    return JSON.parse(fieldsJson);
  } catch {
    return {};
  }
}

export function DetailModal({ application, onClose, onStatusChange }) {
  const [timeline, setTimeline] = useState(null);
  const [stageDetails, setStageDetails] = useState(null);

  useEffect(() => {
    if (!application) {
      setTimeline(null);
      setStageDetails(null);
      return;
    }
    let cancelled = false;
    setTimeline(null);
    setStageDetails(null);
    getApplication(application.id)
      .then((data) => {
        if (cancelled) return;
        setTimeline(data.timeline);
        setStageDetails(data.stageDetails);
      })
      .catch((err) => {
        if (cancelled) return;
        notify.error("Could not load history", extractErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [application?.id, application?.status]);

  const currentStage = application?.status;
  const isInterview = currentStage === STATUS.InterviewScheduled;

  // Non-interview stages: one record per stage. Interview: every round, most recent first.
  const stageRecords = (stageDetails ?? []).filter(
    (s) => s.stage === currentStage,
  );
  const latestRecord = stageRecords[0];
  const priorRounds = isInterview ? stageRecords : [];

  function handleStageSaved(saved) {
    setStageDetails((prev) => {
      const existing = prev ?? [];
      const withoutThis = existing.filter((s) => s.id !== saved.id);
      return [saved, ...withoutThis];
    });
  }

  return (
    <AnimatePresence>
      {application && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            className="modal-panel"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2>{application.title}</h2>
                <div className="sub">
                  {application.company || "No company set"}
                </div>
              </div>
              <button
                className="modal-close"
                onClick={onClose}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="meta-row">
                <div className="meta-item">
                  <div className="k">Status</div>
                  <div className="v">
                    <select
                      value={application.status}
                      onChange={(e) =>
                        onStatusChange(application.id, Number(e.target.value))
                      }
                    >
                      {STATUS_META.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="meta-item">
                  <div className="k">Applied</div>
                  <div className="v">{formatDate(application.appliedDate)}</div>
                </div>
                {application.jobUrl && (
                  <div className="meta-item">
                    <div className="k">Posting</div>
                    <div className="v">
                      <a
                        href={application.jobUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open link
                      </a>
                    </div>
                  </div>
                )}
              </div>

              <div className="section-label">Job description</div>
              <div className="jd-block" style={{ marginBottom: 20 }}>
                {application.rawDescription || "No description saved."}
              </div>

              {stageDetails !== null && (
                <div style={{ marginBottom: 20 }}>
                  <div className="section-label">
                    {statusMeta(currentStage).label} details
                  </div>

                  {priorRounds.length > 0 && (
                    <ul className="timeline-list" style={{ marginBottom: 10 }}>
                      {priorRounds.map((r) => {
                        const f = parseFields(r.fieldsJson);
                        return (
                          <li key={r.id} className="timeline-item">
                            <span className="timeline-label">
                              Round {f.round || "—"}
                            </span>
                            <span className="timeline-body">
                              {f.scheduledAt || "No time set"}
                            </span>
                            <span className="timeline-time">
                              {relativeTime(r.createdAt)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <StageDetailForm
                    key={`${currentStage}-${latestRecord?.id ?? "new"}`}
                    applicationId={application.id}
                    stage={currentStage}
                    initialFields={
                      isInterview
                        ? {}
                        : parseFields(latestRecord?.fieldsJson ?? "{}")
                    }
                    onSaved={handleStageSaved}
                  />
                </div>
              )}

              <div className="section-label">History</div>
              {timeline === null && (
                <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
                  Loading…
                </p>
              )}
              {timeline !== null && timeline.length === 0 && (
                <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
                  No events yet.
                </p>
              )}
              {timeline !== null && timeline.length > 0 && (
                <ul className="timeline-list">
                  {timeline.map((event) => (
                    <li key={event.id} className="timeline-item">
                      <span className="timeline-label">
                        {eventLabel(event.type)}
                      </span>
                      {event.body && (
                        <span className="timeline-body">{event.body}</span>
                      )}
                      <span className="timeline-time">
                        {relativeTime(event.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function StatusPill({ status }) {
  const meta = statusMeta(status);
  return (
    <span className="status-pill">
      <span className="tick" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}
