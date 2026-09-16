import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { daysAgo } from '../api/dates.js';

// Deliberately coarse — a 3-band signal reads at a glance on a dense board,
// where an exact number would just be noise.
function fitTone(pct) {
  if (pct >= 70) return 'fit-high';
  if (pct >= 40) return 'fit-mid';
  return 'fit-low';
}

export function ApplicationCard({ application, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: application.id,
    data: { application },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  const fit = application.fitPercentage;

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
      <div className="row-bottom">
        <span className="company">{application.company || 'No company set'}</span>
        {typeof fit === 'number' && (
          <span className={`fit-badge ${fitTone(fit)}`} title="How many required skills you have">
            {fit}%
          </span>
        )}
      </div>
    </div>
  );
}
