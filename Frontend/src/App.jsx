import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import {
  fetchBallot,
  fetchCampaigns,
  fetchCurrentUser,
  fetchElectionDetail,
  fetchElections,
  fetchHealth,
  fetchResults,
  fetchStats,
  login,
  logout,
  voteForCandidate,
} from "./api";

const TOKEN_KEY = "election-hub-token";

const FLOW_SCREENS = [
  ["Login", "Secure voter, candidate, and admin access"],
  ["Register", "Styled onboarding screens for portals without exposed signup APIs"],
  ["Explore Elections", "See published elections and switch context instantly"],
  ["Candidate Directory", "Read real candidate campaign profiles from the backend"],
  ["Live Results", "Watch results and stats when the backend allows visibility"],
  ["Vote", "Open the authenticated ballot and cast one secure vote"],
];

function toSentence(value) {
  if (!value) {
    return "Guest";
  }
  return value
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return date.toLocaleString();
}

function formatStatus(status) {
  return status ? status[0].toUpperCase() + status.slice(1) : "Unknown";
}

function useCountdown(targetDate) {
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return useMemo(() => {
    if (!targetDate) {
      return "Not available";
    }
    const target = new Date(targetDate).getTime();
    if (Number.isNaN(target)) {
      return "Not available";
    }
    const diff = Math.max(0, target - tick);
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }, [targetDate, tick]);
}

