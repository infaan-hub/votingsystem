import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchElectionDetail, resolveMediaUrl } from "../api";
import CountdownClockCard from "../components/CountdownClockCard";
import ScreenCard from "../components/ScreenCard";
import { formatStatus } from "../utils";

export default function HomePage({ elections, selectedElectionId, onSelectElection, user }) {
  const [activeElectionDetail, setActiveElectionDetail] = useState(null);
  const activeElection =
    elections.find((item) => String(item.id) === String(selectedElectionId)) || elections[0] || null;
  const displayElection = activeElectionDetail
    ? {
        ...activeElection,
        ...activeElectionDetail,
        image: activeElectionDetail.image || activeElection?.image || "",
      }
    : activeElection;
  const displayElectionImage = resolveMediaUrl(displayElection?.image);
  useEffect(() => {
    if (!activeElection?.id) {
      setActiveElectionDetail(null);
      return;
    }
    let ignore = false;
    fetchElectionDetail(activeElection.id)
      .then((response) => {
        if (!ignore) {
          setActiveElectionDetail(response);
        }
      })
      .catch(() => {
        if (!ignore) {
          setActiveElectionDetail(null);
        }
      });
    return () => {
      ignore = true;
    };
  }, [activeElection?.id]);

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
              disabled={!elections.length}
            >
              {!elections.length ? <option value="">Loading elections...</option> : null}
              {elections.map((election) => (
                <option key={election.id} value={election.id}>
                  {election.title}
                </option>
              ))}
            </select>
            {!elections.length ? (
              <div className="info-note top-space">Fetching the latest election list in the background.</div>
            ) : null}
            {activeElection ? (
              <div className="top-space">
                <CountdownClockCard
                  eyebrow="Election Clock"
                  title={displayElection?.title || "Election Countdown"}
                  status={displayElection?.status}
                  targetLabel={displayElection?.status === "upcoming" ? "Voting opens" : "Voting deadline"}
                  targetDate={
                    displayElection?.status === "upcoming"
                      ? displayElection?.voting_start_at
                      : displayElection?.voting_end_at
                  }
                  countdownTarget={
                    displayElection?.status === "upcoming"
                      ? displayElection?.voting_start_at
                      : displayElection?.status === "active"
                        ? displayElection?.voting_end_at
                        : null
                  }
                  helperText={`Status: ${formatStatus(displayElection?.status)}. Keep watching the clock and sign in before the ballot closes.`}
                />
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
              {displayElectionImage ? (
                <img
                  className="election-hero-image"
                  src={displayElectionImage}
                  alt={displayElection.title}
                />
              ) : null}
              <div className="election-visual-badge">{formatStatus(displayElection?.status)}</div>
              <div className="election-visual-copy">
                <h3>{displayElection?.title || "Election Hub Event"}</h3>
                <p>{displayElection?.description || "Stay ready for the next important voting event."}</p>
              </div>
            </div>
          </div>
          <div className="soft-panel">
            <div className="stack-sm">
              <CountdownClockCard
                eyebrow="Spotlight Clock"
                title={displayElection?.title || "Election Hub Event"}
                status={displayElection?.status}
                targetLabel={displayElection?.status === "upcoming" ? "Voting opens" : "Voting deadline"}
                targetDate={
                  displayElection?.status === "upcoming"
                    ? displayElection?.voting_start_at
                    : displayElection?.voting_end_at
                }
                countdownTarget={
                  displayElection?.status === "upcoming"
                    ? displayElection?.voting_start_at
                    : displayElection?.status === "active"
                      ? displayElection?.voting_end_at
                      : null
                }
                helperText="Life moves fast. Stay on time, sign in early, and vote before the countdown ends."
              />
              <div className="metric-card">
                <span>Voting Opens</span>
                <strong>
                  {displayElection?.status === "upcoming" ? "When the countdown ends" : "Voting is live or completed"}
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
