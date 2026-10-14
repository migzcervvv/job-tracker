import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { extractErrorMessage } from "../api/errors.js";
import { Icon } from "../components/Icon.jsx";
import { ThemeToggle } from "../components/ThemeToggle.jsx";
export function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  if (isAuthenticated)
    return <Navigate to={location.state?.from?.pathname || "/"} replace />;
  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname || "/", { replace: true });
    } catch (err) {
      setError(
        extractErrorMessage(
          err,
          "Check your email and password and try again.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="login-screen">
      <div className="login-theme">
        <ThemeToggle />
      </div>
      <div className="login-story">
        <div className="login-brand">
          <span className="brand-symbol">
            <Icon name="applications" size={23} />
          </span>
          Job Tracker
        </div>
        <div className="login-story-copy">
          <span className="eyebrow">YOUR NEXT CHAPTER</span>
          <h1>
            Less to keep in your head.
            <br />
            More room to move forward.
          </h1>
          <p>
            Keep your applications, interviews and next steps in one calm,
            organized place.
          </p>
          <div className="login-feature">
            <Icon name="check" />
            Every opportunity, in one place
          </div>
          <div className="login-feature">
            <Icon name="check" />
            Clear next steps and follow-ups
          </div>
          <div className="login-feature">
            <Icon name="check" />
            Your experience, ready for the right role
          </div>
        </div>
        <small>One application. One next step. A little more clarity.</small>
      </div>
      <div className="login-form-area">
        <div className="login-card">
          <span className="eyebrow">WELCOME BACK</span>
          <h2>A fresh start, right here.</h2>
          <p className="login-sub">Sign in to pick up where you left off.</p>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={submitting}
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={submitting}
              />
            </div>
            {error && (
              <p className="error-line" role="alert">
                {error}
              </p>
            )}
            <button
              className="btn-primary login-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Signing you in…" : "Sign in"}
              <Icon name="arrow" size={18} />
            </button>
          </form>
          <p className="login-help">
            Need an account or help signing in?
            <br />
            Contact the person who manages your workspace.
          </p>
        </div>
      </div>
    </div>
  );
}
