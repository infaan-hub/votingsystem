import ScreenCard from "../components/ScreenCard";

export default function RegisterPage({ role }) {
  const fields =
    role === "admin"
      ? ["Full Name", "Email", "Staff ID", "Department"]
      : ["First Name", "Last Name", "Email", "Registration Number"];

  return (
    <div className="page-stack">
      <ScreenCard
        step={2}
        section="Authentication"
        title={role === "admin" ? "Admin Register" : "Voter Register"}
        subtitle="Styled registration route matching the requested page flow."
      >
        <div className="panel-grid two-col">
          {fields.map((field) => (
            <div key={field}>
              <label className="field-label">{field}</label>
              <input className="field-input" placeholder={field} />
            </div>
          ))}
          <div className="span-2 info-note">
            The current backend exposes login, election, ballot, campaigns, stats, and results
            APIs. Registration write APIs are not exposed yet, so this page is prepared in the
            route flow and ready to connect when those endpoints exist.
          </div>
          <div className="span-2">
            <button className="primary-button" type="button">
              Registration API Pending
            </button>
          </div>
        </div>
      </ScreenCard>
    </div>
  );
}
