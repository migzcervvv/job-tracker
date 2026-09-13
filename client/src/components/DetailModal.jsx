import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { STATUS, STATUS_META, statusMeta } from '../api/statusMeta.js';
import { getApplication, deleteApplication, getAutomationStatus } from '../api/applications.js';
import { getApplicationSkills, setApplicationSkills } from '../api/skills.js';
import { relativeTime } from '../api/dates.js';
import { eventLabel } from '../api/timelineMeta.js';
import { extractErrorMessage } from '../api/errors.js';
import { notify } from '../notify.js';
import { StageDetailForm } from './StageDetailForm.jsx';
import { TagEditor } from './TagEditor.jsx';

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function parseFields(fieldsJson) {
  try {
    return JSON.parse(fieldsJson);
  } catch {
    return {};
  }
}

export function DetailModal({ application, onClose, onStatusChange, onDeleted }) {
  const [timeline, setTimeline] = useState(null);
  const [stageDetails, setStageDetails] = useState(null);
  const [requiredSkills, setRequiredSkills] = useState(null);
  const [automationStatus, setAutomationStatus] = useState(null);
  const skillsRefetchedRef = useRef(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!application) {
      setTimeline(null);
      setStageDetails(null);
      setRequiredSkills(null);
      setConfirmingDelete(false);
      return;
    }
    let cancelled = false;
    setTimeline(null);
    setStageDetails(null);
    setRequiredSkills(null);
    setConfirmingDelete(false);
    getApplication(application.id)
      .then((data) => {
        if (cancelled) return;
        setTimeline(data.timeline);
        setStageDetails(data.stageDetails);
      })
      .catch((err) => {
        if (cancelled) return;
        notify.error('Could not load history', extractErrorMessage(err));
      });
    getApplicationSkills(application.id)
      .then((names) => { if (!cancelled) setRequiredSkills(names); })
      .catch((err) => {
        if (cancelled) return;
        notify.error('Could not load required skills', extractErrorMessage(err));
      });
    return () => { cancelled = true; };
  }, [application?.id, application?.status]);

  // Skill extraction runs asynchronously in n8n, typically a few seconds
  // behind the create request itself. Poll until it resolves so the user
  // sees "extracting…" rather than an empty tag editor with no explanation.
  useEffect(() => {
    if (!application) {
      setAutomationStatus(null);
      return;
    }
    let cancelled = false;
    let intervalId = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 10; // ~30s at 3s apart — long enough for a slow free-tier LLM call, not so long it polls forever on a genuinely lost webhook
    skillsRefetchedRef.current = false;

    function poll() {
      getAutomationStatus(application.id)
        .then((data) => {
          if (cancelled) return;
          setAutomationStatus(data);
          attempts += 1;

          if (data.status === 'succeeded' && !skillsRefetchedRef.current) {
            skillsRefetchedRef.current = true;
            getApplicationSkills(application.id)
              .then((names) => { if (!cancelled) setRequiredSkills(names); })
              .catch(() => {}); // non-critical — tags just won't refresh until modal reopens
          }

          if (data.status !== 'triggered' || attempts >= MAX_ATTEMPTS) {
            if (intervalId) clearInterval(intervalId);
          }
        })
        .catch(() => {
          if (!cancelled && intervalId) clearInterval(intervalId);
        });
    }

    poll();
    intervalId = setInterval(poll, 3000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [application?.id]);

  const currentStage = application?.status;
  const isInterview = currentStage === STATUS.InterviewScheduled;

  // Non-interview stages: one record per stage. Interview: every round, most recent first.
  const stageRecords = (stageDetails ?? []).filter((s) => s.stage === currentStage);
  const latestRecord = stageRecords[0];
  const priorRounds = isInterview ? stageRecords : [];

  function handleStageSaved(saved) {
    setStageDetails((prev) => {
      const existing = prev ?? [];
      const withoutThis = existing.filter((s) => s.id !== saved.id);
      return [saved, ...withoutThis];
    });
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteApplication(application.id);
      notify.success('Application deleted');
      onDeleted(application.id);
      onClose();
    } catch (err) {
      notify.error('Could not delete', extractErrorMessage(err));
      setDeleting(false);
      setConfirmingDelete(false);
    }
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
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2>{application.title}</h2>
                <div className="sub">{application.company || 'No company set'}</div>
              </div>
              <button className="modal-close" onClick={onClose} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="modal-danger-row">
              {confirmingDelete ? (
                <>
                  <span className="modal-danger-prompt">Delete this application permanently?</span>
                  <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Confirm delete'}
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button className="icon-btn-danger" onClick={() => setConfirmingDelete(true)}>
                  Delete application
                </button>
              )}
            </div>

            <div className="modal-body">
              <div className="meta-row">
                <div className="meta-item">
                  <div className="k">Status</div>
                  <div className="v">
                    <select
                      value={application.status}
                      onChange={(e) => onStatusChange(application.id, Number(e.target.value))}
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
                      <a href={application.jobUrl} target="_blank" rel="noreferrer">
                        Open link
                      </a>
                    </div>
                  </div>
                )}
              </div>

              <div className="section-label">Job description</div>
              <div className="jd-block" style={{ marginBottom: 20 }}>
                {application.rawDescription || 'No description saved.'}
              </div>

              <div style={{ marginBottom: 20 }}>
                <div className="section-label">Required skills</div>
                <AutomationStatusBanner automationStatus={automationStatus} />
                {requiredSkills === null ? (
                  <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</p>
                ) : (
                  <TagEditor
                    key={application.id}
                    initialSkills={requiredSkills}
                    onSave={(names) => setApplicationSkills(application.id, names)}
                    saveLabel="Save required skills"
                  />
                )}
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
                              Round {f.round || '—'}
                            </span>
                            <span className="timeline-body">
                              {f.scheduledAt || 'No time set'}
                            </span>
                            <span className="timeline-time">{relativeTime(r.createdAt)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <StageDetailForm
                    key={`${currentStage}-${latestRecord?.id ?? 'new'}`}
                    applicationId={application.id}
                    stage={currentStage}
                    initialFields={isInterview ? {} : parseFields(latestRecord?.fieldsJson ?? '{}')}
                    onSaved={handleStageSaved}
                  />
                </div>
              )}

              <div className="section-label">History</div>
              {timeline === null && (
                <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</p>
              )}
              {timeline !== null && timeline.length === 0 && (
                <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No events yet.</p>
              )}
              {timeline !== null && timeline.length > 0 && (
                <ul className="timeline-list">
                  {timeline.map((event) => (
                    <li key={event.id} className="timeline-item">
                      <span className="timeline-label">{eventLabel(event.type)}</span>
                      {event.body && <span className="timeline-body">{event.body}</span>}
                      <span className="timeline-time">{relativeTime(event.createdAt)}</span>
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

function AutomationStatusBanner({ automationStatus }) {
  if (!automationStatus || !automationStatus.status) return null;

  if (automationStatus.status === 'triggered') {
    return (
      <div className="automation-banner automation-banner-pending">
        <span className="automation-spinner" />
        Extracting skills from the job description…
      </div>
    );
  }

  if (automationStatus.status === 'failed') {
    return (
      <div className="automation-banner automation-banner-failed">
        Automatic skill extraction failed{automationStatus.message ? `: ${automationStatus.message}` : '.'}
        {' '}Add skills manually below.
      </div>
    );
  }

  return null; // succeeded — the tags speak for themselves, no banner needed
}
