import { Link } from "react-router-dom";

import ScreenCard from "../components/ScreenCard";
import { formatStatus, toSentence, useCountdown } from "../utils";

const FLOW_SCREENS = [
  ["Login", "Secure voter, candidate, and admin access"],
  ["Register", "Separate onboarding routes for admin and voter flows"],
  ["Explore Elections", "See published elections and switch context instantly"],
  ["Candidate Directory", "Read real candidate campaign profiles from the backend"],
  ["Live Results", "Watch results and stats when visibility is enabled"],
  ["Vote", "Open the authenticated ballot and cast one secure vote"],
];

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
          <p className="eyebrow">User Flow</p>
          <h2>E-Voting System Home</h2>
          <p className="lead">
            Start at <strong>/home</strong>, then move into admin, voter, or candidate pages. The
            new frontend uses separate page files and a neumorphic style.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="primary-button" to="/voter/login">
            Open Flow Start
          </Link>
          <div className="hero-user-chip">{user ? `Signed in as ${toSentence(user.role)}` : "Guest mode"}</div>
        </div>
      </section>

      <section className="flow-preview-grid">
        {FLOW_SCREENS.map(([title, subtitle], index) => (
          <article className="mini-flow-card" key={title}>
            <div className="mini-step">Step {index + 1}</div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </article>
        ))}
      </section>

      <ScreenCard
        step={1}
        section="Entry Point"
        title="Election Home"
        subtitle="Select the current election and jump into the right route."
      >
        <div className="panel-grid two-col">
          <div className="soft-panel">
            <label className="field-label">Select Election</label>
            <select
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

          <div className="soft-panel">
            <h3>Portal Routes</h3>
            <div className="route-grid">
              {[
                "/home",
                "/admin/register",
                "/admin/login",
                "/admin/dashboard",
                "/voter/register",
                "/voter/login",
                "/voter/dashboad",
                "/voter/compain",
                "/candidate/login",
                "/candidate/dashboad",
                "/candidate/compaindetails",
              ].map((path) => (
                <div className="route-pill" key={path}>
                  {path}
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScreenCard>

      <ScreenCard
        step={2}
        section="Portal Access"
        title="Role Entry Cards"
        subtitle="Open each page independently from the home route."
      >
        <div className="portal-grid">
          <Link className="portal-tile" to="/admin/login">
            <h3>Admin Pages</h3>
            <p>Register candidates, register voters, set election timing, and review results.</p>
          </Link>
          <Link className="portal-tile" to="/voter/login">
            <h3>Voter Pages</h3>
            <p>See all elections, select one, browse campaigns, and vote when the ballot is open.</p>
          </Link>
          <Link className="portal-tile" to="/candidate/login">
            <h3>Candidate Pages</h3>
            <p>Watch countdowns, vote totals, decision state, and open campaign details.</p>
          </Link>
        </div>
      </ScreenCard>
    </div>
  );
}
