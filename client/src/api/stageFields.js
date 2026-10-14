import { STATUS } from "./statusMeta.js";

export const STAGE_FIELDS = {
  [STATUS.Applied]: [
    {
      key: "source",
      label: "Source",
      type: "select",
      options: ["LinkedIn", "Company site", "Referral", "Job board", "Other"],
    },
    { key: "referral", label: "Came via referral", type: "checkbox" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  [STATUS.AssessmentPending]: [
    { key: "taskLink", label: "Task link", type: "url" },
    { key: "dueDate", label: "Due date", type: "date" },
    { key: "instructions", label: "Instructions", type: "textarea" },
  ],
  [STATUS.AssessmentSent]: [
    { key: "sentAt", label: "Sent on", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  [STATUS.InterviewScheduled]: [
    { key: "round", label: "Round", type: "number" },
    { key: "scheduledAt", label: "Date & time", type: "datetime-local" },
    { key: "meetLink", label: "Meeting link", type: "url" },
    { key: "interviewerNames", label: "Interviewer(s)", type: "text" },
    { key: "prepNotes", label: "Prep notes", type: "textarea" },
  ],
  [STATUS.Offered]: [
    { key: "salary", label: "Salary", type: "text" },
    { key: "benefits", label: "Benefits", type: "textarea" },
    { key: "deadline", label: "Decision deadline", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  [STATUS.Rejected]: [
    { key: "rejectedAt", label: "Date", type: "date" },
    { key: "feedback", label: "Feedback", type: "textarea" },
  ],
  [STATUS.OfferAccepted]: [
    { key: "decidedAt", label: "Decided on", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  [STATUS.OfferDeclined]: [
    { key: "decidedAt", label: "Decided on", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  // Withdrawn / Archived: no fields defined in the build guide — no form rendered.
};
