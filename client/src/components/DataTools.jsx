import { useState } from "react";
import { api } from "../api/client.js";
import { downloadData, parseCsv, toCsv } from "../api/portability.js";
import { useApplications } from "../state/ApplicationsContext.jsx";
import { extractErrorMessage } from "../api/errors.js";
export function DataTools() {
  const { applications, refresh } = useApplications();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function exportJson() {
    setBusy(true);
    try {
      const { data } = await api.get("/api/data/export");
      downloadData(
        "job-tracker.json",
        JSON.stringify(data, null, 2),
        "application/json",
      );
    } catch (error) {
      setMessage(extractErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      if (file.size > 5000000) throw new Error("Import limit is 5 MB");
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
        `${data.imported} applications imported; ${data.skipped} existing entries skipped.`,
      );
      await refresh();
    } catch (error) {
      setMessage(extractErrorMessage(error));
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
      <summary>Import, export and browser capture</summary>
      <p>
        JSON preserves applications, requirements, notes and stage details.
        Resume files require a separate backup. CSV includes posting fields and
        status. Imports are limited to 500 applications; JSON IDs make repeated
        imports idempotent.
      </p>
      <div className="stage-form-actions">
        <button
          className="icon-btn"
          disabled={busy}
          onClick={() => void exportJson()}
        >
          Export JSON
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
          Export CSV
        </button>
        <label>
          Import JSON / CSV{" "}
          <input
            type="file"
            accept=".json,.csv"
            disabled={busy}
            onChange={(event) => {
              void importFile(event.target.files[0]);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <p>
        Browser capture: create a bookmark with the following URL. Select
        posting text, then run the bookmark.
      </p>
      <textarea
        readOnly
        aria-label="Browser capture bookmark URL"
        value={bookmark}
      />
      {message && <p role="status">{message}</p>}
    </details>
  );
}
