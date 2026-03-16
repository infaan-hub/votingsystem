import { NavLink } from "react-router-dom";

export default function Layout({
  children,
  elections,
  selectedElectionId,
  onSelectElection,
  user,
  onLogout,
}) {
  const selectedElection =
    elections.find((election) => election.id === selectedElectionId) || elections[0] || null;
  const tabs = [
    { to: "/", label: "Overview" },
    { to: "/campaigns", label: "Campaigns" },
    { to: "/vote", label: "Ballot" },
    { to: "/results", label: "Results" },
    ...(user ? [] : [{ to: "/login", label: "Login" }]),
  ];

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <aside className="promo-panel">
        <p className="eyebrow promo-eyebrow">User Flow</p>
        <h1>Mobile-style campus voting with a campaign-first interface.</h1>
        <p className="promo-copy">
          The full UI now follows the election-app reference: gradient hero surfaces,
          bright action buttons, white cards, and compact mobile layouts across forms,
          ballot screens, campaigns, and live results.
        </p>

        <div className="promo-gradient-card">
          <span className="floating-chip">Live election</span>
          <h2>{selectedElection?.title || "Campus voting workspace"}</h2>
          <p>
            {selectedElection?.description ||
              "Create and publish an election in Django admin, then switch between it and the ballot from the phone shell."}
          </p>
        </div>

        <div className="promo-list-card">
          <div className="flow-line">
            <span className="flow-step">01</span>
            <div>
              <strong>Login</strong>
              <p className="muted">Students and staff enter the election app securely.</p>
            </div>
          </div>
          <div className="flow-line">
            <span className="flow-step">02</span>
            <div>
              <strong>Campaign</strong>
              <p className="muted">View candidates, slogans, and department leadership seats.</p>
            </div>
          </div>
          <div className="flow-line">
            <span className="flow-step">03</span>
            <div>
              <strong>Vote</strong>
              <p className="muted">Submit one secure vote per eligible position.</p>
            </div>
          </div>
          <div className="flow-line">
            <span className="flow-step">04</span>
            <div>
              <strong>Results</strong>
              <p className="muted">Track turnout, ranking, and winner announcements in real time.</p>
            </div>
          </div>
        </div>
      </aside>

      <section className="device-frame">
        <div className="device-chrome">
          <span className="device-time">Campus Vote</span>
          <div className="device-sensors">
            <span />
            <span />
            <span />
          </div>
        </div>

        <header className="device-hero">
          <div className="hero-topline">
            <p className="eyebrow hero-eyebrow">Smart Campus Election</p>
            <span className="hero-role">{user ? user.role : "guest"}</span>
          </div>
          <h2>{selectedElection?.title || "University Voting Hub"}</h2>
          <p className="hero-copy">
            Campaign pages, ballot access, countdowns, and live department rankings in one
            mobile election workspace.
          </p>

          <div className="hero-surface">
            <label className="field selector-field">
              <span>Election</span>
              <select
                className="input hero-input"
                value={selectedElectionId ?? ""}
                onChange={(event) => onSelectElection(Number(event.target.value))}
                disabled={!elections.length}
              >
                {elections.length === 0 ? <option value="">No elections</option> : null}
                {elections.map((election) => (
                  <option key={election.id} value={election.id}>
                    {election.title}
                  </option>
                ))}
              </select>
            </label>

            {user ? (
              <div className="profile-card">
                <div>
                  <strong>{user.full_name || user.username}</strong>
                  <p className="muted">
                    {user.department?.name || "Campus"} {user.section?.name ? `| ${user.section.name}` : ""}
                  </p>
                </div>
                <button className="action-button secondary-button" onClick={onLogout}>
                  Logout
                </button>
              </div>
            ) : (
              <div className="profile-card guest-card">
                <strong>Guest mode</strong>
                <p className="muted">Login to access your ballot and protected election feeds.</p>
              </div>
            )}
          </div>
        </header>

        <main className="device-body">{children}</main>

        <nav className="bottom-nav">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) => `bottom-link${isActive ? " active" : ""}`}
            >
              <span className="bottom-link-dot" />
              <span>{tab.label}</span>
            </NavLink>
          ))}
        </nav>
      </section>
    </div>
  );
}
