import { useEffect, useId, useRef, useState } from "react";
import { listSkillsAdmin } from "../api/admin.js";
export function SkillPicker({ label, value, onChange, excludeId }) {
  const id = useId();
  const [input, setInput] = useState("");
  const query = value?.name ?? input;
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void listSkillsAdmin({ search: query, page: 1, pageSize: 8 })
        .then((data) => {
          if (!cancelled)
            setResults(data.items.filter((s) => s.id !== excludeId));
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, excludeId]);
  useEffect(() => {
    const outside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);
  return (
    <div className="field skill-picker" ref={containerRef}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setInput(event.target.value);
          setOpen(true);
          if (value) onChange(null);
        }}
        placeholder="Search skills"
      />
      {open && (
        <div className="skill-picker-menu">
          {!results.length && (
            <div className="skill-picker-empty">No matches</div>
          )}
          {results.map((skill) => (
            <button
              type="button"
              className="skill-picker-item"
              key={skill.id}
              onClick={() => {
                onChange(skill);
                setInput("");
                setOpen(false);
              }}
            >
              <span>{skill.name}</span>
              <span>{skill.applicationUsage + skill.userUsage} uses</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
