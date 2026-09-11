import { Sidebar } from './Sidebar.jsx';

export function Layout({ title, actions, children }) {
  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <header className="topbar">
          <h1>{title}</h1>
          <div className="topbar-actions">{actions}</div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
