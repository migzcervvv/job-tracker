import { useCallback, useEffect, useState } from "react";
import { Layout } from "../../components/Layout.jsx";
import { getAutomationLog, retryAutomation } from "../../api/admin.js";
import { extractErrorMessage } from "../../api/errors.js";
export function AdminAutomationLog() {
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState("");
  const [auto, setAuto] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState(Date.now);
  const refresh = useCallback(async () => {
    setEntries(await getAutomationLog(200));
    setCheckedAt(Date.now());
  }, []);
  useEffect(() => {
    let cancelled = false;
    let timer;
    async function tick() {
      try {
        const rows = await getAutomationLog(200);
        if (!cancelled) {
          setEntries(rows);
          setCheckedAt(Date.now());
        }
      } catch (err) {
        if (!cancelled) setMessage(extractErrorMessage(err));
      }
      if (auto && !cancelled) timer = setTimeout(tick, 15000);
    }
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [auto]);
  async function retry(id) {
    setBusy(true);
    try {
      await retryAutomation(id);
      await refresh();
    } catch (err) {
      setMessage(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  const pending = entries.filter(
    (run) => !["succeeded", "failed", "cancelled"].includes(run.status),
  );
  return (
    <Layout title="Automation runs">
      <div className="panel">
        <p>
          {pending.length} pending ·{" "}
          {entries.filter((run) => run.status === "failed").length} failed ·
          oldest pending{" "}
          {Math.round(
            Math.max(
              0,
              ...pending.map(
                (run) => (checkedAt - Date.parse(run.createdAt)) / 60000,
              ),
            ),
          )}{" "}
          minutes
        </p>
        <label>
          Auto refresh{" "}
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
        </label>
        <select
          aria-label="Run state"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All states</option>
          {[
            "queued",
            "dispatching",
            "dispatched",
            "running",
            "succeeded",
            "failed",
            "cancelled",
          ].map((state) => (
            <option key={state}>{state}</option>
          ))}
        </select>
        <button
          className="icon-btn"
          onClick={() =>
            void refresh().catch((err) => setMessage(extractErrorMessage(err)))
          }
        >
          Refresh
        </button>
        {message && <p role="alert">{message}</p>}
      </div>
      {entries
        .filter((run) => !filter || run.status === filter)
        .map((run) => (
          <div className="panel" key={run.id}>
            <p>
              {run.type} · {run.status} · {run.attempts} attempts ·{" "}
              {Math.max(
                0,
                Math.round(
                  (Date.parse(run.updatedAt) - Date.parse(run.createdAt)) /
                    1000,
                ),
              )}
              s elapsed
            </p>
            <code>{run.id}</code>
            <p>{run.message}</p>
            {["failed", "cancelled"].includes(run.status) && (
              <button
                className="icon-btn"
                disabled={busy}
                onClick={() => void retry(run.id)}
              >
                Retry current resource
              </button>
            )}
          </div>
        ))}
    </Layout>
  );
}
