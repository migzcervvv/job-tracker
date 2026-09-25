import { useState } from 'react';
import { Sidebar } from './Sidebar.jsx';

export function Layout({ title, actions, children }) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="shell">
      <Sidebar isOpen={navOpen} onClose={() => setNavOpen(false)} />
      {navOpen && (
        <div className="rail-backdrop" onClick={() => setNavOpen(false)} />
      )}
      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="hamburger-btn"
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
            >
              <span />
              <span />
              <span />
            </button>
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">{actions}</div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
