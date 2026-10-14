import { useState } from "react";
import { api } from "../api/client.js";
import { downloadData, parseCsv, toCsv } from "../api/portability.js";
import { useApplications } from "../state/ApplicationsContext.jsx";
import { extractErrorMessage } from "../api/errors.js";
export function DataTools() {
  const { applications, refresh } = useApplications();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function exportJson() {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const { data } = await api.get("/api/data/export");
      downloadData(
        "job-tracker.json",
        JSON.stringify(data, null, 2),
        "application/json",
      );
      setMessage("Your application backup is ready to download.");
    } catch (error) {
      setFailed(true);
      setMessage(extractErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      if (file.size > 5000000) {
        setFailed(true);
        setMessage("Choose a backup or CSV file smaller than 5 MB.");
        return;
      }
      const text = await file.text();
      const input = file.name.toLowerCase().endsWith(".csv")
        ? {
            schemaVersion: 1,
            applications: parseCsv(text).map((application) => ({
              application,
            })),
          }
        : JSON.parse(text);
      const { data } = await api.post("/api/data/import", input);
      setMessage(
        data.imported +
          " " +
          (data.imported === 1 ? "application added" : "applications added") +
          (data.skipped
            ? ". " + data.skipped + " already in your account and skipped."
            : "."),
      );
      await refresh();
    } catch (error) {
      setFailed(true);
      setMessage(
        extractErrorMessage(
          error,
          "This file couldn’t be imported. Check that it is a Job Tracker backup or a CSV with the required columns.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const bookmark =
    "javascript:(()=>{const q=new URLSearchParams({title:document.title,url:location.href,description:getSelection().toString()});window.open('" +
    location.origin +
    "/applications/new?'+q,'_blank','noopener');})()";
  return (
    <details className="panel">
      <summary>Import, export & save from your browser</summary>
      <p>
        Keep a backup of your applications or bring in records you already have.
      </p>
      <div className="stage-form-actions">
        <button
          className="icon-btn"
          disabled={busy}
          onClick={() => void exportJson()}
        >
          Download backup
        </button>
        <button
          className="icon-btn"
          disabled={busy}
          onClick={() =>
            downloadData(
              "job-tracker.csv",
              toCsv(applications ?? []),
              "text/csv",
            )
          }
        >
          Download spreadsheet (CSV)
        </button>
      </div>
      <div className="field" style={{ marginTop: 20 }}>
        <label htmlFor="import-applications">Import applications</label>
        <input
          id="import-applications"
          type="file"
          accept=".json,.csv"
          disabled={busy}
          onChange={(event) => {
            void importFile(event.target.files[0]);
            event.target.value = "";
          }}
        />
        <small className="field-hint">
          Job Tracker JSON backup or CSV · Up to 500 applications and 5 MB
        </small>
      </div>
      <details>
        <summary>What’s included in a backup?</summary>
        <p>
          JSON includes applications, job skills, stage details and notes.
          Resume files need to be saved separately. CSV includes the main
          application fields. Reimporting a JSON backup skips records already in
          your account.
        </p>
      </details>
      <details style={{ marginTop: 18 }}>
        <summary>Save a job from another website</summary>
        <p>
          Create a browser bookmark and paste the address below into its URL
          field. On a job posting, select its description and open the bookmark.
          You’ll get a new draft to review before saving.
        </p>
        <label className="field-hint" htmlFor="browser-bookmark">
          Bookmark address
        </label>
        <textarea
          id="browser-bookmark"
          readOnly
          aria-label="Browser capture bookmark URL"
          value={bookmark}
          onFocus={(event) => event.target.select()}
        />
      </details>
      {message && (
        <p
          style={{ marginTop: 18 }}
          className={failed ? "notice-error" : "notice-success"}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </details>
  );
}
