import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout.jsx';
import { getProfile, updateProfile, changePassword } from '../api/profile.js';
import { extractErrorMessage } from '../api/errors.js';
import { notify } from '../notify.js';

export function Profile() {
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    getProfile()
      .then((data) => {
        setProfile(data);
        setEmail(data.email);
      })
      .catch((err) => notify.error('Could not load profile', extractErrorMessage(err)));
  }, []);

  async function handleEmailSubmit(e) {
    e.preventDefault();
    setSavingEmail(true);
    try {
      await notify.promise(updateProfile(email), {
        loading: 'Saving email…',
        success: 'Email updated',
        error: (err) => extractErrorMessage(err, 'Could not update email'),
      });
    } catch {
      // toast already shown
    } finally {
      setSavingEmail(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setSavingPassword(true);
    try {
      await notify.promise(changePassword(currentPassword, newPassword), {
        loading: 'Updating password…',
        success: 'Password updated',
        error: (err) => extractErrorMessage(err, 'Could not update password'),
      });
      setCurrentPassword('');
      setNewPassword('');
    } catch {
      // toast already shown
    } finally {
      setSavingPassword(false);
    }
  }

  if (!profile) {
    return (
      <Layout title="Profile">
        <p style={{ color: 'var(--text-dim)' }}>Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout title="Profile">
      <div className="section-label">Account</div>
      <form onSubmit={handleEmailSubmit} className="panel" style={{ maxWidth: 480, marginBottom: 24 }}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>Role</label>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', textTransform: 'capitalize' }}>
            {profile.role}
          </div>
        </div>
        <button className="btn-primary" type="submit" disabled={savingEmail} style={{ width: 'auto', padding: '9px 18px' }}>
          {savingEmail ? 'Saving…' : 'Save email'}
        </button>
      </form>

      <div className="section-label">Change password</div>
      <form onSubmit={handlePasswordSubmit} className="panel" style={{ maxWidth: 480 }}>
        <div className="field">
          <label htmlFor="currentPassword">Current password</label>
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="newPassword">New password</label>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
          <div className="field-hint">At least 8 characters.</div>
        </div>
        <button className="btn-primary" type="submit" disabled={savingPassword} style={{ width: 'auto', padding: '9px 18px' }}>
          {savingPassword ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </Layout>
  );
}
