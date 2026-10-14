import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./Sidebar.jsx";
const descriptions = {
  Applications: "Keep track of every opportunity, one next step at a time.",
  "New application":
    "Save an opportunity or record an application you’ve sent.",
  "Next actions":
    "Your upcoming deadlines, follow-ups and applications to check in on.",
  "My skills": "Build a clear picture of what you bring to your next role.",
  Resumes:
    "Keep your resumes together and choose the right one for each opportunity.",
  "Skills insights":
    "See where your experience matches the roles you’re applying for.",
  "Account settings": "Manage your account, notifications and time zone.",
};
export function Layout({ title, description, actions, children }) {
  const [navOpen, setNavOpen] = useState(false);
  const menu = useRef(null);
  useEffect(() => {
    if (!navOpen) return;
    function close(event) {
      if (event.key === "Escape") {
        setNavOpen(false);
        menu.current?.focus();
      }
    }
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [navOpen]);
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar isOpen={navOpen} onClose={() => setNavOpen(false)} />
      {navOpen && (
        <button
          className="rail-backdrop"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      )}
      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              ref={menu}
              className="hamburger-btn"
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
              aria-controls="primary-navigation"
              aria-expanded={navOpen}
            >
              <span />
              <span />
              <span />
            </button>
            <div>
              <div className="page-eyebrow">YOUR WORKSPACE</div>
              <h1>{title}</h1>
              {(description ?? descriptions[title]) && (
                <p className="page-description">
                  {description ?? descriptions[title]}
                </p>
              )}
            </div>
          </div>
          <div className="topbar-actions">{actions}</div>
        </header>
        <main className="content" id="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="workspace-footer">
          Your next opportunity starts with a next step.
        </footer>
      </div>
    </div>
  );
}
