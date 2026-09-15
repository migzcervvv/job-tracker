// Shared between ResumeCard and SkillExtractionLog so the two views of
// the same status (on the document itself, and in the activity log)
// never drift out of sync with each other.
export const EXTRACTION_STATUS_META = {
  triggered: { color: "var(--s-pending)", label: "Extracting…" },
  succeeded: { color: "var(--s-interview)", label: "Extracted" },
  failed: { color: "#e07a6f", label: "Failed" },
};
