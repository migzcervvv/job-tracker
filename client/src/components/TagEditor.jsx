import { useState } from "react";
export function TagEditor({ skills, onChange, onSave, disabled = false }) {
  const [name, setName] = useState("");
  function add(event) {
    event.preventDefault();
    const normalized = name.trim().toLowerCase();
    if (normalized && !skills.some((s) => s.name === normalized))
      onChange([...skills, { name: normalized, importance: 2 }]);
    setName("");
  }
  return (
    <div>
      <form className="tag-input-row" onSubmit={add}>
        <input
          value={name}
          maxLength={100}
          aria-label="Required skill"
          onChange={(e) => setName(e.target.value)}
          disabled={disabled}
        />
        <button className="icon-btn" disabled={disabled}>
          Add
        </button>
      </form>
      <ul className="skill-level-list">
        {skills.map((skill) => (
          <li className="skill-level-row" key={skill.name}>
            <span>{skill.name}</span>
            <select
              aria-label={`Importance of ${skill.name}`}
              disabled={disabled}
              value={skill.importance}
              onChange={(e) =>
                onChange(
                  skills.map((s) =>
                    s.name === skill.name
                      ? { ...s, importance: Number(e.target.value) }
                      : s,
                  ),
                )
              }
            >
              <option value={1}>Nice to have</option>
              <option value={2}>Preferred</option>
              <option value={3}>Required</option>
            </select>
            <button
              className="icon-btn"
              disabled={disabled}
              onClick={() =>
                onChange(skills.filter((s) => s.name !== skill.name))
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button className="btn-save" disabled={disabled} onClick={onSave}>
        Save requirements
      </button>
    </div>
  );
}
