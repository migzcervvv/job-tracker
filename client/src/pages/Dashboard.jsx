import { useMemo, useState } from "react";
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
  const { applications, loadFailed, updateApplication } = useApplications();
  const navigate = useNavigate();
  const [view, setView] = useState("active");
  const [activeId, setActiveId] = useState(null);

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
    (applications ?? []).forEach((a) => {
      (map[a.status] ??= []).push(a);
    });
    return map;
  }, [applications]);

  const activeApplication =
    applications?.find((a) => a.id === activeId) ?? null;

  async function moveApplication(applicationId, newStatus) {
    const current = applications.find((a) => a.id === applicationId);
    if (!current || current.status === newStatus) return;

    const previousStatus = current.status;
    updateApplication(applicationId, { status: newStatus });

    try {
      await updateApplicationStatus(applicationId, newStatus);
      notify.success(`Moved to ${statusMeta(newStatus).label}`);
    } catch (err) {
      updateApplication(applicationId, { status: previousStatus });
      notify.error("Could not move the card", extractErrorMessage(err));
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
