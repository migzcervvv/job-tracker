import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/Layout.jsx";
import { getPipelineAlerts } from "../api/analytics.js";
import { extractErrorMessage } from "../api/errors.js";

function AlertList({ title, hint, items, emptyText, unit }) {
  return (
    <div className="panel alert-panel">
      <div className="section-label" style={{ marginBottom: 4 }}>
        {title}
      </div>
      <p className="alert-hint">{hint}</p>

      {items.length === 0 ? (
        <p className="alert-empty">{emptyText}</p>
      ) : (
        <ul className="alert-list">
          {items.map((a) => (
            <li
              className="alert-row"
              key={a.id + ":" + (a.stageDetailId ?? a.kind ?? "alert")}
            >
              <div className="alert-row-main">
                <Link className="alert-title" to={`/applications/${a.id}`}>
                  {a.title}
                </Link>
                <span className="alert-company">
                  {a.company || "No company set"}
                </span>
              </div>
              <span className="alert-age">
                {a.dueAt
                  ? new Date(a.dueAt).toLocaleString()
                  : a.followUpAt
                    ? new Date(a.followUpAt).toLocaleString()
                    : (a.daysSinceActivity ?? a.daysSinceApplied)}
                {unit}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Alerts() {
  const [data, setData] = useState(null);
  const [staleDays, setStaleDays] = useState(7);
  const [noReplyDays, setNoReplyDays] = useState(60);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPipelineAlerts({ staleDays, noReplyDays })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(extractErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [staleDays, noReplyDays, attempt]);

  return (
    <Layout title="Next actions">
      <p
        style={{
          color: "var(--text-dim)",
          fontSize: 13,
          marginTop: 0,
          marginBottom: 20,
          maxWidth: 640,
        }}
      >
        Focus on the applications that need your attention. Completed and
        saved-for-later roles are left out of these reminders.
      </p>

      {error && (
        <div className="notice-error" role="alert">
          {error}{" "}
          <button
            className="icon-btn"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      )}
      {data === null && !error && (
        <p role="status">Loading your next actions…</p>
      )}

      {data !== null && (
        <>
          <div className="stat-strip">
            <div className="stat-card">
              <div className="stat-value">{data.appliedThisWeek}</div>
              <div className="stat-label">Applications sent this week</div>
            </div>
            <div className="stat-card">
              <div
                className="stat-value"
                style={{
                  color: data.stale.length > 0 ? "var(--s-pending)" : undefined,
                }}
              >
                {data.stale.length}
              </div>
              <div className="stat-label">
                {staleDays}+ days without an update
              </div>
            </div>
            <div className="stat-card">
              <div
                className="stat-value"
                style={{
                  color: data.noReply.length > 0 ? "var(--danger)" : undefined,
                }}
              >
                {data.noReply.length}
              </div>
              <div className="stat-label">
                {noReplyDays}+ days waiting for a reply
              </div>
            </div>
          </div>

          <div className="threshold-row">
            <label>
              Remind me after no activity for
              <select
                value={staleDays}
                onChange={(e) => setStaleDays(Number(e.target.value))}
              >
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </label>
            <label>
              No reply after
              <select
                value={noReplyDays}
                onChange={(e) => setNoReplyDays(Number(e.target.value))}
              >
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>
          </div>

          <div className="alert-grid">
            <AlertList
              title="Deadlines"
              hint="Assessment, interview and offer deadlines within a day, including overdue deadlines from the past week."
              items={data.deadlines ?? []}
              emptyText="No deadlines due."
              unit=""
            />
            <AlertList
              title="Follow-ups due"
              hint="Next actions ready for follow-up."
              items={data.followUps ?? []}
              emptyText="No follow-ups due."
              unit=""
            />
            <AlertList
              title="Time to check in"
              hint="Applications you haven’t updated recently."
              items={data.stale}
              emptyText="You’re up to date. No applications need a check-in."
              unit=" days"
            />
            <AlertList
              title="Waiting for a reply"
              hint="Applications with no employer response recorded. Mark a reply in the application’s next-step section."
              items={data.noReply}
              emptyText="No applications have been waiting this long."
              unit=" days"
            />
          </div>
        </>
      )}
    </Layout>
  );
}
