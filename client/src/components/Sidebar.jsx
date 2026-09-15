import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

const BASE_LINKS = [
  { to: "/", label: "Board", end: true },
  { to: "/skills-gap", label: "Skills gap" },
  { to: "/settings", label: "Resume & skills" },
  { to: "/profile", label: "Profile" },
];

const ADMIN_LINKS = [
  { to: "/admin/users", label: "Users" },
  { to: "/admin/skills", label: "Manage skills" },
  { to: "/admin/health", label: "System health" },
  { to: "/admin/automation", label: "Automation log" },
];

export function Sidebar() {
  const { user, isAdmin, logout } = useAuth();

  return (
    <nav className="rail" aria-label="Primary">
      <div className="rail-brand">
        job<span>.</span>tracker
      </div>

      <div className="rail-section">Pipeline</div>
      {BASE_LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) => `rail-link${isActive ? " active" : ""}`}
        >
          <span className="dot" />
          {link.label}
        </NavLink>
      ))}

      {isAdmin && (
        <>
          <div className="rail-section">Admin</div>
          {ADMIN_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rail-link${isActive ? " active" : ""}`
              }
            >
              <span className="dot" />
              {link.label}
            </NavLink>
          ))}
        </>
      )}

      <div className="rail-foot">
        <div style={{ marginBottom: 8, fontSize: 13 }}>{user?.email}</div>
        <span className={`role-badge${isAdmin ? " admin" : ""}`}>
          {isAdmin ? "Admin" : "User"}
        </span>
        <button
          className="icon-btn"
          style={{ display: "block", marginTop: 12, width: "100%" }}
          onClick={logout}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
