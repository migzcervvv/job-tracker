import { useState } from "react";
import { Link } from "react-router-dom";
import { ConnectionHelp } from "./ConnectionHelp.jsx";
import { useVersionedDraft } from "../hooks/useVersionedDraft.js";
import { STATUS_META } from "../api/statusMeta.js";
import { toInstant, toLocalInput } from "../api/datetime.js";
import { extractErrorMessage } from "../api/errors.js";
export function ApplicationForm({
  initial = {},
  resumes = [],
  onSubmit,
  onCancel,
}) {
  const [defaultDate] = useState(() => new Date().toISOString());
  const {
    values: fields,
    version,
    change: setFields,
  } = useVersionedDraft(
    {
      title: initial.title ?? "",
      company: initial.company ?? "",
      jobUrl: initial.jobUrl ?? "",
      rawDescription: initial.rawDescription ?? "",
      status: initial.status ?? 0,
      appliedDate: toLocalInput(initial.appliedDate ?? defaultDate),
      resumeId: initial.resumeId ?? "",
    },
    initial.version,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState(null);
  function change(key, value) {
    setDuplicates(null);
    setFields((prev) => ({ ...prev, [key]: value }));
  }
  async function submit(event, allowDuplicate = false) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit(
        {
          ...fields,
          appliedDate: toInstant(fields.appliedDate),
          resumeId: fields.resumeId || null,
          ...(allowDuplicate ? { allowDuplicate: true } : {}),
        },
        version,
      );
    } catch (err) {
      if (err?.response?.data?.code === "application_duplicate") {
        setDuplicates(err.response.data);
        return;
      }
      setError(
        extractErrorMessage(
          err,
          "Your application couldn’t be saved. Please try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel application-form" onSubmit={submit}>
      <div className="form-section-head">
        <span className="form-step">1</span>
        <div>
          <h2>The opportunity</h2>
          <p>Start with the role and where you found it.</p>
        </div>
      </div>
      <div className="form-two-columns">
        {["title", "company"].map((key) => (
          <div className="field" key={key}>
            <label htmlFor={key}>
              {key === "title" ? "Job title *" : "Company"}
            </label>
            <input
              id={key}
              value={fields[key]}
              placeholder={
                key === "title" ? "e.g. Platform Engineer" : "e.g. Acme"
              }
              required={key === "title"}
              maxLength={200}
              onChange={(e) => change(key, e.target.value)}
              disabled={busy}
            />
          </div>
        ))}
      </div>
      <div className="field">
        <label htmlFor="jobUrl">
          Job posting link <span className="form-required">(optional)</span>
        </label>
        <input
          id="jobUrl"
          type="url"
          placeholder="https://…"
          maxLength={2048}
          value={fields.jobUrl}
          onChange={(e) => change("jobUrl", e.target.value)}
          disabled={busy}
        />
      </div>
      <hr className="form-divider" />
      <div className="form-section-head">
        <span className="form-step">2</span>
        <div>
          <h2>Where things stand</h2>
          <p>Saving a role for later? Choose “Saved” instead of “Applied”.</p>
        </div>
      </div>
      <div className="form-two-columns">
        <div className="field">
          <label htmlFor="application-status">Current stage</label>
          <select
            id="application-status"
            value={fields.status}
            disabled={busy}
            onChange={(e) => change("status", Number(e.target.value))}
          >
            {STATUS_META.map((s) => (
              <option value={s.value} key={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="applied-date">
            {fields.status === -1 ? "Date saved" : "Date applied"} *
          </label>
          <input
            id="applied-date"
            type="datetime-local"
            value={fields.appliedDate}
            onChange={(e) => change("appliedDate", e.target.value)}
            required
            disabled={busy}
          />
          <small className="field-hint">Shown in your local time.</small>
        </div>
      </div>
      <div className="field">
        <label htmlFor="submitted-resume">Resume for this application</label>
        <select
          id="submitted-resume"
          value={fields.resumeId}
          onChange={(e) => change("resumeId", e.target.value)}
          disabled={busy}
        >
          <option value="">Use my active resume</option>
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.fileName}
            </option>
          ))}
        </select>
        <small className="field-hint">
          You can choose a different version later.
        </small>
      </div>
      <hr className="form-divider" />
      <div className="form-section-head">
        <span className="form-step">3</span>
        <div>
          <h2>The job description</h2>
          <p>
            Paste the posting to find relevant skills and prepare for
            interviews.
          </p>
        </div>
      </div>
      <div className="field">
        <label htmlFor="description">
          Job description <span className="form-required">(optional)</span>
        </label>
        <textarea
          id="description"
          rows={9}
          maxLength={100000}
          placeholder="Paste the responsibilities, requirements and other details here…"
          value={fields.rawDescription}
          onChange={(e) => change("rawDescription", e.target.value)}
          disabled={busy}
        />
      </div>
      {duplicates && (
        <section className="notice-info duplicate-review" role="alert">
          <h3>This may already be in your applications</h3>
          <p>
            The company and job title match. These descriptions meet the{" "}
            {duplicates.threshold}% similarity threshold; similarity is a text
            comparison, not proof that the roles are identical.
          </p>
          <ul>
            {duplicates.matches.map((match) => (
              <li key={match.id}>
                <Link to={`/applications/${match.id}`}>
                  {match.title} at {match.company}
                </Link>{" "}
                — {match.descriptionSimilarity}% description match
              </li>
            ))}
          </ul>
          <p>
            Open the existing application above, or save a separate application
            if this is a different opportunity.
          </p>
          <button
            type="button"
            className="icon-btn"
            disabled={busy}
            onClick={(event) => void submit(event, true)}
          >
            Save as a separate application
          </button>
        </section>
      )}
      {error && (
        <div>
          <p className="error-line" role="alert">
            {error}
          </p>
          <ConnectionHelp />
        </div>
      )}
      <div className="form-footer">
        {onCancel && (
          <button
            className="icon-btn"
            type="button"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
        )}
        <button className="btn-save" type="submit" disabled={busy}>
          {busy
            ? "Saving your application…"
            : initial.id
              ? "Save changes"
              : "Save application"}
        </button>
      </div>
    </form>
  );
}
