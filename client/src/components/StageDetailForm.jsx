import { useState } from 'react';
import { STAGE_FIELDS } from '../api/stageFields.js';
import { upsertStageDetail } from '../api/applications.js';
import { extractErrorMessage } from '../api/errors.js';
import { notify } from '../notify.js';
import { STATUS } from '../api/statusMeta.js';

// Long-form inputs get the full row; short ones sit two-up in the grid.
const FULL_WIDTH_TYPES = new Set(['textarea', 'url', 'checkbox']);

function FieldInput({ field, value, onChange }) {
  if (field.type === 'textarea') {
    return <textarea rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }

  if (field.type === 'select') {
    return (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <div className="field-checkbox">
        <input
          id={`sf-${field.key}`}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label htmlFor={`sf-${field.key}`}>{field.label}</label>
      </div>
    );
  }

  return (
    <input
      type={field.type}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// appendsNewRound: true only for the one slot whose job is to create the
// NEXT interview round. Editing an existing round (past or current) must
// never trigger the clear-after-save behavior, or the just-saved data
// would vanish from under the user.
export function StageDetailForm({ applicationId, stage, initialFields, onSaved, appendsNewRound = false }) {
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
      const saved = await notify.promise(upsertStageDetail(applicationId, stage, values), {
        loading: 'Saving…',
        success: stage === STATUS.InterviewScheduled ? 'Round saved' : 'Stage details saved',
        error: (err) => extractErrorMessage(err, 'Could not save'),
      });
      onSaved(saved);
      if (appendsNewRound) setValues({}); // this slot just created a round — clear it for the next one
    } catch {
      // toast already shown
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="stage-form" onSubmit={handleSubmit}>
      <div className="stage-form-grid">
        {fieldDefs.map((f) => {
          const spanFull = FULL_WIDTH_TYPES.has(f.type);
          if (f.type === 'checkbox') {
            return (
              <div className="field span-2" key={f.key}>
                <FieldInput field={f} value={values[f.key]} onChange={(v) => setField(f.key, v)} />
              </div>
            );
          }
          return (
            <div className={`field${spanFull ? ' span-2' : ''}`} key={f.key}>
              <label>{f.label}</label>
              <FieldInput field={f} value={values[f.key]} onChange={(v) => setField(f.key, v)} />
            </div>
          );
        })}
      </div>

      <div className="stage-form-actions">
        {appendsNewRound && (
          <span className="stage-form-hint">Saving adds a new round — it won't overwrite the last one.</span>
        )}
        <button className="btn-save" type="submit" disabled={submitting}>
          {submitting
            ? 'Saving…'
            : stage === STATUS.InterviewScheduled
              ? 'Save round'
              : 'Save stage details'}
        </button>
      </div>
    </form>
  );
}