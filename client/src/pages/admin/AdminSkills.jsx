import { useEffect, useState } from "react";
import { Layout } from "../../components/Layout.jsx";
import { SkillPicker } from "../../components/SkillPicker.jsx";
import {
  listSkillsAdmin,
  getSkillDetails,
  mergeSkills,
} from "../../api/admin.js";
import { extractErrorMessage } from "../../api/errors.js";
import { notify } from "../../notify.js";

const PAGE_SIZE = 20;
export function AdminSkills() {
  const [source, setSource] = useState(null);
  const [target, setTarget] = useState(null);
  const [merging, setMerging] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState("");
  useEffect(() => {
    let cancelled = false;
    listSkillsAdmin({ search, page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError("");
          setDetailId((previous) => previous || result.items[0]?.id || null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(extractErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [search, page, revision]);
  useEffect(() => {
    if (!detailId) return;
    let cancelled = false;
    getSkillDetails(detailId)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
          setDetailError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setDetailError(extractErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [detailId, revision]);
  function openDetail(id) {
    if (id === detailId) {
      if (detailError) setRevision((value) => value + 1);
      return;
    }
    setDetailId(id);
    setDetail(null);
    setDetailError("");
  }
  function select(skill) {
    if (source?.id === skill.id) {
      setSource(target);
      setTarget(null);
    } else if (target?.id === skill.id) setTarget(null);
    else if (!source) setSource(skill);
    else setTarget(skill);
  }
  async function merge(event) {
    event.preventDefault();
    if (!source || !target || merging || source.id === target.id) return;
    setMerging(true);
    try {
      await notify.promise(mergeSkills(source.id, target.id), {
        loading: "Merging skills…",
        success: (result) => `Merged into ${result.mergedInto}`,
        error: (err) => extractErrorMessage(err),
      });
      openDetail(target.id);
      setSource(null);
      setTarget(null);
      setPage(1);
      setRevision((value) => value + 1);
    } catch {
      /* The notification shows the error; retain the selections. */
    } finally {
      setMerging(false);
    }
  }
  const totalPages = Math.max(
    1,
    Math.ceil((data?.totalCount ?? 0) / PAGE_SIZE),
  );
  return (
    <Layout
      title="Skill library"
      description="Understand where skills are used and keep equivalent names together."
    >
      <p className="notice-info">
        This shared library covers all accounts. Similar names are suggestions
        to review; skills used together are not necessarily the same skill.
      </p>
      <div className="skill-library-grid">
        <section className="panel">
          <h2>Explore skills</h2>
          <label className="field" htmlFor="library-search">
            Search the library
            <input
              id="library-search"
              value={search}
              placeholder="Find a skill or a different spelling"
              disabled={merging}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <p>
            Select a skill name for context. Select two checkboxes to merge
            equivalent entries.
          </p>
          {error && (
            <div className="notice-error" role="alert">
              {error}{" "}
              <button
                className="icon-btn"
                onClick={() => setRevision((value) => value + 1)}
              >
                Try again
              </button>
            </div>
          )}
          {!data && !error && <p role="status">Loading the skill library…</p>}
          {data && (
            <>
              <div className="skill-library-list">
                {data.items.map((skill) => (
                  <div className="library-skill" key={skill.id}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${skill.name} for merge`}
                      checked={
                        source?.id === skill.id || target?.id === skill.id
                      }
                      disabled={
                        merging ||
                        Boolean(
                          source &&
                          target &&
                          source.id !== skill.id &&
                          target.id !== skill.id,
                        )
                      }
                      onChange={() => select(skill)}
                    />
                    <div>
                      <button
                        type="button"
                        className="text-btn library-skill-name"
                        aria-pressed={detailId === skill.id}
                        onClick={() => openDetail(skill.id)}
                      >
                        {skill.name}
                      </button>
                      <small>
                        {skill.applicationUsage === 0
                          ? "Not attached to a job posting yet"
                          : `Used in ${skill.applicationUsage} job postings${skill.requiredUsage != null ? `; required in ${skill.requiredUsage}` : ""}`}
                      </small>
                    </div>
                  </div>
                ))}
                {!data.items.length && <p>No skills match this search.</p>}
              </div>
              <div className="pagination-row">
                <button
                  className="icon-btn"
                  disabled={merging || page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {totalPages} · {data.totalCount} skills
                </span>
                <button
                  className="icon-btn"
                  disabled={merging || page >= totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </section>
        <section className="panel library-context" aria-label="Skill context">
          {detailError && (
            <p className="notice-error" role="alert">
              {detailError}
            </p>
          )}
          {!detail && !detailError && (
            <p>
              {detailId
                ? "Loading skill context…"
                : "Choose a skill to see where it matters."}
            </p>
          )}
          {detail && (
            <>
              <h2>{detail.name}</h2>
              <p>
                {detail.applicationUsage
                  ? `This skill appears in ${detail.applicationUsage} job postings and ${detail.userUsage} skill profiles across the workspace.`
                  : "This entry has no job postings yet. Check its spelling and related names before using it."}
              </p>
              <h3>How employers describe it</h3>
              <p>
                Required: {detail.requiredCount} · Preferred:{" "}
                {detail.preferredCount} · Nice to have: {detail.niceToHaveCount}
              </p>
              <p>
                {detail.requiredCount > 0
                  ? "A required skill can be a screening criterion. Keep its name consistent so job matches reflect the right experience."
                  : "No posting currently marks this skill as required. Its presence alone should not make it a learning priority."}
              </p>
              <h3>Roles asking for this skill</h3>
              {detail.roles.length ? (
                <ul>
                  {detail.roles.map((role) => (
                    <li key={role.title}>
                      {role.title || "Untitled role"} · {role.count} postings
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  No role examples yet. Tag a real posting to build this
                  context.
                </p>
              )}
              <h3>Examples from job descriptions</h3>
              {detail.examples?.length ? (
                detail.examples.map((example, index) => (
                  <blockquote className="library-example" key={index}>
                    <p>{example.text}</p>
                    <footer>{example.title || "Job posting"}</footer>
                  </blockquote>
                ))
              ) : (
                <p>
                  No matching description excerpt is available yet. The role and
                  requirement summaries above use saved skill tags.
                </p>
              )}
              <h3>Often used alongside</h3>
              <div className="library-related">
                {detail.relatedSkills.map((skill) => (
                  <button
                    className="icon-btn"
                    key={skill.id}
                    onClick={() => openDetail(skill.id)}
                  >
                    {skill.name} · {skill.count}
                  </button>
                ))}
              </div>
              {!detail.relatedSkills.length && (
                <p>No shared posting data yet.</p>
              )}
              <h3>Review similar names</h3>
              <p>
                Check that both names mean the same thing before merging.
                Related technologies and different versions may need separate
                entries.
              </p>
              {detail.suggestedAliases.map((alias) => (
                <div className="library-alias" key={alias.id}>
                  <span>{alias.name}</span>
                  <button
                    className="icon-btn"
                    disabled={merging}
                    onClick={() => {
                      setSource(alias);
                      setTarget(detail);
                    }}
                  >
                    Merge into {detail.name}
                  </button>
                </div>
              ))}
              {!detail.suggestedAliases.length && (
                <p>
                  No obvious name variants found. Use the checkboxes or searches
                  below to choose another entry.
                </p>
              )}
            </>
          )}
        </section>
      </div>
      <form className="panel" onSubmit={merge}>
        <h2>Merge equivalent skills</h2>
        <p>
          Choose the entry to remove and the name to keep. Applications and
          profiles retain the higher importance, proficiency, and evidence when
          both entries exist.
        </p>
        <div className="form-two-columns">
          <SkillPicker
            label="Entry to remove"
            value={source}
            onChange={setSource}
            excludeId={target?.id}
            disabled={merging}
          />
          <SkillPicker
            label="Name to keep"
            value={target}
            onChange={setTarget}
            excludeId={source?.id}
            disabled={merging}
          />
        </div>
        {source && target && (
          <div className="notice-info merge-review">
            <strong>
              {source.name} → {target.name}
            </strong>
            <p>
              The entry “{source.name}” will be removed across all accounts. Its
              links move to “{target.name}”.
            </p>
            <button
              className="text-btn"
              type="button"
              disabled={merging}
              onClick={() => {
                setSource(target);
                setTarget(source);
              }}
            >
              Swap which name is kept
            </button>
          </div>
        )}
        <div className="row-actions">
          <button
            className="btn-save"
            disabled={merging || !source || !target || source.id === target.id}
          >
            {merging ? "Merging…" : "Merge selected skills"}
          </button>
          <button
            className="icon-btn"
            type="button"
            disabled={merging}
            onClick={() => {
              setSource(null);
              setTarget(null);
            }}
          >
            Clear selection
          </button>
        </div>
      </form>
    </Layout>
  );
}
