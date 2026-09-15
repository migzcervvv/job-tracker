import { useEffect, useState } from "react";
import { getResumeDownloadUrl } from "../api/resumes.js";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";

// Preview is view-only, in an iframe, using a freshly signed URL. Only PDFs
// render inline in a browser reliably — Word docs fall back to a plain
// message plus the same Download action.
export function ResumePreviewModal({ resume, onClose }) {
  const [link, setLink] = useState(null);

  useEffect(() => {
    if (!resume) return;
    let cancelled = false;
    setLink(null);
    getResumeDownloadUrl(resume.id)
      .then((data) => {
        if (!cancelled) setLink(data);
      })
      .catch((err) => {
        if (cancelled) return;
        notify.error("Could not open resume", extractErrorMessage(err));
        onClose?.();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume?.id]);

  if (!resume) return null;

  const isPdf = (link?.contentType || resume.contentType) === "application/pdf";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel resume-preview-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 style={{ fontSize: 16 }}>{resume.fileName}</h2>
            <div className="sub">Preview</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="resume-preview-body">
          {!link && <p style={{ color: "var(--text-dim)" }}>Loading…</p>}

          {link && isPdf && (
            <iframe
              title={resume.fileName}
              src={link.url}
              className="resume-preview-frame"
            />
          )}

          {link && !isPdf && (
            <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
              Preview isn't available for Word documents — download it to
              view.
            </p>
          )}
        </div>

        <div className="resume-modal-actions" style={{ padding: "12px 24px" }}>
          <button className="icon-btn" onClick={onClose}>
            Close
          </button>
          {link && (
            <a
              className="btn-primary"
              style={{ width: "auto", textDecoration: "none", textAlign: "center" }}
              href={link.url}
              download={resume.fileName}
              target="_blank"
              rel="noreferrer"
            >
              Download
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
