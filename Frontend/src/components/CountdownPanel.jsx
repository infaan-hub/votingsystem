import { useEffect, useMemo, useState } from "react";

import { formatCountdown, formatDateTime, getStatusLabel } from "../utils";

export default function CountdownPanel({ election }) {
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const nextTarget = useMemo(() => {
    if (!election) {
      return null;
    }
    if (election.status === "upcoming") {
      return election.voting_start_at;
    }
    if (election.status === "active") {
      return election.voting_end_at;
    }
    return null;
  }, [election, tick]);

  if (!election) {
    return null;
  }

  const countdownParts = nextTarget ? formatCountdown(nextTarget).split(" ") : [];

  return (
    <section className="countdown-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Election Timeline</p>
          <h2>{getStatusLabel(election.status)}</h2>
        </div>
        <span className={`badge badge-${election.status}`}>{getStatusLabel(election.status)}</span>
      </div>

      <div className="countdown-grid">
        <div className="countdown-box">
          <p className="muted">Campaign Window</p>
          <strong>{formatDateTime(election.campaign_start_at)}</strong>
          <span>to {formatDateTime(election.campaign_end_at)}</span>
        </div>
        <div className="countdown-box highlight">
          <p className="muted">
            {election.status === "upcoming" ? "Voting opens in" : "Voting closes in"}
          </p>
          {countdownParts.length ? (
            <div className="countdown-parts">
              {countdownParts.map((part) => (
                <div className="countdown-chip" key={part}>
                  {part}
                </div>
              ))}
            </div>
          ) : (
            <strong>Election closed</strong>
          )}
          <span>
            {election.status === "upcoming"
              ? formatDateTime(election.voting_start_at)
              : formatDateTime(election.voting_end_at)}
          </span>
        </div>
      </div>
    </section>
  );
}
