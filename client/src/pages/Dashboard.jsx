import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { Layout } from '../components/Layout.jsx';
import { KanbanColumn } from '../components/KanbanColumn.jsx';
import { DetailModal } from '../components/DetailModal.jsx';
import { listApplications, updateApplicationStatus } from '../api/applications.js';
import { STATUS_META, statusMeta } from '../api/statusMeta.js';
import { extractErrorMessage } from '../api/errors.js';
import { notify } from '../notify.js';

const ACTIVE_STATUSES = STATUS_META.filter((s) => !s.terminal);
const CLOSED_STATUSES = STATUS_META.filter((s) => s.terminal);

export function Dashboard() {
  const [applications, setApplications] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [view, setView] = useState('active');
  const [activeId, setActiveId] = useState(null);
  const [openApplicationId, setOpenApplicationId] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  useEffect(() => {
    let cancelled = false;
    const pendingNew = location.state?.newApplication;

    listApplications()
      .then((data) => {
        if (cancelled) return;
        // If the just-created application isn't in this GET's result yet
        // (write-visibility lag from wherever it's coming from), show it
        // anyway — we already know it exists, we made it a second ago.
        if (pendingNew && !data.some((a) => a.id === pendingNew.id)) {
          setApplications([pendingNew, ...data]);
        } else {
          setApplications(data);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (pendingNew) {
          // Even a failed refresh shouldn't hide an application we know exists.
          setApplications([pendingNew]);
        } else {
          setLoadFailed(true);
          notify.error('Could not load the board', extractErrorMessage(err));
        }
      });

    // Clear the navigation state once consumed so it doesn't re-apply on a
    // later remount of this same history entry (e.g. browser back/forward).
    if (pendingNew) navigate('.', { replace: true, state: null });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = view === 'active' ? ACTIVE_STATUSES : CLOSED_STATUSES;

  const byStatus = useMemo(() => {
    const map = {};
    for (const s of STATUS_META) map[s.value] = [];
    (applications ?? []).forEach((a) => {
      (map[a.status] ??= []).push(a);
    });
    return map;
  }, [applications]);

  const activeApplication = applications?.find((a) => a.id === activeId) ?? null;
  // Derived from live state, not a snapshot — so the modal reflects a status
  // change immediately, whether it came from the dropdown or a drag.
  const openApplication = applications?.find((a) => a.id === openApplicationId) ?? null;

  async function moveApplication(applicationId, newStatus) {
    const current = applications.find((a) => a.id === applicationId);
    if (!current || current.status === newStatus) return;

    const previousStatus = current.status;

    setApplications((prev) =>
      prev.map((a) => (a.id === applicationId ? { ...a, status: newStatus } : a))
    );

    try {
      await updateApplicationStatus(applicationId, newStatus);
      notify.success(`Moved to ${statusMeta(newStatus).label}`);
    } catch (err) {
      setApplications((prev) =>
        prev.map((a) => (a.id === applicationId ? { ...a, status: previousStatus } : a))
      );
      notify.error('Could not move the card', extractErrorMessage(err));
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

  function handleApplicationDeleted(applicationId) {
    setApplications((prev) => prev.filter((a) => a.id !== applicationId));
  }

  return (
    <Layout
      title="Board"
      actions={
        <>
          <div className="view-toggle">
            <button
              className={view === 'active' ? 'active' : ''}
              onClick={() => setView('active')}
            >
              Active
            </button>
            <button
              className={view === 'closed' ? 'active' : ''}
              onClick={() => setView('closed')}
            >
              Closed
            </button>
          </div>
          <Link to="/applications/new" className="icon-btn" style={{ textDecoration: 'none' }}>
            New application
          </Link>
        </>
      }
    >
      {applications === null && !loadFailed && (
        <p style={{ color: 'var(--text-dim)' }}>Loading…</p>
      )}

      {loadFailed && (
        <div className="panel">
          <p style={{ margin: 0, color: 'var(--text-dim)' }}>
            The board couldn't load. Refresh to try again.
          </p>
        </div>
      )}

      {applications !== null && applications.length === 0 && (
        <div className="panel">
          <p style={{ margin: 0, color: 'var(--text-dim)' }}>
            No applications yet. <Link to="/applications/new">Paste your first job description</Link> to
            start the pipeline.
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
                onOpenApplication={(a) => setOpenApplicationId(a.id)}
              />
            ))}
          </div>

          <DragOverlay>
            {activeApplication && (
              <div className="app-card is-overlay">
                <div className="row-top">
                  <span className="title">{activeApplication.title}</span>
                </div>
                <div className="company">{activeApplication.company || 'No company set'}</div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <DetailModal
        application={openApplication}
        onClose={() => setOpenApplicationId(null)}
        onStatusChange={moveApplication}
        onDeleted={handleApplicationDeleted}
      />
    </Layout>
  );
}
