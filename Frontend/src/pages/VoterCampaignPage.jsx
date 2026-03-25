import { useEffect, useState } from "react";

import { fetchCampaigns } from "../api";
import ElectionSelector from "../components/ElectionSelector";
import RequireAuth from "../components/RequireAuth";
import ScreenCard from "../components/ScreenCard";

export default function VoterCampaignPage({ user, elections, selectedElectionId, onSelectElection }) {
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
    <RequireAuth user={user} loginPath="/voter/login">
      <div className="page-stack">
        <ScreenCard
          step={5}
          section="Exploration"
          title="Voter Campaign View"
          subtitle="See all compains of candidates for the selected election."
        >
          <div className="soft-panel">
            <label className="field-label" htmlFor="voter-campaign-election-select">
              Selected Election
            </label>
            <ElectionSelector
              elections={elections}
              selectedElectionId={selectedElectionId}
              onSelectElection={onSelectElection}
              inputId="voter-campaign-election-select"
              inputName="voter_campaign_election"
            />
          </div>
          {error ? <div className="error-banner top-space">{error}</div> : null}
          <div className="campaign-column top-space">
            {campaigns?.election?.image_url ? (
              <div className="soft-panel">
                <img
                  className="election-hero-image"
                  src={campaigns.election.image_url}
                  alt={campaigns.election.title}
                />
              </div>
            ) : null}
            {campaigns?.positions?.map((position) => (
              <div className="campaign-block" key={position.id}>
                <div className="campaign-header">
                  <h3>{position.name}</h3>
                  <span>{position.candidates.length} candidates</span>
                </div>
                <div className="campaign-list">
                  {position.candidates.map((candidate) => (
                    <article className="comment-card" key={candidate.id}>
                      {candidate.photo_url ? (
                        <img
                          className="candidate-photo"
                          src={candidate.photo_url}
                          alt={candidate.user.full_name}
                        />
                      ) : null}
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
