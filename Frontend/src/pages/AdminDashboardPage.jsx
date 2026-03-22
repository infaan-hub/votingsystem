import { useEffect, useState } from "react";

import { fetchElectionDetail, fetchResults, fetchStats } from "../api";
import ElectionSelector from "../components/ElectionSelector";
import RequireAuth from "../components/RequireAuth";
import ScreenCard from "../components/ScreenCard";
import { formatDateTime, formatStatus, useCountdown } from "../utils";

export default function AdminDashboardPage({ user, elections, selectedElectionId, onSelectElection }) {
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
    <RequireAuth user={user} allowAdmin loginPath="/admin/login">
      <div className="page-stack">
        <ScreenCard
          step={3}
          section="Administration"
          title="Admin Dashboard"
          subtitle="Register candidates, register voters, set election time and review published data."
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
              <h3>Admin Functions</h3>
              <div className="action-note-list">
                <div className="info-note">Register candidates page structure is ready here.</div>
                <div className="info-note">Register voters page structure is ready here.</div>
                <div className="info-note">Set election date, time, and deadline UI is represented here.</div>
                <div className="info-note">Post election notices countdown flow is represented here.</div>
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
