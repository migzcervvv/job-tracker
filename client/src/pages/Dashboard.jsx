import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { Layout } from "../components/Layout.jsx";
import { Icon } from "../components/Icon.jsx";
import { KanbanColumn } from "../components/KanbanColumn.jsx";
import { DataTools } from "../components/DataTools.jsx";
import { FunnelSummary } from "../components/FunnelSummary.jsx";
import { updateApplicationStatus } from "../api/applications.js";
import { STATUS_META, statusMeta } from "../api/statusMeta.js";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";
import { useApplications } from "../state/ApplicationsContext.jsx";

function dateLabel(value) {
  return value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "—";
}
function inView(application, view) {
  return view === "saved"
    ? application.status === -1
    : view === "closed"
      ? statusMeta(application.status).terminal
      : application.status >= 0 && !statusMeta(application.status).terminal;
}
export function Dashboard() {
  const [currentTime, setCurrentTime] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const { applications, loadFailed, loadError, updateApplication, refresh } =
    useApplications();
  const navigate = useNavigate();
  const [view, setView] = useState("active");
  const [presentation, setPresentation] = useState("list");
  const [activeId, setActiveId] = useState(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("date");
  const [stage, setStage] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [undo, setUndo] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [working, setWorking] = useState(() => new Set());
  const pending = useRef(new Set());
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );
  const columns = STATUS_META.filter((s) => inView({ status: s.value }, view));
  const visible = useMemo(() => {
    const rows = (applications ?? []).filter(
      (a) =>
        inView(a, view) &&
        (!stage || a.status === Number(stage)) &&
        (a.title + " " + a.company)
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    );
    return rows.sort((a, b) =>
      sort === "fit"
        ? (b.fitPercentage ?? -1) - (a.fitPercentage ?? -1)
        : sort === "company"
          ? (a.company ?? "").localeCompare(b.company ?? "")
          : sort === "followup"
            ? (a.followUpAt ? Date.parse(a.followUpAt) : Infinity) -
              (b.followUpAt ? Date.parse(b.followUpAt) : Infinity)
            : sort === "deadline"
              ? (a.nextDeadlineAt ? Date.parse(a.nextDeadlineAt) : Infinity) -
                (b.nextDeadlineAt ? Date.parse(b.nextDeadlineAt) : Infinity)
              : Date.parse(b.appliedDate) - Date.parse(a.appliedDate),
    );
  }, [applications, view, query, stage, sort]);
  const byStatus = Object.fromEntries(
    STATUS_META.map((s) => [
      s.value,
      visible.filter((a) => a.status === s.value),
    ]),
  );
  const rows = applications ?? [];
  const active = rows.filter((a) => inView(a, "active"));
  const counts = {
    active: active.length,
    saved: rows.filter((a) => a.status === -1).length,
    closed: rows.filter((a) => inView(a, "closed")).length,
  };
  const activeApplication = rows.find((a) => a.id === activeId);
  function markPending(id, busy) {
    if (busy) pending.current.add(id);
    else pending.current.delete(id);
    setWorking(new Set(pending.current));
  }
  function changeView(next) {
    setView(next);
    setStage("");
    setSelected(new Set());
  }
  async function moveApplication(id, newStatus) {
    const current = rows.find((a) => a.id === id);
    if (!current || current.status === newStatus || pending.current.has(id))
      return;
    markPending(id, true);
    try {
      const fresh = await updateApplicationStatus(
        id,
        newStatus,
        current.version,
      );
      updateApplication(id, fresh);
      notify.success(
        "Application updated",
        "Moved to " + statusMeta(newStatus).label.toLowerCase() + ".",
      );
    } catch (error) {
      notify.error("Couldn’t update the stage", extractErrorMessage(error));
      if (error.response?.status === 409) await refresh().catch(() => {});
    } finally {
      markPending(id, false);
    }
  }
  async function bulkArchive(restore = false) {
    setBulkBusy(true);
    const completed = [];
    try {
      const chosen = restore ? undo : rows.filter((a) => selected.has(a.id));
      for (const row of chosen) {
        const current = rows.find((a) => a.id === row.id);
        if (!current || pending.current.has(row.id)) continue;
        markPending(row.id, true);
        try {
          const fresh = await updateApplicationStatus(
            row.id,
            restore ? row.status : 9,
            restore ? row.version : current.version,
          );
          updateApplication(row.id, fresh);
          completed.push({
            id: row.id,
            status: current.status,
            version: fresh.version,
          });
        } finally {
          markPending(row.id, false);
        }
      }
      if (completed.length)
        notify.success(
          restore ? "Applications restored" : "Applications archived",
          completed.length +
            " " +
            (completed.length === 1 ? "application" : "applications") +
            " updated.",
        );
    } catch (error) {
      notify.error(
        "Some applications couldn’t be updated",
        extractErrorMessage(error),
      );
      await refresh().catch(() => {});
    } finally {
      setUndo(restore ? [] : completed);
      setSelected(new Set());
      setBulkBusy(false);
    }
  }
  return (
    <Layout
      title="Applications"
      actions={
        <Link to="/applications/new" className="btn-primary">
          <Icon name="plus" size={18} />
          Add application
        </Link>
      }
    >
      <section className="overview-grid" aria-label="Application overview">
        {[
          ["In progress", active.length, "applications", "active"],
          [
            "Interviews",
            active.filter((a) => a.status === 3).length,
            "profile",
            "interview",
          ],
          [
            "Offers",
            active.filter((a) => a.status === 4).length,
            "check",
            "offer",
          ],
          [
            "Follow-ups due",
            active.filter(
              (a) =>
                a.followUpAt &&
                Date.parse(a.followUpAt) <= currentTime &&
                (!a.snoozedUntil || Date.parse(a.snoozedUntil) <= currentTime),
            ).length,
            "alerts",
            "followup",
          ],
        ].map(([label, count, icon, tone]) => (
          <div className={"overview-card " + tone} key={label}>
            <span className="overview-icon">
              <Icon name={icon} />
            </span>
            <div>
              <span className="overview-label">{label}</span>
              <strong>{applications === null ? "—" : count}</strong>
            </div>
          </div>
        ))}
      </section>
      <section className="applications-panel" aria-label="Your applications">
        <div className="collection-header">
          <div className="collection-tabs" aria-label="Application groups">
            {[
              ["active", "In progress"],
              ["saved", "Saved for later"],
              ["closed", "Closed"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={view === key ? "active" : ""}
                aria-pressed={view === key}
                onClick={() => changeView(key)}
              >
                {label}
                <span>{counts[key]}</span>
              </button>
            ))}
          </div>
          <div className="view-toggle" aria-label="View applications as">
            {[
              ["list", "List"],
              ["board", "Board"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={presentation === key ? "active" : ""}
                aria-pressed={presentation === key}
                onClick={() => setPresentation(key)}
              >
                <Icon name={key} size={16} />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="collection-toolbar">
          <div className="search-field">
            <Icon name="search" size={18} />
            <input
              aria-label="Search company or title"
              placeholder="Search roles or companies…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(new Set());
              }}
            />
          </div>
          <label className="toolbar-select">
            Stage
            <select
              value={stage}
              aria-label="Filter stage"
              onChange={(e) => {
                setStage(e.target.value);
                setSelected(new Set());
              }}
            >
              <option value="">All stages</option>
              {columns.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="toolbar-select">
            Sort by
            <select
              aria-label="Sort applications"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="date">Newest first</option>
              <option value="company">Company name</option>
              <option value="fit">Highest skill match</option>
              <option value="followup">Follow-up date</option>
              <option value="deadline">Next deadline</option>
            </select>
          </label>
        </div>
        {(selected.size > 0 || undo.length > 0) && (
          <div className="selection-bar" role="status">
            <span>
              {selected.size
                ? selected.size + " selected"
                : "Applications archived. You can undo this."}
            </span>
            {selected.size > 0 && (
              <>
                <button
                  className="icon-btn"
                  disabled={bulkBusy}
                  onClick={() => void bulkArchive()}
                >
                  {bulkBusy ? "Updating…" : "Archive selected"}
                </button>
                <button
                  className="text-btn"
                  disabled={bulkBusy}
                  onClick={() => setSelected(new Set())}
                >
                  Clear selection
                </button>
              </>
            )}
            {undo.length > 0 && (
              <button
                className="icon-btn"
                disabled={bulkBusy}
                onClick={() => void bulkArchive(true)}
              >
                Undo archive
              </button>
            )}
          </div>
        )}
        {applications === null && !loadFailed && (
          <div className="empty-state" role="status">
            <span className="loading-spinner" />
            Loading your applications…
          </div>
        )}
        {loadFailed && (
          <div className="empty-state" role="alert">
            <Icon name="alerts" size={28} />
            <h2>Your applications couldn’t load</h2>
            <p>
              {loadError ||
                "Check your connection and try again. Your saved applications are still in your account."}
            </p>
            <button
              className="icon-btn"
              onClick={() => void refresh().catch(() => {})}
            >
              Try again
            </button>
          </div>
        )}
        {!loadFailed && applications !== null && visible.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="applications" size={30} />
            </span>
            <h2>
              {query || stage
                ? "No matching applications"
                : view === "saved"
                  ? "A place for your next opportunity"
                  : view === "closed"
                    ? "No closed applications yet"
                    : "Your next chapter starts here"}
            </h2>
            <p>
              {query || stage
                ? "Try a different search or clear your filters."
                : view === "saved"
                  ? "Save interesting roles here while you decide where to apply."
                  : view === "closed"
                    ? "Completed applications will appear here, keeping your active list focused."
                    : "Add a role you’ve applied for, then keep its progress and next steps together."}
            </p>
            {query || stage ? (
              <button
                className="icon-btn"
                onClick={() => {
                  setQuery("");
                  setStage("");
                }}
              >
                Clear filters
              </button>
            ) : (
              view !== "closed" && (
                <Link className="btn-primary" to="/applications/new">
                  <Icon name="plus" size={17} />
                  Add your first application
                </Link>
              )
            )}
          </div>
        )}
        {applications !== null &&
          visible.length > 0 &&
          presentation === "list" && (
            <div className="application-table-wrap">
              <table className="application-table">
                <thead>
                  <tr>
                    <th className="selection-cell">
                      <input
                        type="checkbox"
                        aria-label="Select all visible applications"
                        checked={visible.every((a) => selected.has(a.id))}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? new Set(visible.map((a) => a.id))
                              : new Set(),
                          )
                        }
                      />
                    </th>
                    <th>Role & company</th>
                    <th>Stage</th>
                    <th>Skill match</th>
                    <th>Next step</th>
                    <th>Added</th>
                    <th>
                      <span className="sr-only">Open application</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a) => (
                    <tr
                      key={a.id}
                      className={selected.has(a.id) ? "selected" : ""}
                    >
                      <td className="selection-cell">
                        <input
                          type="checkbox"
                          aria-label={
                            "Select " +
                            a.title +
                            " at " +
                            (a.company || "company not added")
                          }
                          checked={selected.has(a.id)}
                          onChange={() =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(a.id)) next.delete(a.id);
                              else next.add(a.id);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td data-label="Role" className="role-cell">
                        <span className="company-mark" aria-hidden="true">
                          {(a.company || a.title)[0]?.toUpperCase()}
                        </span>
                        <div>
                          <Link
                            to={"/applications/" + a.id}
                            className="application-title"
                          >
                            {a.title}
                          </Link>
                          <span className="application-company">
                            {a.company || "Company not added"}
                          </span>
                        </div>
                      </td>
                      <td data-label="Stage">
                        <select
                          className="status-select"
                          aria-label={"Stage for " + a.title}
                          value={a.status}
                          disabled={bulkBusy || working.has(a.id)}
                          onChange={(e) =>
                            void moveApplication(a.id, Number(e.target.value))
                          }
                        >
                          {STATUS_META.map((s) => (
                            <option value={s.value} key={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label="Skill match">
                        {typeof a.fitPercentage === "number" ? (
                          <span
                            className={
                              "match-indicator " +
                              (a.fitPercentage >= 70
                                ? "strong"
                                : a.fitPercentage >= 40
                                  ? "moderate"
                                  : "")
                            }
                            title="How closely your skills match this role. This is not a hiring prediction."
                          >
                            <span className="match-track">
                              <span style={{ width: a.fitPercentage + "%" }} />
                            </span>
                            {a.fitPercentage}%
                          </span>
                        ) : (
                          <span className="subtle">Not scored yet</span>
                        )}
                      </td>
                      <td data-label="Next step" className="next-step-cell">
                        <Link
                          className="next-step-link"
                          to={"/applications/" + a.id}
                        >
                          {a.nextAction || "Add a next step"}
                        </Link>
                        {(a.followUpAt || a.nextDeadlineAt) && (
                          <small>
                            {a.followUpAt ? "Follow up " : "Due "}
                            {dateLabel(a.followUpAt || a.nextDeadlineAt)}
                          </small>
                        )}
                      </td>
                      <td data-label="Added" className="date-cell">
                        {dateLabel(a.appliedDate)}
                      </td>
                      <td className="open-cell">
                        <Link
                          to={"/applications/" + a.id}
                          className="row-open"
                          aria-label={"Open " + a.title}
                        >
                          <Icon name="chevron" size={18} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {applications !== null &&
          visible.length > 0 &&
          presentation === "board" && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={(event) => setActiveId(event.active.id)}
              onDragCancel={() => setActiveId(null)}
              onDragEnd={(event) => {
                setActiveId(null);
                if (event.over)
                  void moveApplication(event.active.id, event.over.id);
              }}
            >
              <p className="board-hint">
                Drag a card to update its stage. Open a card to view notes and
                next steps.
              </p>
              <div className="board-view">
                {columns.map((s) => (
                  <KanbanColumn
                    key={s.value}
                    meta={s}
                    applications={byStatus[s.value]}
                    onOpenApplication={(a) => navigate("/applications/" + a.id)}
                  />
                ))}
              </div>
              <DragOverlay>
                {activeApplication && (
                  <div className="app-card is-overlay">
                    <strong>{activeApplication.title}</strong>
                    <p>{activeApplication.company}</p>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        {visible.length > 0 && (
          <div className="collection-footer">
            {visible.length}{" "}
            {visible.length === 1 ? "application" : "applications"}
            {query || stage ? " matching your filters" : ""}
            <span>Open a role to view its details</span>
          </div>
        )}
      </section>
      <div className="secondary-tools">
        <FunnelSummary revision={applications} />
        <DataTools />
      </div>
    </Layout>
  );
}
