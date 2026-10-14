import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Layout } from "../components/Layout.jsx";
import { useVersionedDraft } from "../hooks/useVersionedDraft.js";
import { ApplicationForm } from "../components/ApplicationForm.jsx";
import { StageAccordion } from "../components/StageAccordion.jsx";
import { TagEditor } from "../components/TagEditor.jsx";
import {
  getApplication,
  editApplication,
  updateApplicationStatus,
  deleteApplication,
  retrySkillExtraction,
  getAutomationStatus,
  generateInterviewQuestions,
  saveFollowUp,
  addNote,
} from "../api/applications.js";
import {
  getApplicationSkills,
  getMySkills,
  setApplicationSkills,
} from "../api/skills.js";
import { listResumes } from "../api/resumes.js";
import { STATUS_META, STATUS, statusMeta } from "../api/statusMeta.js";
import { STAGE_FIELDS, parseStageFields } from "../api/stageFields.js";
import { pollRun } from "../api/polling.js";
import { toInstant, toLocalInput } from "../api/datetime.js";
import { useApplications } from "../state/ApplicationsContext.jsx";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";
import { Icon } from "../components/Icon.jsx";
import { progressMessage } from "../api/progress.js";
import { eventLabel } from "../api/timelineMeta.js";
import { ConnectionHelp } from "../components/ConnectionHelp.jsx";
export function ApplicationDetail() {
  const { id } = useParams();
  return <Detail key={id} id={id} />;
}
function FollowUpForm({ app, onSaved }) {
  const {
    values,
    version,
    change: setValues,
    reset,
  } = useVersionedDraft(
    {
      nextAction: app.nextAction ?? "",
      followUpAt: toLocalInput(app.followUpAt),
      snoozedUntil: toLocalInput(app.snoozedUntil),
      contactName: app.contactName ?? "",
      contactEmail: app.contactEmail ?? "",
      responseReceived: false,
    },
    app.version,
  );
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const fresh = await saveFollowUp(app.id, {
        ...values,
        version,
        followUpAt: toInstant(values.followUpAt),
        snoozedUntil: toInstant(values.snoozedUntil),
      });
      reset({ ...values, responseReceived: false }, fresh.version);
      onSaved(fresh);
    } catch (err) {
      notify.error("Could not save follow-up", extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={submit}>
      <h3>Your next step</h3>
      <p>Keep the next action and the person to contact together.</p>
      {[
        "nextAction",
        "followUpAt",
        "snoozedUntil",
        "contactName",
        "contactEmail",
      ].map((key) => (
        <div className="field" key={key}>
          <label htmlFor={key}>
            {
              {
                nextAction: "What needs to happen next?",
                followUpAt: "Follow-up date",
                snoozedUntil: "Pause reminders until",
                contactName: "Recruiter / contact",
                contactEmail: "Contact email",
              }[key]
            }
          </label>
          <input
            id={key}
            type={
              key.endsWith("At") || key === "snoozedUntil"
                ? "datetime-local"
                : key === "contactEmail"
                  ? "email"
                  : "text"
            }
            value={values[key]}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, [key]: e.target.value }))
            }
            disabled={busy}
          />
        </div>
      ))}
      <label>
        <input
          type="checkbox"
          checked={values.responseReceived}
          onChange={(e) =>
            setValues((prev) => ({
              ...prev,
              responseReceived: e.target.checked,
            }))
          }
        />{" "}
        I’ve heard back from the employer
      </label>
      <p>
        <button className="btn-save" disabled={busy}>
          Save follow-up
        </button>
      </p>
    </form>
  );
}
function Detail({ id }) {
  const navigate = useNavigate();
  const { updateApplication, removeApplication } = useApplications();
  const [app, setApp] = useState(null);
  const [required, setRequired] = useState(null);
  const [draft, setDraft] = useState([]);
  const dirty = useRef(false);
  const [mySkills, setMySkills] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [resumesError, setResumesError] = useState("");
  const resumesLoaded = useRef(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [questionRun, setQuestionRun] = useState(null);
  const [questionStatus, setQuestionStatus] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [skillsError, setSkillsError] = useState("");
  const mounted = useRef(true);
  const request = useRef(0);
  const loadController = useRef(null);
  const accept = useCallback(
    (fresh) => {
      if (!mounted.current) return;
      setApp(fresh);
      updateApplication(id, fresh);
    },
    [id, updateApplication],
  );
  const reload = useCallback(async () => {
    const seq = ++request.current;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const current = () =>
      mounted.current && seq === request.current && !controller.signal.aborted;
    // Skills enrich the page; they must not gate application details.
    void getApplicationSkills(id, controller.signal)
      .then((skills) => {
        if (!current()) return;
        setSkillsError("");
        if (!dirty.current) {
          setRequired(skills);
          setDraft(skills.skills);
        }
      })
      .catch((err) => {
        if (current()) setSkillsError(extractErrorMessage(err));
      });
    try {
      const fresh = await getApplication(id, controller.signal);
      if (!current()) return;
      accept(fresh);
      setError("");
    } catch (err) {
      if (!current()) return;
      setError(extractErrorMessage(err));
      throw err;
    }
  }, [id, accept]);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => {
        if (!controller.signal.aborted) return reload();
      })
      .catch(() => {});
    void Promise.resolve()
      .then(() => {
        if (!controller.signal.aborted) return getMySkills(controller.signal);
      })
      .then((data) => {
        if (!controller.signal.aborted) setMySkills(data);
      })
      .catch(() => {});
    const dispose = () => {
      mounted.current = false;
      controller.abort();
      request.current++;
      loadController.current?.abort();
    };
    return dispose;
  }, [reload]);
  useEffect(() => {
    if (!editing || resumesLoaded.current) return;
    const controller = new AbortController();
    setResumesError("");
    void listResumes(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setResumes(data);
        resumesLoaded.current = true;
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setResumesError(extractErrorMessage(err));
      });
    return () => controller.abort();
  }, [editing]);
  const skillRunId = app?.extractionRunId;
  useEffect(() => {
    if (!skillRunId) return;
    const controller = new AbortController();
    const stop = pollRun({
      signal: controller.signal,
      fetchStatus: (signal) =>
        getAutomationStatus(id, skillRunId, "skill_extraction", signal),
      onStatus: (state) => {
        setStatus(state);
        if (state.status === "succeeded") void reload().catch(() => {});
      },
      onError: (err) => setStatus({ status: "unknown", message: err.message }),
    });
    return () => {
      controller.abort();
      stop();
    };
  }, [id, skillRunId, reload]);
  useEffect(() => {
    if (!questionRun) return;
    const controller = new AbortController();
    const stop = pollRun({
      signal: controller.signal,
      fetchStatus: (signal) =>
        getAutomationStatus(id, questionRun, "interview_questions", signal),
      onStatus: (state) => {
        setQuestionStatus(state);
        if (state.status === "succeeded") void reload().catch(() => {});
      },
      onError: (err) =>
        setQuestionStatus({ status: "unknown", message: err.message }),
    });
    return () => {
      controller.abort();
      stop();
    };
  }, [id, questionRun, reload]);
  async function mutate(action) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (err) {
      notify.error("Could not save", extractErrorMessage(err));
      if (err.response?.status === 409) await reload().catch(() => {});
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function generate(stageDetailId) {
    await mutate(async () => {
      const run = await generateInterviewQuestions(id, stageDetailId);
      setQuestionRun(run.runId);
      setQuestionStatus(run);
      await reload();
    });
  }
  if (!app)
    return (
      <Layout title="Application">
        <p role={error ? "alert" : undefined}>{error || "Loading…"}</p>
        {error && (
          <>
            <button
              className="btn-primary"
              onClick={() => {
                setError("");
                void reload().catch(() => {});
              }}
            >
              Try again
            </button>
            <ConnectionHelp />
          </>
        )}
        <Link to="/">All applications</Link>
      </Layout>
    );
  const mine = new Set(mySkills.map((s) => s.name));
  const stages = app.stageDetails ?? [];
  const entries = stages.map((record) => ({
    stage: record.stage,
    record,
    editable: true,
    defaultExpanded: record.stage === app.status,
    roundLabel:
      record.stage === STATUS.InterviewScheduled
        ? "Round " + (parseStageFields(record.fieldsJson).round ?? "?")
        : null,
  }));
  if (
    STAGE_FIELDS[app.status] &&
    (app.status === STATUS.InterviewScheduled ||
      !stages.some((s) => s.stage === app.status))
  )
    entries.push({
      stage: app.status,
      editable: true,
      defaultExpanded: true,
      isNewRound: app.status === STATUS.InterviewScheduled,
      roundLabel: app.status === STATUS.InterviewScheduled ? "New round" : null,
    });
  const generating =
    questionStatus &&
    !["succeeded", "failed", "cancelled", "unknown"].includes(
      questionStatus.status,
    )
      ? questionStatus.stageDetailId
      : null;
  return (
    <Layout
      title={app.title}
      description={app.company || "Your application details"}
      actions={
        <Link className="icon-btn" to="/">
          <Icon name="back" size={16} />
          All applications
        </Link>
      }
    >
      {error && <p role="alert">Couldn’t refresh this application. {error}</p>}
      <section className="panel">
        <div className="detail-summary">
          <div>
            <span className="eyebrow">CURRENT STAGE</span>
            <p style={{ margin: "7px 0 0" }}>
              {statusMeta(app.status).label} ·{" "}
              {app.status === -1 ? "Saved" : "Applied"}{" "}
              {new Date(app.appliedDate).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <button
            className="icon-btn"
            onClick={() => setEditing((value) => !value)}
            disabled={busy}
          >
            {editing ? "Close editor" : "Edit application"}
          </button>
        </div>
        <div className="stage-form-actions">
          <label className="toolbar-select">
            Move to
            <select
              aria-label="Application status"
              value={app.status}
              disabled={busy}
              onChange={(event) => {
                const value = Number(event.target.value);
                void mutate(async () =>
                  accept(await updateApplicationStatus(id, value, app.version)),
                );
              }}
            >
              {STATUS_META.map((stage) => (
                <option value={stage.value} key={stage.value}>
                  {stage.label}
                </option>
              ))}
            </select>
          </label>
          {app.jobUrl && (
            <a
              className="text-btn"
              href={app.jobUrl}
              target="_blank"
              rel="noreferrer"
            >
              View original posting
              <Icon name="arrow" size={15} />
            </a>
          )}
        </div>
        <details style={{ marginTop: 20 }}>
          <summary>Read the job description</summary>
          <p style={{ whiteSpace: "pre-wrap", maxWidth: 850 }}>
            {app.rawDescription ||
              "No job description added yet. Use Edit application to add the posting."}
          </p>
        </details>
      </section>
      {editing && resumesError && (
        <p role="alert">
          Resume choices couldn’t load. {resumesError} Close and reopen the
          editor to retry.
        </p>
      )}
      {editing && (
        <ApplicationForm
          initial={app}
          resumes={resumes}
          onCancel={() => setEditing(false)}
          onSubmit={async (values, version) => {
            accept(await editApplication(id, version, values));
            dirty.current = false;
            await reload();
            setEditing(false);
            notify.success("Application updated");
          }}
        />
      )}
      <div className="detail-columns">
        <div className="detail-main">
          <section className="panel">
            <h3>Application progress</h3>
            <p>Keep interview rounds, assessments and offers in one place.</p>
            {entries.length === 0 && (
              <p className="stage-entry-empty">
                There are no stage details to add yet. Update the stage above as
                your application moves forward.
              </p>
            )}
            {entries.map((entry) => (
              <StageAccordion
                key={
                  entry.record
                    ? entry.record.id
                    : "new:" + entry.stage + ":" + stages.length
                }
                entry={entry}
                applicationId={id}
                onSaved={() =>
                  void reload().catch((err) =>
                    notify.error(
                      "Couldn’t refresh the details",
                      extractErrorMessage(err),
                    ),
                  )
                }
                onGenerateQuestions={generate}
                generatingRound={generating}
              />
            ))}
            {questionStatus && (
              <p className="notice-info" role="status">
                {progressMessage(questionStatus, "questions")}
              </p>
            )}
          </section>
          <section className="panel">
            <h3>Notes & activity</h3>
            <p>Save a conversation, a useful detail or a thought for later.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void mutate(async () => {
                  accept(await addNote(id, note));
                  setNote("");
                  notify.success("Note saved");
                });
              }}
            >
              <div className="field">
                <label htmlFor="interaction-note">Add a note</label>
                <textarea
                  id="interaction-note"
                  rows={3}
                  maxLength={10000}
                  required
                  placeholder="What would you like to remember?"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
              <button className="btn-save" disabled={busy || !note.trim()}>
                Save note
              </button>
            </form>
            <ul className="timeline-list">
              {app.timeline.map((item) => (
                <li className="timeline-item" key={item.id}>
                  <time>
                    {new Date(item.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                  <span className="timeline-label">
                    {eventLabel(item.type)}
                  </span>
                  {item.type === "note" && (
                    <p style={{ whiteSpace: "pre-wrap" }}>{item.body}</p>
                  )}
                  {item.type === "status_changed" && (
                    <p>
                      {(item.body ?? "")
                        .split(" → ")
                        .map((part) =>
                          STATUS[part] === undefined
                            ? part
                            : statusMeta(STATUS[part]).label,
                        )
                        .join(" → ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <aside className="detail-aside" aria-label="Skills and follow-up">
          <section className="panel">
            <h3>Your skill match</h3>
            {skillsError ? (
              <div role="alert">
                <p>
                  Job skills couldn’t load. You can still view and edit this
                  application. {skillsError}
                </p>
                <button
                  className="text-btn"
                  onClick={() => {
                    setSkillsError("");
                    void reload().catch(() => {});
                  }}
                >
                  Retry job skills
                </button>
              </div>
            ) : (
              !required && <p role="status">Loading job skills…</p>
            )}
            {app.fit ? (
              <div className="fit-summary">
                <span className="fit-score">{app.fit.overall}%</span>
                <div className="fit-copy">
                  <strong>
                    {app.fit.requiredCovered} of {app.fit.requiredTotal} skills
                    matched
                  </strong>
                  <br />A guide to your match, not a hiring prediction.
                </div>
              </div>
            ) : (
              <p>
                Once job skills are added, you’ll see how they compare with your
                own.
              </p>
            )}
            {required && !skillsError && (
              <div className="skill-summary">
                <div>
                  <strong>In your skill set</strong>
                  <div className="skill-chips">
                    {(required?.skills ?? [])
                      .filter((skill) => mine.has(skill.name))
                      .map((skill) => (
                        <span key={skill.name}>{skill.name}</span>
                      ))}
                    {!(required?.skills ?? []).some((skill) =>
                      mine.has(skill.name),
                    ) && <span>No matches yet</span>}
                  </div>
                </div>
                <div>
                  <strong>Room to grow</strong>
                  <div className="skill-chips missing">
                    {(required?.skills ?? [])
                      .filter((skill) => !mine.has(skill.name))
                      .map((skill) => (
                        <span key={skill.name}>{skill.name}</span>
                      ))}
                    {!(required?.skills ?? []).some(
                      (skill) => !mine.has(skill.name),
                    ) && <span>No missing skills recorded</span>}
                  </div>
                </div>
              </div>
            )}
            {status && (
              <p className="notice-info" role="status">
                {progressMessage(status)}
              </p>
            )}
            <details>
              <summary>Review and edit job skills</summary>
              <p>
                Mark each skill as required, preferred or nice to have. Save
                when you’re finished.
              </p>
              {required && (
                <TagEditor
                  skills={draft}
                  onChange={(values) => {
                    dirty.current = true;
                    setDraft(values);
                  }}
                  disabled={busy || Boolean(skillsError)}
                  onSave={() =>
                    void mutate(async () => {
                      const saved = await setApplicationSkills(
                        id,
                        draft,
                        required.version,
                      );
                      dirty.current = false;
                      setRequired(saved);
                      setDraft(saved.skills);
                      await reload();
                      notify.success("Job skills saved");
                    })
                  }
                />
              )}
              <div className="stage-form-actions">
                <button
                  className="icon-btn"
                  disabled={busy}
                  onClick={() =>
                    void mutate(async () => {
                      const run = await retrySkillExtraction(id);
                      setStatus(run);
                      await reload();
                    })
                  }
                >
                  Find skills automatically
                </button>
                <button
                  className="text-btn"
                  disabled={busy}
                  onClick={() => {
                    dirty.current = false;
                    void reload().catch((err) =>
                      notify.error(
                        "Couldn’t refresh the skills",
                        extractErrorMessage(err),
                      ),
                    );
                  }}
                >
                  Discard unsaved skill changes
                </button>
              </div>
            </details>
            <details style={{ marginTop: 18 }}>
              <summary>How is the match calculated?</summary>
              <p>
                Required skills count more than preferred or nice-to-have
                skills. When a resume text comparison is available, it
                contributes 30% and skill coverage contributes 70%. Otherwise
                the score uses skill coverage alone. Your personal proficiency
                ratings do not change the score.
              </p>
            </details>
          </section>
          <FollowUpForm
            app={app}
            onSaved={(fresh) => {
              accept(fresh);
              notify.success("Next step saved");
              void reload().catch(() => {});
            }}
          />
        </aside>
      </div>
      <details className="detail-danger">
        <summary>Remove this application</summary>
        <p>
          Deleting permanently removes this application and its notes. To keep a
          record, change its stage to Archived instead.
        </p>
        <button
          className="icon-btn-danger"
          disabled={busy}
          onClick={() =>
            void mutate(async () => {
              await deleteApplication(id);
              removeApplication(id);
              navigate("/");
              notify.success("Application deleted");
            })
          }
        >
          Delete application
        </button>
      </details>
    </Layout>
  );
}
