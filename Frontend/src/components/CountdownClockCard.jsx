import { formatDateTime, formatStatus, useCountdownParts } from "../utils";

function padClockUnit(value) {
  return String(Math.max(0, value)).padStart(2, "0");
}

export default function CountdownClockCard({
  eyebrow = "Current",
  title,
  status,
  statusLabel,
  statusTone = "neutral",
  targetLabel,
  targetDate,
  countdownTarget,
  helperText,
  liveLabel,
  liveTone = "dark",
}) {
  const countdown = useCountdownParts(countdownTarget);
  const displaySegments = [
    padClockUnit(countdown.days),
    padClockUnit(countdown.hours),
    padClockUnit(countdown.minutes),
    padClockUnit(countdown.seconds),
  ];

  return (
    <section className="countdown-clock-card">
      <div className="countdown-clock-topline">
        <span className="countdown-clock-brand">{eyebrow}</span>
        <div className="countdown-clock-actions">
          <span className={`countdown-clock-pill is-${statusTone}`}>{statusLabel || formatStatus(status)}</span>
          <span className={`countdown-clock-pill is-${liveTone}`}>
            {liveLabel || (countdown.isComplete ? "Closed" : "Live")}
          </span>
        </div>
      </div>

      <div className="countdown-clock-digits" aria-label="Election countdown">
        {displaySegments.map((segment, index) => (
          <div className="countdown-clock-segment" key={`${segment}-${index}`}>
            <span>{segment}</span>
            {index < displaySegments.length - 1 ? <em>:</em> : null}
          </div>
        ))}
      </div>

      <div className="countdown-clock-meta">
        <div>
          <span>{targetLabel}</span>
          <strong>{targetDate ? formatDateTime(targetDate) : "Not available"}</strong>
        </div>
        <div>
          <span>Remaining</span>
          <strong>{countdown.display}</strong>
        </div>
      </div>

      <div className="countdown-clock-divider" />

      <div className="countdown-clock-footer">
        <div className="countdown-clock-copy">
          <h3>{title}</h3>
          <p>{helperText}</p>
        </div>
        <div className="countdown-clock-mini-grid">
          <div className="countdown-mini-tile">
            <span>Days</span>
            <strong>{padClockUnit(countdown.days)}</strong>
          </div>
          <div className="countdown-mini-tile">
            <span>Hours</span>
            <strong>{padClockUnit(countdown.hours)}</strong>
          </div>
          <div className="countdown-mini-tile is-active">
            <span>Minutes</span>
            <strong>{padClockUnit(countdown.minutes)}</strong>
          </div>
          <div className="countdown-mini-tile">
            <span>Seconds</span>
            <strong>{padClockUnit(countdown.seconds)}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
