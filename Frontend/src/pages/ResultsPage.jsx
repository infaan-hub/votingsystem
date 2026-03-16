import { useEffect, useMemo, useState } from "react";

import { fetchResults, subscribeToStats } from "../api";
import StatCard from "../components/StatCard";

function ResultBars({ results = [] }) {
  const highestVote = results[0]?.vote_total || 1;
  return (
    <div className="result-list">
      {results.map((result) => (
        <div className="result-row" key={result.candidate_id}>
          <div className="result-head">
            <div>
              <strong>{result.candidate_name}</strong>
              <p className="muted">
                Rank {result.rank}
                {result.department ? ` | ${result.department}` : ""}
                {result.section ? ` | ${result.section}` : ""}
              </p>
            </div>
            <div className="result-score">
              <span>{result.vote_total} votes</span>
              {result.is_winner ? <span className="scope-pill">Winner</span> : null}
            </div>
          </div>
          <div className="result-bar">
            <div
              className="result-bar-fill"
              style={{ width: `${Math.max((result.vote_total / highestVote) * 100, 10)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ResultsPage({ electionId, token }) {
  const [payload, setPayload] = useState(null);
  const [streamError, setStreamError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!electionId) {
      return;
    }

    let unsubscribe = null;
    let ignore = false;

    fetchResults(electionId, token)
      .then((data) => {
        if (ignore) {
          return;
        }
        setPayload(data);
        setError("");
        unsubscribe = subscribeToStats(
          electionId,
          (eventData) => {
            if (!ignore) {
              setPayload((current) => ({
                ...(current || {}),
                election: current?.election,
                stats: eventData.stats,
                winners: eventData.winners,
              }));
            }
          },
          () => {
            if (!ignore) {
              setStreamError("Live stream unavailable. Showing the latest fetched results.");
            }
          },
        );
      })
      .catch((loadError) => {
        if (!ignore) {
          setError(loadError.message);
        }
      });

    return () => {
      ignore = true;
      unsubscribe?.();
    };
  }, [electionId, token]);

  const positions = useMemo(() => payload?.stats?.positions || [], [payload]);

  if (!electionId) {
    return <section className="empty-state card">No election selected.</section>;
  }

  return (
    <div className="page-stack">
      <section className="page-intro intro-panel">
        <p className="eyebrow">Live Results</p>
        <h2>{payload?.election?.title || "Results dashboard"}</h2>
        <p className="lead">
          View turnout, current leaders, department breakdowns, and final winners when the
          deadline is reached.
        </p>
      </section>

      {error ? <div className="status-banner error">{error}</div> : null}
      {streamError ? <div className="status-banner warning">{streamError}</div> : null}

      {payload?.stats ? (
        <section className="stats-grid">
          <StatCard
            label="Votes Cast"
            value={payload.stats.votes_cast}
            caption="All submitted ballots."
            accent="orange"
          />
          <StatCard
            label="Turnout"
            value={`${payload.stats.turnout_percentage}%`}
            caption={`${payload.stats.turnout_voters} voters have participated.`}
            accent="emerald"
          />
          <StatCard
            label="Candidates"
            value={payload.stats.candidate_count}
            caption="Approved campaign profiles."
            accent="default"
          />
          <StatCard
            label="Election Status"
            value={payload.stats.status}
            caption="Live stream refreshes every five seconds."
            accent="slate"
          />
        </section>
      ) : null}

      {payload?.winners?.length ? (
        <section className="card section-surface">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Winner Announcement</p>
              <h2>Current leaders by scope</h2>
            </div>
          </div>
          <div className="winner-grid">
            {payload.winners.map((winner) => (
              <article className="winner-card" key={`${winner.position}-${winner.scope}`}>
                <p className="muted">{winner.scope}</p>
                <h3>{winner.position}</h3>
                <strong>{winner.winner_names}</strong>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {positions.map((position) => (
        <section className="card section-surface" key={position.id}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                {position.section || position.department || "Entire campus"}
              </p>
              <h2>{position.name}</h2>
            </div>
            <span className="badge badge-soft">
              {position.votes_cast} / {position.registered_voters} votes
            </span>
          </div>
          <ResultBars results={position.results} />
        </section>
      ))}
    </div>
  );
}
