import { useDroppable } from '@dnd-kit/core';
import { AnimatePresence, motion } from 'framer-motion';
import { ApplicationCard } from './ApplicationCard.jsx';

export function KanbanColumn({ meta, applications, onOpenApplication }) {
  const { setNodeRef, isOver } = useDroppable({ id: meta.value });

  return (
    <div ref={setNodeRef} className={`kanban-col${isOver ? ' is-over' : ''}`}>
      <div className="kanban-col-head">
        <span className="tick" style={{ background: meta.color }} />
        <span className="name">{meta.label}</span>
        <span className="n">{applications.length}</span>
      </div>
      <div className="kanban-col-body">
        {applications.length === 0 && <div className="kanban-empty">Empty</div>}
        <AnimatePresence initial={false}>
          {applications.map((a) => (
            <motion.div
              key={a.id}
              layout
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.16 }}
            >
              <ApplicationCard application={a} onOpen={onOpenApplication} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
