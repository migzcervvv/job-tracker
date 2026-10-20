import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { extractErrorMessage } from "../api/errors.js";
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
      <div className="login-form-area">
        <div className="login-card">
          <div className="brand-logo login-logo">
            <img
              src="/jt-logo.png"
              alt="Job Tracker"
              width="1372"
              height="1147"
            />
          </div>
          <h1>Welcome back</h1>
          <p className="login-sub">Sign in to your workspace.</p>
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
