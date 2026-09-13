import { useEffect, useRef, useState } from 'react';
import { listSkillsAdmin } from '../api/admin.js';

export function SkillPicker({ label, value, onChange, excludeId }) {
  const [query, setQuery] = useState(value?.name ?? '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    setQuery(value?.name ?? '');
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      listSkillsAdmin({ search: query, page: 1, pageSize: 8 })
        .then((res) => setResults(res.items.filter((s) => s.id !== excludeId)))
        .catch(() => setResults([]));
    }, 250); // debounce — don't fire a request on every keystroke
    return () => clearTimeout(handle);
  }, [query, open, excludeId]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(skill) {
    onChange(skill);
    setQuery(skill.name);
    setOpen(false);
  }

  return (
    <div className="field skill-picker" ref={containerRef}>
      <label>{label}</label>
      <input
        type="text"
        value={query}
        placeholder="Type to search…"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onChange(null); // typing invalidates the previous selection
        }}
      />
      {open && (
        <div className="skill-picker-menu">
          {results.length === 0 && (
            <div className="skill-picker-empty">No matches</div>
          )}
          {results.map((s) => (
            <button
              type="button"
              key={s.id}
              className="skill-picker-item"
              onClick={() => handleSelect(s)}
            >
              <span>{s.name}</span>
              <span className="skill-picker-count">{s.applicationUsage + s.userUsage} uses</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
