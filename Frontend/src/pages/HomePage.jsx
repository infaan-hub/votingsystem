import { Link } from "react-router-dom";

import ScreenCard from "../components/ScreenCard";
import { formatStatus, useCountdown } from "../utils";

export default function HomePage({ elections, selectedElectionId, onSelectElection, user }) {
  const activeElection =
    elections.find((item) => String(item.id) === String(selectedElectionId)) || elections[0] || null;
  const countdown = useCountdown(
    activeElection?.status === "upcoming"
      ? activeElection.voting_start_at
      : activeElection?.status === "active"
        ? activeElection.voting_end_at
        : null,
  );

  return (
    <div className="page-stack">
      <section className="landing-hero">
        <div>
          <h2>E-Voting System Home</h2>
          <p className="lead">
            Welcome to Election Hub. Choose your role to sign in, view elections, explore candidate
            campaigns, and follow the voting process with ease.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="primary-button" to="/voter/login">
            Vote now
          </Link>
        </div>
      </section>

      <ScreenCard
        step={1}
        section="Entry Point"
        title="Election Home"
        subtitle="Select the current election and jump into the right route."
      >
        <div className="panel-grid two-col">
          <div className="soft-panel">
            <label className="field-label" htmlFor="home-election-select">
              Select Election
            </label>
            <select
              id="home-election-select"
              name="home_election"
              className="field-input"
              value={selectedElectionId ?? ""}
              onChange={(event) => onSelectElection(event.target.value)}
            >
              {elections.map((election) => (
                <option key={election.id} value={election.id}>
                  {election.title}
                </option>
              ))}
            </select>
            {activeElection ? (
              <div className="stack-sm top-space">
                <div className="metric-card">
                  <span>Status</span>
                  <strong>{formatStatus(activeElection.status)}</strong>
                </div>
                <div className="metric-card">
                  <span>Countdown</span>
                  <strong>{countdown}</strong>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </ScreenCard>

      <ScreenCard
        step={2}
        section="Election Spotlight"
        title="Current Election Countdown"
        subtitle="Follow the active election timeline and sign in before casting a vote."
      >
        <div className="panel-grid two-col">
          <div className="election-visual-card">
            <div className="election-visual-frame">
              <div className="election-visual-badge">{formatStatus(activeElection?.status)}</div>
              <div className="election-visual-copy">
                <h3>{activeElection?.title || "Election Hub Event"}</h3>
                <p>{activeElection?.description || "Stay ready for the next important voting event."}</p>
              </div>
            </div>
          </div>
          <div className="soft-panel">
            <div className="stack-sm">
              <div className="metric-card">
                <span>Countdown</span>
                <strong>{countdown}</strong>
              </div>
              <div className="metric-card">
                <span>Voting Opens</span>
                <strong>
                  {activeElection?.status === "upcoming" ? "When the countdown ends" : "Voting is live or completed"}
                </strong>
              </div>
              <div className="info-note">
                Voters must log in before they can open the ballot and cast a vote.
              </div>
              <Link className="primary-button" to="/voter/login">
                Voter Login to Vote
              </Link>
            </div>
          </div>
        </div>
      </ScreenCard>
    </div>
  );
}
