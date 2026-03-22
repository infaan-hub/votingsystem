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
        subtitle="Create your Election Hub account information."
      >
        <div className="panel-grid two-col">
          {fields.map((field) => {
            const fieldKey = field.toLowerCase().replace(/[^a-z0-9]+/g, "_");
            return (
            <div key={field}>
              <label className="field-label" htmlFor={`${role}-${fieldKey}`}>
                {field}
              </label>
              <input
                id={`${role}-${fieldKey}`}
                name={fieldKey}
                className="field-input"
                placeholder={field}
              />
            </div>
            );
          })}
          <div className="span-2 info-note">
            Complete your details here to continue with your Election Hub registration process.
            Election officers can help finalize account access where approval is required.
          </div>
          <div className="span-2">
            <button className="primary-button" type="button">
              Continue Registration
            </button>
          </div>
        </div>
      </ScreenCard>
    </div>
  );
}
