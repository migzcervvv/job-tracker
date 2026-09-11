import { useState } from "react";
import { STAGE_FIELDS } from "../api/stageFields.js";
import { upsertStageDetail } from "../api/applications.js";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";
import { STATUS } from "../api/statusMeta.js";

function FieldInput({ field, value, onChange }) {
  if (field.type === "textarea") {
    return (
      <textarea
        rows={3}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          background: "var(--panel-raised)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius)",
          padding: "8px 10px",
          color: "var(--text)",
          resize: "vertical",
        }}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }

  return (
    <input
      type={field.type}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function StageDetailForm({
  applicationId,
  stage,
  initialFields,
  onSaved,
}) {
  const fieldDefs = STAGE_FIELDS[stage];
  const [values, setValues] = useState(initialFields ?? {});
  const [submitting, setSubmitting] = useState(false);

  if (!fieldDefs) return null; // Withdrawn / Archived — nothing to fill in

  function setField(key, val) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const saved = await notify.promise(
        upsertStageDetail(applicationId, stage, values),
        {
          loading: "Saving…",
          success:
            stage === STATUS.InterviewScheduled
              ? "Round saved"
              : "Stage details saved",
          error: (err) => extractErrorMessage(err, "Could not save"),
        },
      );
      onSaved(saved);
      if (stage === STATUS.InterviewScheduled) setValues({}); // next save = a new round
    } catch {
      // toast already shown
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {fieldDefs.map((f) => (
        <div className="field" key={f.key} style={{ marginBottom: 10 }}>
          <label>{f.label}</label>
          <FieldInput
            field={f}
            value={values[f.key]}
            onChange={(v) => setField(f.key, v)}
          />
        </div>
      ))}
      <button className="icon-btn" type="submit" disabled={submitting}>
        {submitting
          ? "Saving…"
          : stage === STATUS.InterviewScheduled
            ? "Save round"
            : "Save stage details"}
      </button>
    </form>
  );
}
