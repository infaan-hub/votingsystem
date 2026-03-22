import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchCampaigns, fetchResults } from "../api";
import ElectionSelector from "../components/ElectionSelector";
import RequireAuth from "../components/RequireAuth";
import ScreenCard from "../components/ScreenCard";
import { useCountdown } from "../utils";

export default function CandidateDashboardPage({
  user,
  token,
  elections,
  selectedElectionId,
  onSelectElection,
}) {
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
    <RequireAuth user={user} loginPath="/candidate/login">
      <div className="page-stack">
        <ScreenCard
          step={3}
          section="Candidate"
          title="Candidate Dashboard"
          subtitle="Countdown, voted count, and the decision winner or looser state."
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
          subtitle="Open campaign details and review your published candidate profile."
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
