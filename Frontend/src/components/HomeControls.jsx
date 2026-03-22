import { useEffect, useRef, useState } from "react";

function ControlIcon({ kind }) {
  if (kind === "schedule") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="2" />
        <path d="M8 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M4 10h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === "search") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" />
        <path d="M20 20L16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function HomeControls({
  searchQuery,
  setSearchQuery,
  selectedElectionId,
  onSelectElection,
  elections,
}) {
  const [activeControl, setActiveControl] = useState("search");
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (activeControl === "search") {
      searchInputRef.current?.focus();
    }
  }, [activeControl]);

  function toggleControl(control) {
    setActiveControl((current) => (current === control ? null : control));
  }

  return (
    <div className="home-controls">
      <div className="home-control-toggles">
        <button
          type="button"
          className={`home-control-toggle ${activeControl === "search" ? "active" : ""}`}
          aria-label="Toggle search"
          aria-expanded={activeControl === "search"}
          onClick={() => toggleControl("search")}
        >
          <ControlIcon kind="search" />
        </button>
        <button
          type="button"
          className={`home-control-toggle ${activeControl === "routes" ? "active" : ""}`}
          aria-label="Toggle route filter"
          aria-expanded={activeControl === "routes"}
          onClick={() => toggleControl("routes")}
        >
          <ControlIcon kind="routes" />
        </button>
        <button
          type="button"
          className={`home-control-toggle ${activeControl === "schedule" ? "active" : ""}`}
          aria-label="Toggle election picker"
          aria-expanded={activeControl === "schedule"}
          onClick={() => toggleControl("schedule")}
        >
          <ControlIcon kind="schedule" />
        </button>
      </div>

      {activeControl === "search" ? (
        <div className="home-control-panel">
          <span className="home-control-panel-icon" aria-hidden="true">
            <ControlIcon kind="search" />
          </span>
          <input
            ref={searchInputRef}
            className="home-control-panel-field"
            type="search"
            placeholder="Search admin, voter, candidate, dashboard..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button
            type="button"
            className="home-control-dismiss"
            aria-label="Close search"
            onClick={() => setActiveControl(null)}
          >
            x
          </button>
        </div>
      ) : null}

      {activeControl === "routes" ? (
        <div className="home-control-panel">
          <span className="home-control-panel-icon" aria-hidden="true">
            <ControlIcon kind="routes" />
          </span>
          <span className="home-control-panel-title">Flow</span>
          <div className="home-control-panel-copy">
            /home, /admin/register, /admin/login, /admin/dashboard, /voter/register,
            /voter/login, /voter/dashboad, /voter/compain, /candidate/login,
            /candidate/dashboad, /candidate/compaindetails
          </div>
          <button
            type="button"
            className="home-control-dismiss"
            aria-label="Close routes"
            onClick={() => setActiveControl(null)}
          >
            x
          </button>
        </div>
      ) : null}

      {activeControl === "schedule" ? (
        <div className="home-control-panel">
          <span className="home-control-panel-icon" aria-hidden="true">
            <ControlIcon kind="schedule" />
          </span>
          <span className="home-control-panel-title">Election</span>
          <select
            className="home-control-panel-field"
            value={selectedElectionId ?? ""}
            onChange={(event) => onSelectElection(event.target.value)}
          >
            {elections.map((election) => (
              <option key={election.id} value={election.id}>
                {election.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="home-control-dismiss"
            aria-label="Close election picker"
            onClick={() => setActiveControl(null)}
          >
            x
          </button>
        </div>
      ) : null}
    </div>
  );
}
