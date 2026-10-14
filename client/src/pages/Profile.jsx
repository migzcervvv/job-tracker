import { useEffect, useState } from "react";
import { Layout } from "../components/Layout.jsx";
import { getProfile, updateProfile, changePassword } from "../api/profile.js";
import { api } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { extractErrorMessage } from "../api/errors.js";
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
  useEffect(() => {
    let cancelled = false;
    void Promise.all([getProfile(), api.get("/api/me/preferences")])
      .then(([data, prefs]) => {
        if (!cancelled) {
          setProfile(data);
          setEmail(data.email);
          setPreferences(prefs.data);
        }
      })
      .catch((err) => {
        if (!cancelled) setMessage(extractErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function save(event, action) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage("Saved");
    } catch (err) {
      setMessage(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Layout title="Profile">
      {message && <p role="status">{message}</p>}
      {profile && (
        <>
          <form
            className="panel"
            onSubmit={(event) =>
              void save(event, async () => {
                const data = await updateProfile(email);
                updateUser({ email: data.email });
              })
            }
          >
            <h3>Account</h3>
            <div className="field">
              <label htmlFor="profile-email">Email</label>
              <input
                id="profile-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy || user.role === "test"}
              />
            </div>
            <p>{profile.role}</p>
            <button
              className="btn-save"
              disabled={busy || user.role === "test"}
            >
              Save email
            </button>
          </form>
          <form
            className="panel"
            onSubmit={(event) =>
              void save(event, async () => {
                await changePassword(
                  password.currentPassword,
                  password.newPassword,
                );
                logout();
              })
            }
          >
            <h3>Change password</h3>
            {["currentPassword", "newPassword"].map((key) => (
              <div className="field" key={key}>
                <label htmlFor={key}>
                  {key === "currentPassword"
                    ? "Current password"
                    : "New password: at least 10 characters, uppercase, lowercase and a digit"}
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
                  disabled={busy || user.role === "test"}
                />
              </div>
            ))}
            <button
              className="btn-save"
              disabled={busy || user.role === "test"}
            >
              Change password and sign out
            </button>
          </form>
        </>
      )}
      {preferences && (
        <form
          className="panel"
          onSubmit={(event) =>
            void save(event, () => api.put("/api/me/preferences", preferences))
          }
        >
          <h3>Email reminders</h3>
          <p>
            Delivery requires the n8n notification workflow and email
            credentials.
          </p>
          {["remindersEnabled", "weeklyDigestEnabled"].map((key) => (
            <p key={key}>
              <label>
                <input
                  type="checkbox"
                  checked={preferences[key]}
                  onChange={(event) =>
                    setPreferences((prev) => ({
                      ...prev,
                      [key]: event.target.checked,
                    }))
                  }
                />
                {key === "remindersEnabled"
                  ? "Deadline, follow-up and stale reminders"
                  : "Weekly digest"}
              </label>
            </p>
          ))}
          <div className="field">
            <label htmlFor="timezone">
              Timezone (IANA name, such as Asia/Shanghai)
            </label>
            <input
              id="timezone"
              required
              value={preferences.timeZone}
              onChange={(event) =>
                setPreferences((prev) => ({
                  ...prev,
                  timeZone: event.target.value,
                }))
              }
            />
          </div>
          <button className="btn-save" disabled={busy}>
            Save preferences
          </button>
        </form>
      )}
    </Layout>
  );
}
