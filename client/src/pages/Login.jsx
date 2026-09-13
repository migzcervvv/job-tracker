import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { extractErrorMessage } from '../api/errors.js';
import { notify } from '../notify.js';

export function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    const dest = location.state?.from?.pathname || '/';
    return <Navigate to={dest} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      notify.success('Signed in');
      navigate('/', { replace: true });
    } catch (err) {
      notify.error('Sign in failed', extractErrorMessage(err, 'Invalid email or password'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          job<span>.</span>tracker
        </div>
        <p className="login-sub">Sign in to your pipeline.</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="field-hint" style={{ marginTop: 16 }}>
          No account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
