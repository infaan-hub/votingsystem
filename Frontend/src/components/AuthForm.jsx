export default function AuthForm({
  title,
  subtitle,
  fields,
  formData,
  onChange,
  onSubmit,
  submitting,
  error,
  submitLabel,
  footer,
}) {
  return (
    <form className="stack-grid" onSubmit={onSubmit}>
      <article className="sheet-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Secure Access</p>
            <h2>{title}</h2>
          </div>
        </div>
        <p className="muted">{subtitle}</p>
        <div className="form-grid">
          {fields.map((field) => (
            <label className="field" key={field.name}>
              <span>{field.label}</span>
              {field.type === "textarea" ? (
                <textarea
                  className="input textarea"
                  value={formData[field.name] || ""}
                  onChange={(event) => onChange(field.name, event.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                />
              ) : (
                <input
                  className="input"
                  type={field.type}
                  value={formData[field.name] || ""}
                  onChange={(event) => onChange(field.name, event.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                />
              )}
            </label>
          ))}
        </div>
        {error ? <div className="status-banner error">{error}</div> : null}
        <button className="action-button wide" type="submit" disabled={submitting}>
          {submitting ? "Please wait..." : submitLabel}
        </button>
      </article>
      {footer}
    </form>
  );
}
