import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { daysAgo } from '../api/dates.js';

export function ApplicationCard({ application, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: application.id,
    data: { application },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`app-card${isDragging ? ' is-dragging' : ''}`}
      onClick={() => onOpen(application)}
    >
      <div className="row-top">
        <span className="title">{application.title}</span>
        <span className="age">{daysAgo(application.appliedDate)}</span>
      </div>
      <div className="company">{application.company || 'No company set'}</div>
    </div>
  );
}
