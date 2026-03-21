import { getInitials } from "../utils";

export default function CandidateCard({
  candidate,
  scope,
  actionLabel,
  onAction,
  disabled,
  footer,
}) {
  const candidateName = candidate.user?.full_name || candidate.user?.username || "Candidate";
  const videoUrl = candidate.campaign_video_url || candidate.video_url || "";
  const videoDuration = candidate.campaign_video_duration || "00:30";

  return (
    <article className="candidate-card">
      <div className="candidate-banner">
        <div className="candidate-tags">
          <span className="candidate-tag">{scope}</span>
          {candidate.approved ? <span className="candidate-tag soft">Approved</span> : null}
        </div>

        <div className="candidate-header">
          {candidate.photo_url ? (
            <img className="candidate-photo" src={candidate.photo_url} alt={candidateName} />
          ) : (
            <div className="candidate-avatar">{getInitials(candidateName)}</div>
          )}
          <div>
            <h3>{candidateName}</h3>
            <p className="muted">{candidate.user?.role || "candidate"}</p>
            {candidate.slogan ? <p className="slogan">"{candidate.slogan}"</p> : null}
          </div>
        </div>
      </div>

      <div className="candidate-body">
        <p>{candidate.manifesto || "No campaign manifesto has been published yet."}</p>
        {videoUrl ? (
          <div className="campaign-video">
            <video controls preload="metadata" src={videoUrl} />
            <div className="video-meta">Campaign video {videoDuration}</div>
          </div>
        ) : null}
      </div>

      <div className="candidate-footer">
        {footer ? <p className="footnote">{footer}</p> : null}
        {actionLabel ? (
          <button className="action-button vote-button" onClick={onAction} disabled={disabled}>
            {actionLabel}
          </button>
        ) : null}
      </div>
    </article>
  );
}
