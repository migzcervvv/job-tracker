import { useRef, useState } from "react";
import { uploadResume } from "../api/resumes.js";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";

const ACCEPTED = ".pdf,.doc,.docx";

// Upload only — no waiting on n8n here. It sits as the first tile in the
// resume rack, so adding a resume reads as "add another document" rather
// than a separate, disconnected form.
export function ResumeUpload({ onUploaded }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      await uploadResume(file);
      notify.success(
        "Resume uploaded",
        "Extracting skills in the background — check My skills shortly.",
      );
      onUploaded?.();
    } catch (err) {
      notify.error("Could not upload this file", extractErrorMessage(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <label
      htmlFor="resume-upload"
      className={[
        "resume-upload-tile",
        dragOver && "is-drag-over",
        uploading && "is-uploading",
      ]
        .filter(Boolean)
        .join(" ")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={inputRef}
        id="resume-upload"
        type="file"
        accept={ACCEPTED}
        disabled={uploading}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <span className="resume-upload-mark" aria-hidden="true">
        {uploading ? "…" : "+"}
      </span>
      <span className="resume-upload-label">
        {uploading ? "Uploading" : "Add resume"}
      </span>
      <span className="resume-upload-hint">PDF, DOC, or DOCX · drag or browse</span>
    </label>
  );
}
