export default function StatCard({ label, value, caption, accent = "default" }) {
  return (
    <article className={`stat-card stat-${accent}`}>
      <div className="stat-head">
        <p className="stat-label">{label}</p>
        <span className="stat-glow" />
      </div>
      <h3>{value}</h3>
      {caption ? <p className="muted">{caption}</p> : null}
    </article>
  );
}
