import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchBallot, voteForCandidate } from "../api";
import CandidateCard from "../components/CandidateCard";
import { getScopeLabel } from "../utils";

export default function VotePage({ electionId, token, user }) {
  const [ballot, setBallot] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submittingCandidateId, setSubmittingCandidateId] = useState(null);

  useEffect(() => {
    if (!electionId || !token) {
      return;
    }
    let ignore = false;
    fetchBallot(electionId, token)
      .then((data) => {
        if (!ignore) {
          setBallot(data);
          setError("");
        }
      })
      .catch((loadError) => {
        if (!ignore) {
          setError(loadError.message);
        }
      });
    return () => {
      ignore = true;
    };
  }, [electionId, token]);

  async function handleVote(candidateId, candidateName, positionName) {
    const confirmed = window.confirm(
      `Submit your vote for ${candidateName} as ${positionName}? This cannot be changed later.`,
    );
    if (!confirmed) {
      return;
    }

    try {
      setSubmittingCandidateId(candidateId);
      setError("");
      setSuccess("");
      await voteForCandidate(candidateId, token);
      const refreshed = await fetchBallot(electionId, token);
      setBallot(refreshed);
      setSuccess(`Your vote for ${positionName} was recorded successfully.`);
    } catch (voteError) {
      setError(voteError.message);
    } finally {
      setSubmittingCandidateId(null);
    }
  }

  if (!user) {
    return (
      <section className="empty-state card section-surface">
        <h2>Login required</h2>
        <p className="muted">Only authenticated students and staff can access the ballot.</p>
        <Link className="action-button" to="/login">
          Go to login
        </Link>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-intro intro-panel">
        <p className="eyebrow">Secure Ballot</p>
        <h2>Welcome, {user.full_name || user.username}</h2>
        <p className="lead">
          Vote once per position. Your eligible ballot is filtered by your department,
          section, and user role.
        </p>
        <div className="intro-mini-grid">
          <div className="mini-tile">
            <span>Department</span>
            <strong>{user.department?.name || "Campus"}</strong>
          </div>
          <div className="mini-tile">
            <span>Section</span>
            <strong>{user.section?.name || "Open scope"}</strong>
          </div>
        </div>
      </section>

      {error ? <div className="status-banner error">{error}</div> : null}
      {success ? <div className="status-banner success">{success}</div> : null}

      {!ballot?.is_voting_open ? (
        <div className="status-banner warning">
          Voting is not currently open for this election.
        </div>
      ) : null}

      {ballot?.positions?.map((position) => {
        const hasVoted = ballot.voted_position_ids?.includes(position.id);
        return (
          <section className="card section-surface" key={position.id}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">{getScopeLabel(position)}</p>
                <h2>{position.name}</h2>
              </div>
              <span className={`badge ${hasVoted ? "badge-ended" : "badge-soft"}`}>
                {hasVoted ? "Vote recorded" : "Open"}
              </span>
            </div>

            <div className="candidate-grid">
              {position.candidates?.map((candidate) => {
                const candidateName =
                  candidate.user?.full_name || candidate.user?.username || "Candidate";
                return (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    scope={getScopeLabel(position)}
                    actionLabel={hasVoted ? "Vote locked" : "Vote now"}
                    onAction={() =>
                      handleVote(candidate.id, candidateName, position.name)
                    }
                    disabled={
                      hasVoted ||
                      !ballot.is_voting_open ||
                      submittingCandidateId === candidate.id
                    }
                    footer={
                      hasVoted
                        ? "You have already voted for this seat."
                        : `Eligible group: ${position.voter_group_label}`
                    }
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
