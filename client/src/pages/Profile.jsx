import { useEffect, useRef, useState } from "react";
import { ConnectionHelp } from "../components/ConnectionHelp.jsx";
import { Layout } from "../components/Layout.jsx";
import { getProfile, updateProfile, changePassword } from "../api/profile.js";
import { api } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";
export function Profile() {
  const { user, updateUser, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState("");
  const [preferences, setPreferences] = useState(null);
  const [password, setPassword] = useState({
    currentPassword: "",
    newPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [loadErrors, setLoadErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const accountLoaded = useRef(false);
  const preferencesLoaded = useRef(false);
  const [timeZones] = useState(() => [
    "UTC",
    ...(Intl.supportedValuesOf?.("timeZone") ?? [
      "Asia/Shanghai",
      "Europe/London",
      "America/New_York",
      "America/Los_Angeles",
    ]),
  ]);
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([
      accountLoaded.current ? Promise.resolve(null) : getProfile(),
      preferencesLoaded.current
        ? Promise.resolve(null)
        : api.get("/api/me/preferences"),
    ]).then(([account, prefs]) => {
      if (cancelled) return;
      const errors = [];
      if (!accountLoaded.current) {
        if (
          account.status === "fulfilled" &&
          typeof account.value?.email === "string"
        ) {
          setProfile(account.value);
          setEmail(account.value.email);
          accountLoaded.current = true;
        } else
          errors.push(
            "Account details: " + extractErrorMessage(account.reason),
          );
      }
      if (!preferencesLoaded.current) {
        if (
          prefs.status === "fulfilled" &&
          typeof prefs.value?.data?.timeZone === "string"
        ) {
          setPreferences(prefs.value.data);
          preferencesLoaded.current = true;
        } else
          errors.push(
            "Reminder settings: " + extractErrorMessage(prefs.reason),
          );
      }
      setLoadErrors(errors);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [revision]);
  async function save(event, action, success) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await action();
      setMessage(success);
    } catch (err) {
      setFailed(true);
      setMessage(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  const demo = user.role === "test";
  return (
    <Layout title="Account settings">
      {loadErrors.length > 0 && (
        <section className="notice-error" role="alert">
          <h3>Some account settings couldn’t load</h3>
          {loadErrors.map((text) => (
            <p key={text}>{text}</p>
          ))}
          <button
            className="icon-btn"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setRevision((value) => value + 1);
            }}
          >
            {loading ? "Retrying…" : "Try again"}
          </button>
          <ConnectionHelp />
        </section>
      )}
      {message && (
        <p
          className={failed ? "notice-error" : "notice-success"}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      {demo && (
        <p className="notice-info">
          You’re using a demo account. Your email and password cannot be
          changed.
        </p>
      )}
      {loading && <p role="status">Loading your account settings…</p>}
      <div className="settings-grid">
        {profile && (
          <>
            <form
              className="panel"
              onSubmit={(event) =>
                void save(
                  event,
                  async () => {
                    const data = await updateProfile(email);
                    updateUser({ email: data.email });
                  },
                  "Your email address has been updated.",
                )
              }
            >
              <h3>Your account</h3>
              <p>The email address you use to sign in.</p>
              <div className="field">
                <label htmlFor="profile-email">Email address</label>
                <input
                  id="profile-email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={busy || demo}
                />
              </div>
              <p className="field-hint">
                {profile.role === "admin"
                  ? "Administrator"
                  : demo
                    ? "Demo account"
                    : "Member"}
              </p>
              <button className="btn-save" disabled={busy || demo}>
                {busy ? "Saving…" : "Save email address"}
              </button>
            </form>
            <form
              className="panel"
              onSubmit={(event) =>
                void save(
                  event,
                  async () => {
                    await changePassword(
                      password.currentPassword,
                      password.newPassword,
                    );
                    notify.success(
                      "Password updated",
                      "Sign in again with your new password.",
                    );
                    logout();
                  },
                  "Your password has been updated.",
                )
              }
            >
              <h3>Password & security</h3>
              <p>Updating your password signs you out on all devices.</p>
              {["currentPassword", "newPassword"].map((key) => (
                <div className="field" key={key}>
                  <label htmlFor={key}>
                    {key === "currentPassword"
                      ? "Current password"
                      : "New password"}
                  </label>
                  <input
                    id={key}
                    type="password"
                    autoComplete={
                      key === "currentPassword"
                        ? "current-password"
                        : "new-password"
                    }
                    minLength={key === "newPassword" ? 10 : undefined}
                    required
                    value={password[key]}
                    onChange={(event) =>
                      setPassword((prev) => ({
                        ...prev,
                        [key]: event.target.value,
                      }))
                    }
                    disabled={busy || demo}
                  />
                  {key === "newPassword" && (
                    <small className="field-hint">
                      At least 10 characters, including uppercase, lowercase and
                      a number.
                    </small>
                  )}
                </div>
              ))}
              <button className="btn-save" disabled={busy || demo}>
                Update password
              </button>
            </form>
          </>
        )}
        {preferences && (
          <form
            className="panel"
            onSubmit={(event) =>
              void save(
                event,
                () => api.put("/api/me/preferences", preferences),
                "Your reminder preferences have been saved.",
              )
            }
          >
            <h3>Reminders & time zone</h3>
            <p>Choose which updates you’d like to receive by email.</p>
            {[
              [
                "remindersEnabled",
                "Application reminders",
                "Deadlines, follow-ups and applications to check in on.",
              ],
              [
                "weeklyDigestEnabled",
                "Weekly summary",
                "A weekly overview of your progress.",
              ],
            ].map(([key, title, hint]) => (
              <label className="preference-row" key={key}>
                <input
                  type="checkbox"
                  checked={preferences[key]}
                  disabled={busy}
                  onChange={(event) =>
                    setPreferences((prev) => ({
                      ...prev,
                      [key]: event.target.checked,
                    }))
                  }
                />
                <span>
                  <strong>{title}</strong>
                  <small>{hint}</small>
                </span>
              </label>
            ))}
            <div className="field">
              <label htmlFor="timezone">Time zone</label>
              <select
                id="timezone"
                value={preferences.timeZone}
                disabled={busy}
                onChange={(event) =>
                  setPreferences((prev) => ({
                    ...prev,
                    timeZone: event.target.value,
                  }))
                }
              >
                {[...new Set([preferences.timeZone, ...timeZones])].map(
                  (zone) => (
                    <option key={zone} value={zone}>
                      {zone.replaceAll("_", " ").replaceAll("/", " / ")}
                    </option>
                  ),
                )}
              </select>
              <small className="field-hint">
                Used for date-only deadlines. Email delivery depends on your
                workspace’s reminder service.
              </small>
            </div>
            <button className="btn-save" disabled={busy}>
              {busy ? "Saving…" : "Save preferences"}
            </button>
          </form>
        )}
      </div>
    </Layout>
  );
}
