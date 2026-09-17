import { useState } from "react";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";

export const SKILL_LEVELS = [
  { value: 1, label: "Beginner" },
  { value: 2, label: "Intermediate" },
  { value: 3, label: "Advanced" },
  { value: 4, label: "Expert" },
];

// Every action (add, remove, level change) saves immediately — no separate
// "Save" step. Each row tracks its own in-flight state so one slow request
// doesn't lock the rest of the list.
export function SkillLevelEditor({ skills, onAdd, onRemove, onLevelChange }) {
  const [inputValue, setInputValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyRow, setBusyRow] = useState(null);

  async function handleAdd() {
    const name = inputValue.trim();
    if (!name) return;
    const exists = skills.some(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      setInputValue("");
      return;
    }
    setAdding(true);
    try {
      await onAdd(name);
      setInputValue("");
    } catch (err) {
      notify.error("Could not add skill", extractErrorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  async function handleRemove(name) {
    setBusyRow(name);
    try {
      await onRemove(name);
    } catch (err) {
      notify.error("Could not remove skill", extractErrorMessage(err));
    } finally {
      setBusyRow(null);
    }
  }

  async function handleLevel(name, level) {
    setBusyRow(name);
    try {
      await onLevelChange(name, level);
    } catch (err) {
      notify.error("Could not update level", extractErrorMessage(err));
    } finally {
      setBusyRow(null);
    }
  }

  return (
    <div className="skill-level-editor">
      <div className="tag-input-row" style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Type a skill and press Enter"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={adding}
        />
        <button
          type="button"
          className="icon-btn"
          onClick={handleAdd}
          disabled={adding}
        >
          {adding ? "Adding…" : "Add"}
        </button>
      </div>

      {skills.length === 0 ? (
        <p className="tag-empty" style={{ margin: 0 }}>
          No skills added yet.
        </p>
      ) : (
        <ul className="skill-level-list">
          {skills.map((s) => (
            <li className="skill-level-row" key={s.name}>
              <span className="skill-level-name" title={s.name}>
                {s.name}
              </span>

              <div className="skill-level-control">
                {SKILL_LEVELS.map((lvl) => (
                  <button
                    key={lvl.value}
                    type="button"
                    className={`skill-level-btn${s.level === lvl.value ? " active" : ""}`}
                    onClick={() => handleLevel(s.name, lvl.value)}
                    disabled={busyRow === s.name}
                    title={lvl.label}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="myskills-row-remove"
                onClick={() => handleRemove(s.name)}
                disabled={busyRow === s.name}
                aria-label={`Remove ${s.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
