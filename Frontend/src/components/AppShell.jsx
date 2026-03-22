import { Link } from "react-router-dom";

export function Header({ user, onLogout }) {
  return (
    <header className="site-header">
      <div>
        <p className="site-kicker">Election Hub</p>
        <h1>Election Hub</h1>
      </div>
      <nav className="header-links">
        <Link to="/home">Home</Link>
        <Link to="/admin/login">Admin</Link>
        <Link to="/voter/login">Voter</Link>
        <Link to="/candidate/login">Candidate</Link>
        {user ? (
          <button className="ghost-button" type="button" onClick={onLogout}>
            Logout
          </button>
        ) : null}
      </nav>
    </header>
  );
}

export default function AppShell({ user, onLogout, children }) {
  return (
    <div className="app-shell">
      <Header user={user} onLogout={onLogout} />
      <main className="app-content">{children}</main>
    </div>
  );
}
