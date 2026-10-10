"use client";

import Link from "next/link";
import { useState } from "react";

import { useApp } from "@/src/components/AppProvider";

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
          <Link href="/home" onClick={onCloseSidebar}>
            Home
          </Link>
          <Link href="/admin/login" onClick={onCloseSidebar}>
            Admin
          </Link>
          <Link href="/voter/login" onClick={onCloseSidebar}>
            Voter
          </Link>
          <Link href="/candidate/login" onClick={onCloseSidebar}>
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

export default function AppShell({ children }) {
  const { user, handleLogout, theme, toggleTheme, appError } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-shell">
      <Header
        user={user}
        onLogout={handleLogout}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((current) => !current)}
        onCloseSidebar={() => setSidebarOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main className="app-content">
        {appError ? <div className="error-banner">{appError}</div> : null}
        {children}
      </main>
    </div>
  );
}
