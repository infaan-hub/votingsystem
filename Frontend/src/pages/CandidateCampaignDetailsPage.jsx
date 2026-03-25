import { useEffect, useState } from "react";

import { fetchCampaigns, updateCandidateCampaign } from "../api";
import ElectionSelector from "../components/ElectionSelector";
import RequireAuth from "../components/RequireAuth";
import ScreenCard from "../components/ScreenCard";

export default function CandidateCampaignDetailsPage({
  user,
  token,
  elections,
  selectedElectionId,
  onSelectElection,
}) {
  const [campaigns, setCampaigns] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    campaign_title: "",
    campaign_manifesto: "",
    campaign_video_link: "",
  });
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

  const entry =
    campaigns?.positions?.flatMap((position) =>
      position.candidates
        .filter((candidate) => String(candidate.user.id) === String(user?.id))
        .map((candidate) => ({ ...candidate, positionName: position.name })),
    )[0] || null;

  useEffect(() => {
    setCampaignForm({
      campaign_title: entry?.slogan || "",
      campaign_manifesto: entry?.manifesto || "",
      campaign_video_link: entry?.campaign_video_url || "",
    });
  }, [entry]);

  async function handleSaveCampaign() {
    if (!selectedElection || !token || !entry) {
      setSuccess("");
      setError("No candidate profile was found for this account.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const updatedEntry = await updateCandidateCampaign(selectedElection.id, campaignForm, token);
      setCampaigns((current) => {
        if (!current?.positions) {
          return current;
        }
        return {
          ...current,
          positions: current.positions.map((position) => ({
            ...position,
            candidates: position.candidates.map((candidate) =>
              candidate.id === updatedEntry.id ? updatedEntry : candidate,
            ),
          })),
        };
      });
      setSuccess("Campaign details saved successfully.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RequireAuth user={user} loginPath="/candidate/login">
      <div className="page-stack">
        <ScreenCard
          step={5}
          section="Candidate"
          title="Campaign Details"
          subtitle="Add compain details, include video 00:30, and publish for voters."
        >
          <div className="soft-panel">
            <label className="field-label" htmlFor="candidate-campaign-election-select">
              Selected Election
            </label>
            <ElectionSelector
              elections={elections}
              selectedElectionId={selectedElectionId}
              onSelectElection={onSelectElection}
              inputId="candidate-campaign-election-select"
              inputName="candidate_campaign_election"
            />
          </div>
          {success ? <div className="success-banner top-space">{success}</div> : null}
          {error ? <div className="error-banner top-space">{error}</div> : null}
          <div className="panel-grid two-col top-space">
            <div className="soft-panel">
              <h3>Current Campaign</h3>
              {entry ? (
                <div className="stack-sm">
                  <div className="metric-card">
                    <span>Name</span>
                    <strong>{entry.user.full_name}</strong>
                  </div>
                  <div className="metric-card">
                    <span>Position</span>
                    <strong>{entry.positionName}</strong>
                  </div>
                  <div className="metric-card">
                    <span>Slogan</span>
                    <strong>{entry.slogan || "No slogan"}</strong>
                  </div>
                  <div className="comment-card">
                    <h4>Manifesto</h4>
                    <p>{entry.manifesto || "No manifesto published."}</p>
                  </div>
                  <div className="metric-card">
                    <span>Video Link</span>
                    <strong>{entry.campaign_video_url || "No video link saved."}</strong>
                  </div>
                </div>
              ) : (
                <div className="info-note">No candidate profile was found for this account.</div>
              )}
            </div>
            <div className="soft-panel">
              <h3>Campaign Form</h3>
              <div className="form-stack">
                <div>
                  <label className="field-label" htmlFor="campaign-title">
                    Compain Title
                  </label>
                  <input
                    id="campaign-title"
                    name="campaign_title"
                    className="field-input"
                    placeholder="Education, healthcare, leadership..."
                    value={campaignForm.campaign_title}
                    onChange={(event) =>
                      setCampaignForm((current) => ({ ...current, campaign_title: event.target.value }))
                    }
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="campaign-manifesto">
                    Manifesto Summary
                  </label>
                  <textarea
                    id="campaign-manifesto"
                    name="campaign_manifesto"
                    className="field-input field-textarea"
                    placeholder="Write campaign goals..."
                    value={campaignForm.campaign_manifesto}
                    onChange={(event) =>
                      setCampaignForm((current) => ({ ...current, campaign_manifesto: event.target.value }))
                    }
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="campaign-video-duration">
                    Video Duration
                  </label>
                  <input
                    id="campaign-video-duration"
                    name="campaign_video_duration"
                    className="field-input"
                    value="00:30"
                    readOnly
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="campaign-video-link">
                    Video Link
                  </label>
                  <input
                    id="campaign-video-link"
                    name="campaign_video_link"
                    className="field-input"
                    placeholder="https://example.com/campaign-video.mp4"
                    value={campaignForm.campaign_video_link}
                    onChange={(event) =>
                      setCampaignForm((current) => ({ ...current, campaign_video_link: event.target.value }))
                    }
                    disabled={submitting}
                  />
                </div>
                <button className="primary-button" type="button" onClick={handleSaveCampaign} disabled={submitting}>
                  {submitting ? "Saving Campaign..." : "Save Campaign Details"}
                </button>
                <div className="info-note">
                  Share your message clearly so voters can understand your goals and watch your
                  short campaign video.
                </div>
              </div>
            </div>
          </div>
        </ScreenCard>
      </div>
    </RequireAuth>
  );
}
