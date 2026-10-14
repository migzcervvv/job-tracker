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
import { STAGE_FIELDS } from "../api/stageFields.js";
import { pollRun } from "../api/polling.js";
import { toInstant, toLocalInput } from "../api/datetime.js";
import { useApplications } from "../state/ApplicationsContext.jsx";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";
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
      <h3>Next action and contact</h3>
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
                nextAction: "Next action",
                followUpAt: "Follow-up (local time)",
                snoozedUntil: "Snooze until (local time)",
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
        Employer response received
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
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [questionRun, setQuestionRun] = useState(null);
  const [questionStatus, setQuestionStatus] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const request = useRef(0);
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
    const [fresh, skills] = await Promise.all([
      getApplication(id),
      getApplicationSkills(id),
    ]);
    if (!mounted.current || seq !== request.current) return;
    accept(fresh);
    if (!dirty.current) {
      setRequired(skills);
      setDraft(skills.skills);
    }
  }, [id, accept]);
  useEffect(() => {
    mounted.current = true;
    void reload().catch((err) => {
      if (mounted.current) setError(extractErrorMessage(err));
    });
    void getMySkills()
      .then((data) => {
        if (mounted.current) setMySkills(data);
      })
      .catch(() => {});
    void listResumes()
      .then((data) => {
        if (mounted.current) setResumes(data);
      })
      .catch(() => {});
    const dispose = () => {
      mounted.current = false;
      request.current++;
    };
    return dispose;
  }, [reload]);
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
      if (err.response?.status === 409) await reload();
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
        ? "Round " + (JSON.parse(record.fieldsJson).round ?? "?")
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
    <Layout title={app.title} actions={<Link to="/">Board</Link>}>
      <div className="panel">
        <h2>{app.company}</h2>
        <p>
          {statusMeta(app.status).label} ·{" "}
          {new Date(app.appliedDate).toLocaleDateString()}
        </p>
        <div className="stage-form-actions">
          <select
            aria-label="Application status"
            value={app.status}
            disabled={busy}
            onChange={(e) => {
              const value = Number(e.target.value);
              void mutate(async () =>
                accept(await updateApplicationStatus(id, value, app.version)),
              );
            }}
          >
            {STATUS_META.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            className="icon-btn"
            onClick={() => setEditing(true)}
            disabled={busy}
          >
            Edit application
          </button>
          <button
            className="icon-btn"
            disabled={busy}
            onClick={() =>
              void mutate(async () => {
                await deleteApplication(id);
                removeApplication(id);
                navigate("/");
              })
            }
          >
            Delete
          </button>
        </div>
        {app.jobUrl && (
          <p>
            <a href={app.jobUrl} target="_blank" rel="noreferrer">
              Open posting
            </a>
          </p>
        )}
        <details>
          <summary>Job description</summary>
          <p style={{ whiteSpace: "pre-wrap" }}>{app.rawDescription}</p>
        </details>
      </div>
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
          }}
        />
      )}
      <div className="panel">
        <h3>Fit and requirements</h3>
        <p>
          {app.fit
            ? `${app.fit.overall}% overall · ${app.fit.skillMatch}% weighted skill match · ${app.fit.requiredCovered}/${app.fit.requiredTotal} skills matched${app.fit.semantic == null ? "" : ` · ${app.fit.semantic}% semantic signal`}`
            : "No fit score until skills are recorded."}
        </p>
        <p>
          Importance weights: required 3, preferred 2, nice to have 1. With
          embeddings, overall = 70% skill match + 30% semantic signal. The
          semantic signal rescales cosine 0.3–0.9 to 0–100. It is a heuristic,
          not a hiring probability. Self-rated proficiency does not change this
          score.
        </p>
        <p>
          Matched:{" "}
          {(required?.skills ?? [])
            .filter((s) => mine.has(s.name))
            .map((s) => s.name)
            .join(", ") || "None"}
          . Missing:{" "}
          {(required?.skills ?? [])
            .filter((s) => !mine.has(s.name))
            .map((s) => s.name)
            .join(", ") || "None"}
          .
        </p>
        {status && (
          <p role="status">
            Extraction: {status.status ?? "pending"} {status.message}
          </p>
        )}
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
          Extract again
        </button>
        {required && (
          <TagEditor
            skills={draft}
            onChange={(values) => {
              dirty.current = true;
              setDraft(values);
            }}
            disabled={busy}
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
              })
            }
          />
        )}
        <button
          className="icon-btn"
          disabled={busy}
          onClick={() => {
            dirty.current = false;
            void reload().catch((err) =>
              notify.error("Could not reload", extractErrorMessage(err)),
            );
          }}
        >
          Discard requirement draft and reload
        </button>
      </div>
      <FollowUpForm
        app={app}
        onSaved={(fresh) => {
          accept(fresh);
          void reload().catch(() => {});
        }}
      />
      <div className="panel">
        <h3>Stage details</h3>
        {entries.length === 0 && <p>No stage details yet.</p>}
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
                notify.error("Could not reload", extractErrorMessage(err)),
              )
            }
            onGenerateQuestions={generate}
            generatingRound={generating}
          />
        ))}
        {questionStatus && (
          <p role="status">
            Question generation: {questionStatus.status}{" "}
            {questionStatus.message}
          </p>
        )}
      </div>
      <div className="panel">
        <h3>Interaction notes and timeline</h3>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void mutate(async () => {
              accept(await addNote(id, note));
              setNote("");
            });
          }}
        >
          <div className="field">
            <label htmlFor="interaction-note">Interaction note</label>
            <textarea
              id="interaction-note"
              maxLength={10000}
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <button className="btn-save" disabled={busy}>
            Add note
          </button>
        </form>
        <ul>
          {app.timeline.map((item) => (
            <li key={item.id}>
              <time>{new Date(item.createdAt).toLocaleString()}</time> ·{" "}
              {item.type}
              <p style={{ whiteSpace: "pre-wrap" }}>{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </Layout>
  );
}
