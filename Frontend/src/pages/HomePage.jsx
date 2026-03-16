import { useEffect, useState } from "react";

import { fetchElectionDetail, fetchStats } from "../api";
import CountdownPanel from "../components/CountdownPanel";
import StatCard from "../components/StatCard";
import { formatDateTime, getScopeLabel } from "../utils";

export default function HomePage({ electionId, token }) {
  const [detail, setDetail] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!electionId) {
      return;
    }

    let ignore = false;
    async function loadData() {
      try {
        const [detailData, statsData] = await Promise.allSettled([
          fetchElectionDetail(electionId),
          fetchStats(electionId, token),
        ]);
        if (ignore) {
          return;
        }
        if (detailData.status === "fulfilled") {
          setDetail(detailData.value);
        }
        if (statsData.status === "fulfilled") {
          setStats(statsData.value);
        } else {
          setStats(null);
        }
        setError("");
      } catch (loadError) {
        if (!ignore) {
          setError(loadError.message);
        }
      }
    }

    loadData();
    return () => {
      ignore = true;
    };
  }, [electionId, token]);

  if (!electionId) {
    return <section className="empty-state card">Create an election to get started.</section>;
  }

  return (
    <div className="page-stack">
      {error ? <div className="status-banner error">{error}</div> : null}

      <section className="hero-grid">
        <article className="page-intro intro-panel">
          <p className="eyebrow">Election Overview</p>
          <h2>{detail?.title || "Loading election..."}</h2>
          <p className="lead">
            {detail?.description ||
              "Campaigns, voting schedules, and result visibility are all managed here."}
          </p>
          <div className="intro-mini-grid">
            <div className="mini-tile">
              <span>Voting Starts</span>
              <strong>{formatDateTime(detail?.voting_start_at)}</strong>
            </div>
            <div className="mini-tile">
              <span>Voting Ends</span>
              <strong>{formatDateTime(detail?.voting_end_at)}</strong>
            </div>
            <div className="mini-tile live-tile">
              <span>Results Mode</span>
              <strong>{detail?.allow_live_results ? "Visible live" : "Hidden until close"}</strong>
            </div>
          </div>
        </article>

        <CountdownPanel election={detail} />
      </section>

      <section className="stats-grid">
        <StatCard
          label="Registered Voters"
          value={stats?.registered_voters ?? "--"}
          caption="Eligible students and staff in this election."
          accent="emerald"
        />
        <StatCard
          label="Votes Cast"
          value={stats?.votes_cast ?? "--"}
          caption="Total submitted ballots across all positions."
          accent="orange"
        />
        <StatCard
          label="Turnout"
          value={stats ? `${stats.turnout_percentage}%` : "--"}
          caption="Unique voters who have participated."
          accent="slate"
        />
        <StatCard
          label="Leadership Seats"
          value={stats?.position_count ?? detail?.positions?.length ?? "--"}
          caption="Department, section, or worker positions."
          accent="default"
        />
      </section>

      <section className="split-grid">
        <article className="card section-surface">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Announcements</p>
              <h2>Election board</h2>
            </div>
          </div>
          <div className="notice-list">
            {detail?.announcements?.length ? (
              detail.announcements.map((announcement) => (
                <article className="notice-item" key={announcement.id}>
                  <div className="notice-pill">{announcement.announcement_type}</div>
                  <div>
                    <h3>{announcement.title}</h3>
                    <p>{announcement.message}</p>
                  </div>
                </article>
              ))
            ) : (
              <p className="muted">No announcements have been posted yet.</p>
            )}
          </div>
        </article>

        <article className="card section-surface">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Leadership Seats</p>
              <h2>Ballot structure</h2>
            </div>
          </div>
          <div className="position-list">
            {detail?.positions?.map((position) => (
              <article className="position-item" key={position.id}>
                <div>
                  <h3>{position.name}</h3>
                  <p className="muted">{getScopeLabel(position)}</p>
                </div>
                <div className="position-meta">
                  <span>{position.voter_group_label}</span>
                  <strong>{position.candidates?.length || 0} candidates</strong>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
