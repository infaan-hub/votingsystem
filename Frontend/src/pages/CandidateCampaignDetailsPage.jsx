import { useEffect, useRef, useState } from "react";

import { fetchCampaigns, resolveMediaUrl, updateCandidateCampaign } from "../api";
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
    campaign_video: null,
  });
  const [campaignVideoPreviewUrl, setCampaignVideoPreviewUrl] = useState("");
  const previewObjectUrlRef = useRef("");
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
      campaign_video: null,
    });
  }, [entry]);

  useEffect(() => {
    if (!(campaignForm.campaign_video instanceof File)) {
      setCampaignVideoPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(campaignForm.campaign_video);
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
    }
    previewObjectUrlRef.current = objectUrl;
    setCampaignVideoPreviewUrl(objectUrl);
    return undefined;
  }, [campaignForm.campaign_video]);

  useEffect(
    () => () => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }
    },
    [],
  );

  async function handleSaveCampaign() {
    if (!selectedElection || !token || !entry) {
      setSuccess("");
      setError("No candidate profile was found for this account.");
      return;
    }
    if (campaignForm.campaign_video) {
      if (campaignForm.campaign_video.type !== "video/mp4") {
        setSuccess("");
        setError("Campaign video must be an MP4 file.");
        return;
      }
      if (campaignForm.campaign_video.size > 50 * 1024 * 1024) {
        setSuccess("");
        setError("Campaign video must be 50MB or smaller.");
        return;
      }
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
                    <span>Campaign Video</span>
                    <strong>{entry.campaign_video_url ? "Saved MP4 video" : "No campaign video saved."}</strong>
                  </div>
                  {entry.campaign_video_url ? (
                    <video
                      className="candidate-video"
                      controls
                      preload="metadata"
                      src={resolveMediaUrl(entry.campaign_video_url)}
                    >
                      Your browser does not support MP4 playback.
                    </video>
                  ) : null}
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
                  <label className="field-label" htmlFor="campaign-video-file">
                    Campaign Video (MP4)
                  </label>
                  <input
                    id="campaign-video-file"
                    name="campaign_video"
                    className="field-input"
                    type="file"
                    accept="video/mp4"
                    onChange={(event) =>
                      setCampaignForm((current) => ({
                        ...current,
                        campaign_video: event.target.files?.[0] || null,
                      }))
                    }
                    disabled={submitting}
                  />
                  {campaignVideoPreviewUrl ? (
                    <video className="candidate-video top-space" controls preload="metadata" src={campaignVideoPreviewUrl}>
                      Your browser does not support MP4 playback.
                    </video>
                  ) : null}
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
