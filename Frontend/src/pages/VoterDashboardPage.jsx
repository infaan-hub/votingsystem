import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchBallot, fetchCampaigns, resolveMediaUrl, voteForCandidate } from "../api";
import CountdownClockCard from "../components/CountdownClockCard";
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
  const voterStatusLabel =
    selectedElection?.status === "active"
      ? "Vote now"
      : selectedElection?.status === "ended"
        ? "Ended"
        : "Waiting voting time";
  const voterStatusTone =
    selectedElection?.status === "active"
      ? "green"
      : selectedElection?.status === "ended"
        ? "red"
        : "orange";

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
              <CountdownClockCard
                eyebrow="Voter Countdown"
                title={selectedElection?.title || "Voting Clock"}
                status={selectedElection?.status}
                statusLabel={voterStatusLabel}
                statusTone={voterStatusTone}
                targetLabel={selectedElection?.status === "upcoming" ? "Voting opens" : "Voting deadline"}
                targetDate={
                  selectedElection?.status === "upcoming"
                    ? selectedElection?.voting_start_at
                    : selectedElection?.voting_end_at
                }
                countdownTarget={
                  selectedElection?.status === "upcoming"
                    ? selectedElection?.voting_start_at
                    : selectedElection?.status === "active"
                      ? selectedElection?.voting_end_at
                      : null
                }
                helperText="Stay on time. Vote during the active window before the election closes."
                liveLabel={ballot?.is_voting_open ? "Ballot open" : "Ballot closed"}
                liveTone={ballot?.is_voting_open ? "green" : "dark"}
              />
              <h3 className="top-space">Ballot Status</h3>
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
              position.candidates.map((candidate, candidateIndex) => {
                const alreadyVoted = ballot?.voted_position_ids?.includes(position.id);
                const candidatePhoto = resolveMediaUrl(candidate.photo || candidate.photo_url);
                return (
                  <article className="ballot-flyer-card" key={`${position.id}-${candidate.id}`}>
                    <div className="ballot-flyer-brand">VOTE</div>
                    <div className="ballot-flyer-banner">
                      <span className="ballot-flyer-number-badge">NUMBER {candidateIndex + 1}</span>
                      <strong>ON THE BALLOT</strong>
                    </div>
                    <div className="ballot-flyer-grid">
                      <div className="ballot-flyer-slot ballot-flyer-slot-number">{candidateIndex + 1}</div>
                      <div className="ballot-flyer-slot ballot-flyer-slot-photo">
                        {candidatePhoto ? (
                          <img
                            className="ballot-flyer-photo"
                            src={candidatePhoto}
                            alt={candidate.user.full_name}
                          />
                        ) : (
                          <div className="ballot-flyer-photo ballot-flyer-photo-placeholder" />
                        )}
                      </div>
                      <div className="ballot-flyer-slot ballot-flyer-slot-name">
                        <span>{candidate.user.full_name}</span>
                        <strong>{position.name}</strong>
                      </div>
                      <button
                        className={`ballot-flyer-slot ballot-flyer-slot-vote ${
                          alreadyVoted ? "is-recorded" : ""
                        }`}
                        type="button"
                        disabled={!ballot?.is_voting_open || alreadyVoted}
                        onClick={() => handleVote(candidate.id)}
                      >
                        <span className="ballot-flyer-vote-mark">{alreadyVoted ? "✓" : "□"}</span>
                        <em>{alreadyVoted ? "Vote accepted" : "Touch to vote"}</em>
                      </button>
                    </div>
                    <div className="ballot-flyer-footer">
                      <div className="ballot-flyer-meta">
                        <span>{candidate.user.department?.name || "General scope"}</span>
                        <span>{candidate.vote_total ?? 0} votes</span>
                      </div>
                      <p>{candidate.slogan || "Ready to deliver. Let's change the narrative."}</p>
                    </div>
                    <button
                      className="secondary-button top-space"
                      type="button"
                      onClick={() => navigate(`/voter/compain/${candidate.id}`)}
                    >
                      View Campaign
                    </button>
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
