import { useState } from "react";
import { EXTRACTION_STATUS_META } from "../api/extractionStatusMeta.js";
import { formatBytes } from "../api/format.js";
import { relativeTime } from "../api/dates.js";

const EXT_LABELS = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
};

export function ResumeCard({ resume, onPreview, onDownload, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const ext = EXT_LABELS[resume.contentType] ?? "FILE";
  const meta = resume.extractionStatus
    ? EXTRACTION_STATUS_META[resume.extractionStatus]
    : null;
  const needsReview =
    resume.extractionStatus === "succeeded" && resume.proposedSkillCount > 0;

  return (
    <div
      className="resume-card"
      style={{ borderLeftColor: meta?.color ?? "var(--line)" }}
    >
      <div className="resume-card-top">
        <span className="resume-card-ext">{ext}</span>
        {!confirming && (
          <button
            type="button"
            className="resume-card-delete"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${resume.fileName}`}
            title="Delete"
          >
            ✕
          </button>
        )}
      </div>

      <div className="resume-card-name" title={resume.fileName}>
        {resume.fileName}
      </div>
      <div className="resume-card-meta">
        {formatBytes(resume.sizeBytes)} · {relativeTime(resume.createdAt)}
      </div>

      {meta && !confirming && (
        <div className="resume-card-status" style={{ color: meta.color }}>
          <span className="dot" style={{ background: meta.color }} />
          {meta.label}
        </div>
      )}

      {needsReview && !confirming && (
        <a className="resume-card-review-link" href="#skills">
          {resume.proposedSkillCount} skill
          {resume.proposedSkillCount === 1 ? "" : "s"} ready to review
        </a>
      )}

      {confirming ? (
        <div className="resume-card-confirm">
          <span>Delete this resume?</span>
          <div className="resume-card-confirm-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => onDelete(resume.id)}
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="resume-card-actions">
          <button type="button" className="icon-btn" onClick={() => onPreview(resume)}>
            Preview
          </button>
          <button type="button" className="icon-btn" onClick={() => onDownload(resume.id)}>
            Download
          </button>
        </div>
      )}
    </div>
  );
}
