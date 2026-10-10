export default function ScreenCard({ section, title, subtitle, children }) {
  return (
    <section className="screen-card">
      <div className="screen-card-head">
        <div>
          <div className="screen-section">{section}</div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="screen-card-body">{children}</div>
    </section>
  );
}
