import { useState } from "react";
import { useVersionedDraft } from "../hooks/useVersionedDraft.js";
import { STATUS_META } from "../api/statusMeta.js";
import { toInstant, toLocalInput } from "../api/datetime.js";
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
  function change(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit(
        {
          ...fields,
          appliedDate: toInstant(fields.appliedDate),
          resumeId: fields.resumeId || null,
        },
        version,
      );
    } catch (err) {
      setError(
        err.response?.data?.error ??
          (typeof err.response?.data === "string"
            ? err.response.data
            : err.message),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={submit}>
      {["title", "company", "jobUrl"].map((key) => (
        <div className="field" key={key}>
          <label htmlFor={key}>
            {
              { title: "Job title", company: "Company", jobUrl: "Posting URL" }[
                key
              ]
            }
          </label>
          <input
            id={key}
            type={key === "jobUrl" ? "url" : "text"}
            value={fields[key]}
            required={key === "title"}
            maxLength={key === "jobUrl" ? 2048 : 200}
            onChange={(e) => change(key, e.target.value)}
            disabled={busy}
          />
        </div>
      ))}
      <div className="field">
        <label htmlFor="application-status">Status</label>
        <select
          id="application-status"
          value={fields.status}
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
          {fields.status === -1 ? "Saved date" : "Applied date"} (local time)
        </label>
        <input
          id="applied-date"
          type="datetime-local"
          value={fields.appliedDate}
          onChange={(e) => change("appliedDate", e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="submitted-resume">Submitted resume</label>
        <select
          id="submitted-resume"
          value={fields.resumeId}
          onChange={(e) => change("resumeId", e.target.value)}
        >
          <option value="">Active profile resume</option>
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.fileName}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="description">Job description</label>
        <textarea
          id="description"
          rows={12}
          maxLength={100000}
          value={fields.rawDescription}
          onChange={(e) => change("rawDescription", e.target.value)}
          disabled={busy}
        />
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="stage-form-actions">
        {onCancel && (
          <button className="icon-btn" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn-save" disabled={busy}>
          {busy ? "Saving…" : "Save application"}
        </button>
      </div>
    </form>
  );
}
