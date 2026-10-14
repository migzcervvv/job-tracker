import { useMemo, useRef, useState } from "react";
import { DataTools } from "../components/DataTools.jsx";
import { FunnelSummary } from "../components/FunnelSummary.jsx";
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
import { KanbanColumn } from "../components/KanbanColumn.jsx";
import { updateApplicationStatus } from "../api/applications.js";
import { STATUS_META, statusMeta } from "../api/statusMeta.js";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";
import { useApplications } from "../state/ApplicationsContext.jsx";

const ACTIVE_STATUSES = STATUS_META.filter((s) => !s.terminal);
const CLOSED_STATUSES = STATUS_META.filter((s) => s.terminal);

export function Dashboard() {
  const { applications, loadFailed, updateApplication, refresh } =
    useApplications();
  const navigate = useNavigate();
  const [view, setView] = useState("active");
  const [activeId, setActiveId] = useState(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("date");
  const [stage, setStage] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [undo, setUndo] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const pending = useRef(new Set());

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  const columns = view === "active" ? ACTIVE_STATUSES : CLOSED_STATUSES;

  const byStatus = useMemo(() => {
    const map = {};
    for (const s of STATUS_META) map[s.value] = [];
    const filtered = (applications ?? []).filter(
      (a) =>
        (!stage || a.status === Number(stage)) &&
        (a.title + " " + a.company).toLowerCase().includes(query.toLowerCase()),
    );
    filtered.sort((a, b) =>
      sort === "fit"
        ? (b.fitPercentage ?? -1) - (a.fitPercentage ?? -1)
        : sort === "company"
          ? a.company.localeCompare(b.company)
          : sort === "followup"
            ? (a.followUpAt ? Date.parse(a.followUpAt) : Infinity) -
              (b.followUpAt ? Date.parse(b.followUpAt) : Infinity)
            : sort === "deadline"
              ? (a.nextDeadlineAt ? Date.parse(a.nextDeadlineAt) : Infinity) -
                (b.nextDeadlineAt ? Date.parse(b.nextDeadlineAt) : Infinity)
              : Date.parse(b.appliedDate) - Date.parse(a.appliedDate),
    );
    filtered.forEach((a) => {
      (map[a.status] ??= []).push(a);
    });
    return map;
  }, [applications, query, sort, stage]);

  const activeApplication =
    applications?.find((a) => a.id === activeId) ?? null;

  async function moveApplication(applicationId, newStatus) {
    const current = applications.find((a) => a.id === applicationId);
    if (
      !current ||
      current.status === newStatus ||
      pending.current.has(applicationId)
    )
      return;
    pending.current.add(applicationId);

    try {
      const fresh = await updateApplicationStatus(
        applicationId,
        newStatus,
        current.version,
      );
      updateApplication(applicationId, fresh);
      notify.success(`Moved to ${statusMeta(newStatus).label}`);
    } catch (err) {
      notify.error("Could not move the card", extractErrorMessage(err));
      if (err.response?.status === 409) await refresh();
    } finally {
      pending.current.delete(applicationId);
    }
  }

  async function bulkArchive(restore = false) {
    setBulkBusy(true);
    const completed = [];
    try {
      const rows = restore
        ? undo
        : (applications ?? []).filter((a) => selected.has(a.id));
      for (const row of rows) {
        const current = applications.find((a) => a.id === row.id);
        if (!current || pending.current.has(row.id)) continue;
        pending.current.add(row.id);
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
          pending.current.delete(row.id);
        }
      }
    } catch (error) {
      notify.error("Bulk update stopped", extractErrorMessage(error));
      await refresh();
    } finally {
      setUndo(restore ? [] : completed);
      setSelected(new Set());
      setBulkBusy(false);
    }
  }

  function handleDragStart(event) {
    setActiveId(event.active.id);
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    moveApplication(active.id, over.id);
  }

  return (
    <Layout
      title="Board"
      actions={
        <>
          <div className="view-toggle">
            <button
              className={view === "active" ? "active" : ""}
              onClick={() => setView("active")}
            >
              Active
            </button>
            <button
              className={view === "closed" ? "active" : ""}
              onClick={() => setView("closed")}
            >
              Closed
            </button>
          </div>
          <Link
            to="/applications/new"
            className="icon-btn"
            style={{ textDecoration: "none" }}
          >
            New application
          </Link>
        </>
      }
    >
      <div className="panel">
        <div className="stage-form-actions">
          <input
            aria-label="Search company or title"
            placeholder="Search company or title"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Filter stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            <option value="">All stages</option>
            {STATUS_META.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort board"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="date">Newest / age</option>
            <option value="company">Company</option>
            <option value="fit">Highest fit</option>
            <option value="followup">Follow-up date</option>
            <option value="deadline">Deadline</option>
          </select>
        </div>
        <details>
          <summary>Bulk archive</summary>
          {Object.values(byStatus)
            .flat()
            .map((a) => (
              <label key={a.id} style={{ display: "block" }}>
                <input
                  type="checkbox"
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
                {a.title} · {a.company}
              </label>
            ))}
          <button
            className="icon-btn"
            disabled={bulkBusy || !selected.size}
            onClick={() => void bulkArchive()}
          >
            Archive selected
          </button>
          <button
            className="icon-btn"
            disabled={bulkBusy || !undo.length}
            onClick={() => void bulkArchive(true)}
          >
            Undo archive
          </button>
        </details>
      </div>
      <DataTools />
      <FunnelSummary revision={applications} />
      {applications === null && !loadFailed && (
        <p style={{ color: "var(--text-dim)" }}>Loading…</p>
      )}

      {loadFailed && (
        <div className="panel">
          <p style={{ margin: 0, color: "var(--text-dim)" }}>
            The board couldn't load. Refresh to try again.
          </p>
        </div>
      )}

      {applications !== null && applications.length === 0 && (
        <div className="panel">
          <p style={{ margin: 0, color: "var(--text-dim)" }}>
            No applications yet.{" "}
            <Link to="/applications/new">Paste your first job description</Link>{" "}
            to start the pipeline.
          </p>
        </div>
      )}

      {applications !== null && applications.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="board-view">
            {columns.map((s) => (
              <KanbanColumn
                key={s.value}
                meta={s}
                applications={byStatus[s.value]}
                onOpenApplication={(a) => navigate(`/applications/${a.id}`)}
              />
            ))}
          </div>

          <DragOverlay>
            {activeApplication && (
              <div className="app-card is-overlay">
                <div className="row-top">
                  <span className="title">{activeApplication.title}</span>
                </div>
                <div className="company">
                  {activeApplication.company || "No company set"}
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </Layout>
  );
}
