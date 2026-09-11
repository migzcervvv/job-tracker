const LABELS = {
  created: 'Application created',
  status_changed: 'Status changed',
  note: 'Note added',
  email_matched: 'Email matched',
  confirmation_received: 'Confirmation received',
};

export function eventLabel(type) {
  return LABELS[type] ?? type;
}
