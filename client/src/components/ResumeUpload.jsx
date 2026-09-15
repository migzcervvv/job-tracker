import { useRef, useState } from "react";
import { uploadResume } from "../api/resumes.js";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";

const ACCEPTED = ".pdf,.doc,.docx";

// Upload only. Does not wait on n8n and does not block the page — the
// resume list shows "Extracting…" immediately, and My skills below picks
// up the result once it's in, via SkillExtractionLog's own polling.
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
    <div
      className="upload-drop"
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
      style={
        dragOver
          ? { borderColor: "var(--accent)", color: "var(--text)" }
          : undefined
      }
    >
      <input
        ref={inputRef}
        id="resume-upload"
        type="file"
        accept={ACCEPTED}
        disabled={uploading}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {uploading ? (
        "Uploading…"
      ) : (
        <>
          Drag a resume here to upload, or{" "}
          <label htmlFor="resume-upload">browse</label>
        </>
      )}
    </div>
  );
}
