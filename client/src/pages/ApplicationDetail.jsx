import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Layout } from "../components/Layout.jsx";
import { StageAccordion } from "../components/StageAccordion.jsx";
import { TagEditor } from "../components/TagEditor.jsx";
import { STATUS, STATUS_META, statusMeta } from "../api/statusMeta.js";
import { STAGE_FIELDS } from "../api/stageFields.js";
import {
  getApplication,
  updateApplicationStatus,
  deleteApplication,
  getAutomationStatus,
  generateInterviewQuestions,
  retrySkillExtraction,
} from "../api/applications.js";
import { getApplicationSkills, setApplicationSkills } from "../api/skills.js";
import { relativeTime } from "../api/dates.js";
import { eventLabel } from "../api/timelineMeta.js";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";
import { useApplications } from "../state/ApplicationsContext.jsx";

const ACTIVE_ORDER = STATUS_META.filter((s) => !s.terminal).map((s) => s.value);

function rankOf(stageValue) {
  const idx = ACTIVE_ORDER.indexOf(stageValue);
  return idx === -1 ? ACTIVE_ORDER.length : idx;
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildStageEntries(stageDetails, currentStatus) {
  const isClosed = statusMeta(currentStatus).terminal;
  const byStage = new Map();
  for (const record of stageDetails) {
    const list = byStage.get(record.stage) ?? [];
    list.push(record);
    byStage.set(record.stage, list);
  }

  const entries = [];

  for (const stageValue of ACTIVE_ORDER) {
    const records = (byStage.get(stageValue) ?? [])
      .slice()
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const editable =
      isClosed ||
      stageValue === currentStatus ||
      rankOf(stageValue) < rankOf(currentStatus);

    if (records.length === 0) {
      if (stageValue === currentStatus && STAGE_FIELDS[stageValue]) {
        entries.push({
          stage: stageValue,
          record: null,
          editable: true,
          roundLabel: null,
          defaultExpanded: true,
        });
      } else if (STAGE_FIELDS[stageValue]) {
        const isPast = rankOf(stageValue) < rankOf(currentStatus) || isClosed;
        entries.push({
          stage: stageValue,
          record: null,
          editable: false,
          empty: true,
          placeholderText: isPast
            ? "No details recorded for this stage."
            : "Not reached yet.",
          roundLabel: null,
          defaultExpanded: false,
        });
      }
      continue;
    }

    records.forEach((record, i) => {
      const roundLabel =
        stageValue === STATUS.InterviewScheduled ? `Round ${i + 1}` : null;
      entries.push({
        stage: stageValue,
        record,
        editable,
        roundLabel,
        round: stageValue === STATUS.InterviewScheduled ? i + 1 : null,
        defaultExpanded: stageValue === currentStatus,
      });
    });
  }

  if (currentStatus === STATUS.InterviewScheduled) {
    const existingRounds = byStage.get(STATUS.InterviewScheduled)?.length ?? 0;
    entries.push({
      stage: STATUS.InterviewScheduled,
      record: null,
      editable: true,
      roundLabel: `Round ${existingRounds + 1}`,
      round: existingRounds + 1,
      isNewRound: true,
      defaultExpanded: existingRounds === 0,
    });
  }

  if (isClosed && STAGE_FIELDS[currentStatus]) {
    const records = byStage.get(currentStatus) ?? [];
    if (records.length > 0) {
      records.forEach((record) =>
        entries.push({
          stage: currentStatus,
          record,
          editable: true,
          roundLabel: null,
          defaultExpanded: true,
        }),
      );
    } else {
      entries.push({
        stage: currentStatus,
        record: null,
        editable: true,
        roundLabel: null,
        defaultExpanded: true,
      });
    }
  }

  return entries;
}

function StageTrack({ status }) {
  const meta = statusMeta(status);
  const activeStages = STATUS_META.filter((s) => !s.terminal);
  const currentRank = meta.terminal
    ? activeStages.length
    : activeStages.findIndex((s) => s.value === status);

  const items = activeStages.map((s, i) => ({
    ...s,
    state: i < currentRank ? "done" : i === currentRank ? "current" : "future",
  }));

  if (meta.terminal) {
    items.push({ ...meta, state: "current" });
  }

  return (
    <div className="stage-track">
      {items.map((item, i) => (
        <Fragment key={item.value}>
          {i > 0 && <span className="stage-track-sep" />}
          <span className={`stage-track-item ${item.state}`}>
            <span className="tick" />
            {item.label}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function AutomationStatusBanner({
  automationStatus,
  timedOut,
  onRetry,
  retrying,
}) {
  const failed = automationStatus?.status === "failed";
  if (!failed && !timedOut) return null;

  const message = timedOut
    ? "Skill extraction is taking longer than expected."
    : `Automatic skill extraction failed${automationStatus.message ? `: ${automationStatus.message}` : "."}`;

  return (
    <div className="automation-banner automation-banner-failed">
      <span>{message} Add skills manually below, or </span>
      <button className="icon-btn" onClick={onRetry} disabled={retrying}>
        {retrying ? "Retrying…" : "Retry extraction"}
      </button>
    </div>
  );
}

function SkillsExtractingIndicator() {
  return (
    <div className="skills-extracting">
      <span className="automation-spinner" />
      <div>
        <div>Extracting skills from the job description…</div>
        <div className="skills-extracting-chips">
          <span className="skills-extracting-chip" />
          <span className="skills-extracting-chip" style={{ width: 90 }} />
          <span className="skills-extracting-chip" style={{ width: 60 }} />
        </div>
      </div>
    </div>
  );
}

export function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { updateApplication, removeApplication } = useApplications();

  const [application, setApplication] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [timeline, setTimeline] = useState(null);
  const [stageDetails, setStageDetails] = useState(null);
  const [requiredSkills, setRequiredSkills] = useState(null);
  const [automationStatus, setAutomationStatus] = useState(null);
  const [extractionTimedOut, setExtractionTimedOut] = useState(false);
  const [retryingExtraction, setRetryingExtraction] = useState(false);
  const [pollTrigger, setPollTrigger] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generatingRound, setGeneratingRound] = useState(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const skillsRefetchedRef = useRef(false);
  const questionsPollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setApplication(null);
    setNotFound(false);
    setTimeline(null);
    setStageDetails(null);
    setRequiredSkills(null);
    setConfirmingDelete(false);
    setDescriptionExpanded(false);

    getApplication(id)
      .then((data) => {
        if (cancelled) return;
        setApplication(data);
        setTimeline(data.timeline);
        setStageDetails(data.stageDetails);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 404) {
          setNotFound(true);
        } else {
          notify.error(
            "Could not load this application",
            extractErrorMessage(err),
          );
        }
      });

    getApplicationSkills(id)
      .then((names) => {
        if (!cancelled) setRequiredSkills(names);
      })
      .catch((err) => {
        if (!cancelled)
          notify.error(
            "Could not load required skills",
            extractErrorMessage(err),
          );
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!application) return;
    let cancelled = false;
    let intervalId = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    skillsRefetchedRef.current = false;
    setExtractionTimedOut(false);

    function poll() {
      getAutomationStatus(id)
        .then((data) => {
          if (cancelled) return;
          setAutomationStatus(data);
          attempts += 1;

          if (data.status === "succeeded" && !skillsRefetchedRef.current) {
            skillsRefetchedRef.current = true;
            Promise.all([
              getApplicationSkills(id).catch(() => null),
              getApplication(id).catch(() => null),
            ]).then(([names, fresh]) => {
              if (cancelled) return;
              if (names) setRequiredSkills(names);
              if (fresh) {
                setApplication(fresh);
                setTimeline(fresh.timeline);
                setStageDetails(fresh.stageDetails);
                updateApplication(id, fresh);
              }
            });
          }

          if (data.status !== "triggered" || attempts >= MAX_ATTEMPTS) {
            if (data.status === "triggered" && attempts >= MAX_ATTEMPTS) {
              setExtractionTimedOut(true);
            }
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
  }, [application?.id, id, pollTrigger]);

  useEffect(() => {
    return () => {
      if (questionsPollRef.current) clearInterval(questionsPollRef.current);
    };
  }, []);

  function handleStageSaved(saved) {
    setStageDetails((prev) => {
      const existing = prev ?? [];
      const withoutThis = existing.filter((s) => s.id !== saved.id);
      return [saved, ...withoutThis];
    });
  }

  async function handleSkillsSave(names) {
    await setApplicationSkills(application.id, names);
    setRequiredSkills(names);
    // Required skills changing shifts the fit score — refresh it here and
    // on the board rather than leaving both stale until a reload.
    try {
      const fresh = await getApplication(application.id);
      setApplication(fresh);
      setTimeline(fresh.timeline);
      setStageDetails(fresh.stageDetails);
      updateApplication(application.id, fresh);
    } catch {
      // Skills themselves already saved — the fit-score refresh is best effort.
    }
  }

  async function handleStatusChange(newStatus) {
    if (!application || application.status === newStatus) return;
    const previousStatus = application.status;

    setApplication((prev) => ({ ...prev, status: newStatus }));
    updateApplication(application.id, { status: newStatus });

    try {
      await updateApplicationStatus(application.id, newStatus);
      notify.success(`Moved to ${statusMeta(newStatus).label}`);
    } catch (err) {
      setApplication((prev) => ({ ...prev, status: previousStatus }));
      updateApplication(application.id, { status: previousStatus });
      notify.error("Could not change status", extractErrorMessage(err));
    }
  }

  async function handleRetrySkillExtraction() {
    setRetryingExtraction(true);
    try {
      await retrySkillExtraction(application.id);
      setAutomationStatus({ status: "triggered" });
      setExtractionTimedOut(false);
      skillsRefetchedRef.current = false;
      setPollTrigger((t) => t + 1);
      notify.info("Retrying extraction…", "This can take a few seconds.");
    } catch (err) {
      notify.error("Could not retry extraction", extractErrorMessage(err));
    } finally {
      setRetryingExtraction(false);
    }
  }

  function startQuestionsPoll(baselineTimelineCount) {
    if (questionsPollRef.current) clearInterval(questionsPollRef.current);
    let attempts = 0;
    const MAX_ATTEMPTS = 20;

    questionsPollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const data = await getApplication(id);
        if (data.timeline.length > baselineTimelineCount) {
          setTimeline(data.timeline);
          setStageDetails(data.stageDetails);
          clearInterval(questionsPollRef.current);
          questionsPollRef.current = null;
          setGeneratingRound(null);
          notify.success(
            "Questions ready",
            "Open the round below to see them.",
          );
          return;
        }
      } catch {
        // transient — keep trying until MAX_ATTEMPTS
      }
      if (attempts >= MAX_ATTEMPTS) {
        clearInterval(questionsPollRef.current);
        questionsPollRef.current = null;
        setGeneratingRound(null);
        notify.info(
          "Still working",
          "The workflow is taking longer than expected — check back shortly, or try again.",
        );
      }
    }, 4000);
  }

  async function handleGenerateQuestions(round) {
    setGeneratingRound(round);
    try {
      await generateInterviewQuestions(application.id, round);
      notify.info(
        "Generating questions…",
        "This page will update on its own once they're ready.",
      );
      startQuestionsPoll((timeline ?? []).length);
    } catch (err) {
      notify.error("Could not start generation", extractErrorMessage(err));
      setGeneratingRound(null);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteApplication(application.id);
      removeApplication(application.id);
      notify.success("Application deleted");
      navigate("/", { replace: true });
    } catch (err) {
      notify.error("Could not delete", extractErrorMessage(err));
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  if (notFound) {
    return (
      <Layout
        title="Application not found"
        actions={<Link to="/">← Back to board</Link>}
      >
        <div className="panel">
          <p style={{ margin: 0, color: "var(--text-dim)" }}>
            This application doesn't exist, or isn't yours. It may have been
            deleted.
          </p>
        </div>
      </Layout>
    );
  }

  if (!application) {
    return (
      <Layout title="Application" actions={<Link to="/">← Back to board</Link>}>
        <p style={{ color: "var(--text-dim)" }}>Loading…</p>
      </Layout>
    );
  }

  const stageEntries = buildStageEntries(
    stageDetails ?? [],
    application.status,
  );

  const isExtracting =
    automationStatus?.status === "triggered" && !extractionTimedOut;

  return (
    <Layout
      title={application.title}
      actions={<Link to="/">← Back to board</Link>}
    >
      <div
        className="sub"
        style={{ marginTop: -12, marginBottom: 18, color: "var(--text-dim)" }}
      >
        {application.company || "No company set"}
      </div>

      <div className="detail-danger-row">
        {confirmingDelete ? (
          <>
            <span className="modal-danger-prompt">
              Delete this application permanently?
            </span>
            <button
              className="btn-danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Confirm delete"}
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
          <button
            className="icon-btn-danger"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete application
          </button>
        )}
      </div>

      <StageTrack status={application.status} />

      <div className="meta-row">
        <div className="meta-item">
          <div className="k">Status</div>
          <div className="v">
            <select
              value={application.status}
              onChange={(e) => handleStatusChange(Number(e.target.value))}
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

      {typeof application.fitPercentage === "number" && (
        <div className="fit-block">
          <div className="fit-block-head">
            <span className="section-label" style={{ margin: 0 }}>
              Fit
            </span>
            <span className="fit-block-value">
              {application.fitPercentage}%
            </span>
          </div>
          <div className="skill-bar-track">
            <div
              className="skill-bar-fill"
              style={{
                width: `${application.fitPercentage}%`,
                background:
                  application.fitPercentage >= 70
                    ? "var(--s-interview)"
                    : application.fitPercentage >= 40
                      ? "var(--s-offered)"
                      : "#e07a6f",
              }}
            />
          </div>
          <div className="fit-block-hint">
            Share of this posting's required skills that are on your profile.
          </div>
        </div>
      )}

      <div className="section-label">Job description</div>

      <div className={`jd-block ${descriptionExpanded ? "is-expanded" : ""}`}>
        <div className="jd-content">
          {application.rawDescription || "No description saved."}
        </div>

        {application.rawDescription && (
          <button
            type="button"
            className="jd-toggle"
            onClick={() => setDescriptionExpanded((prev) => !prev)}
            aria-expanded={descriptionExpanded}
          >
            <span>
              {descriptionExpanded ? "Show less" : "Read full description"}
            </span>
            <span
              className={`jd-toggle-chevron ${
                descriptionExpanded ? "is-open" : ""
              }`}
              aria-hidden="true"
            >
              ↓
            </span>
          </button>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <div className="section-label">Required skills</div>
        {requiredSkills === null ? (
          <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Loading…</p>
        ) : isExtracting ? (
          <SkillsExtractingIndicator />
        ) : (
          <>
            <AutomationStatusBanner
              automationStatus={automationStatus}
              timedOut={extractionTimedOut}
              onRetry={handleRetrySkillExtraction}
              retrying={retryingExtraction}
            />
            <TagEditor
              key={application.id}
              initialSkills={requiredSkills}
              onSave={handleSkillsSave}
              saveLabel="Save required skills"
            />
          </>
        )}
      </div>

      {stageDetails !== null && (
        <div style={{ marginBottom: 20 }}>
          <div className="section-label" style={{ marginBottom: 10 }}>
            Stage details
          </div>

          {stageEntries.map((entry, i) => (
            <StageAccordion
              key={`${entry.stage}-${entry.record?.id ?? entry.roundLabel ?? i}`}
              entry={entry}
              applicationId={application.id}
              onSaved={handleStageSaved}
              onGenerateQuestions={
                entry.stage === STATUS.InterviewScheduled
                  ? handleGenerateQuestions
                  : null
              }
              generatingRound={generatingRound}
            />
          ))}
        </div>
      )}

      <div className="section-label">History</div>
      {timeline === null && (
        <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Loading…</p>
      )}
      {timeline !== null && timeline.length === 0 && (
        <p style={{ color: "var(--text-dim)", fontSize: 13 }}>No events yet.</p>
      )}
      {timeline !== null && timeline.length > 0 && (
        <ul className="timeline-list">
          {timeline.map((event) => (
            <li key={event.id} className="timeline-item">
              <span className="timeline-label">{eventLabel(event.type)}</span>
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
    </Layout>
  );
}
