import { useState } from 'react';
import { extractErrorMessage } from '../api/errors.js';
import { notify } from '../notify.js';

export function TagEditor({ initialSkills, onSave, saveLabel = 'Save skills' }) {
  const [draft, setDraft] = useState(initialSkills ?? []);
  const [inputValue, setInputValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function addFromInput() {
    const name = inputValue.trim();
    if (!name) return;
    const exists = draft.some((s) => s.toLowerCase() === name.toLowerCase());
    if (!exists) setDraft((prev) => [...prev, name]);
    setInputValue('');
  }

  function removeSkill(name) {
    setDraft((prev) => prev.filter((s) => s !== name));
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addFromInput();
    }
  }

  async function handleSave() {
    setSubmitting(true);
    try {
      await notify.promise(onSave(draft), {
        loading: 'Saving…',
        success: 'Skills saved',
        error: (err) => extractErrorMessage(err, 'Could not save skills'),
      });
    } catch {
      // toast already shown
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="tag-editor">
      <div className="tag-list">
        {draft.length === 0 && <span className="tag-empty">No skills added yet.</span>}
        {draft.map((skill) => (
          <span className="tag-chip" key={skill}>
            {skill}
            <button type="button" onClick={() => removeSkill(skill)} aria-label={`Remove ${skill}`}>
              ✕
            </button>
          </span>
        ))}
      </div>

      <div className="tag-input-row">
        <input
          type="text"
          placeholder="Type a skill and press Enter"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="icon-btn" onClick={addFromInput}>Add</button>
      </div>

      <button className="btn-save" type="button" onClick={handleSave} disabled={submitting} style={{ marginTop: 12 }}>
        {submitting ? 'Saving…' : saveLabel}
      </button>
    </div>
  );
}
