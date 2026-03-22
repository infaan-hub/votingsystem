import { useState } from "react";

function PasswordEyeIcon({ visible }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12C4.8 7.9 8.1 5.8 12 5.8s7.2 2.1 9.5 6.2C19.2 16.1 15.9 18.2 12 18.2S4.8 16.1 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.9" />
      {!visible ? (
        <path d="M4 20L20 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

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
  const [showPasswords, setShowPasswords] = useState({});

  return (
    <div className="stack-grid">
      <form className="auth-card auth-card-premium" onSubmit={onSubmit}>
        <div className="auth-copy">
          <p className="auth-eyebrow">Secure Access</p>
          <h2>{title}</h2>
          <p className="auth-description">{subtitle}</p>
        </div>

        <div className="auth-grid">
          {fields.map((field) => (
            <label
              className={`auth-field${field.type === "textarea" || field.wide ? " auth-field-wide" : ""}`}
              key={field.name}
            >
              <span>{field.label}</span>
              {field.type === "textarea" ? (
                <textarea
                  className="input textarea"
                  name={field.name}
                  value={formData[field.name] || ""}
                  onChange={(event) => onChange(field.name, event.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                />
              ) : field.type === "password" ? (
                <div className="auth-password-input">
                  <input
                    className="input"
                    name={field.name}
                    type={showPasswords[field.name] ? "text" : "password"}
                    value={formData[field.name] || ""}
                    onChange={(event) => onChange(field.name, event.target.value)}
                    placeholder={field.placeholder}
                    required={field.required}
                  />
                  <button
                    type="button"
                    className="ghost-button auth-password-toggle"
                    aria-label={showPasswords[field.name] ? "Hide password" : "Show password"}
                    onClick={() =>
                      setShowPasswords((current) => ({
                        ...current,
                        [field.name]: !current[field.name],
                      }))
                    }
                  >
                    <PasswordEyeIcon visible={Boolean(showPasswords[field.name])} />
                  </button>
                </div>
              ) : (
                <input
                  className="input"
                  name={field.name}
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

        {error ? <div className="status-banner error auth-feedback">{error}</div> : null}
        <button className="action-button auth-submit" type="submit" disabled={submitting}>
          {submitting ? "Please wait..." : submitLabel}
        </button>
      </form>
      {footer}
    </div>
  );
}
