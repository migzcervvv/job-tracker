import { useRef, useState } from 'react';
import { uploadResume } from '../api/resumes.js';
import { extractErrorMessage } from '../api/errors.js';
import { notify } from '../notify.js';

const ACCEPTED = '.pdf,.doc,.docx';

export function ResumeUpload({ onUploaded }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file) {
    if (!file) return;
    try {
      const resume = await notify.promise(uploadResume(file), {
        loading: 'Uploading resume…',
        success: 'Resume uploaded',
        error: (err) => extractErrorMessage(err, 'Could not upload this file'),
      });
      onUploaded(resume);
    } catch {
      // toast already shown
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div
      className="upload-drop"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
      style={dragOver ? { borderColor: 'var(--accent)', color: 'var(--text)' } : undefined}
    >
      <input
        ref={inputRef}
        id="resume-upload"
        type="file"
        accept={ACCEPTED}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      Drag a PDF or Word doc here, or{' '}
      <label htmlFor="resume-upload">browse</label>
    </div>
  );
}
