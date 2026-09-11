export const STATUS = {
  Applied: 0,
  AssessmentPending: 1,
  AssessmentSent: 2,
  InterviewScheduled: 3,
  Offered: 4,
  Rejected: 5,
  OfferAccepted: 6,
  OfferDeclined: 7,
  Withdrawn: 8,
  Archived: 9,
};

// Order matters — this is display order on the board rail.
export const STATUS_META = [
  { value: STATUS.Applied, label: 'Applied', color: 'var(--s-applied)', terminal: false },
  { value: STATUS.AssessmentPending, label: 'Assessment pending', color: 'var(--s-pending)', terminal: false },
  { value: STATUS.AssessmentSent, label: 'Assessment sent', color: 'var(--s-sent)', terminal: false },
  { value: STATUS.InterviewScheduled, label: 'Interview scheduled', color: 'var(--s-interview)', terminal: false },
  { value: STATUS.Offered, label: 'Offered', color: 'var(--s-offered)', terminal: false },
  { value: STATUS.Rejected, label: 'Rejected', color: 'var(--s-closed)', terminal: true },
  { value: STATUS.OfferAccepted, label: 'Offer accepted', color: 'var(--s-closed)', terminal: true },
  { value: STATUS.OfferDeclined, label: 'Offer declined', color: 'var(--s-closed)', terminal: true },
  { value: STATUS.Withdrawn, label: 'Withdrawn', color: 'var(--s-closed)', terminal: true },
  { value: STATUS.Archived, label: 'Archived', color: 'var(--s-closed)', terminal: true },
];

export function statusMeta(value) {
  return STATUS_META.find((s) => s.value === value) ?? STATUS_META[0];
}
