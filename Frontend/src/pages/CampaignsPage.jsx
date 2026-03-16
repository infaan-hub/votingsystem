import { useEffect, useState } from "react";

import { fetchCampaigns } from "../api";
import CandidateCard from "../components/CandidateCard";
import { getScopeLabel } from "../utils";

export default function CampaignsPage({ electionId }) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!electionId) {
      return;
    }
    let ignore = false;
    fetchCampaigns(electionId)
      .then((data) => {
        if (!ignore) {
          setPayload(data);
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
  }, [electionId]);

  if (!electionId) {
    return <section className="empty-state card">No election selected.</section>;
  }

  return (
    <div className="page-stack">
      <section className="page-intro intro-panel">
        <p className="eyebrow">Campaign Showcase</p>
        <h2>{payload?.election?.title || "Candidate campaigns"}</h2>
        <p className="lead">
          Browse manifestos, leadership messages, and department-specific positions before
          voting.
        </p>
      </section>

      {error ? <div className="status-banner error">{error}</div> : null}

      {payload?.positions?.map((position) => (
        <section className="card section-surface" key={position.id}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">{getScopeLabel(position)}</p>
              <h2>{position.name}</h2>
            </div>
            <span className="badge badge-soft">{position.voter_group_label}</span>
          </div>

          <div className="candidate-grid">
            {position.candidates?.length ? (
              position.candidates.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  scope={getScopeLabel(position)}
                  footer={candidate.approved ? "Approved for ballot" : "Awaiting approval"}
                />
              ))
            ) : (
              <p className="muted">No campaign profiles have been published for this position.</p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
