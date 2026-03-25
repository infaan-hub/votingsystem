import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchBallot, fetchCampaigns, resolveMediaUrl, voteForCandidate } from "../api";
import ElectionSelector from "../components/ElectionSelector";
import RequireAuth from "../components/RequireAuth";
import ScreenCard from "../components/ScreenCard";
import { formatStatus } from "../utils";

export default function VoterDashboardPage({
  user,
  token,
  elections,
  selectedElectionId,
  onSelectElection,
}) {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState(null);
  const [ballot, setBallot] = useState(null);
  const [voteMessage, setVoteMessage] = useState("");
  const [error, setError] = useState("");
  const selectedElection =
    elections.find((item) => String(item.id) === String(selectedElectionId)) || elections[0] || null;

  async function loadVoterData(electionId) {
    const [campaignResult, ballotResult] = await Promise.allSettled([
      fetchCampaigns(electionId),
      fetchBallot(electionId, token),
    ]);
    setCampaigns(campaignResult.status === "fulfilled" ? campaignResult.value : null);
    setBallot(ballotResult.status === "fulfilled" ? ballotResult.value : null);
    const firstFailure = [campaignResult, ballotResult].find((item) => item.status === "rejected");
    setError(firstFailure?.reason?.message || "");
  }

  useEffect(() => {
    if (!selectedElection || !token) {
      return;
    }
    let ignore = false;
    loadVoterData(selectedElection.id).catch((requestError) => {
      if (!ignore) {
        setError(requestError.message);
      }
    });
    return () => {
      ignore = true;
    };
  }, [selectedElection, token]);

  async function handleVote(candidateId) {
    if (!selectedElection) {
      return;
    }
    try {
      const response = await voteForCandidate(candidateId, token);
      setVoteMessage(`Vote recorded for ${response.candidate}.`);
      await loadVoterData(selectedElection.id);
      setError("");
    } catch (requestError) {
      setVoteMessage("");
      setError(requestError.message);
    }
  }

  return (
    <RequireAuth user={user} loginPath="/voter/login">
      <div className="page-stack">
        <ScreenCard
          step={3}
          section="Voting"
          title="Voter Dashboard"
          subtitle="See all elections, select one election, and vote from the secure ballot."
        >
          <div className="panel-grid two-col">
            <div className="soft-panel">
              <label className="field-label" htmlFor="voter-election-select">
                Select Election
              </label>
              <ElectionSelector
                elections={elections}
                selectedElectionId={selectedElectionId}
                onSelectElection={onSelectElection}
                inputId="voter-election-select"
                inputName="voter_election"
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
                const candidatePhoto = resolveMediaUrl(candidate.photo || candidate.photo_url);
                return (
                  <article className="candidate-card" key={`${position.id}-${candidate.id}`}>
                    {candidatePhoto ? (
                      <img
                        className="candidate-photo"
                        src={candidatePhoto}
                        alt={candidate.user.full_name}
                      />
                    ) : (
                      <div className="candidate-photo candidate-photo-placeholder" />
                    )}
                    <div className="candidate-copy">
                      <div className="candidate-role">{position.name}</div>
                      <h3>{candidate.user.full_name}</h3>
                      <p>{candidate.slogan || "No slogan provided."}</p>
                      <div className="candidate-meta">
                        <span>{candidate.user.department?.name || "General scope"}</span>
                        <span>{candidate.vote_total ?? 0} votes</span>
                      </div>
                      <button
                        className={alreadyVoted ? "primary-button vote-recorded-button" : "primary-button"}
                        type="button"
                        disabled={!ballot?.is_voting_open || alreadyVoted}
                        onClick={() => handleVote(candidate.id)}
                      >
                        {alreadyVoted ? "Vote Recorded" : "Vote Candidate"}
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => navigate("/voter/compain")}
                      >
                        View Campaign
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
