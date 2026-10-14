import { useId, useState } from "react";
import { useVersionedDraft } from "../hooks/useVersionedDraft.js";
import { STAGE_FIELDS } from "../api/stageFields.js";
import { upsertStageDetail } from "../api/applications.js";
import { toInstant, toLocalInput } from "../api/datetime.js";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";
export function StageDetailForm({
  applicationId,
  stage,
  initialFields,
  onSaved,
  stageDetailId = null,
  version = null,
  onCancel = null,
}) {
  const prefix = useId();
  const defs = STAGE_FIELDS[stage] ?? [];
  const {
    values,
    version: draftVersion,
    change: setValues,
  } = useVersionedDraft(
    Object.fromEntries(
      Object.entries(initialFields ?? {}).map(([key, value]) => [
        key,
        defs.find((f) => f.key === key)?.type === "datetime-local"
          ? toLocalInput(value)
          : value,
      ]),
    ),
    version,
  );
  const [submitting, setSubmitting] = useState(false);
  function change(key, value) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }
  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const fields = { ...values };
      for (const def of defs)
        if (def.type === "datetime-local" && fields[def.key])
          fields[def.key] = toInstant(fields[def.key]);
      if (fields.scheduledAt)
        fields.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const saved = await upsertStageDetail(
        applicationId,
        stage,
        fields,
        stageDetailId,
        draftVersion,
      );
      onSaved(saved);
    } catch (err) {
      notify.error("Could not save stage", extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <form className="stage-form" onSubmit={submit}>
      <div className="stage-form-grid">
        {defs.map((f) => (
          <div
            className={`field${["textarea", "url", "checkbox"].includes(f.type) ? " span-2" : ""}`}
            key={f.key}
          >
            <label htmlFor={prefix + f.key}>{f.label}</label>
            {f.type === "textarea" ? (
              <textarea
                id={prefix + f.key}
                rows={3}
                maxLength={10000}
                value={values[f.key] ?? ""}
                onChange={(e) => change(f.key, e.target.value)}
                disabled={submitting}
              />
            ) : f.type === "select" ? (
              <select
                id={prefix + f.key}
                value={values[f.key] ?? ""}
                onChange={(e) => change(f.key, e.target.value)}
                disabled={submitting}
              >
                <option value="">—</option>
                {f.options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                id={prefix + f.key}
                type={f.type}
                {...(f.type === "checkbox"
                  ? { checked: Boolean(values[f.key]) }
                  : { value: values[f.key] ?? "" })}
                onChange={(e) =>
                  change(
                    f.key,
                    f.type === "checkbox" ? e.target.checked : e.target.value,
                  )
                }
                disabled={submitting}
              />
            )}
          </div>
        ))}
      </div>
      <div className="stage-form-actions">
        {onCancel && (
          <button type="button" className="icon-btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn-save" disabled={submitting}>
          {submitting ? "Saving…" : "Save details"}
        </button>
      </div>
    </form>
  );
}
