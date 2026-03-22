import { useState } from "react";
import { Link } from "react-router-dom";

function ThemeToggle({ theme, onToggleTheme }) {
  return (
    <button className="theme-toggle" type="button" onClick={onToggleTheme} aria-label="Toggle theme">
      <span className={`theme-icon sun ${theme === "light" ? "is-active" : ""}`}>☀</span>
      <span className={`theme-icon moon ${theme === "dark" ? "is-active" : ""}`}>☾</span>
    </button>
  );
}

export function Header({
  user,
  onLogout,
  sidebarOpen,
  onToggleSidebar,
  onCloseSidebar,
  theme,
  onToggleTheme,
}) {
  return (
    <>
      <header className="site-header compact-header">
        <div className="header-brand">
          <button
            className={`sidebar-toggle ${sidebarOpen ? "is-open" : ""}`}
            type="button"
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
            aria-expanded={sidebarOpen}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <aside className={`app-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="sidebar-head">
          <p className="site-kicker">Menu</p>
          <button className="ghost-button sidebar-close" type="button" onClick={onCloseSidebar}>
            Close
          </button>
        </div>
        <nav className="sidebar-links">
          <Link to="/home" onClick={onCloseSidebar}>
            Home
          </Link>
          <Link to="/admin/login" onClick={onCloseSidebar}>
            Admin
          </Link>
          <Link to="/voter/login" onClick={onCloseSidebar}>
            Voter
          </Link>
          <Link to="/candidate/login" onClick={onCloseSidebar}>
            Candidate
          </Link>
        </nav>
        <div className="sidebar-theme">
          <p className="site-kicker">Theme</p>
          <ThemeToggle theme={theme} onToggleTheme={onToggleTheme} />
        </div>
        {user ? (
          <button className="ghost-button top-space" type="button" onClick={onLogout}>
            Logout
          </button>
        ) : null}
      </aside>

      {sidebarOpen ? <button className="sidebar-backdrop" type="button" onClick={onCloseSidebar} /> : null}
    </>
  );
}

export default function AppShell({ user, onLogout, theme, onToggleTheme, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-shell">
      <Header
        user={user}
        onLogout={onLogout}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((current) => !current)}
        onCloseSidebar={() => setSidebarOpen(false)}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
      <main className="app-content">{children}</main>
    </div>
  );
}
