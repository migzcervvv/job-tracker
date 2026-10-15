import { useRef, useState } from "react";
import { api } from "../api/client.js";
import { downloadData, parseCsv, toCsv } from "../api/portability.js";
import { useApplications } from "../state/ApplicationsContext.jsx";
import { extractErrorMessage } from "../api/errors.js";
export function DataTools() {
  const { applications, refresh } = useApplications();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [bookmarkMessage, setBookmarkMessage] = useState("");
  const bookmarkField = useRef(null);
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
  async function copyBookmark() {
    try {
      await navigator.clipboard.writeText(bookmark);
      setBookmarkMessage(
        "Copied. Paste this into your bookmark’s URL or Address field, then save the bookmark.",
      );
    } catch {
      bookmarkField.current?.focus();
      bookmarkField.current?.select();
      setBookmarkMessage(
        "Automatic copying is unavailable. The text below is selected. Copy it using your browser’s Copy command, then paste it into your bookmark’s URL or Address field.",
      );
    }
  }
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
          Add a shortcut to your browser’s bookmarks so you can bring a job
          posting into Job Tracker without copying each field separately. Set it
          up in the browser you use to look for jobs.
        </p>
        <h3>Set up the shortcut once</h3>
        <ol>
          <li>
            Create a bookmark for this page using the star in your browser’s
            address bar or its Bookmarks menu.
          </li>
          <li>
            Name the bookmark <strong>Save to Job Tracker</strong> and save it.
            Keep it in your bookmarks bar so it is easy to find.
          </li>
          <li>
            Click <strong>Copy shortcut address</strong> below.
          </li>
          <li>
            Find the bookmark you just saved. Right-click it and choose{" "}
            <strong>Edit</strong>. On some browsers, use the Bookmarks menu to
            edit it.
          </li>
          <li>
            Replace everything in its <strong>URL</strong> or{" "}
            <strong>Address</strong> field with the copied text, then save your
            changes. Paste into the bookmark’s settings, not the address bar at
            the top of your browser.
          </li>
        </ol>
        <button
          type="button"
          className="icon-btn"
          onClick={() => void copyBookmark()}
        >
          Copy shortcut address
        </button>
        {bookmarkMessage && (
          <p className="field-hint" role="status">
            {bookmarkMessage}
          </p>
        )}
        <label className="field-hint" htmlFor="browser-bookmark">
          Shortcut address — copy all of this text if the button does not work
        </label>
        <textarea
          id="browser-bookmark"
          ref={bookmarkField}
          readOnly
          value={bookmark}
          onFocus={(event) => event.target.select()}
        />
        <h3>Use it when you find a job</h3>
        <ol>
          <li>Open the job posting on the other website.</li>
          <li>
            Highlight the job description you want to bring into Job Tracker.
          </li>
          <li>
            Click your <strong>Save to Job Tracker</strong> bookmark while you
            are still on the job posting.
          </li>
          <li>
            Job Tracker opens in a new tab with the page title, posting link,
            and highlighted description filled in. Review the title, add any
            missing details such as the company, then save the application.
          </li>
        </ol>
        <p className="field-hint">
          Nothing is saved until you review the form and save it. If the
          description is blank, return to the job posting, highlight its
          description, and click the bookmark again. If no new tab opens, check
          whether your browser blocked a pop-up.
        </p>
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
