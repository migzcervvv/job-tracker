import { useEffect, useMemo, useState } from 'react';
import { Layout } from '../../components/Layout.jsx';
import { SkillPicker } from '../../components/SkillPicker.jsx';
import { listSkillsAdmin, mergeSkills } from '../../api/admin.js';
import { extractErrorMessage } from '../../api/errors.js';
import { notify } from '../../notify.js';

const PAGE_SIZE = 20;

// The API already returns items sorted A–Z (see AdminController.ListSkills)
// — this just buckets the current page into letter groups for scanning,
// it doesn't re-sort anything.
function groupByLetter(items) {
  const groups = [];
  for (const item of items) {
    const letter = item.name.charAt(0).toUpperCase();
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) last.items.push(item);
    else groups.push({ letter, items: [item] });
  }
  return groups;
}

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
  const groups = useMemo(() => groupByLetter(tableData?.items ?? []), [tableData]);

  return (
    <Layout title="Manage skills">
      <div className="panel merge-panel">
        <div className="section-label">Merge duplicate skills</div>
        <p className="page-section-sub" style={{ marginBottom: 16 }}>
          Combine two entries that mean the same thing under different names
          — e.g. "n8n" and "n8n automation" — into one. The left entry is
          removed; every application and user that had it tagged gets the
          right one instead. This affects everyone on this instance, which
          is why it's admin-only.
        </p>

        <form onSubmit={handleMerge} className="merge-form">
          <SkillPicker
            label="Merge this skill"
            value={source}
            onChange={setSource}
            excludeId={target?.id}
          />
          <span className="merge-arrow" aria-hidden="true">→</span>
          <SkillPicker
            label="Into this one"
            value={target}
            onChange={setTarget}
            excludeId={source?.id}
          />
          <button className="btn-save merge-submit" type="submit" disabled={merging || !source || !target}>
            {merging ? 'Merging…' : 'Merge'}
          </button>
        </form>
      </div>

      <section className="page-section" style={{ marginTop: 28 }}>
        <div className="page-section-head">
          <div>
            <h2>All skills</h2>
            <p className="page-section-sub">
              Sorted A–Z so the list is quick to scan and search.
            </p>
          </div>
          <span className="page-count">{tableData?.totalCount ?? 0}</span>
        </div>

        <input
          type="text"
          className="search-input"
          placeholder="Search skills…"
          value={tableSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
        />

        {tableData === null && <p style={{ color: 'var(--text-dim)' }}>Loading…</p>}

        {tableData !== null && (
          <>
            <div className="skill-index">
              <div className="skill-index-head">
                <span>Skill</span>
                <span>On applications</span>
                <span>Claimed by users</span>
              </div>

              {groups.length === 0 && (
                <div className="skill-index-empty">
                  No skills match "{tableSearch}".
                </div>
              )}

              {groups.map((group) => (
                <div className="skill-index-group" key={group.letter}>
                  <div className="skill-index-letter">{group.letter}</div>
                  {group.items.map((s) => (
                    <div className="skill-index-row" key={s.id}>
                      <span className="skill-index-name">{s.name}</span>
                      <span className="skill-index-count">{s.applicationUsage}</span>
                      <span className="skill-index-count">{s.userUsage}</span>
                    </div>
                  ))}
                </div>
              ))}
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
      </section>
    </Layout>
  );
}
