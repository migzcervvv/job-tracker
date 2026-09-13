import { useEffect, useState } from 'react';
import { Layout } from '../../components/Layout.jsx';
import { listSkillsAdmin, mergeSkills } from '../../api/admin.js';
import { extractErrorMessage } from '../../api/errors.js';
import { notify } from '../../notify.js';

export function AdminSkills() {
  const [skills, setSkills] = useState(null);
  const [search, setSearch] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [merging, setMerging] = useState(false);

  function refresh() {
    listSkillsAdmin()
      .then(setSkills)
      .catch((err) => notify.error('Could not load skills', extractErrorMessage(err)));
  }

  useEffect(refresh, []);

  const filtered = (skills ?? []).filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleMerge(e) {
    e.preventDefault();
    if (!sourceId || !targetId) return;
    setMerging(true);
    try {
      await notify.promise(mergeSkills(sourceId, targetId), {
        loading: 'Merging…',
        success: (r) => `Merged into "${r.mergedInto}"`,
        error: (err) => extractErrorMessage(err, 'Could not merge skills'),
      });
      setSourceId('');
      setTargetId('');
      refresh();
    } catch {
      // toast already shown
    } finally {
      setMerging(false);
    }
  }

  return (
    <Layout title="Manage skills">
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0, marginBottom: 20 }}>
        Merge two entries that mean the same skill under different names —
        e.g. "n8n" and "n8n automation" — into one. The merged-from entry is
        removed; every application and user that had it tagged now has the
        target instead. This affects everyone on this instance, which is why
        it's admin-only.
      </p>

      <form onSubmit={handleMerge} className="panel" style={{ maxWidth: 560, marginBottom: 24 }}>
        <div className="stage-form-grid" style={{ marginBottom: 14 }}>
          <div className="field">
            <label>Merge this skill…</label>
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} required>
              <option value="">Select a skill</option>
              {(skills ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.applicationUsage + s.userUsage} uses)
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>…into this one</label>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} required>
              <option value="">Select a skill</option>
              {(skills ?? []).filter((s) => s.id !== sourceId).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.applicationUsage + s.userUsage} uses)
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn-save" type="submit" disabled={merging || !sourceId || !targetId}>
          {merging ? 'Merging…' : 'Merge'}
        </button>
      </form>

      <div className="section-label">All skills</div>
      <input
        type="text"
        placeholder="Search skills…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: '100%',
          maxWidth: 320,
          marginBottom: 14,
          background: 'var(--panel-raised)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius)',
          padding: '8px 10px',
          color: 'var(--text)',
        }}
      />

      {skills === null && <p style={{ color: 'var(--text-dim)' }}>Loading…</p>}

      {skills !== null && (
        <div className="admin-table">
          <div className="admin-table-head">
            <span>Skill</span>
            <span>On applications</span>
            <span>Claimed by users</span>
          </div>
          {filtered.map((s) => (
            <div className="admin-table-row" key={s.id}>
              <span>{s.name}</span>
              <span>{s.applicationUsage}</span>
              <span>{s.userUsage}</span>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
