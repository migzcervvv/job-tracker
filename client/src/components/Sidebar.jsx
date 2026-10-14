import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { Icon } from "./Icon.jsx";
const groups = [
  {
    label: "Workspace",
    links: [
      { to: "/", label: "Applications", icon: "applications", end: true },
      { to: "/alerts", label: "Next actions", icon: "alerts" },
    ],
  },
  {
    label: "Your profile",
    links: [
      { to: "/resume", label: "Resumes", icon: "resume" },
      { to: "/skills", label: "My skills", icon: "skills" },
      { to: "/skills-gap", label: "Skills insights", icon: "growth" },
      { to: "/profile", label: "Account settings", icon: "profile" },
    ],
  },
];
const adminLinks = [
  { to: "/admin/users", label: "People" },
  { to: "/admin/skills", label: "Skill library" },
  { to: "/admin/health", label: "System status" },
  { to: "/admin/automation", label: "Processing history" },
];
export function Sidebar({ isOpen = false, onClose = () => {} }) {
  const { user, isAdmin, logout } = useAuth();
  function nav(link) {
    return (
      <NavLink
        key={link.to}
        to={link.to}
        end={link.end}
        onClick={onClose}
        className={({ isActive }) => "rail-link" + (isActive ? " active" : "")}
      >
        <Icon name={link.icon ?? "settings"} size={19} />
        <span>{link.label}</span>
      </NavLink>
    );
  }
  return (
    <nav
      id="primary-navigation"
      className={"rail" + (isOpen ? " open" : "")}
      aria-label="Primary"
    >
      <div className="rail-brand">
        <span className="brand-symbol">
          <Icon name="applications" size={22} />
        </span>
        <div>
          Job Tracker<small>A little more organized.</small>
        </div>
        <button
          className="rail-close"
          onClick={onClose}
          aria-label="Close menu"
        >
          <Icon name="close" />
        </button>
      </div>
      {groups.map((group) => (
        <div className="nav-group" key={group.label}>
          <div className="rail-section">{group.label}</div>
          {group.links.map(nav)}
        </div>
      ))}
      {isAdmin && (
        <details className="admin-navigation">
          <summary>
            <Icon name="settings" size={18} />
            Administration
          </summary>
          {adminLinks.map(nav)}
        </details>
      )}
      <div className="rail-foot">
        <div className="account-avatar" aria-hidden="true">
          {user?.email?.[0]?.toUpperCase() ?? "J"}
        </div>
        <div className="account-summary">
          <strong>
            {user?.role === "test"
              ? "Demo account"
              : isAdmin
                ? "Administrator"
                : "Your workspace"}
          </strong>
          <span title={user?.email}>{user?.email}</span>
        </div>
        <button
          className="signout-btn"
          onClick={logout}
          aria-label="Sign out"
          title="Sign out"
        >
          <Icon name="logout" size={18} />
        </button>
      </div>
    </nav>
  );
}
