import { useEffect, useState } from 'react';
import { Layout } from '../../components/Layout.jsx';
import { SkillPicker } from '../../components/SkillPicker.jsx';
import { listSkillsAdmin, mergeSkills } from '../../api/admin.js';
import { extractErrorMessage } from '../../api/errors.js';
import { notify } from '../../notify.js';

const PAGE_SIZE = 20;

export function AdminSkills() {
  const [source, setSource] = useState(null);
  const [target, setTarget] = useState(null);
  const [merging, setMerging] = useState(false);

  const [tableSearch, setTableSearch] = useState('');
  const [page, setPage] = useState(1);
  const [tableData, setTableData] = useState(null); // { items, totalCount }

  function refreshTable() {
    listSkillsAdmin({ search: tableSearch, page, pageSize: PAGE_SIZE })
      .then(setTableData)
      .catch((err) => notify.error('Could not load skills', extractErrorMessage(err)));
  }

  useEffect(refreshTable, [tableSearch, page]);

  function handleSearchChange(value) {
    setTableSearch(value);
    setPage(1); // any new search starts back at page 1
  }

  async function handleMerge(e) {
    e.preventDefault();
    if (!source || !target) return;
    setMerging(true);
    try {
      await notify.promise(mergeSkills(source.id, target.id), {
        loading: 'Merging…',
        success: (r) => `Merged into "${r.mergedInto}"`,
        error: (err) => extractErrorMessage(err, 'Could not merge skills'),
      });
      setSource(null);
      setTarget(null);
      refreshTable();
    } catch {
      // toast already shown
    } finally {
      setMerging(false);
    }
  }

  const totalPages = tableData ? Math.max(1, Math.ceil(tableData.totalCount / PAGE_SIZE)) : 1;

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
          <SkillPicker
            label="Merge this skill…"
            value={source}
            onChange={setSource}
            excludeId={target?.id}
          />
          <SkillPicker
            label="…into this one"
            value={target}
            onChange={setTarget}
            excludeId={source?.id}
          />
        </div>
        <button className="btn-save" type="submit" disabled={merging || !source || !target}>
          {merging ? 'Merging…' : 'Merge'}
        </button>
      </form>

      <div className="section-label">All skills</div>
      <input
        type="text"
        placeholder="Search skills…"
        value={tableSearch}
        onChange={(e) => handleSearchChange(e.target.value)}
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

      {tableData === null && <p style={{ color: 'var(--text-dim)' }}>Loading…</p>}

      {tableData !== null && (
        <>
          <div className="admin-table">
            <div className="admin-table-head" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
              <span>Skill</span>
              <span>On applications</span>
              <span>Claimed by users</span>
            </div>
            {tableData.items.map((s) => (
              <div className="admin-table-row" style={{ gridTemplateColumns: '2fr 1fr 1fr' }} key={s.id}>
                <span>{s.name}</span>
                <span>{s.applicationUsage}</span>
                <span>{s.userUsage}</span>
              </div>
            ))}
            {tableData.items.length === 0 && (
              <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 13 }}>No skills match.</div>
            )}
          </div>

          <div className="pagination-row">
            <button className="icon-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Previous
            </button>
            <span className="pagination-status">
              Page {page} of {totalPages} · {tableData.totalCount} total
            </span>
            <button
              className="icon-btn"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </button>
          </div>
        </>
      )}
    </Layout>
  );
}
