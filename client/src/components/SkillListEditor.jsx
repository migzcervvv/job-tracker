import { useState } from "react";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";

// Row-based replacement for the pill/chip tag display — each skill gets its
// own full-width row instead of a small chip, which reads better once names
// get longer and leaves room to attach more per-skill detail later.
export function SkillListEditor({
  initialSkills,
  onSave,
  saveLabel = "Save skills",
}) {
  const [draft, setDraft] = useState(initialSkills ?? []);
  const [inputValue, setInputValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function addFromInput() {
    const name = inputValue.trim();
    if (!name) return;
    const exists = draft.some((s) => s.toLowerCase() === name.toLowerCase());
    if (!exists) setDraft((prev) => [...prev, name]);
    setInputValue("");
  }

  function removeSkill(name) {
    setDraft((prev) => prev.filter((s) => s !== name));
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addFromInput();
    }
  }

  async function handleSave() {
    setSubmitting(true);
    try {
      await notify.promise(onSave(draft), {
        loading: "Saving…",
        success: "Skills saved",
        error: (err) => extractErrorMessage(err, "Could not save skills"),
      });
    } catch {
      // toast already shown
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="skill-list-editor tag-editor">
      <div className="tag-input-row" style={{ marginBottom: 14 }}>
        <input
          type="text"
          placeholder="Type a skill and press Enter"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="icon-btn" onClick={addFromInput}>
          Add
        </button>
      </div>

      {draft.length === 0 ? (
        <p className="tag-empty" style={{ margin: 0 }}>
          No skills added yet.
        </p>
      ) : (
        <ul className="myskills-list">
          {draft.map((skill) => (
            <li className="myskills-row" key={skill}>
              <span className="name">{skill}</span>
              <button
                type="button"
                className="myskills-row-remove"
                onClick={() => removeSkill(skill)}
                aria-label={`Remove ${skill}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        className="btn-save"
        type="button"
        onClick={handleSave}
        disabled={submitting}
        style={{ marginTop: 14 }}
      >
        {submitting ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}
