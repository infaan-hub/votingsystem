"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchCampaigns, resolveMediaUrl } from "@/src/lib/api-client";
import ElectionSelector from "@/src/components/ElectionSelector";
import RequireAuth from "@/src/components/RequireAuth";
import ScreenCard from "@/src/components/ScreenCard";

export default function VoterCampaignView({ user, elections, selectedElectionId, onSelectElection }) {
  const params = useParams();
  const candidateId = params?.candidateId;
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

  let selectedEntry = null;
  if (campaigns?.positions && candidateId) {
    for (const position of campaigns.positions) {
      const candidate = position.candidates.find((entry) => String(entry.id) === String(candidateId));
      if (candidate) {
        selectedEntry = { ...candidate, positionName: position.name };
        break;
      }
    }
  }

  return (
    <RequireAuth user={user} loginPath="/voter/login">
      <div className="page-stack">
        <ScreenCard
          step={5}
          section="Exploration"
          title="Candidate Campaign"
          subtitle="View the full posted campaign information for one selected candidate."
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
          {!candidateId ? (
            <div className="info-note top-space">Select a candidate from the voter dashboard to open one campaign.</div>
          ) : null}
          {candidateId && !selectedEntry && !error ? (
            <div className="info-note top-space">No published campaign was found for that candidate in this election.</div>
          ) : null}
          {selectedEntry ? (
            <div className="panel-grid two-col top-space">
              <div className="soft-panel">
                {resolveMediaUrl(selectedEntry.photo || selectedEntry.photo_url) ? (
                  <img
                    className="candidate-photo"
                    src={resolveMediaUrl(selectedEntry.photo || selectedEntry.photo_url)}
                    alt={selectedEntry.user.full_name}
                  />
                ) : (
                  <div className="candidate-photo candidate-photo-placeholder" />
                )}
              </div>
              <div className="soft-panel form-stack">
                <div className="metric-card">
                  <span>Candidate</span>
                  <strong>{selectedEntry.user.full_name}</strong>
                </div>
                <div className="metric-card">
                  <span>Position</span>
                  <strong>{selectedEntry.positionName}</strong>
                </div>
                <div className="metric-card">
                  <span>Slogan</span>
                  <strong>{selectedEntry.slogan || "No slogan published."}</strong>
                </div>
                <div className="comment-card">
                  <h4>Manifesto</h4>
                  <p>{selectedEntry.manifesto || "No manifesto published."}</p>
                </div>
                <div className="metric-card">
                  <span>Votes</span>
                  <strong>{selectedEntry.vote_total ?? 0}</strong>
                </div>
                {selectedEntry.campaign_video_url ? (
                  <div className="comment-card">
                    <h4>Campaign Video</h4>
                    <video
                      className="candidate-video top-space"
                      controls
                      preload="metadata"
                      src={resolveMediaUrl(selectedEntry.campaign_video_url)}
                    >
                      Your browser does not support MP4 playback.
                    </video>
                  </div>
                ) : (
                  <div className="info-note">This candidate has not posted a campaign video yet.</div>
                )}
              </div>
            </div>
          ) : null}
        </ScreenCard>
      </div>
    </RequireAuth>
  );
}
