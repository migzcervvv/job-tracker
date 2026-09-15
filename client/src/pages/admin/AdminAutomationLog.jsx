import { useEffect, useMemo, useState } from "react";
import { Layout } from "../../components/Layout.jsx";
import { getAutomationLog } from "../../api/admin.js";
import { relativeTime } from "../../api/dates.js";
import { extractErrorMessage } from "../../api/errors.js";
import { notify } from "../../notify.js";

const STATUS_META = {
  triggered: { color: "var(--s-pending)", label: "Triggered" },
  succeeded: { color: "var(--s-interview)", label: "Succeeded" },
  failed: { color: "#e07a6f", label: "Failed" },
};

function dayLabel(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const startOf = (d) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(date)) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7)
    return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function timeOfDay(dateString) {
  return new Date(dateString).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminAutomationLog() {
  const [entries, setEntries] = useState(null);

  function refresh() {
    getAutomationLog(50)
      .then(setEntries)
      .catch((err) =>
        notify.error("Could not load automation log", extractErrorMessage(err)),
      );
  }

  useEffect(refresh, []);

  // Entries come back newest-first from the API — group consecutive
  // entries under the calendar day they fall on, preserving that order.
  const groups = useMemo(() => {
    if (!entries) return [];
    const map = new Map();
    for (const e of entries) {
      const label = dayLabel(e.createdAt);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(e);
    }
    return Array.from(map.entries());
  }, [entries]);

  return (
    <Layout
      title="Automation log"
      actions={
        <button className="icon-btn" onClick={refresh}>
          Refresh
        </button>
      }
    >
      {entries === null && <p style={{ color: "var(--text-dim)" }}>Loading…</p>}

      {entries !== null && entries.length === 0 && (
        <div className="panel">
          <p style={{ margin: 0, color: "var(--text-dim)" }}>
            No automation activity yet — this fills in once applications start
            triggering n8n.
          </p>
        </div>
      )}

      {entries !== null && entries.length > 0 && (
        <div className="log-view">
          {groups.map(([label, group]) => (
            <div className="log-day-group" key={label}>
              <div className="log-day-header">{label}</div>
              <div className="log-rows">
                {group.map((e) => {
                  const meta = STATUS_META[e.status] ?? {
                    color: "var(--text-dim)",
                    label: e.status,
                  };
                  return (
                    <div className="log-row" key={e.id}>
                      <span
                        className="log-time"
                        title={new Date(e.createdAt).toLocaleString()}
                      >
                        {timeOfDay(e.createdAt)}
                      </span>
                      <span
                        className="log-badge"
                        style={{ color: meta.color, borderColor: meta.color }}
                      >
                        {meta.label}
                      </span>
                      <span className="log-type">{e.type}</span>
                      <span className="log-message">
                        {e.applicationId
                          ? `${e.applicationId.slice(0, 8)} · `
                          : ""}
                        {e.message || "—"}
                      </span>
                      <span className="log-ago">
                        {relativeTime(e.createdAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
