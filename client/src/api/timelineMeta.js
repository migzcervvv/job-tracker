const LABELS = {
  created: "Application added",
  status_changed: "Stage updated",
  note: "Note added",
  email_matched: "Email linked",
  confirmation_received: "Confirmation received",
  edited: "Application details updated",
  stage_updated: "Stage details updated",
  automation: "Automatic processing",
  imported: "Application imported",
  followup_updated: "Follow-up updated",
  follow_up_updated: "Follow-up updated",
  employer_response: "Employer response recorded",
  response_received: "Employer response recorded",
  follow_up: "Follow-up updated",
};
export function eventLabel(type) {
  return LABELS[type] ?? "Application activity";
}
