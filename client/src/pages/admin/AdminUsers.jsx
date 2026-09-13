import { useEffect, useState } from 'react';
import { Layout } from '../../components/Layout.jsx';
import { listUsers, setUserRole, deleteUser, createUserAdmin } from '../../api/admin.js';
import { extractErrorMessage } from '../../api/errors.js';
import { notify } from '../../notify.js';
import { useAuth } from '../../auth/AuthContext.jsx';

export function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);

  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    listUsers()
      .then(setUsers)
      .catch((err) => notify.error('Could not load users', extractErrorMessage(err)));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await notify.promise(createUserAdmin(newEmail, newPassword, newRole), {
        loading: 'Creating account…',
        success: `Account created for ${newEmail}`,
        error: (err) => extractErrorMessage(err, 'Could not create account'),
      });
      setNewEmail('');
      setNewPassword('');
      setNewRole('user');
      refresh();
    } catch {
      // toast already shown
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleToggle(u) {
    const nextRole = u.role === 'admin' ? 'user' : 'admin';
    try {
      await setUserRole(u.id, nextRole);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x)));
      notify.success(`${u.email} is now ${nextRole}`);
    } catch (err) {
      notify.error('Could not change role', extractErrorMessage(err));
    }
  }

  async function handleDelete(u) {
    try {
      await deleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      notify.success(`${u.email} deleted`);
    } catch (err) {
      notify.error('Could not delete user', extractErrorMessage(err));
    } finally {
      setConfirmingDeleteId(null);
    }
  }

  return (
    <Layout title="Users">
      <div className="section-label">Create account</div>
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0, marginBottom: 12 }}>
        Registration is closed to the public — this is the only way a new account gets created.
        Share the password with them directly; they can change it from their own Profile page after signing in.
      </p>
      <form onSubmit={handleCreate} className="panel" style={{ maxWidth: 560, marginBottom: 28 }}>
        <div className="stage-form-grid" style={{ marginBottom: 14 }}>
          <div className="field">
            <label htmlFor="newEmail">Email</label>
            <input
              id="newEmail"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="newPassword">Temporary password</label>
            <input
              id="newPassword"
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="field">
            <label htmlFor="newRole">Role</label>
            <select id="newRole" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <button className="btn-save" type="submit" disabled={creating}>
          {creating ? 'Creating…' : 'Create account'}
        </button>
      </form>

      <div className="section-label">All users</div>
      {users === null && <p style={{ color: 'var(--text-dim)' }}>Loading…</p>}

      {users !== null && (
        <div className="admin-table">
          <div className="admin-table-head">
            <span>Email</span>
            <span>Role</span>
            <span>Applications</span>
            <span></span>
          </div>
          {users.map((u) => (
            <div className="admin-table-row" key={u.id}>
              <span>{u.email}</span>
              <span>
                <span className={`role-badge${u.role === 'admin' ? ' admin' : ''}`}>{u.role}</span>
              </span>
              <span>{u.applicationCount}</span>
              <span className="row-actions">
                <button
                  className="icon-btn"
                  onClick={() => handleRoleToggle(u)}
                  disabled={u.id === currentUser?.id}
                  title={u.id === currentUser?.id ? "Can't change your own role" : undefined}
                >
                  Make {u.role === 'admin' ? 'user' : 'admin'}
                </button>
                {confirmingDeleteId === u.id ? (
                  <>
                    <button className="btn-danger" onClick={() => handleDelete(u)}>Confirm</button>
                    <button className="icon-btn" onClick={() => setConfirmingDeleteId(null)}>Cancel</button>
                  </>
                ) : (
                  <button
                    className="icon-btn-danger"
                    onClick={() => setConfirmingDeleteId(u.id)}
                    disabled={u.id === currentUser?.id}
                    title={u.id === currentUser?.id ? "Can't delete your own account" : undefined}
                  >
                    Delete
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
