import { useRef, useState } from "react";
import { uploadResume } from "../api/resumes.js";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";
import { Icon } from "./Icon.jsx";
export function ResumeUpload({ onUploaded }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function handleFile(file) {
    if (!file || busy) return;
    setError("");
    if (!/\.(pdf|docx?)$/i.test(file.name)) {
      setError("Choose a PDF or Word document (.pdf, .doc or .docx).");
      return;
    }
    if (file.size > 9500000) {
      setError("This file is too large. Choose a resume smaller than 9.5 MB.");
      return;
    }
    setBusy(true);
    try {
      const resume = await uploadResume(file);
      onUploaded(resume);
      notify.success(
        "Resume uploaded",
        "We’ll show any suggested skills here when they’re ready.",
      );
    } catch (err) {
      setError(
        extractErrorMessage(
          err,
          "Your resume couldn’t be uploaded. Please try again.",
        ),
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }
  return (
    <>
      <div
        className="upload-drop"
        aria-busy={busy}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void handleFile(event.dataTransfer.files?.[0]);
        }}
        style={
          dragOver
            ? {
                borderColor: "var(--accent)",
                background: "var(--panel-raised)",
              }
            : undefined
        }
      >
        <Icon name="upload" size={26} />
        <input
          ref={inputRef}
          id="resume-upload"
          type="file"
          accept=".pdf,.doc,.docx"
          disabled={busy}
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <strong>{busy ? "Uploading your resume…" : "Add a resume"}</strong>
        {busy ? (
          <span>Keep this page open until your upload finishes.</span>
        ) : (
          <span>
            Drop your file here or{" "}
            <label htmlFor="resume-upload">browse files</label>
          </span>
        )}
        <small className="upload-note">PDF or Word · Up to 9.5 MB</small>
      </div>
      {error && (
        <p className="error-line" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