function Header({ user, onLogout }) {
  return (
    <header className="site-header">
      <div>
        <p className="site-kicker">Election Hub</p>
        <h1>Modern E-Voting Web Flow</h1>
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

function ScreenCard({ step, section, title, subtitle, children }) {
  return (
    <section className="screen-card">
      <div className="screen-card-head">
        <div>
          <div className="screen-section">{section}</div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="screen-step">Step {step}</div>
      </div>
      <div className="screen-card-body">{children}</div>
    </section>
  );
}

function AppShell({ user, onLogout, children }) {
  return (
    <div className="app-shell">
      <Header user={user} onLogout={onLogout} />
      <main className="app-content">{children}</main>
    </div>
  );
}

function HomePage({ elections, selectedElectionId, onSelectElection, user }) {
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
          <h2>E-Voting Web Style Flow</h2>
          <p className="lead">
            A fresh responsive frontend using the provided visual direction, connected to the real
            election login, campaign, ballot, stats, and results APIs.
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
        subtitle="Start with /home, inspect the current election, and move into your role-specific flow."
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
                "/admin/login",
                "/admin/register",
                "/admin/dashboard",
                "/voter/login",
                "/voter/register",
                "/voter/dashboard",
                "/voter/compain",
                "/candidate/login",
                "/candidate/dashboard",
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
        subtitle="Move into the election platform through the correct portal."
      >
        <div className="portal-grid">
          <Link className="portal-tile" to="/admin/login">
            <h3>Admin Access</h3>
            <p>Review election schedules, campaign details, stats, and results visibility.</p>
          </Link>
          <Link className="portal-tile" to="/voter/login">
            <h3>Voter Access</h3>
            <p>Authenticate, browse candidates, open the ballot, and submit a vote.</p>
          </Link>
          <Link className="portal-tile" to="/candidate/login">
            <h3>Candidate Access</h3>
            <p>Open your campaign dashboard, monitor vote totals, and follow results.</p>
          </Link>
        </div>
      </ScreenCard>
    </div>
  );
}

function LoginPage({ role, user, onLogin }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    if (role === "admin" && user.role === "admin") {
      return <Navigate to="/admin/dashboard" replace />;
    }
    if (role === "candidate" && user.role !== "admin") {
      return <Navigate to="/candidate/dashboard" replace />;
    }
    if (role === "voter" && user.role !== "admin") {
      return <Navigate to="/voter/dashboard" replace />;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const nextUser = await onLogin(form);
      if (role === "admin" && nextUser.role !== "admin") {
        throw new Error("This account does not have admin access.");
      }
      if (role !== "admin" && nextUser.role === "admin") {
        throw new Error("Admin accounts must use the admin portal.");
      }
      const fallbackTarget =
        role === "admin" ? "/admin/dashboard" : role === "candidate" ? "/candidate/dashboard" : "/voter/dashboard";
      navigate(typeof location.state?.from === "string" ? location.state.from : fallbackTarget, {
        replace: true,
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  const meta = {
    admin: {
      title: "Admin Login",
      subtitle: "Secure election management access",
      primary: "Login",
      registerPath: "/admin/register",
    },
    voter: {
      title: "Voter Login",
      subtitle: "Secure voter access",
      primary: "Login",
      registerPath: "/voter/register",
    },
    candidate: {
      title: "Candidate Login",
      subtitle: "Secure candidate access",
      primary: "Login",
      registerPath: null,
    },
  }[role];

  return (
    <div className="page-stack">
      <ScreenCard step={1} section="Authentication" title={meta.title} subtitle={meta.subtitle}>
        <form className="form-stack" onSubmit={handleSubmit}>
          <div>
            <label className="field-label">Phone / Voter ID / Username</label>
            <input
              className="field-input"
              placeholder="Enter your username"
              value={form.username}
              onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
              required
            />
          </div>
          <div>
            <label className="field-label">Password</label>
            <input
              type="password"
              className="field-input"
              placeholder="••••••••"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              required
            />
          </div>
          {error ? <div className="error-banner">{error}</div> : null}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? "Signing In..." : meta.primary}
          </button>
          <div className="button-grid">
            {meta.registerPath ? (
              <Link className="secondary-button" to={meta.registerPath}>
                Create Account
              </Link>
            ) : (
              <div className="info-note">Candidates are registered by election administrators.</div>
            )}
            <Link className="secondary-button" to="/home">
              Return Home
            </Link>
          </div>
        </form>
      </ScreenCard>
    </div>
  );
}

function RegisterPage({ role }) {
  const fields =
    role === "admin"
      ? ["Full Name", "Email", "Staff ID", "Department"]
      : ["First Name", "Last Name", "Email", "Registration Number"];

  return (
    <div className="page-stack">
      <ScreenCard
        step={2}
        section="Authentication"
        title={role === "admin" ? "Admin Register" : "Voter Register"}
        subtitle="Styled onboarding form mapped to the current portal flow."
      >
        <div className="panel-grid two-col">
          {fields.map((field) => (
            <div key={field}>
              <label className="field-label">{field}</label>
              <input className="field-input" placeholder={field} />
            </div>
          ))}
          <div className="span-2 info-note">
            The current backend exposes login and election APIs only. Registration is styled here
            for the requested flow, but account creation must currently be handled by the election
            office or Django admin until a registration API is added.
          </div>
          <div className="span-2">
            <button className="primary-button" type="button">
              Registration API Pending
            </button>
          </div>
        </div>
      </ScreenCard>
    </div>
  );
}

function ElectionSelector({ elections, selectedElectionId, onSelectElection }) {
  return (
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
  );
}

function RequireAuth({ user, allowAdmin = false, children }) {
  const location = useLocation();
  if (!user) {
    return <Navigate to="/voter/login" replace state={{ from: location.pathname }} />;
  }
  if (!allowAdmin && user.role === "admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return children;
}

function AdminDashboard({ user, elections, selectedElectionId, onSelectElection }) {
  const [detail, setDetail] = useState(null);
  const [stats, setStats] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const selectedElection =
    elections.find((item) => String(item.id) === String(selectedElectionId)) || elections[0] || null;
  const countdown = useCountdown(
    selectedElection?.status === "upcoming"
      ? selectedElection?.voting_start_at
      : selectedElection?.status === "active"
        ? selectedElection?.voting_end_at
        : null,
  );

  useEffect(() => {
    if (!selectedElection) {
      return;
    }
    let ignore = false;
    Promise.allSettled([
      fetchElectionDetail(selectedElection.id),
      fetchStats(selectedElection.id),
      fetchResults(selectedElection.id),
    ]).then(([detailResult, statsResult, resultsResult]) => {
      if (ignore) {
        return;
      }
      setDetail(detailResult.status === "fulfilled" ? detailResult.value : null);
      setStats(statsResult.status === "fulfilled" ? statsResult.value : null);
      setResults(resultsResult.status === "fulfilled" ? resultsResult.value : null);
      const firstFailure = [detailResult, statsResult, resultsResult].find((item) => item.status === "rejected");
      setError(firstFailure?.reason?.message || "");
    });
    return () => {
      ignore = true;
    };
  }, [selectedElection]);

  return (
    <RequireAuth user={user} allowAdmin>
      <div className="page-stack">
        <ScreenCard
          step={3}
          section="Administration"
          title="Admin Dashboard"
          subtitle="Election monitoring surface for schedules, campaign visibility, statistics, and outcomes."
        >
          <div className="panel-grid two-col">
            <div className="soft-panel">
              <label className="field-label">Current Election</label>
              <ElectionSelector
                elections={elections}
                selectedElectionId={selectedElectionId}
                onSelectElection={onSelectElection}
              />
              <div className="metric-list top-space">
                <div className="metric-card">
                  <span>Countdown</span>
                  <strong>{countdown}</strong>
                </div>
                <div className="metric-card">
                  <span>Status</span>
                  <strong>{formatStatus(selectedElection?.status)}</strong>
                </div>
                <div className="metric-card">
                  <span>Voting Deadline</span>
                  <strong>{formatDateTime(selectedElection?.voting_end_at)}</strong>
                </div>
              </div>
            </div>
            <div className="soft-panel">
              <h3>Operational Actions</h3>
              <div className="action-note-list">
                <div className="info-note">Register candidates: currently managed in backend admin.</div>
                <div className="info-note">Register voters: currently managed in backend admin.</div>
                <div className="info-note">Set election dates and deadlines: no public write API exposed.</div>
                <div className="info-note">Post election updates: read-only announcements come from the detail API.</div>
              </div>
            </div>
          </div>
          {error ? <div className="error-banner top-space">{error}</div> : null}
        </ScreenCard>

        <ScreenCard
          step={4}
          section="Oversight"
          title="Election Overview"
          subtitle="Read the published election structure, candidates, and visible totals."
        >
          <div className="panel-grid two-col">
            <div className="soft-panel">
              <h3>Election Detail</h3>
              <p>{detail?.description || "No description available."}</p>
              <div className="stack-sm top-space">
                {detail?.positions?.map((position) => (
                  <div className="list-row" key={position.id}>
                    <strong>{position.name}</strong>
                    <span>{position.candidates.length} candidates</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="soft-panel">
              <h3>Results Snapshot</h3>
              <div className="stack-sm">
                {results?.winners?.length ? (
                  results.winners.map((winner, index) => (
                    <div className="list-row" key={`${winner.position_name}-${index}`}>
                      <strong>{winner.position_name}</strong>
                      <span>{winner.candidate_name}</span>
                    </div>
                  ))
                ) : (
                  <div className="info-note">Results are hidden or not yet available.</div>
                )}
              </div>
              {stats ? (
                <div className="metric-card top-space">
                  <span>Total Votes</span>
                  <strong>{stats.total_votes}</strong>
                </div>
              ) : null}
            </div>
          </div>
        </ScreenCard>
      </div>
    </RequireAuth>
  );
}

function VoterDashboard({ user, token, elections, selectedElectionId, onSelectElection }) {
  const [campaigns, setCampaigns] = useState(null);
  const [ballot, setBallot] = useState(null);
  const [voteMessage, setVoteMessage] = useState("");
  const [error, setError] = useState("");
  const selectedElection =
    elections.find((item) => String(item.id) === String(selectedElectionId)) || elections[0] || null;

  useEffect(() => {
    if (!selectedElection || !token) {
      return;
    }
    let ignore = false;
    Promise.allSettled([fetchCampaigns(selectedElection.id), fetchBallot(selectedElection.id, token)]).then(
      ([campaignResult, ballotResult]) => {
        if (ignore) {
          return;
        }
        setCampaigns(campaignResult.status === "fulfilled" ? campaignResult.value : null);
        setBallot(ballotResult.status === "fulfilled" ? ballotResult.value : null);
        const firstFailure = [campaignResult, ballotResult].find((item) => item.status === "rejected");
        setError(firstFailure?.reason?.message || "");
      },
    );
    return () => {
      ignore = true;
    };
  }, [selectedElection, token]);

  async function handleVote(candidateId) {
    try {
      const response = await voteForCandidate(candidateId, token);
      setVoteMessage(`Vote recorded for ${response.candidate}.`);
      const refreshedBallot = await fetchBallot(selectedElection.id, token);
      setBallot(refreshedBallot);
      setError("");
    } catch (requestError) {
      setVoteMessage("");
      setError(requestError.message);
    }
  }

  return (
    <RequireAuth user={user}>
      <div className="page-stack">
        <ScreenCard
          step={3}
          section="Voting"
          title="Voter Dashboard"
          subtitle="See all elections, select one, review candidates, and open the authenticated ballot."
        >
          <div className="panel-grid two-col">
            <div className="soft-panel">
              <label className="field-label">Select Election</label>
              <ElectionSelector
                elections={elections}
                selectedElectionId={selectedElectionId}
                onSelectElection={onSelectElection}
              />
              <div className="stack-sm top-space">
                {elections.map((election) => (
                  <div className="list-row" key={election.id}>
                    <strong>{election.title}</strong>
                    <span>{formatStatus(election.status)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="soft-panel">
              <h3>Ballot Status</h3>
              <div className="metric-list">
                <div className="metric-card">
                  <span>Voting Open</span>
                  <strong>{ballot?.is_voting_open ? "Yes" : "No"}</strong>
                </div>
                <div className="metric-card">
                  <span>Positions</span>
                  <strong>{ballot?.positions?.length ?? 0}</strong>
                </div>
                <div className="metric-card">
                  <span>Completed</span>
                  <strong>{ballot?.voted_position_ids?.length ?? 0}</strong>
                </div>
              </div>
            </div>
          </div>
          {voteMessage ? <div className="success-banner top-space">{voteMessage}</div> : null}
          {error ? <div className="error-banner top-space">{error}</div> : null}
        </ScreenCard>

        <ScreenCard
          step={4}
          section="Exploration"
          title="Candidate Directory"
          subtitle="See all available candidates and vote where you are eligible."
        >
          <div className="candidate-grid">
            {campaigns?.positions?.flatMap((position) =>
              position.candidates.map((candidate) => {
                const alreadyVoted = ballot?.voted_position_ids?.includes(position.id);
                return (
                  <article className="candidate-card" key={`${position.id}-${candidate.id}`}>
                    <div className="candidate-photo" />
                    <div className="candidate-copy">
                      <div className="candidate-role">{position.name}</div>
                      <h3>{candidate.user.full_name}</h3>
                      <p>{candidate.slogan || "No slogan provided."}</p>
                      <div className="candidate-meta">
                        <span>{candidate.user.department?.name || "General scope"}</span>
                        <span>{candidate.vote_total ?? 0} votes</span>
                      </div>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={!ballot?.is_voting_open || alreadyVoted}
                        onClick={() => handleVote(candidate.id)}
                      >
                        {alreadyVoted ? "Vote Recorded" : "Vote Candidate"}
                      </button>
                    </div>
                  </article>
                );
              }),
            )}
          </div>
        </ScreenCard>
      </div>
    </RequireAuth>
  );
}

function VoterCampaigns({ user, elections, selectedElectionId, onSelectElection }) {
  const [campaigns, setCampaigns] = useState(null);
  const [error, setError] = useState("");
  const selectedElection =
    elections.find((item) => String(item.id) === String(selectedElectionId)) || elections[0] || null;

  useEffect(() => {
    if (!selectedElection) {
      return;
    }
    let ignore = false;
    fetchCampaigns(selectedElection.id)
      .then((response) => {
        if (!ignore) {
          setCampaigns(response);
          setError("");
        }
      })
      .catch((requestError) => {
        if (!ignore) {
          setError(requestError.message);
          setCampaigns(null);
        }
      });
    return () => {
      ignore = true;
    };
  }, [selectedElection]);

  return (
    <RequireAuth user={user}>
      <div className="page-stack">
        <ScreenCard
          step={5}
          section="Exploration"
          title="Voter Campaign View"
          subtitle="See all compains of candidates for the selected election."
        >
          <div className="soft-panel">
            <label className="field-label">Selected Election</label>
            <ElectionSelector
              elections={elections}
              selectedElectionId={selectedElectionId}
              onSelectElection={onSelectElection}
            />
          </div>
          {error ? <div className="error-banner top-space">{error}</div> : null}
          <div className="campaign-column top-space">
            {campaigns?.positions?.map((position) => (
              <div className="campaign-block" key={position.id}>
                <div className="campaign-header">
                  <h3>{position.name}</h3>
                  <span>{position.candidates.length} candidates</span>
                </div>
                <div className="campaign-list">
                  {position.candidates.map((candidate) => (
                    <article className="comment-card" key={candidate.id}>
                      <h4>{candidate.user.full_name}</h4>
                      <p>{candidate.manifesto || "No manifesto published."}</p>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScreenCard>
      </div>
    </RequireAuth>
  );
}

function CandidateDashboard({ user, token, elections, selectedElectionId, onSelectElection }) {
  const [campaigns, setCampaigns] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const selectedElection =
    elections.find((item) => String(item.id) === String(selectedElectionId)) || elections[0] || null;
  const countdown = useCountdown(
    selectedElection?.status === "upcoming"
      ? selectedElection?.voting_start_at
      : selectedElection?.status === "active"
        ? selectedElection?.voting_end_at
        : null,
  );

  useEffect(() => {
    if (!selectedElection) {
      return;
    }
    let ignore = false;
    Promise.allSettled([fetchCampaigns(selectedElection.id), fetchResults(selectedElection.id, token)]).then(
      ([campaignResult, resultsResult]) => {
        if (ignore) {
          return;
        }
        setCampaigns(campaignResult.status === "fulfilled" ? campaignResult.value : null);
        setResults(resultsResult.status === "fulfilled" ? resultsResult.value : null);
        const firstFailure = [campaignResult, resultsResult].find((item) => item.status === "rejected");
        setError(firstFailure?.reason?.message || "");
      },
    );
    return () => {
      ignore = true;
    };
  }, [selectedElection, token]);

  const candidateEntries =
    campaigns?.positions?.flatMap((position) =>
      position.candidates
        .filter((candidate) => String(candidate.user.id) === String(user?.id))
        .map((candidate) => ({ ...candidate, positionName: position.name })),
    ) || [];

  const candidateResult =
    results?.stats?.positions
      ?.flatMap((position) => position.results)
      .find((entry) => String(entry.user_id) === String(user?.id)) || null;

  return (
    <RequireAuth user={user}>
      <div className="page-stack">
        <ScreenCard
          step={3}
          section="Candidate"
          title="Candidate Dashboard"
          subtitle="Countdown, vote count, and winner or looser decision for the selected election."
        >
          <div className="panel-grid three-col">
            <div className="metric-card">
              <span>Countdown</span>
              <strong>{countdown}</strong>
            </div>
            <div className="metric-card">
              <span>Voted Count</span>
              <strong>{candidateResult?.vote_total ?? 0}</strong>
            </div>
            <div className="metric-card">
              <span>Decision</span>
              <strong>
                {candidateResult ? (candidateResult.is_winner ? "Winner" : "Looser") : "Pending"}
              </strong>
            </div>
          </div>
          <div className="soft-panel top-space">
            <label className="field-label">Current Election</label>
            <ElectionSelector
              elections={elections}
              selectedElectionId={selectedElectionId}
              onSelectElection={onSelectElection}
            />
          </div>
          {error ? <div className="error-banner top-space">{error}</div> : null}
        </ScreenCard>

        <ScreenCard
          step={4}
          section="Candidate"
          title="My Campaign Entries"
          subtitle="Campaign data loaded from the current election campaign API."
        >
          <div className="candidate-grid">
            {candidateEntries.length ? (
              candidateEntries.map((entry) => (
                <article className="candidate-card" key={entry.id}>
                  <div className="candidate-photo" />
                  <div className="candidate-copy">
                    <div className="candidate-role">{entry.positionName}</div>
                    <h3>{entry.user.full_name}</h3>
                    <p>{entry.manifesto || "No manifesto published."}</p>
                    <div className="candidate-meta">
                      <span>{entry.slogan || "No slogan"}</span>
                      <span>{entry.vote_total ?? 0} votes</span>
                    </div>
                    <Link className="secondary-button" to="/candidate/compaindetails">
                      Open Campaign Details
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <div className="info-note">
                No candidate profile matched your authenticated account in this election.
              </div>
            )}
          </div>
        </ScreenCard>
      </div>
    </RequireAuth>
  );
}

function CandidateCampaignDetails({ user, elections, selectedElectionId, onSelectElection }) {
  const [campaigns, setCampaigns] = useState(null);
  const [error, setError] = useState("");
  const selectedElection =
    elections.find((item) => String(item.id) === String(selectedElectionId)) || elections[0] || null;

  useEffect(() => {
    if (!selectedElection) {
      return;
    }
    let ignore = false;
    fetchCampaigns(selectedElection.id)
      .then((response) => {
        if (!ignore) {
          setCampaigns(response);
          setError("");
        }
      })
      .catch((requestError) => {
        if (!ignore) {
          setError(requestError.message);
          setCampaigns(null);
        }
      });
    return () => {
      ignore = true;
    };
  }, [selectedElection]);

  const entry =
    campaigns?.positions?.flatMap((position) =>
      position.candidates
        .filter((candidate) => String(candidate.user.id) === String(user?.id))
        .map((candidate) => ({ ...candidate, positionName: position.name })),
    )[0] || null;

  return (
    <RequireAuth user={user}>
      <div className="page-stack">
        <ScreenCard
          step={5}
          section="Candidate"
          title="Campaign Details"
          subtitle="Candidate compaindetails screen styled for manifesto and video submission flow."
        >
          <div className="soft-panel">
            <label className="field-label">Selected Election</label>
            <ElectionSelector
              elections={elections}
              selectedElectionId={selectedElectionId}
              onSelectElection={onSelectElection}
            />
          </div>
          {error ? <div className="error-banner top-space">{error}</div> : null}
          <div className="panel-grid two-col top-space">
            <div className="soft-panel">
              <h3>Current Backend Campaign</h3>
              {entry ? (
                <div className="stack-sm">
                  <div className="metric-card">
                    <span>Name</span>
                    <strong>{entry.user.full_name}</strong>
                  </div>
                  <div className="metric-card">
                    <span>Position</span>
                    <strong>{entry.positionName}</strong>
                  </div>
                  <div className="metric-card">
                    <span>Slogan</span>
                    <strong>{entry.slogan || "No slogan"}</strong>
                  </div>
                  <div className="comment-card">
                    <h4>Manifesto</h4>
                    <p>{entry.manifesto || "No manifesto published."}</p>
                  </div>
                </div>
              ) : (
                <div className="info-note">No candidate profile was found for this account.</div>
              )}
            </div>
            <div className="soft-panel">
              <h3>Styled Submission Form</h3>
              <div className="form-stack">
                <div>
                  <label className="field-label">Compain Title</label>
                  <input className="field-input" placeholder="Education, healthcare, leadership..." />
                </div>
                <div>
                  <label className="field-label">Manifesto Summary</label>
                  <textarea className="field-input field-textarea" placeholder="Write campaign goals..." />
                </div>
                <div>
                  <label className="field-label">Video Duration</label>
                  <input className="field-input" value="00:30" readOnly />
                </div>
                <button className="primary-button" type="button">
                  Campaign Editing API Pending
                </button>
                <div className="info-note">
                  The current backend does not expose a candidate campaign write endpoint. This
                  screen is ready for the requested UX and can be wired immediately when that API is
                  added.
                </div>
              </div>
            </div>
          </div>
        </ScreenCard>
      </div>
    </RequireAuth>
  );
}

export default function App() {
  const [token, setToken] = useState(() => window.localStorage.getItem(TOKEN_KEY) || "");
  const [user, setUser] = useState(null);
  const [elections, setElections] = useState([]);
  const [selectedElectionId, setSelectedElectionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [appError, setAppError] = useState("");

  useEffect(() => {
    let ignore = false;
    Promise.allSettled([fetchHealth(), fetchElections()]).then(([healthResult, electionsResult]) => {
      if (ignore) {
        return;
      }
      if (healthResult.status === "rejected") {
        setAppError(healthResult.reason.message);
      }
      if (electionsResult.status === "fulfilled") {
        setElections(electionsResult.value);
        const preferred =
          electionsResult.value.find((entry) => entry.status === "active") ||
          electionsResult.value.find((entry) => entry.status === "upcoming") ||
          electionsResult.value[0];
        setSelectedElectionId(preferred ? String(preferred.id) : null);
      } else {
        setAppError(electionsResult.reason.message);
      }
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    let ignore = false;
    fetchCurrentUser(token)
      .then((response) => {
        if (!ignore) {
          setUser(response);
        }
      })
      .catch(() => {
        if (!ignore) {
          window.localStorage.removeItem(TOKEN_KEY);
          setToken("");
          setUser(null);
        }
      });
    return () => {
      ignore = true;
    };
  }, [token]);

  async function handleLogin(credentials) {
    const response = await login(credentials);
    window.localStorage.setItem(TOKEN_KEY, response.token);
    setToken(response.token);
    setUser(response.user);
    return response.user;
  }

  async function handleLogout() {
    if (token) {
      try {
        await logout(token);
      } catch {
        // Local cleanup is enough.
      }
    }
    window.localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
  }

  if (loading) {
    return (
      <AppShell user={user} onLogout={handleLogout}>
        <div className="center-state">Loading election flow...</div>
      </AppShell>
    );
  }

  return (
    <AppShell user={user} onLogout={handleLogout}>
      {appError ? <div className="error-banner">{appError}</div> : null}
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route
          path="/home"
          element={
            <HomePage
              elections={elections}
              selectedElectionId={selectedElectionId}
              onSelectElection={setSelectedElectionId}
              user={user}
            />
          }
        />
        <Route path="/admin/login" element={<LoginPage role="admin" user={user} onLogin={handleLogin} />} />
        <Route path="/voter/login" element={<LoginPage role="voter" user={user} onLogin={handleLogin} />} />
        <Route path="/candidate/login" element={<LoginPage role="candidate" user={user} onLogin={handleLogin} />} />
        <Route path="/admin/register" element={<RegisterPage role="admin" />} />
        <Route path="/voter/register" element={<RegisterPage role="voter" />} />
        <Route
          path="/admin/dashboard"
          element={
            <AdminDashboard
              user={user}
              elections={elections}
              selectedElectionId={selectedElectionId}
              onSelectElection={setSelectedElectionId}
            />
          }
        />
        <Route
          path="/voter/dashboard"
          element={
            <VoterDashboard
              user={user}
              token={token}
              elections={elections}
              selectedElectionId={selectedElectionId}
              onSelectElection={setSelectedElectionId}
            />
          }
        />
        <Route path="/voter/dashboad" element={<Navigate to="/voter/dashboard" replace />} />
        <Route
          path="/voter/compain"
          element={
            <VoterCampaigns
              user={user}
              elections={elections}
              selectedElectionId={selectedElectionId}
              onSelectElection={setSelectedElectionId}
            />
          }
        />
        <Route
          path="/candidate/dashboard"
          element={
            <CandidateDashboard
              user={user}
              token={token}
              elections={elections}
              selectedElectionId={selectedElectionId}
              onSelectElection={setSelectedElectionId}
            />
          }
        />
        <Route path="/candidate/dashboad" element={<Navigate to="/candidate/dashboard" replace />} />
        <Route
          path="/candidate/compaindetails"
          element={
            <CandidateCampaignDetails
              user={user}
              elections={elections}
              selectedElectionId={selectedElectionId}
              onSelectElection={setSelectedElectionId}
            />
          }
        />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </AppShell>
  );
}
